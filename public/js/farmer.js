/**
 * farmer.js — Module 1: Farmer Registration & Token Booking
 * Handles form validation, token creation, QR code, PDF download,
 * Firebase write, offline fallback, and language toggle.
 */

'use strict';

/* ─────────────────────────────────────────────
   Hindi Translations
───────────────────────────────────────────── */
const translations = {
  en: {
    pageTitle:    'Smart Mandi Token System',
    heroTitle:    'Book Your Mandi Token Online',
    heroSubtitle: 'Skip the queue — get a digital token for your crop',
    formTitle:    'Farmer Registration & Token Booking',
    farmerName:   'Farmer Name',
    mobile:       'Mobile Number',
    cropType:     'Crop Type',
    quantity:     'Estimated Quantity (Quintals)',
    date:         'Preferred Date',
    timeSlot:     'Preferred Time Slot',
    vehicleNo:    'Vehicle Number (Optional)',
    bookBtn:      'Book My Token',
    tokenIssued:  'Token Issued',
    downloadPDF:  'Download Token PDF',
    trackToken:   'Track My Token',
    bookAnother:  'Book Another Token',
  },
  hi: {
    pageTitle:    'स्मार्ट मंडी टोकन प्रणाली',
    heroTitle:    'ऑनलाइन मंडी टोकन बुक करें',
    heroSubtitle: 'लाइन छोड़ें — अपनी फसल के लिए डिजिटल टोकन पाएं',
    formTitle:    'किसान पंजीकरण एवं टोकन बुकिंग',
    farmerName:   'किसान का नाम',
    mobile:       'मोबाइल नंबर',
    cropType:     'फसल का प्रकार',
    quantity:     'अनुमानित मात्रा (क्विंटल)',
    date:         'पसंदीदा तारीख',
    timeSlot:     'पसंदीदा समय स्लॉट',
    vehicleNo:    'वाहन संख्या (वैकल्पिक)',
    bookBtn:      'टोकन बुक करें',
    tokenIssued:  'टोकन जारी',
    downloadPDF:  'टोकन PDF डाउनलोड करें',
    trackToken:   'टोकन ट्रैक करें',
    bookAnother:  'दूसरा टोकन बुक करें',
  }
};

let currentLang = 'en';

function applyTranslations(lang) {
  currentLang = lang;
  const t = translations[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) el.textContent = t[key];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    if (t[key]) el.placeholder = t[key];
  });
  const langBtn = document.getElementById('lang-toggle');
  if (langBtn) langBtn.textContent = lang === 'en' ? 'हिंदी' : 'English';
}

/* ─────────────────────────────────────────────
   Token ID Generator
───────────────────────────────────────────── */
function generateTokenId(firebaseKey) {
  const today = new Date();
  const ist = new Date(today.getTime() + 5.5 * 60 * 60 * 1000);
  const dateStr = ist.toISOString().slice(0, 10).replace(/-/g, '');
  // Use last 4 chars of Firebase push key as unique suffix
  const suffix = firebaseKey ? firebaseKey.slice(-4).toUpperCase() : Math.floor(1000 + Math.random() * 9000).toString();
  return `MANDI-${dateStr}-${suffix}`;
}

/* ─────────────────────────────────────────────
   Form Validation
───────────────────────────────────────────── */
function validateForm(data) {
  const errors = {};

  if (!data.farmerName || data.farmerName.trim().length < 2) {
    errors.farmerName = 'Please enter a valid name (at least 2 characters)';
  }

  // Indian mobile: 10 digits, starts with 6-9
  if (!/^[6-9]\d{9}$/.test(data.mobile)) {
    errors.mobile = 'Enter valid 10-digit Indian mobile number (starts with 6-9)';
  }

  if (!data.cropType) {
    errors.cropType = 'Please select a crop type';
  }

  if (!data.quantity || data.quantity <= 0 || data.quantity > 10000) {
    errors.quantity = 'Enter a valid quantity between 1 and 10,000 quintals';
  }

  // Date must be today or future
  if (!data.date) {
    errors.date = 'Please select a date';
  } else {
    const today = window.todayIST();
    if (data.date < today) {
      errors.date = 'Date must be today or a future date';
    }
  }

  if (!data.timeSlot) {
    errors.timeSlot = 'Please select a time slot';
  }

  return errors;
}

function showFieldErrors(errors) {
  // Clear all errors first
  document.querySelectorAll('.form-group').forEach(g => g.classList.remove('has-error'));
  document.querySelectorAll('.form-error').forEach(e => e.textContent = '');

  Object.entries(errors).forEach(([field, msg]) => {
    const group = document.querySelector(`[data-field="${field}"]`);
    if (group) {
      group.classList.add('has-error');
      const errEl = group.querySelector('.form-error');
      if (errEl) errEl.textContent = msg;
    }
  });
}

/* ─────────────────────────────────────────────
   Token Card Rendering
───────────────────────────────────────────── */
function renderTokenCard(tokenData) {
  document.getElementById('tc-token-id').textContent    = tokenData.tokenId;
  document.getElementById('tc-farmer-name').textContent = tokenData.farmerName;
  document.getElementById('tc-crop').textContent        = tokenData.cropType;
  document.getElementById('tc-quantity').textContent    = `${tokenData.quantity} Qtl`;
  document.getElementById('tc-date').textContent        = window.formatDateIST(tokenData.date);
  document.getElementById('tc-time-slot').textContent   = tokenData.timeSlot;
  document.getElementById('tc-vehicle').textContent     = tokenData.vehicleNumber || '—';
  document.getElementById('tc-created').textContent     = window.formatTimestampIST(tokenData.createdAt);

  // Track link
  const trackLink = document.getElementById('track-token-link');
  if (trackLink) {
    trackLink.href = `tracker.html?token=${encodeURIComponent(tokenData.tokenId)}`;
  }

  // Generate QR Code with public domain URL (so phone cameras can open it)
  const qrContainer = document.getElementById('qr-code-container');
  if (qrContainer) {
    qrContainer.innerHTML = '';
    const baseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'https://smart-mandi-sih2026.web.app'
      : window.location.origin;

    const qrUrl = `${baseUrl}/tracker.html?token=${encodeURIComponent(tokenData.tokenId)}`;
    new QRCode(qrContainer, {
      text: qrUrl,
      width:  160,
      height: 160,
      colorDark:  '#1B5E20',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  // Show the success section
  const successSection = document.getElementById('token-success');
  if (successSection) {
    successSection.classList.add('show');
    successSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Hide form
  const formSection = document.getElementById('registration-form-section');
  if (formSection) formSection.style.display = 'none';
}

/* ─────────────────────────────────────────────
   PDF Download
───────────────────────────────────────────── */
async function downloadTokenPDF() {
  const tokenCard = document.getElementById('token-card-printable');
  if (!tokenCard || typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    window.showToast('PDF library not loaded. Please try again.', 'error');
    return;
  }

  try {
    window.showSpinner();
    const canvas = await html2canvas(tokenCard, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FFFFFF'
    });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
    const pdfWidth  = pdf.internal.pageSize.getWidth();
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight);
    pdf.save(`${document.getElementById('tc-token-id').textContent || 'mandi-token'}.pdf`);
    window.showToast('Token PDF downloaded!', 'success');
  } catch (err) {
    console.error('PDF error:', err);
    window.showToast('Failed to generate PDF. Please try again.', 'error');
  } finally {
    window.hideSpinner();
  }
}

/* ─────────────────────────────────────────────
   Rate Limiting Check (client-side guard)
   Server-side is enforced in Cloud Functions
───────────────────────────────────────────── */
async function checkDailyLimit(mobile) {
  const today = window.todayIST();
  const snapshot = await window.db.ref('tokens')
    .orderByChild('mobile')
    .equalTo(mobile)
    .once('value');

  let count = 0;
  snapshot.forEach(child => {
    if (child.val().date === today) count++;
  });
  return count;
}

/* ─────────────────────────────────────────────
   Form Submit Handler with Dual Capacity Engine
───────────────────────────────────────────── */
async function handleFormSubmit(e) {
  e.preventDefault();

  const centerSelect = document.getElementById('center-id');
  const centerId = centerSelect ? centerSelect.value : 'center-ludhiana-01';
  const centerName = centerSelect && centerSelect.options[centerSelect.selectedIndex] 
    ? centerSelect.options[centerSelect.selectedIndex].text.split(' — ')[0]
    : 'Central Mandi Hub Ludhiana';

  const formData = {
    farmerName:    document.getElementById('farmer-name').value.trim(),
    mobile:        document.getElementById('mobile').value.trim(),
    cropType:      document.getElementById('crop-type').value,
    quantity:      parseFloat(document.getElementById('quantity').value),
    date:          document.getElementById('date').value,
    timeSlot:      document.getElementById('time-slot').value,
    vehicleNumber: document.getElementById('vehicle-number').value.trim().toUpperCase(),
    centerId:      centerId,
    centerName:    centerName
  };

  // Validate
  const errors = validateForm(formData);
  if (Object.keys(errors).length > 0) {
    showFieldErrors(errors);
    const firstError = document.querySelector('.form-group.has-error');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  showFieldErrors({});

  // Offline check
  if (!navigator.onLine) {
    const tokenId = generateTokenId(null);
    const now = window.toISTString();
    const tokenData = {
      ...formData,
      tokenId,
      estimatedQuantityQtl: formData.quantity,
      actualQuantityQtl: null,
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
    window.savePendingToken(tokenData);
    window.showToast('Saved offline — will sync when connected.', 'warning', 6000);
    renderTokenCard(tokenData);
    return;
  }

  // Dual Capacity Check & Atomic Reservation
  try {
    window.showSpinner();

    // 1. Rate limit check (max 5 per mobile per day)
    const dailyCount = await checkDailyLimit(formData.mobile);
    if (dailyCount >= 5) {
      window.hideSpinner();
      window.showToast('Maximum 5 tokens per mobile number per day reached.', 'error');
      return;
    }

    // 2. Capacity Engine Pre-Check
    const capCheck = await window.CapacityEngine.checkSlotCapacity({
      centerId: formData.centerId,
      date: formData.date,
      timeSlot: formData.timeSlot,
      estimatedQuantityQtl: formData.quantity
    });

    if (!capCheck.available) {
      window.hideSpinner();
      if (capCheck.reason === 'FARMER_CAPACITY_FULL') {
        window.showToast(`Slot is full (${capCheck.currentCount}/${capCheck.maxFarmers} farmers booked). Please select another slot or center.`, 'error', 6000);
      } else if (capCheck.reason === 'QUANTITY_CAPACITY_FULL') {
        window.showToast(`Quantity limit reached for slot (${capCheck.remainingQuantity} Qtl capacity left vs ${formData.quantity} Qtl requested).`, 'error', 6000);
      } else {
        window.showToast(`Slot unavailable: ${capCheck.reason}`, 'error', 6000);
      }
      return;
    }

    // 3. Atomic Slot Reservation Transaction
    const reservation = await window.CapacityEngine.reserveSlotCapacity({
      centerId: formData.centerId,
      date: formData.date,
      timeSlot: formData.timeSlot,
      estimatedQuantityQtl: formData.quantity
    });

    if (!reservation.success) {
      window.hideSpinner();
      window.showToast(`Reservation failed: ${reservation.reason}. Please try another slot.`, 'error', 6000);
      return;
    }

    // 4. Save 7-State Token to Firebase
    const now = window.toISTString();
    const newRef = window.db.ref('tokens').push();
    const pushKey = newRef.key;
    const tokenId = generateTokenId(pushKey);

    const tokenData = {
      tokenId,
      farmerName:           formData.farmerName,
      mobile:               formData.mobile,
      cropType:             formData.cropType,
      quantity:             formData.quantity,
      estimatedQuantityQtl: formData.quantity,
      actualQuantityQtl:    null,
      date:                 formData.date,
      timeSlot:             formData.timeSlot,
      vehicleNumber:        formData.vehicleNumber,
      centerId:             formData.centerId,
      centerName:           formData.centerName,
      createdByEmail:       currentUserAccount ? currentUserAccount.email : '',
      createdByUid:         currentUserAccount ? currentUserAccount.uid : '',
      bookingStatus:        'confirmed',
      arrivalStatus:        'pending',
      queueStatus:          'waiting',
      weighmentStatus:      'pending',
      qualityStatus:        'pending',
      procurementStatus:    'pending',
      paymentStatus:        'pending',
      status:               'Token Issued',
      createdAt:            now
    };

    await window.db.ref(`tokens/${tokenId}`).set(tokenData);

    // 5. Immutable Audit Event
    await window.AuditLogger.logEvent({
      tokenId,
      actorId: currentUserAccount ? currentUserAccount.uid : 'guest',
      actorRole: 'Farmer',
      action: 'BOOKING_CREATED',
      fromState: 'draft',
      toState: 'confirmed',
      metadata: { centerId: formData.centerId, date: formData.date, timeSlot: formData.timeSlot, quantity: formData.quantity }
    });

    if (window.NotificationEngine && typeof window.NotificationEngine.handleEvent === 'function') {
      const targetUser = formData.mobile || (currentUserAccount ? currentUserAccount.uid : tokenId);
      window.NotificationEngine.handleEvent('BOOKING_CONFIRMED', {
        userId: targetUser,
        tokenId,
        centerName: formData.centerName,
        date: formData.date,
        timeSlot: formData.timeSlot,
        dedupeKey: `BOOKING_CONFIRMED_${tokenId}`
      }).catch(() => {});
    }

    window.hideSpinner();
    window.showToast('Token booked successfully with reserved capacity!', 'success');
    renderTokenCard(tokenData);

    // Trigger SMS
    try {
      const smsMsg = window.SMSTemplates.tokenConfirmation(tokenData);
      await window.callSendSMS(tokenData.mobile, smsMsg);
    } catch (smsErr) {
      console.warn('SMS call failed:', smsErr);
    }

  } catch (fbErr) {
    window.hideSpinner();
    console.error('Booking failed:', fbErr);

    const tokenId = generateTokenId(null);
    const now = window.toISTString();
    const tokenData = {
      ...formData,
      tokenId,
      estimatedQuantityQtl: formData.quantity,
      actualQuantityQtl: null,
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
    window.savePendingToken(tokenData);
    window.showToast('Saved offline — will sync when connected.', 'warning', 6000);
    renderTokenCard(tokenData);
  }
}

/* ─────────────────────────────────────────────
   User Account Authentication & My Tokens History
───────────────────────────────────────────── */
let currentUserAccount = null;

function initFarmerAuth() {
  const logoutBtn = document.getElementById('user-logout-btn');

  // Logout Handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await window.auth.signOut();
        window.location.href = 'login.html';
      } catch (err) {
        console.error('Sign out error:', err);
      }
    });
  }

  // Observe Auth State
  window.auth.onAuthStateChanged((user) => {
    currentUserAccount = user;
    const formSec   = document.getElementById('registration-form-section');
    const tokensSec = document.getElementById('my-tokens-section');
    const chip      = document.getElementById('user-chip');
    const chipEmail = document.getElementById('user-email-display');
    const logoutBtn = document.getElementById('user-logout-btn');
    const navSignin = document.getElementById('nav-signin-btn');
    const navSignup = document.getElementById('nav-signup-btn');

    if (user) {
      // LOGGED IN: Show dashboard (booking form + my tokens)
      if (formSec)   formSec.style.display   = 'block';
      if (tokensSec) tokensSec.style.display = 'block';
      if (chip)      chip.style.display      = 'flex';
      if (logoutBtn) logoutBtn.style.display = 'inline-flex';
      if (chipEmail) chipEmail.textContent   = user.email;
      if (navSignin) navSignin.style.display = 'none';
      if (navSignup) navSignup.style.display = 'none';

      fetchAndRenderUserTokens(user);
    } else {
      // LOGGED OUT: Redirect to login page if on index.html
      if (formSec)   formSec.style.display   = 'none';
      if (tokensSec) tokensSec.style.display = 'none';
      if (chip)      chip.style.display      = 'none';
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (navSignin) navSignin.style.display = 'inline-flex';
      if (navSignup) navSignup.style.display = 'inline-flex';

      const path = window.location.pathname;
      if (path.endsWith('index.html') || path.endsWith('/') || path.endsWith('index')) {
        window.location.href = 'login.html';
      }
    }
  });
}

function fetchAndRenderUserTokens(user) {
  const container = document.getElementById('my-tokens-list');
  const countEl   = document.getElementById('my-tokens-count');
  if (!container) return;

  const tokensRef = window.db.ref('tokens');
  tokensRef.on('value', (snapshot) => {
    const list = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const val = child.val();
        if (!val) return;
        
        // Match by UID, Email, or Guest token
        const matchUid   = user.uid && val.createdByUid === user.uid;
        const matchEmail = user.email && val.createdByEmail && val.createdByEmail.toLowerCase() === user.email.toLowerCase();
        const isGuest    = !val.createdByEmail && !val.createdByUid;

        if (matchUid || matchEmail || isGuest) {
          list.push(val);
        }
      });
    }

    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    if (countEl) countEl.textContent = `${list.length} Token${list.length === 1 ? '' : 's'}`;

    if (list.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:var(--spacing-24); color:var(--color-fog); font-size:var(--text-body-sm);">
          No tokens generated from this account yet. Fill in the form below to book your first token!
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(t => {
      const isCancelled = t.bookingStatus === 'cancelled' || t.status === 'Cancelled';
      const isCompleted = t.bookingStatus === 'completed' || t.status === 'Completed' || t.status === 'Weighment';
      const isEligibleForAction = !isCancelled && !isCompleted && t.arrivalStatus === 'pending';

      const badgeClass = isCancelled ? 'badge--warning' : (isCompleted ? 'badge--success' : 'badge--info');
      const badgeText  = isCancelled ? 'Cancelled' : (t.status || 'Token Issued');

      return `
        <div class="card" style="margin-bottom: var(--spacing-12); padding: var(--spacing-16); background-color: var(--color-paper); border: 1px solid var(--color-cloud);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:var(--spacing-12);">
            <div>
              <div style="font-family:var(--font-inter-variable); font-size:var(--text-body-sm); font-weight:600; color:var(--color-graphite);">${t.tokenId}</div>
              <div style="font-size:var(--text-caption); color:var(--color-slate); margin-top:2px;">
                ${t.cropType} · ${t.estimatedQuantityQtl || t.quantity} Qtl · ${t.centerName || 'Central Mandi Hub'}
              </div>
              <div style="font-size:11px; color:var(--color-fog); margin-top:2px;">
                Date: ${window.formatDateIST ? window.formatDateIST(t.date) : t.date} · Slot: ${t.timeSlot}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:var(--spacing-8); flex-wrap:wrap;">
              <span class="badge ${badgeClass}">${badgeText}</span>
              <a href="tracker.html?token=${encodeURIComponent(t.tokenId)}" class="btn btn--secondary btn--sm" aria-label="Track token ${t.tokenId}">
                Track
              </a>
              ${isEligibleForAction ? `
                <button class="btn btn--secondary btn--sm" onclick="window.triggerRescheduleModal('${t.tokenId}')" aria-label="Reschedule token ${t.tokenId}">
                  Reschedule
                </button>
                <button class="btn btn--secondary btn--sm" style="color:var(--color-rust); border-color:var(--color-cloud);" onclick="window.triggerCancelModal('${t.tokenId}')" aria-label="Cancel token ${t.tokenId}">
                  Cancel
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  });
}

// Global modal triggers for Cancel and Reschedule
window.triggerCancelModal = async function(tokenId) {
  if (!confirm(`Are you sure you want to cancel appointment for token ${tokenId}? This will release your reserved slot capacity.`)) {
    return;
  }
  window.showSpinner();
  const res = await window.CapacityEngine.cancelBooking({
    tokenId,
    actorId: currentUserAccount ? currentUserAccount.uid : 'farmer',
    actorRole: 'Farmer',
    reason: 'Cancelled by farmer from dashboard'
  });
  window.hideSpinner();

  if (res.success) {
    window.showToast(`Token ${tokenId} has been cancelled and capacity released.`, 'success', 5000);
    if (window.NotificationEngine && typeof window.NotificationEngine.handleEvent === 'function') {
      const targetUser = currentUserAccount ? currentUserAccount.uid : tokenId;
      window.NotificationEngine.handleEvent('BOOKING_CANCELLED', {
        userId: targetUser,
        tokenId,
        dedupeKey: `BOOKING_CANCELLED_${tokenId}`
      }).catch(() => {});
    }
  } else {
    window.showToast(`Cancellation failed: ${res.reason}`, 'error', 5000);
  }
};

window.triggerRescheduleModal = async function(tokenId) {
  const newDate = prompt('Enter new date (YYYY-MM-DD):', window.todayIST ? window.todayIST() : '2026-09-08');
  if (!newDate) return;
  const newSlot = prompt('Enter new slot (6AM-8AM, 8AM-10AM, 10AM-12PM, 12PM-2PM, 2PM-4PM, 4PM-6PM):', '10AM-12PM');
  if (!newSlot) return;

  window.showSpinner();
  const res = await window.CapacityEngine.rescheduleBooking({
    tokenId,
    newCenterId: 'center-ludhiana-01',
    newDate,
    newTimeSlot: newSlot,
    actorId: currentUserAccount ? currentUserAccount.uid : 'farmer',
    actorRole: 'Farmer'
  });
  window.hideSpinner();

  if (res.success) {
    window.showToast(`Token ${tokenId} rescheduled to ${newDate} (${newSlot}) successfully!`, 'success', 5000);
    if (window.NotificationEngine && typeof window.NotificationEngine.handleEvent === 'function') {
      const targetUser = currentUserAccount ? currentUserAccount.uid : tokenId;
      window.NotificationEngine.handleEvent('BOOKING_RESCHEDULED', {
        userId: targetUser,
        tokenId,
        centerName: 'Central Mandi Hub',
        date: newDate,
        timeSlot: newSlot,
        dedupeKey: `BOOKING_RESCHEDULED_${tokenId}_${newDate}_${newSlot}`
      }).catch(() => {});
    }
  } else {
    window.showToast(`Reschedule failed: ${res.reason}. Original booking remains unchanged.`, 'error', 6000);
  }
};

/* ─────────────────────────────────────────────
   Realtime Mandi Center Operational Sync
───────────────────────────────────────────── */
function syncCentersDropdown() {
  const centerSelect = document.getElementById('center-id');
  if (!centerSelect) return;

  window.db.ref('centers').on('value', (snapshot) => {
    if (!snapshot.exists()) return;
    const centers = snapshot.val();
    const currentValue = centerSelect.value;

    let optionsHtml = '';
    let hasSelected = false;

    Object.keys(centers).forEach((key) => {
      const c = centers[key];
      const status = c.operationalStatus || 'active';
      let statusBadge = '✅ Active';
      let isDisabled = false;

      if (status === 'equipment_issue') {
        statusBadge = '⚠️ Equipment Error / Maintenance';
        isDisabled = true;
      } else if (status === 'paused') {
        statusBadge = '⏸️ Temporarily Paused';
        isDisabled = true;
      } else if (status === 'closed') {
        statusBadge = '🚫 Closed';
        isDisabled = true;
      }

      const isSelected = (c.id === currentValue && !isDisabled);
      if (isSelected) hasSelected = true;

      optionsHtml += `
        <option value="${c.id}" ${isDisabled ? 'disabled style="color:var(--color-rust); font-weight:bold;"' : ''} ${isSelected ? 'selected' : ''}>
          ${c.name} (${c.location || ''}) — ${statusBadge}
        </option>
      `;
    });

    centerSelect.innerHTML = optionsHtml;

    // Auto select first non-disabled option if current selection became disabled
    if (!hasSelected) {
      const firstEnabled = centerSelect.querySelector('option:not([disabled])');
      if (firstEnabled) firstEnabled.selected = true;
    }
  });
}

/* ─────────────────────────────────────────────
   Init
───────────────────────────────────────────── */
function initFarmerPage() {
  initFarmerAuth();
  syncCentersDropdown();

  // Set minimum date to today
  const dateInput = document.getElementById('date');
  if (dateInput) dateInput.min = window.todayIST();

  // Form submission
  const form = document.getElementById('farmer-registration-form');
  if (form) form.addEventListener('submit', handleFormSubmit);

  // Download PDF
  const pdfBtn = document.getElementById('download-pdf-btn');
  if (pdfBtn) pdfBtn.addEventListener('click', downloadTokenPDF);

  // Book another
  const bookAnotherBtn = document.getElementById('book-another-btn');
  if (bookAnotherBtn) {
    bookAnotherBtn.addEventListener('click', () => {
      document.getElementById('token-success').classList.remove('show');
      document.getElementById('registration-form-section').style.display = '';
      document.getElementById('farmer-registration-form').reset();
      const dateInput = document.getElementById('date');
      if (dateInput) dateInput.min = window.todayIST();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Language toggle
  const langBtn = document.getElementById('lang-toggle');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      applyTranslations(currentLang === 'en' ? 'hi' : 'en');
    });
  }

  // AI Assistant form
  const aiForm = document.getElementById('farmer-ai-form');
  if (aiForm) {
    aiForm.addEventListener('submit', (e) => {
      e.preventDefault();
      window.askFarmerAI();
    });
  }
}

window.askFarmerAI = async function(customPrompt) {
  const inputEl = document.getElementById('farmer-ai-input');
  const box = document.getElementById('ai-response-box');
  const prompt = customPrompt || (inputEl ? inputEl.value.trim() : '');

  if (!prompt) return;

  if (box) {
    box.style.display = 'block';
    box.className = 'alert alert--info';
    box.textContent = 'Thinking…';
  }

  const centerSelect = document.getElementById('center-id');
  const dateEl = document.getElementById('date');
  const slotEl = document.getElementById('time-slot');
  const qtyEl = document.getElementById('quantity');

  const res = await window.GeminiAssistant.ask({
    prompt,
    contextParams: {
      centerId: centerSelect ? centerSelect.value : 'center-ludhiana-01',
      date: dateEl ? dateEl.value : null,
      timeSlot: slotEl ? slotEl.value : null,
      declaredQuantityQtl: qtyEl ? parseFloat(qtyEl.value) || 50 : 50
    }
  });

  if (box) {
    box.textContent = res.success ? res.answer : (res.fallbackAnswer || 'AI Assistant unavailable.');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.initOfflineSupport();
  initFarmerPage();
});
