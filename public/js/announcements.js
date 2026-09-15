/**
 * announcements.js — Voice Announcement System (SIH 2026)
 * Uses Web Speech API (speechSynthesis) to deliver bilingual (Hindi / English)
 * voice announcements for Mandi loudspeakers when token stages advance.
 */

'use strict';

(function () {
  let isVoiceEnabled = false;
  let preferredLang = 'hi-IN'; // Default to Hindi

  const SpeechSynth = window.speechSynthesis;

  // Initialize Speech Voice Configuration
  function speakMessage(text, lang = 'hi-IN') {
    if (!isVoiceEnabled || !SpeechSynth) return;

    // Cancel any ongoing speech to prevent overlapping queues
    SpeechSynth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;  // Slightly lower rate for clear loudspeaker output
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Find suitable voice if available
    const voices = SpeechSynth.getVoices();
    const targetVoice = voices.find(v => v.lang.startsWith(lang.split('-')[0])) ||
                        voices.find(v => v.lang.includes('IN')) || null;
    if (targetVoice) {
      utterance.voice = targetVoice;
    }

    SpeechSynth.speak(utterance);
  }

  /**
   * Generates and speaks a stage advancement announcement.
   * @param {string} tokenId - Full token ID (e.g. MANDI-20260906-1002)
   * @param {string} stageName - Target stage ('gateEntry' | 'qualityCheck' | 'weighment')
   * @param {string} farmerName - Optional farmer name
   */
  function announceStageAdvance(tokenId, stageName, farmerName = '') {
    if (!isVoiceEnabled) return;

    const shortId = tokenId.split('-').pop(); // e.g. 1002

    const templates = {
      hi: {
        gateEntry:    `Kisan ${farmerName || ''}, Token number ${shortId}, kripya Mandi Gate Entry par pahunchein.`,
        qualityCheck: `Kisan ${farmerName || ''}, Token number ${shortId}, kripya Quality Check area par pahunchein.`,
        weighment:    `Kisan ${farmerName || ''}, Token number ${shortId}, kripya Dharam Kanta Weighment station par pahunchein.`
      },
      en: {
        gateEntry:    `Attention farmer ${farmerName || ''}, Token ${shortId}, please report to Mandi Gate Entry.`,
        qualityCheck: `Attention farmer ${farmerName || ''}, Token ${shortId}, please report to Quality Check bay.`,
        weighment:    `Attention farmer ${farmerName || ''}, Token ${shortId}, please report to Weighment scale.`
      }
    };

    const text = preferredLang.startsWith('hi') 
      ? (templates.hi[stageName] || templates.hi.gateEntry)
      : (templates.en[stageName] || templates.en.gateEntry);

    speakMessage(text, preferredLang);
  }

  // Toggle voice announcements state
  function setVoiceEnabled(enabled) {
    isVoiceEnabled = enabled;
    if (enabled) {
      speakMessage('Voice announcements activated.', preferredLang);
    } else if (SpeechSynth) {
      SpeechSynth.cancel();
    }
  }

  function setLanguage(lang) {
    preferredLang = lang;
  }

  // Expose globally
  window.MandiVoice = {
    announceStageAdvance,
    setVoiceEnabled,
    setLanguage,
    isSupported: () => !!SpeechSynth
  };
})();
