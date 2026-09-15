/**
 * firebase-config.js
 * Firebase initialization — Dual Mode:
 * 1. Production Mode: Uses live Firebase Realtime Database & Auth if credentials are configured.
 * 2. Local Simulator Mode: If placeholder keys ("YOUR_API_KEY") are detected, it automatically
 *    activates a real-time in-browser reactive database with multi-tab BroadcastChannel sync
 *    and pre-seeded demonstration tokens for instant out-of-the-box evaluation.
 */

// ╔════════════════════════════════════════════════════════════╗
// ║  REPLACE these values with your Firebase project config   ║
// ║  Firebase Console → Project Settings → Your Apps          ║
// ╚════════════════════════════════════════════════════════════╝
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "your-app.firebaseapp.com",
  databaseURL: "https://your-app-default-rtdb.firebaseio.com",
  projectId: "your-app",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};

const isSimulator = typeof firebase === 'undefined' || !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_") || firebaseConfig.apiKey.includes("AIzaSyA5");

let db, auth, functions;

if (!isSimulator) {
  // ─────────────────────────────────────────────────────────────
  // Live Firebase Setup (Compat SDK v9)
  // ─────────────────────────────────────────────────────────────
  firebase.initializeApp(firebaseConfig);
  db        = firebase.database();
  auth      = firebase.auth();
  functions = firebase.app().functions('asia-south1');
  console.log('🌾 [Smart Mandi] Connected to Live Firebase');
} else {
  // ─────────────────────────────────────────────────────────────
  // Local Reactive Simulator (Zero-Config, Instant Multi-Tab Demo)
  // ─────────────────────────────────────────────────────────────
  console.info('🌾 [Smart Mandi] Running in Local Simulator Mode (Zero-Config Evaluation)');

  const STORAGE_KEY = 'mandi_tokens_db';
  const AUTH_KEY    = 'mandi_auth_session';
  const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mandi_token_sync') : null;

  // Initialize seed data for centers, capacities, tokens, users
  function migrateLegacyToken(token) {
    if (!token) return token;
    const legacyStatus = token.status || 'Token Issued';

    const estQty = typeof token.estimatedQuantityQtl === 'number'
      ? token.estimatedQuantityQtl
      : (parseFloat(token.quantity) || 50);

    const actQty = typeof token.actualQuantityQtl === 'number'
      ? token.actualQuantityQtl
      : (token.actualQuantity ? parseFloat(token.actualQuantity) : null);

    const centerId = token.centerId || 'center-ludhiana-01';
    const centerName = token.centerName || 'Central Mandi Hub Ludhiana';

    let bStatus = token.bookingStatus || 'confirmed';
    let aStatus = token.arrivalStatus || 'pending';
    let qStatus = token.queueStatus || 'waiting';
    let wStatus = token.weighmentStatus || 'pending';
    let quStatus = token.qualityStatus || 'pending';
    let prStatus = token.procurementStatus || 'pending';
    let pyStatus = token.paymentStatus || 'pending';

    if (legacyStatus === 'Gate Entry') {
      aStatus = 'on_time';
      qStatus = 'called';
    } else if (legacyStatus === 'Quality Check') {
      aStatus = 'on_time';
      qStatus = 'in_processing';
      quStatus = 'in_progress';
    } else if (legacyStatus === 'Weighment' || legacyStatus === 'Completed') {
      aStatus = 'on_time';
      qStatus = 'completed';
      wStatus = 'completed';
      quStatus = token.qualityData ? token.qualityData.decision : 'accepted';
      prStatus = 'completed';
      pyStatus = 'completed';
    }

    return {
      ...token,
      centerId,
      centerName,
      estimatedQuantityQtl: estQty,
      actualQuantityQtl: actQty,
      bookingStatus: bStatus,
      arrivalStatus: aStatus,
      queueStatus: qStatus,
      weighmentStatus: wStatus,
      qualityStatus: quStatus,
      procurementStatus: prStatus,
      paymentStatus: pyStatus
    };
  }

  window.migrateLegacyToken = migrateLegacyToken;

  function seedInitialData() {
    let existing = {};
    try {
      existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      existing = {};
    }

    const defaultCenters = {
      "center-ludhiana-01": {
        "id": "center-ludhiana-01",
        "name": "Central Mandi Hub Ludhiana",
        "district": "Ludhiana",
        "address": "GT Road, Near Grain Market, Ludhiana",
        "lat": 30.9010,
        "lng": 75.8573,
        "operationalStatus": "active",
        "workingHours": { "start": "06:00", "end": "18:00" },
        "slotDurationMins": 120,
        "maxFarmersPerSlot": 10,
        "maxQuantityPerSlot": 500,
        "activeWeighbridges": 3,
        "avgProcessingTimeMins": 12,
        "gracePeriodMins": 15,
        "noShowThresholdMins": 60
      },
      "center-ludhiana-02": {
        "id": "center-ludhiana-02",
        "name": "North Regional Grain Yard",
        "district": "Ludhiana",
        "address": "Bhadson Road, Ludhiana North",
        "lat": 30.9250,
        "lng": 75.8320,
        "operationalStatus": "busy",
        "workingHours": { "start": "06:00", "end": "18:00" },
        "slotDurationMins": 120,
        "maxFarmersPerSlot": 8,
        "maxQuantityPerSlot": 400,
        "activeWeighbridges": 2,
        "avgProcessingTimeMins": 15,
        "gracePeriodMins": 15,
        "noShowThresholdMins": 60
      },
      "center-ludhiana-03": {
        "id": "center-ludhiana-03",
        "name": "East Mandi Sub-Center",
        "district": "Ludhiana",
        "address": "Chandigarh Highway, Sahnewal",
        "lat": 30.8420,
        "lng": 75.9810,
        "operationalStatus": "equipment_issue",
        "workingHours": { "start": "07:00", "end": "17:00" },
        "slotDurationMins": 120,
        "maxFarmersPerSlot": 5,
        "maxQuantityPerSlot": 250,
        "activeWeighbridges": 1,
        "avgProcessingTimeMins": 20,
        "gracePeriodMins": 15,
        "noShowThresholdMins": 60
      },
      "center-ludhiana-04": {
        "id": "center-ludhiana-04",
        "name": "West Grain Yard",
        "district": "Ludhiana",
        "address": "Ferozepur Road, Mullanpur",
        "lat": 30.8710,
        "lng": 75.7230,
        "operationalStatus": "full",
        "workingHours": { "start": "06:00", "end": "18:00" },
        "slotDurationMins": 120,
        "maxFarmersPerSlot": 6,
        "maxQuantityPerSlot": 300,
        "activeWeighbridges": 2,
        "avgProcessingTimeMins": 14,
        "gracePeriodMins": 15,
        "noShowThresholdMins": 60
      }
    };

    const defaultCapacities = {
      "center-ludhiana-01": {
        "2026-09-07": {
          "6AM-8AM": { bookedCount: 2, bookedQuantity: 90, waitingListCount: 0 },
          "8AM-10AM": { bookedCount: 4, bookedQuantity: 180.5, waitingListCount: 1 },
          "10AM-12PM": { bookedCount: 1, bookedQuantity: 40, waitingListCount: 0 }
        }
      }
    };

    // Ensure centers & slotCapacities exist
    if (!existing.centers) existing.centers = defaultCenters;
    if (!existing.slotCapacities) existing.slotCapacities = defaultCapacities;
    if (!existing.tokens) existing.tokens = {};
    if (!existing.waitingList) existing.waitingList = {};
    if (!existing.auditLogs) existing.auditLogs = {};
    if (!existing.users) existing.users = {};

    // Migrate any existing tokens to 7-state format
    Object.keys(existing.tokens).forEach(tid => {
      existing.tokens[tid] = migrateLegacyToken(existing.tokens[tid]);
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  }

  seedInitialData();

  function getStoredTokens() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (!data.centers) seedInitialData();
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveStoredTokens(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    notifyLocalListeners();
    if (syncChannel) {
      syncChannel.postMessage({ type: 'SYNC_UPDATE', timestamp: Date.now() });
    }
  }

  const registeredListeners = new Set();

  function notifyLocalListeners() {
    registeredListeners.forEach(listener => {
      try { listener(); } catch (e) { console.warn(e); }
    });
  }

  if (syncChannel) {
    syncChannel.onmessage = () => notifyLocalListeners();
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) notifyLocalListeners();
    });
  }

  function createSnapshot(val) {
    const exists = val !== null && val !== undefined && (typeof val !== 'object' || Object.keys(val).length > 0);
    return {
      exists: () => exists,
      val: () => val,
      key: typeof val === 'object' && val ? (val.id || val.tokenId || null) : null,
      forEach: (cb) => {
        if (val && typeof val === 'object') {
          Object.keys(val).forEach(k => cb(createSnapshot(val[k])));
        }
      }
    };
  }

  function getValueAtPath(obj, pathStr) {
    if (!obj || typeof obj !== 'object') return null;
    const parts = pathStr.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (parts.length === 0) return obj;
    let curr = obj;
    for (let i = 0; i < parts.length; i++) {
      if (curr && typeof curr === 'object' && parts[i] in curr) {
        curr = curr[parts[i]];
      } else {
        return null;
      }
    }
    return curr;
  }

  function setValueAtPath(obj, pathStr, value) {
    const parts = pathStr.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (parts.length === 0) return value;
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!curr[parts[i]] || typeof curr[parts[i]] !== 'object') {
        curr[parts[i]] = {};
      }
      curr = curr[parts[i]];
    }
    if (value === null || value === undefined) {
      delete curr[parts[parts.length - 1]];
    } else {
      curr[parts[parts.length - 1]] = value;
    }
    return obj;
  }

  class MockRef {
    constructor(pathStr = '', filterKey = null, filterVal = null) {
      this.path = pathStr.replace(/^\/+|\/+$/g, '');
      this.filterKey = filterKey;
      this.filterVal = filterVal;
    }

    ref(childPath = '') {
      const full = this.path ? `${this.path}/${childPath}` : childPath;
      return new MockRef(full);
    }

    orderByChild(field) {
      return {
        equalTo: (val) => new MockRef(this.path, field, val)
      };
    }

    push(value) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      const generatedKey = `KEY_${Date.now()}_${rand}`;
      const childRef = new MockRef(this.path ? `${this.path}/${generatedKey}` : generatedKey);
      if (value !== undefined) {
        childRef.set(value);
      }
      return {
        key: generatedKey,
        set: (v) => childRef.set(v),
        once: (e) => childRef.once(e),
        on: (e, cb) => childRef.on(e, cb)
      };
    }

    _resolveData() {
      const rootData = getStoredTokens();
      const rawData = getValueAtPath(rootData, this.path);

      if (this.filterKey && this.filterVal !== null && rawData && typeof rawData === 'object') {
        const filtered = {};
        Object.keys(rawData).forEach(k => {
          if (rawData[k] && rawData[k][this.filterKey] === this.filterVal) {
            filtered[k] = rawData[k];
          }
        });
        return filtered;
      }
      return rawData;
    }

    async set(value) {
      const rootData = getStoredTokens();
      setValueAtPath(rootData, this.path, value);
      saveStoredTokens(rootData);
      return true;
    }

    async update(updates) {
      const rootData = getStoredTokens();
      Object.keys(updates).forEach(upPath => {
        const val = updates[upPath];
        const fullPath = this.path ? `${this.path}/${upPath}` : upPath;
        setValueAtPath(rootData, fullPath, val);
      });
      saveStoredTokens(rootData);
      return true;
    }

    async transaction(updateFn) {
      if (typeof updateFn !== 'function') {
        throw new Error('Transaction requires an update function');
      }
      const rootData = getStoredTokens();
      const currentValue = getValueAtPath(rootData, this.path);

      const clonedCurrent = currentValue !== null && typeof currentValue === 'object'
        ? JSON.parse(JSON.stringify(currentValue))
        : currentValue;

      let resultValue;
      try {
        resultValue = updateFn(clonedCurrent);
      } catch (err) {
        console.warn('[MockRef.transaction] Update function threw error:', err);
        return { committed: false, snapshot: createSnapshot(currentValue) };
      }

      if (resultValue === undefined) {
        return { committed: false, snapshot: createSnapshot(currentValue) };
      }

      setValueAtPath(rootData, this.path, resultValue);
      saveStoredTokens(rootData);

      return {
        committed: true,
        snapshot: createSnapshot(resultValue)
      };
    }

    on(eventType, callback) {
      const handler = () => {
        const data = this._resolveData();
        callback(createSnapshot(data));
      };
      registeredListeners.add(handler);
      setTimeout(handler, 10);
      return handler;
    }

    off(eventType, callback) {
      if (callback) {
        registeredListeners.delete(callback);
      }
    }

    async once(eventType) {
      const data = this._resolveData();
      return createSnapshot(data);
    }
  }

  // Auth mock
  const authListeners = new Set();
  function getAuthUser() {
    try {
      return JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null');
    } catch {
      return null;
    }
  }

  auth = {
    get currentUser() {
      const u = getAuthUser();
      if (!u) return null;
      return {
        ...u,
        sendEmailVerification: async () => {
          console.log(`[Auth Simulator] Verification email sent to ${u.email}`);
          return true;
        }
      };
    },
    async signInWithEmailAndPassword(email, password) {
      if (!email || !password) {
        const err = new Error('Missing credentials');
        err.code = 'auth/invalid-email';
        throw err;
      }
      const user = {
        email: email,
        uid: 'demo-user-uid-' + Date.now(),
        displayName: email.split('@')[0],
        emailVerified: true,
        sendEmailVerification: async () => {
          console.log(`[Auth Simulator] Verification email sent to ${email}`);
          return true;
        }
      };
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
      authListeners.forEach(fn => fn(user));
      return { user };
    },
    async createUserWithEmailAndPassword(email, password) {
      if (!email || !password) {
        const err = new Error('Missing registration details');
        err.code = 'auth/invalid-email';
        throw err;
      }
      if (password.length < 6) {
        const err = new Error('Password should be at least 6 characters');
        err.code = 'auth/weak-password';
        throw err;
      }
      const user = {
        email: email,
        uid: 'user-' + Date.now(),
        displayName: email.split('@')[0],
        emailVerified: false,
        sendEmailVerification: async () => {
          console.log(`[Auth Simulator] Verification email sent to ${email}`);
          return true;
        }
      };
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
      authListeners.forEach(fn => fn(user));
      return { user };
    },
    async sendPasswordResetEmail(email) {
      if (!email || !email.includes('@')) {
        const err = new Error('Invalid email');
        err.code = 'auth/invalid-email';
        throw err;
      }
      console.log(`[Auth Simulator] Password reset email sent to ${email}`);
      return true;
    },
    async signOut() {
      sessionStorage.removeItem(AUTH_KEY);
      authListeners.forEach(fn => fn(null));
    },
    onAuthStateChanged(callback) {
      authListeners.add(callback);
      setTimeout(() => callback(getAuthUser()), 10);
      return () => authListeners.delete(callback);
    }
  };

  db = {
    ref: (path) => new MockRef(path)
  };

  functions = {
    httpsCallable: (fnName) => {
      return async (payload) => {
        console.log(`[SMS Simulator] Dispatched '${fnName}':`, payload);
        return { data: { success: true, messageId: 'SIM-' + Date.now() } };
      };
    }
  };
}

// Global exposure
window.db          = db;
window.auth        = auth;
window.functions   = functions;
window.isSimulator = isSimulator;
