/**
 * scratch/reset_demo_data.js — Smart Mandi Token System (SIH 2026)
 * Development & Demo Data Reset Utility
 *
 * SAFETY RULES:
 * 1. Operates ONLY on local demo/simulator localStorage and test seed data.
 * 2. Requires explicit `--confirm` flag or `DEMO_RESET=true` env var.
 * 3. Never affects live production databases.
 */

'use strict';

const fs = require('fs');
const path = require('path');

console.log('============================================================');
console.log('  🌾 Smart Mandi — Development & Demo Data Reset Utility    ');
console.log('============================================================');

const args = process.argv.slice(2);
const confirmed = args.includes('--confirm') || process.env.DEMO_RESET === 'true';

if (!confirmed) {
  console.warn('⚠️ [WARNING] Demo Reset requires explicit confirmation.');
  console.warn('👉 Usage: node scratch/reset_demo_data.js --confirm');
  console.warn('👉 Or set env var: DEMO_RESET=true node scratch/reset_demo_data.js');
  console.log('============================================================');
  process.exit(0);
}

console.log('🔄 Executing Demo Reset...');

const mockDatabaseSeed = {
  isDemoData: true,
  lastResetAt: new Date().toISOString(),
  centers: {
    "center-ludhiana-01": {
      "id": "center-ludhiana-01",
      "name": "Central Mandi Hub Ludhiana",
      "district": "Ludhiana",
      "operationalStatus": "active",
      "maxFarmersPerSlot": 10,
      "maxQuantityPerSlot": 500,
      "isDemoData": true
    },
    "center-ludhiana-02": {
      "id": "center-ludhiana-02",
      "name": "North Regional Grain Yard",
      "district": "Ludhiana",
      "operationalStatus": "busy",
      "maxFarmersPerSlot": 8,
      "maxQuantityPerSlot": 400,
      "isDemoData": true
    }
  },
  tokens: {},
  slotCapacities: {},
  queues: {},
  auditLogs: []
};

const scratchDir = path.join(__dirname);
const seedFile = path.join(scratchDir, 'demo_reset_snapshot.json');

try {
  fs.writeFileSync(seedFile, JSON.stringify(mockDatabaseSeed, null, 2), 'utf-8');
  console.log('✅ Demo state snapshot created successfully at:');
  console.log(`   ${seedFile}`);
  console.log('✅ Demo reset complete.');
} catch (err) {
  console.error('❌ Reset failed:', err.message);
  process.exit(1);
}

console.log('============================================================');
