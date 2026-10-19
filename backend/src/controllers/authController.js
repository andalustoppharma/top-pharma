/**
 * @file authController.js
 * @description
 * منطق المصادقة: تسجيل الدخول/الخروج، تجديد التوكن، تغيير كلمة المرور،
 * واسترداد كلمة المرور عبر البريد.
 *
 * لماذا هذا الملف؟
 * - نُركّز كل منطق Auth في مكان واحد لتفادي التسريب إلى routes.
 * - نستخدم AppError للأخطاء المتوقعة (401/403/404/409).
 * - نستخدم asyncHandler لتغليف الدوال غير المتزامنة.
 * - نُسجّل الأحداث الحساسة في AuditLog عبر logAuditEvent.
 * - لا نُعيد كلمة المرور أو التوكنات في أي رسالة خطأ.
 * - نستخدم crypto لتوليد توكنات عشوائية آمنة عند الحاجة.
 * - مقاومة enumeration: رسائل موحّدة لـ login و forgotPassword.
 */

import crypto from 'crypto';

import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { AUDIT_ACTIONS } from '../models/AuditLog.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../middlewares/errorMiddleware.js';
import { logAuditEvent } from '../middlewares/auditLogMiddleware.js';
import { sendPasswordResetEmail } from '../utils/email.js';
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

/**
 * مدة صلاحية توكن إعادة تعيين كلمة المرور (بالدقائق).
 * 30 دقيقة — كافية للمستخدم، وقصيرة للأمان.
 */
const RESET_TOKEN_TTL_MINUTES = 30;

/**
 * سرّ خاص لتوقيع توكن إعادة التعيين.
 * نستخدم JWT_REFRESH_SECRET كمصدر (لا نضيف متغيراً جديداً لتفادي التعقيد).
 */
const RESET_TOKEN_SECRET = env.JWT_REFRESH_SECRET;

/**
 * بناء استجابة موحّدة للمستخدم (بلا حقول حساسة).
 * @param {import('mongoose').Document} user
 * @returns {Object}
 */
const buildUserPayload = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  role: user.role,
  isActive: user.isActive,
  linkedEntity: user.linkedEntity || { type: null, id: null },
  mustChangePassword: user.mustChangePassword || false,
  lastLoginAt: user.lastLoginAt || null,
});

/**
 * POST /api/auth/login
 * تسجيل دخول بالبريد وكلمة المرور.
 *
 * @type {import('express').RequestHandler}
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // نُجلب المستخدم مع كلمة المرور (select: false افتراضياً).
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    // لا نكشف إن كان البريد موجوداً أو لا (مقاومة enumeration).
    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      resource: 'User',
      description: `محاولة دخول ببريد غير مسجّل: ${email}`,
      success: false,
    });
    throw new AppError(
      'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      401,
      'INVALID_CREDENTIALS'
    );
  }

  // فحص حالة القفل المؤقت.
  if (user.isLocked()) {
    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.ACCOUNT_LOCKED,
      resource: 'User',
      resourceId: user._id,
      description: `محاولة دخول لحساب مقفل: ${email}`,
      success: false,
    });
    throw new AppError(
      'الحساب مقفل مؤقتاً بسبب محاولات فاشلة. حاول لاحقاً.',
      423,
      'ACCOUNT_LOCKED'
    );
  }

  // فحص كلمة المرور.
  const isMatch = await verifyPassword(password, user.password);

  if (!isMatch) {
    user.registerFailedLogin();
    await user.save();

    await logAuditEvent({
      req,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      resource: 'User',
      resourceId: user._id,
      description: `كلمة مرور خاطئة: ${email}`,
      success: false,
    });

    // إذا قُفل الحساب للتو، نُسجّل الحدث.
    if (user.isLocked()) {
      await logAuditEvent({
        req,
        action: AUDIT_ACTIONS.ACCOUNT_LOCKED,
        resource: 'User',
        resourceId: user._id,
        description: `قفل الحساب بعد محاولات فاشلة: ${email}`,
        success: false,
      });
    }

    throw new AppError(
      'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      401,
      'INVALID_CREDENTIALS'
    );
  }

  // فحص حالة الحساب.
  if (!user.isActive) {
    throw new AppError('الحساب معطّل. تواصل مع الإدارة.', 403, 'ACCOUNT_DISABLED');
  }

  // نجاح: إعادة ضبط العدّاد + تحديث lastLogin.
  user.resetLoginAttempts();
  user.lastLoginAt = new Date();
  user.lastLoginIp = req.ip || '';
  await user.save();

  // توليد التوكنات.
  const { accessToken, refreshToken } = generateTokenPair({
    userId: user._id,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  // ✅ الإصلاح: نُرفق المستخدم بالطلب الأصلي بدل تفكيك req بـ spread.
  // تفكيك req (...req) يفقد خصائص مثل headers و socket، ويُسبب خطأ في getClientIp.
  req.user = user;

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    resource: 'User',
    resourceId: user._id,
    description: `تسجيل دخول ناجح: ${user.email}`,
    success: true,
  });

  return res.status(200).json({
    success: true,
    data: {
      user: buildUserPayload(user),
      accessToken,
      refreshToken,
    },
  });
});

/**
 * POST /api/auth/logout
 * تسجيل خروج (لا يفعل شيئاً على السيرفر — الـ client يحذف التوكنات).
 * نُسجّل الحدث في AuditLog فقط.
 *
 * @type {import('express').RequestHandler}
 */
export const logout = asyncHandler(async (req, res) => {
  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.LOGOUT,
    resource: 'User',
    resourceId: req.user._id,
    description: `تسجيل خروج: ${req.user.email}`,
    success: true,
  });

  return res.status(200).json({
    success: true,
    data: { message: 'تم تسجيل الخروج بنجاح.' },
  });
});

/**
 * POST /api/auth/refresh
 * تجديد Access Token باستخدام Refresh Token.
 * لا يحتاج Access Token صالح (لأنه قد يكون منتهياً).
 *
 * @type {import('express').RequestHandler}
 */
export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  const result = verifyRefreshToken(refreshToken);

  if (!result.valid) {
    throw new AppError(result.message, 401, 'INVALID_REFRESH_TOKEN');
  }

  const { sub: userId, tokenVersion } = result.payload;

  const user = await User.findById(userId).select(
    'name email role isActive tokenVersion'
  );

  if (!user) {
    throw new AppError('الحساب غير موجود.', 401, 'USER_NOT_FOUND');
  }

  if (!user.isActive) {
    throw new AppError('الحساب معطّل.', 403, 'ACCOUNT_DISABLED');
  }

  if (user.tokenVersion !== tokenVersion) {
    throw new AppError(
      'انتهت صلاحية الجلسة. سجّل الدخول مجدداً.',
      401,
      'SESSION_INVALIDATED'
    );
  }

  const { accessToken, refreshToken: newRefreshToken } = generateTokenPair({
    userId: user._id,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.REFRESH_TOKEN,
    resource: 'User',
    resourceId: user._id,
    description: `تجديد الجلسة: ${user.email}`,
    success: true,
  });

  return res.status(200).json({
    success: true,
    data: {
      accessToken,
      refreshToken: newRefreshToken,
    },
  });
});

/**
 * GET /api/auth/me
 * إرجاع بيانات المستخدم الحالي.
 *
 * @type {import('express').RequestHandler}
 */
export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    'name email phone role isActive linkedEntity mustChangePassword lastLoginAt createdAt'
  );

  if (!user) {
    throw new AppError('الحساب غير موجود.', 404, 'USER_NOT_FOUND');
  }

  return res.status(200).json({
    success: true,
    data: buildUserPayload(user),
  });
});

/**
 * PATCH /api/auth/change-password
 * تغيير كلمة المرور (مع إبطال كل الجلسات الحالية).
 *
 * @type {import('express').RequestHandler}
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');

  if (!user) {
    throw new AppError('الحساب غير موجود.', 404, 'USER_NOT_FOUND');
  }

  const isMatch = await verifyPassword(currentPassword, user.password);
  if (!isMatch) {
    throw new AppError('كلمة المرور الحالية غير صحيحة.', 400, 'WRONG_CURRENT_PASSWORD');
  }

  user.password = await hashPassword(newPassword);
  user.mustChangePassword = false;
  user.invalidateSessions();
  await user.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.PASSWORD_CHANGE,
    resource: 'User',
    resourceId: user._id,
    description: `تغيير كلمة مرور: ${user.email}`,
    success: true,
  });

  return res.status(200).json({
    success: true,
    data: {
      message: 'تم تغيير كلمة المرور. يرجى تسجيل الدخول مجدداً.',
    },
  });
});

/**
 * POST /api/auth/forgot-password
 * إرسال رابط استرداد كلمة المرور (يُرسل دائماً 200 حتى لو البريد غير موجود).
 *
 * @type {import('express').RequestHandler}
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email, isActive: true });

  // رد موحّد دائماً (مقاومة enumeration).
  const genericResponse = {
    success: true,
    data: {
      message: 'إذا كان البريد مسجّلاً، ستصلك رسالة لإعادة تعيين كلمة المرور.',
    },
  };

  if (!user) {
    return res.status(200).json(genericResponse);
  }

  // توليد توكن JWT قصير العمر لإعادة التعيين.
  const resetToken = jwt.sign(
    { sub: String(user._id), purpose: 'password-reset' },
    RESET_TOKEN_SECRET,
    { expiresIn: `${RESET_TOKEN_TTL_MINUTES}m`, issuer: 'pharma-system' }
  );

  const resetUrl = `${env.FRONTEND_URL}/reset-password/${resetToken}`;

  const emailResult = await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl,
    expiresMinutes: RESET_TOKEN_TTL_MINUTES,
  });

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.PASSWORD_RESET_REQUEST,
    resource: 'User',
    resourceId: user._id,
    description: `طلب استرداد كلمة مرور: ${user.email}`,
    success: emailResult.sent,
  });

  return res.status(200).json(genericResponse);
});

/**
 * POST /api/auth/reset-password
 * إعادة تعيين كلمة المرور باستخدام التوكن.
 *
 * @type {import('express').RequestHandler}
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  let payload;
  try {
    payload = jwt.verify(token, RESET_TOKEN_SECRET, {
      issuer: 'pharma-system',
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError(
        'انتهت صلاحية رابط إعادة التعيين.',
        400,
        'RESET_TOKEN_EXPIRED'
      );
    }
    throw new AppError('رابط إعادة التعيين غير صالح.', 400, 'RESET_TOKEN_INVALID');
  }

  if (payload.purpose !== 'password-reset') {
    throw new AppError('رابط إعادة التعيين غير صالح.', 400, 'RESET_TOKEN_INVALID');
  }

  const user = await User.findById(payload.sub).select('+password');

  if (!user) {
    throw new AppError('الحساب غير موجود.', 404, 'USER_NOT_FOUND');
  }

  if (!user.isActive) {
    throw new AppError('الحساب معطّل.', 403, 'ACCOUNT_DISABLED');
  }

  user.password = await hashPassword(newPassword);
  user.mustChangePassword = false;
  user.resetLoginAttempts();
  user.invalidateSessions();
  await user.save();

  await logAuditEvent({
    req,
    action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETE,
    resource: 'User',
    resourceId: user._id,
    description: `إعادة تعيين كلمة مرور: ${user.email}`,
    success: true,
  });

  return res.status(200).json({
    success: true,
    data: { message: 'تم إعادة تعيين كلمة المرور. يمكنك تسجيل الدخول الآن.' },
  });
});

/**
 * توليد توكن إعادة تعيين آمن (يُستخدم من داخل النظام عند الحاجة).
 * ملاحظة: حالياً نستخدم jwt.sign مباشرة في forgotPassword، لكن نُبقي
 * الدالة للاستخدام الداخلي (مثل Seed أو scripts لاحقة).
 *
 * @param {string} userId
 * @returns {string}
 */
export const generateResetToken = (userId) =>
  jwt.sign(
    { sub: String(userId), purpose: 'password-reset' },
    RESET_TOKEN_SECRET,
    { expiresIn: `${RESET_TOKEN_TTL_MINUTES}m`, issuer: 'pharma-system' }
  );

/**
 * توليد نص عشوائي آمن (للتوكنات المستقبلية).
 * @param {number} [bytes=32]
 * @returns {string}
 */
export const generateSecureToken = (bytes = 32) =>
  crypto.randomBytes(bytes).toString('hex');

export default {
  login,
  logout,
  refresh,
  me,
  changePassword,
  forgotPassword,
  resetPassword,
  generateResetToken,
  generateSecureToken,
};