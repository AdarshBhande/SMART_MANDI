/**
 * offline.js — Module 5: Offline Support
 * Handles online/offline detection, LocalStorage caching,
 * and auto-sync of pending tokens when connection restores.
 */

const PENDING_TOKENS_KEY = 'pendingTokens';

/* ─────────────────────────────────────────────
   Toast Notification Helper
───────────────────────────────────────────── */
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: '✅',
    warning: '⚠️',
    error:   '❌',
    info:    'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { toast.classList.add('show'); });
  });

  // Auto-remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ─────────────────────────────────────────────
   Spinner Helper
───────────────────────────────────────────── */
function showSpinner() {
  const overlay = document.getElementById('spinner-overlay');
  if (overlay) overlay.classList.add('active');
}

function hideSpinner() {
  const overlay = document.getElementById('spinner-overlay');
  if (overlay) overlay.classList.remove('active');
}

/* ─────────────────────────────────────────────
   Offline Banner
───────────────────────────────────────────── */
function updateOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  if (navigator.onLine) {
    banner.classList.remove('show');
  } else {
    banner.classList.add('show');
  }
}

/* ─────────────────────────────────────────────
   Pending Tokens — LocalStorage
───────────────────────────────────────────── */
function getPendingTokens() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_TOKENS_KEY) || '[]');
  } catch {
    return [];
  }
}

function savePendingToken(tokenData) {
  const pending = getPendingTokens();
  pending.push(tokenData);
  localStorage.setItem(PENDING_TOKENS_KEY, JSON.stringify(pending));
}

function clearPendingTokens() {
  localStorage.removeItem(PENDING_TOKENS_KEY);
}

/* ─────────────────────────────────────────────
   Sync pending tokens to Firebase
───────────────────────────────────────────── */
async function syncPendingTokens() {
  const pending = getPendingTokens();
  if (!pending.length) return;

  showToast(`Syncing ${pending.length} offline token(s)…`, 'info');
  let successCount = 0;

  for (const tokenData of pending) {
    try {
      await window.db.ref(`tokens/${tokenData.tokenId}`).set(tokenData);
      // Trigger SMS via Cloud Function
      if (window.callSendSMS) {
        await window.callSendSMS(tokenData.mobile, buildConfirmationSMS(tokenData));
      }
      successCount++;
    } catch (err) {
      console.error('Sync failed for token:', tokenData.tokenId, err);
    }
  }

  clearPendingTokens();
  if (successCount > 0) {
    showToast(`✓ ${successCount} token(s) synced successfully!`, 'success');
  }
}

function buildConfirmationSMS(data) {
  return `Namaste ${data.farmerName}! Your Mandi Token ${data.tokenId} is confirmed for ${formatDateIST(data.date)} at ${data.timeSlot}. Track: ${window.location.origin}/tracker.html?token=${data.tokenId}`;
}

/* ─────────────────────────────────────────────
   IST Date/Time Helpers
───────────────────────────────────────────── */
function toISTString(date = new Date()) {
  return new Date(date.getTime() + 5.5 * 60 * 60 * 1000)
    .toISOString()
    .replace('Z', '+05:30');
}

function formatDateIST(isoDate) {
  // isoDate: "2026-09-06"
  const [y, m, d] = isoDate.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
}

function formatTimestampIST(isoString) {
  if (!isoString) return 'Awaiting...';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return isoString;
  }
}

function todayIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10); // YYYY-MM-DD
}

/* ─────────────────────────────────────────────
   Event Listeners — Init
───────────────────────────────────────────── */
function initOfflineSupport() {
  updateOfflineBanner();

  window.addEventListener('online', () => {
    updateOfflineBanner();
    showToast('Connection restored! Syncing offline data…', 'success');
    syncPendingTokens();
  });

  window.addEventListener('offline', () => {
    updateOfflineBanner();
    showToast('You are offline. Data will be saved locally.', 'warning');
  });
}

// Expose globally
window.showToast          = showToast;
window.showSpinner        = showSpinner;
window.hideSpinner        = hideSpinner;
window.savePendingToken   = savePendingToken;
window.getPendingTokens   = getPendingTokens;
window.toISTString        = toISTString;
window.formatDateIST      = formatDateIST;
window.formatTimestampIST = formatTimestampIST;
window.todayIST           = todayIST;
window.initOfflineSupport = initOfflineSupport;
