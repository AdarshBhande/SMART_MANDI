# Smart Mandi Token Scheduling & Procurement Platform (SIH 2026)

A complete, production-ready, security-hardened digital token, queue tracking, dual-capacity validation, and stage-management web platform designed for agricultural procurement mandis (markets) across India.

Developed in compliance with the **Smart India Hackathon 2026** specifications.

---

## 🌾 Project Overview

- **Problem:** Long waiting queues, congestion, and lack of transparency at agricultural procurement mandis result in crop spoilage, wasted farmer days, and logistical gridlock.
- **Solution:** Time-slotted digital token booking with atomic dual-capacity validation (farmer + quantity caps), multi-center smart recommendations, waiting list auto-promotion, 7-state independent procurement lifecycle tracking, real-time FCFS queue engine with station assignment, event-driven idempotent notifications, Gemini 1.5 Flash AI advisory layer, and historical analytics with congestion forecasting.

> **Core Platform Thesis:**  
> *Farmers should not come to the mandi just to wait. They should come because they already have a scheduled place in the procurement process.*

---

## 🌟 Key Architecture & Engine Components

### 1. Database & 7-State Lifecycle Engine (`public/js/firebase-config.js`)
- Enforces 7 independent lifecycle state fields per token:
  1. `bookingStatus`: `confirmed` | `cancelled` | `rescheduled` | `expired`
  2. `arrivalStatus`: `pending` | `arrived` | `late` | `no_show`
  3. `queueStatus`: `waiting` | `called` | `in_processing` | `completed` | `held` | `bypassed`
  4. `weighmentStatus`: `pending` | `in_progress` | `completed` | `rejected`
  5. `qualityStatus`: `pending` | `passed` | `rejected` | `re_inspection`
  6. `procurementStatus`: `pending` | `approved` | `rejected` | `completed`
  7. `paymentStatus`: `pending` | `initiated` | `completed` | `failed`

### 2. Dual-Capacity Validation Engine (`public/js/capacity-engine.js`)
- Enforces both `maxFarmersPerSlot` and `maxQuantityPerSlot` limits atomically using Firebase transactions (`MockRef.transaction()`).
- Auto-handles capacity reservation, release on cancellation/reschedule, and opt-in waitlist promotion.

### 3. Smart Center Recommendation & Waitlist Engine (`public/js/recommendation-engine.js`)
- Ranks nearby procurement centers based on distance, slot availability, and processing speed.
- Provides opt-in waitlisting when desired slots are fully booked. Auto-promotes eligible farmers upon slot release.

### 4. Queue Engine & Live Station Assignment (`public/js/queue-engine.js`)
- Manages first-come-first-served (FCFS) check-in ordering.
- Handles station assignment (Weighbridge / Quality Desk), concurrency protection (prevents double station assignment), hold/resume/bypass states, and dynamic wait-time estimation.

### 5. Event-Driven Notification Engine (`public/js/notifications.js`)
- Idempotent notification dispatcher supporting 14 distinct lifecycle events.
- Guarantees `dedupeKey` isolation so duplicate SMS/App alerts are never sent.

### 6. Server-Proxied Gemini AI Advisory Layer (`server.js`, `public/js/gemini-assistant.js`)
- Proxies requests through Node server (`POST /api/gemini`) keeping `GEMINI_API_KEY` strictly server-side.
- Strictly bounded authority: Gemini acts purely as an advisor/assistant and CANNOT mutate business state, override capacity, approve quality, or issue payments.
- Traps prompt injection attacks and handles offline states with clear `[Local Advisory]` fallback tags.

### 7. Historical Analytics & Forecast Engine (`public/js/analytics-engine.js`, `public/js/forecast-engine.js`)
- Calculates center-wise utilization (`max(farmerUtil, quantityUtil)`), station throughput, delay patterns, and payment completion metrics.
- Provides Weighted Recent Moving Average (WMA) forecast projections with honest sample-size confidence labeling (`LOW`, `MEDIUM`, `HIGH`).

---

## 📁 System Directory Layout

```text
sih2026/
├── server.js                   (Zero-dependency Node server & Gemini proxy)
├── package.json                (Node scripts & dependencies)
├── .env.example                (Template for environment secrets)
├── .gitignore                  (Excludes secrets and node_modules)
├── public/
│   ├── index.html              (Farmer portal & booking interface)
│   ├── admin.html              (11-module operational admin dashboard)
│   ├── tracker.html            (Real-time token status tracker)
│   ├── css/                    (Modular CSS design system)
│   └── js/
│       ├── firebase-config.js  (Firebase SDK init & local reactive DB simulator)
│       ├── audit-logger.js     (Centralized audit logging module)
│       ├── capacity-engine.js  (Atomic dual-capacity validation engine)
│       ├── recommendation-engine.js (Center ranking & waitlist engine)
│       ├── queue-engine.js     (Live queue management & wait-time calculator)
│       ├── notifications.js    (Event-driven idempotent notifications)
│       ├── gemini-assistant.js (Client AI interface & authority boundary guard)
│       ├── analytics-engine.js (Procurement & utilization analytics)
│       ├── forecast-engine.js  (Demand forecasting & confidence classifier)
│       ├── farmer.js           (Farmer UI workflow & token generator)
│       ├── admin.js            (Admin control dashboard controller)
│       └── tracker.js          (Farmer token status tracker controller)
└── scratch/
    ├── test_phase1.js  ... test_phase10.js (Automated integration & security test suites)
    └── PHASE_10_FINAL_REPORT.md             (Full system verification & audit report)
```

---

## 🧪 Comprehensive Test Suite (409/409 Passed)

Run all 10 automated test suites to verify system integrity:

```bash
node scratch/test_phase1.js   # Phase 1: Database & Audit (17/17 PASS)
node scratch/test_phase2.js   # Phase 2: Dual Capacity Engine (10/10 PASS)
node scratch/test_phase3.js   # Phase 3: Recommendation & Waitlist (13/13 PASS)
node scratch/test_phase4.js   # Phase 4: Rescheduling & Cancellation (17/17 PASS)
node scratch/test_phase5.js   # Phase 5: Admin Dashboard 11 Modules (50/50 PASS)
node scratch/test_phase6.js   # Phase 6: Queue Engine (54/54 PASS)
node scratch/test_phase7.js   # Phase 7: Notifications & Interruptions (44/44 PASS)
node scratch/test_phase8.js   # Phase 8: Gemini AI Layer & Boundaries (57/57 PASS)
node scratch/test_phase9.js   # Phase 9: Analytics & Demand Forecasting (80/80 PASS)
node scratch/test_phase10.js  # Phase 10: Full-System Integration & Security (101/101 PASS)
```

**Total Test Coverage:** **409 / 409 PASSED (100%)**

---

## 🛠️ How to Run Locally

### 1. Set Up Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` and set your optional `GEMINI_API_KEY`:
```ini
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. Start the Server
```bash
npm start
```
The server will start at `http://localhost:3000`.

### 3. Open in Browser
- **Farmer Booking Portal:** `http://localhost:3000/index.html`
- **Live Token Tracker:** `http://localhost:3000/tracker.html`
- **Admin Control Dashboard:** `http://localhost:3000/admin.html`

---

## 🔒 Security & RBAC Model

1. **Secret Isolation:** `GEMINI_API_KEY` is strictly held server-side. It is never transmitted to or embedded within client JavaScript code.
2. **Role-Based Access Control:** Admin dashboard operations require Admin or Operator role credentials.
3. **Gemini Authority Guard:** AI endpoints return advisory text only. Gemini cannot perform database writes or override business logic.
4. **Input Sanitization:** User inputs are escaped before rendering to prevent Cross-Site Scripting (XSS).

---

## 🎬 Competition Demonstration Flow

1. **Farmer Declaration & Recommendation:** Farmer declares 50 Qtl paddy -> Smart Recommendation suggests Karnal Main Mandi.
2. **Dual Capacity Validation:** System validates farmer count (e.g. 5/10) and quantity (e.g. 250/500 Qtl) atomically.
3. **Token Booking & Notification:** Booking confirmed (`MANDI-20260906-XXXX`); instant confirmation alert sent.
4. **Gate Check-In:** Admin checks in farmer at mandi gate -> Token enters Live Queue.
5. **Live Queue & Station Assignment:** FCFS algorithm assigns farmer to Weighbridge #1, then Quality Inspection Desk #1.
6. **Procurement & DBT Payment:** Quality approved -> Procurement completed -> DBT Payment initiated.
7. **Equipment Failure Interruption:** Admin marks center "Equipment Issue" -> Center booking blocked, queue paused, farmers auto-notified via notification engine.
8. **Analytics & AI Forecast:** Admin views real-time center utilization and weighted moving average congestion forecasts with Gemini explanation.
