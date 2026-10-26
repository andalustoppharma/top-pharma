/**
 * @file dashboardController.js
 * @description
 * Controller للداشبورد — رقيق جداً، يُفرّغ المنطق للـ Service.
 */

import { getDashboardData } from '../services/dashboardService.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/dashboard
 * كل بيانات الداشبورد في استدعاء واحد.
 *
 * Query:
 *   - period: today | week | month | quarter | year | custom
 *   - from, to: عند period=custom
 *   - trendDays: عدد أيام رسم المبيعات (7-365)
 *   - lowStockLimit: عدد الأصناف تحت الحد المعروضة (1-50)
 */
export const getDashboard = async (req, res, next) => {
  try {
    const data = await getDashboardData({
      req,
      period: req.query.period,
      from: req.query.from,
      to: req.query.to,
      trendDays: req.query.trendDays,
      lowStockLimit: req.query.lowStockLimit,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error(`[dashboard] فشل: ${error.message}`);
    next(error);
  }
};

/**
 * GET /api/dashboard/summary
 * KPIs فقط (لا رسوم/جداول) — للترويسة.
 */
export const getDashboardSummary = async (req, res, next) => {
  try {
    const data = await getDashboardData({
      req,
      period: req.query.period,
      from: req.query.from,
      to: req.query.to,
      trendDays: 7,
      lowStockLimit: 1,
    });

    res.status(200).json({
      success: true,
      data: {
        period: data.period,
        kpis: data.kpis,
      },
    });
  } catch (error) {
    logger.error(`[dashboard] فشل summary: ${error.message}`);
    next(error);
  }
};

export default { getDashboard, getDashboardSummary };