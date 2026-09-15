/**
 * test_phase3.js
 * Comprehensive automated test suite for Phase 3:
 * Center Recommendation Engine & Waiting List Management
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

async function runPhase3Validation() {
  console.log('--- RUNNING PHASE 3 VALIDATION ---');
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

  const testDate = '2026-09-12';
  const testSlot = '8AM-10AM';

  // 1-10: Recommendation Engine Tests
  const recs = await window.RecommendationEngine.getRecommendations({
    date: testDate,
    estimatedQuantityQtl: 50,
    preferredTimeSlot: testSlot,
    farmerLocation: { lat: 30.900, lng: 75.850 }
  });

  assert(recs.length > 0, 'Recommendation engine returned center/slot options');
  
  // Verify active center is top ranked
  const topRec = recs[0];
  assert(topRec.centerId === 'center-ludhiana-01', 'Active center-ludhiana-01 is top ranked');
  assert(topRec.isBookable === true, 'Top recommendation is bookable');

  // Verify busy center has lower score
  const busyRec = recs.find(r => r.centerId === 'center-ludhiana-02' && r.timeSlot === testSlot);
  assert(busyRec && busyRec.score < topRec.score, 'Busy center received a lower score penalty');

  // Verify equipment_issue center is filtered out
  const issueRec = recs.find(r => r.centerId === 'center-ludhiana-03');
  assert(!issueRec, 'Center with equipment_issue was correctly filtered out of recommendations');

  // Verify quantity-incompatible slot is marked unbookable
  const recsLarge = await window.RecommendationEngine.getRecommendations({
    date: testDate,
    estimatedQuantityQtl: 350,
    preferredTimeSlot: testSlot
  });
  const unbookableCenter4 = recsLarge.find(r => r.centerId === 'center-ludhiana-04');
  assert(unbookableCenter4 && unbookableCenter4.isBookable === false, 'Quantity capacity overflow correctly marks slot unbookable');

  // 11-19: Waitlist Tests
  const fullCenter = 'center-ludhiana-01';
  await window.db.ref(`slotCapacities/${fullCenter}/${testDate}/${testSlot}`).set({
    bookedCount: 10,
    bookedQuantity: 500,
    waitingListCount: 0
  });

  // Farmer joins waitlist for full slot
  const joinRes1 = await window.CapacityEngine.joinWaitlist({
    centerId: fullCenter,
    date: testDate,
    timeSlot: testSlot,
    estimatedQuantityQtl: 40,
    farmerEmail: 'farmerA@gmail.com',
    farmerUid: 'uid_farmer_A',
    farmerName: 'Farmer A'
  });
  assert(joinRes1.success === true, 'Farmer A joined waitlist for full slot');

  const joinRes2 = await window.CapacityEngine.joinWaitlist({
    centerId: fullCenter,
    date: testDate,
    timeSlot: testSlot,
    estimatedQuantityQtl: 120, // Requires 120 Qtl
    farmerEmail: 'farmerB@gmail.com',
    farmerUid: 'uid_farmer_B',
    farmerName: 'Farmer B'
  });
  assert(joinRes2.success === true, 'Farmer B joined waitlist for full slot');

  // Verify waitlist count updated
  const capSnap = await window.db.ref(`slotCapacities/${fullCenter}/${testDate}/${testSlot}`).once('value');
  assert(capSnap.val().waitingListCount === 2, 'Slot capacity reflects 2 waitlist entries');

  // Release capacity: 1 farmer cancels 50 Qtl
  await window.CapacityEngine.releaseSlotCapacity({
    centerId: fullCenter,
    date: testDate,
    timeSlot: testSlot,
    estimatedQuantityQtl: 50
  });

  // Wait brief moment for async waitlist evaluation
  await new Promise(r => setTimeout(r, 250));

  // Verify Farmer A (requested 40 Qtl <= 50 Qtl available) was promoted!
  const waitA = await window.db.ref(`waitingList/${fullCenter}/${testDate}/${testSlot}/${joinRes1.waitEntry.waitlistId}`).once('value');
  assert(waitA.val().status === 'promoted', 'Farmer A (40 Qtl) was automatically promoted to confirmed token');

  // Verify Farmer B (requested 120 Qtl > 10 Qtl left) remains waiting
  const waitB = await window.db.ref(`waitingList/${fullCenter}/${testDate}/${testSlot}/${joinRes2.waitEntry.waitlistId}`).once('value');
  assert(waitB.val().status === 'waiting', 'Farmer B (120 Qtl) remained waiting due to insufficient released quantity capacity');

  // 22. Important Race Condition Test: Single Slot Double Booking Protection
  const raceCenter = 'center-ludhiana-02'; // maxFarmers: 8, maxQty: 400
  const raceDate = '2026-09-15';
  const raceSlot = '8AM-10AM';

  await window.db.ref(`slotCapacities/${raceCenter}/${raceDate}/${raceSlot}`).set({
    bookedCount: 7,
    bookedQuantity: 300,
    waitingListCount: 0
  });

  const req1 = window.CapacityEngine.reserveSlotCapacity({ centerId: raceCenter, date: raceDate, timeSlot: raceSlot, estimatedQuantityQtl: 50 });
  const req2 = window.CapacityEngine.reserveSlotCapacity({ centerId: raceCenter, date: raceDate, timeSlot: raceSlot, estimatedQuantityQtl: 50 });

  const [raceRes1, raceRes2] = await Promise.all([req1, req2]);
  const raceSuccessCount = (raceRes1.success ? 1 : 0) + (raceRes2.success ? 1 : 0);
  assert(raceSuccessCount === 1, 'Simultaneous final-slot reservations resulted in exactly 1 success and 1 safe failure');

  const finalRaceCap = await window.db.ref(`slotCapacities/${raceCenter}/${raceDate}/${raceSlot}`).once('value');
  assert(finalRaceCap.val().bookedCount === 8, 'Final bookedCount is exactly 8 (no overbooking)');

  console.log(`\n=== RESULT: ${passCount}/${totalTests} TESTS PASSED ===`);
  if (passCount !== totalTests) process.exit(1);
}

runPhase3Validation().catch(console.error);
