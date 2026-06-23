/* =====================================================================
 * YouTube Default Settings - popup script
 * ---------------------------------------------------------------------
 * Manages the popup UI: loading/saving settings, wiring the speed
 * dropdown to the custom input, validation, and language switching.
 * ===================================================================== */

(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    video: { quality: "don't change", speed: "1" },
    shorts: { quality: "don't change", speed: "1" },
  };

  // Quality options shown in the dropdown.
  // "labelKey" points to an i18n entry when one exists; otherwise the
  // raw value is used as the label.
  const QUALITY_OPTIONS = [
    { value: "don't change", labelKey: "q_dont_change" },
    { value: "Auto", labelKey: "q_auto" },
    { value: "144p", label: "144p" },
    { value: "240p", label: "240p" },
    { value: "360p", label: "360p" },
    { value: "480p", label: "480p" },
    { value: "720p", label: "720p" },
    { value: "1080p", label: "1080p" },
    { value: "1440p", label: "1440p" },
    { value: "2160p", label: "2160p (4K)" },
    { value: "2880p", label: "2880p (5K)" },
    { value: "4320p", label: "4320p (8K)" },
  ];

  // Ready-made speed presets + the magic "custom" value.
  const SPEED_PRESETS = [
    { value: "custom", labelKey: "speed_custom" },
    { value: "0.25", label: "0.25x" },
    { value: "0.5", label: "0.5x" },
    { value: "0.75", label: "0.75x" },
    { value: "1", labelKey: "speed_normal" },
    { value: "1.25", label: "1.25x" },
    { value: "1.5", label: "1.5x" },
    { value: "1.75", label: "1.75x" },
    { value: "2", label: "2x" },
  ];

  // storage access (Chrome + Firefox)
  const storage = (() => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
      return browser.storage.local;
    }
    return null;
  })();

  const I18N = window.I18N;

  // ---------- DOM elements ----------
  const el = (id) => document.getElementById(id);
  const els = {
    enabled: el("enabledToggle"),
    langFa: el("langFa"),
    langEn: el("langEn"),
    videoQuality: el("videoQuality"),
    videoSpeedPreset: el("videoSpeedPreset"),
    videoSpeedCustom: el("videoSpeedCustom"),
    videoCustomWrap: el("videoCustomWrap"),
    shortsQuality: el("shortsQuality"),
    shortsSpeedPreset: el("shortsSpeedPreset"),
    shortsSpeedCustom: el("shortsSpeedCustom"),
    shortsCustomWrap: el("shortsCustomWrap"),
    saveBtn: el("saveBtn"),
    status: el("status"),
    main: el("main"),
  };

  // ---------- resolve a label for an option ----------
  function optionLabel(opt) {
    if (opt.labelKey) return I18N.t(opt.labelKey);
    return opt.label;
  }

  // ---------- fill dropdowns ----------
  function fillSelect(select, options) {
    const current = select.value;
    select.innerHTML = "";
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = optionLabel(opt);
      select.appendChild(o);
    }
    // keep current selection if still present
    if ([...select.options].some((o) => o.value === current)) {
      select.value = current;
    }
  }

  // re-fill all dynamic dropdowns (called on language change)
  function refillDropdowns() {
    fillSelect(els.videoQuality, QUALITY_OPTIONS);
    fillSelect(els.shortsQuality, QUALITY_OPTIONS);
    fillSelect(els.videoSpeedPreset, SPEED_PRESETS);
    fillSelect(els.shortsSpeedPreset, SPEED_PRESETS);
  }

  // for a given speed, either matches a preset or falls back to "custom"
  function resolvePreset(speed) {
    const preset = SPEED_PRESETS.find((p) => p.value !== "custom" && p.value === String(speed));
    return preset ? preset.value : "custom";
  }

  // ---------- show/hide custom speed field ----------
  function syncCustomVisibility(scope) {
    const preset = els[`${scope}SpeedPreset`];
    const wrap = els[`${scope}CustomWrap`];
    wrap.hidden = preset.value !== "custom";
  }

  // ---------- speed validation ----------
  function parseSpeed(scope) {
    const preset = els[`${scope}SpeedPreset`].value;
    if (preset !== "custom") return preset;
    const raw = els[`${scope}SpeedCustom`].value.trim();
    if (raw === "") return null; // empty is not allowed in custom mode
    const num = parseFloat(raw);
    if (!Number.isFinite(num) || num < 0.07 || num > 16) return false; // invalid
    return String(num);
  }

  // ---------- load settings into the UI ----------
  function loadIntoUI(data) {
    els.enabled.checked = data.enabled !== false;

    els.videoQuality.value = data.video.quality;
    els.shortsQuality.value = data.shorts.quality;

    const vPreset = resolvePreset(data.video.speed);
    els.videoSpeedPreset.value = vPreset;
    els.videoSpeedCustom.value = vPreset === "custom" ? data.video.speed : "";
    syncCustomVisibility("video");

    const sPreset = resolvePreset(data.shorts.speed);
    els.shortsSpeedPreset.value = sPreset;
    els.shortsSpeedCustom.value = sPreset === "custom" ? data.shorts.speed : "";
    syncCustomVisibility("shorts");

    reflectEnabled();
  }

  function reflectEnabled() {
    document.body.classList.toggle("disabled", !els.enabled.checked);
  }

  // ---------- collect settings from the UI ----------
  function collectFromUI() {
    const vSpeed = parseSpeed("video");
    const sSpeed = parseSpeed("shorts");
    if (vSpeed === false || sSpeed === false) {
      return { error: I18N.t("err_range") };
    }
    if (vSpeed === null || sSpeed === null) {
      return { error: I18N.t("err_empty") };
    }
    return {
      enabled: els.enabled.checked,
      video: {
        quality: els.videoQuality.value,
        speed: vSpeed,
      },
      shorts: {
        quality: els.shortsQuality.value,
        speed: sSpeed,
      },
    };
  }

  // ---------- save ----------
  function save() {
    const data = collectFromUI();
    if (data.error) {
      showStatus(data.error, true);
      return;
    }
    if (!storage) {
      showStatus(I18N.t("err_storage"), true);
      return;
    }
    storage.set(data, () => {
      showStatus(I18N.t("status_saved"), false);
      reflectEnabled();
    });
  }

  let statusTimer = null;
  function showStatus(msg, isError) {
    els.status.textContent = msg;
    els.status.style.color = isError ? "#ff6b6b" : "var(--green)";
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      els.status.textContent = "";
    }, 2500);
  }

  // ---------- language switch ----------
  function reflectLang() {
    const lang = I18N.getLang();
    els.langFa.classList.toggle("active", lang === "fa");
    els.langEn.classList.toggle("active", lang === "en");
    // refresh dynamic option labels
    refillDropdowns();
    // restore current values (refillDropdowns may have reset selection)
    // values are already kept by refillDropdowns, but re-apply visibility
    syncCustomVisibility("video");
    syncCustomVisibility("shorts");
  }

  // ---------- setup ----------
  function setup() {
    // fill lists once with the current language
    refillDropdowns();

    // events
    els.videoSpeedPreset.addEventListener("change", () => syncCustomVisibility("video"));
    els.shortsSpeedPreset.addEventListener("change", () => syncCustomVisibility("shorts"));
    els.enabled.addEventListener("change", reflectEnabled);
    els.saveBtn.addEventListener("click", save);
    els.langFa.addEventListener("click", () => {
      I18N.setLang("fa");
      reflectLang();
    });
    els.langEn.addEventListener("click", () => {
      I18N.setLang("en");
      reflectLang();
    });

    // reflect active language buttons
    reflectLang();
  }

  // ---------- init ----------
  function init() {
    // load persisted language first, then build the UI with it
    I18N.init(() => {
      I18N.applyToDocument(); // translate static [data-i18n] elements
      setup();

      // load current settings
      if (storage) {
        storage.get(DEFAULTS, (data) => {
          // merge with defaults for missing keys
          const merged = {
            enabled: data.enabled !== false,
            video: Object.assign({}, DEFAULTS.video, data.video || {}),
            shorts: Object.assign({}, DEFAULTS.shorts, data.shorts || {}),
          };
          loadIntoUI(merged);
        });
      } else {
        loadIntoUI(DEFAULTS);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init, { once: true });
})();
