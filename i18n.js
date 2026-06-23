/* =====================================================================
 * i18n.js — lightweight bilingual support (fa / en)
 * ---------------------------------------------------------------------
 * A minimal, dependency-free internationalization helper for the popup.
 * Default language is Persian ("fa"). The chosen language is persisted
 * in storage and applied to elements carrying a `data-i18n` attribute.
 * ===================================================================== */

(() => {
  "use strict";

  const DEFAULT_LANG = "fa";
  const SUPPORTED = ["fa", "en"];

  // ---- translation dictionary ---------------------------------------
  // Every UI string lives here (fa + en). Add keys freely.
  const DICT = {
    fa: {
      app_title: "یوتیوب دیفالت",
      toggle_hint: "فعال/غیرفعال کردن افزونه",
      card_video: "ویدیوها",
      card_shorts: "Shorts",
      field_quality: "کیفیت پیش‌فرض",
      field_speed: "سرعت پیش‌فرض",
      field_custom_speed: "سرعت دلخواه",
      custom_placeholder: "مثلاً ۱.۵",
      q_dont_change: "تغییر نده",
      q_auto: "خودکار (Auto)",
      speed_custom: "دلخواه…",
      speed_normal: "عادی (1x)",
      btn_save: "ذخیره",
      status_saved: "ذخیره شد ✓",
      err_range: "مقدار سرعت دلخواه باید عددی بین ۰.۰۷ و ۱۶ باشد.",
      err_empty: "در حالت «دلخواه»، لطفاً مقدار سرعت را وارد کنید.",
      err_storage: "دسترسی به حافظه ممکن نیست.",
      hint: "اگر کیفیت انتخاب‌شده در منوی ویدیو موجود نباشد، افزونه هیچ تغییری در کیفیت نمی‌دهد.",
      lang_fa: "فا",
      lang_en: "EN",
    },
    en: {
      app_title: "YouTube Defaults",
      toggle_hint: "Enable / disable the extension",
      card_video: "Videos",
      card_shorts: "Shorts",
      field_quality: "Default quality",
      field_speed: "Default speed",
      field_custom_speed: "Custom speed",
      custom_placeholder: "e.g. 1.5",
      q_dont_change: "Don't change",
      q_auto: "Auto",
      speed_custom: "Custom…",
      speed_normal: "Normal (1x)",
      btn_save: "Save",
      status_saved: "Saved ✓",
      err_range: "Custom speed must be a number between 0.07 and 16.",
      err_empty: "In custom mode, please enter a speed value.",
      err_storage: "Cannot access storage.",
      hint: "If the selected quality isn't available in the video menu, the extension won't change quality.",
      lang_fa: "FA",
      lang_en: "EN",
    },
  };

  // ---- storage (Chrome + Firefox) -----------------------------------
  const storage =
    (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) ||
    (typeof browser !== "undefined" && browser.storage && browser.storage.local) ||
    null;

  let currentLang = DEFAULT_LANG;

  function isSupported(lang) {
    return SUPPORTED.includes(lang);
  }

  function getLang() {
    return currentLang;
  }

  // translate a single key; optional {placeholders} substitution
  function t(key, vars) {
    const dict = DICT[currentLang] || DICT[DEFAULT_LANG];
    let str = dict[key];
    if (str === undefined) str = DICT[DEFAULT_LANG][key];
    if (str === undefined) return key;
    if (vars) {
      for (const k in vars) {
        str = str.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
      }
    }
    return str;
  }

  // apply translations to the whole document
  function applyToDocument(root) {
    const scope = root || document;
    scope.dir = currentLang === "fa" ? "rtl" : "ltr";
    scope.lang = currentLang;

    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      el.setAttribute("title", t(key));
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      el.setAttribute("placeholder", t(key));
    });
  }

  // load persisted language, then run callback
  function init(cb) {
    if (!storage) {
      currentLang = DEFAULT_LANG;
      if (cb) cb(currentLang);
      return;
    }
    storage.get({ lang: DEFAULT_LANG }, (data) => {
      currentLang = isSupported(data.lang) ? data.lang : DEFAULT_LANG;
      if (cb) cb(currentLang);
    });
  }

  // change + persist language, then re-apply
  function setLang(lang) {
    if (!isSupported(lang)) lang = DEFAULT_LANG;
    currentLang = lang;
    if (storage) storage.set({ lang });
    applyToDocument();
  }

  // expose a tiny public API
  window.I18N = { t, getLang, setLang, init, applyToDocument, DEFAULT_LANG, SUPPORTED };
})();
