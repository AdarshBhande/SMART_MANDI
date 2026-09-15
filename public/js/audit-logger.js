/**
 * audit-logger.js — Immutable Event Audit Logger for Mandi Token System
 * Handles appending audit logs to /auditLogs/{tokenId}
 */

'use strict';

window.AuditLogger = {
  /**
   * Log an event to /auditLogs/{tokenId}
   * @param {Object} params
   * @param {string} params.tokenId - Required token ID
   * @param {string} [params.actorId] - ID of user/operator making the change
   * @param {string} [params.actorRole] - 'Farmer' | 'Operator' | 'Admin' | 'System'
   * @param {string} params.action - Event action code (e.g. 'BOOKING_CREATED', 'FARMER_CHECKED_IN')
   * @param {string} [params.fromState] - Previous state string if applicable
   * @param {string} [params.toState] - New state string if applicable
   * @param {Object|string} [params.metadata] - Additional details or payload
   */
  async logEvent({ tokenId, actorId, actorRole, action, fromState, toState, metadata }) {
    if (!tokenId || !action) {
      console.warn('[AuditLogger] Missing required tokenId or action in logEvent');
      return null;
    }

    const logEntry = {
      id: `log_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString(),
      tokenId,
      actorId: actorId || 'system',
      actorRole: actorRole || 'System',
      action,
      fromState: fromState || null,
      toState: toState || null,
      metadata: typeof metadata === 'object' ? JSON.stringify(metadata) : (metadata || '')
    };

    try {
      const logsRef = window.db.ref(`auditLogs/${tokenId}`);
      if (typeof logsRef.push === 'function') {
        const newRef = logsRef.push();
        if (newRef && typeof newRef.set === 'function') {
          await newRef.set(logEntry);
        } else {
          await window.db.ref(`auditLogs/${tokenId}/${newRef.key}`).set(logEntry);
        }
      }
      console.log(`📜 [AuditLogger] Logged '${action}' for token ${tokenId}`);
      return logEntry;
    } catch (err) {
      console.error('[AuditLogger] Failed to write audit log:', err);
      return null;
    }
  },

  /**
   * Fetch all audit logs for a given tokenId sorted chronologically
   * @param {string} tokenId
   * @returns {Promise<Array>} Array of audit log entries
   */
  async getLogs(tokenId) {
    if (!tokenId) return [];
    try {
      const snap = await window.db.ref(`auditLogs/${tokenId}`).once('value');
      if (!snap.exists()) return [];
      const logs = [];
      snap.forEach(child => {
        const val = child.val();
        if (val) logs.push(val);
      });
      logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      return logs;
    } catch (err) {
      console.error('[AuditLogger] Failed to read audit logs:', err);
      return [];
    }
  }
};
