You are a senior full-stack developer. Build a complete Smart Mandi Token & Procurement 
Tracker web application for Indian farmers based on the following specifications. 
Do NOT skip any feature. Build everything end-to-end.

---

## PROJECT OVERVIEW

**Name:** Smart Mandi Token & Queue Management System  
**Purpose:** Eliminate long waiting times at agricultural procurement mandis (markets) by 
providing farmers with digital time-slotted tokens, real-time stage tracking, and instant 
SMS alerts — accessible from both smartphones and basic feature phones.

**Target Users:**
1. Farmers (register, get token, track status via web or SMS)
2. Mandi Officials/Admins (manage queue, advance stages, view dashboard)

---

## TECH STACK (Mandatory — use exactly these)

- Frontend: HTML5, CSS3, Vanilla JavaScript (ES6+)
- Database: Firebase Realtime Database
- Authentication: Firebase Auth (for admin panel)
- Hosting: Firebase Hosting
- SMS Gateway: Fast2SMS REST API (primary) with Twilio as fallback
- Offline Support: LocalStorage caching for offline data entry
- Backend Functions: Firebase Cloud Functions (for secure SMS API calls — 
  never expose API keys in client-side code)

---

## APPLICATION MODULES — BUILD ALL OF THEM

### MODULE 1: FARMER REGISTRATION & TOKEN BOOKING PAGE
**File:** index.html (public-facing)

UI Elements:
- Header with app name "Smart Mandi Token System" and SIH branding
- Registration form with these fields:
  - Farmer Name (text, required)
  - Mobile Number (10-digit, required — used for SMS alerts)
  - Crop Type (dropdown: Wheat, Rice, Maize, Cotton, Sugarcane, Other)
  - Estimated Quantity (in quintals, number input)
  - Preferred Date (date picker — only future dates allowed)
  - Preferred Time Slot (dropdown: 6AM-8AM, 8AM-10AM, 10AM-12PM, 
    12PM-2PM, 2PM-4PM, 4PM-6PM)
  - Vehicle Number (text, optional)
- "Book Token" button
- After successful submission:
  - Show a large Token Card with:
    - Unique Token ID (format: MANDI-YYYYMMDD-XXXX where XXXX is 4-digit random)
    - Farmer name, crop, quantity
    - Assigned time slot
    - Current status badge: "Token Issued" (green)
    - QR Code of the Token ID (use qrcode.js CDN library)
  - Show "Download Token PDF" button (use jsPDF + html2canvas)
  - Show "Track My Token" link that navigates to tracker page

Logic:
- On form submit, push token record to Firebase path: /tokens/{tokenId}
- Token record structure:
  {
    tokenId: "MANDI-20260906-1234",
    farmerName: "Ram Kumar",
    mobile: "9876543210",
    cropType: "Wheat",
    quantity: 50,
    date: "2026-09-06",
    timeSlot: "8AM-10AM",
    vehicleNumber: "MH12AB1234",
    status: "Token Issued",
    stages: {
      tokenIssued: { completed: true, timestamp: "ISO string" },
      gateEntry: { completed: false, timestamp: null },
      qualityCheck: { completed: false, timestamp: null },
      weighment: { completed: false, timestamp: null }
    },
    createdAt: "ISO timestamp"
  }
- After writing to Firebase, immediately call the SMS Cloud Function to send 
  confirmation SMS to the farmer's mobile
- If Firebase write fails, cache the form data in LocalStorage under key 
  "pendingTokens" and show a "Saved offline — will sync when connected" message
- On app load, check LocalStorage for pendingTokens and sync them when online

---

### MODULE 2: FARMER TOKEN TRACKER PAGE
**File:** tracker.html

UI Elements:
- Token ID input field with "Track" button
- OR: Auto-populate token ID from URL query param (?token=MANDI-20260906-1234)
- Display a live-updating Procurement Journey Tracker showing 4 stages as a 
  horizontal step indicator (like a progress bar with checkpoints):
  
  [Token Issued ✅] ──── [Gate Entry ⏳] ──── [Quality Check ⏳] ──── [Weighment ⏳]

- Each stage card shows:
  - Stage name and icon
  - Status: Completed (green checkmark) / Pending (grey) / In Progress (orange pulse)
  - Timestamp when completed (or "Awaiting..." if pending)
- Below the progress bar, show the full token details card
- Use Firebase .on('value') real-time listener on /tokens/{tokenId} so the page 
  updates automatically when admin advances a stage — NO page refresh needed
- Show estimated wait time based on how many tokens are ahead in the same time slot

---

### MODULE 3: ADMIN DASHBOARD
**File:** admin.html (protected by Firebase Auth login)

Login Screen:
- Email + Password login form
- Use Firebase Auth signInWithEmailAndPassword
- After login, show the dashboard

Dashboard Layout (use CSS Grid or Flexbox):

3A. STATISTICS HEADER BAR:
- Total Tokens Today (count)
- Tokens at Gate Entry (count)
- Tokens at Quality Check (count)
- Tokens Completed/Weighment Done (count)
- Display as 4 stat cards with colored icons

3B. LIVE TOKEN QUEUE TABLE:
- Firebase listener on /tokens filtered by today's date
- Table columns: Token ID | Farmer Name | Crop | Quantity | Time Slot | Current Stage | Actions
- Each row has action buttons:
  - "Advance Stage" button: moves token to next stage in sequence:
    Token Issued → Gate Entry → Quality Check → Weighment (Final)
  - "View Details" button: opens a modal with full token info
- Table auto-refreshes via Firebase real-time listeners (no manual refresh)
- Add filter buttons: All | Token Issued | Gate Entry | Quality Check | Weighment
- Add search bar to filter by farmer name or token ID

3C. STAGE ADVANCEMENT LOGIC:
- When admin clicks "Advance Stage":
  - Update Firebase: set current stage's completed=true and timestamp=now
  - Set next stage as "In Progress"
  - Trigger SMS Cloud Function to notify farmer of stage advancement
  - The farmer's tracker page updates automatically via real-time listener

3D. MANUAL TOKEN CREATION:
- "Create Token Manually" button (for farmers who come in person)
- Same form as farmer registration but pre-filled by admin

3E. EXPORT:
- "Export Today's Tokens" button — download CSV with all token data

---

### MODULE 4: FIREBASE CLOUD FUNCTIONS (backend/index.js)
**Critical: All SMS API calls must go through Cloud Functions — never client-side**

Function 1: onTokenCreate (triggers on /tokens/{tokenId} create)
- Sends SMS to farmer: 
  "Namaste {farmerName}! Your Mandi Token {tokenId} is confirmed for {date} 
   at {timeSlot}. Track status: https://yourapp.web.app/tracker.html?token={tokenId}"

Function 2: onStageUpdate (triggers on /tokens/{tokenId}/stages update)
- Detects which stage just became completed=true
- Sends stage-specific SMS:
  - Gate Entry: "Your token {tokenId} has cleared Gate Entry. Proceed to Quality Check area."
  - Quality Check: "Quality Check passed for token {tokenId}. Please move to Weighment."
  - Weighment: "Your token {tokenId} is at final Weighment stage. Your grain will be 
    processed shortly. Thank you!"

Function 3: sendSMS (HTTP callable function)
- Input: { mobile, message }
- Makes REST call to Fast2SMS API with proper API key from Firebase environment config
- Falls back to Twilio if Fast2SMS fails
- Returns: { success: true/false, messageId }

Fast2SMS API call format:
  POST https://www.fast2sms.com/dev/bulkV2
  Headers: { authorization: FAST2SMS_API_KEY }
  Body: { route: "v3", sender_id: "MNDISYS", message: "...", language: "english", 
          flash: 0, numbers: "9876543210" }

---

### MODULE 5: OFFLINE SUPPORT (implemented in main.js)

- On app load: check navigator.onLine
- If offline: show a banner "You are offline — data will sync when connected"
- On form submit when offline:
  - Save token data to LocalStorage key: "pendingTokens" (array of token objects)
  - Show: "Token saved locally. Will be submitted when you reconnect."
- Add event listener for window 'online' event:
  - When connection restores, loop through pendingTokens in LocalStorage
  - Push each one to Firebase
  - Send SMS for each
  - Clear pendingTokens from LocalStorage
  - Show success notification

---

### MODULE 6: UI/UX DESIGN REQUIREMENTS

Color Palette:
- Primary: #1B5E20 (deep green — agriculture theme)
- Secondary: #F9A825 (amber/golden — harvest theme)
- Accent: #0288D1 (sky blue — government/tech theme)
- Background: #F5F5F5
- Text: #212121
- Success: #4CAF50 | Warning: #FF9800 | Error: #F44336

Stage Status Colors:
- Completed: #4CAF50 (green) with ✅ icon
- In Progress: #FF9800 (orange) with pulsing animation
- Pending: #9E9E9E (grey) with ⏳ icon

Typography:
- Font: 'Noto Sans' (covers Devanagari for Hindi support) loaded from Google Fonts
- Headings: 700 weight | Body: 400 weight

Responsive Design:
- Mobile-first CSS with breakpoints at 480px, 768px, 1024px
- The farmer-facing pages (index.html, tracker.html) must work perfectly on 
  320px wide screens (old Android phones)
- Admin dashboard can be tablet/desktop optimized (min 768px)

Accessibility:
- All form inputs must have proper <label> tags
- ARIA attributes on status indicators
- High contrast text (minimum 4.5:1 ratio)
- Large touch targets (minimum 44x44px) for mobile

Animations:
- CSS pulse animation on "In Progress" stage indicator
- Smooth slide-in for token card after successful booking
- Loading spinner (CSS-only) during Firebase operations

Language:
- All UI text in English
- Add a language toggle button to show key text in Hindi using a simple JS object 
  mapping of translations (no external library needed)

---

### MODULE 7: PROJECT FILE STRUCTURE

smart-mandi-token/
├── public/
│   ├── index.html          (Farmer registration + token booking)
│   ├── tracker.html        (Real-time token status tracker)
│   ├── admin.html          (Admin dashboard + login)
│   ├── css/
│   │   ├── main.css        (Shared styles, variables, responsive)
│   │   ├── farmer.css      (Farmer-specific styles)
│   │   ├── tracker.css     (Progress bar, stage indicator styles)
│   │   └── admin.css       (Dashboard, table, stats card styles)
│   ├── js/
│   │   ├── firebase-config.js   (Firebase init — read keys from env)
│   │   ├── farmer.js            (Token booking logic, QR, PDF)
│   │   ├── tracker.js           (Real-time stage tracking logic)
│   │   ├── admin.js             (Dashboard logic, auth, stage control)
│   │   ├── sms.js               (SMS API caller via Cloud Functions)
│   │   └── offline.js           (LocalStorage sync logic)
│   └── assets/
│       ├── logo.png
│       └── icons/ (SVG icons for each stage)
├── functions/
│   ├── index.js            (Firebase Cloud Functions)
│   └── package.json
├── firebase.json           (Hosting + Functions config)
├── .firebaserc
└── README.md

---

### MODULE 8: FIREBASE REALTIME DATABASE RULES

{
  "rules": {
    "tokens": {
      ".read": true,
      ".write": true,
      "$tokenId": {
        ".validate": "newData.hasChildren(['tokenId','farmerName','mobile',
                       'cropType','quantity','date','timeSlot','status','stages'])"
      }
    },
    "admin": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}

---

### MODULE 9: FIREBASE HOSTING CONFIG (firebase.json)

{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [{
      "source": "**/*.@(js|css)",
      "headers": [{ "key": "Cache-Control", "value": "max-age=3600" }]
    }]
  },
  "functions": { "source": "functions" }
}

---

### EXTERNAL CDN LIBRARIES (load via <script> tags — no npm for frontend)

- Firebase SDK 9 (compat): 
  https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js
  https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js
  https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js
- QR Code: https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js
- jsPDF: https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
- html2canvas: https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js

---

### DEPLOYMENT STEPS (include in README.md)

1. npm install -g firebase-tools
2. firebase login
3. firebase init (select Hosting + Realtime Database + Functions)
4. firebase functions:config:set fast2sms.key="YOUR_KEY" twilio.sid="SID" twilio.token="TOKEN"
5. cd functions && npm install
6. firebase deploy

---

### IMPORTANT CONSTRAINTS

1. NEVER put SMS API keys in public/ JavaScript files — only in Cloud Functions
2. All Firebase listeners must be detached (off()) when user navigates away (use 
   beforeunload event)
3. Token IDs must be truly unique — use Firebase push() key as suffix
4. The farmer registration page must work without login (public access)
5. Admin dashboard must redirect to login if not authenticated
6. All timestamps must be stored in ISO 8601 format and displayed in IST 
   (Indian Standard Time, UTC+5:30)
7. Mobile number validation: must be exactly 10 digits, starting with 6-9 (Indian numbers)
8. Add rate limiting in Cloud Function: max 5 tokens per mobile number per day
9. The app must score 90+ on Google Lighthouse for Performance and Accessibility

---

Build the complete application now. Start with the file structure, then build each 
module in order. Show the complete code for every file. Do not skip any file.