/**
 * @file server.js
 * @description
 * نقطة الدخول الرئيسية للـ Backend — Phase 2.5 (كل المسارات).
 *
 * ⚠️ يشمل:
 * - Phase 0: Auth + Users
 * - Phase 1: Categories, Warehouses, Items, Suppliers, Customers, Stocks
 * - Phase 2: Invoices, DeliveryNotes, CustomerReturns, SupplierReturns, PurchaseReceipts
 * - Phase 2.5: Draft (مدمج في Invoice)
 */

import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { connectDatabase, disconnectDatabase, isDatabaseReady } from './config/database.js';
import { env, isProduction } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/errorMiddleware.js';
import { globalLimiter, readLimiter } from './middlewares/rateLimitMiddleware.js';

// ── Phase 0 Routes ──
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';

// ── Phase 1 Routes ──
import categoryRoutes from './routes/categoryRoutes.js';
import warehouseRoutes from './routes/warehouseRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import stockRoutes from './routes/stockRoutes.js';

// ── Phase 2 Routes ──
import invoiceRoutes from './routes/invoiceRoutes.js';
import deliveryNoteRoutes from './routes/deliveryNoteRoutes.js';
import customerReturnRoutes from './routes/customerReturnRoutes.js';
import supplierReturnRoutes from './routes/supplierReturnRoutes.js';
import purchaseReceiptRoutes from './routes/purchaseReceiptRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

import { startAllJobs, stopAllJobs } from './jobs/index.js';
import { verifyEmailConnection } from './utils/email.js';
import { logger } from './utils/logger.js';

/**
 * إنشاء تطبيق Express.
 * @returns {import('express').Express}
 */
const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGIN.includes(origin)) return callback(null, true);
        logger.warn(`CORS blocked: ${origin}`);
        return callback(new Error('CORS غير مسموح.'), false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Total-Count'],
      maxAge: 600,
    })
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  if (!isProduction()) {
    app.use(
      morgan('dev', {
        stream: { write: (message) => logger.info(message.trim()) },
      })
    );
  }

app.use(env.API_PREFIX, (req, res, next) => {
  if (req.method === 'GET') {
    return readLimiter(req, res, next);
  }
  return globalLimiter(req, res, next);
});
  // ── نقطة الفحص الصحي ──
  app.get(`${env.API_PREFIX}/health`, (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        env: env.NODE_ENV,
        database: isDatabaseReady() ? 'connected' : 'disconnected',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  });

  // ── Phase 0 ──
  app.use(`${env.API_PREFIX}/auth`, authRoutes);
  app.use(`${env.API_PREFIX}/users`, userRoutes);

  // ── Phase 1 ──
  app.use(`${env.API_PREFIX}/categories`, categoryRoutes);
  app.use(`${env.API_PREFIX}/warehouses`, warehouseRoutes);
  app.use(`${env.API_PREFIX}/items`, itemRoutes);
  app.use(`${env.API_PREFIX}/suppliers`, supplierRoutes);
  app.use(`${env.API_PREFIX}/customers`, customerRoutes);
  app.use(`${env.API_PREFIX}/stocks`, stockRoutes);

  // ── Phase 2 ──
  app.use(`${env.API_PREFIX}/invoices`, invoiceRoutes);
  app.use(`${env.API_PREFIX}/delivery-notes`, deliveryNoteRoutes);
  app.use(`${env.API_PREFIX}/customer-returns`, customerReturnRoutes);
  app.use(`${env.API_PREFIX}/supplier-returns`, supplierReturnRoutes);
  app.use(`${env.API_PREFIX}/purchase-receipts`, purchaseReceiptRoutes);

  // ── Phase 4: Dashboard & Reports ──
  app.use(`${env.API_PREFIX}/dashboard`, dashboardRoutes);
  // ── صفحة الجذر ──
  app.get('/', (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        name: 'Pharma System API',
        version: '2.5.0',
        docs: `${env.API_PREFIX}/health`,
        time: new Date().toISOString(),
      },
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

/**
 * الإغلاق الآمن.
 * @param {import('http').Server} server
 */
const setupGracefulShutdown = (server) => {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.warn(`📴 استُقبلت الإشارة ${signal}. جارٍ الإغلاق الآمن...`);

    stopAllJobs();

    server.close(async () => {
      logger.info('🛑 تم إغلاق سيرفر HTTP.');
      try {
        await disconnectDatabase();
      } catch (error) {
        logger.error(`خطأ أثناء إغلاق قاعدة البيانات: ${error.message}`);
      }
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('⏱️ انتهت مهلة الإغلاق. إنهاء قسري.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled Rejection: ${reason}`);
  });
  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    logger.error(error.stack || '');
    process.exit(1);
  });
};

/**
 * تشغيل السيرفر.
 * @async
 * @returns {Promise<void>}
 */
const startServer = async () => {
  logger.info('🚀 بدء تشغيل Pharma System Backend (Phase 2.5)...');
  logger.info(`📦 البيئة: ${env.NODE_ENV}`);

  try {
    await connectDatabase();
  } catch (error) {
    logger.error('❌ فشل الاتصال بقاعدة البيانات. إيقاف التشغيل.');
    process.exit(1);
  }

  await verifyEmailConnection();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`✅ السيرفر يعمل على http://localhost:${env.PORT}`);
    logger.info(`🔗 نقطة الفحص: http://localhost:${env.PORT}${env.API_PREFIX}/health`);
    logger.info(`🌐 CORS مسموح من: ${env.CORS_ORIGIN.join(', ')}`);

    startAllJobs();
  });

  setupGracefulShutdown(server);
  return server;
};

startServer().catch((error) => {
  logger.error(`❌ فشل تشغيل السيرفر: ${error.message}`);
  logger.error(error.stack || '');
  process.exit(1);
});

export { createApp, startServer };
export default startServer;