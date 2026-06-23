/* =====================================================================
 * YouTube Default Settings - content script
 * ---------------------------------------------------------------------
 * Automatically applies the user's default playback speed and quality
 * to YouTube videos. Works for both /watch and /shorts.
 *
 * Important note about quality: if the user's requested quality is not
 * present in the player's menu, NOTHING is done (no fallback).
 * ===================================================================== */

(() => {
  "use strict";

  // ---------- constants ----------
  const DEFAULTS = {
    enabled: true,
    video: { quality: "don't change", speed: "1" },
    shorts: { quality: "don't change", speed: "1" },
  };

  // All possible quality values plus the "don't change" sentinel.
  // These are only used to match the menu text; if an option is missing
  // from the menu, we do nothing.
  const QUALITY_VALUES = [
    "144p", "240p", "360p", "480p", "720p",
    "1080p", "1440p", "2160p", "2880p", "4320p",
    "Auto", "auto",
  ];

  // ---------- runtime state ----------
  let settings = null;          // settings loaded from storage
  let settingsReady = false;
  let currentPageType = null;   // "watch" | "shorts" | null
  let lastAppliedSrc = null;    // avoid re-applying on the same video
  let lastAppliedType = null;
  let applyInProgress = false;
  let userOverride = false;     // true once the user manually changes speed for this video
  let applyGuardUntil = 0;      // timestamp; protect against YouTube's immediate reset

  // ---------- storage access (Chrome + Firefox compatible) ----------
  const storage = (() => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
      return browser.storage.local;
    }
    return null;
  })();

  function loadSettings() {
    if (!storage) {
      settings = DEFAULTS;
      settingsReady = true;
      return Promise.resolve(settings);
    }
    return new Promise((resolve) => {
      storage.get(DEFAULTS, (data) => {
        // deep-merge with defaults to tolerate missing keys
        settings = {
          enabled: data.enabled !== false,
          video: Object.assign({}, DEFAULTS.video, data.video || {}),
          shorts: Object.assign({}, DEFAULTS.shorts, data.shorts || {}),
        };
        settingsReady = true;
        resolve(settings);
      });
    });
  }

  // live update when settings change from the popup
  function attachStorageListener() {
    if (!storage) return;
    const onChanged = (changes, area) => {
      if (area && area !== "local") return;
      loadSettings().then(() => {
        // on settings change, clear the "last applied" flag to re-apply
        lastAppliedSrc = null;
        lastAppliedType = null;
        maybeApply();
      });
    };
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(onChanged);
    }
    if (typeof browser !== "undefined" && browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener(onChanged);
    }
  }

  // ---------- page type detection ----------
  function detectPageType() {
    const path = location.pathname;
    if (path.startsWith("/watch")) return "watch";
    if (path.startsWith("/shorts")) return "shorts";
    return null;
  }

  // ---------- helper: delay ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- find the video element ----------
  function getVideo() {
    // YouTube's main video usually matches movie_player > video
    const v = document.querySelector("#movie_player video.html5-main-video")
      || document.querySelector("video.html5-main-video")
      || document.querySelector("#shorts-player")
      || document.querySelector("video");
    return v || null;
  }

  // ===================================================================
  // Apply playback speed
  // ===================================================================
  function applySpeed(video, speedStr) {
    const speed = parseFloat(speedStr);
    if (!Number.isFinite(speed) || speed <= 0) return false;
    try {
      // only change if different, to avoid extra events
      if (Math.abs(video.playbackRate - speed) > 1e-6) {
        video.playbackRate = speed;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // ===================================================================
  // Apply quality - no fallback
  // ===================================================================
  // General flow:
  //   1) open the player settings menu (gear button)
  //   2) find the "Quality" item (language-independent indicator: an
  //      item whose ytp-menuitem-content ends with "p" or equals "Auto")
  //   3) enter the quality submenu
  //   4) look for the user's target option in the list
  //   5) if present -> click it; if not -> close the menu and do nothing

  function getSettingsButton() {
    return document.querySelector(".ytp-settings-button");
  }

  function getMenuItems() {
    // the active player menu lives inside .ytp-popup-menu
    const popup = document.querySelector(".ytp-popup-menu")
      || document.querySelector(".ytp-settings-menu");
    if (!popup) return [];
    return Array.from(popup.querySelectorAll(".ytp-menuitem"));
  }

  function menuItemLabel(item) {
    // primary text of an item is in .ytp-menuitem-label
    const label = item.querySelector(".ytp-menuitem-label");
    if (label && label.textContent.trim()) return label.textContent.trim();
    // fallback: direct text
    return (item.textContent || "").trim();
  }

  function menuItemContent(item) {
    // secondary value (e.g. 720p or Auto) is in .ytp-menuitem-content
    const content = item.querySelector(".ytp-menuitem-content");
    return content ? content.textContent.trim() : "";
  }

  // find the "Quality" item in the settings menu (browser-language independent)
  function findQualityMenuItem(items) {
    for (const item of items) {
      const c = menuItemContent(item);
      // signal: secondary content ends with "p" (e.g. 720p) or is "Auto"
      if (/^\d+p$/.test(c) || /^auto$/i.test(c)) {
        return item;
      }
    }
    return null;
  }

  // close the player menu by simulating Escape
  function closePlayerMenu() {
    try {
      const player = document.querySelector("#movie_player") || document.body;
      player.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, which: 27, bubbles: true })
      );
      player.dispatchEvent(
        new KeyboardEvent("keyup", { key: "Escape", keyCode: 27, which: 27, bubbles: true })
      );
    } catch (e) {
      /* ignore */
    }
  }

  async function applyQuality(targetQuality) {
    if (!targetQuality || targetQuality === "don't change") return;

    const settingsBtn = getSettingsButton();
    if (!settingsBtn) return;

    // 1) open the settings menu
    settingsBtn.click();
    await sleep(120);

    let items = getMenuItems();
    if (!items.length) {
      // one short retry
      await sleep(150);
      items = getMenuItems();
      if (!items.length) return;
    }

    // 2) find the quality item
    const qualityItem = findQualityMenuItem(items);
    if (!qualityItem) {
      closePlayerMenu();
      return;
    }

    // 3) enter the quality submenu
    qualityItem.click();
    await sleep(120);

    const subItems = getMenuItems();
    if (!subItems.length) {
      closePlayerMenu();
      return;
    }

    // 4) match the user's target (case-sensitive for the "p" suffix)
    // normalize target
    const target = String(targetQuality).trim();

    let match = null;
    for (const it of subItems) {
      const label = menuItemLabel(it);
      const content = menuItemContent(it);
      if (label === target || content === target) {
        match = it;
        break;
      }
      // case-insensitive match for Auto
      if (/^auto$/i.test(target) && (/^auto$/i.test(label) || /^auto$/i.test(content))) {
        match = it;
        break;
      }
    }

    if (match) {
      // 5) option found -> select it
      match.click();
    } else {
      // not found -> per the user's request, do NOT change anything and close the menu
      closePlayerMenu();
    }
  }

  // ===================================================================
  // Main apply flow
  // ===================================================================
  async function applySettings() {
    if (!settingsReady || !settings || !settings.enabled) return;
    if (applyInProgress) return;
    const type = currentPageType;
    if (!type) return;

    const cfg = type === "shorts" ? settings.shorts : settings.video;
    const video = getVideo();
    if (!video) return;

    applyInProgress = true;
    try {
      // --- speed ---
      // Respect a manual change: if the user already picked a speed for
      // this video, do not override it.
      if (!userOverride && cfg.speed && cfg.speed !== "") {
        // a few short retries since the player may not be ready yet
        for (let i = 0; i < 5; i++) {
          if (applySpeed(video, cfg.speed)) break;
          await sleep(120);
        }
        // open a short guard window: YouTube sometimes resets the rate to
        // 1x immediately after we set it. The ratechange listener below
        // only re-applies within this window, so later manual changes are
        // never fought.
        applyGuardUntil = Date.now() + 1500;
      }

      // --- quality ---
      if (cfg.quality && cfg.quality !== "don't change") {
        await applyQuality(cfg.quality);
      }

      lastAppliedSrc = video.currentSrc || video.src || location.href;
      lastAppliedType = type;
    } finally {
      applyInProgress = false;
    }
  }

  // reset all per-video state (called on navigation to a new video)
  function resetForNewVideo() {
    lastAppliedSrc = null;
    lastAppliedType = null;
    userOverride = false;
    applyGuardUntil = 0;
  }

  // apply only if this is a new video (avoid loops)
  function maybeApply() {
    if (!settingsReady || !settings || !settings.enabled) return;
    const type = detectPageType();
    currentPageType = type;
    if (!type) return;

    const video = getVideo();
    const src = video ? (video.currentSrc || video.src || location.href) : location.href;
    if (src === lastAppliedSrc && type === lastAppliedType) return;

    // run with a short delay so the player settles
    setTimeout(applySettings, 350);
  }

  // ===================================================================
  // Protect the applied speed only in a short window right after apply
  // ---------------------------------------------------------------------
  // YouTube sometimes resets playbackRate to 1x immediately after we set
  // it. To counter that WITHOUT fighting the user's manual changes, we
  // only re-apply during a brief guard window opened right after apply().
  // Any ratechange outside that window is treated as a deliberate user
  // action and is honored (we stop overriding for the rest of the video).
  // ===================================================================
  function keepSpeedAlive() {
    document.addEventListener(
      "ratechange",
      (e) => {
        if (!settingsReady || !settings || !settings.enabled) return;
        const video = e.target;
        if (!(video instanceof HTMLVideoElement)) return;

        const now = Date.now();
        const inGuardWindow = now < applyGuardUntil;

        if (inGuardWindow) {
          // YouTube just reset our speed right after we set it -> re-apply once.
          const type = currentPageType || detectPageType();
          if (!type) return;
          const cfg = type === "shorts" ? settings.shorts : settings.video;
          const target = parseFloat(cfg.speed);
          if (!Number.isFinite(target) || target <= 0) return;
          if (Math.abs(video.playbackRate - target) > 1e-6) {
            try { video.playbackRate = target; } catch (_) {}
          }
        } else {
          // Outside the guard window: this is a real change. If it differs
          // from our default, the user changed it manually -> stop
          // overriding speed for this video.
          const type = currentPageType || detectPageType();
          if (!type) return;
          const cfg = type === "shorts" ? settings.shorts : settings.video;
          const target = parseFloat(cfg.speed);
          if (Number.isFinite(target) && Math.abs(video.playbackRate - target) > 1e-6) {
            userOverride = true;
          }
        }
      },
      true
    );
  }

  // ===================================================================
  // Setup
  // ===================================================================
  function setupVideoWatcher() {
    // observe DOM changes to discover new videos (SPA navigation)
    const observer = new MutationObserver(() => {
      const type = detectPageType();
      if (type !== currentPageType) {
        currentPageType = type;
        resetForNewVideo();
        maybeApply();
      } else {
        maybeApply();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // management of YouTube SPA navigation
  function setupSpaNaviListener() {
    document.addEventListener("yt-navigate-finish", () => {
      resetForNewVideo();
      currentPageType = detectPageType();
      maybeApply();
    });
    // some versions don't fire this event; the MutationObserver covers it.
  }

  function init() {
    loadSettings().then(() => {
      currentPageType = detectPageType();
      setupSpaNaviListener();
      setupVideoWatcher();
      keepSpeedAlive();
      attachStorageListener();
      // a delayed first attempt
      setTimeout(maybeApply, 600);
    });
  }

  // start once the DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
