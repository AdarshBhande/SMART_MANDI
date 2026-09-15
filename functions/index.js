/**
 * Firebase Cloud Functions — Smart Mandi Token System
 * Module 4: SMS notifications via Fast2SMS (with Twilio fallback)
 *
 * NEVER expose SMS API keys in client-side code.
 * All keys are stored in Firebase environment config:
 *   firebase functions:config:set fast2sms.key="YOUR_KEY" twilio.sid="SID" twilio.token="TOKEN" twilio.from="+1234567890"
 */

'use strict';

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const fetch     = globalThis.fetch || (async (...args) => (await import('node-fetch')).default(...args));

admin.initializeApp();
const db = admin.database();

/* ─────────────────────────────────────────────
   Constants
───────────────────────────────────────────── */
const MAX_TOKENS_PER_MOBILE_PER_DAY = 5;

/* ─────────────────────────────────────────────
   Utility: Format ISO date to human-readable
───────────────────────────────────────────── */
function formatDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
}

/* ─────────────────────────────────────────────
   Core SMS Sender — Fast2SMS with Twilio fallback
───────────────────────────────────────────── */
async function sendViaSMS(mobile, message) {
  const config = functions.config();

  // ── Attempt 1: Fast2SMS ──
  try {
    const fast2smsKey = config.fast2sms && config.fast2sms.key;
    if (!fast2smsKey) throw new Error('Fast2SMS key not configured');

    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': fast2smsKey,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        route:      'v3',
        sender_id:  'MNDISYS',
        message,
        language:   'english',
        flash:      0,
        numbers:    mobile
      })
    });

    const data = await response.json();
    if (data.return === true) {
      console.log(`[SMS Fast2SMS] Sent to ${mobile}:`, data.request_id);
      return { success: true, provider: 'fast2sms', messageId: data.request_id };
    }
    throw new Error(`Fast2SMS error: ${JSON.stringify(data)}`);

  } catch (fast2smsErr) {
    console.warn('[SMS Fast2SMS] Failed, trying Twilio:', fast2smsErr.message);

    // ── Attempt 2: Twilio Fallback ──
    try {
      const twilioSid   = config.twilio && config.twilio.sid;
      const twilioToken = config.twilio && config.twilio.token;
      const twilioFrom  = config.twilio && config.twilio.from;

      if (!twilioSid || !twilioToken || !twilioFrom) {
        throw new Error('Twilio credentials not configured');
      }

      const basicAuth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const twilioBody = new URLSearchParams({
        To:   `+91${mobile}`,
        From: twilioFrom,
        Body: message
      });

      const twilioResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method:  'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type':  'application/x-www-form-urlencoded'
          },
          body: twilioBody
        }
      );

      const twilioData = await twilioResp.json();
      if (twilioData.sid) {
        console.log(`[SMS Twilio] Sent to ${mobile}:`, twilioData.sid);
        return { success: true, provider: 'twilio', messageId: twilioData.sid };
      }
      throw new Error(`Twilio error: ${JSON.stringify(twilioData)}`);

    } catch (twilioErr) {
      console.error('[SMS Twilio] Also failed:', twilioErr.message);
      return { success: false, error: twilioErr.message };
    }
  }
}

/* ─────────────────────────────────────────────
   FUNCTION 1: onTokenCreate
   Trigger: When new token is written to /tokens/{tokenId}
───────────────────────────────────────────── */
exports.onTokenCreate = functions
  .region('asia-south1')
  .database.ref('/tokens/{tokenId}')
  .onCreate(async (snapshot, context) => {
    const token   = snapshot.val();
    const tokenId = context.params.tokenId;

    if (!token || !token.mobile) {
      console.warn('[onTokenCreate] Missing mobile for token:', tokenId);
      return null;
    }

    const appUrl = `https://${process.env.GCLOUD_PROJECT}.web.app`;
    const message = `Namaste ${token.farmerName}! Your Mandi Token ${token.tokenId} is confirmed for ${formatDate(token.date)} at ${token.timeSlot}. Track status: ${appUrl}/tracker.html?token=${token.tokenId}`;

    console.log(`[onTokenCreate] Sending confirmation SMS for ${token.tokenId}`);
    const result = await sendViaSMS(token.mobile, message);
    console.log('[onTokenCreate] SMS result:', result);
    return result;
  });

/* ─────────────────────────────────────────────
   FUNCTION 2: onStageUpdate
   Trigger: When stages node is updated for a token
───────────────────────────────────────────── */
exports.onStageUpdate = functions
  .region('asia-south1')
  .database.ref('/tokens/{tokenId}/stages')
  .onUpdate(async (change, context) => {
    const tokenId = context.params.tokenId;
    const before  = change.before.val() || {};
    const after   = change.after.val()  || {};

    // Detect which stage just became completed=true
    let newlyCompletedStage = null;
    const stageOrder = ['gateEntry', 'qualityCheck', 'weighment'];

    for (const stage of stageOrder) {
      const wasFalse  = !before[stage] || !before[stage].completed;
      const isNowTrue = after[stage] && after[stage].completed;
      if (wasFalse && isNowTrue) {
        newlyCompletedStage = stage;
        break;
      }
    }

    if (!newlyCompletedStage) {
      console.log('[onStageUpdate] No newly completed stage detected');
      return null;
    }

    // Fetch full token data
    const tokenSnap = await db.ref(`/tokens/${tokenId}`).once('value');
    const token     = tokenSnap.val();

    if (!token || !token.mobile) {
      console.warn('[onStageUpdate] Could not fetch token data for:', tokenId);
      return null;
    }

    // Build stage-specific SMS
    const smsMessages = {
      gateEntry:    `Your Mandi token ${token.tokenId} has cleared Gate Entry. Please proceed to the Quality Check area.`,
      qualityCheck: `Quality Check passed for Mandi token ${token.tokenId}. Please move to the Weighment area.`,
      weighment:    `Your Mandi token ${token.tokenId} is at final Weighment stage. Your grain will be processed shortly. Thank you for using Smart Mandi!`
    };

    const message = smsMessages[newlyCompletedStage];
    console.log(`[onStageUpdate] Stage ${newlyCompletedStage} completed for ${tokenId}. Sending SMS.`);
    const result = await sendViaSMS(token.mobile, message);
    console.log('[onStageUpdate] SMS result:', result);
    return result;
  });

/* ─────────────────────────────────────────────
   FUNCTION 3: sendSMS (HTTP Callable)
   Called by client via firebase.functions().httpsCallable('sendSMS')
───────────────────────────────────────────── */
exports.sendSMS = functions
  .region('asia-south1')
  .https.onCall(async (data, context) => {
    const { mobile, message } = data;

    if (!mobile || !message) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Both mobile and message are required.'
      );
    }

    // Validate Indian mobile number
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid Indian mobile number.'
      );
    }

    // Rate limit: max 5 tokens per mobile per day
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const tokensSnap = await db.ref('tokens')
      .orderByChild('mobile')
      .equalTo(mobile)
      .once('value');

    let todayCount = 0;
    if (tokensSnap.exists()) {
      tokensSnap.forEach(child => {
        if (child.val().date === today) todayCount++;
      });
    }

    if (todayCount > MAX_TOKENS_PER_MOBILE_PER_DAY) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        `Maximum ${MAX_TOKENS_PER_MOBILE_PER_DAY} tokens per mobile per day reached.`
      );
    }

    const result = await sendViaSMS(mobile, message);
    return result;
  });
