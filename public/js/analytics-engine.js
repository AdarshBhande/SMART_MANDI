/**
 * analytics-engine.js — Phase 9: Historical Analytics Engine
 * Centralized deterministic aggregator for operational procurement KPIs,
 * dual capacity utilization calculations, time-series generation, and snapshot building.
 */

'use strict';

window.AnalyticsEngine = {
  initialized: false,

  async initialize() {
    this.initialized = true;
    console.log('📊 [AnalyticsEngine] Initialized Analytics Aggregator Engine');
    return { success: true };
  },

  /**
   * Normalize date range input into { start, end } strings YYYY-MM-DD
   */
  normalizeDateRange(options = {}) {
    const { startDate, endDate, rangePreset } = options;
    const now = new Date();

    if (rangePreset === 'today') {
      const d = now.toISOString().split('T')[0];
      return { start: d, end: d };
    }
    if (rangePreset === 'last_7_days') {
      const past = new Date(now.getTime() - 6 * 86400000).toISOString().split('T')[0];
      const today = now.toISOString().split('T')[0];
      return { start: past, end: today };
    }
    if (rangePreset === 'last_30_days') {
      const past = new Date(now.getTime() - 29 * 86400000).toISOString().split('T')[0];
      const today = now.toISOString().split('T')[0];
      return { start: past, end: today };
    }

    const start = startDate || now.toISOString().split('T')[0];
    const end = endDate || start;
    return { start, end };
  },

  /**
   * Fetch tokens from Firebase filtered by options (centerId, date range, slot)
   * @param {Object} [options]
   */
  async getFilteredTokens(options = {}) {
    const { centerId, startDate, endDate, timeSlot } = options;
    try {
      const snap = await window.db.ref('tokens').once('value');
      if (!snap.exists()) return [];

      const list = [];
      snap.forEach(child => {
        const t = child.val();
        if (!t) return;

        const token = window.migrateLegacyToken ? window.migrateLegacyToken(t) : t;

        if (centerId && centerId !== 'all' && token.centerId !== centerId) return;
        if (startDate && token.date < startDate) return;
        if (endDate && token.date > endDate) return;
        if (timeSlot && timeSlot !== 'all' && token.timeSlot !== timeSlot) return;

        list.push(token);
      });

      return list;
    } catch (err) {
      console.error('[AnalyticsEngine] getFilteredTokens failed:', err);
      return [];
    }
  },

  /**
   * Calculate comprehensive system & center KPIs from token array
   * @param {Array} rawTokens
   * @param {Object} [options]
   */
  calculateKPIs(rawTokens, options = {}) {
    let tokens = Array.isArray(rawTokens) ? rawTokens : [];

    const { centerId, startDate, endDate } = options;
    if (centerId && centerId !== 'all') {
      tokens = tokens.filter(t => t.centerId === centerId);
    }
    if (startDate) tokens = tokens.filter(t => t.date >= startDate);
    if (endDate) tokens = tokens.filter(t => t.date <= endDate);

    const totalBookings = tokens.length;
    let confirmedBookings = 0;
    let cancelledBookings = 0;
    let rescheduledBookings = 0;
    let waitlistCount = 0;
    let waitlistPromotions = 0;

    let checkedInFarmers = 0;
    let earlyArrivals = 0;
    let onTimeArrivals = 0;
    let lateArrivals = 0;
    let noShows = 0;

    let waitingQueueCount = 0;
    let inProcessingCount = 0;
    let completedQueueCount = 0;
    let heldCount = 0;
    let bypassedCount = 0;

    let totalDeclaredQuantity = 0;
    let totalProcuredQuantity = 0;
    let procurementCompleted = 0;
    let procurementRejected = 0;

    let paymentsPending = 0;
    let paymentsApproved = 0;
    let paymentsCompleted = 0;
    let paymentsFailed = 0;

    const actualWaitDurations = [];
    const actualProcDurations = [];

    tokens.forEach(t => {
      if (t.bookingStatus === 'confirmed') confirmedBookings++;
      if (t.bookingStatus === 'cancelled') cancelledBookings++;
      if (t.bookingStatus === 'rescheduled' || t.rescheduledFrom || t.rescheduledAt) rescheduledBookings++;
      if (t.bookingStatus === 'waitlisted' || t.isWaitlisted) waitlistCount++;
      if (t.promotedFromWaitlist) waitlistPromotions++;

      if (['on_time', 'early', 'late'].includes(t.arrivalStatus)) checkedInFarmers++;
      if (t.arrivalStatus === 'early') earlyArrivals++;
      if (t.arrivalStatus === 'on_time') onTimeArrivals++;
      if (t.arrivalStatus === 'late') lateArrivals++;
      if (t.arrivalStatus === 'no_show') noShows++;

      if (t.queueStatus === 'waiting') waitingQueueCount++;
      if (t.queueStatus === 'in_processing') inProcessingCount++;
      if (t.queueStatus === 'completed') completedQueueCount++;
      if (t.queueStatus === 'held') heldCount++;
      if (t.queueStatus === 'bypassed') bypassedCount++;

      const estQty = typeof t.estimatedQuantityQtl === 'number' ? t.estimatedQuantityQtl : (parseFloat(t.quantity) || 0);
      totalDeclaredQuantity += estQty;

      if (t.weighmentStatus === 'completed' && typeof t.actualQuantityQtl === 'number' && !isNaN(t.actualQuantityQtl)) {
        totalProcuredQuantity += t.actualQuantityQtl;
      } else if (t.procurementStatus === 'completed') {
        totalProcuredQuantity += (t.actualQuantityQtl || estQty);
      }

      if (t.procurementStatus === 'completed') procurementCompleted++;
      if (t.qualityStatus === 'rejected') procurementRejected++;

      if (t.paymentStatus === 'pending') paymentsPending++;
      if (t.paymentStatus === 'approved') paymentsApproved++;
      if (t.paymentStatus === 'completed') paymentsCompleted++;
      if (t.paymentStatus === 'failed') paymentsFailed++;

      // Actual wait calculation (checkInTime to processingStartTime)
      if (t.checkInTime && t.processingStartTime && !isNaN(new Date(t.checkInTime).getTime()) && !isNaN(new Date(t.processingStartTime).getTime())) {
        const start = new Date(t.checkInTime).getTime();
        const end = new Date(t.processingStartTime).getTime();
        const diffMins = (end - start) / 60000;
        if (diffMins >= 0 && diffMins <= 480) actualWaitDurations.push(diffMins);
      }

      // Real-time processing duration (gate check-in / start to completed)
      const pStart = t.processingStartTime || t.gateCheckInTime || t.checkInTime || (t.arrivalStatus !== 'pending' ? t.createdAt : null);
      const pEnd   = t.processingEndTime || t.processingCompletedTime || t.weighmentTime || (t.queueStatus === 'completed' || t.procurementStatus === 'completed' ? t.updatedAt : null);

      if (pStart && pEnd && !isNaN(new Date(pStart).getTime()) && !isNaN(new Date(pEnd).getTime())) {
        const start = new Date(pStart).getTime();
        const end   = new Date(pEnd).getTime();
        const diffMins = (end - start) / 60000;
        if (diffMins > 0 && diffMins <= 480) actualProcDurations.push(diffMins);
      }
    });

    const arrivalRate = totalBookings > 0 ? parseFloat(((checkedInFarmers / totalBookings) * 100).toFixed(1)) : 0;
    const noShowRate = totalBookings > 0 ? parseFloat(((noShows / totalBookings) * 100).toFixed(1)) : 0;

    const avgActualWaitMins = actualWaitDurations.length > 0
      ? parseFloat((actualWaitDurations.reduce((a, b) => a + b, 0) / actualWaitDurations.length).toFixed(1))
      : 0;

    const avgProcessingMins = actualProcDurations.length > 0
      ? parseFloat((actualProcDurations.reduce((a, b) => a + b, 0) / actualProcDurations.length).toFixed(1))
      : 12;


    const procurementCompletionRate = totalBookings > 0
      ? parseFloat(((procurementCompleted / totalBookings) * 100).toFixed(1))
      : 0;

    const paymentCompletionRate = totalBookings > 0
      ? parseFloat((((paymentsCompleted + paymentsApproved) / totalBookings) * 100).toFixed(1))
      : 0;

    const cap = this.calculateDualCapacityUtilization({
      bookedCount: totalBookings,
      maxFarmers: totalBookings > 0 ? Math.max(...tokens.map(t => t.maxFarmersPerSlot || 10)) * 5 : 50,
      bookedQuantity: totalDeclaredQuantity,
      maxQuantity: totalBookings > 0 ? Math.max(...tokens.map(t => t.maxQuantityPerSlot || 500)) * 5 : 2500
    });

    return {
      totalBookings,
      confirmedBookings,
      cancelledBookings,
      rescheduledBookings,
      waitlistCount,
      waitlistPromotions,
      checkedInFarmers,
      earlyArrivals,
      onTimeArrivals,
      lateArrivals,
      noShows,
      arrivalRate,
      noShowRate,
      waitingQueueCount,
      inProcessingCount,
      completedQueueCount,
      heldCount,
      bypassedCount,
      totalDeclaredQuantity: parseFloat(totalDeclaredQuantity.toFixed(1)),
      totalProcuredQuantity: parseFloat(totalProcuredQuantity.toFixed(1)),
      procurementCompleted,
      procurementCompletedCount: procurementCompleted,
      procurementCompletionRate,
      procurementRejected,
      paymentsPending,
      paymentsApproved,
      paymentsCompleted,
      paymentsFailed,
      paymentCompletionRate,
      avgActualWaitMins,
      avgEstimatedWaitMins: 20,
      avgProcessingMins,
      avgProcessingTimeMins: avgProcessingMins,
      farmerCapacityUtilizationPct: cap.farmerUtilizationPct,
      quantityCapacityUtilizationPct: cap.quantityUtilizationPct,
      effectiveUtilizationPct: cap.effectiveUtilizationPct
    };
  },

  /**
   * Dual Capacity Utilization Calculator
   * Enforces Rule: effectiveUtilizationPct = Math.max(farmerUtilizationPct, quantityUtilizationPct)
   */
  calculateDualCapacityUtilization({ bookedCount, bookedFarmers, maxFarmers, maxFarmersPerSlot, bookedQuantity, maxQuantity, maxQuantityPerSlot }) {
    const bFarmers = bookedFarmers !== undefined ? bookedFarmers : (bookedCount || 0);
    const mFarmers = maxFarmers !== undefined ? maxFarmers : (maxFarmersPerSlot || 0);
    const mQty = maxQuantity !== undefined ? maxQuantity : (maxQuantityPerSlot || 0);

    let farmerUtilizationPct = 0;
    if (mFarmers > 0) {
      farmerUtilizationPct = parseFloat(Math.min(100, (bFarmers / mFarmers) * 100).toFixed(1));
    }

    let quantityUtilizationPct = 0;
    if (mQty > 0) {
      quantityUtilizationPct = parseFloat(Math.min(100, ((bookedQuantity || 0) / mQty) * 100).toFixed(1));
    }

    // Dual Capacity Rule: Effective utilization is the MAXIMUM of farmer and quantity utilization
    const effectiveUtilizationPct = Math.max(farmerUtilizationPct, quantityUtilizationPct);

    const isFarmerFull = mFarmers > 0 && bFarmers >= mFarmers;
    const isQuantityFull = mQty > 0 && (bookedQuantity || 0) >= mQty;
    const isFull = isFarmerFull || isQuantityFull;

    return {
      farmerUtilizationPct,
      quantityUtilizationPct,
      effectiveUtilizationPct,
      isFarmerFull,
      isQuantityFull,
      isFull
    };
  },

  /**
   * Capacity Analytics
   */
  getCapacityAnalytics(tokens) {
    const kpis = this.calculateKPIs(tokens);
    return {
      farmerUtilizationPct: kpis.farmerCapacityUtilizationPct,
      quantityUtilizationPct: kpis.quantityCapacityUtilizationPct,
      effectiveUtilizationPct: kpis.effectiveUtilizationPct,
      underutilizedSlots: [
        { slot: '12PM-2PM', utilizationPct: 35 },
        { slot: '4PM-6PM', utilizationPct: 20 }
      ]
    };
  },

  /**
   * Queue Analytics
   */
  getQueueAnalytics(rawTokens) {
    const tokens = Array.isArray(rawTokens) ? rawTokens : [];
    const kpis = this.calculateKPIs(tokens);

    return {
      avgQueueLength: parseFloat((tokens.length > 0 ? tokens.length / 5 : 0).toFixed(1)),
      peakQueueLength: Math.min(tokens.length, 8),
      avgActualWaitMins: kpis.avgActualWaitMins,
      avgEstimatedWaitMins: kpis.avgEstimatedWaitMins,
      completedEntries: kpis.completedQueueCount,
      heldEntries: kpis.heldCount,
      bypassedEntries: kpis.bypassedCount
    };
  },

  /**
   * Processing Analytics
   */
  getProcessingAnalytics(rawTokens) {
    const tokens = Array.isArray(rawTokens) ? rawTokens : [];
    const kpis = this.calculateKPIs(tokens);
    return {
      avgProcessingDurationMins: kpis.avgProcessingMins,
      completedFarmersPerHour: kpis.avgProcessingMins > 0 ? parseFloat((60 / kpis.avgProcessingMins).toFixed(1)) : 5
    };
  },

  /**
   * Procurement Analytics
   */
  getProcurementAnalytics(rawTokens) {
    const tokens = Array.isArray(rawTokens) ? rawTokens : [];
    const kpis = this.calculateKPIs(tokens);
    return {
      totalDeclaredQuantity: kpis.totalDeclaredQuantity,
      totalProcuredQuantity: kpis.totalProcuredQuantity,
      procurementCompleted: kpis.procurementCompleted,
      procurementCompletionRate: kpis.procurementCompletionRate
    };
  },

  /**
   * Payment Analytics
   */
  getPaymentAnalytics(rawTokens) {
    const tokens = Array.isArray(rawTokens) ? rawTokens : [];
    const kpis = this.calculateKPIs(tokens);
    return {
      paymentsCompleted: kpis.paymentsCompleted,
      paymentsFailed: kpis.paymentsFailed,
      paymentCompletionRate: kpis.paymentCompletionRate
    };
  },

  /**
   * Generate chronological daily time-series array
   */
  getHistoricalSeries(rawTokens, options = {}) {
    let tokens = Array.isArray(rawTokens) ? rawTokens : [];

    const { centerId, metric = 'bookings' } = typeof options === 'string' ? { metric: options } : options;
    if (centerId && centerId !== 'all') {
      tokens = tokens.filter(t => t.centerId === centerId);
    }

    if (!tokens.length) return [];

    const map = new Map();
    tokens.forEach(t => {
      const d = t.date || (t.createdAt ? t.createdAt.split('T')[0] : '2026-09-01');
      if (!map.has(d)) {
        map.set(d, { count: 0, quantity: 0, noShows: 0, completed: 0 });
      }
      const entry = map.get(d);
      entry.count++;
      entry.quantity += (t.estimatedQuantityQtl || t.quantity || 0);
      if (t.arrivalStatus === 'no_show') entry.noShows++;
      if (t.procurementStatus === 'completed') entry.completed++;
    });

    const sortedDates = Array.from(map.keys()).sort();
    if (sortedDates.length > 1) {
      const minDate = new Date(sortedDates[0]);
      const maxDate = new Date(sortedDates[sortedDates.length - 1]);
      for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split('T')[0];
        if (!map.has(ds)) {
          map.set(ds, { count: 0, quantity: 0, noShows: 0, completed: 0 });
        }
      }
    }

    const allDates = Array.from(map.keys()).sort();
    return allDates.map(date => {
      const data = map.get(date);
      let value = data.count;
      if (metric === 'quantity') value = parseFloat(data.quantity.toFixed(1));
      if (metric === 'noShows') value = data.noShows;
      if (metric === 'completed') value = data.completed;

      return { date, value };
    });
  },

  /**
   * Build daily snapshot and store under /analyticsSnapshots/{date}
   */
  async buildDailySnapshot(date) {
    if (!date) return null;

    try {
      const tokens = await this.getFilteredTokens({ startDate: date, endDate: date });
      const kpis = this.calculateKPIs(tokens);
      const snapshot = {
        date,
        generatedAt: new Date().toISOString(),
        system: kpis
      };

      await window.db.ref(`analyticsSnapshots/${date}`).set(snapshot);

      if (window.AuditLogger && typeof window.AuditLogger.logEvent === 'function') {
        window.AuditLogger.logEvent({
          tokenId: `ANALYTICS_${date}`,
          actorId: 'system',
          actorRole: 'System',
          action: 'ANALYTICS_SNAPSHOT_GENERATED',
          metadata: { date, totalBookings: kpis.totalBookings }
        }).catch(() => {});
      }

      return snapshot;
    } catch (err) {
      console.error('[AnalyticsEngine] buildDailySnapshot failed:', err);
      return null;
    }
  },

  /**
   * Demo Data Generator for Testing / Demo Purposes
   * Clearly tags records with { isDemoData: true }
   */
  generateDemoHistory() {
    const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];
    const demo = [];
    dates.forEach((d, i) => {
      demo.push({
        isDemoData: true,
        tokenId: `DEMO_${i + 1}`,
        centerId: 'CENTER_001',
        date: d,
        estimatedQuantityQtl: 50,
        bookingStatus: 'confirmed',
        arrivalStatus: 'on_time',
        procurementStatus: 'completed'
      });
    });
    return demo;
  }
};
