/* Carroll Lowcountry Table — Week template for the Meal calendar (calendar.html)
   One tap plans a cook-twice week: Tuesday and Thursday get a double-batch dinner
   (about 75 minutes or less), Wednesday and Friday become leftover nights.
   Uses the same device-only calendar (clt-meal-calendar-v1); it only ADDS entries
   and never replaces anything already planned. Nothing syncs or leaves this device. */
"use strict";
(function (root) {
  const MAX_MIN = 75;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  // Dishes that don't hold up as next-day leftovers (crisp, assembled-to-order, or a side).
  const NO_REHEAT = /salad|taco|burger|-side$|musubi|fajita|steak-bites|salmon-cakes|loco-moco|quesadilla/;
  const PROTEINS = [["shrimp", /shrimp/], ["fish", /salmon|catfish|fish/], ["chicken", /chicken|turkey/],
    ["pork", /pork|chop/], ["sausage", /sausage|kielbasa|andouille/], ["beef", /beef|steak|burger|chuck|stroganoff|cottage-pie|enchilada|chili/]];

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseYmd(s); return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };

  // Sunday-start week (matches the calendar grid) holding the given date.
  function weekOf(date) {
    if (!DATE_RE.test(date || "")) return null;
    const sun = addDays(date, -parseYmd(date).getDay());
    return { sun, tue: addDays(sun, 2), wed: addDays(sun, 3), thu: addDays(sun, 4), fri: addDays(sun, 5), sat: addDays(sun, 6) };
  }
  function proteinOf(text) {
    const t = String(text || "").toLowerCase();
    for (const [name, re] of PROTEINS) if (re.test(t)) return name;
    return "other";
  }
  // cards: [{slug, title, cat}] from recipes.html; meta: recipe-meta.json ({slug:{t}}).
  function candidates(cards, meta, maxMin) {
    const max = maxMin || MAX_MIN; const seen = {};
    return (cards || []).filter((c) => {
      if (!c || !c.slug || seen[c.slug]) return false; seen[c.slug] = 1;
      const t = meta && meta[c.slug] && meta[c.slug].t;
      return /weekday dinners/.test(c.cat || "") && typeof t === "number" && t > 0 && t <= max && !NO_REHEAT.test(c.slug);
    }).map((c) => ({ slug: c.slug, title: c.title, t: meta[c.slug].t, protein: proteinOf(c.slug + " " + c.title) }));
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // Order candidates for a week: dishes not cooked lately come first, with a
  // per-week shuffle so suggestions change week to week but stay put on reload.
  function rank(cands, entries, sun) {
    const last = {};
    (entries || []).forEach((e) => { if (e && e.slug && e.date < addDays(sun, 7) && (!last[e.slug] || e.date > last[e.slug])) last[e.slug] = e.date; });
    const recentCut = addDays(sun, -21);
    return cands.slice().sort((a, b) => {
      const ra = last[a.slug] && last[a.slug] >= recentCut ? 1 : 0, rb = last[b.slug] && last[b.slug] >= recentCut ? 1 : 0;
      if (ra !== rb) return ra - rb;
      return hash(sun + a.slug) - hash(sun + b.slug);
    });
  }
  // Next idea in ranked order after `current`, skipping `avoid` slugs and, when it
  // can, the protein of the other night so Tuesday and Thursday differ.
  function nextIdea(ranked, current, avoid, avoidProtein) {
    if (!ranked.length) return null;
    const start = current ? ranked.findIndex((c) => c.slug === current) + 1 : 0;
    const ok = (c, strict) => c.slug !== current && (avoid || []).indexOf(c.slug) === -1 && (!strict || !avoidProtein || c.protein !== avoidProtein);
    for (const strict of [true, false]) {
      for (let i = 0; i < ranked.length; i++) { const c = ranked[(start + i) % ranked.length]; if (ok(c, strict)) return c; }
    }
    return null;
  }
  function suggestPair(ranked) {
    const tue = nextIdea(ranked, null, [], null);
    const thu = tue ? nextIdea(ranked, null, [tue.slug], tue.protein) : null;
    return { tue, thu };
  }
  const dinnersOn = (entries, date) => (entries || []).filter((e) => e && e.date === date && e.slot === "Dinner");

  // Build what the template would do, without touching storage.
  // picks: {tue: {slug,title}|null, thu: {slug,title}|null}
  // Returns {add:[entries], double:[ids], keep:[{date, title}]}
  function planWeek(entries, week, picks) {
    const out = { add: [], double: [], keep: [] };
    [["tue", "wed", "Tuesday"], ["thu", "fri", "Thursday"]].forEach(([cook, left, dayName]) => {
      const have = dinnersOn(entries, week[cook]);
      let cookTitle = null;
      if (have.length) {
        have.forEach((e) => { if (e.slug && e.x !== 2) out.double.push(e.id); out.keep.push({ date: week[cook], title: e.title }); });
        const r = have.find((e) => e.slug) || have[0]; cookTitle = r.title;
      } else if (picks && picks[cook] && picks[cook].slug) {
        out.add.push({ date: week[cook], slot: "Dinner", slug: picks[cook].slug, title: picks[cook].title, x: 2 });
        cookTitle = picks[cook].title;
      }
      const leftHave = dinnersOn(entries, week[left]);
      if (leftHave.length) leftHave.forEach((e) => out.keep.push({ date: week[left], title: e.title }));
      else out.add.push({ date: week[left], slot: "Dinner", title: cookTitle ? "Leftovers: " + cookTitle + " (from " + dayName + ")" : "Leftovers from " + dayName });
    });
    return out;
  }
  // Apply a plan through the calendar core. Returns {added:[ids], doubled:[ids]} for Undo.
  function applyPlan(cal, storage, plan) {
    const added = [], doubled = [];
    plan.add.forEach((e) => { const r = cal.add(storage, e); if (r) added.push(r.id); });
    plan.double.forEach((id) => { if (cal.setBatch(storage, id, 2)) doubled.push(id); });
    return { added, doubled };
  }
  function undoPlan(cal, storage, done) {
    (done.added || []).forEach((id) => cal.remove(storage, id));
    (done.doubled || []).forEach((id) => cal.setBatch(storage, id, 1));
  }

  const core = { MAX_MIN, NO_REHEAT, weekOf, proteinOf, candidates, rank, nextIdea, suggestPair, planWeek, applyPlan, undoPlan };
  if (typeof module !== "undefined" && module.exports) { module.exports = core; return; }
  root.CLTWeekTemplate = core;

  // ---------------- UI ----------------
  const card = document.querySelector("[data-wk-card]");
  const app = document.querySelector("[data-cal-app]");
  const cal = root.CLTMealCalendar;
  if (!card || !app || !cal) return;
  const ls = window.localStorage;
  const $ = (s) => card.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const status = $("[data-wk-status]");
  const say = (t) => { if (status) status.textContent = t; };
  const short = (d) => parseYmd(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const preview = $("[data-wk-preview]");
  const weekLabel = $("[data-wk-week]");
  let cands = [], ranked = [], picks = { tue: null, thu: null }, week = null, lastDone = null, loaded = null;

  function currentWeek() { return weekOf(cal.ui ? cal.ui.selected() : ymd(new Date())); }
  function updateLabel() { const w = currentWeek(); if (w) weekLabel.textContent = "Week of " + short(w.sun) + " – " + short(w.sat) + ". Pick a day on the calendar to choose a different week."; }

  function load() {
    if (loaded) return loaded;
    loaded = Promise.all([
      fetch("recipes.html").then((r) => r.text()),
      fetch("recipe-meta.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ]).then(([html, meta]) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const cards = [];
      doc.querySelectorAll(".book-list a[href$='.html'][data-cat]").forEach((a) => {
        const t = a.querySelector(".card-title");
        cards.push({ slug: a.getAttribute("href").replace(/\.html$/, ""), title: (t ? t.textContent : a.textContent).trim(), cat: a.getAttribute("data-cat") || "" });
      });
      cands = candidates(cards, meta).sort((a, b) => a.title.localeCompare(b.title));
    });
    return loaded;
  }

  function nightRow(cookKey, leftKey, dayName, entries) {
    const box = el("div", "wk-night");
    const have = dinnersOn(entries, week[cookKey]);
    const h = el("h3", "wk-day", dayName + " · " + short(week[cookKey]));
    box.appendChild(h);
    if (have.length) {
      const r = have.find((e) => e.slug);
      box.appendChild(el("p", "meal-note", "Already planned: " + have.map((e) => e.title).join(", ") + (r ? ". It will be marked as a double batch." : ". Left as is.")));
    } else if (!cands.length) {
      box.appendChild(el("p", "meal-note", "No quick dinners found. Add Tuesday and Thursday by hand."));
    } else {
      const id = "wk-" + cookKey;
      const lab = el("label", "wk-label", dayName + " dinner (double batch, " + MAX_MIN + " min or less)"); lab.htmlFor = id;
      const sel = el("select", "wk-select"); sel.id = id;
      cands.forEach((c) => { const o = el("option", null, c.title + " — " + c.t + " min"); o.value = c.slug; sel.appendChild(o); });
      if (picks[cookKey]) sel.value = picks[cookKey].slug;
      sel.addEventListener("change", () => { picks[cookKey] = cands.find((c) => c.slug === sel.value) || null; renderPreview(); say(dayName + ": " + (picks[cookKey] ? picks[cookKey].title : "none")); });
      const row = el("div", "wk-pick-row");
      row.appendChild(sel);
      const other = cookKey === "tue" ? "thu" : "tue";
      const again = el("button", "toolbar-btn", "Another idea"); again.type = "button";
      again.setAttribute("aria-label", "Another idea for " + dayName);
      again.addEventListener("click", () => {
        const o = picks[other];
        const n = nextIdea(ranked, picks[cookKey] && picks[cookKey].slug, o ? [o.slug] : [], o && o.protein);
        if (n) { picks[cookKey] = n; renderPreview(); say(dayName + ": " + n.title); const s = $("#" + id); if (s) s.focus(); }
      });
      row.appendChild(again);
      if (picks[cookKey]) { const a = el("a", "wk-view", "View recipe"); a.href = picks[cookKey].slug + ".html"; row.appendChild(a); }
      box.appendChild(lab); box.appendChild(row);
    }
    const lh = dinnersOn(entries, week[leftKey]);
    const ln = el("p", "wk-left");
    ln.appendChild(el("strong", null, (leftKey === "wed" ? "Wednesday" : "Friday") + " · " + short(week[leftKey]) + ": "));
    ln.appendChild(document.createTextNode(lh.length ? "already planned (" + lh.map((e) => e.title).join(", ") + "), left as is." : "Leftover night."));
    box.appendChild(ln);
    return box;
  }

  function renderPreview() {
    preview.textContent = "";
    const entries = cal.load(ls);
    preview.appendChild(nightRow("tue", "wed", "Tuesday", entries));
    preview.appendChild(nightRow("thu", "fri", "Thursday", entries));
    const plan = planWeek(entries, week, picks);
    const acts = el("div", "wk-actions");
    const ok = el("button", "toolbar-btn wk-apply", "Add to my calendar"); ok.type = "button";
    ok.disabled = !plan.add.length && !plan.double.length;
    ok.addEventListener("click", apply);
    const cancel = el("button", "toolbar-btn", "Cancel"); cancel.type = "button";
    cancel.addEventListener("click", () => { preview.hidden = true; preview.textContent = ""; say("Week template closed"); $("[data-wk-start]").focus(); });
    acts.appendChild(ok); acts.appendChild(cancel);
    preview.appendChild(acts);
    if (!plan.add.length && !plan.double.length) preview.appendChild(el("p", "meal-note", "Every night is already planned this week, so there's nothing to add."));
  }

  function doneText(plan) {
    const day = (d) => parseYmd(d).toLocaleDateString(undefined, { weekday: "long" });
    const dbl = plan.add.filter((e) => e.x === 2).map((e) => day(e.date));
    const left = plan.add.filter((e) => !e.slug).map((e) => day(e.date));
    const parts = [];
    if (dbl.length) parts.push("double batch" + (dbl.length > 1 ? "es" : "") + " on " + dbl.join(" and "));
    if (plan.double.length) parts.push(plan.double.length + " dinner" + (plan.double.length > 1 ? "s" : "") + " you already planned marked double batch");
    if (left.length) parts.push("leftover night" + (left.length > 1 ? "s" : "") + " on " + left.join(" and "));
    return "Added to your calendar: " + parts.join("; ") + ". The shopping list buys double for the double-batch nights.";
  }
  function apply() {
    const plan = planWeek(cal.load(ls), week, picks);
    lastDone = applyPlan(cal, ls, plan);
    const n = lastDone.added.length + lastDone.doubled.length;
    preview.textContent = "";
    const msg = el("p", "wk-done", n ? doneText(plan) : "Nothing was added.");
    preview.appendChild(msg);
    if (n) {
      const acts = el("div", "wk-actions");
      const undo = el("button", "toolbar-btn", "Undo"); undo.type = "button";
      undo.addEventListener("click", () => { undoPlan(cal, ls, lastDone); lastDone = null; preview.hidden = true; preview.textContent = ""; say("Week template undone"); if (cal.ui) cal.ui.refresh(); $("[data-wk-start]").focus(); });
      const shop = el("button", "toolbar-btn", "Open shopping list"); shop.type = "button";
      shop.addEventListener("click", () => { const b = document.querySelector("[data-shop-open]"); if (b) b.click(); });
      acts.appendChild(undo); acts.appendChild(shop); preview.appendChild(acts);
    }
    say(msg.textContent);
    if (cal.ui) cal.ui.show(week.tue);
  }

  $("[data-wk-start]").addEventListener("click", () => {
    week = currentWeek(); if (!week) return;
    lastDone = null;
    say("Loading quick dinners…");
    load().then(() => {
      ranked = rank(cands, cal.load(ls), week.sun);
      picks = suggestPair(ranked);
      preview.hidden = false; renderPreview();
      say("Week template for the week of " + short(week.sun) + ". Review Tuesday and Thursday, then add to your calendar.");
      const f = preview.querySelector("select, .wk-apply"); if (f) f.focus();
    }).catch(() => { loaded = null; say("Couldn't load the recipe list. Try again when you're online."); });
  });
  app.addEventListener("cal:render", () => {
    updateLabel();
    // A different week was picked while the preview is open: close it so it can't apply to the wrong dates.
    if (!preview.hidden && week && !lastDone) { const w = currentWeek(); if (w && w.sun !== week.sun) { preview.hidden = true; preview.textContent = ""; } }
  });
  updateLabel();
})(typeof window !== "undefined" ? window : globalThis);
