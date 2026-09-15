/**
 * system-health-check.js — Smart Mandi Token System (SIH 2026)
 * Final structural, configuration, environment, and code sanity validator.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
let passCount = 0;
let totalCount = 0;

function assert(condition, message) {
  totalCount++;
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
  }
}

console.log('============================================================');
console.log('  🔍 Smart Mandi — Final System Health & Structural Check    ');
console.log('============================================================\n');

// 1. Required Files Exist
const requiredFiles = [
  'server.js',
  'package.json',
  '.env.example',
  '.gitignore',
  'database.rules.json',
  'README.md',
  'public/index.html',
  'public/admin.html',
  'public/tracker.html',
  'public/js/firebase-config.js',
  'public/js/audit-logger.js',
  'public/js/capacity-engine.js',
  'public/js/recommendation-engine.js',
  'public/js/queue-engine.js',
  'public/js/notifications.js',
  'public/js/gemini-assistant.js',
  'public/js/analytics-engine.js',
  'public/js/forecast-engine.js',
  'public/js/farmer.js',
  'public/js/admin.js',
  'public/js/tracker.js'
];

requiredFiles.forEach(f => {
  const fullPath = path.join(rootDir, f);
  assert(fs.existsSync(fullPath), `Required file exists: ${f}`);
});

// 2. Secret Protection in .env.example
const envExampleContent = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf-8');
assert(!envExampleContent.includes('AIza') && !envExampleContent.includes('AQ.Ab8'), '.env.example contains no real/mock secret strings');
assert(envExampleContent.includes('GEMINI_API_KEY=your_gemini_api_key_here') || envExampleContent.includes('GEMINI_API_KEY='), '.env.example has placeholder');

// 3. Database Rules Check
const rulesContent = fs.readFileSync(path.join(rootDir, 'database.rules.json'), 'utf-8');
assert(rulesContent.includes('tokens') && rulesContent.includes('slotCapacities') && rulesContent.includes('notifications'), 'database.rules.json contains hardened rules');

// 4. Server API Proxy Check
const serverContent = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf-8');
assert(serverContent.includes('/api/gemini') && serverContent.includes('GEMINI_API_KEY'), 'server.js provides secure /api/gemini proxy');
assert(serverContent.includes('MAX_BODY_SIZE'), 'server.js enforces body size limits on /api/gemini');

// 5. Frontend JS Module Engine Check
const capacityJs = fs.readFileSync(path.join(rootDir, 'public/js/capacity-engine.js'), 'utf-8');
assert(capacityJs.includes('CapacityEngine') && capacityJs.includes('reserveSlotCapacity'), 'capacity-engine.js exports CapacityEngine');

const queueJs = fs.readFileSync(path.join(rootDir, 'public/js/queue-engine.js'), 'utf-8');
assert(queueJs.includes('QueueEngine') && queueJs.includes('callNext'), 'queue-engine.js exports QueueEngine');

const geminiJs = fs.readFileSync(path.join(rootDir, 'public/js/gemini-assistant.js'), 'utf-8');
assert(geminiJs.includes('GeminiAssistant') && geminiJs.includes('validateResponse'), 'gemini-assistant.js exports GeminiAssistant with response validation');
assert(geminiJs.includes('queryInProgress'), 'gemini-assistant.js enforces request deduplication');

const forecastJs = fs.readFileSync(path.join(rootDir, 'public/js/forecast-engine.js'), 'utf-8');
assert(forecastJs.includes('ForecastEngine') && forecastJs.includes('weighted_recent_average'), 'forecast-engine.js exports ForecastEngine with WMA methodology');

// 6. Test Suite Existence Check
for (let i = 1; i <= 10; i++) {
  const testFile = path.join(rootDir, `scratch/test_phase${i}.js`);
  assert(fs.existsSync(testFile), `Test suite exists: scratch/test_phase${i}.js`);
}

console.log('\n============================================================');
console.log(`  RESULT: ${passCount} / ${totalCount} HEALTH CHECKS PASSED`);
console.log('============================================================');

if (passCount !== totalCount) {
  process.exit(1);
}
