/**
 * queue-engine.js — Phase 6: Real-Time Scoped Queue Engine & Rolling Wait-Time Calculator
 * Authoritative source for /queues/{centerId}/{date}/{timeSlot}/{queueEntryId} state transitions,
 * FCFS position calculation, dynamic N-station concurrency protection, and rolling wait-time math.
 */

'use strict';

window.QueueEngine = {
  // Configurable minimum observation threshold for rolling average calculation
  MIN_OBSERVATIONS_THRESHOLD: 3,

  /**
   * Validate allowable queue state transitions
   */
  canCallNext(entry) {
    return entry && entry.queueStatus === 'waiting' && entry.arrivalStatus !== 'no_show';
  },

  canStartProcessing(entry) {
    return entry && entry.queueStatus === 'called';
  },

  canCompleteProcessing(entry) {
    return entry && entry.queueStatus === 'in_processing';
  },

  canHold(entry) {
    return entry && ['called', 'in_processing'].includes(entry.queueStatus);
  },

  canResume(entry) {
    return entry && entry.queueStatus === 'held';
  },

  canBypass(entry) {
    return entry && ['waiting', 'called'].includes(entry.queueStatus);
  },

  /**
   * Create or fetch dedicated queue entry upon gate check-in (Idempotent)
   * Path: /queues/{centerId}/{date}/{timeSlot}/{queueEntryId}
   * @param {Object} params
   */
  async createQueueEntry({ tokenId, centerId, date, timeSlot, checkInTime }) {
    if (!tokenId || !centerId || !date || !timeSlot) {
      return { success: false, reason: 'MISSING_PARAMETERS' };
    }

    try {
      // 1. Validate token record from /tokens
      const tokenSnap = await window.db.ref(`tokens/${tokenId}`).once('value');
      if (!tokenSnap.exists()) return { success: false, reason: 'TOKEN_NOT_FOUND' };
      const token = tokenSnap.val();

      if (token.bookingStatus === 'cancelled') {
        return { success: false, reason: 'TOKEN_CANCELLED' };
      }
      if (token.arrivalStatus === 'no_show') {
        return { success: false, reason: 'TOKEN_NO_SHOW' };
      }

      // 2. Idempotency Check: Query existing queue for this token
      const queuePath = `queues/${centerId}/${date}/${timeSlot}`;
      const existingQueueSnap = await window.db.ref(queuePath).once('value');

      let existingEntryKey = null;
      let existingEntry = null;

      if (existingQueueSnap.exists()) {
        existingQueueSnap.forEach(child => {
          const val = child.val();
          if (val && val.tokenId === tokenId) {
            existingEntryKey = child.key;
            existingEntry = val;
          }
        });
      }

      if (existingEntry) {
        console.log(`ℹ️ [QueueEngine] Queue entry already exists for token ${tokenId} (Idempotent).`);
        return { success: true, alreadyExisted: true, queueEntry: existingEntry };
      }

      // 3. Construct new queue entry
      const now = new Date().toISOString();
      const queueEntryId = `Q_${tokenId}`;

      const newEntry = {
        queueEntryId,
        tokenId,
        farmerName: token.farmerName || 'Farmer',
        farmerMobile: token.mobile || '',
        centerId,
        date,
        timeSlot,
        position: 999, // Computed in syncQueuePositions
        arrivalStatus: token.arrivalStatus || 'on_time',
        queueStatus: 'waiting',
        checkInTime: checkInTime || now,
        calledTime: null,
        processingStartTime: null,
        processingCompletedTime: null,
        assignedStation: null,
        estimatedWaitMins: 0,
        createdAt: now,
        updatedAt: now
      };

      await window.db.ref(`${queuePath}/${queueEntryId}`).set(newEntry);

      // Audit Log
      await window.AuditLogger.logEvent({
        tokenId,
        actorId: 'gate-operator',
        actorRole: 'Operator',
        action: 'QUEUE_ENTRY_CREATED',
        fromState: null,
        toState: 'waiting',
        metadata: { centerId, date, timeSlot, queueEntryId }
      });

      // 4. Recalculate FCFS positions and wait times
      await this.syncQueuePositions({ centerId, date, timeSlot });

      const updatedSnap = await window.db.ref(`${queuePath}/${queueEntryId}`).once('value');
      return { success: true, alreadyExisted: false, queueEntry: updatedSnap.val() };

    } catch (err) {
      console.error('[QueueEngine] createQueueEntry failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Recalculate FCFS 1-indexed queue positions and rolling wait times
   * Scoped to centerId + date + timeSlot
   * @param {Object} params
   */
  async syncQueuePositions({ centerId, date, timeSlot }) {
    if (!centerId || !date || !timeSlot) return null;

    try {
      const queuePath = `queues/${centerId}/${date}/${timeSlot}`;
      const snap = await window.db.ref(queuePath).once('value');
      if (!snap.exists()) return null;

      const entries = [];
      snap.forEach(child => {
        const val = child.val();
        if (val) entries.push(val);
      });

      // Separate waiting entries vs others
      const waitingEntries = entries.filter(e => e.queueStatus === 'waiting' && e.arrivalStatus !== 'no_show');

      // FCFS Sort: checkInTime -> createdAt
      waitingEntries.sort((a, b) => {
        const tA = new Date(a.checkInTime || a.createdAt).getTime();
        const tB = new Date(b.checkInTime || b.createdAt).getTime();
        return tA - tB;
      });

      const updates = {};
      const now = new Date().toISOString();

      // Recalculate positions and wait times for waiting entries
      for (let i = 0; i < waitingEntries.length; i++) {
        const entry = waitingEntries[i];
        const newPos = i + 1;

        const waitEst = await this.calculateRollingWaitTime({
          centerId,
          date,
          timeSlot,
          position: newPos
        });

        updates[`${queuePath}/${entry.queueEntryId}/position`] = newPos;
        updates[`${queuePath}/${entry.queueEntryId}/estimatedWaitMins`] = waitEst.estimatedWaitMins;
        updates[`${queuePath}/${entry.queueEntryId}/updatedAt`] = now;

        // Queue Approaching notification (Position <= 2)
        if (newPos <= 2 && window.NotificationEngine && typeof window.NotificationEngine.handleEvent === 'function') {
          const targetUser = entry.farmerMobile || entry.tokenId;
          window.NotificationEngine.handleEvent('QUEUE_APPROACHING', {
            userId: targetUser,
            tokenId: entry.tokenId,
            position: newPos,
            centerName: centerId,
            dedupeKey: `QUEUE_APPROACHING_${entry.tokenId}`
          }).catch(() => {});
        }
      }

      if (Object.keys(updates).length > 0) {
        await window.db.ref().update(updates);
      }

      return true;

    } catch (err) {
      console.error('[QueueEngine] syncQueuePositions failed:', err);
      return false;
    }
  },

  /**
   * Calculate rolling wait time until farmer's processing starts
   * Incorporates:
   * 1. Dynamic active weighbridge count (N stations)
   * 2. Configured avgProcessingTimeMins fallback vs rolling processing average from completed entries
   * 3. Parallel processing capacity calculation
   * @param {Object} params
   */
  async calculateRollingWaitTime({ centerId, date, timeSlot, position }) {
    if (!centerId) return { estimatedWaitMins: 0, effectiveAvgProcTime: 12, observationCount: 0 };

    try {
      // 1. Fetch center configuration
      const centerSnap = await window.db.ref(`centers/${centerId}`).once('value');
      const center = centerSnap.exists() ? centerSnap.val() : {};

      const activeWeighbridges = Math.max(1, center.activeWeighbridges || 3);
      const configuredAvgMins  = center.avgProcessingTimeMins || 12;

      // 2. Fetch completed queue entries across center to calculate rolling average
      let completedDurations = [];
      const queuesSnap = await window.db.ref(`queues/${centerId}`).once('value');

      if (queuesSnap.exists()) {
        queuesSnap.forEach(dateChild => {
          dateChild.forEach(slotChild => {
            slotChild.forEach(entryChild => {
              const e = entryChild.val();
              if (e && e.queueStatus === 'completed' && e.processingStartTime && e.processingCompletedTime) {
                const start = new Date(e.processingStartTime).getTime();
                const end   = new Date(e.processingCompletedTime).getTime();
                const diffMins = (end - start) / 60000;
                if (diffMins > 0 && diffMins <= 240) {
                  completedDurations.push(diffMins);
                }
              }
            });
          });
        });
      }

      // 3. Determine effective average processing time
      let effectiveAvgProcTime = configuredAvgMins;
      const obsCount = completedDurations.length;

      if (obsCount >= this.MIN_OBSERVATIONS_THRESHOLD) {
        // Pure rolling average from actual completed durations
        const sum = completedDurations.reduce((a, b) => a + b, 0);
        effectiveAvgProcTime = sum / obsCount;
      } else if (obsCount > 0) {
        // Blended fallback formula when insufficient observations exist (< 3)
        const obsSum = completedDurations.reduce((a, b) => a + b, 0);
        const obsAvg = obsSum / obsCount;
        effectiveAvgProcTime = (0.6 * configuredAvgMins) + (0.4 * obsAvg);
      }

      // 4. Parallel processing wait time calculation
      // Farmer at position N has (N - 1) farmers ahead
      const eligibleAheadCount = Math.max(0, position - 1);
      const estimatedWaitMins  = Math.max(0, Math.ceil((eligibleAheadCount * effectiveAvgProcTime) / activeWeighbridges));

      return {
        estimatedWaitMins,
        effectiveAvgProcTime: parseFloat(effectiveAvgProcTime.toFixed(1)),
        observationCount: obsCount,
        activeWeighbridges
      };

    } catch (err) {
      console.warn('[QueueEngine] calculateRollingWaitTime error:', err);
      return { estimatedWaitMins: Math.max(0, (position - 1) * 4), effectiveAvgProcTime: 12, observationCount: 0 };
    }
  },

  /**
   * Deterministic Call-Next Operation
   * Uses atomic transaction to ensure two operators do not call the same farmer
   * @param {Object} params
   */
  async callNext({ centerId, date, timeSlot, operatorId }) {
    if (!centerId || !date || !timeSlot) {
      return { success: false, reason: 'MISSING_PARAMETERS' };
    }

    try {
      const queuePath = `queues/${centerId}/${date}/${timeSlot}`;
      const snap = await window.db.ref(queuePath).once('value');
      if (!snap.exists()) return { success: false, reason: 'QUEUE_EMPTY' };

      const entries = [];
      snap.forEach(child => {
        const val = child.val();
        if (val) entries.push(val);
      });

      // Filter eligible waiting entries
      const eligibleWaiting = entries.filter(e => this.canCallNext(e));
      if (!eligibleWaiting.length) {
        return { success: false, reason: 'NO_ELIGIBLE_WAITING_FARMERS' };
      }

      // Select next FCFS entry
      eligibleWaiting.sort((a, b) => (a.position || 999) - (b.position || 999));
      const targetEntry = eligibleWaiting[0];

      // Atomic Transaction on target entry
      const entryRef = window.db.ref(`${queuePath}/${targetEntry.queueEntryId}`);
      let conflictDetected = false;

      const txResult = await entryRef.transaction((current) => {
        if (!current) return current;
        if (current.queueStatus !== 'waiting') {
          conflictDetected = true;
          return undefined; // Abort: another operator called this farmer simultaneously!
        }
        current.queueStatus = 'called';
        current.calledTime = new Date().toISOString();
        current.updatedAt = new Date().toISOString();
        return current;
      });

      if (!txResult || !txResult.committed || conflictDetected) {
        return { success: false, reason: 'CONCURRENCY_CONFLICT_ALREADY_CALLED' };
      }

      const updatedEntry = txResult.snapshot.val();

      // Update main token record
      await window.db.ref(`tokens/${targetEntry.tokenId}`).update({
        queueStatus: 'called',
        status: 'Quality Check'
      });

      // Audit Log
      await window.AuditLogger.logEvent({
        tokenId: targetEntry.tokenId,
        actorId: operatorId || 'operator',
        actorRole: 'Operator',
        action: 'QUEUE_CALLED',
        fromState: 'waiting',
        toState: 'called',
        metadata: { queueEntryId: targetEntry.queueEntryId, centerId, date, timeSlot }
      });

      if (window.NotificationEngine && typeof window.NotificationEngine.handleEvent === 'function') {
        const targetUser = targetEntry.farmerMobile || targetEntry.tokenId;
        window.NotificationEngine.handleEvent('QUEUE_CALLED', {
          userId: targetUser,
          tokenId: targetEntry.tokenId,
          station: 'Weighbridge 1',
          centerName: centerId,
          dedupeKey: `QUEUE_CALLED_${targetEntry.tokenId}_${updatedEntry.calledTime}`
        }).catch(() => {});
      }

      // Recalculate remaining queue
      await this.syncQueuePositions({ centerId, date, timeSlot });

      console.log(`📢 [QueueEngine] Called next farmer ${targetEntry.farmerName} (${targetEntry.tokenId})`);
      return { success: true, queueEntry: updatedEntry };

    } catch (err) {
      console.error('[QueueEngine] callNext failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Start Processing at assigned station
   * Ensures station is not occupied by another active token
   * @param {Object} params
   */
  async startProcessing({ centerId, date, timeSlot, queueEntryId, stationId, operatorId }) {
    if (!centerId || !date || !timeSlot || !queueEntryId) {
      return { success: false, reason: 'MISSING_PARAMETERS' };
    }

    try {
      const station = stationId || 'Weighbridge 1';
      const queuePath = `queues/${centerId}/${date}/${timeSlot}/${queueEntryId}`;
      const entrySnap = await window.db.ref(queuePath).once('value');
      if (!entrySnap.exists()) return { success: false, reason: 'QUEUE_ENTRY_NOT_FOUND' };

      const entry = entrySnap.val();
      if (!this.canStartProcessing(entry)) {
        return { success: false, reason: 'INVALID_STATE_TRANSITION', currentStatus: entry.queueStatus };
      }

      // Station Concurrency Check: Check if station is occupied by another token at center
      const stationOccupied = await this.isStationOccupied({ centerId, stationId: station, excludeQueueEntryId: queueEntryId });
      if (stationOccupied) {
        return { success: false, reason: 'STATION_OCCUPIED', stationId: station };
      }

      const now = new Date().toISOString();
      const updates = {
        queueStatus: 'in_processing',
        processingStartTime: now,
        assignedStation: station,
        updatedAt: now
      };

      await window.db.ref(queuePath).update(updates);

      // Update station registry
      await window.db.ref(`stations/${centerId}/${station}`).set({
        status: 'occupied',
        tokenId: entry.tokenId,
        queueEntryId,
        startedAt: now
      });

      // Update token record
      await window.db.ref(`tokens/${entry.tokenId}`).update({
        queueStatus: 'in_processing',
        qualityStatus: 'in_progress',
        weighbridgeId: station
      });

      // Audit Logs
      await window.AuditLogger.logEvent({
        tokenId: entry.tokenId,
        actorId: operatorId || 'operator',
        actorRole: 'Operator',
        action: 'PROCESSING_STARTED',
        fromState: 'called',
        toState: 'in_processing',
        metadata: { station }
      });

      await window.AuditLogger.logEvent({
        tokenId: entry.tokenId,
        actorId: operatorId || 'operator',
        actorRole: 'Operator',
        action: 'STATION_ASSIGNED',
        fromState: null,
        toState: station,
        metadata: { station }
      });

      await this.syncQueuePositions({ centerId, date, timeSlot });
      return { success: true, queueEntryId, station };

    } catch (err) {
      console.error('[QueueEngine] startProcessing failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Complete Processing & release station
   * @param {Object} params
   */
  async completeProcessing({ centerId, date, timeSlot, queueEntryId, operatorId }) {
    if (!centerId || !date || !timeSlot || !queueEntryId) {
      return { success: false, reason: 'MISSING_PARAMETERS' };
    }

    try {
      const queuePath = `queues/${centerId}/${date}/${timeSlot}/${queueEntryId}`;
      const entrySnap = await window.db.ref(queuePath).once('value');
      if (!entrySnap.exists()) return { success: false, reason: 'QUEUE_ENTRY_NOT_FOUND' };

      const entry = entrySnap.val();
      if (!this.canCompleteProcessing(entry)) {
        return { success: false, reason: 'INVALID_STATE_TRANSITION', currentStatus: entry.queueStatus };
      }

      const now = new Date().toISOString();
      const station = entry.assignedStation || 'Weighbridge 1';

      await window.db.ref(queuePath).update({
        queueStatus: 'completed',
        processingCompletedTime: now,
        updatedAt: now
      });

      // Release station
      await window.db.ref(`stations/${centerId}/${station}`).set({
        status: 'available',
        tokenId: null,
        queueEntryId: null,
        startedAt: null
      });

      // Update token record
      await window.db.ref(`tokens/${entry.tokenId}`).update({
        queueStatus: 'completed',
        weighmentStatus: 'completed'
      });

      // Audit Logs
      await window.AuditLogger.logEvent({
        tokenId: entry.tokenId,
        actorId: operatorId || 'operator',
        actorRole: 'Operator',
        action: 'PROCESSING_COMPLETED',
        fromState: 'in_processing',
        toState: 'completed'
      });

      await window.AuditLogger.logEvent({
        tokenId: entry.tokenId,
        actorId: operatorId || 'operator',
        actorRole: 'Operator',
        action: 'STATION_RELEASED',
        fromState: station,
        toState: 'available'
      });

      // Recalculate positions & wait times for remaining waiting queue
      await this.syncQueuePositions({ centerId, date, timeSlot });
      return { success: true, queueEntryId };

    } catch (err) {
      console.error('[QueueEngine] completeProcessing failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Hold Queue Entry
   * Transitions called or in_processing -> held
   */
  async holdQueueEntry({ centerId, date, timeSlot, queueEntryId, operatorId, reason }) {
    if (!centerId || !date || !timeSlot || !queueEntryId) {
      return { success: false, reason: 'MISSING_PARAMETERS' };
    }

    try {
      const queuePath = `queues/${centerId}/${date}/${timeSlot}/${queueEntryId}`;
      const entrySnap = await window.db.ref(queuePath).once('value');
      if (!entrySnap.exists()) return { success: false, reason: 'QUEUE_ENTRY_NOT_FOUND' };

      const entry = entrySnap.val();
      if (!this.canHold(entry)) {
        return { success: false, reason: 'INVALID_STATE_TRANSITION', currentStatus: entry.queueStatus };
      }

      const now = new Date().toISOString();
      const oldStation = entry.assignedStation;

      await window.db.ref(queuePath).update({
        queueStatus: 'held',
        position: null,
        assignedStation: null,
        holdReason: reason || 'Operator placed token on hold',
        updatedAt: now
      });

      // If station was assigned, release it
      if (oldStation) {
        await window.db.ref(`stations/${centerId}/${oldStation}`).set({
          status: 'available',
          tokenId: null,
          queueEntryId: null,
          startedAt: null
        });
      }

      await window.db.ref(`tokens/${entry.tokenId}`).update({ queueStatus: 'held' });

      await window.AuditLogger.logEvent({
        tokenId: entry.tokenId,
        actorId: operatorId || 'operator',
        actorRole: 'Operator',
        action: 'QUEUE_HELD',
        fromState: entry.queueStatus,
        toState: 'held',
        metadata: { reason: reason || 'Operator placed token on hold' }
      });

      await this.syncQueuePositions({ centerId, date, timeSlot });
      return { success: true, queueEntryId };

    } catch (err) {
      console.error('[QueueEngine] holdQueueEntry failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Resume Held Queue Entry
   * Policy: Resumed entry is appended to the end of the eligible waiting queue
   */
  async resumeQueueEntry({ centerId, date, timeSlot, queueEntryId, operatorId }) {
    if (!centerId || !date || !timeSlot || !queueEntryId) {
      return { success: false, reason: 'MISSING_PARAMETERS' };
    }

    try {
      const queuePath = `queues/${centerId}/${date}/${timeSlot}/${queueEntryId}`;
      const entrySnap = await window.db.ref(queuePath).once('value');
      if (!entrySnap.exists()) return { success: false, reason: 'QUEUE_ENTRY_NOT_FOUND' };

      const entry = entrySnap.val();
      if (!this.canResume(entry)) {
        return { success: false, reason: 'INVALID_STATE_TRANSITION', currentStatus: entry.queueStatus };
      }

      const now = new Date().toISOString();
      await window.db.ref(queuePath).update({
        queueStatus: 'waiting',
        checkInTime: now, // Resume places farmer at end of queue
        updatedAt: now
      });

      await window.db.ref(`tokens/${entry.tokenId}`).update({ queueStatus: 'waiting' });

      await window.AuditLogger.logEvent({
        tokenId: entry.tokenId,
        actorId: operatorId || 'operator',
        actorRole: 'Operator',
        action: 'QUEUE_RESUMED',
        fromState: 'held',
        toState: 'waiting'
      });

      await this.syncQueuePositions({ centerId, date, timeSlot });
      return { success: true, queueEntryId };

    } catch (err) {
      console.error('[QueueEngine] resumeQueueEntry failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Bypass Queue Entry
   * Transitions waiting or called -> bypassed
   */
  async bypassQueueEntry({ centerId, date, timeSlot, queueEntryId, operatorId, reason }) {
    if (!centerId || !date || !timeSlot || !queueEntryId) {
      return { success: false, reason: 'MISSING_PARAMETERS' };
    }

    try {
      const queuePath = `queues/${centerId}/${date}/${timeSlot}/${queueEntryId}`;
      const entrySnap = await window.db.ref(queuePath).once('value');
      if (!entrySnap.exists()) return { success: false, reason: 'QUEUE_ENTRY_NOT_FOUND' };

      const entry = entrySnap.val();
      if (!this.canBypass(entry)) {
        return { success: false, reason: 'INVALID_STATE_TRANSITION', currentStatus: entry.queueStatus };
      }

      const now = new Date().toISOString();
      const oldStation = entry.assignedStation;

      await window.db.ref(queuePath).update({
        queueStatus: 'bypassed',
        position: null,
        assignedStation: null,
        bypassReason: reason || 'Bypassed by operator',
        updatedAt: now
      });

      if (oldStation) {
        await window.db.ref(`stations/${centerId}/${oldStation}`).set({
          status: 'available',
          tokenId: null,
          queueEntryId: null,
          startedAt: null
        });
      }

      await window.db.ref(`tokens/${entry.tokenId}`).update({ queueStatus: 'bypassed' });

      await window.AuditLogger.logEvent({
        tokenId: entry.tokenId,
        actorId: operatorId || 'operator',
        actorRole: 'Operator',
        action: 'QUEUE_BYPASSED',
        fromState: entry.queueStatus,
        toState: 'bypassed',
        metadata: { reason: reason || 'Bypassed by operator' }
      });

      await this.syncQueuePositions({ centerId, date, timeSlot });
      return { success: true, queueEntryId };

    } catch (err) {
      console.error('[QueueEngine] bypassQueueEntry failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Check if station is currently occupied at center
   */
  async isStationOccupied({ centerId, stationId, excludeQueueEntryId }) {
    if (!centerId || !stationId) return false;

    try {
      const stationSnap = await window.db.ref(`stations/${centerId}/${stationId}`).once('value');
      if (stationSnap.exists()) {
        const val = stationSnap.val();
        if (val.status === 'occupied' && val.queueEntryId !== excludeQueueEntryId) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }
};
