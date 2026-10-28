(function () {
  // Skip link — WCAG 2.4.1 Bypass Blocks
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
  const header = document.querySelector(".site-header");
  const below = document.querySelector(".splash-below");
  if (!header || !below) return;
  const onScroll = () => {
    header.classList.toggle("is-solid", below.getBoundingClientRect().top <= header.offsetHeight + 1);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
})();

(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    });
  }
})();

// Device-local saved recipes (set by the Save button on recipe pages).
// localStorage only; wrapped so private mode simply shows nothing saved.
const cltSaved = (function () {
  const KEY = "clt:saved";
  const read = () => {
    try {
      const v = JSON.parse(window.localStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    } catch (_) {
      return [];
    }
  };
  const slugOf = (a) =>
    decodeURIComponent(((a && a.getAttribute("href")) || "").split(/[?#]/)[0].replace(/^\.\//, "").split("/").pop().replace(/\.html?$/i, ""));
  // Small heart on every recipe card the visitor has saved.
  const markCards = () => {
    const set = new Set(read());
    document.querySelectorAll(".book-list a:not(.splash-cat)").forEach((a) => {
      const on = set.has(slugOf(a));
      a.classList.toggle("is-saved", on);
      let badge = a.querySelector(".card-saved");
      if (on && !badge) {
        badge = document.createElement("span");
        badge.className = "card-saved";
        badge.setAttribute("role", "img");
        badge.setAttribute("aria-label", "Saved");
        badge.textContent = "\u2665";
        a.appendChild(badge);
      } else if (!on && badge) {
        badge.remove();
      }
    });
    return set;
  };
  return { read, slugOf, markCards };
})();

(function () {
  cltSaved.markCards();
  // Splash: offer a shortcut to saved recipes once there are any.
  const actions = document.querySelector(".splash-actions");
  const paintSplash = () => {
    if (!actions) return;
    const n = cltSaved.read().length;
    let link = actions.querySelector(".splash-saved");
    if (n && !link) {
      link = document.createElement("a");
      link.className = "splash-btn splash-saved";
      link.href = "recipes.html#saved";
      actions.appendChild(link);
    }
    if (link) {
      if (n) link.textContent = "\u2665 Saved (" + n + ")";
      else link.remove();
    }
  };
  paintSplash();
  const refresh = () => {
    cltSaved.markCards();
    paintSplash();
    document.dispatchEvent(new CustomEvent("clt:saved-change"));
  };
  // Coming back with the Back button (bfcache) or saving in another tab.
  window.addEventListener("pageshow", (e) => { if (e.persisted) refresh(); });
  window.addEventListener("storage", (e) => { if (!e.key || e.key === "clt:saved") refresh(); });
})();

(function () {
  const input = document.querySelector("#recipe-search");
  const meta = document.querySelector("#search-meta");
  if (meta) {
    meta.setAttribute("aria-live", "polite");
    meta.setAttribute("aria-atomic", "true");
  }
  const filterRow = document.querySelector(".filter-row");
  if (filterRow && !filterRow.querySelector("[data-filter-cat='saved']")) {
    const savedChip = document.createElement("button");
    savedChip.type = "button";
    savedChip.className = "filter-chip filter-chip-saved";
    savedChip.setAttribute("data-filter-cat", "saved");
    savedChip.innerHTML = '<span aria-hidden="true">\u2665</span> Saved';
    filterRow.appendChild(savedChip);
  }
  // Time filter: total time from each recipe's Schema.org totalTime, shipped in
  // recipe-meta.json (built by tools/build_recipe_meta.py).
  const TIME_OPTS = [
    ["any", "Any time"],
    ["30", "30 min or less"],
    ["45", "45 min or less"],
    ["60", "1 hour or less"],
    ["slow", "Low & slow (3 hr+)"],
  ];
  let timeRow = null;
  if (filterRow && input && !document.querySelector(".time-row")) {
    timeRow = document.createElement("div");
    timeRow.className = "filter-row time-row";
    timeRow.setAttribute("role", "toolbar");
    timeRow.setAttribute("aria-label", "Filter by total time");
    timeRow.hidden = true; // shown once times load
    TIME_OPTS.forEach(([v, label], i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "filter-chip time-chip" + (i ? "" : " is-active");
      b.setAttribute("data-filter-time", v);
      b.textContent = label;
      timeRow.appendChild(b);
    });
    filterRow.parentNode.insertBefore(timeRow, filterRow.nextSibling);
  }
  const setTime = (v) => {
    const chip = timeChips.find((c) => c.getAttribute("data-filter-time") === v);
    if (!chip) return false;
    activeTime = v;
    timeChips.forEach((c) => {
      const on = c === chip;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    return true;
  };
  const timeChips = timeRow ? Array.from(timeRow.querySelectorAll("[data-filter-time]")) : [];
  let activeTime = "any";
  let timesLoaded = false;
  const timeOk = (a) => {
    if (activeTime === "any") return true;
    const t = Number(a.dataset.time || 0);
    if (!t) return false;
    return activeTime === "slow" ? t >= 180 : t <= Number(activeTime);
  };
  const fmtTime = (m) => {
    if (m >= 1440) {
      const d = Math.round(m / 1440);
      return d + (d === 1 ? " day" : " days");
    }
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h ? h + " hr" + (r ? " " + r + " min" : "") : r + " min";
  };

  const chips = Array.from(document.querySelectorAll("[data-filter-cat]"));
  if (!input && !chips.length) return;

  const cards = Array.from(document.querySelectorAll(".book-list a"));
  const sections = Array.from(document.querySelectorAll(".book-section"));
  let activeCat = "all";
  let activeLabel = "";
  let savedSet = new Set(cltSaved.read());

  // Friendly note when the Saved filter has nothing to show.
  let emptyNote = null;
  const showEmpty = (msg, withClear) => {
    if (!msg) {
      if (emptyNote) emptyNote.hidden = true;
      return;
    }
    if (!emptyNote) {
      emptyNote = document.createElement("p");
      emptyNote.className = "saved-empty";
      const anchorEl = sections[0];
      if (anchorEl && anchorEl.parentNode) anchorEl.parentNode.insertBefore(emptyNote, anchorEl);
      else if (meta && meta.parentNode) meta.parentNode.appendChild(emptyNote);
    }
    emptyNote.textContent = msg;
    if (withClear) {
      const clear = document.createElement("a");
      clear.href = "recipes.html";
      clear.className = "clear-filters";
      clear.textContent = "Clear filters";
      clear.addEventListener("click", (ev) => {
        ev.preventDefault();
        clearAll();
      });
      emptyNote.appendChild(document.createTextNode(" "));
      emptyNote.appendChild(clear);
    }
    emptyNote.hidden = false;
  };

  // Search matches dish names, keywords, and ingredients. A trailing plural is
  // trimmed so "potatoes" still finds "potato".
  const norm = (s) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/-/g, " ").replace(/\s+/g, " ");
  const stem = (w) => (w.length > 4 && /es$/.test(w) ? w.slice(0, -2) : w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);
  const update = () => {
    const q = norm((input?.value || "").trim());
    const words = q ? q.split(" ").filter(Boolean).map(stem) : [];
    const hayOf = (a) => norm((a.dataset.search || "") + " " + a.textContent);
    // Prefer the exact phrase ("ground beef") when any recipe has it; fall back
    // to matching each word anywhere so scattered words still find a recipe.
    const phrase = words.length > 1 && cards.some((a) => hayOf(a).includes(q));
    let shown = 0;
    cards.forEach((a) => {
      const hay = hayOf(a);
      const cat = (a.dataset.cat || "").toLowerCase();
      const matchQ = !words.length || (phrase ? hay.includes(q) : words.every((w) => hay.includes(w)));
      const matchC =
        activeCat === "all" || (activeCat === "saved" ? savedSet.has(cltSaved.slugOf(a)) : cat === activeCat);
      const match = matchQ && matchC && timeOk(a);
      a.parentElement.hidden = !match;
      if (match) shown += 1;
    });
    sections.forEach((sec) => {
      const any = Array.from(sec.querySelectorAll(".book-list li")).some((li) => !li.hidden);
      sec.classList.toggle("is-empty", !any);
    });
    if (activeCat === "saved" && !shown) {
      showEmpty(
        savedSet.size && q
          ? "None of your saved recipes match that search."
          : "Nothing saved yet. Open a recipe and tap \u2661 Save to keep it here on this device."
      );
    } else if (!shown && activeTime !== "any" && !timesLoaded) {
      showEmpty("");
    } else if (!shown && activeTime !== "any") {
      showEmpty("No recipes fit that time with these filters. Try a longer time or Any time.", true);
    } else if (!shown) {
      showEmpty("No recipes match " + (q ? "\u201c" + (input?.value || "").trim() + "\u201d" : "these filters") + ". Try fewer or different words.", true);
    } else {
      showEmpty("");
    }
    if (meta) {
      const bits = [];
      if (activeLabel) bits.push(activeLabel);
      if (activeTime !== "any") {
        const tc = timeChips.find((c) => c.getAttribute("data-filter-time") === activeTime);
        if (tc) bits.push(tc.textContent.trim());
      }
      if (q) bits.push("\u201c" + (input?.value || "").trim() + "\u201d");
      meta.textContent = bits.length
        ? shown + " recipe" + (shown === 1 ? "" : "s") + " \u00b7 " + bits.join(" \u00b7 ")
        : cards.length + " recipes";
    }
  };

  // Ingredient and keyword terms live in search-index.json so recipe cards stay
  // light; merge them into each card's data-search once they arrive.
  if (input) {
    fetch("search-index.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((index) => {
        if (!index) return;
        cards.forEach((a) => {
          const slug = (a.getAttribute("href") || "").replace(/^\.\//, "").replace(/\.html$/, "");
          if (index[slug]) a.dataset.search = (a.dataset.search || "") + " " + index[slug];
        });
        update();
      })
      .catch(() => {});
  }

  if (timeRow) {
    fetch("recipe-meta.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((meta) => {
        if (!meta) return;
        cards.forEach((a) => {
          const m = meta[cltSaved.slugOf(a)];
          if (!m || !m.t) return;
          a.dataset.time = String(m.t);
          if (!a.querySelector(".card-time")) {
            const tag = document.createElement("span");
            tag.className = "card-time";
            tag.textContent = fmtTime(m.t);
            const cat = a.querySelector(".card-cat");
            if (cat) cat.appendChild(tag);
            else a.appendChild(tag);
          }
        });
        timeRow.hidden = false;
        timesLoaded = true;
        update();
      })
      .catch(() => {});
    timeChips.forEach((chip) => {
      chip.setAttribute("aria-pressed", chip.classList.contains("is-active") ? "true" : "false");
      chip.addEventListener("click", () => {
        setTime(chip.getAttribute("data-filter-time") || "any");
        syncUrl();
        update();
      });
    });
  }

  // Keep ?q= / ?time= / ?cat= in the address bar so a filtered view can be
  // shared or bookmarked (#saved stays a hash, as before).
  const slugCat = (s) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const syncUrl = () => {
    if (!history.replaceState) return;
    try {
      const sp = new URLSearchParams(location.search);
      const qv = (input?.value || "").trim();
      if (qv) sp.set("q", qv); else sp.delete("q");
      if (activeTime !== "any") sp.set("time", activeTime); else sp.delete("time");
      if (activeCat !== "all" && activeCat !== "saved") sp.set("cat", slugCat(activeCat)); else sp.delete("cat");
      const qs = sp.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + (activeCat === "saved" ? "#saved" : ""));
    } catch (_) {}
  };
  let clearAll = () => {};
  input?.addEventListener("input", () => { update(); syncUrl(); });
  const selectChip = (chip) => {
    activeCat = (chip.getAttribute("data-filter-cat") || "all").toLowerCase();
    activeLabel = activeCat === "all" ? "" : chip.textContent.trim();
    if (activeCat === "saved") savedSet = new Set(cltSaved.read());
    chips.forEach((c) => {
      const on = c === chip;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    update();
  };
  chips.forEach((chip) => {
    chip.setAttribute("aria-pressed", chip.classList.contains("is-active") ? "true" : "false");
    chip.addEventListener("click", () => {
      selectChip(chip);
      syncUrl();
    });
  });
  document.addEventListener("clt:saved-change", () => {
    savedSet = new Set(cltSaved.read());
    update();
  });
  clearAll = () => {
    if (input) input.value = "";
    setTime("any");
    const allChip = chips.find((c) => c.getAttribute("data-filter-cat") === "all");
    if (allChip) selectChip(allChip); else update();
    syncUrl();
  };
  // Apply URL params on load: ?q=, ?time= (any|30|45|60|slow), ?cat=.
  let params = null;
  try { params = new URLSearchParams(location.search); } catch (_) {}
  if (params) {
    const qp = params.get("q");
    if (input && qp) input.value = qp;
    const tp = (params.get("time") || "").toLowerCase();
    if (tp) setTime(tp);
    const cp = params.get("cat");
    if (cp) {
      const want = slugCat(cp);
      const c = chips.find((x) => x.getAttribute("data-filter-cat") !== "saved" && slugCat(x.getAttribute("data-filter-cat")) === want);
      if (c) { activeCat = (c.getAttribute("data-filter-cat") || "all").toLowerCase(); activeLabel = activeCat === "all" ? "" : c.textContent.trim(); chips.forEach((x) => { x.classList.toggle("is-active", x === c); x.setAttribute("aria-pressed", x === c ? "true" : "false"); }); }
    }
  }
  const savedChipEl = chips.find((c) => c.getAttribute("data-filter-cat") === "saved");
  if (savedChipEl && location.hash === "#saved") selectChip(savedChipEl);
  else update();
})();
