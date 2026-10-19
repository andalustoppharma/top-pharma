/**
 * @file usersAPI.js
 * @description دوال API الخاصة بالمستخدمين.
 *
 * لماذا هذا الملف؟
 * - تحتاجه dropdown assignedSalesRep في CustomerForm.
 * - يفصل منطق الاتصال عن المكونات.
 * - لا يحتاج Context (يُطلب عند الحاجة).
 */

import axiosInstance from './axiosInstance.js';

/**
 * جلب قائمة المستخدمين مع فلترة.
 * @async
 * @param {Object} [params={}]
 * @returns {Promise<{ items: Array, pagination: Object }>}
 */
export async function listUsers(params = {}) {
  const { data } = await axiosInstance.get('/users', { params });
  return data.data;
}

/**
 * جلب المندوبين النشطين فقط (اختصار).
 * @async
 * @returns {Promise<Array>}
 */
export async function listSalesReps() {
  const { items } = await listUsers({
    role: 'sales_rep',
    isActive: true,
    limit: 100,
    sortBy: 'name',
    sortOrder: 'asc',
  });
  return items;
}

/**
 * جلب مستخدم واحد.
 * @async
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getUser(id) {
  const { data } = await axiosInstance.get(`/users/${id}`);
  return data.data;
}

export default {
  listUsers,
  listSalesReps,
  getUser,
};