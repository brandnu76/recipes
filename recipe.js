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

  function renderCookStep() {
    if (!steps.length || !cookStepEl) return;
    cookIndex = Math.max(0, Math.min(steps.length - 1, cookIndex));
    const li = steps[cookIndex];
    cookStepEl.textContent = li.textContent.trim();
    if (cookMetaEl) cookMetaEl.textContent = "Step " + (cookIndex + 1) + " of " + steps.length;
    steps.forEach((s, i) => s.classList.toggle("is-cook-current", i === cookIndex));
  }

  async function requestWake() {
    try {
      if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    } catch (_) {}
  }

  function releaseWake() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  function enterCookMode() {
    document.body.classList.add("cook-mode");
    cookIndex = steps.findIndex((s) => !s.classList.contains("is-done"));
    if (cookIndex < 0) cookIndex = 0;
    renderCookStep();
    requestWake();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exitCookMode() {
    document.body.classList.remove("cook-mode");
    releaseWake();
  }

  document.querySelector("[data-action='cook-mode']")?.addEventListener("click", enterCookMode);
  document.querySelector("[data-action='exit-cook']")?.addEventListener("click", exitCookMode);
  document.querySelector("[data-action='cook-prev']")?.addEventListener("click", () => {
    cookIndex -= 1;
    renderCookStep();
  });
  document.querySelector("[data-action='cook-next']")?.addEventListener("click", () => {
    const cur = steps[cookIndex];
    if (cur) cur.classList.add("is-done");
    if (cookIndex >= steps.length - 1) {
      exitCookMode();
      return;
    }
    cookIndex += 1;
    renderCookStep();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && document.body.classList.contains("cook-mode")) {
      requestWake();
    }
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
