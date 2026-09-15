/**
 * recommendation-engine.js — Smart Mandi Recommendation Engine
 * Deterministic multi-factor ranking algorithm for centers and time slots.
 * Evaluates farmer capacity, quantity capacity, wait time, distance, and preferred slot.
 * Enforces strict operational status filters (active/busy only; filters out closed/paused/equipment_issue).
 */

'use strict';

window.RecommendationEngine = {
  /**
   * Deterministic scoring formula:
   * Final Score (0 - 100) =
   *   CapacityScore (0-30): Ratio of remaining farmer slots
   * + QuantityScore (0-30): Ratio of remaining quantity capacity
   * + WaitTimeScore (0-20): Inverse of estimated wait time
   * + PreferenceScore (0-10): Matches requested timeSlot
   * + DistanceScore (0-10): Proximity score if location provided
   */

  /**
   * Fetch ranked center and slot recommendations
   * @param {Object} params
   * @param {string} params.date - YYYY-MM-DD
   * @param {number} params.estimatedQuantityQtl - Declared paddy quantity in quintals
   * @param {string} [params.preferredTimeSlot] - e.g. "8AM-10AM"
   * @param {Object} [params.farmerLocation] - { lat, lng }
   * @returns {Promise<Array<Object>>} Ranked list of recommendations
   */
  async getRecommendations({ date, estimatedQuantityQtl, preferredTimeSlot, farmerLocation }) {
    if (!date || typeof estimatedQuantityQtl !== 'number' || estimatedQuantityQtl <= 0 || !isFinite(estimatedQuantityQtl)) {
      console.warn('[RecommendationEngine] Invalid input parameters');
      return [];
    }

    try {
      // 1. Fetch Centers from Firebase
      const centersSnap = await window.db.ref('centers').once('value');
      if (!centersSnap.exists()) return [];

      const centers = [];
      centersSnap.forEach(child => {
        const c = child.val();
        if (c) centers.push(c);
      });

      // Standard time slots available per day
      const defaultSlots = ['6AM-8AM', '8AM-10AM', '10AM-12PM', '12PM-2PM', '2PM-4PM', '4PM-6PM'];

      const recommendations = [];

      for (const center of centers) {
        // 2. Filter Operational Status
        // Ignore closed, paused, or equipment_issue centers for normal bookings
        if (center.operationalStatus === 'closed' || center.operationalStatus === 'paused' || center.operationalStatus === 'equipment_issue') {
          continue;
        }

        const maxFarmers = center.maxFarmersPerSlot || 10;
        const maxQuantity = center.maxQuantityPerSlot || 500;
        const avgProcessingTime = center.avgProcessingTimeMins || 15;
        const weighbridges = center.activeWeighbridges || 2;

        for (const slot of defaultSlots) {
          // Fetch current slot capacity from Firebase
          const slotSnap = await window.db.ref(`slotCapacities/${center.id}/${date}/${slot}`).once('value');
          const slotData = slotSnap.exists() ? slotSnap.val() : { bookedCount: 0, bookedQuantity: 0, waitingListCount: 0 };

          const currentCount = slotData.bookedCount || 0;
          const currentQty = slotData.bookedQuantity || 0;

          const remainingFarmers = Math.max(0, maxFarmers - currentCount);
          const remainingQuantity = Math.max(0, maxQuantity - currentQty);

          const isFarmerAvailable = currentCount + 1 <= maxFarmers;
          const isQtyAvailable = currentQty + estimatedQuantityQtl <= maxQuantity;
          const isBookable = isFarmerAvailable && isQtyAvailable;

          // Estimated Wait Time (Mins) = bookedCount * (avgProcessingTime / activeWeighbridges)
          const estimatedWaitMins = Math.round(currentCount * (avgProcessingTime / Math.max(1, weighbridges)));

          // Scoring calculation
          let capacityScore = (remainingFarmers / maxFarmers) * 30;
          let quantityScore = (remainingQuantity / maxQuantity) * 30;
          let waitScore = Math.max(0, 20 - (estimatedWaitMins / 2));
          let prefScore = (slot === preferredTimeSlot) ? 10 : 3;

          let distanceScore = 10; // Default max if distance unavailable
          let distanceKm = null;
          if (farmerLocation && typeof farmerLocation.lat === 'number' && typeof farmerLocation.lng === 'number' && center.lat && center.lng) {
            distanceKm = this.calculateDistance(farmerLocation.lat, farmerLocation.lng, center.lat, center.lng);
            distanceScore = Math.max(0, 10 - (distanceKm / 5));
          }

          let totalScore = Math.round(capacityScore + quantityScore + waitScore + prefScore + distanceScore);

          // Status penalty if busy or full
          if (center.operationalStatus === 'busy') totalScore -= 15;
          if (!isBookable) totalScore = -1; // Unbookable slots pushed to bottom

          let recommendationReason = '';
          if (isBookable) {
            if (slot === preferredTimeSlot && remainingFarmers >= 3) {
              recommendationReason = 'Matches your preferred time slot with ample capacity available.';
            } else if (estimatedWaitMins <= 15) {
              recommendationReason = `Low estimated wait time (~${estimatedWaitMins} min) and open capacity.`;
            } else {
              recommendationReason = `Available center with ${remainingQuantity} Qtl remaining capacity.`;
            }
          } else {
            recommendationReason = !isFarmerAvailable ? 'Slot is full (farmer limit reached).' : 'Slot quantity capacity limit reached for requested size.';
          }

          recommendations.push({
            centerId: center.id,
            centerName: center.name,
            district: center.district,
            address: center.address,
            date,
            timeSlot: slot,
            isBookable,
            isFarmerAvailable,
            isQtyAvailable,
            remainingFarmers,
            maxFarmers,
            currentCount,
            remainingQuantity,
            maxQuantity,
            currentQty,
            estimatedWaitMins,
            distanceKm: distanceKm ? parseFloat(distanceKm.toFixed(1)) : null,
            operationalStatus: center.operationalStatus,
            score: totalScore,
            recommendationReason
          });
        }
      }

      // Sort by Score descending (highest score first)
      recommendations.sort((a, b) => b.score - a.score);

      return recommendations;

    } catch (err) {
      console.error('[RecommendationEngine] Failed to calculate recommendations:', err);
      return [];
    }
  },

  /**
   * Calculate distance between two lat/lng points in km (Haversine Formula)
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
};
