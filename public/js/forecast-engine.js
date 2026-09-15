/**
 * forecast-engine.js — Phase 9: Forecast Engine
 * Deterministic forecasting module for procurement farmer demand, paddy quantity,
 * dual-capacity utilization, congestion risk classification, wait-time forecasting,
 * zero-weighbridge safety, confidence metadata, and capacity planning recommendations.
 */

'use strict';

window.ForecastEngine = {
  initialized: false,

  async initialize() {
    this.initialized = true;
    console.log('🔮 [ForecastEngine] Initialized Forecast Engine');
    return { success: true };
  },

  /**
   * Return methodology metadata for UI/audit display
   */
  getForecastMethodMetadata() {
    return {
      method: 'weighted_recent_average',
      description: 'Deterministic weighted recent-history moving average (recent dates receive higher linear weight)',
      minObservationsRequired: 3
    };
  },

  /**
   * Evaluate confidence level based on observation sample size and history consistency
   * Criteria:
   *   0–2 observations: INSUFFICIENT
   *   3–6 observations: LOW
   *   7–13 observations: MEDIUM
   *   14+ observations: HIGH
   */
  calculateConfidence(sampleSize, consistencyScore = 1.0) {
    if (sampleSize < 3) return 'INSUFFICIENT';
    if (sampleSize <= 6) return 'LOW';
    if (sampleSize <= 13) return consistencyScore > 0.8 ? 'MEDIUM' : 'LOW';
    return consistencyScore > 0.7 ? 'HIGH' : 'MEDIUM';
  },

  /**
   * Detect if history is insufficient (< 3 observations)
   */
  detectInsufficientHistory(tokens) {
    const list = Array.isArray(tokens) ? tokens : [];
    const uniqueDates = new Set(list.map(t => t.date));
    return uniqueDates.size < 3;
  },

  /**
   * Forecast Congestion Level
   * Formulas/Classifications:
   *   0% - 50%   : LOW
   *   >50% - 75% : MODERATE
   *   >75% - 90% : HIGH
   *   >90%       : CRITICAL
   */
  forecastCongestion(expectedUtilizationPct) {
    const util = Math.max(0, Math.min(100, expectedUtilizationPct || 0));
    if (util <= 50) return 'LOW';
    if (util <= 75) return 'MODERATE';
    if (util <= 90) return 'HIGH';
    return 'CRITICAL';
  },

  /**
   * Calculate linearly weighted moving average where recent items have higher weights
   */
  calculateWeightedAverage(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    if (values.length === 1) return values[0];

    let totalWeight = 0;
    let weightedSum = 0;
    values.forEach((v, idx) => {
      const weight = idx + 1;
      weightedSum += (v * weight);
      totalWeight += weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  },

  /**
   * Forecast Wait Time for future center planning
   * ZERO WEIGHBRIDGE SAFETY: If activeWeighbridges <= 0, returns available: false
   */
  forecastWaitTime(centerId, params = {}) {
    let opts = params;
    if (typeof centerId === 'object') opts = centerId;
    const { expectedArrivals, avgProcMins, activeWeighbridges } = opts;

    if (activeWeighbridges !== undefined && activeWeighbridges <= 0) {
      return {
        available: false,
        reason: 'NO_ACTIVE_STATIONS',
        expectedWaitMins: 0
      };
    }

    const arr = Math.max(0, expectedArrivals || 5);
    const procMins = Math.max(1, avgProcMins || 12);
    const stations = Math.max(1, activeWeighbridges || 2);

    const expectedWaitMins = Math.round((arr * procMins) / stations);
    return {
      available: true,
      expectedWaitMins,
      activeWeighbridges: stations
    };
  },

  /**
   * Generate advisory capacity planning recommendations
   */
  getCapacityPlanningRecommendation(params = {}) {
    const { expectedUtilizationPct, expectedWaitMins, congestionLevel, activeWeighbridges } = typeof params === 'string' ? { centerId: params } : params;

    const cLevel = congestionLevel || this.forecastCongestion(expectedUtilizationPct || 0);

    if (cLevel === 'LOW') {
      return 'Demand is well within operational limits. No capacity adjustments needed.';
    } else if (cLevel === 'MODERATE') {
      return 'Demand is approaching normal capacity. Monitor check-in rates during peak slot windows.';
    } else if (cLevel === 'HIGH') {
      return 'High capacity utilization anticipated. Consider activating additional weighbridge stations or opening adjacent time slots.';
    } else if (cLevel === 'CRITICAL') {
      return 'CRITICAL BOTTLE-NECK RISK: Demand exceeds standard capacity. Strongly recommend redistributing appointments or increasing active weighbridges.';
    }
    return 'Maintain standard operational monitoring.';
  },

  /**
   * Synchronous & Asynchronous Forecast Generator for Center Demand
   * Accepts both (centerId, options) or (options)
   */
  forecastCenterDemand(centerId, options = {}) {
    let targetCenter = centerId;
    let opts = options;

    if (typeof centerId === 'object') {
      opts = centerId;
      targetCenter = opts.centerId || 'all';
    }

    const tokens = opts.tokens || [];
    const filteredTokens = (targetCenter && targetCenter !== 'all')
      ? tokens.filter(t => t.centerId === targetCenter)
      : tokens;

    const series = window.AnalyticsEngine ? window.AnalyticsEngine.getHistoricalSeries(filteredTokens, { metric: 'bookings' }) : [];
    const qtySeries = window.AnalyticsEngine ? window.AnalyticsEngine.getHistoricalSeries(filteredTokens, { metric: 'quantity' }) : [];
    const sampleSize = series.length;

    if (sampleSize < 3) {
      return {
        success: true,
        hasSufficientHistory: false,
        centerId: targetCenter || 'all',
        sampleSize,
        confidence: 'INSUFFICIENT',
        reason: 'Insufficient historical data (< 3 observations)',
        predictedFarmers: 0,
        predictedQuantity: 0,
        expectedUtilization: 0,
        expectedUtilizationPct: 0,
        congestionLevel: 'LOW',
        expectedWaitMins: 0,
        method: 'insufficient_history_fallback',
        recommendation: 'Insufficient historical data for forecasting.'
      };
    }

    const farmerValues = series.map(s => s.value);
    const qtyValues = qtySeries.map(s => s.value);

    const predictedFarmers = Math.round(this.calculateWeightedAverage(farmerValues));
    const predictedQuantity = parseFloat(this.calculateWeightedAverage(qtyValues).toFixed(1));

    const maxFarmersCap = Math.max(...filteredTokens.map(t => t.maxFarmersPerSlot || 10)) * 6 || 60;
    const maxQtyCap = Math.max(...filteredTokens.map(t => t.maxQuantityPerSlot || 500)) * 6 || 3000;

    const dualCap = window.AnalyticsEngine.calculateDualCapacityUtilization({
      bookedFarmers: predictedFarmers,
      maxFarmers: maxFarmersCap,
      bookedQuantity: predictedQuantity,
      maxQuantity: maxQtyCap
    });

    const expectedUtilizationPct = dualCap.effectiveUtilizationPct;
    const congestionLevel = this.forecastCongestion(expectedUtilizationPct);
    const confidence = this.calculateConfidence(sampleSize);
    const expectedWaitMins = Math.round((predictedFarmers * 12) / (2 * 6));

    const recommendation = this.getCapacityPlanningRecommendation({
      expectedUtilizationPct,
      expectedWaitMins,
      congestionLevel
    });

    return {
      success: true,
      hasSufficientHistory: true,
      centerId: targetCenter || 'all',
      forecastDate: opts.forecastDate || 'Tomorrow',
      predictedFarmers,
      predictedQuantity,
      expectedUtilization: expectedUtilizationPct,
      expectedUtilizationPct,
      congestionLevel,
      confidence,
      sampleSize,
      method: 'weighted_recent_average',
      expectedWaitMins,
      recommendation
    };
  },

  /**
   * Forecast Demand overload method
   */
  forecastDemand(options = {}) {
    return this.forecastCenterDemand(options.centerId || 'all', options);
  },

  forecastSlotDemand(centerId, options = {}) {
    return this.forecastCenterDemand(centerId, options);
  },

  forecastQuantity(centerId, options = {}) {
    const res = this.forecastCenterDemand(centerId, options);
    return { quantityDemand: res.predictedQuantity, confidence: res.confidence };
  },

  /**
   * Single forecast accuracy evaluator
   */
  evaluateForecastAccuracy(actual, predicted) {
    if (typeof actual !== 'number' || typeof predicted !== 'number' || isNaN(actual) || isNaN(predicted)) {
      return { available: false, reason: 'INVALID_METRICS' };
    }

    const absoluteError = Math.abs(actual - predicted);
    const percentageError = actual > 0 ? parseFloat(((absoluteError / actual) * 100).toFixed(1)) : 0;
    const accuracyPct = Math.max(0, parseFloat((100 - percentageError).toFixed(1)));

    return {
      available: true,
      actual,
      predicted,
      absoluteError,
      percentageError,
      accuracyPct
    };
  },

  /**
   * Batch forecast accuracy evaluator
   */
  evaluateForecastAccuracyBatch(pairs) {
    if (!Array.isArray(pairs) || pairs.length === 0) {
      return {
        available: false,
        reason: 'NO_PAIR_DATA',
        accuracyReport: 'Accuracy not yet available'
      };
    }

    let totalAbsError = 0;
    let validCount = 0;

    pairs.forEach(p => {
      if (typeof p.actual === 'number' && typeof p.predicted === 'number') {
        totalAbsError += Math.abs(p.actual - p.predicted);
        validCount++;
      }
    });

    if (validCount === 0) {
      return {
        available: false,
        reason: 'NO_PAIR_DATA',
        accuracyReport: 'Accuracy not yet available'
      };
    }

    const meanAbsoluteError = parseFloat((totalAbsError / validCount).toFixed(2));
    return {
      available: true,
      sampleSize: validCount,
      meanAbsoluteError,
      accuracyReport: `MAE: ${meanAbsoluteError}`
    };
  }
};
