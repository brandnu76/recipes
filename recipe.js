(function () {
  if (!document.querySelector(".skip-link")) {
    const main = document.querySelector("main");
    if (main) {
      if (!main.id) main.id = "main";
      const a = document.createElement("a");
      a.className = "skip-link";
      a.href = "#main";
      a.textContent = "Skip to main content";
      document.body.insertBefore(a, document.body.firstChild);
    }
  }
})();

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

  // Printed copies carry the page address so a paper recipe can find its way
  // back. Hidden on screen; styles.css shows it only in print.
  const footer = document.querySelector(".site-footer");
  if (footer && !footer.querySelector(".print-source")) {
    const src = document.createElement("p");
    src.className = "print-source";
    src.textContent = "Printed from " + location.href.replace(/[?#].*$/, "");
    footer.insertBefore(src, footer.firstChild);
  }

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
    li.setAttribute("role", "button");
    li.setAttribute("tabindex", "0");
    li.setAttribute("aria-pressed", "false");
    li.title = "Mark step done";
    const toggle = () => {
      if (document.body.classList.contains("cook-mode")) return;
      const on = li.classList.toggle("is-done");
      li.setAttribute("aria-pressed", on ? "true" : "false");
    };
    li.addEventListener("click", toggle);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  });


  // Polite live region for toolbar status (copy / share)
  let statusLive = document.getElementById("recipe-status");
  if (!statusLive) {
    statusLive = document.createElement("div");
    statusLive.id = "recipe-status";
    statusLive.className = "visually-hidden";
    statusLive.setAttribute("aria-live", "polite");
    statusLive.setAttribute("aria-atomic", "true");
    article.appendChild(statusLive);
  }
  const announceStatus = (msg) => { statusLive.textContent = msg; };

  const copyBtn = document.querySelector("[data-action='copy-ingredients']");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const lines = [];
      let node = document.getElementById("ingredients");
      node = node ? node.nextElementSibling : null;
      while (node && node.tagName !== "H2") {
        if (node.classList && node.classList.contains("ingredient-group")) lines.push(node.textContent.trim());
        if (node.tagName === "UL") node.querySelectorAll("li").forEach((li) => lines.push(li.textContent.trim()));
        node = node.nextElementSibling;
      }
      const text = (lines.length ? lines : ingredients.map((li) => li.textContent.trim())).join("\n");
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.classList.add("is-success");
        copyBtn.textContent = "Copied"; announceStatus("Ingredients copied");
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
          shareBtn.textContent = "Link copied"; announceStatus("Link copied");
          setTimeout(() => {
            shareBtn.classList.remove("is-success");
            shareBtn.textContent = "Share";
          }, 1600);
        }
      } catch (_) {}
    });
  }

  // --- device-local memory: Save heart + cooking progress ---
  // Everything stays in this browser's localStorage. No accounts, no tracking.
  // Every access is wrapped so private mode or a full quota just turns the
  // feature off instead of breaking the page.
  const SAVED_KEY = "clt:saved";
  const PROGRESS_PREFIX = "clt:progress:";
  const PROGRESS_TTL_MS = 24 * 60 * 60 * 1000;
  const store = {
    get(key) {
      try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
    },
    remove(key) {
      try { window.localStorage.removeItem(key); } catch (_) {}
    },
  };
  const slug = decodeURIComponent((location.pathname.split("/").pop() || "").replace(/\.html?$/i, ""));

  // Drop any other recipe's progress older than a day so checks don't linger.
  try {
    const now = Date.now();
    const stale = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (!k || k.indexOf(PROGRESS_PREFIX) !== 0) continue;
      const v = store.get(k);
      if (!v || typeof v.t !== "number" || now - v.t > PROGRESS_TTL_MS) stale.push(k);
    }
    stale.forEach((k) => store.remove(k));
  } catch (_) {}

  const toolbar = article.querySelector(".recipe-toolbar") || document.querySelector(".recipe-toolbar");

  function readSaved() {
    const v = store.get(SAVED_KEY);
    return Array.isArray(v) ? v.filter((s) => typeof s === "string") : [];
  }

  if (slug && toolbar) {
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "toolbar-btn save-btn";
    saveBtn.setAttribute("data-action", "save");
    const heart = document.createElement("span");
    heart.className = "save-heart";
    heart.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "save-label";
    saveBtn.appendChild(heart);
    saveBtn.appendChild(label);
    const paint = (on) => {
      saveBtn.setAttribute("aria-pressed", on ? "true" : "false");
      saveBtn.classList.toggle("is-saved", on);
      heart.textContent = on ? "\u2665" : "\u2661";
      label.textContent = on ? "Saved" : "Save";
      saveBtn.title = on ? "Saved on this device. Tap to remove." : "Save to this device";
    };
    paint(readSaved().indexOf(slug) !== -1);
    saveBtn.addEventListener("click", () => {
      const list = readSaved();
      const idx = list.indexOf(slug);
      const on = idx === -1;
      if (on) list.unshift(slug);
      else list.splice(idx, 1);
      if (!store.set(SAVED_KEY, list)) {
        announceStatus("Saving isn't available in this browser mode");
        return;
      }
      paint(on);
      announceStatus(on ? "Recipe saved on this device" : "Removed from saved recipes");
    });
    const printRef = toolbar.querySelector("[data-action='print']");
    if (printRef && printRef.nextSibling) toolbar.insertBefore(saveBtn, printRef.nextSibling);
    else toolbar.appendChild(saveBtn);
  }

  // --- Plan a Meal: "+ Add to meal" + floating tray (meal-planner.html) ---
  // Slugs live in localStorage under clt:meal, same device-only rules as Save.
  const MEAL_KEY = "clt:meal";
  const MEAL_MAX = 4;
  const readMeal = () => {
    const v = store.get(MEAL_KEY);
    return Array.isArray(v) ? v.filter((s) => typeof s === "string").slice(0, MEAL_MAX) : [];
  };
  if (slug && toolbar) {
    const mealBtn = document.createElement("button");
    mealBtn.type = "button";
    mealBtn.className = "toolbar-btn meal-btn";
    mealBtn.setAttribute("data-action", "add-to-meal");
    const tray = document.createElement("a");
    tray.className = "meal-tray";
    tray.href = "meal-planner.html";
    const trayCount = document.createElement("span");
    trayCount.className = "meal-tray-count";
    trayCount.setAttribute("aria-hidden", "true");
    const trayLabel = document.createElement("span");
    trayLabel.textContent = "Plan meal";
    tray.appendChild(trayCount);
    tray.appendChild(trayLabel);
    document.body.appendChild(tray);
    const paintMeal = () => {
      const list = readMeal();
      const on = list.indexOf(slug) !== -1;
      mealBtn.setAttribute("aria-pressed", on ? "true" : "false");
      mealBtn.classList.toggle("is-in-meal", on);
      mealBtn.textContent = on ? "\u2713 In meal" : "+ Add to meal";
      mealBtn.title = on ? "In your meal plan. Tap to remove." : "Add to a multi-dish meal plan";
      trayCount.textContent = String(list.length);
      tray.hidden = list.length === 0;
      tray.setAttribute("aria-label", "Plan a Meal, " + list.length + (list.length === 1 ? " dish" : " dishes"));
    };
    paintMeal();
    mealBtn.addEventListener("click", () => {
      const list = readMeal();
      const idx = list.indexOf(slug);
      if (idx === -1 && list.length >= MEAL_MAX) {
        announceStatus("A meal holds up to " + MEAL_MAX + " dishes. Remove one in Plan a Meal first.");
        return;
      }
      if (idx === -1) list.push(slug);
      else list.splice(idx, 1);
      if (!store.set(MEAL_KEY, list)) {
        announceStatus("Meal planning isn't available in this browser mode");
        return;
      }
      paintMeal();
      announceStatus(idx === -1 ? "Added to your meal. " + list.length + " of " + MEAL_MAX + " dishes." : "Removed from your meal");
    });
    window.addEventListener("storage", (e) => { if (e.key === MEAL_KEY) paintMeal(); });
    const saveRef = toolbar.querySelector("[data-action='save']");
    if (saveRef && saveRef.nextSibling) toolbar.insertBefore(mealBtn, saveRef.nextSibling);
    else toolbar.appendChild(mealBtn);
  }

  // --- Meal calendar: "Add to calendar" (calendar.html) ---
  // Saved only in this device's localStorage (clt-meal-calendar-v1); never in the URL.
  // Lives in the toolbar, outside the hRecipe/JSON-LD markup, so AnyList import is unaffected.
  const CAL_KEY = "clt-meal-calendar-v1";
  if (slug && toolbar) {
    const calBtn = document.createElement("button");
    calBtn.type = "button";
    calBtn.className = "toolbar-btn cal-btn";
    calBtn.setAttribute("data-action", "add-to-calendar");
    calBtn.textContent = "+ Add to calendar";
    calBtn.title = "Put this recipe on a day in your meal calendar (this device only)";
    let pop = null;
    const closePop = () => { if (pop) { pop.remove(); pop = null; calBtn.focus(); } };
    const pad2 = (n) => String(n).padStart(2, "0");
    calBtn.addEventListener("click", () => {
      if (pop) { closePop(); return; }
      const d = new Date();
      const todayStr = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
      pop = document.createElement("div");
      pop.className = "cal-pop no-print";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", "Add to meal calendar");
      pop.innerHTML = '<label for="cal-pop-date">Day</label><input id="cal-pop-date" type="date">' +
        '<label for="cal-pop-slot">Meal</label><select id="cal-pop-slot"><option>Breakfast</option><option>Lunch</option><option selected>Dinner</option><option>Other</option></select>' +
        '<div class="cal-pop-actions"><button type="button" class="toolbar-btn" data-cal-save>Add</button><button type="button" class="toolbar-btn" data-cal-close>Cancel</button></div>' +
        '<p class="cal-pop-done" hidden></p>';
      pop.querySelector("#cal-pop-date").value = todayStr;
      pop.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });
      pop.querySelector("[data-cal-close]").addEventListener("click", closePop);
      pop.querySelector("[data-cal-save]").addEventListener("click", () => {
        const date = pop.querySelector("#cal-pop-date").value;
        const slot = pop.querySelector("#cal-pop-slot").value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { pop.querySelector("#cal-pop-date").focus(); return; }
        const h1 = document.querySelector("h1");
        const title = (h1 ? h1.textContent : document.title.split(" — ")[0]).trim();
        const cur = store.get(CAL_KEY);
        const entries = cur && Array.isArray(cur.entries) ? cur.entries : [];
        entries.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), date, slot, slug, title });
        if (!store.set(CAL_KEY, { v: 1, entries })) { announceStatus("The calendar isn't available in this browser mode"); return; }
        const nice = new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        const done = pop.querySelector(".cal-pop-done");
        done.textContent = "Added to " + slot.toLowerCase() + " on " + nice + ". ";
        const a = document.createElement("a"); a.href = "calendar.html"; a.textContent = "Open calendar \u2192";
        done.appendChild(a); done.hidden = false;
        pop.querySelector("[data-cal-save]").hidden = true;
        pop.querySelector("[data-cal-close]").textContent = "Close";
        announceStatus("Added to your meal calendar");
      });
      document.body.appendChild(pop);
      pop.querySelector("#cal-pop-date").focus();
    });
    const mealRef = toolbar.querySelector("[data-action='add-to-meal']");
    if (mealRef && mealRef.nextSibling) toolbar.insertBefore(calBtn, mealRef.nextSibling);
    else toolbar.appendChild(calBtn);
  }

  // Progress is keyed by list position, not text, so the servings scaler
  // rewriting quantities never orphans a check.
  if (slug && (ingredients.length || steps.length)) {
    const progressKey = PROGRESS_PREFIX + slug;
    let clearBtn = null;
    let restoring = false;

    const setIngredient = (li, on) => {
      li.classList.toggle("is-checked", on);
      li.setAttribute("aria-checked", on ? "true" : "false");
    };
    const setStep = (li, on) => {
      li.classList.toggle("is-done", on);
      li.setAttribute("aria-pressed", on ? "true" : "false");
    };
    const snapshot = () => ({
      ing: ingredients.reduce((acc, li, i) => (li.classList.contains("is-checked") ? acc.concat(i) : acc), []),
      steps: steps.reduce((acc, li, i) => (li.classList.contains("is-done") ? acc.concat(i) : acc), []),
    });
    const syncClear = (count) => {
      if (clearBtn) clearBtn.hidden = count === 0;
    };
    const saveProgress = () => {
      if (restoring) return;
      const snap = snapshot();
      const count = snap.ing.length + snap.steps.length;
      if (count) store.set(progressKey, { t: Date.now(), ing: snap.ing, steps: snap.steps });
      else store.remove(progressKey);
      syncClear(count);
    };

    if (toolbar) {
      clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "toolbar-btn clear-checks-btn";
      clearBtn.setAttribute("data-action", "clear-checks");
      clearBtn.textContent = "Clear checks";
      clearBtn.title = "Uncheck all ingredients and steps";
      clearBtn.hidden = true;
      clearBtn.addEventListener("click", () => {
        restoring = true;
        ingredients.forEach((li) => setIngredient(li, false));
        steps.forEach((li) => setStep(li, false));
        restoring = false;
        store.remove(progressKey);
        syncClear(0);
        announceStatus("Checks cleared");
        const cookBtn = toolbar.querySelector("[data-action='cook-mode']");
        if (cookBtn) cookBtn.focus();
      });
      toolbar.appendChild(clearBtn);
    }

    const saved = store.get(progressKey);
    if (saved && typeof saved.t === "number" && Date.now() - saved.t <= PROGRESS_TTL_MS) {
      restoring = true;
      (Array.isArray(saved.ing) ? saved.ing : []).forEach((i) => { if (ingredients[i]) setIngredient(ingredients[i], true); });
      (Array.isArray(saved.steps) ? saved.steps : []).forEach((i) => { if (steps[i]) setStep(steps[i], true); });
      restoring = false;
      const snap = snapshot();
      syncClear(snap.ing.length + snap.steps.length);
    } else if (saved) {
      store.remove(progressKey);
    }

    // Catch every way a check changes (tap, keyboard, cook mode "Next").
    if ("MutationObserver" in window) {
      const mo = new MutationObserver((records) => {
        if (records.some((r) => r.attributeName === "class")) saveProgress();
      });
      ingredients.concat(steps).forEach((li) => mo.observe(li, { attributes: true, attributeFilter: ["class"] }));
    } else {
      article.addEventListener("click", () => window.setTimeout(saveProgress, 0));
      article.addEventListener("keydown", () => window.setTimeout(saveProgress, 0));
    }
  }

  // --- My notes: private, device-local notes per recipe ---
  // Like the margin of a cookbook: "used 2 tbsp honey", "pull at 128°F".
  // Stored only in this browser's localStorage, never sent anywhere. Added
  // after the recipe article (and by script, not in the page HTML) so AnyList
  // and Schema.org/hRecipe readers never see it as part of the recipe.
  const NOTES_PREFIX = "clt:notes:";
  if (slug) {
    const notesKey = NOTES_PREFIX + slug;
    const readNote = () => {
      const v = store.get(notesKey);
      return v && typeof v.text === "string" ? v : null;
    };
    const section = document.createElement("section");
    section.className = "my-notes";
    section.id = "my-notes";
    section.setAttribute("aria-labelledby", "my-notes-title");
    const h = document.createElement("h2");
    h.id = "my-notes-title";
    h.textContent = "My notes";
    const hint = document.createElement("p");
    hint.className = "my-notes-hint";
    hint.id = "my-notes-hint";
    hint.textContent = "Private to this device. Jot swaps, timings, or what the family thought; it saves as you type.";
    const box = document.createElement("textarea");
    box.className = "my-notes-input";
    box.id = "my-notes-input";
    box.rows = 4;
    box.maxLength = 4000;
    box.placeholder = "e.g. Pulled at 128°F, rested 10 min. Doubled the garlic.";
    box.setAttribute("aria-describedby", "my-notes-hint my-notes-status");
    const label = document.createElement("label");
    label.className = "visually-hidden";
    label.htmlFor = "my-notes-input";
    label.textContent = "Your notes for this recipe";
    const status = document.createElement("p");
    status.className = "my-notes-status";
    status.id = "my-notes-status";
    const printOut = document.createElement("div");
    printOut.className = "my-notes-print";
    printOut.setAttribute("aria-hidden", "true");

    const fmtDate = (t) => {
      try { return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch (_) { return ""; }
    };
    const paintStatus = (note, justSaved) => {
      if (note && note.text.trim()) {
        status.textContent = (justSaved ? "Saved on this device" : "Last edited " + fmtDate(note.t)) + ".";
      } else {
        status.textContent = "";
      }
      printOut.textContent = note && note.text.trim() ? note.text.trim() : "";
      section.classList.toggle("has-notes", !!(note && note.text.trim()));
    };

    const existing = readNote();
    if (existing) box.value = existing.text;
    paintStatus(existing, false);

    let timer = 0;
    const commit = () => {
      timer = 0;
      const text = box.value;
      if (!text.trim()) {
        store.remove(notesKey);
        paintStatus(null, false);
        return;
      }
      const note = { t: Date.now(), text: text };
      if (!store.set(notesKey, note)) {
        status.textContent = "Notes can't be saved in this browser mode.";
        return;
      }
      paintStatus(note, true);
    };
    box.addEventListener("input", () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(commit, 600);
    });
    box.addEventListener("blur", () => {
      if (timer) { window.clearTimeout(timer); commit(); }
    });
    window.addEventListener("pagehide", () => {
      if (timer) { window.clearTimeout(timer); commit(); }
    });

    section.appendChild(h);
    section.appendChild(hint);
    section.appendChild(label);
    section.appendChild(box);
    section.appendChild(status);
    section.appendChild(printOut);
    if (article.parentNode) article.parentNode.insertBefore(section, article.nextSibling);

    const jumpRef = toolbar && toolbar.querySelector(".jump-link[href='#instructions']");
    if (jumpRef) {
      const jl = document.createElement("a");
      jl.className = "jump-link";
      jl.href = "#my-notes";
      jl.textContent = "Notes";
      toolbar.insertBefore(jl, jumpRef.nextSibling);
    }
  }

  // --- More from our table: related recipes at the end of the page ---
  // Built offline by tools/build_related.py (shared ingredients, keywords and
  // category). Injected by script after the recipe and notes, so AnyList and
  // Schema.org/hRecipe readers never see it as part of the recipe.
  if (slug && window.fetch) {
    fetch("./related.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((all) => {
        const me = all && all[slug];
        const picks = me && Array.isArray(me.r) ? me.r.filter((s) => all[s]).slice(0, 4) : [];
        if (!picks.length || document.getElementById("more-recipes")) return;
        const sec = document.createElement("section");
        sec.className = "more-recipes";
        sec.id = "more-recipes";
        sec.setAttribute("aria-labelledby", "more-recipes-title");
        const h = document.createElement("h2");
        h.id = "more-recipes-title";
        h.textContent = "More from our table";
        const ul = document.createElement("ul");
        ul.className = "book-list more-recipes-list";
        picks.forEach((s) => {
          const d = all[s];
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = encodeURIComponent(s) + ".html";
          if (d.i) {
            const img = document.createElement("img");
            img.className = "card-photo";
            img.src = d.i;
            img.width = 480;
            img.height = 320;
            img.alt = "";
            img.loading = "lazy";
            img.decoding = "async";
            a.appendChild(img);
          }
          if (d.c) {
            const c = document.createElement("span");
            c.className = "card-cat";
            c.textContent = d.c;
            a.appendChild(c);
          }
          const t = document.createElement("span");
          t.className = "card-title";
          t.textContent = d.n || s;
          a.appendChild(t);
          li.appendChild(a);
          ul.appendChild(li);
        });
        const all_ = document.createElement("p");
        all_.className = "more-recipes-all";
        const link = document.createElement("a");
        link.href = "recipes.html";
        link.textContent = "Browse all recipes";
        all_.appendChild(link);
        sec.appendChild(h);
        sec.appendChild(ul);
        sec.appendChild(all_);
        const after = document.getElementById("my-notes") || article;
        if (after.parentNode) after.parentNode.insertBefore(sec, after.nextSibling);
      })
      .catch(() => {});
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

  // --- "For this step": ingredients a step calls for ---
  // Matching is deliberately conservative: an ingredient shows up when its
  // whole name appears in the step ("brown sugar", "egg noodles"), or when a
  // word from its name appears that no other ingredient shares ("onion",
  // "Worcestershire"). Shared words alone ("pepper" with black pepper and
  // bell pepper) never match, so the panel stays quiet rather than wrong.
  const STEP_ING_SKIP = new Set(("a an and of for to the with into plus more about each " +
    "cup cups c tablespoon tablespoons tbsp tbs tbl teaspoon teaspoons tsp ounce ounces oz pound pounds lb lbs " +
    "gram grams g kg kilogram kilograms ml milliliter milliliters liter liters litre litres l quart quarts qt pint pints pt gallon gallons " +
    "clove cloves can cans jar jars package packages pkg box boxes bag bags stick sticks pinch pinches dash dashes " +
    "slice slices sprig sprigs head heads bunch bunches handful stalk stalks piece pieces inch inches envelope packet packets container " +
    "large medium small jumbo whole half fresh freshly chopped minced diced sliced grated shredded softened melted " +
    "room temperature cold warm hot extra virgin boneless skinless bone skin finely roughly coarsely thinly thickly packed lightly " +
    "divided optional taste needed kosher unsalted salted low sodium reduced fat full free high quality store bought homemade good pure " +
    "cut peeled seeded halved quartered trimmed rinsed drained beaten cubed crushed toasted cooked uncooked raw frozen thawed " +
    "all purpose fine dark light out top over just well thick thin thinly ground heaping level generous scant regular plain style brand favorite your any such like other leftover").split(/\s+/));

  // Describing words that may only match as part of the whole name.
  const STEP_ING_ADJ = new Set(("white black red green yellow orange purple brown golden sweet baking bread sharp mild " +
    "smoked dry dried wild baby italian mexican french greek english spicy hot sour").split(/\s+/));

  function stepIngStem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 4 && /(oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /[^s]s$/.test(w)) return w.slice(0, -1);
    return w;
  }

  function stepIngWordBody(stem) {
    const esc = stem.replace(/[^a-z]/g, "");
    return /y$/.test(esc) ? esc.slice(0, -1) + "(?:y|ies)" : esc + "(?:s|es)?";
  }

  function stepIngWordRe(stem) {
    return new RegExp("(^|[^a-z])(" + stepIngWordBody(stem) + ")(?![a-z])", "g");
  }

  function stepIngCore(text) {
    const parts = String(text || "").toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[’']/g, "")
      .split(/\bfor (?:the|serving|garnish|dusting|brushing|frying|greasing)\b|\bto serve\b/)[0]
      .split(/,|;|\s[-–—]\s/);
    // "4 boneless, skinless chicken breasts": use the first piece that names something.
    for (const part of parts) {
      const words = part.replace(/[^a-z\s-]/g, " ").replace(/-/g, " ").split(/\s+/)
        .filter((w) => w === "or" || (w.length >= 3 && !STEP_ING_SKIP.has(w)));
      if (!words.length) continue;
      // "avocado oil or beef tallow" -> two names, each matched on its own.
      const alts = [];
      let cur = [];
      words.forEach((w) => {
        if (w === "or") { if (cur.length) alts.push(cur); cur = []; }
        else cur.push(stepIngStem(w));
      });
      if (cur.length) alts.push(cur);
      if (alts.length) return alts;
    }
    return [];
  }

  function matchStepIngredients(stepText, cores) {
    const text = " " + String(stepText || "").toLowerCase().replace(/[’']/g, "").replace(/-/g, " ") + " ";
    const claimed = [];
    const overlaps = (a, b) => claimed.some(([s, e]) => a < e && b > s);
    const hits = new Set();
    const counts = new Map();
    const flat = cores.map((alts) => [].concat(...alts));
    flat.forEach((words) => new Set(words).forEach((w) => counts.set(w, (counts.get(w) || 0) + 1)));
    // Pass 1: whole names, then their tails ("dark brown sugar" -> "brown
    // sugar"), longest first, so "peanut butter" claims its words before
    // plain "butter" can.
    const phrases = [];
    cores.forEach((alts, i) => alts.forEach((words) => {
      if (words.length === 1) phrases.push([i, words]);
      for (let k = 0; k <= words.length - 2; k++) phrases.push([i, words.slice(k)]);
    }));
    phrases.sort((a, b) => b[1].join(" ").length - a[1].join(" ").length);
    phrases.forEach(([i, words]) => {
      if (hits.has(i) && words.length < 2) return;
      const pattern = words.map(stepIngWordBody).join("[\\s,]+(?:and\\s+)?");
      const re = new RegExp("(^|[^a-z])(" + pattern + ")(?![a-z])", "g");
      // A full name claims every mention, so "peanut butter" twice in one
      // step never leaves a stray "butter" for the pan grease.
      const all = words.length > 1;
      let m;
      while ((m = re.exec(text))) {
        const s = m.index + m[1].length;
        const e = s + m[2].length;
        if (!overlaps(s, e)) {
          claimed.push([s, e]);
          hits.add(i);
          if (!all) break;
        }
      }
    });
    // Pass 2: a single word. It counts when only this ingredient uses it, or
    // when this is the one ingredient it names ("pepper" -> black pepper, not
    // red pepper flakes). Never inside a span already claimed.
    const heads = new Map();
    cores.forEach((alts) => new Set(alts.map((a) => a[a.length - 1]))
      .forEach((h) => heads.set(h, (heads.get(h) || 0) + 1)));
    cores.forEach((alts, i) => {
      if (hits.has(i)) return;
      const own = new Set(alts.map((a) => a[a.length - 1]));
      for (const w of flat[i]) {
        const unique = counts.get(w) === 1 && !STEP_ING_ADJ.has(w);
        const soleHead = own.has(w) && heads.get(w) === 1;
        if (!unique && !soleHead) continue;
        const re = stepIngWordRe(w);
        let m;
        let found = false;
        while ((m = re.exec(text))) {
          const s = m.index + m[1].length;
          const e = s + m[2].length;
          if (!overlaps(s, e)) { claimed.push([s, e]); found = true; break; }
        }
        if (found) { hits.add(i); break; }
      }
    });
    return Array.from(hits).sort((a, b) => a - b);
  }

  const ingredientItems = (() => {
    const marked = ingredients.filter((li) =>
      li.matches(".ingredient, .p-ingredient, [itemprop='recipeIngredient']"));
    return marked.length ? marked : ingredients;
  })();
  const ingredientCores = ingredientItems.map((li) => stepIngCore(li.dataset.original || li.textContent));
  const stepIngredientMap = steps.map((li) => matchStepIngredients(li.textContent, ingredientCores));

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

  // "Keep screen on" switch, shared with Plan a Meal (same localStorage key).
  // On: hold the lock the whole time cook mode is open. Off: only while a
  // timer runs, like before.
  const WAKE_KEY = "clt:meal-wake";
  const wakeSupported = "wakeLock" in navigator;
  let wakePref = store.get(WAKE_KEY) !== false;
  let wakeSwitch = null;
  let wakeStatus = null;
  function paintWake() {
    if (!wakeSwitch) return;
    wakeSwitch.setAttribute("aria-checked", wakePref ? "true" : "false");
    wakeSwitch.classList.toggle("is-on", wakePref);
    if (!wakeSupported) { wakeSwitch.disabled = true; wakeStatus.textContent = "Not supported on this browser"; return; }
    const held = wakeLock && wakeLock.released === false;
    const inCook = document.body.classList.contains("cook-mode");
    wakeStatus.textContent = held || (wakePref && !inCook) ? "Screen will stay on" : "Screen may sleep";
  }
  if (cookPanel) {
    const inner = cookPanel.querySelector(".cook-panel-inner") || cookPanel;
    const wrap = document.createElement("span");
    wrap.className = "wake-toggle cook-wake";
    wakeSwitch = document.createElement("button");
    wakeSwitch.type = "button";
    wakeSwitch.className = "wake-switch";
    wakeSwitch.setAttribute("role", "switch");
    wakeSwitch.setAttribute("aria-labelledby", "cook-wake-label");
    wakeSwitch.setAttribute("aria-describedby", "cook-wake-status");
    const knob = document.createElement("span");
    knob.className = "wake-knob";
    knob.setAttribute("aria-hidden", "true");
    wakeSwitch.appendChild(knob);
    const lab = document.createElement("span");
    lab.id = "cook-wake-label";
    lab.className = "wake-label";
    lab.textContent = "Keep screen on";
    wakeStatus = document.createElement("span");
    wakeStatus.id = "cook-wake-status";
    wakeStatus.className = "wake-status";
    wakeStatus.setAttribute("aria-live", "polite");
    wrap.appendChild(wakeSwitch);
    wrap.appendChild(lab);
    wrap.appendChild(wakeStatus);
    inner.appendChild(wrap);
    wakeSwitch.addEventListener("click", () => {
      wakePref = !wakePref;
      store.set(WAKE_KEY, wakePref);
      syncWake();
      paintWake();
    });
    window.addEventListener("storage", (e) => {
      if (e.key === WAKE_KEY) { wakePref = store.get(WAKE_KEY) !== false; syncWake(); paintWake(); }
    });
    paintWake();
  }

  function needsWake() {
    return (wakePref && document.body.classList.contains("cook-mode")) || timers.some((t) => t.status === "running");
  }

  function syncWake() {
    if (needsWake()) requestWake();
    else releaseWake();
    paintWake();
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
    steps.forEach((s, i) => {
      const current = i === cookIndex;
      s.classList.toggle("is-cook-current", current);
      if (current) s.setAttribute("aria-current", "step");
      else s.removeAttribute("aria-current");
    });
    renderStepIngredients();
    renderTimerOffers();
  }

  let stepIngHost = null;
  let stepIngList = null;

  function ensureStepIngHost() {
    if (stepIngHost || !cookPanel) return stepIngHost;
    const inner = cookPanel.querySelector(".cook-panel-inner") || cookPanel;
    stepIngHost = document.createElement("div");
    stepIngHost.className = "cook-step-ings";
    stepIngHost.hidden = true;
    const label = document.createElement("p");
    label.className = "cook-step-ings-label";
    label.id = "cook-step-ings-label";
    label.textContent = "For this step";
    stepIngList = document.createElement("ul");
    stepIngList.setAttribute("aria-labelledby", label.id);
    stepIngHost.appendChild(label);
    stepIngHost.appendChild(stepIngList);
    const stepText = inner.querySelector("[data-cook-step]");
    if (stepText && stepText.nextSibling) inner.insertBefore(stepIngHost, stepText.nextSibling);
    else inner.appendChild(stepIngHost);
    return stepIngHost;
  }

  function renderStepIngredients() {
    ensureStepIngHost();
    if (!stepIngList) return;
    clearEl(stepIngList);
    const picks = stepIngredientMap[cookIndex] || [];
    picks.forEach((idx) => {
      const li = ingredientItems[idx];
      if (!li) return;
      const item = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cook-step-ing";
      // Read the live text so the servings scaler's amounts show here too.
      btn.textContent = li.textContent.trim();
      const sync = () => {
        const on = li.classList.contains("is-checked");
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.classList.toggle("is-checked", on);
      };
      sync();
      btn.title = "Tick off in the ingredient list";
      btn.addEventListener("click", () => {
        li.click();
        sync();
      });
      item.appendChild(btn);
      stepIngList.appendChild(item);
    });
    stepIngHost.hidden = picks.length === 0;
  }

  async function requestWake() {
    try {
      if (!("wakeLock" in navigator)) return;
      if (wakeLock && wakeLock.released === false) return;
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLock = sentinel;
      sentinel.addEventListener("release", () => {
        if (wakeLock === sentinel) wakeLock = null;
        paintWake();
      });
    } catch (_) {}
    paintWake();
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
    // Move focus into the cook controls so keyboard users aren't stranded
    const next = document.querySelector("[data-action='cook-next']");
    if (next) next.focus();
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
