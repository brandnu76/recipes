(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    });
  }
})();

(function () {
  const article = document.querySelector(".hrecipe, .h-recipe");
  if (!article) return;

  const ingredients = Array.from(article.querySelectorAll("ul li"));
  const steps = Array.from(article.querySelectorAll("ol li"));

  ingredients.forEach((li) => {
    if (!li.dataset.original) li.dataset.original = li.textContent.trim();
    li.setAttribute("role", "checkbox");
    li.setAttribute("aria-checked", "false");
    li.tabIndex = 0;
    const toggle = () => {
      const on = li.classList.toggle("is-checked");
      li.setAttribute("aria-checked", on ? "true" : "false");
    };
    li.addEventListener("click", (e) => {
      if (e.target.closest(".servings-control, .toolbar-btn, a, button")) return;
      toggle();
    });
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  });

  steps.forEach((li, idx) => {
    li.dataset.stepIndex = String(idx);
    li.style.cursor = "pointer";
    li.title = "Tap to mark done";
    li.addEventListener("click", () => {
      if (document.body.classList.contains("cook-mode")) return;
      li.classList.toggle("is-done");
    });
  });

  const copyBtn = document.querySelector("[data-action='copy-ingredients']");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const text = ingredients.map((li) => li.textContent.trim()).join("\n");
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.classList.add("is-success");
        copyBtn.textContent = "Copied";
        setTimeout(() => {
          copyBtn.classList.remove("is-success");
          copyBtn.textContent = "Copy ingredients";
        }, 1600);
      } catch (_) {
        copyBtn.textContent = "Copy failed";
      }
    });
  }

  const printBtn = document.querySelector("[data-action='print']");
  if (printBtn) printBtn.addEventListener("click", () => window.print());

  const shareBtn = document.querySelector("[data-action='share']");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const title = document.querySelector(".fn, .p-name, h1")?.textContent?.trim() || document.title;
      const url = location.href;
      try {
        if (navigator.share) {
          await navigator.share({ title, text: title + " — Brandon Carroll", url });
        } else {
          await navigator.clipboard.writeText(url);
          shareBtn.classList.add("is-success");
          shareBtn.textContent = "Link copied";
          setTimeout(() => {
            shareBtn.classList.remove("is-success");
            shareBtn.textContent = "Share";
          }, 1600);
        }
      } catch (_) {}
    });
  }

  // --- servings scaler ---
  function parseYield() {
    const el = article.querySelector(".yield, .p-yield, [itemprop='recipeYield']");
    const raw = (el?.textContent || "8").replace(/servings?/i, "").trim();
    const m = raw.match(/(\d+)(?:\s*[-–to]+\s*(\d+))?/);
    if (!m) return { base: 8, el, displayBase: "8" };
    const base = parseInt(m[1], 10);
    return { base, el, displayBase: m[2] ? m[1] + "–" + m[2] : m[1] };
  }

  function formatQty(n) {
    if (!isFinite(n) || n <= 0) return "";
    const whole = Math.floor(n + 1e-9);
    let frac = n - whole;
    const table = [
      [0, ""],
      [1 / 8, "⅛"],
      [1 / 6, "⅙"],
      [1 / 5, "⅕"],
      [1 / 4, "¼"],
      [1 / 3, "⅓"],
      [3 / 8, "⅜"],
      [2 / 5, "⅖"],
      [1 / 2, "½"],
      [3 / 5, "⅗"],
      [5 / 8, "⅝"],
      [2 / 3, "⅔"],
      [3 / 4, "¾"],
      [4 / 5, "⅘"],
      [5 / 6, "⅚"],
      [7 / 8, "⅞"],
    ];
    let best = "";
    let bestDiff = 0.04;
    for (const [v, s] of table) {
      const d = Math.abs(frac - v);
      if (d < bestDiff) {
        bestDiff = d;
        best = s;
      }
    }
    if (bestDiff >= 0.04) {
      const rounded = Math.round(n * 100) / 100;
      return String(rounded);
    }
    if (whole === 0) return best || String(Math.round(n * 100) / 100);
    return best ? whole + best : String(whole);
  }

  const unicodeFrac = {
    "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3,
    "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875, "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 1 / 6, "⅚": 5 / 6,
  };

  function scaleText(text, factor) {
    // Scale leading quantities and ranges like 4 to 5, 1 1/2, 1½, 3/4
    return text.replace(
      /^(\s*)((?:\d+\s+)?(?:\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|[\d.]+)(?:\s*(?:-|–|to)\s*(?:(?:\d+\s+)?(?:\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|[\d.]+)))?)/,
      (full, sp, qty) => {
        function toNum(part) {
          part = part.trim();
          let n = 0;
          const mixed = part.match(/^(\d+)\s+(\d+)\/(\d+)$/);
          if (mixed) return parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10);
          const uniMixed = part.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚])$/);
          if (uniMixed) return parseInt(uniMixed[1], 10) + unicodeFrac[uniMixed[2]];
          if (unicodeFrac[part] != null) return unicodeFrac[part];
          const frac = part.match(/^(\d+)\/(\d+)$/);
          if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
          const f = parseFloat(part);
          return isNaN(f) ? null : f;
        }
        const range = qty.split(/\s*(?:-|–|to)\s*/);
        if (range.length === 2) {
          const a = toNum(range[0]);
          const b = toNum(range[1]);
          if (a == null || b == null) return full;
          return sp + formatQty(a * factor) + " to " + formatQty(b * factor);
        }
        const n = toNum(qty);
        if (n == null) return full;
        return sp + formatQty(n * factor);
      }
    );
  }

  const yieldInfo = parseYield();
  let currentServings = yieldInfo.base;
  const servingsOut = document.querySelector("[data-servings-value]");
  const servingsBaseLabel = document.querySelector("[data-servings-base]");
  if (servingsBaseLabel) servingsBaseLabel.textContent = "base " + yieldInfo.base;

  function applyServings(next) {
    next = Math.max(1, Math.min(48, next));
    currentServings = next;
    const factor = next / yieldInfo.base;
    if (servingsOut) servingsOut.textContent = String(next);
    ingredients.forEach((li) => {
      li.textContent = scaleText(li.dataset.original, factor);
    });
    if (yieldInfo.el) {
      yieldInfo.el.textContent = next + " servings";
    }
  }

  document.querySelectorAll("[data-servings]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = parseInt(btn.getAttribute("data-servings"), 10);
      applyServings(currentServings + delta);
    });
  });

  // --- cook mode ---
  let wakeLock = null;
  let cookIndex = 0;
  const cookPanel = document.querySelector(".cook-panel");
  const cookStepEl = document.querySelector("[data-cook-step]");
  const cookMetaEl = document.querySelector("[data-cook-meta]");

  // Step timers. A range such as "2 to 3 minutes" or "2–3 minutes" uses the
  // lower bound so the cook is nudged to check early. "Per side" is not
  // multiplied — start the chip again for the next side. Anything longer than
  // 3 hours (overnight chill, long smoke) is ignored so the panel stays a
  // countdown, not a clock for the whole cook.
  const MAX_TIMER_MS = 3 * 60 * 60 * 1000;
  const DURATION_RE = /\b(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*(?:-|–|—|to)\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?))?\s*-?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/gi;

  let timers = [];
  let timerSeq = 0;
  let tickId = null;
  let timerHost = null;
  let offersEl = null;
  let activeEl = null;
  let liveEl = null;
  let audioCtx = null;
  let announceId = null;

  function parseQty(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) {
      const den = parseInt(mixed[3], 10);
      if (!den) return null;
      return parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / den;
    }
    const frac = s.match(/^(\d+)\/(\d+)$/);
    if (frac) {
      const den = parseInt(frac[2], 10);
      if (!den) return null;
      return parseInt(frac[1], 10) / den;
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function unitMeta(unit) {
    const u = String(unit || "").toLowerCase();
    if (u.charAt(0) === "s") return { ms: 1000, kind: "s" };
    if (u.charAt(0) === "h") return { ms: 3600000, kind: "h" };
    return { ms: 60000, kind: "m" };
  }

  function trimNum(n) {
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  }

  function chipLabel(ms, kind) {
    if (kind === "s") return Math.round(ms / 1000) + " sec";
    if (kind === "h") return trimNum(ms / 3600000) + " hr";
    return trimNum(ms / 60000) + " min";
  }

  // Compound form for controls: "2 minute timer", not "2 minutes timer".
  function spokenDuration(ms, kind) {
    if (kind === "s") return Math.round(ms / 1000) + " second";
    if (kind === "h") return trimNum(ms / 3600000) + " hour";
    return trimNum(ms / 60000) + " minute";
  }

  function parseStepDurations(text) {
    const found = [];
    if (!text) return found;
    const re = new RegExp(DURATION_RE.source, "gi");
    let m;
    while ((m = re.exec(text))) {
      const amount = parseQty(m[1]);
      if (amount == null || amount <= 0) continue;
      const meta = unitMeta(m[3]);
      // Lower bound of "2 to 3 minutes" / "2-3 minutes" / "2–3 minutes".
      const ms = Math.round(amount * meta.ms);
      if (ms <= 0 || ms > MAX_TIMER_MS) continue;
      const source = m[0].replace(/\s+/g, " ").trim();
      // "1 to 4 hours or overnight" is an open-ended rest, not a countdown.
      // A short timer earlier in the same step ("rest 30 minutes ... overnight")
      // stays, because overnight sits further past that phrase.
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 28);
      if (/\bovernight\b/i.test(after)) continue;
      found.push({
        ms: ms,
        kind: meta.kind,
        label: chipLabel(ms, meta.kind),
        spoken: spokenDuration(ms, meta.kind),
        source: source,
        ranged: Boolean(m[2]),
      });
    }
    return found;
  }

  function formatRemain(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => (n < 10 ? "0" : "") + n;
    if (h > 0) return h + ":" + pad(m) + ":" + pad(sec);
    return m + ":" + pad(sec);
  }

  function clearEl(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function announce(message) {
    if (!liveEl) return;
    if (announceId) window.clearTimeout(announceId);
    liveEl.textContent = "";
    announceId = window.setTimeout(() => {
      announceId = null;
      if (liveEl) liveEl.textContent = message;
    }, 30);
  }

  function ensureTimerHost() {
    if (timerHost || !cookPanel) return timerHost;
    const inner = cookPanel.querySelector(".cook-panel-inner") || cookPanel;
    const actions = inner.querySelector(".cook-actions");
    timerHost = document.createElement("div");
    timerHost.className = "cook-timers";
    timerHost.hidden = true;
    offersEl = document.createElement("div");
    offersEl.className = "cook-timer-offers";
    activeEl = document.createElement("div");
    activeEl.className = "cook-timer-active";
    timerHost.appendChild(offersEl);
    timerHost.appendChild(activeEl);
    liveEl = document.createElement("div");
    liveEl.className = "visually-hidden";
    liveEl.setAttribute("aria-live", "polite");
    liveEl.setAttribute("aria-atomic", "true");
    liveEl.setAttribute("data-cook-timer-live", "");
    if (actions) inner.insertBefore(timerHost, actions);
    else inner.appendChild(timerHost);
    inner.appendChild(liveEl);
    return timerHost;
  }

  function refreshTimerHost() {
    if (!timerHost) return;
    const hasOffers = offersEl && offersEl.childElementCount > 0;
    timerHost.hidden = !(hasOffers || timers.length > 0);
    scheduleCookPad();
  }

  function scheduleCookPad() {
    window.requestAnimationFrame(() => {
      if (!cookPanel || !document.body.classList.contains("cook-mode")) return;
      const h = Math.ceil(cookPanel.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--cook-panel-space", h + 16 + "px");
    });
  }

  function renderTimerOffers() {
    ensureTimerHost();
    if (!offersEl) return;
    clearEl(offersEl);
    if (!document.body.classList.contains("cook-mode") || !steps.length) {
      refreshTimerHost();
      return;
    }
    const li = steps[cookIndex];
    const specs = parseStepDurations(li ? li.textContent : "");
    specs.forEach((spec) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cook-timer";
      btn.textContent = spec.label;
      const aria = spec.ranged
        ? "Start " + spec.spoken + " timer, shorter end of " + spec.source
        : "Start " + spec.spoken + " timer";
      btn.setAttribute("aria-label", aria);
      btn.title = spec.source;
      btn.addEventListener("click", () => startTimer(spec));
      offersEl.appendChild(btn);
    });
    refreshTimerHost();
  }

  function unlockAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    } catch (_) {}
  }

  function beep() {
    try {
      if (!audioCtx) return;
      const ctx = audioCtx;
      const play = () => {
        const start = ctx.currentTime + 0.02;
        const tone = (freq, t0, dur) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, t0);
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + dur + 0.02);
        };
        tone(880, start, 0.16);
        tone(1175, start + 0.18, 0.2);
      };
      if (ctx.state === "suspended") ctx.resume().then(play).catch(() => {});
      else play();
    } catch (_) {}
  }

  function cueDone() {
    try {
      if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
    } catch (_) {}
    beep();
  }

  function needsWake() {
    return document.body.classList.contains("cook-mode") || timers.some((t) => t.status === "running");
  }

  function syncWake() {
    if (needsWake()) requestWake();
    else releaseWake();
  }

  function ensureTick() {
    if (tickId != null) return;
    tickId = window.setInterval(tickTimers, 250);
  }

  function stopTick() {
    if (tickId == null) return;
    window.clearInterval(tickId);
    tickId = null;
  }

  function tickTimers() {
    const now = Date.now();
    let running = false;
    timers.forEach((t) => {
      if (t.status !== "running") return;
      const left = t.endsAt - now;
      if (left <= 0) completeTimer(t);
      else {
        running = true;
        if (t.timeEl) t.timeEl.textContent = formatRemain(left);
      }
    });
    if (!running) stopTick();
  }

  function focusCookNextIfNeeded(fromEl) {
    if (!fromEl || !fromEl.contains(document.activeElement)) return;
    const next = document.querySelector("[data-action='cook-next']");
    if (next) next.focus();
  }

  function removeTimer(t) {
    if (t.doneTimer) window.clearTimeout(t.doneTimer);
    focusCookNextIfNeeded(t.el);
    if (t.el) t.el.remove();
    timers = timers.filter((x) => x !== t);
    refreshTimerHost();
    syncWake();
  }

  function completeTimer(t) {
    if (!t || t.status !== "running") return;
    t.status = "done";
    if (t.timeEl) t.timeEl.textContent = "Done";
    if (t.el) {
      t.el.classList.add("is-complete");
      t.el.setAttribute("aria-label", t.spoken + " timer done");
    }
    if (t.stopBtn) {
      focusCookNextIfNeeded(t.stopBtn);
      t.stopBtn.remove();
      t.stopBtn = null;
    }
    announce(t.spoken + " timer done");
    cueDone();
    t.doneTimer = window.setTimeout(() => removeTimer(t), 4200);
    syncWake();
  }

  function stopTimer(t) {
    if (!t || t.status !== "running") return;
    t.status = "stopped";
    announce(t.spoken + " timer stopped");
    removeTimer(t);
  }

  function startTimer(spec) {
    unlockAudio();
    ensureTimerHost();
    const now = Date.now();
    const timer = {
      id: ++timerSeq,
      totalMs: spec.ms,
      endsAt: now + spec.ms,
      spoken: spec.spoken,
      status: "running",
      el: null,
      timeEl: null,
      stopBtn: null,
      doneTimer: null,
    };
    const row = document.createElement("div");
    row.className = "cook-timer-run";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", spec.spoken + " timer");
    const time = document.createElement("span");
    time.className = "cook-timer-time";
    time.setAttribute("aria-hidden", "true");
    time.textContent = formatRemain(spec.ms);
    const stop = document.createElement("button");
    stop.type = "button";
    stop.className = "cook-timer-stop";
    stop.textContent = "Stop";
    stop.setAttribute("aria-label", "Stop " + spec.spoken + " timer");
    stop.addEventListener("click", () => stopTimer(timer));
    row.appendChild(time);
    row.appendChild(stop);
    timer.el = row;
    timer.timeEl = time;
    timer.stopBtn = stop;
    if (activeEl) activeEl.appendChild(row);
    timers.push(timer);
    announce(spec.spoken + " timer started");
    ensureTick();
    refreshTimerHost();
    syncWake();
  }

  function clearAllTimers() {
    timers.forEach((t) => {
      if (t.doneTimer) window.clearTimeout(t.doneTimer);
      if (t.el) t.el.remove();
    });
    timers = [];
    stopTick();
    clearEl(offersEl);
    clearEl(activeEl);
    if (timerHost) timerHost.hidden = true;
    if (announceId) {
      window.clearTimeout(announceId);
      announceId = null;
    }
    if (liveEl) liveEl.textContent = "";
  }

  function renderCookStep() {
    if (!steps.length || !cookStepEl) return;
    cookIndex = Math.max(0, Math.min(steps.length - 1, cookIndex));
    const li = steps[cookIndex];
    cookStepEl.textContent = li.textContent.trim();
    if (cookMetaEl) cookMetaEl.textContent = "Step " + (cookIndex + 1) + " of " + steps.length;
    steps.forEach((s, i) => s.classList.toggle("is-cook-current", i === cookIndex));
    renderTimerOffers();
  }

  async function requestWake() {
    try {
      if (!("wakeLock" in navigator)) return;
      if (wakeLock && wakeLock.released === false) return;
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLock = sentinel;
      sentinel.addEventListener("release", () => {
        if (wakeLock === sentinel) wakeLock = null;
      });
    } catch (_) {}
  }

  function releaseWake() {
    if (wakeLock) {
      const current = wakeLock;
      wakeLock = null;
      current.release().catch(() => {});
    }
  }

  function enterCookMode() {
    document.body.classList.add("cook-mode");
    cookIndex = steps.findIndex((s) => !s.classList.contains("is-done"));
    if (cookIndex < 0) cookIndex = 0;
    renderCookStep();
    syncWake();
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(scheduleCookPad, 350);
  }

  function exitCookMode() {
    const panelHadFocus = cookPanel && cookPanel.contains(document.activeElement);
    document.body.classList.remove("cook-mode");
    clearAllTimers();
    syncWake();
    scheduleCookPad();
    if (panelHadFocus) document.querySelector("[data-action='cook-mode']")?.focus();
  }

  function cookPrev() {
    if (!steps.length) return;
    cookIndex -= 1;
    renderCookStep();
  }

  function cookNext() {
    if (!steps.length) return;
    const cur = steps[cookIndex];
    if (cur) cur.classList.add("is-done");
    if (cookIndex >= steps.length - 1) {
      exitCookMode();
      return;
    }
    cookIndex += 1;
    renderCookStep();
  }

  function focusInField(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return Boolean(el.isContentEditable);
  }

  document.querySelector("[data-action='cook-mode']")?.addEventListener("click", enterCookMode);
  document.querySelector("[data-action='exit-cook']")?.addEventListener("click", exitCookMode);
  document.querySelector("[data-action='cook-prev']")?.addEventListener("click", cookPrev);
  document.querySelector("[data-action='cook-next']")?.addEventListener("click", cookNext);

  document.addEventListener("keydown", (e) => {
    if (!document.body.classList.contains("cook-mode")) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    if (e.key === "Escape") {
      e.preventDefault();
      exitCookMode();
      return;
    }
    if (focusInField(e.target) || focusInField(document.activeElement)) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      cookPrev();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      cookNext();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (needsWake()) {
      requestWake();
      tickTimers();
    }
  });

  window.addEventListener("resize", () => {
    if (document.body.classList.contains("cook-mode")) scheduleCookPad();
  });

  const backTop = document.querySelector(".back-top");
  if (backTop) {
    const onScroll = () => {
      backTop.classList.toggle("is-visible", window.scrollY > 480 && !document.body.classList.contains("cook-mode"));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
})();
