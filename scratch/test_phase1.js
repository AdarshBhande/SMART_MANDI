/**
 * test_phase1.js
 * Automated test runner for Phase 1 verification
 */

const fs = require('fs');
const path = require('path');

// Mock localStorage & sessionStorage in Node for testing firebase-config simulator
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

// Load firebase-config.js
const fbConfigCode = fs.readFileSync(path.join(rootDir, 'public/js/firebase-config.js'), 'utf8');
eval(fbConfigCode);

// Load audit-logger.js
const auditCode = fs.readFileSync(path.join(rootDir, 'public/js/audit-logger.js'), 'utf8');
eval(auditCode);

async function runPhase1Validation() {
  console.log('--- RUNNING PHASE 1 VALIDATION ---');
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

  // 1. Verify Centers Schema
  const centersSnap = await window.db.ref('centers').once('value');
  assert(centersSnap.exists(), 'Centers schema seeded successfully');
  const centers = centersSnap.val();
  assert(centers && Object.keys(centers).length >= 4, 'At least 4 demo centers seeded');
  assert(centers['center-ludhiana-01'].operationalStatus === 'active', 'Center 1 operationalStatus is active');
  assert(centers['center-ludhiana-02'].operationalStatus === 'busy', 'Center 2 operationalStatus is busy');
  assert(centers['center-ludhiana-03'].operationalStatus === 'equipment_issue', 'Center 3 operationalStatus is equipment_issue');
  assert(centers['center-ludhiana-04'].operationalStatus === 'full', 'Center 4 operationalStatus is full');

  // 2. Verify Slot Capacity Schema
  const capSnap = await window.db.ref('slotCapacities/center-ludhiana-01/2026-09-07/8AM-10AM').once('value');
  assert(capSnap.exists(), 'Slot capacities schema seeded successfully');
  const capVal = capSnap.val();
  assert(typeof capVal.bookedCount === 'number' && typeof capVal.bookedQuantity === 'number', 'Booked count and quantity are numeric');

  // 3. Test MockRef.transaction() - Successful update
  const txRef = window.db.ref('slotCapacities/center-ludhiana-01/2026-09-07/8AM-10AM');
  const txRes = await txRef.transaction((current) => {
    current.bookedCount += 1;
    current.bookedQuantity += 45;
    return current;
  });
  assert(txRes.committed === true, 'MockRef.transaction() committed successfully');
  const updatedCap = txRes.snapshot.val();
  assert(updatedCap.bookedCount === 5 && updatedCap.bookedQuantity === 225.5, 'Transaction value updated correctly');

  // 4. Test MockRef.transaction() - Abortion on undefined
  const abortRes = await txRef.transaction((current) => {
    // Return undefined to abort
    return undefined;
  });
  assert(abortRes.committed === false, 'MockRef.transaction() aborted successfully on undefined');

  // 5. Test 7-State Legacy Migration
  const legacyToken = {
    tokenId: 'MANDI-LEGACY-001',
    farmerName: 'Old Farmer',
    mobile: '9876543210',
    quantity: '50 Qtl',
    status: 'Gate Entry'
  };
  const migrated = window.migrateLegacyToken(legacyToken);
  assert(migrated.bookingStatus === 'confirmed', 'Migrated bookingStatus is confirmed');
  assert(migrated.arrivalStatus === 'on_time', 'Migrated arrivalStatus is on_time for Gate Entry');
  assert(migrated.queueStatus === 'called', 'Migrated queueStatus is called');
  assert(migrated.estimatedQuantityQtl === 50, 'Migrated estimatedQuantityQtl is numeric 50');

  // 6. Test Audit Logger
  const auditRes = await window.AuditLogger.logEvent({
    tokenId: 'MANDI-LEGACY-001',
    actorId: 'farmer_01',
    actorRole: 'Farmer',
    action: 'BOOKING_CREATED',
    fromState: 'draft',
    toState: 'confirmed',
    metadata: { note: 'Phase 1 verification test' }
  });
  assert(auditRes !== null && auditRes.action === 'BOOKING_CREATED', 'AuditLogger.logEvent wrote log record');

  const auditLogs = await window.AuditLogger.getLogs('MANDI-LEGACY-001');
  assert(auditLogs.length >= 1, 'AuditLogger.getLogs retrieved audit log records');

  console.log(`\n=== RESULT: ${passCount}/${totalTests} TESTS PASSED ===`);
  if (passCount !== totalTests) process.exit(1);
}

runPhase1Validation().catch(console.error);
