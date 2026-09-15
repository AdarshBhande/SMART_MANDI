/**
 * Smart Mandi Token System - Internationalization (i18n) Module
 * English & Hindi Translations Dictionary
 */

const translations = {
  en: {
    app_title: "Smart Mandi Token System",
    app_subtitle: "Government of India • SIH 2026",
    nav_book: "Book Token",
    nav_track: "Track Token",
    nav_admin: "Admin Portal",
    
    // Farmer Registration
    farmer_reg_title: "Farmer Token Booking",
    farmer_reg_subtitle: "Reserve your digital time slot for hassle-free agricultural crop procurement",
    label_farmer_name: "Farmer Full Name",
    placeholder_farmer_name: "e.g., Ram Kumar",
    label_mobile: "Mobile Number (for SMS updates)",
    placeholder_mobile: "10-digit mobile number",
    hint_mobile: "We will send time slot and stage updates to this number",
    label_crop_type: "Crop Type",
    label_quantity: "Estimated Quantity (in Quintals)",
    placeholder_quantity: "e.g., 50",
    label_preferred_date: "Preferred Date",
    label_time_slot: "Preferred Time Slot",
    label_vehicle: "Vehicle Number (Optional)",
    placeholder_vehicle: "e.g., MH12AB1234",
    btn_book_token: "Book Mandi Token",
    btn_booking: "Generating Token...",
    
    // Crops
    crop_wheat: "Wheat (गेहूं)",
    crop_rice: "Rice / Paddy (धान)",
    crop_maize: "Maize (मक्का)",
    crop_cotton: "Cotton (कपास)",
    crop_sugarcane: "Sugarcane (गन्ना)",
    crop_other: "Other (अन्य)",

    // Token Card
    token_issued_title: "Token Successfully Issued!",
    token_issued_subtitle: "Please present this token upon arrival at the mandi gate",
    label_token_id: "Token ID",
    label_status: "Current Status",
    label_date: "Procurement Date",
    label_slot: "Time Slot",
    label_crop: "Crop & Quantity",
    label_farmer: "Farmer Name",
    label_vehicle_card: "Vehicle No.",
    btn_download_pdf: "Download Token PDF",
    btn_track_now: "Track My Token",
    btn_book_another: "Book Another Token",

    // Tracker Page
    tracker_title: "Live Mandi Token Tracker",
    tracker_subtitle: "Real-time updates on your procurement queue and gate status",
    label_enter_token: "Enter Token ID",
    placeholder_enter_token: "e.g., MANDI-20260906-1234",
    btn_track: "Track Status",
    live_updates: "Live Real-Time Updates Active",
    wait_time_title: "Estimated Waiting Time",
    wait_time_calc: "Calculating...",
    tokens_ahead: "Tokens Ahead of You",
    stage_1_name: "Token Issued",
    stage_2_name: "Gate Entry",
    stage_3_name: "Quality Check",
    stage_4_name: "Weighment",
    status_completed: "Completed",
    status_in_progress: "In Progress",
    status_pending: "Awaiting",
    timestamp_awaiting: "Awaiting verification...",

    // Admin Dashboard
    admin_title: "Mandi Official Dashboard",
    admin_subtitle: "Queue management and stage advancement control",
    admin_login_title: "Mandi Official Login",
    admin_login_subtitle: "Sign in with your authorized mandi officer credentials",
    label_email: "Official Email Address",
    label_password: "Password",
    btn_login: "Login to Dashboard",
    btn_demo_login: "One-Click Demo Login",
    btn_logout: "Sign Out",
    stat_total_today: "Total Tokens Today",
    stat_gate_entry: "At Gate Entry",
    stat_quality_check: "At Quality Check",
    stat_weighment_done: "Weighment Done",
    col_token_id: "Token ID",
    col_farmer: "Farmer Name",
    col_crop: "Crop",
    col_quantity: "Qty (Qtl)",
    col_slot: "Slot",
    col_stage: "Stage",
    col_actions: "Actions",
    btn_advance_stage: "Advance Stage",
    btn_view_details: "View Details",
    btn_create_manual: "Create Token Manually",
    btn_export_csv: "Export Today's Tokens (CSV)",
    filter_all: "All",
    search_placeholder: "Search by Farmer Name or Token ID...",
    modal_token_details: "Token Details & Audit Log",
    modal_walk_in: "Manual Walk-in Token Registration",

    // Offline & Notifications
    offline_msg: "You are currently offline. New tokens will be stored locally and synced automatically once internet is restored.",
    offline_saved_toast: "Token saved offline! It will be synced when you are back online.",
    online_synced_toast: "Internet reconnected! Offline tokens synced to database."
  },
  hi: {
    app_title: "स्मार्ट मंडी टोकन प्रणाली",
    app_subtitle: "भारत सरकार • एसआईएच 2026",
    nav_book: "टोकन बुक करें",
    nav_track: "टोकन ट्रैक करें",
    nav_admin: "अधिकारी पोर्टल",

    // Farmer Registration
    farmer_reg_title: "किसान टोकन बुकिंग",
    farmer_reg_subtitle: "मंडी में कतार मुक्त फसल खरीद के लिए डिजिटल समय-स्लॉट टोकन प्राप्त करें",
    label_farmer_name: "किसान का पूरा नाम",
    placeholder_farmer_name: "उदा. राम कुमार",
    label_mobile: "मोबाइल नंबर (एसएमएस अलर्ट के लिए)",
    placeholder_mobile: "10 अंकों का मोबाइल नंबर",
    hint_mobile: "हम इस नंबर पर समय स्लॉट और स्थिति अपडेट भेजेंगे",
    label_crop_type: "फसल का प्रकार",
    label_quantity: "अनुमानित मात्रा (क्विंटल में)",
    placeholder_quantity: "उदा. 50",
    label_preferred_date: "पसंदीदा तारीख",
    label_time_slot: "पसंदीदा समय स्लॉट",
    label_vehicle: "वाहन संख्या (वैकल्पिक)",
    placeholder_vehicle: "उदा. MH12AB1234",
    btn_book_token: "मंडी टोकन बुक करें",
    btn_booking: "टोकन जारी हो रहा है...",

    // Crops
    crop_wheat: "गेहूं (Wheat)",
    crop_rice: "धान / चावल (Rice)",
    crop_maize: "मक्का (Maize)",
    crop_cotton: "कपास (Cotton)",
    crop_sugarcane: "गन्ना (Sugarcane)",
    crop_other: "अन्य (Other)",

    // Token Card
    token_issued_title: "टोकन सफलतापूर्वक जारी हुआ!",
    token_issued_subtitle: "कृपया मंडी गेट पर आगमन के समय यह टोकन और क्यूआर कोड दिखाएं",
    label_token_id: "टोकन संख्या (ID)",
    label_status: "वर्तमान स्थिति",
    label_date: "खरीद की तारीख",
    label_slot: "समय स्लॉट",
    label_crop: "फसल और मात्रा",
    label_farmer: "किसान का नाम",
    label_vehicle_card: "वाहन नंबर",
    btn_download_pdf: "टोकन पीडीएफ डाउनलोड करें",
    btn_track_now: "टोकन ट्रैक करें",
    btn_book_another: "दूसरा टोकन बुक करें",

    // Tracker Page
    tracker_title: "लाइव मंडी टोकन ट्रैकर",
    tracker_subtitle: "अपनी खरीद कतार और गेट स्थिति का वास्तविक समय (Real-time) विवरण",
    label_enter_token: "टोकन आईडी दर्ज करें",
    placeholder_enter_token: "उदा. MANDI-20260906-1234",
    btn_track: "स्थिति जांचें",
    live_updates: "सक्रिय रियल-टाइम लाइव ट्रैकिंग",
    wait_time_title: "अनुमानित प्रतीक्षा समय",
    wait_time_calc: "गणना हो रही है...",
    tokens_ahead: "कतार में आपसे आगे टोकन",
    stage_1_name: "टोकन जारी (Token Issued)",
    stage_2_name: "गेट प्रवेश (Gate Entry)",
    stage_3_name: "गुणवत्ता जांच (Quality Check)",
    stage_4_name: "तौल/वजन (Weighment)",
    status_completed: "पूर्ण (Completed)",
    status_in_progress: "प्रगति पर (In Progress)",
    status_pending: "प्रतीक्षारत (Awaiting)",
    timestamp_awaiting: "सत्यापन की प्रतीक्षा है...",

    // Admin Dashboard
    admin_title: "मंडी अधिकारी डैशबोर्ड",
    admin_subtitle: "कतार प्रबंधन एवं चरण नियंत्रण प्रणाली",
    admin_login_title: "मंडी अधिकारी लॉगिन",
    admin_login_subtitle: "अपने अधिकृत मंडी खाते से लॉगिन करें",
    label_email: "अधिकारिक ईमेल पता",
    label_password: "पासवर्ड",
    btn_login: "डैशबोर्ड लॉगिन",
    btn_demo_login: "डेमो लॉगिन (तत्काल जांच)",
    btn_logout: "लॉगआउट",
    stat_total_today: "आज के कुल टोकन",
    stat_gate_entry: "गेट प्रवेश पर",
    stat_quality_check: "गुणवत्ता जांच पर",
    stat_weighment_done: "तौल संपन्न (पूर्ण)",
    col_token_id: "टोकन आईडी",
    col_farmer: "किसान का नाम",
    col_crop: "फसल",
    col_quantity: "मात्रा (क्विंटल)",
    col_slot: "स्लॉट",
    col_stage: "वर्तमान चरण",
    col_actions: "कार्रवाई",
    btn_advance_stage: "अगले चरण में भेजें",
    btn_view_details: "विवरण देखें",
    btn_create_manual: "मैन्युअल टोकन बनाएं",
    btn_export_csv: "आज के टोकन डाउनलोड करें (CSV)",
    filter_all: "सभी",
    search_placeholder: "किसान के नाम या टोकन आईडी से खोजें...",
    modal_token_details: "टोकन विवरण एवं लॉग",
    modal_walk_in: "सीधे आने वाले किसान का नया टोकन",

    // Offline & Notifications
    offline_msg: "आप वर्तमान में ऑफ़लाइन हैं। टोकन सुरक्षित सहेजे जाएंगे और इंटरनेट जुड़ते ही डेटाबेस में सिंक हो जाएंगे।",
    offline_saved_toast: "टोकन ऑफलाइन सुरक्षित हो गया! इंटरनेट कनेक्ट होने पर सिंक होगा।",
    online_synced_toast: "इंटरनेट कनेक्शन बहाल हुआ! सभी टोकन सफलतापूर्वक सिंक हुए।"
  }
};

class I18nManager {
  constructor() {
    this.currentLang = localStorage.getItem('mandi_lang') || 'en';
  }

  init() {
    this.applyLanguage(this.currentLang);
    this.setupToggleButton();
  }

  t(key) {
    const langDict = translations[this.currentLang] || translations.en;
    return langDict[key] || translations.en[key] || key;
  }

  setLanguage(lang) {
    if (translations[lang]) {
      this.currentLang = lang;
      localStorage.setItem('mandi_lang', lang);
      this.applyLanguage(lang);
    }
  }

  toggleLanguage() {
    const newLang = this.currentLang === 'en' ? 'hi' : 'en';
    this.setLanguage(newLang);
  }

  applyLanguage(lang) {
    document.documentElement.lang = lang;
    
    // Update all elements with data-i18n
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = this.t(key);
      if (text) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if (el.getAttribute('placeholder')) {
            el.setAttribute('placeholder', text);
          }
        } else {
          el.textContent = text;
        }
      }
    });

    // Update placeholder attributes if data-i18n-placeholder exists
    const placeholderEls = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderEls.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const text = this.t(key);
      if (text) el.setAttribute('placeholder', text);
    });

    // Update toggle button text
    const toggleBtns = document.querySelectorAll('.lang-toggle-btn');
    toggleBtns.forEach(btn => {
      btn.innerHTML = lang === 'en' 
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20M2 12h20"/></svg> हिंदी`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20M2 12h20"/></svg> English`;
    });

    // Dispatch event for components that need manual re-render
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
  }

  setupToggleButton() {
    const toggleBtns = document.querySelectorAll('.lang-toggle-btn');
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => this.toggleLanguage());
    });
  }
}

const i18n = new I18nManager();
window.i18n = i18n;
document.addEventListener('DOMContentLoaded', () => i18n.init());
