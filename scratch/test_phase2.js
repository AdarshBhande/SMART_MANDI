/**
 * test_phase2.js
 * Automated test runner for Phase 2 Dual Capacity Engine validation
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

async function runPhase2Validation() {
  console.log('--- RUNNING PHASE 2 VALIDATION ---');
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

  const centerId = 'center-ludhiana-01'; // maxFarmers: 10, maxQty: 500
  const testDate = '2026-09-10';
  const testSlot = '8AM-10AM';

  // 1. Normal Available Slot Check
  const check1 = await window.CapacityEngine.checkSlotCapacity({
    centerId,
    date: testDate,
    timeSlot: testSlot,
    estimatedQuantityQtl: 50
  });
  assert(check1.available === true, 'Capacity check available for 50 Qtl request');

  // 2. Atomic Reservation
  const res1 = await window.CapacityEngine.reserveSlotCapacity({
    centerId,
    date: testDate,
    timeSlot: testSlot,
    estimatedQuantityQtl: 400
  });
  assert(res1.success === true, 'Atomic reservation for 400 Qtl succeeded');
  assert(res1.slotData.bookedCount === 1 && res1.slotData.bookedQuantity === 400, 'Slot count (1) and quantity (400 Qtl) updated atomically');

  // 3. Dual Capacity Validation - Quantity Exceeded Test
  const check2 = await window.CapacityEngine.checkSlotCapacity({
    centerId,
    date: testDate,
    timeSlot: testSlot,
    estimatedQuantityQtl: 150
  });
  assert(check2.available === false, 'Capacity check correctly rejected quantity overflow');
  assert(check2.reason === 'QUANTITY_CAPACITY_FULL', 'Rejection reason is QUANTITY_CAPACITY_FULL');

  const res2 = await window.CapacityEngine.reserveSlotCapacity({
    centerId,
    date: testDate,
    timeSlot: testSlot,
    estimatedQuantityQtl: 150
  });
  assert(res2.success === false && res2.reason === 'QUANTITY_CAPACITY_FULL', 'Atomic transaction aborted reservation on quantity overflow');

  // 4. Fill remaining quantity (100 Qtl)
  const res3 = await window.CapacityEngine.reserveSlotCapacity({
    centerId,
    date: testDate,
    timeSlot: testSlot,
    estimatedQuantityQtl: 100
  });
  assert(res3.success === true, 'Atomic reservation for remaining 100 Qtl succeeded');
  assert(res3.slotData.bookedQuantity === 500, 'Slot quantity reached max (500 Qtl)');

  // 5. Release Capacity
  const rel1 = await window.CapacityEngine.releaseSlotCapacity({
    centerId,
    date: testDate,
    timeSlot: testSlot,
    estimatedQuantityQtl: 100
  });
  assert(rel1.success === true, 'Atomic release of 100 Qtl capacity succeeded');
  assert(rel1.slotData.bookedCount === 1 && rel1.slotData.bookedQuantity === 400, 'Capacity decremented correctly (bookedCount: 1, bookedQuantity: 400)');

  console.log(`\n=== RESULT: ${passCount}/${totalTests} TESTS PASSED ===`);
  if (passCount !== totalTests) process.exit(1);
}

runPhase2Validation().catch(console.error);
