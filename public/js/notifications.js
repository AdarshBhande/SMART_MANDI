/**
 * notifications.js — Phase 7: Event-Driven Notification Engine & Operational Interruption System
 * Handles persistent notification dispatch, idempotency, user isolation, appointment reminders,
 * and procurement-center equipment failure / operational interruption lifecycle.
 */

'use strict';

window.NotificationEngine = {

  // Supported explicit notification types
  TYPES: {
    BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
    BOOKING_CANCELLED: 'BOOKING_CANCELLED',
    BOOKING_RESCHEDULED: 'BOOKING_RESCHEDULED',
    WAITLIST_JOINED: 'WAITLIST_JOINED',
    WAITLIST_PROMOTED: 'WAITLIST_PROMOTED',
    APPOINTMENT_REMINDER: 'APPOINTMENT_REMINDER',
    QUEUE_APPROACHING: 'QUEUE_APPROACHING',
    QUEUE_CALLED: 'QUEUE_CALLED',
    CENTER_DELAY: 'CENTER_DELAY',
    CENTER_INTERRUPTION: 'CENTER_INTERRUPTION',
    CENTER_RESUMED: 'CENTER_RESUMED',
    PROCUREMENT_COMPLETED: 'PROCUREMENT_COMPLETED',
    PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
    PAYMENT_FAILED: 'PAYMENT_FAILED'
  },

  /**
   * Dispatch a persistent notification to a user in /notifications/{userId}/{notificationId}
   * Enforces idempotency via dedupeKey / eventKey
   * Secondary side-effect: failure does NOT throw or roll back business state
   * @param {Object} params
   * @returns {Promise<Object>} Notification result object
   */
  async notify({ userId, tokenId, type, title, message, dedupeKey, metadata = {} }) {
    if (!userId || !type || !title || !message) {
      console.warn('[NotificationEngine] Missing required fields for notify()');
      return { success: false, reason: 'MISSING_REQUIRED_FIELDS' };
    }

    try {
      const activeDedupeKey = dedupeKey || metadata.dedupeKey || metadata.eventId || `${type}_${tokenId || 'general'}`;
      const userNotifPath = `notifications/${userId}`;

      // Idempotency check: query existing notifications for this user with matching dedupeKey
      const existingSnap = await window.db.ref(userNotifPath).once('value');
      let existingNotification = null;

      if (existingSnap.exists()) {
        existingSnap.forEach(child => {
          const val = child.val();
          if (val && (val.dedupeKey === activeDedupeKey || (val.metadata && val.metadata.dedupeKey === activeDedupeKey))) {
            existingNotification = val;
          }
        });
      }

      if (existingNotification) {
        console.log(`ℹ️ [NotificationEngine] Notification already exists for dedupeKey ${activeDedupeKey} (Idempotent).`);
        return { success: true, alreadyExisted: true, duplicate: true, notification: existingNotification };
      }

      // Construct notification object
      const now = new Date().toISOString();
      const notificationId = `NOTIF_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

      const notification = {
        notificationId,
        userId,
        tokenId: tokenId || null,
        type,
        title,
        message,
        read: false,
        createdAt: now,
        dedupeKey: activeDedupeKey,
        metadata: {
          ...metadata,
          dedupeKey: activeDedupeKey
        }
      };

      // Persist in Firebase
      await window.db.ref(`${userNotifPath}/${notificationId}`).set(notification);

      // Log audit event asynchronously (non-blocking)
      if (window.AuditLogger && typeof window.AuditLogger.logEvent === 'function') {
        window.AuditLogger.logEvent({
          tokenId: tokenId || `USER_${userId}`,
          actorId: 'system',
          actorRole: 'System',
          action: 'NOTIFICATION_CREATED',
          fromState: null,
          toState: type,
          metadata: { notificationId, userId, type }
        }).catch(err => console.warn('[NotificationEngine] Audit log failed silently:', err));
      }

      console.log(`🔔 [NotificationEngine] Created '${type}' notification for user ${userId}`);
      return { success: true, alreadyExisted: false, notification };

    } catch (err) {
      console.error('[NotificationEngine] Failed to deliver notification:', err);
      // Return safe failure without throwing or rolling back caller
      return { success: false, error: err.message };
    }
  },

  /**
   * Retrieve all notifications for a specific user, sorted descending by creation time
   * @param {string} userId
   * @returns {Promise<Array>}
   */
  async getNotifications(userId) {
    if (!userId) return [];
    try {
      const snap = await window.db.ref(`notifications/${userId}`).once('value');
      if (!snap.exists()) return [];

      const list = [];
      snap.forEach(child => {
        const val = child.val();
        if (val) list.push(val);
      });

      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return list;
    } catch (err) {
      console.error('[NotificationEngine] getNotifications failed:', err);
      return [];
    }
  },

  /**
   * Get unread notification count for a user
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async getUnreadCount(userId) {
    if (!userId) return 0;
    try {
      const notifs = await this.getNotifications(userId);
      return notifs.filter(n => !n.read).length;
    } catch {
      return 0;
    }
  },

  /**
   * Mark a notification as read (Idempotent)
   * @param {string} userId
   * @param {string} notificationId
   * @returns {Promise<Object>}
   */
  async markAsRead(userId, notificationId) {
    if (!userId || !notificationId) return { success: false, reason: 'MISSING_PARAMETERS' };

    try {
      const path = `notifications/${userId}/${notificationId}`;
      const snap = await window.db.ref(path).once('value');
      if (!snap.exists()) return { success: false, reason: 'NOTIFICATION_NOT_FOUND' };

      const notif = snap.val();
      if (notif.read) {
        return { success: true, alreadyRead: true };
      }

      await window.db.ref(path).update({
        read: true,
        readAt: new Date().toISOString()
      });

      if (window.AuditLogger && typeof window.AuditLogger.logEvent === 'function') {
        window.AuditLogger.logEvent({
          tokenId: notif.tokenId || `USER_${userId}`,
          actorId: userId,
          actorRole: 'Farmer',
          action: 'NOTIFICATION_READ',
          fromState: 'unread',
          toState: 'read',
          metadata: { notificationId }
        }).catch(() => {});
      }

      return { success: true, alreadyRead: false };
    } catch (err) {
      console.error('[NotificationEngine] markAsRead failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Mark all notifications for a user as read
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async markAllAsRead(userId) {
    if (!userId) return { success: false, reason: 'MISSING_USER' };
    try {
      const notifs = await this.getNotifications(userId);
      const updates = {};
      const now = new Date().toISOString();

      notifs.forEach(n => {
        if (!n.read) {
          updates[`notifications/${userId}/${n.notificationId}/read`] = true;
          updates[`notifications/${userId}/${n.notificationId}/readAt`] = now;
        }
      });

      if (Object.keys(updates).length > 0) {
        await window.db.ref().update(updates);
      }

      return { success: true, updatedCount: Object.keys(updates).length };
    } catch (err) {
      console.error('[NotificationEngine] markAllAsRead failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Centralized event mapping handler
   * Transforms application events into structured notifications
   * @param {string} eventType
   * @param {Object} eventData
   */
  async handleEvent(eventType, eventData = {}) {
    const { userId, tokenId, farmerMobile, farmerName, centerName, date, timeSlot, station, reason, amount } = eventData;
    const targetUser = userId || farmerMobile || tokenId || 'system_user';

    let title = '';
    let message = '';
    const dedupeKey = eventData.dedupeKey || `${eventType}_${tokenId || 'gen'}_${date || ''}_${timeSlot || ''}`;

    switch (eventType) {
      case this.TYPES.BOOKING_CONFIRMED:
        title = '🌾 Paddy Procurement Appointment Confirmed';
        message = `Your appointment at ${centerName || 'Procurement Center'} is confirmed for ${date} (${timeSlot}). Token ID: ${tokenId}.`;
        break;

      case this.TYPES.BOOKING_CANCELLED:
        title = '❌ Appointment Cancelled';
        message = `Your booking ${tokenId} for ${date} (${timeSlot}) has been cancelled. Capacity has been released.`;
        break;

      case this.TYPES.BOOKING_RESCHEDULED:
        title = '🔄 Appointment Rescheduled';
        message = `Your booking ${tokenId} has been successfully rescheduled to ${centerName || 'Center'} on ${date} (${timeSlot}).`;
        break;

      case this.TYPES.WAITLIST_JOINED:
        title = '📋 Added to Waitlist';
        message = `You are on the waitlist for ${centerName || 'Center'} on ${date} (${timeSlot}). We will notify you if a slot opens.`;
        break;

      case this.TYPES.WAITLIST_PROMOTED:
        title = '🎉 Waitlist Promotion - Slot Confirmed!';
        message = `Great news! A slot opened up at ${centerName || 'Center'} for ${date} (${timeSlot}). Your appointment is confirmed! Token: ${tokenId}.`;
        break;

      case this.TYPES.APPOINTMENT_REMINDER:
        title = '⏰ Upcoming Paddy Appointment Reminder';
        message = `Reminder: You have a scheduled paddy procurement appointment at ${centerName || 'Center'} on ${date} (${timeSlot}). Token: ${tokenId}.`;
        break;

      case this.TYPES.QUEUE_APPROACHING:
        title = '🚶 Queue Approaching - Prepare for Entry';
        message = `You are approaching the front of the queue (Position #${eventData.position || 2}). Please be ready at ${centerName || 'the center'}.`;
        break;

      case this.TYPES.QUEUE_CALLED:
        title = '📢 Token Called for Processing!';
        message = `Token ${tokenId} has been called. Please proceed to ${station || 'the assigned weighbridge'}.`;
        break;

      case this.TYPES.CENTER_DELAY:
        title = '⏳ Operational Delay at Procurement Center';
        message = `${centerName || 'Procurement Center'} is experiencing operational delays (${reason || 'High volume'}). We appreciate your patience.`;
        break;

      case this.TYPES.CENTER_INTERRUPTION:
        title = '⚠️ Center Interruption Notice';
        message = `${centerName || 'Center'} has paused operations due to: ${reason || 'Equipment issue'}. Your booking remains safe and preserved. Option to reschedule is available.`;
        break;

      case this.TYPES.CENTER_RESUMED:
        title = '✅ Center Operations Resumed';
        message = `${centerName || 'Center'} has resumed normal procurement operations. You may proceed with your scheduled appointment.`;
        break;

      case this.TYPES.PROCUREMENT_COMPLETED:
        title = '✅ Paddy Procurement Completed';
        message = `Weighment and quality inspection for Token ${tokenId} is complete. Quantity: ${eventData.quantityQtl || ''} Qtl.`;
        break;

      case this.TYPES.PAYMENT_COMPLETED:
        title = '💰 Payment Processed';
        message = `Payment of ₹${amount || eventData.paymentAmount || 'N/A'} for Token ${tokenId} has been approved and processed to your registered account.`;
        break;

      case this.TYPES.PAYMENT_FAILED:
        title = '⚠️ Payment Processing Issue';
        message = `Payment processing for Token ${tokenId} encountered an issue. Please verify your bank details with center administration.`;
        break;

      default:
        title = 'Smart Mandi Notification';
        message = `Event notification for token ${tokenId || ''}`;
        break;
    }

    return await this.notify({
      userId: targetUser,
      tokenId: tokenId || null,
      type: eventType,
      title,
      message,
      metadata: {
        ...eventData,
        dedupeKey
      }
    });
  },

  /**
   * Check upcoming appointments and trigger in-app reminders
   * Skips cancelled or no-show bookings
   */
  async checkAppointmentReminders() {
    try {
      const tokensSnap = await window.db.ref('tokens').once('value');
      if (!tokensSnap.exists()) return 0;

      let reminderCount = 0;
      const todayStr = new Date().toISOString().split('T')[0];

      tokensSnap.forEach(child => {
        const t = child.val();
        if (t && t.bookingStatus === 'confirmed' && t.date === todayStr && t.arrivalStatus === 'pending') {
          const userId = t.farmerMobile || t.farmerId || t.tokenId;
          const dedupeKey = `APPOINTMENT_REMINDER_${t.tokenId}_${t.date}_${t.timeSlot}`;

          this.handleEvent(this.TYPES.APPOINTMENT_REMINDER, {
            userId,
            tokenId: t.tokenId,
            centerName: t.centerName || t.centerId,
            date: t.date,
            timeSlot: t.timeSlot,
            dedupeKey
          });
          reminderCount++;
        }
      });

      return reminderCount;
    } catch (err) {
      console.error('[NotificationEngine] checkAppointmentReminders failed:', err);
      return 0;
    }
  },

  /**
   * Handle Center Equipment Failure / Operational Interruption Lifecycle
   * Supported status: 'equipment_issue' | 'paused' | 'closed' | 'active'
   * Identifies affected future appointments & active queue entries, dispatches notifications,
   * preserves existing bookings & capacity without blind deletion, and audits state changes.
   * @param {Object} params
   */
  async handleCenterInterruption({ centerId, newStatus, reason, actorId }) {
    if (!centerId || !newStatus) {
      return { success: false, reason: 'MISSING_PARAMETERS' };
    }

    try {
      // 1. Fetch center
      const centerRef = window.db.ref(`centers/${centerId}`);
      const centerSnap = await centerRef.once('value');
      if (!centerSnap.exists()) return { success: false, reason: 'CENTER_NOT_FOUND' };

      const center = centerSnap.val();
      const previousStatus = center.operationalStatus || 'active';

      if (previousStatus === newStatus) {
        return { success: true, alreadyInStatus: true, operationalStatus: newStatus };
      }

      const now = new Date().toISOString();
      const interruptionReason = reason || `Operational status changed from ${previousStatus} to ${newStatus}`;

      // Update Center Operational Status
      await centerRef.update({
        operationalStatus: newStatus,
        interruptionReason: newStatus === 'active' ? null : interruptionReason,
        updatedAt: now
      });

      // 2. Identify affected tokens
      const affectedTokens = [];
      const tokensSnap = await window.db.ref('tokens').once('value');

      if (tokensSnap.exists()) {
        tokensSnap.forEach(child => {
          const t = child.val();
          if (t && t.centerId === centerId) {
            // Include active & future tokens (confirmed, checked_in, called, in_processing)
            if (['confirmed', 'pending'].includes(t.bookingStatus) && !['completed', 'cancelled', 'no_show'].includes(t.arrivalStatus)) {
              affectedTokens.push(t);
            }
          }
        });
      }

      // Identify affected queue entries
      const affectedQueueEntries = [];
      const queuesSnap = await window.db.ref(`queues/${centerId}`).once('value');
      if (queuesSnap.exists()) {
        queuesSnap.forEach(dateChild => {
          dateChild.forEach(slotChild => {
            slotChild.forEach(entryChild => {
              const q = entryChild.val();
              if (q && ['waiting', 'called', 'in_processing', 'held'].includes(q.queueStatus)) {
                affectedQueueEntries.push(q);
              }
            });
          });
        });
      }

      // 3. Dispatch Notifications
      const isInterruption = ['equipment_issue', 'paused', 'closed'].includes(newStatus);
      const eventType = isInterruption ? this.TYPES.CENTER_INTERRUPTION : this.TYPES.CENTER_RESUMED;

      for (const token of affectedTokens) {
        const targetUser = token.farmerMobile || token.farmerId || token.tokenId;
        const dedupeKey = `${eventType}_${centerId}_${token.tokenId}_${now.substring(0, 13)}`;

        await this.handleEvent(eventType, {
          userId: targetUser,
          tokenId: token.tokenId,
          centerName: center.name || centerId,
          date: token.date,
          timeSlot: token.timeSlot,
          reason: interruptionReason,
          dedupeKey
        });
      }

      // 4. Audit Trail Logging
      const actionCode = isInterruption ? 'CENTER_INTERRUPTION_STARTED' : 'CENTER_INTERRUPTION_RESOLVED';

      if (window.AuditLogger && typeof window.AuditLogger.logEvent === 'function') {
        await window.AuditLogger.logEvent({
          tokenId: `CENTER_${centerId}`,
          actorId: actorId || 'admin',
          actorRole: 'Admin',
          action: actionCode,
          fromState: previousStatus,
          toState: newStatus,
          metadata: {
            centerId,
            reason: interruptionReason,
            affectedTokensCount: affectedTokens.length,
            affectedQueueCount: affectedQueueEntries.length
          }
        });

        await window.AuditLogger.logEvent({
          tokenId: `CENTER_${centerId}`,
          actorId: actorId || 'admin',
          actorRole: 'Admin',
          action: 'CENTER_STATUS_CHANGED',
          fromState: previousStatus,
          toState: newStatus,
          metadata: { centerId, reason: interruptionReason }
        });
      }

      console.log(`⚠️ [NotificationEngine] Center ${centerId} status changed from ${previousStatus} -> ${newStatus}. Affected tokens: ${affectedTokens.length}`);

      return {
        success: true,
        previousStatus,
        newStatus,
        affectedTokensCount: affectedTokens.length,
        affectedQueueCount: affectedQueueEntries.length
      };

    } catch (err) {
      console.error('[NotificationEngine] handleCenterInterruption failed:', err);
      return { success: false, error: err.message };
    }
  }
};
