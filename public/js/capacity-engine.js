/**
 * capacity-engine.js — Dual Capacity Validation Engine
 * Enforces maxFarmersPerSlot AND maxQuantityPerSlot using atomic Firebase transactions.
 */

'use strict';

window.CapacityEngine = {
  /**
   * Read center config and check slot capacity deterministically
   * @param {Object} params
   * @param {string} params.centerId
   * @param {string} params.date - YYYY-MM-DD
   * @param {string} params.timeSlot - e.g. "8AM-10AM"
   * @param {number} params.estimatedQuantityQtl - Quantity requested in quintals
   * @returns {Promise<Object>} Capacity check result object
   */
  async checkSlotCapacity({ centerId, date, timeSlot, estimatedQuantityQtl }) {
    if (!centerId || !date || !timeSlot || typeof estimatedQuantityQtl !== 'number') {
      return { available: false, reason: 'INVALID_PARAMETERS' };
    }

    try {
      // 1. Fetch Center Configuration
      const centerSnap = await window.db.ref(`centers/${centerId}`).once('value');
      if (!centerSnap.exists()) {
        return { available: false, reason: 'CENTER_NOT_FOUND' };
      }

      const center = centerSnap.val();
      if (center.operationalStatus === 'closed' || center.operationalStatus === 'paused' || center.operationalStatus === 'equipment_issue') {
        return { available: false, reason: 'CENTER_NOT_OPERATIONAL', centerStatus: center.operationalStatus };
      }

      const maxFarmers = center.maxFarmersPerSlot || 10;
      const maxQuantity = center.maxQuantityPerSlot || 500;

      // 2. Fetch Current Slot Capacities
      const slotSnap = await window.db.ref(`slotCapacities/${centerId}/${date}/${timeSlot}`).once('value');
      const slotData = slotSnap.exists() ? slotSnap.val() : { bookedCount: 0, bookedQuantity: 0, waitingListCount: 0 };

      const currentCount = slotData.bookedCount || 0;
      const currentQty = slotData.bookedQuantity || 0;

      const remainingFarmers = Math.max(0, maxFarmers - currentCount);
      const remainingQuantity = Math.max(0, maxQuantity - currentQty);

      if (currentCount + 1 > maxFarmers) {
        return {
          available: false,
          reason: 'FARMER_CAPACITY_FULL',
          currentCount,
          maxFarmers,
          currentQty,
          maxQuantity,
          remainingFarmers,
          remainingQuantity
        };
      }

      if (currentQty + estimatedQuantityQtl > maxQuantity) {
        return {
          available: false,
          reason: 'QUANTITY_CAPACITY_FULL',
          currentCount,
          maxFarmers,
          currentQty,
          maxQuantity,
          remainingFarmers,
          remainingQuantity
        };
      }

      return {
        available: true,
        reason: null,
        currentCount,
        maxFarmers,
        currentQty,
        maxQuantity,
        remainingFarmers,
        remainingQuantity
      };

    } catch (err) {
      console.error('[CapacityEngine] Check failed:', err);
      return { available: false, reason: 'DATABASE_ERROR', error: err.message };
    }
  },

  /**
   * Atomically reserve slot capacity using Firebase transactions
   * @param {Object} params
   * @param {string} params.centerId
   * @param {string} params.date
   * @param {string} params.timeSlot
   * @param {number} params.estimatedQuantityQtl
   * @returns {Promise<Object>} Transaction result { success, reason, slotData }
   */
  async reserveSlotCapacity({ centerId, date, timeSlot, estimatedQuantityQtl }) {
    if (!centerId || !date || !timeSlot || typeof estimatedQuantityQtl !== 'number') {
      return { success: false, reason: 'INVALID_PARAMETERS' };
    }

    try {
      const centerSnap = await window.db.ref(`centers/${centerId}`).once('value');
      if (!centerSnap.exists()) {
        return { success: false, reason: 'CENTER_NOT_FOUND' };
      }
      const center = centerSnap.val();
      const maxFarmers = center.maxFarmersPerSlot || 10;
      const maxQuantity = center.maxQuantityPerSlot || 500;

      let failureReason = null;
      const slotRef = window.db.ref(`slotCapacities/${centerId}/${date}/${timeSlot}`);

      const txResult = await slotRef.transaction((current) => {
        if (!current) {
          current = { bookedCount: 0, bookedQuantity: 0, waitingListCount: 0 };
        }

        const nextCount = (current.bookedCount || 0) + 1;
        const nextQty = (current.bookedQuantity || 0) + estimatedQuantityQtl;

        if (nextCount > maxFarmers) {
          failureReason = 'FARMER_CAPACITY_FULL';
          return undefined; // Abort
        }

        if (nextQty > maxQuantity) {
          failureReason = 'QUANTITY_CAPACITY_FULL';
          return undefined; // Abort
        }

        current.bookedCount = nextCount;
        current.bookedQuantity = nextQty;
        return current;
      });

      if (txResult && txResult.committed) {
        return {
          success: true,
          reason: null,
          slotData: txResult.snapshot.val()
        };
      } else {
        return {
          success: false,
          reason: failureReason || 'RACE_CONDITION_ABORT',
          slotData: null
        };
      }

    } catch (err) {
      console.error('[CapacityEngine] Reservation failed:', err);
      return { success: false, reason: 'TRANSACTION_ERROR', error: err.message };
    }
  },

  /**
   * Atomically release slot capacity (e.g. upon cancellation or rescheduling)
   * Automatically triggers waiting list evaluation if capacity becomes available.
   * @param {Object} params
   * @param {string} params.centerId
   * @param {string} params.date
   * @param {string} params.timeSlot
   * @param {number} params.estimatedQuantityQtl
   * @returns {Promise<Object>} { success, slotData }
   */
  async releaseSlotCapacity({ centerId, date, timeSlot, estimatedQuantityQtl }) {
    if (!centerId || !date || !timeSlot || typeof estimatedQuantityQtl !== 'number') {
      return { success: false, reason: 'INVALID_PARAMETERS' };
    }

    try {
      const slotRef = window.db.ref(`slotCapacities/${centerId}/${date}/${timeSlot}`);
      const txResult = await slotRef.transaction((current) => {
        if (!current) return current;

        current.bookedCount = Math.max(0, (current.bookedCount || 0) - 1);
        current.bookedQuantity = Math.max(0, (current.bookedQuantity || 0) - estimatedQuantityQtl);
        return current;
      });

      const success = txResult ? txResult.committed : false;
      const slotData = txResult && txResult.snapshot ? txResult.snapshot.val() : null;

      // Auto-evaluate waiting list when capacity is released
      if (success) {
        setTimeout(() => {
          this.evaluateWaitlist({ centerId, date, timeSlot });
        }, 100);
      }

      return { success, slotData };

    } catch (err) {
      console.error('[CapacityEngine] Release failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Opt-in a farmer to the waiting list for a full slot
   * @param {Object} params
   */
  async joinWaitlist({ centerId, date, timeSlot, estimatedQuantityQtl, farmerEmail, farmerUid, farmerName }) {
    if (!centerId || !date || !timeSlot || typeof estimatedQuantityQtl !== 'number') {
      return { success: false, reason: 'INVALID_PARAMETERS' };
    }

    try {
      const waitlistRef = window.db.ref(`waitingList/${centerId}/${date}/${timeSlot}`).push();
      const waitlistId = waitlistRef.key;

      const waitEntry = {
        waitlistId,
        centerId,
        date,
        timeSlot,
        estimatedQuantityQtl,
        farmerEmail: farmerEmail || '',
        farmerUid: farmerUid || 'guest',
        farmerName: farmerName || 'Farmer',
        status: 'waiting',
        timestamp: new Date().toISOString()
      };

      await window.db.ref(`waitingList/${centerId}/${date}/${timeSlot}/${waitlistId}`).set(waitEntry);

      // Increment waitingListCount in slotCapacities
      const capRef = window.db.ref(`slotCapacities/${centerId}/${date}/${timeSlot}`);
      await capRef.transaction((current) => {
        if (!current) current = { bookedCount: 0, bookedQuantity: 0, waitingListCount: 0 };
        current.waitingListCount = (current.waitingListCount || 0) + 1;
        return current;
      });

      // Audit Log
      await window.AuditLogger.logEvent({
        tokenId: `WAITLIST-${waitlistId.slice(-6)}`,
        actorId: farmerUid || 'guest',
        actorRole: 'Farmer',
        action: 'WAITLIST_JOINED',
        fromState: null,
        toState: 'waiting',
        metadata: { centerId, date, timeSlot, estimatedQuantityQtl }
      });

      if (window.NotificationEngine && typeof window.NotificationEngine.handleEvent === 'function') {
        const targetUser = farmerUid || farmerEmail || `WAITLIST-${waitlistId.slice(-6)}`;
        window.NotificationEngine.handleEvent('WAITLIST_JOINED', {
          userId: targetUser,
          tokenId: `WAITLIST-${waitlistId.slice(-6)}`,
          centerName: centerId,
          date,
          timeSlot,
          dedupeKey: `WAITLIST_JOINED_${waitlistId}`
        }).catch(() => {});
      }

      return { success: true, waitEntry };

    } catch (err) {
      console.error('[CapacityEngine] Join waitlist failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Cancel a waitlist entry
   */
  async cancelWaitlist({ centerId, date, timeSlot, waitlistId }) {
    if (!centerId || !date || !timeSlot || !waitlistId) {
      return { success: false, reason: 'INVALID_PARAMETERS' };
    }

    try {
      await window.db.ref(`waitingList/${centerId}/${date}/${timeSlot}/${waitlistId}/status`).set('cancelled');

      // Decrement waitingListCount
      const capRef = window.db.ref(`slotCapacities/${centerId}/${date}/${timeSlot}`);
      await capRef.transaction((current) => {
        if (!current) return current;
        current.waitingListCount = Math.max(0, (current.waitingListCount || 0) - 1);
        return current;
      });

      await window.AuditLogger.logEvent({
        tokenId: `WAITLIST-${waitlistId.slice(-6)}`,
        actorId: 'farmer',
        actorRole: 'Farmer',
        action: 'WAITLIST_CANCELLED',
        fromState: 'waiting',
        toState: 'cancelled',
        metadata: { centerId, date, timeSlot }
      });

      return { success: true };

    } catch (err) {
      console.error('[CapacityEngine] Cancel waitlist failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Evaluate waiting list upon capacity release and promote eligible candidate
   * Uses atomic reservation to guarantee no overbooking race conditions
   * @param {Object} params
   */
  async evaluateWaitlist({ centerId, date, timeSlot }) {
    if (!centerId || !date || !timeSlot) return null;

    try {
      const waitSnap = await window.db.ref(`waitingList/${centerId}/${date}/${timeSlot}`).once('value');
      if (!waitSnap.exists()) return null;

      const candidates = [];
      waitSnap.forEach(child => {
        const val = child.val();
        if (val && val.status === 'waiting') {
          candidates.push(val);
        }
      });

      // Sort by timestamp ascending (FCFS fairness)
      candidates.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      for (const candidate of candidates) {
        // Pre-check capacity
        const capCheck = await this.checkSlotCapacity({
          centerId,
          date,
          timeSlot,
          estimatedQuantityQtl: candidate.estimatedQuantityQtl
        });

        if (capCheck.available) {
          // Attempt atomic reservation
          const reservation = await this.reserveSlotCapacity({
            centerId,
            date,
            timeSlot,
            estimatedQuantityQtl: candidate.estimatedQuantityQtl
          });

          if (reservation.success) {
            // Promote candidate
            await window.db.ref(`waitingList/${centerId}/${date}/${timeSlot}/${candidate.waitlistId}/status`).set('promoted');

            // Decrement waitlist count
            const capRef = window.db.ref(`slotCapacities/${centerId}/${date}/${timeSlot}`);
            await capRef.transaction((current) => {
              if (!current) return current;
              current.waitingListCount = Math.max(0, (current.waitingListCount || 0) - 1);
              return current;
            });

            // Issue Token
            const pushKey = window.db.ref('tokens').push().key;
            const dateStr = date.replace(/-/g, '');
            const suffix = pushKey.slice(-4).toUpperCase();
            const tokenId = `MANDI-${dateStr}-${suffix}`;
            const now = new Date().toISOString();

            const tokenData = {
              tokenId,
              farmerName: candidate.farmerName,
              mobile: '9876543210',
              cropType: 'Paddy (Grade A)',
              quantity: candidate.estimatedQuantityQtl,
              estimatedQuantityQtl: candidate.estimatedQuantityQtl,
              actualQuantityQtl: null,
              date,
              timeSlot,
              vehicleNumber: '',
              centerId,
              centerName: 'Central Mandi Hub Ludhiana',
              createdByEmail: candidate.farmerEmail,
              createdByUid: candidate.farmerUid,
              bookingStatus: 'confirmed',
              arrivalStatus: 'pending',
              queueStatus: 'waiting',
              weighmentStatus: 'pending',
              qualityStatus: 'pending',
              procurementStatus: 'pending',
              paymentStatus: 'pending',
              status: 'Token Issued',
              createdAt: now,
              promotedFromWaitlist: true
            };

            await window.db.ref(`tokens/${tokenId}`).set(tokenData);

            // Audit Event
            await window.AuditLogger.logEvent({
              tokenId,
              actorId: 'system',
              actorRole: 'System',
              action: 'WAITLIST_PROMOTED',
              fromState: 'waiting',
              toState: 'confirmed',
              metadata: { waitlistId: candidate.waitlistId, centerId, date, timeSlot, quantity: candidate.estimatedQuantityQtl }
            });

            if (window.NotificationEngine && typeof window.NotificationEngine.handleEvent === 'function') {
              const targetUser = candidate.farmerUid || candidate.farmerEmail || tokenId;
              window.NotificationEngine.handleEvent('WAITLIST_PROMOTED', {
                userId: targetUser,
                tokenId,
                centerName: 'Central Mandi Hub Ludhiana',
                date,
                timeSlot,
                dedupeKey: `WAITLIST_PROMOTED_${candidate.waitlistId}_${tokenId}`
              }).catch(() => {});
            }

            console.log(`🎉 [CapacityEngine] Promoted waitlist entry ${candidate.waitlistId} to token ${tokenId}`);
            return tokenData;
          }
        }
      }

      return null;

    } catch (err) {
      console.error('[CapacityEngine] Evaluate waitlist failed:', err);
      return null;
    }
  },

  /**
   * Cancel an existing confirmed token booking
   * Validates eligibility, releases capacity, updates bookingStatus, and writes audit event.
   * @param {Object} params
   * @param {string} params.tokenId
   * @param {string} [params.actorId]
   * @param {string} [params.actorRole]
   * @param {string} [params.reason]
   */
  async cancelBooking({ tokenId, actorId, actorRole, reason }) {
    if (!tokenId) return { success: false, reason: 'MISSING_TOKEN_ID' };

    try {
      const snap = await window.db.ref(`tokens/${tokenId}`).once('value');
      if (!snap.exists()) return { success: false, reason: 'TOKEN_NOT_FOUND' };

      const token = snap.val();

      // Idempotency: If already cancelled, return success without duplicate capacity releases
      if (token.bookingStatus === 'cancelled') {
        return { success: true, alreadyCancelled: true, token };
      }

      // Eligibility check: Only allow cancellation if booking is confirmed AND gate check-in has not started
      if (token.bookingStatus !== 'confirmed' || token.arrivalStatus !== 'pending') {
        return {
          success: false,
          reason: 'CANCELLATION_NOT_ELIGIBLE',
          currentBookingStatus: token.bookingStatus,
          currentArrivalStatus: token.arrivalStatus
        };
      }

      const centerId = token.centerId || 'center-ludhiana-01';
      const date = token.date;
      const timeSlot = token.timeSlot;
      const qty = typeof token.estimatedQuantityQtl === 'number' ? token.estimatedQuantityQtl : (parseFloat(token.quantity) || 50);

      // Release slot capacity (this also automatically triggers waitlist evaluation)
      const releaseRes = await this.releaseSlotCapacity({
        centerId,
        date,
        timeSlot,
        estimatedQuantityQtl: qty
      });

      if (!releaseRes.success) {
        return { success: false, reason: 'CAPACITY_RELEASE_FAILED' };
      }

      // Update token bookingStatus
      const now = new Date().toISOString();
      await window.db.ref(`tokens/${tokenId}`).update({
        bookingStatus: 'cancelled',
        status: 'Cancelled',
        cancelledAt: now,
        cancellationReason: reason || 'Farmer requested cancellation'
      });

      // Log Audit Event
      await window.AuditLogger.logEvent({
        tokenId,
        actorId: actorId || token.createdByUid || 'farmer',
        actorRole: actorRole || 'Farmer',
        action: 'BOOKING_CANCELLED',
        fromState: 'confirmed',
        toState: 'cancelled',
        metadata: { centerId, date, timeSlot, quantity: qty, reason: reason || 'Farmer requested cancellation' }
      });

      console.log(`❌ [CapacityEngine] Token ${tokenId} successfully cancelled.`);
      return { success: true, tokenId };

    } catch (err) {
      console.error('[CapacityEngine] Cancel booking failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Safe Two-Phase Rescheduling
   * Sequence:
   * 1. Validate Token & Destination Center status
   * 2. Phase 1: Atomically reserve destination Slot B
   *    (If Slot B reservation fails, ABORT IMMEDIATELY. Slot A & Token remain 100% UNTOUCHED).
   * 3. Phase 2: Update token to Slot B details and release Slot A capacity.
   * 4. Audit Log BOOKING_RESCHEDULED.
   * @param {Object} params
   */
  async rescheduleBooking({ tokenId, newCenterId, newDate, newTimeSlot, newQuantityQtl, actorId, actorRole }) {
    if (!tokenId || !newCenterId || !newDate || !newTimeSlot) {
      return { success: false, reason: 'MISSING_PARAMETERS' };
    }

    try {
      const snap = await window.db.ref(`tokens/${tokenId}`).once('value');
      if (!snap.exists()) return { success: false, reason: 'TOKEN_NOT_FOUND' };

      const token = snap.val();

      // Eligibility Check
      if (token.bookingStatus !== 'confirmed' || token.arrivalStatus !== 'pending') {
        return {
          success: false,
          reason: 'RESCHEDULE_NOT_ELIGIBLE',
          currentBookingStatus: token.bookingStatus,
          currentArrivalStatus: token.arrivalStatus
        };
      }

      const oldCenterId = token.centerId || 'center-ludhiana-01';
      const oldDate = token.date;
      const oldTimeSlot = token.timeSlot;
      const oldQty = typeof token.estimatedQuantityQtl === 'number' ? token.estimatedQuantityQtl : (parseFloat(token.quantity) || 50);

      const targetQty = typeof newQuantityQtl === 'number' && newQuantityQtl > 0 ? newQuantityQtl : oldQty;

      // Idempotency: If new destination matches existing slot & qty, return success without duplicate transactions
      if (oldCenterId === newCenterId && oldDate === newDate && oldTimeSlot === newTimeSlot && oldQty === targetQty) {
        return { success: true, noChangeRequired: true, token };
      }

      // Check destination center operational status from /centers
      const destCenterSnap = await window.db.ref(`centers/${newCenterId}`).once('value');
      if (!destCenterSnap.exists()) {
        return { success: false, reason: 'DESTINATION_CENTER_NOT_FOUND' };
      }
      const destCenter = destCenterSnap.val();
      if (destCenter.operationalStatus === 'closed' || destCenter.operationalStatus === 'paused' || destCenter.operationalStatus === 'equipment_issue') {
        return {
          success: false,
          reason: 'DESTINATION_CENTER_NOT_OPERATIONAL',
          operationalStatus: destCenter.operationalStatus
        };
      }

      // PHASE 1: ATOMICALLY RESERVE DESTINATION SLOT B FIRST
      const reservation = await this.reserveSlotCapacity({
        centerId: newCenterId,
        date: newDate,
        timeSlot: newTimeSlot,
        estimatedQuantityQtl: targetQty
      });

      // CRITICAL: If Slot B reservation fails, Slot A & Token remain completely untouched!
      if (!reservation.success) {
        return {
          success: false,
          reason: `DESTINATION_RESERVATION_FAILED: ${reservation.reason}`,
          originalBookingIntact: true
        };
      }

      // PHASE 2: UPDATE TOKEN AND RELEASE OLD SLOT A CAPACITY
      const now = new Date().toISOString();
      const updates = {
        centerId: newCenterId,
        centerName: destCenter.name,
        date: newDate,
        timeSlot: newTimeSlot,
        estimatedQuantityQtl: targetQty,
        quantity: targetQty,
        rescheduledAt: now
      };

      await window.db.ref(`tokens/${tokenId}`).update(updates);

      // Release Old Slot A Capacity (using old quantities)
      await this.releaseSlotCapacity({
        centerId: oldCenterId,
        date: oldDate,
        timeSlot: oldTimeSlot,
        estimatedQuantityQtl: oldQty
      });

      // Log Audit Event
      await window.AuditLogger.logEvent({
        tokenId,
        actorId: actorId || token.createdByUid || 'farmer',
        actorRole: actorRole || 'Farmer',
        action: 'BOOKING_RESCHEDULED',
        fromState: 'confirmed',
        toState: 'confirmed',
        metadata: {
          fromCenterId: oldCenterId,
          fromDate: oldDate,
          fromTimeSlot: oldTimeSlot,
          toCenterId: newCenterId,
          toDate: newDate,
          toTimeSlot: newTimeSlot,
          oldQuantity: oldQty,
          newQuantity: targetQty
        }
      });

      console.log(`🔄 [CapacityEngine] Token ${tokenId} rescheduled from ${oldCenterId}/${oldDate}/${oldTimeSlot} to ${newCenterId}/${newDate}/${newTimeSlot}`);
      return { success: true, tokenId, updates };

    } catch (err) {
      console.error('[CapacityEngine] Reschedule failed:', err);
      return { success: false, error: err.message };
    }
  }
};
