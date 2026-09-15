/**
 * admin.js — 11-Module Operational Control Dashboard Architecture
 * Smart Mandi Paddy Procurement Control System
 */

'use strict';

/* ─────────────────────────────────────────────
   State Management & Globals
───────────────────────────────────────────── */
let activeRole        = 'Admin'; // 'Admin' | 'Operator'
let currentModule     = 'overview';
let allTokens         = {}; // { tokenId: tokenData }
let allCenters        = {}; // { centerId: centerData }
let globalSettings    = {
  slotDurationMins: 120,
  maxFarmersPerSlot: 10,
  maxQuantityPerSlot: 500,
  activeWeighbridges: 3,
  gracePeriodMins: 15,
  noShowThresholdMins: 60,
  moistureThresholdPercent: 14.0,
  foreignMatterThresholdPercent: 2.0,
  mspRatePerQtl: 2300
};

let tokensListener    = null;
let centersListener   = null;
let tokensRef         = null;
let centersRef        = null;

/* ─────────────────────────────────────────────
   Auth & Initialization
───────────────────────────────────────────── */
window.switchAuthTab = function(mode) {
  const loginForm    = document.getElementById('login-form');
  const signupForm   = document.getElementById('signup-form');
  const forgotForm   = document.getElementById('forgot-form');
  const tabSignin    = document.getElementById('tab-signin');
  const tabSignup    = document.getElementById('tab-signup');
  const titleEl      = document.getElementById('auth-card-title');
  const subtitleEl   = document.getElementById('auth-card-subtitle');
  const loginError   = document.getElementById('login-error');
  const loginSuccess = document.getElementById('login-success');

  if (loginError) { loginError.classList.remove('show'); loginError.textContent = ''; }
  if (loginSuccess) { loginSuccess.style.display = 'none'; loginSuccess.textContent = ''; }

  if (mode === 'signin') {
    if (loginForm) loginForm.style.display = 'block';
    if (signupForm) signupForm.style.display = 'none';
    if (forgotForm) forgotForm.style.display = 'none';
    if (tabSignin) tabSignin.classList.add('active');
    if (tabSignup) tabSignup.classList.remove('active');
    if (titleEl) titleEl.textContent = 'Mandi Official Portal';
    if (subtitleEl) subtitleEl.textContent = '11-Module Operational Control Workspace';
  } else if (mode === 'signup') {
    if (loginForm) loginForm.style.display = 'none';
    if (signupForm) signupForm.style.display = 'block';
    if (forgotForm) forgotForm.style.display = 'none';
    if (tabSignin) tabSignin.classList.remove('active');
    if (tabSignup) tabSignup.classList.add('active');
    if (titleEl) titleEl.textContent = 'Create Official Account';
    if (subtitleEl) subtitleEl.textContent = 'Sign up for Mandi Official Authentication';
  } else if (mode === 'forgot') {
    if (loginForm) loginForm.style.display = 'none';
    if (signupForm) signupForm.style.display = 'none';
    if (forgotForm) forgotForm.style.display = 'block';
    if (tabSignin) tabSignin.classList.remove('active');
    if (tabSignup) tabSignup.classList.remove('active');
    if (titleEl) titleEl.textContent = 'Reset Password';
    if (subtitleEl) subtitleEl.textContent = 'Account Recovery Link';
  }
};

function initAuth() {
  const loginForm  = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const forgotForm = document.getElementById('forgot-form');
  const loginError = document.getElementById('login-error');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email    = document.getElementById('admin-email').value.trim();
      const password = document.getElementById('admin-password').value;
      if (loginError) loginError.classList.remove('show');

      const loginBtn = document.getElementById('login-btn');
      loginBtn.disabled = true;
      loginBtn.textContent = 'Signing in…';

      try {
        await window.auth.signInWithEmailAndPassword(email, password);
      } catch (err) {
        if (loginError) {
          loginError.textContent = getFriendlyAuthError(err.code);
          loginError.classList.add('show');
        }
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email    = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      if (loginError) loginError.classList.remove('show');

      const signupBtn = document.getElementById('signup-btn');
      signupBtn.disabled = true;
      signupBtn.textContent = 'Creating Account…';

      try {
        await window.auth.createUserWithEmailAndPassword(email, password);
        window.showToast(`Account created for ${email}`, 'success');
      } catch (err) {
        if (loginError) {
          loginError.textContent = getFriendlyAuthError(err.code);
          loginError.classList.add('show');
        }
        signupBtn.disabled = false;
        signupBtn.textContent = 'Create Account';
      }
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value.trim();
      try {
        await window.auth.sendPasswordResetEmail(email);
        window.showToast(`Password reset link sent to ${email}`, 'success');
      } catch (err) {
        if (loginError) {
          loginError.textContent = getFriendlyAuthError(err.code);
          loginError.classList.add('show');
        }
      }
    });
  }

  window.auth.onAuthStateChanged((user) => {
    const loginPage   = document.getElementById('login-page');
    const adminLayout = document.getElementById('admin-layout');
    const userEmailEl = document.getElementById('admin-user-email');

    if (user) {
      if (loginPage) loginPage.style.display = 'none';
      if (adminLayout) adminLayout.classList.add('show');
      if (userEmailEl) userEmailEl.textContent = user.email;
      initDashboard();
    } else {
      if (loginPage) loginPage.style.display = 'flex';
      if (adminLayout) adminLayout.classList.remove('show');
      teardownDashboard();
    }
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await window.auth.signOut();
    });
  }
}

function getFriendlyAuthError(code) {
  const messages = {
    'auth/user-not-found':        'No account found with this email.',
    'auth/wrong-password':        'Incorrect password. Please try again.',
    'auth/invalid-email':         'Invalid email address format.',
    'auth/email-already-in-use':  'An account already exists with this email address.',
    'auth/weak-password':         'Password should be at least 6 characters.',
    'auth/too-many-requests':     'Too many attempts. Please try again later.'
  };
  return messages[code] || 'Authentication error. Please try again.';
}

/* ─────────────────────────────────────────────
   Role & Navigation Handler
───────────────────────────────────────────── */
function initRoleSelector() {
  const roleSelect = document.getElementById('role-select');
  if (roleSelect) {
    roleSelect.value = activeRole;
    roleSelect.addEventListener('change', (e) => {
      activeRole = e.target.value;
      applyRolePermissions();
      window.showToast(`Switched active role to ${activeRole}`, 'info');
    });
  }
}

function applyRolePermissions() {
  const adminOnlyTabs = document.querySelectorAll('.nav-tab.admin-only');
  adminOnlyTabs.forEach(tab => {
    if (activeRole === 'Operator') {
      tab.classList.add('hidden-by-role');
    } else {
      tab.classList.remove('hidden-by-role');
    }
  });

  // If Operator is on an admin-only module, force switch back to Overview
  const adminModules = ['centers', 'analytics', 'forecast', 'settings'];
  if (activeRole === 'Operator' && adminModules.includes(currentModule)) {
    switchModule('overview');
  }
}

function initNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab');
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetModule = tab.getAttribute('data-module');
      switchModule(targetModule);
    });
  });
}

function switchModule(moduleName) {
  const adminModules = ['centers', 'analytics', 'forecast', 'settings'];
  if (activeRole === 'Operator' && adminModules.includes(moduleName)) {
    window.showToast(`Access Denied: ${moduleName.toUpperCase()} requires Admin privileges`, 'error');
    return;
  }

  currentModule = moduleName;

  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.nav-tab[data-module="${moduleName}"]`);
  if (activeTab) activeTab.classList.add('active');

  document.querySelectorAll('.admin-module').forEach(m => m.classList.remove('active'));
  const activeSection = document.getElementById(`module-${moduleName}`);
  if (activeSection) activeSection.classList.add('active');

  renderCurrentModule();
}

function renderCurrentModule() {
  switch (currentModule) {
    case 'overview':
      renderOverviewModule();
      break;
    case 'centers':
      renderCentersModule();
      break;
    case 'appointments':
      renderAppointmentsModule();
      break;
    case 'checkin':
      renderCheckinModule();
      break;
    case 'queue':
      renderQueueModule();
      break;
    case 'weighment':
      renderWeighmentModule();
      break;
    case 'quality':
      renderQualityModule();
      break;
    case 'payments':
      renderPaymentsModule();
      break;
    case 'analytics':
      renderAnalyticsModule();
      break;
    case 'forecast':
      renderForecastModule();
      break;
    case 'settings':
      renderSettingsModule();
      break;
  }
}

/* ─────────────────────────────────────────────
   Firebase Realtime Listeners
───────────────────────────────────────────── */
function initDashboard() {
  initRoleSelector();
  initNavigation();
  initModals();
  initModuleFilterListeners();

  // Listen to /centers
  centersRef = window.db.ref('centers');
  centersListener = centersRef.on('value', (snapshot) => {
    allCenters = {};
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        allCenters[child.key] = child.val();
      });
    }
    populateCenterDropdowns();
    renderCurrentModule();
  });

  // Listen to /tokens
  tokensRef = window.db.ref('tokens');
  tokensListener = tokensRef.on('value', (snapshot) => {
    allTokens = {};
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const val = child.val();
        allTokens[child.key] = window.migrateLegacyToken ? window.migrateLegacyToken(val) : val;
      });
    }
    renderCurrentModule();
  });
}

function teardownDashboard() {
  if (tokensRef && tokensListener) tokensRef.off('value', tokensListener);
  if (centersRef && centersListener) centersRef.off('value', centersListener);
  allTokens = {};
  allCenters = {};
}

function populateCenterDropdowns() {
  const centersArr = Object.values(allCenters);

  // App Center Filter
  const appSelect = document.getElementById('app-filter-center');
  if (appSelect) {
    const curr = appSelect.value;
    appSelect.innerHTML = '<option value="all">All Centers</option>' +
      centersArr.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
    appSelect.value = curr || 'all';
  }

  // Queue Center Select
  const queueSelect = document.getElementById('queue-center-select');
  if (queueSelect) {
    const curr = queueSelect.value;
    queueSelect.innerHTML = centersArr.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
    queueSelect.value = curr || (centersArr[0] ? centersArr[0].id : '');
  }

  // Create Token Center Select
  const ctSelect = document.getElementById('ct-center-select');
  if (ctSelect) {
    ctSelect.innerHTML = centersArr.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
  }

  // Analytics Select
  const anSelect = document.getElementById('analytics-center-select');
  if (anSelect) {
    const curr = anSelect.value;
    anSelect.innerHTML = '<option value="all">All Centers</option>' +
      centersArr.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
    anSelect.value = curr || 'all';
  }
}

/* ─────────────────────────────────────────────
   MODULE 1: OVERVIEW MODULE
───────────────────────────────────────────── */
function renderOverviewModule() {
  const tokens = Object.values(allTokens);
  const total = tokens.length;

  let confirmed = 0;
  let checkedin = 0;
  let waiting = 0;
  let processing = 0;
  let completed = 0;
  let noshow = 0;
  let cancelled = 0;
  let totalScheduledQty = 0;
  let totalProcessedQty = 0;

  tokens.forEach(t => {
    if (t.bookingStatus === 'confirmed') confirmed++;
    if (t.bookingStatus === 'cancelled') cancelled++;

    if (['on_time', 'early', 'late'].includes(t.arrivalStatus)) checkedin++;
    if (t.arrivalStatus === 'no_show') noshow++;

    if (t.queueStatus === 'waiting') waiting++;
    if (['called', 'in_processing'].includes(t.queueStatus) || t.qualityStatus === 'in_progress' || t.weighmentStatus === 'in_progress') processing++;

    if (t.procurementStatus === 'completed') completed++;

    const est = typeof t.estimatedQuantityQtl === 'number' ? t.estimatedQuantityQtl : (parseFloat(t.quantity) || 0);
    totalScheduledQty += est;

    if (t.weighmentStatus === 'completed' && typeof t.actualQuantityQtl === 'number') {
      totalProcessedQty += t.actualQuantityQtl;
    }
  });

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setEl('stat-ov-total', total);
  setEl('stat-ov-confirmed', confirmed);
  setEl('stat-ov-checkedin', checkedin);
  setEl('stat-ov-waiting', waiting);
  setEl('stat-ov-processing', processing);
  setEl('stat-ov-completed', completed);
  setEl('stat-ov-noshow', `${noshow} / ${cancelled}`);
  setEl('stat-ov-paddy-qty', `${totalProcessedQty.toFixed(1)} / ${totalScheduledQty.toFixed(1)} Qtl`);

  // Render Operational Alerts
  const alertsContainer = document.getElementById('overview-alerts-container');
  if (alertsContainer) {
    const alerts = [];
    Object.values(allCenters).forEach(c => {
      if (c.operationalStatus === 'equipment_issue') {
        alerts.push(`<div class="alert alert--danger">⚠️ Equipment issue reported at <strong>${escHtml(c.name)}</strong>. Weighbridge scale offline.</div>`);
      }
      if (c.operationalStatus === 'full') {
        alerts.push(`<div class="alert alert--warning">🚨 Center <strong>${escHtml(c.name)}</strong> has reached maximum capacity utilization.</div>`);
      }
      if (c.operationalStatus === 'paused') {
        alerts.push(`<div class="alert alert--warning">⏸️ Center <strong>${escHtml(c.name)}</strong> operations temporarily paused.</div>`);
      }
    });

    if (waiting > 10) {
      alerts.push(`<div class="alert alert--warning">⏳ Unusually long queue detected (${waiting} farmers waiting). Consider opening additional weighbridges.</div>`);
    }

    if (alerts.length === 0) {
      alertsContainer.innerHTML = '<div class="alert alert--success">✅ All procurement centers operating normally. No queue bottlenecks detected.</div>';
    } else {
      alertsContainer.innerHTML = alerts.join('');
    }
  }

  // Render Center Summary Table
  const tbody = document.getElementById('overview-centers-tbody');
  if (tbody) {
    const centersArr = Object.values(allCenters);
    if (!centersArr.length) {
      tbody.innerHTML = '<tr><td colspan="7">No centers configured</td></tr>';
      return;
    }

    tbody.innerHTML = centersArr.map(c => {
      const centerTokens = tokens.filter(t => t.centerId === c.id);
      const bookedCount = centerTokens.length;
      const maxFarmers = c.maxFarmersPerSlot || 10;
      const utilPct = Math.min(100, Math.round((bookedCount / maxFarmers) * 100));

      return `
        <tr>
          <td><strong>${escHtml(c.name)}</strong></td>
          <td>${escHtml(c.district || 'Ludhiana')}</td>
          <td><span class="badge ${getStatusBadgeClass(c.operationalStatus)}">${escHtml(c.operationalStatus)}</span></td>
          <td>${c.activeWeighbridges || 1} active</td>
          <td>${c.maxFarmersPerSlot || 10}</td>
          <td>${c.maxQuantityPerSlot || 500} Qtl</td>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="flex:1; background:var(--color-cloud); height:8px; border-radius:4px; overflow:hidden;">
                <div style="width:${utilPct}%; height:100%; background:${utilPct > 80 ? '#d93838' : 'var(--color-forest-ink)'};"></div>
              </div>
              <span style="font-size:var(--text-caption); font-weight:600;">${utilPct}%</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
}

/* ─────────────────────────────────────────────
   MODULE 2: CENTERS MODULE (Admin Only)
───────────────────────────────────────────── */
function renderCentersModule() {
  const tbody = document.getElementById('centers-table-body');
  if (!tbody) return;

  const centersArr = Object.values(allCenters);
  if (!centersArr.length) {
    tbody.innerHTML = '<tr><td colspan="9">No centers found in /centers schema.</td></tr>';
    return;
  }

  tbody.innerHTML = centersArr.map(c => `
    <tr>
      <td><span class="token-id-cell">${c.id}</span></td>
      <td>
        <strong>${escHtml(c.name)}</strong>
        <div style="font-size:var(--text-caption); color:var(--color-fog);">${escHtml(c.address)}</div>
      </td>
      <td>${escHtml(c.district)}</td>
      <td><span class="badge ${getStatusBadgeClass(c.operationalStatus)}">${escHtml(c.operationalStatus)}</span></td>
      <td>${c.workingHours ? `${c.workingHours.start} – ${c.workingHours.end}` : '06:00 – 18:00'}</td>
      <td>${c.maxFarmersPerSlot || 10} / ${c.maxQuantityPerSlot || 500} Qtl</td>
      <td>${c.activeWeighbridges || 1} Stations</td>
      <td>${c.avgProcessingTimeMins || 12} mins</td>
      <td>
        <button class="btn btn--outline btn--sm edit-center-btn" data-center-id="${c.id}">
          Edit Status & Config
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.edit-center-btn').forEach(btn => {
    btn.addEventListener('click', () => openCenterModal(btn.getAttribute('data-center-id')));
  });
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'active': return 'badge--success';
    case 'busy': return 'badge--info';
    case 'full': return 'badge--warning';
    case 'paused': return 'badge--warning';
    case 'closed': return 'badge--danger';
    case 'equipment_issue': return 'badge--danger';
    default: return 'badge--muted';
  }
}

/* ─────────────────────────────────────────────
   MODULE 3: APPOINTMENTS MODULE
───────────────────────────────────────────── */
function renderAppointmentsModule() {
  const tbody = document.getElementById('appointments-tbody');
  const emptyEl = document.getElementById('appointments-empty');
  if (!tbody) return;

  const centerFilter  = document.getElementById('app-filter-center')?.value || 'all';
  const dateFilter    = document.getElementById('app-filter-date')?.value || '';
  const bookingFilter = document.getElementById('app-filter-booking')?.value || 'all';
  const arrivalFilter = document.getElementById('app-filter-arrival')?.value || 'all';
  const searchQuery  = document.getElementById('appointments-search')?.value.toLowerCase().trim() || '';

  let tokens = Object.values(allTokens);

  tokens = tokens.filter(t => {
    if (centerFilter !== 'all' && t.centerId !== centerFilter) return false;
    if (dateFilter && t.date !== dateFilter) return false;
    if (bookingFilter !== 'all' && t.bookingStatus !== bookingFilter) return false;
    if (arrivalFilter !== 'all' && t.arrivalStatus !== arrivalFilter) return false;

    if (searchQuery) {
      const matchId = t.tokenId?.toLowerCase().includes(searchQuery);
      const matchName = t.farmerName?.toLowerCase().includes(searchQuery);
      const matchMob = t.mobile?.includes(searchQuery);
      if (!matchId && !matchName && !matchMob) return false;
    }
    return true;
  });

  if (!tokens.length) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  tbody.innerHTML = tokens.map(t => `
    <tr>
      <td><span class="token-id-cell">${t.tokenId}</span></td>
      <td><strong>${escHtml(t.farmerName)}</strong><div style="font-size:11px;color:var(--color-fog);">${escHtml(t.mobile)}</div></td>
      <td>${escHtml(t.centerName || t.centerId)}</td>
      <td>${t.date}<br/><span class="badge badge--muted">${t.timeSlot}</span></td>
      <td>${t.estimatedQuantityQtl || t.quantity} Qtl</td>
      <td><span class="badge ${t.bookingStatus === 'confirmed' ? 'badge--success' : 'badge--danger'}">${t.bookingStatus}</span></td>
      <td><span class="badge badge--info">${t.arrivalStatus}</span></td>
      <td><span class="badge badge--muted">${t.queueStatus}</span></td>
      <td><span class="badge ${getQualityBadgeClass(t.qualityStatus)}">${t.qualityStatus}</span></td>
      <td><span class="badge ${getPaymentBadgeClass(t.paymentStatus)}">${t.paymentStatus}</span></td>
      <td>
        <button class="btn btn--outline btn--sm view-details-btn" data-token-id="${t.tokenId}">Details</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.view-details-btn').forEach(btn => {
    btn.addEventListener('click', () => openDetailsModal(btn.getAttribute('data-token-id')));
  });
}

function getQualityBadgeClass(q) {
  if (q === 'accepted') return 'badge--success';
  if (q === 'needs_review') return 'badge--warning';
  if (q === 'rejected') return 'badge--danger';
  return 'badge--muted';
}

function getPaymentBadgeClass(p) {
  if (p === 'completed') return 'badge--success';
  if (p === 'failed') return 'badge--danger';
  if (['approved', 'initiated', 'processing'].includes(p)) return 'badge--info';
  return 'badge--muted';
}

/* ─────────────────────────────────────────────
   MODULE 4: GATE CHECK-IN MODULE
───────────────────────────────────────────── */
let activeCheckinToken = null;

function renderCheckinModule() {
  const findBtn = document.getElementById('checkin-find-btn');
  const inputEl = document.getElementById('checkin-token-input');
  if (findBtn && !findBtn.dataset.bound) {
    findBtn.dataset.bound = 'true';
    findBtn.addEventListener('click', handleCheckinSearch);
  }

  const confirmBtn = document.getElementById('ci-confirm-checkin-btn');
  if (confirmBtn && !confirmBtn.dataset.bound) {
    confirmBtn.dataset.bound = 'true';
    confirmBtn.addEventListener('click', handleConfirmCheckin);
  }

  const noshowBtn = document.getElementById('ci-mark-noshow-btn');
  if (noshowBtn && !noshowBtn.dataset.bound) {
    noshowBtn.dataset.bound = 'true';
    noshowBtn.addEventListener('click', handleMarkNoShow);
  }

  renderCheckinRecentTable();
}

function calculateArrivalClassification(token, checkinTimeMs = Date.now()) {
  if (!token || !token.timeSlot || !token.date) return 'on_time';

  const center = allCenters[token.centerId] || {};
  const graceMins = center.gracePeriodMins || globalSettings.gracePeriodMins;
  const noShowMins = center.noShowThresholdMins || globalSettings.noShowThresholdMins;

  // Parse slot time e.g. "8AM-10AM" -> start 08:00, end 10:00
  const slotMap = {
    '6AM-8AM': { start: 6, end: 8 },
    '8AM-10AM': { start: 8, end: 10 },
    '10AM-12PM': { start: 10, end: 12 },
    '12PM-2PM': { start: 12, end: 14 },
    '2PM-4PM': { start: 14, end: 16 },
    '4PM-6PM': { start: 16, end: 18 }
  };

  const hours = slotMap[token.timeSlot] || { start: 8, end: 10 };
  const slotStartDate = new Date(`${token.date}T${String(hours.start).padStart(2, '0')}:00:00`);
  const slotEndDate   = new Date(`${token.date}T${String(hours.end).padStart(2, '0')}:00:00`);

  const earlyBufferMs = slotStartDate.getTime() - (15 * 60 * 1000);
  const graceExpireMs = slotEndDate.getTime() + (graceMins * 60 * 1000);
  const noShowExpireMs = slotEndDate.getTime() + (noShowMins * 60 * 1000);

  if (checkinTimeMs < earlyBufferMs) return 'early';
  if (checkinTimeMs <= graceExpireMs) return 'on_time';
  if (checkinTimeMs <= noShowExpireMs) return 'late';
  return 'no_show';
}

function handleCheckinSearch() {
  const query = document.getElementById('checkin-token-input').value.trim();
  if (!query) {
    window.showToast('Enter Token ID or Mobile Number', 'error');
    return;
  }

  const token = Object.values(allTokens).find(t =>
    t.tokenId?.toLowerCase() === query.toLowerCase() || t.mobile === query
  );

  const container = document.getElementById('checkin-card-container');
  if (!token) {
    window.showToast('Token not found in system', 'error');
    if (container) container.style.display = 'none';
    activeCheckinToken = null;
    return;
  }

  if (token.bookingStatus === 'cancelled') {
    window.showToast('Cannot check in a CANCELLED booking', 'error');
    if (container) container.style.display = 'none';
    activeCheckinToken = null;
    return;
  }

  activeCheckinToken = token;
  const classification = calculateArrivalClassification(token);

  document.getElementById('ci-token-id').textContent = token.tokenId;
  document.getElementById('ci-farmer-name').textContent = token.farmerName;
  document.getElementById('ci-mobile').textContent = token.mobile;
  document.getElementById('ci-crop').textContent = token.cropType;
  document.getElementById('ci-qty').textContent = `${token.estimatedQuantityQtl || token.quantity} Qtl`;
  document.getElementById('ci-center').textContent = token.centerName || token.centerId;
  document.getElementById('ci-slot').textContent = token.timeSlot;
  document.getElementById('ci-date').textContent = token.date;

  const classEl = document.getElementById('ci-arrival-classification');
  if (classEl) {
    classEl.innerHTML = `<span class="badge ${classification === 'on_time' ? 'badge--success' : (classification === 'early' ? 'badge--info' : 'badge--warning')}">${classification.toUpperCase()}</span>`;
  }

  if (container) container.style.display = 'block';
}

async function handleConfirmCheckin() {
  if (!activeCheckinToken) return;

  const tokenId = activeCheckinToken.tokenId;
  const classification = calculateArrivalClassification(activeCheckinToken);
  const now = new Date().toISOString();

  // Check-In Safety Check (Idempotency: prevent double check-in)
  if (activeCheckinToken.arrivalStatus !== 'pending' && activeCheckinToken.arrivalStatus !== 'no_show') {
    window.showToast(`Farmer already checked in (${activeCheckinToken.arrivalStatus})`, 'info');
    return;
  }

  try {
    window.showSpinner();
    const updates = {
      arrivalStatus: classification,
      queueStatus: 'waiting',
      checkInTimestamp: now,
      status: 'Gate Entry',
      'stages/gateEntry': { completed: true, timestamp: now }
    };

    await window.db.ref(`tokens/${tokenId}`).update(updates);

    // Create dedicated queue entry via QueueEngine
    await window.QueueEngine.createQueueEntry({
      tokenId,
      centerId: activeCheckinToken.centerId || 'center-ludhiana-01',
      date: activeCheckinToken.date,
      timeSlot: activeCheckinToken.timeSlot,
      checkInTime: now
    });

    // Audit event
    await window.AuditLogger.logEvent({
      tokenId,
      actorId: window.auth.currentUser?.email || 'operator',
      actorRole: activeRole,
      action: classification === 'late' ? 'FARMER_MARKED_LATE' : 'FARMER_CHECKED_IN',
      fromState: 'pending',
      toState: classification,
      metadata: { checkInTimestamp: now, classification }
    });

    window.hideSpinner();
    window.showToast(`Token ${tokenId} checked in successfully (${classification})`, 'success');
    document.getElementById('checkin-card-container').style.display = 'none';
    document.getElementById('checkin-token-input').value = '';
    activeCheckinToken = null;
  } catch (err) {
    window.hideSpinner();
    console.error('Checkin failed:', err);
    window.showToast('Check-in failed. Try again.', 'error');
  }
}

async function handleMarkNoShow() {
  if (!activeCheckinToken) return;
  const tokenId = activeCheckinToken.tokenId;

  try {
    window.showSpinner();
    await window.db.ref(`tokens/${tokenId}`).update({
      arrivalStatus: 'no_show',
      queueStatus: 'bypassed',
      status: 'No Show'
    });

    await window.AuditLogger.logEvent({
      tokenId,
      actorId: window.auth.currentUser?.email || 'operator',
      actorRole: activeRole,
      action: 'FARMER_MARKED_NO_SHOW',
      fromState: activeCheckinToken.arrivalStatus,
      toState: 'no_show'
    });

    window.hideSpinner();
    window.showToast(`Token ${tokenId} marked as NO-SHOW`, 'info');
    document.getElementById('checkin-card-container').style.display = 'none';
    activeCheckinToken = null;
  } catch (err) {
    window.hideSpinner();
    window.showToast('Failed to mark no-show.', 'error');
  }
}

function renderCheckinRecentTable() {
  const tbody = document.getElementById('checkin-recent-tbody');
  if (!tbody) return;

  const checkedTokens = Object.values(allTokens).filter(t =>
    ['on_time', 'early', 'late', 'no_show'].includes(t.arrivalStatus)
  );

  if (!checkedTokens.length) {
    tbody.innerHTML = '<tr><td colspan="7">No gate check-ins logged today.</td></tr>';
    return;
  }

  tbody.innerHTML = checkedTokens.map(t => `
    <tr>
      <td><span class="token-id-cell">${t.tokenId}</span></td>
      <td><strong>${escHtml(t.farmerName)}</strong></td>
      <td>${escHtml(t.centerName || t.centerId)}</td>
      <td>${t.timeSlot}</td>
      <td><span class="badge ${t.arrivalStatus === 'on_time' ? 'badge--success' : 'badge--warning'}">${t.arrivalStatus}</span></td>
      <td>${t.checkInTimestamp ? new Date(t.checkInTimestamp).toLocaleTimeString() : '---'}</td>
      <td><span class="badge badge--muted">${t.status}</span></td>
    </tr>
  `).join('');
}

/* ─────────────────────────────────────────────
   MODULE 5: LIVE QUEUE MODULE
───────────────────────────────────────────── */
async function renderQueueModule() {
  const centerId = document.getElementById('queue-center-select')?.value || 'center-ludhiana-01';
  const slotVal  = document.getElementById('queue-slot-select')?.value || 'all';
  const dateVal  = document.getElementById('queue-date-select')?.value || window.todayIST ? window.todayIST() : '2026-09-07';
  const tbody    = document.getElementById('queue-tbody');
  const emptyEl  = document.getElementById('queue-empty');

  if (!tbody) return;

  // Fetch dedicated queue entries from /queues/{centerId}
  const queuesSnap = await window.db.ref(`queues/${centerId}`).once('value');
  let queueEntries = [];

  if (queuesSnap.exists()) {
    queuesSnap.forEach(dateChild => {
      if (dateVal === 'all' || dateChild.key === dateVal) {
        dateChild.forEach(slotChild => {
          if (slotVal === 'all' || slotChild.key === slotVal) {
            slotChild.forEach(entryChild => {
              const val = entryChild.val();
              if (val) queueEntries.push(val);
            });
          }
        });
      }
    });
  }

  // If queueEntries is empty from /queues, fallback to deriving queue from allTokens
  if (!queueEntries.length) {
    const tokensArr = Object.values(allTokens).filter(t => 
      (centerId === 'all' || t.centerId === centerId) && 
      (dateVal === 'all' || !dateVal || t.date === dateVal) && 
      (slotVal === 'all' || t.timeSlot === slotVal) && 
      t.bookingStatus === 'confirmed' && 
      ['on_time', 'early', 'late'].includes(t.arrivalStatus)
    );
    if (tokensArr.length) {
      queueEntries = tokensArr.map((t, i) => ({
        queueEntryId: t.tokenId,
        tokenId: t.tokenId,
        centerId: t.centerId,
        date: t.date,
        timeSlot: t.timeSlot,
        farmerName: t.farmerName,
        arrivalStatus: t.arrivalStatus,
        queueStatus: t.queueStatus || 'waiting',
        position: i + 1,
        assignedStation: t.weighbridgeId || 'Weighbridge 1',
        estimatedWaitMins: (i + 1) * 12
      }));
    }
  }

  // Sort queue: in_processing -> called -> waiting -> held -> completed -> bypassed
  const stateOrder = { in_processing: 1, called: 2, waiting: 3, held: 4, completed: 5, bypassed: 6 };
  queueEntries.sort((a, b) => {
    const orderDiff = (stateOrder[a.queueStatus] || 99) - (stateOrder[b.queueStatus] || 99);
    if (orderDiff !== 0) return orderDiff;
    return (a.position || 999) - (b.position || 999);
  });

  if (!queueEntries.length) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  tbody.innerHTML = queueEntries.map((e, index) => {
    const token = allTokens[e.tokenId] || {};
    const posDisplay = e.queueStatus === 'waiting' ? `#${e.position || index + 1}` : '—';
    const estWait = e.queueStatus === 'waiting' ? `~${e.estimatedWaitMins || 0} mins` : '—';

    return `
      <tr>
        <td><strong>${posDisplay}</strong></td>
        <td><span class="token-id-cell">${e.tokenId}</span></td>
        <td><strong>${escHtml(e.farmerName || token.farmerName)}</strong></td>
        <td><span class="badge badge--info">${e.arrivalStatus}</span></td>
        <td><span class="badge ${getQueueBadgeClass(e.queueStatus)}">${e.queueStatus}</span></td>
        <td>${e.queueStatus === 'in_processing' ? 'Processing' : '---'}</td>
        <td>${e.assignedStation || 'Station 1'}</td>
        <td>${estWait}</td>
        <td>
          <div class="action-buttons">
            ${e.queueStatus === 'waiting' ? `<button class="btn btn--primary btn--sm q-call-btn" data-qid="${e.queueEntryId}" data-tid="${e.tokenId}" data-center="${e.centerId}" data-date="${e.date}" data-slot="${e.timeSlot}">Call</button>` : ''}
            ${e.queueStatus === 'called' ? `<button class="btn btn--secondary btn--sm q-start-btn" data-qid="${e.queueEntryId}" data-tid="${e.tokenId}" data-center="${e.centerId}" data-date="${e.date}" data-slot="${e.timeSlot}">Start Proc</button>` : ''}
            ${['waiting', 'called'].includes(e.queueStatus) ? `<button class="btn btn--outline btn--sm q-hold-btn" data-qid="${e.queueEntryId}" data-tid="${e.tokenId}" data-center="${e.centerId}" data-date="${e.date}" data-slot="${e.timeSlot}">Hold</button>` : ''}
            ${e.queueStatus === 'held' ? `<button class="btn btn--secondary btn--sm q-resume-btn" data-qid="${e.queueEntryId}" data-tid="${e.tokenId}" data-center="${e.centerId}" data-date="${e.date}" data-slot="${e.timeSlot}">Resume</button>` : ''}
            ${e.queueStatus !== 'completed' && e.queueStatus !== 'bypassed' ? `<button class="btn btn--danger btn--outline btn--sm q-bypass-btn" data-qid="${e.queueEntryId}" data-tid="${e.tokenId}" data-center="${e.centerId}" data-date="${e.date}" data-slot="${e.timeSlot}">Bypass</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Wire actions via QueueEngine
  tbody.querySelectorAll('.q-call-btn').forEach(b => {
    b.onclick = async () => {
      window.showSpinner();
      const res = await window.QueueEngine.callNext({
        centerId: b.dataset.center,
        date: b.dataset.date,
        timeSlot: b.dataset.slot,
        operatorId: window.auth.currentUser?.email || 'operator'
      });
      window.hideSpinner();
      if (res.success) {
        window.showToast(`Called next farmer (${res.queueEntry.tokenId})`, 'success');
        renderQueueModule();
      } else {
        window.showToast(`Call Next failed: ${res.reason || res.error}`, 'error');
      }
    };
  });

  tbody.querySelectorAll('.q-start-btn').forEach(b => {
    b.onclick = async () => {
      window.showSpinner();
      const res = await window.QueueEngine.startProcessing({
        centerId: b.dataset.center,
        date: b.dataset.date,
        timeSlot: b.dataset.slot,
        queueEntryId: b.dataset.qid,
        stationId: 'Weighbridge 1',
        operatorId: window.auth.currentUser?.email || 'operator'
      });
      window.hideSpinner();
      if (res.success) {
        window.showToast(`Processing started at ${res.station}`, 'success');
        renderQueueModule();
      } else {
        window.showToast(`Start Processing failed: ${res.reason || res.error}`, 'error');
      }
    };
  });

  tbody.querySelectorAll('.q-hold-btn').forEach(b => {
    b.onclick = async () => {
      window.showSpinner();
      const res = await window.QueueEngine.holdQueueEntry({
        centerId: b.dataset.center,
        date: b.dataset.date,
        timeSlot: b.dataset.slot,
        queueEntryId: b.dataset.qid,
        operatorId: window.auth.currentUser?.email || 'operator'
      });
      window.hideSpinner();
      if (res.success) {
        window.showToast('Queue entry placed on hold', 'info');
        renderQueueModule();
      } else {
        window.showToast(`Hold failed: ${res.reason || res.error}`, 'error');
      }
    };
  });

  tbody.querySelectorAll('.q-resume-btn').forEach(b => {
    b.onclick = async () => {
      window.showSpinner();
      const res = await window.QueueEngine.resumeQueueEntry({
        centerId: b.dataset.center,
        date: b.dataset.date,
        timeSlot: b.dataset.slot,
        queueEntryId: b.dataset.qid,
        operatorId: window.auth.currentUser?.email || 'operator'
      });
      window.hideSpinner();
      if (res.success) {
        window.showToast('Queue entry resumed to end of queue', 'success');
        renderQueueModule();
      } else {
        window.showToast(`Resume failed: ${res.reason || res.error}`, 'error');
      }
    };
  });

  tbody.querySelectorAll('.q-bypass-btn').forEach(b => {
    b.onclick = async () => {
      window.showSpinner();
      const res = await window.QueueEngine.bypassQueueEntry({
        centerId: b.dataset.center,
        date: b.dataset.date,
        timeSlot: b.dataset.slot,
        queueEntryId: b.dataset.qid,
        operatorId: window.auth.currentUser?.email || 'operator'
      });
      window.hideSpinner();
      if (res.success) {
        window.showToast('Queue entry bypassed', 'info');
        renderQueueModule();
      } else {
        window.showToast(`Bypass failed: ${res.reason || res.error}`, 'error');
      }
    };
  });
}

function getQueueBadgeClass(q) {
  switch (q) {
    case 'waiting': return 'badge--info';
    case 'called': return 'badge--warning';
    case 'in_processing': return 'badge--primary';
    case 'completed': return 'badge--success';
    case 'held': return 'badge--warning';
    case 'bypassed': return 'badge--danger';
    default: return 'badge--muted';
  }
}

async function updateQueueState(tokenId, newQueueState, auditAction) {
  const token = allTokens[tokenId];
  if (!token) return;

  if (token.bookingStatus === 'cancelled' || token.arrivalStatus === 'no_show') {
    window.showToast('Cancelled/No-show tokens cannot enter active processing', 'error');
    return;
  }

  try {
    window.showSpinner();
    const updates = { queueStatus: newQueueState };
    if (newQueueState === 'in_processing') {
      updates.status = 'Quality Check';
      updates.qualityStatus = 'in_progress';
    }

    await window.db.ref(`tokens/${tokenId}`).update(updates);

    await window.AuditLogger.logEvent({
      tokenId,
      actorId: window.auth.currentUser?.email || 'operator',
      actorRole: activeRole,
      action: auditAction,
      fromState: token.queueStatus,
      toState: newQueueState
    });

    window.hideSpinner();
    window.showToast(`Token ${tokenId} queue status updated to ${newQueueState}`, 'success');
  } catch (err) {
    window.hideSpinner();
    window.showToast('Queue state update failed.', 'error');
  }
}

/* ─────────────────────────────────────────────
   MODULE 6: WEIGHMENT MODULE
───────────────────────────────────────────── */
function renderWeighmentModule() {
  const tbody = document.getElementById('weighment-tbody');
  const emptyEl = document.getElementById('weighment-empty');
  if (!tbody) return;

  const stationFilter = document.getElementById('weighbridge-station-filter')?.value || 'all';

  let tokens = Object.values(allTokens).filter(t =>
    t.bookingStatus === 'confirmed' &&
    ['in_processing', 'called', 'waiting', 'completed'].includes(t.queueStatus)
  );

  if (stationFilter !== 'all') {
    tokens = tokens.filter(t => (t.weighbridgeId || 'Weighbridge 1') === stationFilter);
  }

  if (!tokens.length) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  tbody.innerHTML = tokens.map(t => `
    <tr>
      <td><span class="token-id-cell">${t.tokenId}</span></td>
      <td><strong>${escHtml(t.farmerName)}</strong></td>
      <td>${t.estimatedQuantityQtl || t.quantity} Qtl</td>
      <td>${typeof t.actualQuantityQtl === 'number' ? `<strong>${t.actualQuantityQtl} Qtl</strong>` : 'Pending'}</td>
      <td><span class="badge ${t.weighmentStatus === 'completed' ? 'badge--success' : 'badge--warning'}">${t.weighmentStatus}</span></td>
      <td>${t.weighbridgeId || 'Weighbridge 1'}</td>
      <td>${t.weighmentOperator || '---'}</td>
      <td>
        ${t.weighmentStatus !== 'completed' ? `
          <button class="btn btn--primary btn--sm enter-weighment-btn" data-id="${t.tokenId}">Record Weight</button>
        ` : '<span class="badge badge--success">Verified</span>'}
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.enter-weighment-btn').forEach(b => {
    b.onclick = () => openWeighmentModal(b.dataset.id);
  });
}

function openWeighmentModal(tokenId) {
  const token = allTokens[tokenId];
  if (!token) return;

  document.getElementById('wm-token-id').value = tokenId;
  document.getElementById('wm-display-token').textContent = tokenId;
  document.getElementById('wm-display-farmer').textContent = token.farmerName;
  document.getElementById('wm-actual-qty').value = token.estimatedQuantityQtl || token.quantity;
  openModal('weighment-modal-overlay');
}

async function handleWeighmentSubmit(e) {
  e.preventDefault();
  const tokenId   = document.getElementById('wm-token-id').value;
  const actualQty = parseFloat(document.getElementById('wm-actual-qty').value);
  const station   = document.getElementById('wm-station').value;
  const operator  = document.getElementById('wm-operator').value.trim();

  // Strict Numeric Validation
  if (isNaN(actualQty) || actualQty <= 0) {
    window.showToast('Enter a valid numeric quantity greater than 0', 'error');
    return;
  }

  const token = allTokens[tokenId];
  if (!token || token.bookingStatus === 'cancelled' || token.arrivalStatus === 'no_show') {
    window.showToast('Cannot process weighment for cancelled/no-show tokens', 'error');
    return;
  }

  try {
    window.showSpinner();
    const now = new Date().toISOString();
    const updates = {
      actualQuantityQtl: actualQty,
      weighmentStatus: 'completed',
      weighbridgeId: station,
      weighmentOperator: operator,
      weighmentTimestamp: now,
      status: 'Weighment',
      'stages/weighment': { completed: true, timestamp: now }
    };

    await window.db.ref(`tokens/${tokenId}`).update(updates);

    await window.AuditLogger.logEvent({
      tokenId,
      actorId: operator || window.auth.currentUser?.email,
      actorRole: activeRole,
      action: 'WEIGHMENT_COMPLETED',
      fromState: token.weighmentStatus,
      toState: 'completed',
      metadata: { actualQuantityQtl: actualQty, station, operator }
    });

    window.hideSpinner();
    closeModal('weighment-modal-overlay');
    window.showToast(`Weighment of ${actualQty} Qtl recorded for ${tokenId}`, 'success');

    // Auto-evaluate procurement completion eligibility
    evaluateProcurementCompletion(tokenId);
  } catch (err) {
    window.hideSpinner();
    window.showToast('Failed to record weighment.', 'error');
  }
}

/* ─────────────────────────────────────────────
   MODULE 7: QUALITY INSPECTION MODULE
───────────────────────────────────────────── */
function renderQualityModule() {
  const tbody = document.getElementById('quality-tbody');
  const emptyEl = document.getElementById('quality-empty');
  if (!tbody) return;

  const tokens = Object.values(allTokens).filter(t =>
    t.bookingStatus === 'confirmed' &&
    ['in_processing', 'called', 'waiting', 'completed'].includes(t.queueStatus)
  );

  if (!tokens.length) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  tbody.innerHTML = tokens.map(t => {
    const qData = t.qualityData || {};
    return `
      <tr>
        <td><span class="token-id-cell">${t.tokenId}</span></td>
        <td><strong>${escHtml(t.farmerName)}</strong></td>
        <td>${escHtml(t.cropType)}</td>
        <td>${qData.moisturePercent !== undefined ? `${qData.moisturePercent}%` : '---'}</td>
        <td>${qData.foreignMatterPercent !== undefined ? `${qData.foreignMatterPercent}%` : '---'}</td>
        <td>${qData.grade || '---'}</td>
        <td><span class="badge ${getQualityBadgeClass(t.qualityStatus)}">${t.qualityStatus}</span></td>
        <td>
          <button class="btn btn--primary btn--sm inspect-quality-btn" data-id="${t.tokenId}">Inspect Quality</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.inspect-quality-btn').forEach(b => {
    b.onclick = () => openQualityModal(b.dataset.id);
  });
}

function openQualityModal(tokenId) {
  const token = allTokens[tokenId];
  if (!token) return;

  document.getElementById('qm-token-id').value = tokenId;
  document.getElementById('qm-display-token').textContent = tokenId;
  document.getElementById('qm-display-farmer').textContent = token.farmerName;
  openModal('quality-modal-overlay');
}

async function handleQualitySubmit(e) {
  e.preventDefault();
  const tokenId  = document.getElementById('qm-token-id').value;
  const moisture = parseFloat(document.getElementById('qm-moisture').value);
  const foreign  = parseFloat(document.getElementById('qm-foreign').value);
  const grade    = document.getElementById('qm-grade').value;
  const decision = document.getElementById('qm-decision').value;
  const remarks  = document.getElementById('qm-remarks').value.trim();

  if (isNaN(moisture) || moisture < 0 || moisture > 100 || isNaN(foreign) || foreign < 0 || foreign > 100) {
    window.showToast('Enter valid numeric percentage values (0–100)', 'error');
    return;
  }

  const token = allTokens[tokenId];
  if (!token) return;

  try {
    window.showSpinner();
    const now = new Date().toISOString();
    const qualityData = { moisturePercent: moisture, foreignMatterPercent: foreign, grade, decision, remarks, timestamp: now };

    const updates = {
      qualityStatus: decision,
      qualityData,
      'stages/qualityCheck': { completed: (decision === 'accepted' || decision === 'completed'), timestamp: now }
    };

    await window.db.ref(`tokens/${tokenId}`).update(updates);

    const auditActions = {
      accepted: 'QUALITY_ACCEPTED',
      needs_review: 'QUALITY_REVIEW',
      rejected: 'QUALITY_REJECTED'
    };

    await window.AuditLogger.logEvent({
      tokenId,
      actorId: window.auth.currentUser?.email || 'inspector',
      actorRole: activeRole,
      action: auditActions[decision] || 'QUALITY_INSPECTED',
      fromState: token.qualityStatus,
      toState: decision,
      metadata: qualityData
    });

    window.hideSpinner();
    closeModal('quality-modal-overlay');
    window.showToast(`Quality assessment recorded: ${decision.toUpperCase()}`, decision === 'accepted' ? 'success' : 'warning');

    // Evaluate procurement completion
    if (decision === 'accepted') {
      evaluateProcurementCompletion(tokenId);
    } else {
      // Rejection or Needs Review MUST block procurement completion!
      await window.db.ref(`tokens/${tokenId}/procurementStatus`).set('rejected');
    }
  } catch (err) {
    window.hideSpinner();
    window.showToast('Failed to record quality assessment.', 'error');
  }
}

/* ─────────────────────────────────────────────
   PROCUREMENT COMPLETION ENGINE
───────────────────────────────────────────── */
async function evaluateProcurementCompletion(tokenId) {
  const token = allTokens[tokenId];
  if (!token) return;

  // Prerequisites check:
  // 1. bookingStatus === 'confirmed'
  // 2. arrivalStatus in ['on_time', 'early', 'late']
  // 3. weighmentStatus === 'completed'
  // 4. qualityStatus === 'accepted'
  if (
    token.bookingStatus === 'confirmed' &&
    ['on_time', 'early', 'late'].includes(token.arrivalStatus) &&
    token.weighmentStatus === 'completed' &&
    token.qualityStatus === 'accepted'
  ) {
    try {
      await window.db.ref(`tokens/${tokenId}`).update({
        procurementStatus: 'completed',
        queueStatus: 'completed',
        status: 'Completed'
      });

      await window.AuditLogger.logEvent({
        tokenId,
        actorId: 'system',
        actorRole: 'System',
        action: 'PROCUREMENT_COMPLETED',
        fromState: 'pending',
        toState: 'completed'
      });

      console.log(`🎉 [ProcurementEngine] Token ${tokenId} procurement successfully completed.`);
    } catch (err) {
      console.error('Procurement completion update error:', err);
    }
  }
}

/* ─────────────────────────────────────────────
   MODULE 8: PAYMENTS MODULE
───────────────────────────────────────────── */
let activePaymentFilter = 'all';

function renderPaymentsModule() {
  const tbody = document.getElementById('payments-tbody');
  const emptyEl = document.getElementById('payments-empty');
  if (!tbody) return;

  // Tab click event listeners
  const tabs = document.querySelectorAll('#payment-filter-tabs .filter-tab');
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activePaymentFilter = tab.getAttribute('data-pay-filter') || 'all';
      renderPaymentsModule();
    };
  });

  // 1. FILTER: Only include tokens where farmer has actually CHECKED IN at gate or progressed!
  const arrivedTokens = Object.values(allTokens).filter(t => {
    if (t.bookingStatus === 'cancelled' || t.bookingStatus === 'expired') return false;
    const hasArrived = t.arrivalStatus && t.arrivalStatus !== 'pending' && t.arrivalStatus !== 'no_show';
    const hasProcured = t.procurementStatus && t.procurementStatus !== 'pending';
    const hasWeighed = t.weighmentStatus && t.weighmentStatus !== 'pending';
    return hasArrived || hasProcured || hasWeighed;
  });

  let pendingSum = 0, approvedSum = 0, completedSum = 0;
  const mspRate = globalSettings.mspRatePerQtl || 2300;

  arrivedTokens.forEach(t => {
    const qty = typeof t.actualQuantityQtl === 'number' ? t.actualQuantityQtl : (parseFloat(t.quantity) || 0);
    const amount = qty * mspRate;
    if (t.paymentStatus === 'completed') completedSum += amount;
    else if (t.paymentStatus === 'approved') approvedSum += amount;
    else pendingSum += amount;
  });

  document.getElementById('pay-kpi-pending').textContent = `₹${pendingSum.toLocaleString('en-IN')}`;
  document.getElementById('pay-kpi-approved').textContent = `₹${approvedSum.toLocaleString('en-IN')}`;
  document.getElementById('pay-kpi-completed').textContent = `₹${completedSum.toLocaleString('en-IN')}`;

  // 2. FILTER by Active Sub-Tab Filter ('all' vs 'pending' vs 'completed')
  const filteredTokens = arrivedTokens.filter(t => {
    if (activePaymentFilter === 'pending') {
      return ['pending', 'approved', 'initiated', 'processing'].includes(t.paymentStatus || 'pending');
    }
    if (activePaymentFilter === 'completed') {
      return t.paymentStatus === 'completed';
    }
    return true;
  });

  filteredTokens.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  if (filteredTokens.length === 0) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  tbody.innerHTML = filteredTokens.map(t => {
    const qty = typeof t.actualQuantityQtl === 'number' ? t.actualQuantityQtl : (parseFloat(t.quantity) || 0);
    const amount = qty * mspRate;
    const refId = t.paymentRefId || `DBT-REF-${t.tokenId.slice(-4)}`;

    const arrivalBadge = `<span class="badge badge--info">${(t.arrivalStatus || 'Arrived').toUpperCase()}</span>`;

    return `
      <tr>
        <td><span class="token-id-cell">${t.tokenId}</span></td>
        <td><strong>${escHtml(t.farmerName)}</strong><br><small style="color:var(--color-fog);">${t.mobile}</small></td>
        <td>${arrivalBadge}</td>
        <td>${qty} Qtl</td>
        <td><strong>₹${amount.toLocaleString('en-IN')}</strong></td>
        <td><span class="badge ${getPaymentBadgeClass(t.paymentStatus)}">${t.paymentStatus || 'pending'}</span></td>
        <td><code>${refId}</code></td>
        <td>
          <div class="action-buttons">
            <button class="btn btn--outline btn--sm pay-inspect-btn" data-id="${t.tokenId}">🔍 Inspect</button>
            ${t.paymentStatus === 'pending' ? `<button class="btn btn--primary btn--sm pay-approve-btn" data-id="${t.tokenId}">Approve</button>` : ''}
            ${t.paymentStatus === 'approved' ? `<button class="btn btn--secondary btn--sm pay-initiate-btn" data-id="${t.tokenId}">Initiate DBT</button>` : ''}
            ${['initiated', 'processing'].includes(t.paymentStatus) ? `<button class="btn btn--success btn--sm pay-complete-btn" data-id="${t.tokenId}">Mark Paid</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.pay-inspect-btn').forEach(b => b.onclick = () => openInspectPaymentModal(b.dataset.id));
  tbody.querySelectorAll('.pay-approve-btn').forEach(b => b.onclick = () => updatePaymentStatus(b.dataset.id, 'approved'));
  tbody.querySelectorAll('.pay-initiate-btn').forEach(b => b.onclick = () => updatePaymentStatus(b.dataset.id, 'initiated'));
  tbody.querySelectorAll('.pay-complete-btn').forEach(b => b.onclick = () => updatePaymentStatus(b.dataset.id, 'completed'));
}

function openInspectPaymentModal(tokenId) {
  const t = allTokens[tokenId];
  if (!t) return;

  const body = document.getElementById('inspect-payment-modal-body');
  if (!body) return;

  const mspRate = globalSettings.mspRatePerQtl || 2300;
  const qty = typeof t.actualQuantityQtl === 'number' ? t.actualQuantityQtl : (parseFloat(t.quantity) || 0);
  const totalAmount = qty * mspRate;
  const refId = t.paymentRefId || `DBT-REF-${t.tokenId.slice(-4)}`;

  body.innerHTML = `
    <div style="background-color: var(--color-paper); border: 1px solid var(--color-cloud); border-radius: var(--radius-md); padding: var(--spacing-16); margin-bottom: var(--spacing-16);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--spacing-12);">
        <div>
          <h4 style="margin:0;">${escHtml(t.farmerName)}</h4>
          <span style="font-size:var(--text-body-sm); color:var(--color-fog);">Mobile: ${t.mobile} | Email: ${t.createdByEmail || 'N/A'}</span>
        </div>
        <span class="badge ${getPaymentBadgeClass(t.paymentStatus)}">${(t.paymentStatus || 'pending').toUpperCase()}</span>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--spacing-12); font-size:var(--text-body-sm);">
        <div><strong>Token ID:</strong> <code>${t.tokenId}</code></div>
        <div><strong>Center:</strong> ${t.centerName || t.centerId}</div>
        <div><strong>Gate Arrival:</strong> ${(t.arrivalStatus || 'pending').toUpperCase()}</div>
        <div><strong>Procurement:</strong> ${(t.procurementStatus || 'pending').toUpperCase()}</div>
        <div><strong>Crop Type:</strong> ${t.cropType || 'Paddy'}</div>
        <div><strong>DBT Ref ID:</strong> <code>${refId}</code></div>
      </div>
    </div>

    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: var(--radius-md); padding: var(--spacing-16); margin-bottom: var(--spacing-20);">
      <h5 style="margin:0 0 var(--spacing-8) 0; color:#166534;">💰 Financial Calculation (Govt. MSP)</h5>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:var(--text-body-sm);">
        <span>Procured Tonnage:</span>
        <strong>${qty} Quintals</strong>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:var(--text-body-sm); margin-top:4px;">
        <span>MSP Rate (Paddy):</span>
        <strong>₹${mspRate.toLocaleString('en-IN')} / Qtl</strong>
      </div>
      <hr style="margin: var(--spacing-8) 0; border:0; border-top:1px dashed #bbf7d0;">
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:var(--text-body-md); font-weight:700; color:#14532d;">
        <span>Total Payable Amount:</span>
        <span style="font-size:1.2rem; color:var(--color-leaf);">₹${totalAmount.toLocaleString('en-IN')}</span>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; gap:var(--spacing-12);">
      <button type="button" class="btn btn--outline" onclick="closeModal('inspect-payment-modal-overlay')">Close</button>
      ${t.paymentStatus === 'pending' ? `<button class="btn btn--primary" onclick="updatePaymentStatus('${t.tokenId}', 'approved'); closeModal('inspect-payment-modal-overlay');">Approve Payment</button>` : ''}
      ${t.paymentStatus === 'approved' ? `<button class="btn btn--secondary" onclick="updatePaymentStatus('${t.tokenId}', 'initiated'); closeModal('inspect-payment-modal-overlay');">Initiate DBT Disbursal</button>` : ''}
      ${['initiated', 'processing'].includes(t.paymentStatus) ? `<button class="btn btn--success" onclick="updatePaymentStatus('${t.tokenId}', 'completed'); closeModal('inspect-payment-modal-overlay');">Mark Disbursal Paid</button>` : ''}
    </div>
  `;

  openModal('inspect-payment-modal-overlay');
}


async function updatePaymentStatus(tokenId, newStatus) {
  const token = allTokens[tokenId];
  if (!token) return;

  // Validation: Payment can only be approved if procurement is completed!
  if (newStatus === 'approved' && token.procurementStatus !== 'completed') {
    window.showToast('Payment can only be approved after procurement is COMPLETED', 'error');
    return;
  }

  try {
    window.showSpinner();
    const refId = token.paymentRefId || `DBT-REF-${Date.now().toString().slice(-6)}`;
    await window.db.ref(`tokens/${tokenId}`).update({
      paymentStatus: newStatus,
      paymentRefId: refId
    });

    await window.AuditLogger.logEvent({
      tokenId,
      actorId: window.auth.currentUser?.email || 'accounts',
      actorRole: activeRole,
      action: 'PAYMENT_STATUS_CHANGED',
      fromState: token.paymentStatus,
      toState: newStatus,
      metadata: { refId }
    });

    window.hideSpinner();
    window.showToast(`Payment status updated to ${newStatus.toUpperCase()}`, 'success');
  } catch (err) {
    window.hideSpinner();
    window.showToast('Payment status update failed.', 'error');
  }
}

/* ─────────────────────────────────────────────
   MODULE 9: ANALYTICS MODULE (Admin Only)
───────────────────────────────────────────── */
function renderAnalyticsModule() {
  const container = document.getElementById('analytics-content-container');
  if (!container) return;

  const centerSelect = document.getElementById('analytics-center-select');
  const selectedCenterId = centerSelect ? centerSelect.value : 'all';

  const tokensMap = window.allTokens && Object.keys(window.allTokens).length > 0 ? window.allTokens : allTokens;
  const tokens = Object.values(tokensMap || {});
  if (!tokens.length) {
    container.innerHTML = '<div class="alert alert--info">No historical data available for analytics calculations.</div>';
    return;
  }

  // Calculate KPIs via deterministic AnalyticsEngine
  const kpis = window.AnalyticsEngine ? window.AnalyticsEngine.calculateKPIs(tokens, { centerId: selectedCenterId }) : {
    totalBookings: tokens.length,
    confirmedBookings: tokens.length,
    cancelledBookings: 0,
    rescheduledBookings: 0,
    waitlistCount: 0,
    waitlistPromotions: 0,
    checkedInFarmers: 0,
    earlyArrivals: 0,
    onTimeArrivals: 0,
    lateArrivals: 0,
    noShows: 0,
    arrivalRate: 0,
    noShowRate: 0,
    farmerCapacityUtilizationPct: 0,
    quantityCapacityUtilizationPct: 0,
    effectiveUtilizationPct: 0,
    avgQueueLength: 0,
    peakQueueLength: 0,
    avgEstimatedWaitMins: 0,
    avgActualWaitMins: 0,
    avgProcessingTimeMins: 0,
    completedQueueEntries: 0,
    totalDeclaredQuantity: 0,
    totalProcuredQuantity: 0,
    procurementCompletedCount: 0,
    procurementCompletionRate: 0,
    paymentsCompleted: 0,
    paymentsFailed: 0,
    paymentCompletionRate: 0
  };

  // Build daily series
  const series = window.AnalyticsEngine ? window.AnalyticsEngine.getHistoricalSeries(tokens, { centerId: selectedCenterId, metric: 'bookings' }) : [];

  container.innerHTML = `
    <div class="stats-bar" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:var(--spacing-16); margin-bottom:var(--spacing-20);">
      <div class="stat-card">
        <div>
          <div class="stat-card__value">${kpis.totalBookings}</div>
          <div class="stat-card__label">Total Bookings</div>
        </div>
      </div>
      <div class="stat-card">
        <div>
          <div class="stat-card__value">${kpis.checkedInFarmers}</div>
          <div class="stat-card__label">Checked-In Farmers</div>
        </div>
      </div>
      <div class="stat-card">
        <div>
          <div class="stat-card__value">${kpis.procurementCompletedCount}</div>
          <div class="stat-card__label">Procurement Completed</div>
        </div>
      </div>
      <div class="stat-card">
        <div>
          <div class="stat-card__value">${kpis.noShowRate}%</div>
          <div class="stat-card__label">No-Show Rate</div>
        </div>
      </div>
      <div class="stat-card">
        <div>
          <div class="stat-card__value">${kpis.avgActualWaitMins > 0 ? kpis.avgActualWaitMins + ' min' : 'N/A'}</div>
          <div class="stat-card__label">Average Actual Wait</div>
        </div>
      </div>
      <div class="stat-card">
        <div>
          <div class="stat-card__value">${kpis.avgProcessingTimeMins > 0 ? kpis.avgProcessingTimeMins + ' min' : 'N/A'}</div>
          <div class="stat-card__label">Avg Processing Duration</div>
        </div>
      </div>
      <div class="stat-card">
        <div>
          <div class="stat-card__value">${kpis.totalProcuredQuantity} Qtl</div>
          <div class="stat-card__label">Quantity Procured</div>
        </div>
      </div>
      <div class="stat-card">
        <div>
          <div class="stat-card__value">${kpis.effectiveUtilizationPct}%</div>
          <div class="stat-card__label">Effective Capacity Util</div>
        </div>
      </div>
    </div>

    <!-- Detailed Analytics Table / Time Series Card -->
    <div class="card" style="background:var(--color-paper); border:1px solid var(--color-cloud);">
      <h3 style="font-size:var(--text-body); font-weight:700; color:var(--color-graphite); margin-bottom:var(--spacing-12);">📈 Daily Booking Time Series</h3>
      ${series.length > 0 ? `
        <table class="table" style="width:100%;">
          <thead>
            <tr>
              <th>Date</th>
              <th>Bookings</th>
            </tr>
          </thead>
          <tbody>
            ${series.slice(-7).map(item => `
              <tr>
                <td>${item.date}</td>
                <td><strong>${item.value}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p style="color:var(--color-slate); font-size:var(--text-caption);">No time series data available for the selected center.</p>'}
    </div>
  `;
}

/* ─────────────────────────────────────────────
   MODULE 10: AI FORECAST MODULE (Admin Only)
───────────────────────────────────────────── */
function renderForecastModule() {
  const tokensMap = window.allTokens && Object.keys(window.allTokens).length > 0 ? window.allTokens : allTokens;
  const tokens = Object.values(tokensMap || {});

  document.getElementById('fc-historical-count').textContent = `${tokens.length} Tokens`;
  let totalQty = 0;
  tokens.forEach(t => totalQty += (t.estimatedQuantityQtl || t.quantity || 0));
  document.getElementById('fc-historical-qty').textContent = `${totalQty.toFixed(1)} Quintals`;

  const noshowCount = tokens.filter(t => t.arrivalStatus === 'no_show').length;
  const noshowPct = tokens.length > 0 ? Math.round((noshowCount / tokens.length) * 100) : 0;
  document.getElementById('fc-noshow-rate').textContent = `${noshowPct}%`;

  const statusContainer = document.getElementById('forecast-status-container');
  if (!statusContainer) return;

  const centerSelect = document.getElementById('analytics-center-select');
  const centerId = centerSelect ? centerSelect.value : 'all';

  if (!window.ForecastEngine) {
    statusContainer.innerHTML = 'Forecast engine module not loaded.';
    return;
  }

  const forecast = window.ForecastEngine.forecastCenterDemand(centerId, { tokens, centers: allCenters });

  if (!forecast.hasSufficientHistory) {
    statusContainer.className = 'alert alert--warning';
    statusContainer.innerHTML = `<strong>Forecast Unavailable:</strong> ${forecast.reason || 'Insufficient historical data (< 3 observations)'}`;
    return;
  }

  const congestionColor = forecast.congestionLevel === 'CRITICAL' || forecast.congestionLevel === 'HIGH' ? 'var(--color-error)' : (forecast.congestionLevel === 'MODERATE' ? 'var(--color-warning)' : 'var(--color-success)');

  statusContainer.className = 'alert alert--info';
  statusContainer.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:var(--spacing-8);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:var(--text-subheading); font-weight:700;">🔮 Tomorrow's Demand Forecast (${forecast.centerId})</span>
        <span class="badge" style="background:${congestionColor}; color:#fff; font-weight:700;">${forecast.congestionLevel} Congestion Risk</span>
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:var(--spacing-12); margin-top:var(--spacing-8);">
        <div><strong>Predicted Farmers:</strong> ${forecast.predictedFarmers}</div>
        <div><strong>Expected Quantity:</strong> ${forecast.predictedQuantity} Qtl</div>
        <div><strong>Expected Utilization:</strong> ${forecast.expectedUtilization}%</div>
        <div><strong>Expected Wait:</strong> ${forecast.expectedWaitMins > 0 ? forecast.expectedWaitMins + ' mins' : 'N/A'}</div>
        <div><strong>Confidence:</strong> <span class="badge badge--success">${forecast.confidence}</span></div>
        <div><strong>Method:</strong> ${forecast.method}</div>
        <div><strong>Sample Size:</strong> ${forecast.sampleSize} days</div>
      </div>
      <div style="font-size:var(--text-caption); color:var(--color-slate); margin-top:var(--spacing-4);">
        💡 <strong>Planning Advice:</strong> ${forecast.recommendation}
      </div>
    </div>
  `;
}

window.renderAnalyticsModule = renderAnalyticsModule;
window.renderForecastModule = renderForecastModule;

window.askAdminAI = async function(queryType) {
  const container = document.getElementById('admin-ai-response');
  if (container) {
    container.style.display = 'block';
    container.className = 'alert alert--info';
    container.textContent = 'Generating Operational AI Advisory Summary…';
  }

  const tokens = Object.values(allTokens);
  const checkedInCount = tokens.filter(t => ['on_time', 'early', 'late'].includes(t.arrivalStatus)).length;
  const waitingCount = tokens.filter(t => t.queueStatus === 'waiting').length;
  const completedCount = tokens.filter(t => t.procurementStatus === 'completed').length;

  let prompt = "Summarize today's operations and bottleneck analysis.";
  if (queryType === 'congestion') prompt = "Explain center congestion and queue build-up.";
  if (queryType === 'status') prompt = "Explain center operational statuses and active weighbridges.";

  const forecast = window.ForecastEngine ? window.ForecastEngine.forecastCenterDemand('all', { tokens, centers: allCenters }) : null;

  const res = await window.GeminiAssistant.ask({
    prompt,
    contextParams: {
      analyticsData: {
        totalBookings: tokens.length,
        checkedInCount,
        waitingQueueCount: waitingCount,
        completedCount,
        avgWaitMins: 15
      },
      forecastData: forecast
    }
  });

  if (container) {
    const label = res.isLocalAdvisory ? '[Local Advisory] ' : '[Gemini Advisory] ';
    container.textContent = label + (res.success ? res.answer : (res.fallbackAnswer || 'AI Assistant unavailable.'));
  }
};

/* ─────────────────────────────────────────────
   MODULE 11: SETTINGS MODULE (Admin Only)
───────────────────────────────────────────── */
function renderSettingsModule() {
  const form = document.getElementById('settings-form');
  if (form && !form.dataset.bound) {
    form.dataset.bound = 'true';
    form.addEventListener('submit', handleSettingsSubmit);
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();

  if (activeRole !== 'Admin') {
    window.showToast('Access Denied: Admin role required to modify system settings', 'error');
    return;
  }

  const newSettings = {
    slotDurationMins: parseInt(document.getElementById('st-slot-duration').value),
    maxFarmersPerSlot: parseInt(document.getElementById('st-max-farmers').value),
    maxQuantityPerSlot: parseFloat(document.getElementById('st-max-qty').value),
    activeWeighbridges: parseInt(document.getElementById('st-weighbridges').value),
    gracePeriodMins: parseInt(document.getElementById('st-grace-period').value),
    noShowThresholdMins: parseInt(document.getElementById('st-noshow-threshold').value),
    moistureThresholdPercent: parseFloat(document.getElementById('st-moisture-thresh').value),
    foreignMatterThresholdPercent: parseFloat(document.getElementById('st-foreign-thresh').value),
    mspRatePerQtl: parseFloat(document.getElementById('st-msp-rate').value)
  };

  // Validate numeric settings
  for (let k in newSettings) {
    if (isNaN(newSettings[k]) || newSettings[k] <= 0) {
      window.showToast(`Invalid value for ${k}`, 'error');
      return;
    }
  }

  try {
    window.showSpinner();
    globalSettings = { ...globalSettings, ...newSettings };

    await window.db.ref('settings').set(globalSettings);

    await window.AuditLogger.logEvent({
      tokenId: 'SETTINGS-GLOBAL',
      actorId: window.auth.currentUser?.email || 'admin',
      actorRole: activeRole,
      action: 'SETTINGS_CHANGED',
      metadata: newSettings
    });

    window.hideSpinner();
    window.showToast('Operational settings saved successfully!', 'success');
  } catch (err) {
    window.hideSpinner();
    window.showToast('Failed to save settings.', 'error');
  }
}

/* ─────────────────────────────────────────────
   MODAL CONTROLS & HELPERS
───────────────────────────────────────────── */
function initModals() {
  document.querySelectorAll('.modal__close').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    };
  });

  const weighForm = document.getElementById('weighment-form');
  if (weighForm) weighForm.onsubmit = handleWeighmentSubmit;

  const qualForm = document.getElementById('quality-form');
  if (qualForm) qualForm.onsubmit = handleQualitySubmit;

  const centerForm = document.getElementById('center-config-form');
  if (centerForm) centerForm.onsubmit = handleCenterConfigSubmit;

  const createForm = document.getElementById('create-token-form');
  if (createForm) createForm.onsubmit = handleCreateTokenSubmit;

  const addCenterBtn = document.getElementById('add-center-btn');
  if (addCenterBtn) addCenterBtn.onclick = openAddCenterModal;

  const addCenterForm = document.getElementById('add-center-form');
  if (addCenterForm) addCenterForm.onsubmit = handleAddCenterSubmit;

  const createTokenBtn = document.getElementById('create-token-btn');
  if (createTokenBtn) createTokenBtn.onclick = () => openModal('create-modal-overlay');
}

function openAddCenterModal() {
  if (activeRole !== 'Admin') {
    window.showToast('Access Denied: Admin role required to add new center', 'error');
    return;
  }
  document.getElementById('ac-center-id').value = '';
  document.getElementById('ac-center-name').value = '';
  document.getElementById('ac-district').value = '';
  document.getElementById('ac-address').value = '';
  document.getElementById('ac-status').value = 'active';
  document.getElementById('ac-stations').value = '3';
  document.getElementById('ac-max-farmers').value = '10';
  document.getElementById('ac-max-qty').value = '500';
  openModal('add-center-modal-overlay');
}

async function handleAddCenterSubmit(e) {
  e.preventDefault();
  if (activeRole !== 'Admin') {
    window.showToast('Access Denied: Admin role required', 'error');
    return;
  }

  const id       = document.getElementById('ac-center-id').value.trim();
  const name     = document.getElementById('ac-center-name').value.trim();
  const district = document.getElementById('ac-district').value.trim();
  const address  = document.getElementById('ac-address').value.trim();
  const status   = document.getElementById('ac-status').value;
  const stations = parseInt(document.getElementById('ac-stations').value);
  const maxFarmers = parseInt(document.getElementById('ac-max-farmers').value);
  const maxQty    = parseFloat(document.getElementById('ac-max-qty').value);

  if (!id || !name || !district || !address || isNaN(stations) || isNaN(maxFarmers) || isNaN(maxQty)) {
    window.showToast('Please fill in all required fields.', 'error');
    return;
  }

  const cleanId = id.toLowerCase().replace(/\s+/g, '-');

  const centerData = {
    id: cleanId,
    name,
    district,
    address,
    operationalStatus: status,
    workingHours: { start: "06:00", end: "18:00" },
    slotDurationMins: 120,
    maxFarmersPerSlot: maxFarmers,
    maxQuantityPerSlot: maxQty,
    activeWeighbridges: stations,
    avgProcessingTimeMins: 12,
    gracePeriodMins: 15,
    noShowThresholdMins: 60
  };

  try {
    window.showSpinner();
    await window.db.ref(`centers/${cleanId}`).set(centerData);

    await window.AuditLogger.logEvent({
      tokenId: `CENTER-${cleanId}`,
      actorId: window.auth?.currentUser?.email || 'admin',
      actorRole: activeRole,
      action: 'CENTER_CREATED',
      fromState: null,
      toState: status,
      metadata: centerData
    });

    window.hideSpinner();
    closeModal('add-center-modal-overlay');
    window.showToast(`New center '${name}' created successfully!`, 'success');
  } catch (err) {
    window.hideSpinner();
    window.showToast('Failed to create new center.', 'error');
  }
}

function initModuleFilterListeners() {
  // Live Queue Filter Bindings
  const qCenter = document.getElementById('queue-center-select');
  const qDate   = document.getElementById('queue-date-select');
  const qSlot   = document.getElementById('queue-slot-select');

  if (qDate && !qDate.value && window.todayIST) {
    qDate.value = window.todayIST();
  }

  [qCenter, qDate, qSlot].forEach(el => {
    if (el && !el.dataset.bound) {
      el.dataset.bound = 'true';
      el.addEventListener('change', () => renderQueueModule());
    }
  });

  // Appointments Filter Bindings
  const appSearch   = document.getElementById('appointments-search');
  const appCenter   = document.getElementById('app-filter-center');
  const appDate     = document.getElementById('app-filter-date');
  const appBooking  = document.getElementById('app-filter-booking');
  const appArrival  = document.getElementById('app-filter-arrival');

  [appSearch, appCenter, appDate, appBooking, appArrival].forEach(el => {
    if (el && !el.dataset.bound) {
      el.dataset.bound = 'true';
      el.addEventListener('input', () => renderAppointmentsModule());
      el.addEventListener('change', () => renderAppointmentsModule());
    }
  });

  // Weighbridge Filter Bindings
  const wbStation = document.getElementById('weighbridge-station-filter');
  if (wbStation && !wbStation.dataset.bound) {
    wbStation.dataset.bound = 'true';
    wbStation.addEventListener('change', () => renderWeighmentModule());
  }

  // Analytics Filter Bindings
  const anCenter = document.getElementById('analytics-center-select');
  if (anCenter && !anCenter.dataset.bound) {
    anCenter.dataset.bound = 'true';
    anCenter.addEventListener('change', () => renderAnalyticsModule());
  }
}

function openModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.add('active');
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.remove('active');
}

async function openDetailsModal(tokenId) {
  const token = allTokens[tokenId];
  if (!token) return;

  document.getElementById('d-token-id').textContent = token.tokenId;
  document.getElementById('d-farmer').textContent = token.farmerName;
  document.getElementById('d-mobile').textContent = token.mobile;
  document.getElementById('d-quantity').textContent = `${token.estimatedQuantityQtl || token.quantity} Qtl (${token.cropType})`;
  document.getElementById('d-center').textContent = token.centerName || token.centerId;
  document.getElementById('d-slot').textContent = `${token.date} (${token.timeSlot})`;
  document.getElementById('d-status').textContent = token.status;

  document.getElementById('d-state-booking').textContent = token.bookingStatus;
  document.getElementById('d-state-arrival').textContent = token.arrivalStatus;
  document.getElementById('d-state-queue').textContent = token.queueStatus;
  document.getElementById('d-state-weighment').textContent = token.weighmentStatus;
  document.getElementById('d-state-quality').textContent = token.qualityStatus;
  document.getElementById('d-state-procurement').textContent = token.procurementStatus;
  document.getElementById('d-state-payment').textContent = token.paymentStatus;

  // Load audit trail logs
  const logsContainer = document.getElementById('d-audit-logs');
  if (logsContainer) {
    logsContainer.innerHTML = 'Loading audit history...';
    const logs = await window.AuditLogger.getLogs(tokenId);
    if (!logs.length) {
      logsContainer.innerHTML = '<div style="font-size:12px;color:var(--color-fog);">No audit logs registered yet.</div>';
    } else {
      logsContainer.innerHTML = logs.map(l => `
        <div style="font-size:12px; border-left:2px solid var(--color-forest-ink); padding-left:8px; margin-bottom:6px;">
          <strong>${l.action}</strong> by ${l.actorRole} (${l.actorId}) at ${new Date(l.timestamp).toLocaleTimeString()}
        </div>
      `).join('');
    }
  }

  openModal('details-modal-overlay');
}

function openCenterModal(centerId) {
  if (activeRole !== 'Admin') {
    window.showToast('Access Denied: Admin role required to configure center parameters', 'error');
    return;
  }

  const center = allCenters[centerId];
  if (!center) return;

  document.getElementById('ec-center-id').value = centerId;
  document.getElementById('ec-name').value = center.name;
  document.getElementById('ec-status').value = center.operationalStatus;
  document.getElementById('ec-max-farmers').value = center.maxFarmersPerSlot || 10;
  document.getElementById('ec-max-qty').value = center.maxQuantityPerSlot || 500;
  document.getElementById('ec-weighbridges').value = center.activeWeighbridges || 2;
  document.getElementById('ec-avg-time').value = center.avgProcessingTimeMins || 12;

  openModal('center-modal-overlay');
}

async function handleCenterConfigSubmit(e) {
  e.preventDefault();
  if (activeRole !== 'Admin') {
    window.showToast('Access Denied: Admin role required', 'error');
    return;
  }

  const centerId  = document.getElementById('ec-center-id').value;
  const newStatus = document.getElementById('ec-status').value;
  const maxFarmers= parseInt(document.getElementById('ec-max-farmers').value);
  const maxQty    = parseFloat(document.getElementById('ec-max-qty').value);
  const stations  = parseInt(document.getElementById('ec-weighbridges').value);
  const avgTime   = parseInt(document.getElementById('ec-avg-time').value);

  // Require confirmation before changing status to paused/closed/equipment_issue
  if (['paused', 'closed', 'equipment_issue'].includes(newStatus)) {
    if (!confirm(`Are you sure you want to set center ${centerId} status to ${newStatus.toUpperCase()}?`)) {
      return;
    }
  }

  try {
    window.showSpinner();
    const oldStatus = allCenters[centerId]?.operationalStatus;
    const updates = {
      operationalStatus: newStatus,
      maxFarmersPerSlot: maxFarmers,
      maxQuantityPerSlot: maxQty,
      activeWeighbridges: stations,
      avgProcessingTimeMins: avgTime
    };

    if (window.NotificationEngine && typeof window.NotificationEngine.handleCenterInterruption === 'function' && oldStatus !== newStatus) {
      await window.NotificationEngine.handleCenterInterruption({
        centerId,
        newStatus,
        reason: `Operational status changed to ${newStatus.toUpperCase()} by Admin`,
        actorId: window.auth?.currentUser?.email || 'admin'
      });
    }

    await window.db.ref(`centers/${centerId}`).update(updates);

    await window.AuditLogger.logEvent({
      tokenId: `CENTER-${centerId}`,
      actorId: window.auth?.currentUser?.email || 'admin',
      actorRole: activeRole,
      action: 'CENTER_STATUS_CHANGED',
      fromState: oldStatus,
      toState: newStatus,
      metadata: updates
    });

    window.hideSpinner();
    closeModal('center-modal-overlay');
    window.showToast(`Center ${centerId} configuration updated`, 'success');
  } catch (err) {
    window.hideSpinner();
    window.showToast('Failed to update center config.', 'error');
  }
}

async function handleCreateTokenSubmit(e) {
  e.preventDefault();
  const farmerName = document.getElementById('ct-farmer-name').value.trim();
  const mobile     = document.getElementById('ct-mobile').value.trim();
  const cropType   = document.getElementById('ct-crop-type').value;
  const qty        = parseFloat(document.getElementById('ct-quantity').value);
  const centerId   = document.getElementById('ct-center-select').value;
  const date       = document.getElementById('ct-date').value;
  const timeSlot   = document.getElementById('ct-time-slot').value;

  if (!farmerName || !mobile || isNaN(qty) || !centerId || !date || !timeSlot) {
    window.showToast('Fill in all required fields', 'error');
    return;
  }

  try {
    window.showSpinner();

    // Capacity Check & Reservation
    const res = await window.CapacityEngine.reserveSlotCapacity({
      centerId,
      date,
      timeSlot,
      estimatedQuantityQtl: qty
    });

    if (!res.success) {
      window.hideSpinner();
      window.showToast(`Capacity Reservation Failed: ${res.reason}`, 'error');
      return;
    }

    const pushKey = window.db.ref('tokens').push().key;
    const dateStr = date.replace(/-/g, '');
    const suffix  = pushKey.slice(-4).toUpperCase();
    const tokenId = `MANDI-${dateStr}-${suffix}`;
    const now     = new Date().toISOString();

    const tokenData = {
      tokenId,
      farmerName,
      mobile,
      cropType,
      quantity: qty,
      estimatedQuantityQtl: qty,
      actualQuantityQtl: null,
      date,
      timeSlot,
      centerId,
      centerName: allCenters[centerId]?.name || 'Mandi Center',
      bookingStatus: 'confirmed',
      arrivalStatus: 'pending',
      queueStatus: 'waiting',
      weighmentStatus: 'pending',
      qualityStatus: 'pending',
      procurementStatus: 'pending',
      paymentStatus: 'pending',
      status: 'Token Issued',
      createdAt: now
    };

    await window.db.ref(`tokens/${tokenId}`).set(tokenData);

    await window.AuditLogger.logEvent({
      tokenId,
      actorId: window.auth.currentUser?.email || 'admin',
      actorRole: activeRole,
      action: 'BOOKING_CREATED',
      fromState: null,
      toState: 'confirmed',
      metadata: tokenData
    });

    window.hideSpinner();
    closeModal('create-modal-overlay');
    window.showToast(`Token ${tokenId} created successfully!`, 'success');
  } catch (err) {
    window.hideSpinner();
    window.showToast('Failed to create token.', 'error');
  }
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─────────────────────────────────────────────
   Init on DOM Load
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (window.initOfflineSupport) window.initOfflineSupport();
  initAuth();
});
