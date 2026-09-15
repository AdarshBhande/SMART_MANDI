/**
 * tracker.js — Module 2: Real-Time Token Status Tracker
 * Listens to Firebase for live updates, renders the 4-stage
 * progress bar, and computes estimated wait time.
 */

'use strict';

const STAGES_CONFIG = [
  { key: 'tokenIssued',  label: 'Token Issued',  iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="m9 12 2 2 4-4"/></svg>', desc: 'Token generated' },
  { key: 'gateEntry',   label: 'Gate Entry',    iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v15"/><path d="M19 12H5"/><path d="M14 8l5 4-5 4"/></svg>', desc: 'Vehicle checked in' },
  { key: 'qualityCheck',label: 'Quality Check', iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>', desc: 'Grain quality tested' },
  { key: 'weighment',   label: 'Weighment',     iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h18"/></svg>', desc: 'Final weight recorded' }
];

let activeListener = null;
let currentTokenRef = null;

/* ─────────────────────────────────────────────
   URL Query Param
───────────────────────────────────────────── */
function getTokenFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

/* ─────────────────────────────────────────────
   Stage State Calculator
───────────────────────────────────────────── */
function getStageStates(stages = {}, tokenData = {}) {
  const normStages = { ...stages };

  // Derivations from token status flags if stages object is incomplete
  if (tokenData.bookingStatus === 'confirmed' || tokenData.status || tokenData.createdAt) {
    if (!normStages.tokenIssued) normStages.tokenIssued = { completed: true, timestamp: tokenData.createdAt };
    else normStages.tokenIssued.completed = true;
  }

  if (['on_time', 'early', 'late'].includes(tokenData.arrivalStatus) || tokenData.checkInTimestamp || ['Gate Entry', 'Quality Check', 'Weighment', 'Completed'].includes(tokenData.status)) {
    if (!normStages.gateEntry) normStages.gateEntry = { completed: true, timestamp: tokenData.checkInTimestamp || tokenData.createdAt };
    else normStages.gateEntry.completed = true;
  }

  if (tokenData.qualityStatus === 'accepted' || tokenData.qualityStatus === 'rejected' || tokenData.qualityData || (tokenData.status === 'Quality Check' && tokenData.queueStatus === 'in_processing') || tokenData.status === 'Weighment' || tokenData.status === 'Completed') {
    if (!normStages.qualityCheck) normStages.qualityCheck = { completed: true, timestamp: (tokenData.qualityData ? tokenData.qualityData.timestamp : null) };
    else normStages.qualityCheck.completed = true;
  }

  if (tokenData.weighmentStatus === 'completed' || typeof tokenData.actualQuantityQtl === 'number' || tokenData.status === 'Weighment' || tokenData.status === 'Completed' || tokenData.procurementStatus === 'completed') {
    if (!normStages.weighment) normStages.weighment = { completed: true, timestamp: tokenData.weighmentTimestamp };
    else normStages.weighment.completed = true;
  }

  const keys = STAGES_CONFIG.map(s => s.key);
  let lastCompleted = -1;

  keys.forEach((key, i) => {
    if (normStages[key] && normStages[key].completed) lastCompleted = i;
  });

  return keys.map((key, i) => {
    const stage = normStages[key] || {};
    if (stage.completed) return 'completed';
    if (i === lastCompleted + 1) return 'in-progress';
    return 'pending';
  });
}

/* ─────────────────────────────────────────────
   Progress Line Fill %
───────────────────────────────────────────── */
function calcProgressPercent(stageStates) {
  const completedCount = stageStates.filter(s => s === 'completed').length;
  const total = stageStates.length;
  if (completedCount === 0) return 0;
  if (completedCount === total) return 100;
  return ((completedCount) / (total - 1)) * 100;
}

/* ─────────────────────────────────────────────
   Render Progress Track
───────────────────────────────────────────── */
function renderProgressTrack(stages, tokenData = {}) {
  const stageStates = getStageStates(stages, tokenData);
  const pct = calcProgressPercent(stageStates);

  // Fill line
  const lineFill = document.getElementById('progress-line-fill');
  if (lineFill) lineFill.style.width = `${pct}%`;

  // Stage circles
  stageStates.forEach((state, i) => {
    const circle = document.getElementById(`stage-circle-${i}`);
    const statusEl = document.getElementById(`stage-status-${i}`);
    const timeEl = document.getElementById(`stage-time-${i}`);
    const stageEl = document.getElementById(`stage-${i}`);

    if (!stageEl) return;

    stageEl.classList.remove('completed', 'in-progress', 'pending');
    stageEl.classList.add(state);

    if (circle) {
      const cfg = STAGES_CONFIG[i];
      if (state === 'completed') {
        circle.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
      } else if (state === 'in-progress') {
        circle.innerHTML = cfg.iconSvg;
      } else {
        circle.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      }
    }

    if (statusEl) {
      if (state === 'completed') statusEl.textContent = 'Completed';
      else if (state === 'in-progress') statusEl.textContent = 'In Progress';
      else statusEl.textContent = 'Awaiting...';
    }

    const stageKey = STAGES_CONFIG[i].key;
    const stageData = (stages && stages[stageKey]) ? stages[stageKey] : {};
    let ts = stageData.completed ? stageData.timestamp : null;

    if (!ts && state === 'completed') {
      if (stageKey === 'tokenIssued') ts = tokenData.createdAt;
      else if (stageKey === 'gateEntry') ts = tokenData.checkInTimestamp;
      else if (stageKey === 'qualityCheck') ts = tokenData.qualityData ? tokenData.qualityData.timestamp : null;
      else if (stageKey === 'weighment') ts = tokenData.weighmentTimestamp;
    }

    if (timeEl) {
      timeEl.textContent = ts ? window.formatTimestampIST(ts) : '';
    }

    if (stageEl) {
      stageEl.setAttribute('aria-label', `${STAGES_CONFIG[i].label}: ${state}`);
    }
  });
}

/* ─────────────────────────────────────────────
   Render Stage Detail Cards
───────────────────────────────────────────── */
function renderStageCards(stages, tokenData = {}) {
  const stageStates = getStageStates(stages, tokenData);

  stageStates.forEach((state, i) => {
    const card = document.getElementById(`stage-card-${i}`);
    if (!card) return;

    card.classList.remove('completed', 'in-progress', 'pending');
    card.classList.add(state);

    const statusEl = card.querySelector('.stage-detail-card__status');
    const timeEl   = card.querySelector('.stage-detail-card__time');

    if (statusEl) {
      const labels = { completed: 'Completed', 'in-progress': 'In Progress', pending: 'Pending' };
      statusEl.textContent = labels[state];
    }

    const stageKey = STAGES_CONFIG[i].key;
    const stageData = (stages && stages[stageKey]) ? stages[stageKey] : {};
    let ts = stageData.completed ? stageData.timestamp : null;

    if (!ts && state === 'completed') {
      if (stageKey === 'tokenIssued') ts = tokenData.createdAt;
      else if (stageKey === 'gateEntry') ts = tokenData.checkInTimestamp;
      else if (stageKey === 'qualityCheck') ts = tokenData.qualityData ? tokenData.qualityData.timestamp : null;
      else if (stageKey === 'weighment') ts = tokenData.weighmentTimestamp;
    }

    if (timeEl) {
      timeEl.textContent = ts ? window.formatTimestampIST(ts) : 'Awaiting...';
    }
  });
}

/* ─────────────────────────────────────────────
   Render Token Info
───────────────────────────────────────────── */
function renderTokenInfo(data) {
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '—';
  };

  setEl('info-token-id',  data.tokenId);
  setEl('info-farmer',    data.farmerName);
  setEl('info-mobile',    data.mobile ? data.mobile.replace(/(\d{5})(\d{5})/, '$1 $2') : '');
  setEl('info-crop',      data.cropType);
  setEl('info-quantity',  data.quantity ? `${data.quantity} Quintals` : '');
  setEl('info-date',      window.formatDateIST(data.date));
  setEl('info-time-slot', data.timeSlot);
  setEl('info-vehicle',   data.vehicleNumber || 'Not provided');
  setEl('info-status',    data.status);
  setEl('info-created',   window.formatTimestampIST(data.createdAt));

  // Header token ID
  const headerID = document.getElementById('header-token-id');
  if (headerID) headerID.textContent = data.tokenId;

  // Status badge color
  const statusBadge = document.getElementById('info-status');
  if (statusBadge) {
    statusBadge.className = 'badge ' + getStatusBadgeClass(data.status);
  }
}

function getStatusBadgeClass(status) {
  const map = {
    'Token Issued':  'badge--info',
    'Gate Entry':    'badge--warning',
    'Quality Check': 'badge--warning',
    'Weighment':     'badge--success',
    'Completed':     'badge--success'
  };
  return map[status] || 'badge--muted';
}

/* ─────────────────────────────────────────────
   Wait Time & Live Queue Position Estimation
───────────────────────────────────────────── */
async function estimateWaitTime(tokenData) {
  if (!tokenData.date || !tokenData.timeSlot || !tokenData.centerId) return;

  try {
    const centerId = tokenData.centerId;
    const date     = tokenData.date;
    const slot     = tokenData.timeSlot;

    // Fetch queue entry from /queues/{centerId}/{date}/{slot}
    const queueSnap = await window.db.ref(`queues/${centerId}/${date}/${slot}`).once('value');
    let myQueueEntry = null;

    if (queueSnap.exists()) {
      queueSnap.forEach(child => {
        const val = child.val();
        if (val && val.tokenId === tokenData.tokenId) {
          myQueueEntry = val;
        }
      });
    }

    const waitEl   = document.getElementById('wait-time-value');
    const waitCard = document.getElementById('wait-time-card');

    if (!waitEl) return;

    if (myQueueEntry) {
      const qStatus  = myQueueEntry.queueStatus;
      const position = myQueueEntry.position || 1;
      const station  = myQueueEntry.assignedStation || 'Weighbridge 1';

      if (qStatus === 'called') {
        waitEl.innerHTML = '<strong style="color:var(--color-warning);">You are next! Please proceed to gate.</strong>';
      } else if (qStatus === 'in_processing') {
        waitEl.innerHTML = `<strong style="color:var(--color-forest-ink);">Processing at ${station}</strong>`;
      } else if (qStatus === 'completed') {
        waitEl.innerHTML = '<strong style="color:var(--color-success);">Processing completed</strong>';
      } else if (qStatus === 'held') {
        waitEl.innerHTML = '<strong style="color:var(--color-warning);">Token currently on hold</strong>';
      } else if (qStatus === 'bypassed') {
        waitEl.innerHTML = '<strong style="color:var(--color-danger);">Token bypassed</strong>';
      } else {
        // Waiting status
        const estRes = await window.QueueEngine.calculateRollingWaitTime({
          centerId,
          date,
          timeSlot: slot,
          position
        });

        const aheadCount = Math.max(0, position - 1);
        if (aheadCount === 0) {
          waitEl.innerHTML = '<strong>Queue Position #1 — You are next!</strong>';
        } else {
          waitEl.innerHTML = `<strong>Queue Position #${position}</strong> &nbsp;|&nbsp; ~${estRes.estimatedWaitMins} min wait (${aheadCount} ahead)`;
        }
      }
    } else {
      // Fallback if not yet checked in
      waitEl.textContent = 'Gate check-in required to enter live queue';
    }

    if (waitCard) waitCard.style.display = '';
  } catch (err) {
    console.warn('Wait time estimate failed:', err);
  }
}

/* ─────────────────────────────────────────────
   Track Token by ID
───────────────────────────────────────────── */
function trackToken(tokenId) {
  if (!tokenId || !tokenId.trim()) {
    window.showToast('Please enter a Token ID', 'warning');
    return;
  }

  let raw = tokenId.trim();
  if (raw.includes('token=')) {
    raw = raw.split('token=')[1].split('&')[0];
  }
  const tid = raw.toUpperCase();

  // Detach old listener
  if (currentTokenRef && activeListener) {
    currentTokenRef.off('value', activeListener);
  }

  window.showSpinner();
  showState('loading');

  currentTokenRef = window.db.ref(`tokens/${tid}`);

  activeListener = currentTokenRef.on('value', (snapshot) => {
    window.hideSpinner();

    if (!snapshot.exists()) {
      showState('not-found');
      return;
    }

    const data = snapshot.val();
    showState('found');
    renderProgressTrack(data.stages || {}, data);
    renderStageCards(data.stages || {}, data);
    renderTokenInfo(data);
    estimateWaitTime(data);
  }, (error) => {
    window.hideSpinner();
    console.error('Firebase listener error:', error);
    showState('error');
    window.showToast('Failed to load token data. Please try again.', 'error');
  });
}

function showState(state) {
  document.getElementById('tracker-empty').style.display  = state === 'empty'     ? '' : 'none';
  document.getElementById('tracker-loading').style.display = state === 'loading'   ? '' : 'none';
  document.getElementById('tracker-found').style.display  = state === 'found'     ? '' : 'none';
  document.getElementById('tracker-not-found').style.display = state === 'not-found' ? '' : 'none';
  document.getElementById('tracker-error').style.display  = state === 'error'     ? '' : 'none';
}

/* ─────────────────────────────────────────────
   Init
───────────────────────────────────────────── */
function initTrackerPage() {
  // Build the static stage structure in the DOM
  buildStageUI();

  // Initial state
  showState('empty');

  // Search button
  const searchBtn = document.getElementById('track-search-btn');
  const searchInput = document.getElementById('track-token-input');

  if (searchBtn && searchInput) {
    searchBtn.addEventListener('click', () => trackToken(searchInput.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') trackToken(searchInput.value);
    });
  }

  // Auto-populate from URL
  const urlToken = getTokenFromURL();
  if (urlToken) {
    if (searchInput) searchInput.value = urlToken;
    trackToken(urlToken);
  }

  // Cleanup on navigate
  window.addEventListener('beforeunload', () => {
    if (currentTokenRef && activeListener) {
      currentTokenRef.off('value', activeListener);
    }
  });
}

function buildStageUI() {
  // Progress track circles
  STAGES_CONFIG.forEach((stage, i) => {
    const stageEl = document.getElementById(`stage-${i}`);
    if (stageEl) {
      stageEl.setAttribute('role', 'listitem');
      stageEl.setAttribute('aria-label', `${stage.label}: pending`);
    }
  });

  // Stage detail cards
  STAGES_CONFIG.forEach((stage, i) => {
    const card = document.getElementById(`stage-card-${i}`);
    if (card) {
      const iconEl = card.querySelector('.stage-detail-card__icon');
      const nameEl = card.querySelector('.stage-detail-card__name');
      if (iconEl) iconEl.innerHTML = stage.iconSvg;
      if (nameEl) nameEl.textContent = stage.label;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  window.initOfflineSupport();
  initTrackerPage();
});
