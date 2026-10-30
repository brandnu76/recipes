/* Carroll Lowcountry Table — Meal calendar (calendar.html)
   Saved ONLY in this device's localStorage under clt-meal-calendar-v1.
   No accounts, no server, and nothing is ever written to the address bar. */
"use strict";
(function (root) {
  const KEY = "clt-meal-calendar-v1";
  const SLOTS = ["Breakfast", "Lunch", "Dinner", "Other"];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

  function clean(e) {
    if (!e || typeof e !== "object" || !DATE_RE.test(e.date || "")) return null;
    const slug = typeof e.slug === "string" && /^[a-z0-9-]+$/.test(e.slug) ? e.slug : "";
    const title = String(e.title || "").trim().slice(0, 140);
    if (!slug && !title) return null;
    return {
      id: typeof e.id === "string" && e.id ? e.id : newId(),
      date: e.date,
      slot: SLOTS.indexOf(e.slot) !== -1 ? e.slot : "Dinner",
      slug,
      title: title || slug,
    };
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function load(storage) {
    try {
      const raw = storage.getItem(KEY);
      const v = raw ? JSON.parse(raw) : null;
      const list = v && Array.isArray(v.entries) ? v.entries : [];
      return list.map(clean).filter(Boolean);
    } catch (_) { return []; }
  }
  function save(storage, entries) {
    try { storage.setItem(KEY, JSON.stringify({ v: 1, entries: entries.map(clean).filter(Boolean) })); return true; }
    catch (_) { return false; }
  }
  function add(storage, entry) {
    const e = clean(entry); if (!e) return null;
    const list = load(storage); list.push(e);
    return save(storage, list) ? e : null;
  }
  function remove(storage, id) {
    const list = load(storage); const next = list.filter((e) => e.id !== id);
    return save(storage, next) && next.length !== list.length;
  }
  function move(storage, id, date, slot) {
    if (!DATE_RE.test(date || "")) return false;
    const list = load(storage); const e = list.find((x) => x.id === id);
    if (!e) return false;
    e.date = date; if (slot && SLOTS.indexOf(slot) !== -1) e.slot = slot;
    return save(storage, list);
  }
  function forDate(entries, date) {
    return entries.filter((e) => e.date === date).sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  }
  function monthGrid(year, month) {
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      days.push({ date: ymd(d), day: d.getDate(), inMonth: d.getMonth() === month });
    }
    while (days.length > 35 && days.slice(-7).every((d) => !d.inMonth)) days.splice(-7);
    return days;
  }
  function toIcs(entries, base) {
    const esc = (s) => String(s).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Carroll Lowcountry Table//Meal calendar//EN"];
    entries.forEach((e) => {
      const d = e.date.replace(/-/g, "");
      const n = parseYmd(e.date); n.setDate(n.getDate() + 1);
      lines.push("BEGIN:VEVENT", "UID:" + e.id + "@carroll-lowcountry-table", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
        "DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + ymd(n).replace(/-/g, ""), "SUMMARY:" + esc(e.slot + ": " + e.title));
      if (e.slug && base) lines.push("URL:" + base + e.slug + ".html");
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  const core = { KEY, SLOTS, ymd, parseYmd, clean, load, save, add, remove, move, forDate, monthGrid, toIcs };
  if (typeof module !== "undefined" && module.exports) { module.exports = core; return; }
  root.CLTMealCalendar = core;

  // ---------------- UI ----------------
  const app = document.querySelector("[data-cal-app]");
  if (!app) return;
  const ls = window.localStorage;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const today = ymd(new Date());
  let view = new Date(); view = new Date(view.getFullYear(), view.getMonth(), 1);
  let selected = today;
  let recipes = [];
  let moving = null;

  const $ = (s) => app.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const status = $("[data-cal-status]");
  const say = (t) => { if (status) status.textContent = t; };
  const nice = (date) => parseYmd(date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  function render() {
    const entries = load(ls);
    $("[data-cal-title]").textContent = MONTHS[view.getMonth()] + " " + view.getFullYear();
    const grid = $("[data-cal-grid]"); grid.textContent = "";
    WD.forEach((w) => grid.appendChild(el("div", "cal-wd", w)));
    monthGrid(view.getFullYear(), view.getMonth()).forEach((d) => {
      const b = el("button", "cal-day");
      b.type = "button";
      if (!d.inMonth) b.classList.add("is-out");
      if (d.date === today) b.classList.add("is-today");
      if (d.date === selected) b.classList.add("is-selected");
      const list = forDate(entries, d.date);
      b.setAttribute("aria-label", nice(d.date) + (list.length ? ", " + list.length + " meal" + (list.length > 1 ? "s" : "") : ""));
      b.appendChild(el("span", "cal-num", String(d.day)));
      list.slice(0, 3).forEach((e) => b.appendChild(el("span", "cal-chip cal-chip-" + e.slot.toLowerCase(), e.title)));
      if (list.length > 3) b.appendChild(el("span", "cal-more", "+" + (list.length - 3) + " more"));
      if (list.length) b.appendChild(el("span", "cal-dot", ""));
      b.addEventListener("click", () => {
        if (moving) { move(ls, moving, d.date); moving = null; say("Moved to " + nice(d.date)); }
        selected = d.date; render();
      });
      grid.appendChild(b);
    });
    renderDay(entries);
    renderAgenda(entries);
    app.classList.toggle("is-moving", !!moving);
    $("[data-cal-moving]").hidden = !moving;
  }

  function entryRow(e, withDate) {
    const li = el("li", "cal-entry");
    li.appendChild(el("span", "cal-slot cal-chip-" + e.slot.toLowerCase(), e.slot));
    const body = el("span", "cal-entry-body");
    if (withDate) body.appendChild(el("span", "cal-entry-date", parseYmd(e.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })));
    if (e.slug) { const a = el("a", "cal-entry-link", e.title); a.href = e.slug + ".html"; body.appendChild(a); }
    else body.appendChild(el("span", "cal-entry-note", e.title));
    li.appendChild(body);
    const acts = el("span", "cal-entry-actions");
    if (e.slug) {
      const plan = el("button", "toolbar-btn", "Plan this meal"); plan.type = "button";
      plan.addEventListener("click", () => {
        let cur = []; try { cur = JSON.parse(ls.getItem("clt:meal") || "[]"); } catch (_) {}
        if (!Array.isArray(cur)) cur = [];
        if (cur.indexOf(e.slug) === -1) {
          if (cur.length >= 4 && !confirm("Plan a Meal already has 4 dishes. Replace them with this recipe?")) return;
          cur = cur.length >= 4 ? [e.slug] : cur.concat(e.slug);
          try { ls.setItem("clt:meal", JSON.stringify(cur)); } catch (_) {}
        }
        location.href = "meal-planner.html";
      });
      acts.appendChild(plan);
    }
    const mv = el("button", "toolbar-btn", "Move"); mv.type = "button";
    mv.addEventListener("click", () => { moving = e.id; say("Tap the day to move “" + e.title + "” to."); render(); });
    const md = el("input", "cal-move-date"); md.type = "date"; md.value = e.date; md.setAttribute("aria-label", "Move " + e.title + " to date");
    md.addEventListener("change", () => { if (md.value && move(ls, e.id, md.value)) { selected = md.value; const d = parseYmd(md.value); view = new Date(d.getFullYear(), d.getMonth(), 1); say("Moved to " + nice(md.value)); render(); } });
    const rm = el("button", "toolbar-btn", "Remove"); rm.type = "button";
    rm.addEventListener("click", () => { remove(ls, e.id); say("Removed " + e.title); render(); });
    acts.appendChild(mv); acts.appendChild(md); acts.appendChild(rm);
    li.appendChild(acts);
    return li;
  }

  function renderDay(entries) {
    $("[data-cal-day-title]").textContent = nice(selected);
    const ul = $("[data-cal-day-list]"); ul.textContent = "";
    const list = forDate(entries, selected);
    if (!list.length) ul.appendChild(el("li", "cal-empty", "Nothing planned yet."));
    list.forEach((e) => ul.appendChild(entryRow(e, false)));
  }

  function renderAgenda(entries) {
    const ul = $("[data-cal-agenda]"); ul.textContent = "";
    const up = entries.filter((e) => e.date >= today).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)).slice(0, 30);
    if (!up.length) ul.appendChild(el("li", "cal-empty", "No upcoming meals. Pick a day and add one."));
    up.forEach((e) => ul.appendChild(entryRow(e, true)));
  }

  // Recipe search (fed by recipes.html cards + search-index.json)
  const search = $("[data-cal-search]"), results = $("[data-cal-results]");
  function showResults() {
    const q = search.value.trim().toLowerCase(); results.textContent = "";
    if (!q) return;
    const words = q.split(/\s+/);
    recipes.filter((r) => words.every((w) => r.hay.indexOf(w) !== -1)).slice(0, 8).forEach((r) => {
      const li = el("li"); const b = el("button", "cal-result", r.title); b.type = "button";
      b.addEventListener("click", () => addEntry({ slug: r.slug, title: r.title }));
      li.appendChild(b); results.appendChild(li);
    });
    if (!results.children.length) results.appendChild(el("li", "cal-empty", "No matching recipes. Use a note instead."));
  }
  function addEntry(x) {
    const e = add(ls, { date: selected, slot: $("[data-cal-slot]").value, slug: x.slug, title: x.title });
    if (!e) { say("Couldn't save. Storage may be off in this browser mode."); return; }
    search.value = ""; results.textContent = ""; say("Added " + e.title + " to " + nice(selected));
    render();
  }
  search.addEventListener("input", showResults);
  $("[data-cal-note-form]").addEventListener("submit", (ev) => {
    ev.preventDefault(); const n = $("[data-cal-note]"); const t = n.value.trim();
    if (t) { addEntry({ title: t }); n.value = ""; }
  });
  $("[data-cal-prev]").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
  $("[data-cal-next]").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });
  $("[data-cal-today]").addEventListener("click", () => { view = new Date(); view = new Date(view.getFullYear(), view.getMonth(), 1); selected = today; render(); });
  $("[data-cal-cancel-move]").addEventListener("click", () => { moving = null; say("Move cancelled"); render(); });
  $("[data-cal-ics]").addEventListener("click", () => {
    const entries = load(ls);
    if (!entries.length) { say("Nothing to download yet."); return; }
    const base = location.href.replace(/[?#].*$/, "").replace(/[^/]*$/, "");
    const url = URL.createObjectURL(new Blob([toIcs(entries, base)], { type: "text/calendar" }));
    const a = document.createElement("a"); a.href = url; a.download = "meal-calendar.ics"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  window.addEventListener("storage", (e) => { if (e.key === KEY) render(); });

  // Never carry state in the address bar.
  if (location.search || location.hash) history.replaceState(null, "", location.pathname);

  render();
  Promise.all([
    fetch("recipes.html").then((r) => r.text()),
    fetch("search-index.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]).then(([html, index]) => {
    const doc = new DOMParser().parseFromString(html, "text/html"); const seen = {};
    doc.querySelectorAll(".book-list a[href$='.html']").forEach((a) => {
      const slug = a.getAttribute("href").replace(/\.html$/, "");
      if (seen[slug]) return; seen[slug] = 1;
      const t = a.querySelector(".card-title"); const title = (t ? t.textContent : a.textContent).trim();
      recipes.push({ slug, title, hay: (title + " " + (a.getAttribute("data-search") || "") + " " + (index[slug] || "")).toLowerCase() });
    });
    recipes.sort((a, b) => a.title.localeCompare(b.title));
    showResults();
  }).catch(() => say("Couldn't load the recipe list. Notes still work."));
})(typeof window !== "undefined" ? window : globalThis);
