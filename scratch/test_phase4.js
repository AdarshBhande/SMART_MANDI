/**
 * test_phase4.js
 * Comprehensive automated test suite for Phase 4:
 * Cancellation & Safe Two-Phase Rescheduling Engine
 */

const fs = require('fs');
const path = require('path');

const storageMap = new Map();
global.localStorage = {
  getItem: (k) => storageMap.get(k) || null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k)
};

const sessionMap = new Map();
global.sessionStorage = {
  getItem: (k) => sessionMap.get(k) || null,
  setItem: (k, v) => sessionMap.set(k, String(v)),
  removeItem: (k) => sessionMap.delete(k)
};

global.window = global;

const rootDir = path.resolve(__dirname, '..');

// Load scripts
eval(fs.readFileSync(path.join(rootDir, 'public/js/firebase-config.js'), 'utf8'));
eval(fs.readFileSync(path.join(rootDir, 'public/js/audit-logger.js'), 'utf8'));
eval(fs.readFileSync(path.join(rootDir, 'public/js/capacity-engine.js'), 'utf8'));
eval(fs.readFileSync(path.join(rootDir, 'public/js/recommendation-engine.js'), 'utf8'));

async function runPhase4Validation() {
  console.log('--- RUNNING PHASE 4 VALIDATION ---');
  let passCount = 0;
  let totalTests = 0;

  function assert(condition, desc) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passCount++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
    }
  }

  const centerA = 'center-ludhiana-01';
  const centerB = 'center-ludhiana-02';
  const dateA = '2026-09-20';
  const slotA = '8AM-10AM';
  const dateB = '2026-09-21';
  const slotB = '10AM-12PM';

  // --- PART 1: CANCELLATION TESTS ---
  await window.CapacityEngine.reserveSlotCapacity({ centerId: centerA, date: dateA, timeSlot: slotA, estimatedQuantityQtl: 50 });
  const tokenId1 = 'MANDI-TEST-P4-001';
  await window.db.ref(`tokens/${tokenId1}`).set({
    tokenId: tokenId1,
    farmerName: 'Test Farmer 1',
    centerId: centerA,
    date: dateA,
    timeSlot: slotA,
    quantity: 50,
    estimatedQuantityQtl: 50,
    bookingStatus: 'confirmed',
    arrivalStatus: 'pending'
  });

  // 1. Valid Cancellation
  const cancelRes1 = await window.CapacityEngine.cancelBooking({ tokenId: tokenId1, actorId: 'farmer1', actorRole: 'Farmer' });
  assert(cancelRes1.success === true, 'Valid cancellation succeeded');

  const snap1 = await window.db.ref(`tokens/${tokenId1}`).once('value');
  assert(snap1.val().bookingStatus === 'cancelled', 'Token bookingStatus updated to cancelled');

  const capSnap1 = await window.db.ref(`slotCapacities/${centerA}/${dateA}/${slotA}`).once('value');
  assert(capSnap1.val().bookedCount === 0 && capSnap1.val().bookedQuantity === 0, 'Slot A capacity released after cancellation');

  // 2. Cancellation Idempotency
  const cancelRes2 = await window.CapacityEngine.cancelBooking({ tokenId: tokenId1, actorId: 'farmer1', actorRole: 'Farmer' });
  assert(cancelRes2.success === true && cancelRes2.alreadyCancelled === true, 'Duplicate cancellation handled idempotently');
  assert(capSnap1.val().bookedCount === 0, 'Duplicate cancellation did not decrement capacity below zero');

  // 3. Post-Processing Cancellation Rejection
  const tokenId2 = 'MANDI-TEST-P4-002';
  await window.db.ref(`tokens/${tokenId2}`).set({
    tokenId: tokenId2,
    bookingStatus: 'confirmed',
    arrivalStatus: 'on_time',
    centerId: centerA,
    date: dateA,
    timeSlot: slotA,
    estimatedQuantityQtl: 40
  });
  const cancelRes3 = await window.CapacityEngine.cancelBooking({ tokenId: tokenId2 });
  assert(cancelRes3.success === false && cancelRes3.reason === 'CANCELLATION_NOT_ELIGIBLE', 'Cancellation rejected after gate arrival');

  // --- PART 2: RESCHEDULING TESTS ---

  // 4. Successful Rescheduling
  const tokenId3 = 'MANDI-TEST-P4-003';
  await window.CapacityEngine.reserveSlotCapacity({ centerId: centerA, date: dateA, timeSlot: slotA, estimatedQuantityQtl: 60 });
  await window.db.ref(`tokens/${tokenId3}`).set({
    tokenId: tokenId3,
    bookingStatus: 'confirmed',
    arrivalStatus: 'pending',
    centerId: centerA,
    date: dateA,
    timeSlot: slotA,
    estimatedQuantityQtl: 60
  });

  const reschedRes1 = await window.CapacityEngine.rescheduleBooking({
    tokenId: tokenId3,
    newCenterId: centerA,
    newDate: dateB,
    newTimeSlot: slotB,
    newQuantityQtl: 60
  });
  assert(reschedRes1.success === true, 'Successful rescheduling to new slot');

  const snap3 = await window.db.ref(`tokens/${tokenId3}`).once('value');
  assert(snap3.val().date === dateB && snap3.val().timeSlot === slotB, 'Token updated to new date and slot');

  const oldSlotCap = await window.db.ref(`slotCapacities/${centerA}/${dateA}/${slotA}`).once('value');
  const newSlotCap = await window.db.ref(`slotCapacities/${centerA}/${dateB}/${slotB}`).once('value');
  assert(oldSlotCap.val().bookedQuantity === 0, 'Original Slot A capacity released');
  assert(newSlotCap.val().bookedQuantity === 60, 'Destination Slot B capacity reserved');

  // 5. Safe Two-Phase Reschedule Failure
  await window.db.ref(`slotCapacities/${centerB}/${dateB}/${slotB}`).set({ bookedCount: 8, bookedQuantity: 400 });

  const tokenId4 = 'MANDI-TEST-P4-004';
  await window.CapacityEngine.reserveSlotCapacity({ centerId: centerA, date: dateA, timeSlot: slotA, estimatedQuantityQtl: 50 });
  await window.db.ref(`tokens/${tokenId4}`).set({
    tokenId: tokenId4,
    bookingStatus: 'confirmed',
    arrivalStatus: 'pending',
    centerId: centerA,
    date: dateA,
    timeSlot: slotA,
    estimatedQuantityQtl: 50
  });

  const reschedRes2 = await window.CapacityEngine.rescheduleBooking({
    tokenId: tokenId4,
    newCenterId: centerB,
    newDate: dateB,
    newTimeSlot: slotB,
    newQuantityQtl: 50
  });

  assert(reschedRes2.success === false, 'Reschedule into full Slot B failed as expected');
  assert(reschedRes2.originalBookingIntact === true, 'Original booking intact flag set');

  const snap4 = await window.db.ref(`tokens/${tokenId4}`).once('value');
  assert(snap4.val().centerId === centerA && snap4.val().date === dateA, 'Original token center and date 100% UNTOUCHED');

  const slotACapAfterFail = await window.db.ref(`slotCapacities/${centerA}/${dateA}/${slotA}`).once('value');
  assert(slotACapAfterFail.val().bookedCount === 1 && slotACapAfterFail.val().bookedQuantity === 50, 'Original Slot A capacity remains 100% UNTOUCHED');

  // 6. Reschedule Rejection for Equipment Issue
  const reschedRes3 = await window.CapacityEngine.rescheduleBooking({
    tokenId: tokenId4,
    newCenterId: 'center-ludhiana-03',
    newDate: dateB,
    newTimeSlot: slotB
  });
  assert(reschedRes3.success === false && reschedRes3.reason === 'DESTINATION_CENTER_NOT_OPERATIONAL', 'Reschedule rejected for non-operational destination center');

  // 7. Audit Logging Verification
  const auditLogs = await window.AuditLogger.getLogs(tokenId1);
  const cancelAudit = auditLogs.find(l => l.action === 'BOOKING_CANCELLED');
  assert(cancelAudit !== undefined, 'BOOKING_CANCELLED audit event logged');

  const reschedAuditLogs = await window.AuditLogger.getLogs(tokenId3);
  const reschedAudit = reschedAuditLogs.find(l => l.action === 'BOOKING_RESCHEDULED');
  assert(reschedAudit !== undefined, 'BOOKING_RESCHEDULED audit event logged with full metadata');

  console.log(`\n=== RESULT: ${passCount}/${totalTests} TESTS PASSED ===`);
  if (passCount !== totalTests) process.exit(1);
}

runPhase4Validation().catch(console.error);
