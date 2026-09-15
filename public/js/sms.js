/**
 * sms.js — SMS Caller via Firebase Cloud Functions
 * NEVER put SMS API keys here — they live only in Cloud Functions.
 */

/**
 * Calls the Firebase Cloud Function 'sendSMS' (HTTP callable).
 * @param {string} mobile  - 10-digit Indian mobile number
 * @param {string} message - SMS message text
 * @returns {Promise<{success: boolean, messageId?: string}>}
 */
async function callSendSMS(mobile, message) {
  // 1. Try local server endpoint POST /api/send-sms
  try {
    const localRes = await fetch('/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, message })
    });
    if (localRes.ok) {
      const data = await localRes.json();
      if (data.success) {
        console.log('[SMS Local Server] Sent successfully via Twilio:', data);
        return data;
      }
    }
  } catch (err) {
    console.warn('[SMS Local Server] Direct fetch failed, trying Firebase Callable:', err.message);
  }

  // 2. Fallback to Firebase Callable
  try {
    if (window.functions && typeof window.functions.httpsCallable === 'function') {
      const sendSMSFn = window.functions.httpsCallable('sendSMS');
      const result = await sendSMSFn({ mobile, message });
      console.log('[SMS Cloud Function] Sent successfully:', result.data);
      return result.data;
    }
  } catch (error) {
    console.error('[SMS] Cloud Function call failed:', error);
  }

  return { success: false, error: 'SMS dispatch failed' };
}


// SMS message templates
const SMSTemplates = {
  tokenConfirmation: (data) =>
    `Namaste ${data.farmerName}! Your Mandi Token ${data.tokenId} is confirmed for ${window.formatDateIST(data.date)} at ${data.timeSlot}. Track status: ${window.location.origin}/tracker.html?token=${data.tokenId}`,

  gateEntry: (tokenId) =>
    `Your Mandi token ${tokenId} has cleared Gate Entry. Please proceed to the Quality Check area.`,

  qualityCheck: (tokenId) =>
    `Quality Check passed for Mandi token ${tokenId}. Please move to Weighment area.`,

  weighment: (tokenId) =>
    `Your Mandi token ${tokenId} is at final Weighment stage. Your grain will be processed shortly. Thank you!`
};

// WhatsApp Sharing Helper
function getWhatsAppShareUrl(mobile, message) {
  const cleanMobile = String(mobile || '').replace(/\D/g, '');
  const formattedPhone = cleanMobile.length === 10 ? `91${cleanMobile}` : cleanMobile;
  return `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
}

function sendWhatsAppNotification(mobile, message) {
  const url = getWhatsAppShareUrl(mobile, message);
  window.open(url, '_blank', 'noopener,noreferrer');
}

// Expose globally
window.callSendSMS              = callSendSMS;
window.SMSTemplates             = SMSTemplates;
window.getWhatsAppShareUrl      = getWhatsAppShareUrl;
window.sendWhatsAppNotification = sendWhatsAppNotification;
