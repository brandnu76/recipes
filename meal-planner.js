/* Carroll Lowcountry Table — Plan a Meal.
   Works backward from the time you want to eat so every dish lands together.
   Everything stays on this device (localStorage). No accounts, no server. */
(function (root) {
  "use strict";

  // ---------- pure planning logic (also used by the node test) ----------
  const MAX_TIMER_MS = 3 * 60 * 60 * 1000;
  // Same pattern recipe.js cook-mode timers use.
  const DURATION_RE = /\b(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*(?:-|–|—|to)\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?))?\s*-?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/gi;
  const PREHEAT_MIN = 15;
  const BOIL_MIN = 15;
  const DEFAULT_STEP_MIN = 5;

  function parseQty(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) return +mixed[3] ? +mixed[1] + +mixed[2] / +mixed[3] : null;
    const frac = s.match(/^(\d+)\/(\d+)$/);
    if (frac) return +frac[2] ? +frac[1] / +frac[2] : null;
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  // Minutes found in a step (lower bound of ranges, overnight ignored).
  function parseStepMinutes(text) {
    const re = new RegExp(DURATION_RE.source, "gi");
    let m, total = 0, found = 0;
    while ((m = re.exec(text || ""))) {
      const amount = parseQty(m[1]);
      if (amount == null || amount <= 0) continue;
      const u = m[3].toLowerCase().charAt(0);
      const ms = amount * (u === "s" ? 1000 : u === "h" ? 3600000 : 60000);
      if (ms > MAX_TIMER_MS) continue;
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 28);
      if (/\bovernight\b/i.test(after)) continue;
      let mins = ms / 60000;
      if (/^\s*(per|a|each) side/i.test(after)) mins *= 2;
      total += mins;
      found += 1;
    }
    return found ? Math.max(1, Math.round(total)) : null;
  }

  function isoMinutes(iso) {
    const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(String(iso || ""));
    if (!m) return 0;
    return (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
  }

  function sentences(text) {
    return String(text).replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  }

  const PREHEAT_RE = /\b(?:pre-?heat|heat|set|fire up|light|turn on|bring)\b[^.]*?\b(oven|grill|smoker|pellet grill|broiler)\b|\b(oven|grill|smoker)\b[^.]{0,20}\bto\s+\d{3}\s*°?\s*F?\b/i;
  const BOIL_RE = /\b(?:bring|put|start|set)\b[^.]*\b(?:water|pot)\b[^.]*\bboil|\bpot of (?:well-)?salted water\b|\bsalted water to a (?:rolling )?boil/i;
  const PASSIVE_RE = /\b(bake|baking|roast|simmer|rest|resting|chill|refrigerat|marinat|smoke|braise|slow[- ]cook|pressure|rise|proof|stand|sit|cool|undisturbed|in the oven|on the grill|soak|steep)\w*/i;
  const MAKE_AHEAD_RE = /\b(vinaigrette|dressing|whisk together|stir together|shake until|grate|grated|shred|chop|dice|mince|peel|trim|wash|rinse|spin|pat (?:\w+ )*dry|marinat|dry[- ]brine|brine|rub|spice mix|in a (?:small |large |medium )?(?:bowl|jar)|make ahead|up to \d+ days|refrigerat|keeps)/i;
  const LAST_MINUTE_RE = /\b(serve|serving|just before|immediately|plate|platter|toss (?:the|with|everything)|garnish|at the table|sit down|against the grain|across the grain|carve)\b/i;
  const ALT_METHOD_RE = /^\s*(?:oven|stovetop|stove-top|grill|air[- ]fryer|slow[- ]cooker|instant pot|smoker|pellet grill|charcoal|gas grill)(?: method| option| version| alternative)?\s*:|^\s*(?:alternatively|no (?:grill|smoker)\?)/i;
  const SAUCE_AHEAD_RE = /\b(sauce|dressing|vinaigrette|slaw|aioli|crema|chimichurri|glaze|rub|spice mix)\b[^.]*\b(whisk|stir|mix|combine|shake|blend)|\b(whisk|stir|mix|combine|shake|blend)\b[^.]*\b(sauce|dressing|vinaigrette|slaw|aioli|crema|chimichurri)\b/i;
  const NOT_AHEAD_RE = /\b(dough|rise|proof|knead|batter|sheet pan|baking dish|pan\b|tray|skillet|stretch)/i;

  function equipmentOf(text) {
    const t = String(text).toLowerCase().replace(/baking (soda|powder|sheet|dish|pan)/g, "$1").replace(/baked beans/g, "beans").replace(/\b(while|as|until) the (grill|oven|smoker|broiler)\b[^.,;]*/g, "");
    const eq = new Set();
    const dutch = /dutch oven/.test(t);
    const t2 = t.replace(/dutch oven/g, "pot");
    if (/\bbroil/.test(t2)) eq.add("broiler");
    if (/\bgrill\b|\bgrill grates?\b|\bsmoker\b|\bpellet\b|\bon the grates?\b|\bsmok(e|ing) at\b|\bkettle\b|\bcoals\b/.test(t2)) eq.add("grill");
    if (/\boven\b|\broast(ing)?\b|\bbake[sd]?\b|\bbaking\b/.test(t2) || (dutch && /\bin the oven\b|oven to/.test(t))) eq.add("oven");
    if (/\bbrown the\b|\bskillet\b|\bsaucepan\b|\bsaute pan\b|\bpot\b|\bpan over\b|\bover (medium|high|low|medium-high|medium-low)\b|\bboil|\bsimmer|\bsaut[eé]|\bsear\b|\bstovetop\b|\bstove\b|\bburner\b|\bwok\b|\bgriddle\b|\bfry\b|\bmelt\b/.test(t2)) eq.add("stove");
    if (eq.has("broiler")) eq.delete("oven");
    return eq;
  }

  // Cooking temperature, skipping doneness readings ("until it reaches 175 F").
  function tempOf(text) {
    const s = String(text);
    const re = /\b(\d{3})\s*(?:°\s*F?|degrees(?: F)?|º\s*F?|F)\b/gi;
    let m;
    while ((m = re.exec(s))) {
      const n = +m[1];
      const before = s.slice(Math.max(0, m.index - 45), m.index).toLowerCase();
      if (/(reach|regist|internal|thermometer|reads?|hits?|until|center|thickest|doneness|pull (it|them)? ?at|\()[^.]*$/.test(before)) continue;
      if (n >= 200 && n <= 700) return n;
    }
    return null;
  }

  function shortText(text, max) {
    const s = String(text).replace(/\s+/g, " ").trim();
    if (s.length <= (max || 170)) return s;
    const cut = s.slice(0, max || 170);
    return cut.slice(0, cut.lastIndexOf(" ")) + "…";
  }

  // Build a dish model from a schema.org Recipe object.
  function buildDish(recipe, slug, colorIndex) {
    const raw = [];
    const walk = (list) => (list || []).forEach((it) => {
      if (!it) return;
      if (typeof it === "string") raw.push(it);
      else if (it["@type"] === "HowToSection" || it.itemListElement) walk(it.itemListElement);
      else if (it.text) raw.push(String(it.text));
      else if (it.name) raw.push(String(it.name));
    });
    const skipped = [];
    walk(Array.isArray(recipe.recipeInstructions) ? recipe.recipeInstructions : [recipe.recipeInstructions]);
    const dish = {
      slug: slug,
      name: String(recipe.name || slug),
      color: colorIndex % 4,
      prep: isoMinutes(recipe.prepTime),
      cook: isoMinutes(recipe.cookTime),
      total: isoMinutes(recipe.totalTime) || isoMinutes(recipe.prepTime) + isoMinutes(recipe.cookTime),
      steps: [],
    };
    let dishOvenTemp = null, dishGrillTemp = null;
    let seenHeat = false;
    const heated = { oven: false, grill: false };
    raw.forEach((text, idx) => {
      if (ALT_METHOD_RE.test(text)) { skipped.push(idx); return; }
      const sents = sentences(text);
      const pre = [], rest = [];
      sents.forEach((s) => (PREHEAT_RE.test(s) && !/\b(roast|bake|cook|grill|smoke)\b[^.]*\d+\s*(min|hour)/i.test(s) && !/\bbroil\b[^.]*\d+\s*(min|sec)/i.test(s) ? pre : rest).push(s));
      const remaining = rest.join(" ");
      const step = {
        idx: idx,
        text: text,
        label: shortText(text),
        full: text,
        kind: "cook",
        minutes: null,
        source: "default",
        equip: Array.from(equipmentOf(remaining || text)),
        temp: tempOf(remaining),
        active: true,
        makeAhead: false,
        boilLead: false,
        background: [],
      };
      pre.forEach((s) => {
        const e = Array.from(equipmentOf(s));
        const which = e.indexOf("grill") !== -1 ? "grill" : e.indexOf("broiler") !== -1 ? "broiler" : "oven";
        const t = tempOf(s);
        if (which === "oven" && t) dishOvenTemp = t;
        if (which === "grill" && t) dishGrillTemp = t;
        if (which !== "broiler") heated[which] = true;
        step.background.push({ kind: "preheat", equip: which, temp: t, minutes: which === "broiler" ? 5 : PREHEAT_MIN, label: shortText(s, 120) });
      });
      const parsed = parseStepMinutes(remaining);
      if (BOIL_RE.test(remaining)) {
        step.boilLead = true;
        step.background.push({ kind: "boil", equip: "stove", temp: null, minutes: BOIL_MIN, label: "Bring the pot of water to a boil" });
      }
      if (!remaining.trim()) step.kind = "preheat-only";
      else if (pre.length) step.label = shortText(remaining);
      // Oven or grill used with no preheat step written: add one.
      ["oven", "grill"].forEach((k) => {
        if (step.equip.indexOf(k) !== -1 && !heated[k] && step.kind !== "preheat-only") {
          heated[k] = true;
          const t = step.temp || (k === "oven" ? dishOvenTemp : dishGrillTemp);
          step.background.push({ kind: "preheat", equip: k, temp: t, minutes: PREHEAT_MIN, label: (k === "oven" ? "Preheat the oven" : "Fire up the grill") + (t ? " to " + t + "°F" : "") });
        }
      });
      if (step.equip.indexOf("oven") !== -1 && !step.temp) step.temp = dishOvenTemp;
      if (step.equip.indexOf("grill") !== -1 && !step.temp) step.temp = dishGrillTemp;
      if (step.equip.indexOf("oven") !== -1 && step.temp) dishOvenTemp = step.temp;
      if (parsed != null) { step.minutes = parsed; step.source = "parsed"; }
      if (/\b(rest|let (it |them )?(rest|stand|sit|cool))\b/i.test(remaining)) step.kind = "rest";
      const heat = step.equip.length > 0;
      step.active = !(PASSIVE_RE.test(remaining) && (step.minutes || 0) >= 8) || step.kind === "preheat-only";
      if (!heat && !seenHeat && MAKE_AHEAD_RE.test(remaining) && !LAST_MINUTE_RE.test(remaining) && !NOT_AHEAD_RE.test(remaining)) step.makeAhead = true;
      if (!heat && SAUCE_AHEAD_RE.test(remaining) && !LAST_MINUTE_RE.test(remaining) && !NOT_AHEAD_RE.test(remaining)) step.makeAhead = true;
      if (!heat && /\b(marinat|dry[- ]brine|brine)\w*/i.test(remaining) && !LAST_MINUTE_RE.test(remaining)) step.makeAhead = true;
      if (heat) seenHeat = true;
      dish.steps.push(step);
    });
    // Recipes with no heat at all (salads): the last step stays at the table,
    // everything before it can be done ahead.
    if (!dish.steps.some((s) => s.equip.length)) {
      dish.steps.forEach((s, i) => { s.makeAhead = i < dish.steps.length - 1 && !LAST_MINUTE_RE.test(s.text) && !NOT_AHEAD_RE.test(s.text); });
    }
    dish.skipped = skipped;
    // Fill steps with no parseable time from the recipe's stated total.
    const timed = dish.steps.filter((s) => s.kind !== "preheat-only");
    const parsedSum = timed.reduce((a, s) => a + (s.minutes || 0), 0);
    const missing = timed.filter((s) => s.minutes == null);
    let each = DEFAULT_STEP_MIN;
    if (missing.length && dish.total > parsedSum) each = Math.round((dish.total - parsedSum) / missing.length);
    each = Math.max(2, Math.min(15, each));
    missing.forEach((s) => { s.minutes = each; s.source = "default"; });
    dish.steps.forEach((s) => { if (s.kind === "preheat-only") { s.minutes = 0; s.source = "parsed"; } });
    return dish;
  }

  // Lay one dish out backward from its finish (minutes relative to eat time).
  // overrides: { "slug:idx": minutes }, offset: minutes the dish finishes early.
  function scheduleDish(dish, overrides, offset) {
    const ev = [];
    let end = -(offset || 0);
    const chain = dish.steps.filter((s) => !s.makeAhead);
    const placed = [];
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const s = chain[i];
      const key = dish.slug + ":" + s.idx;
      const mins = overrides && overrides[key] != null ? Math.max(0, +overrides[key]) : s.minutes;
      const start = end - mins;
      placed.unshift({ step: s, start: start, end: end, minutes: mins, edited: overrides && overrides[key] != null });
      end = start;
    }
    placed.forEach((p, i) => {
      const s = p.step;
      if (s.kind !== "preheat-only") {
        ev.push({
          id: dish.slug + ":" + s.idx, dish: dish.slug, name: dish.name, color: dish.color, idx: s.idx,
          kind: s.kind, label: s.label, text: s.label.length < s.text.length && s.label.slice(-1) !== "…" ? s.label : s.text, start: p.start, end: p.end, minutes: p.minutes,
          source: p.edited ? "edited" : s.source, equip: s.equip, temp: s.temp, active: s.active, editable: true,
        });
      }
      s.background.forEach((b) => {
        // Preheat runs until the first later step that needs that equipment.
        let until = p.start;
        if (b.kind === "preheat") {
          const need = b.equip === "broiler" ? "broiler" : b.equip;
          const later = placed.slice(s.kind === "preheat-only" || s.equip.indexOf(need) === -1 ? i + 1 : i).find((q) => q.step.equip.indexOf(need) !== -1);
          until = later ? later.start : (placed[i + 1] ? placed[i + 1].start : p.start);
        }
        const keyB = dish.slug + ":" + s.idx + ":" + b.kind;
        const mins = overrides && overrides[keyB] != null ? Math.max(0, +overrides[keyB]) : b.minutes;
        ev.push({
          id: keyB, dish: dish.slug, name: dish.name, color: dish.color, idx: s.idx,
          kind: b.kind, label: b.kind === "boil" ? b.label : (b.equip === "oven" ? "Preheat the oven" : b.equip === "grill" ? "Fire up the grill" : "Turn on the broiler") + (b.temp ? " to " + b.temp + "°F" : ""),
          text: b.label, start: until - mins, end: until, minutes: mins,
          source: overrides && overrides[keyB] != null ? "edited" : "default",
          equip: [b.equip], temp: b.temp, active: false, editable: true, background: true,
        });
      });
    });
    const ahead = dish.steps.filter((s) => s.makeAhead).map((s) => ({
      id: dish.slug + ":" + s.idx, dish: dish.slug, name: dish.name, color: dish.color, idx: s.idx,
      label: s.label, text: s.text, minutes: overrides && overrides[dish.slug + ":" + s.idx] != null ? +overrides[dish.slug + ":" + s.idx] : s.minutes,
    }));
    return { events: ev, ahead: ahead };
  }

  function overlap(a, b) { return Math.min(a.end, b.end) - Math.max(a.start, b.start); }

  // Smallest shift that clears a shared-appliance clash: move one dish's
  // whole run on that appliance so it ends when the other's begins.
  function spanOf(events, dish, kinds) {
    const own = events.filter((e) => e.dish === dish && e.minutes > 0 && kinds.some((k) => e.equip.indexOf(k) !== -1));
    if (!own.length) return null;
    return { start: Math.min.apply(null, own.map((e) => e.start)), end: Math.max.apply(null, own.map((e) => e.end)) };
  }
  function bestShift(events, a, b, kinds) {
    const sa = spanOf(events, a.dish, kinds), sb = spanOf(events, b.dish, kinds);
    if (!sa || !sb) return { dish: a.dish, name: a.name, by: 5 };
    const moveA = Math.ceil(sa.end - sb.start), moveB = Math.ceil(sb.end - sa.start);
    return moveA <= moveB ? { dish: a.dish, name: a.name, by: Math.max(1, moveA) } : { dish: b.dish, name: b.name, by: Math.max(1, moveB) };
  }

  function findConflicts(events) {
    const out = [];
    const seen = new Set();
    const uses = (e, k) => e.equip.indexOf(k) !== -1 && e.minutes > 0;
    for (let i = 0; i < events.length; i += 1) {
      for (let j = i + 1; j < events.length; j += 1) {
        const a = events[i], b = events[j];
        if (a.dish === b.dish) continue;
        const ov = overlap(a, b);
        if (ov <= 0) continue;
        const later = a.start <= b.start ? b : a;
        const earlier = later === a ? b : a;
        const pairKey = (type) => type + "|" + [a.dish, b.dish].sort().join("|");
        const push = (type, severity, msg, shiftDish, shiftBy) => {
          const k = pairKey(type);
          if (seen.has(k)) return;
          seen.add(k);
          out.push({ type: type, severity: severity, message: msg, at: Math.max(a.start, b.start), shiftDish: shiftDish, shiftBy: shiftBy, events: [a.id, b.id] });
        };
        if (uses(a, "oven") && uses(b, "oven") && a.temp && b.temp && a.temp !== b.temp) {
          const f = bestShift(events, a, b, ["oven", "broiler"]);
          push("oven", "conflict", "Oven clash around {t}: " + a.name + " wants " + a.temp + "°F and " + b.name + " wants " + b.temp + "°F at the same time. Finish " + f.name + " " + f.by + " min early and hold it covered, use a second oven or air fryer, or split the difference if one dish is forgiving.", f.dish, f.by);
        }
        if (uses(a, "broiler") && uses(b, "broiler")) {
          push("broiler", "conflict", "Both " + a.name + " and " + b.name + " need the broiler around {t}. Broil " + earlier.name + " first.", earlier.dish, Math.ceil(ov));
        }
        if (uses(a, "grill") && uses(b, "grill") && a.temp && b.temp && Math.abs(a.temp - b.temp) > 25) {
          const f = bestShift(events, a, b, ["grill"]);
          push("grill", "conflict", "Grill clash around {t}: " + a.name + " at " + a.temp + "°F vs " + b.name + " at " + b.temp + "°F. Finish " + f.name + " " + f.by + " min early, or cook one on the stovetop or in the oven.", f.dish, f.by);
        }
        if (uses(a, "broiler") && uses(b, "oven") || uses(b, "broiler") && uses(a, "oven")) {
          const f = bestShift(events, a, b, ["oven", "broiler"]);
          push("broiler-oven", "conflict", "Around {t} the broiler and a bake need the same oven (" + a.name + " / " + b.name + "). Finish " + f.name + " " + f.by + " min early.", f.dish, f.by);
        }
        const flexible = (e) => !e.equip.length && e.source === "default";
        if (a.active && b.active && ov >= 3 && !flexible(a) && !flexible(b)) {
          push("hands", "warning", "Hands full around " + "{t}" + ": " + a.name + " and " + b.name + " both need you for about " + Math.round(ov) + " min. Shift " + earlier.name + " " + Math.ceil(ov) + " min earlier if you're cooking solo.", earlier.dish, Math.ceil(ov));
        }
      }
    }
    // Burners: sweep the stovetop.
    const stove = events.filter((e) => uses(e, "stove"));
    const points = Array.from(new Set(stove.map((e) => e.start))).sort((x, y) => x - y);
    for (const p of points) {
      const live = stove.filter((e) => e.start <= p && e.end > p);
      if (live.length > 4) {
        out.push({ type: "burners", severity: "conflict", message: live.length + " burners at once around {t}. Most home ranges have 4. Move one stovetop job earlier and hold it warm.", at: p, shiftDish: live[0].dish, shiftBy: 5, events: live.map((e) => e.id) });
        break;
      }
    }
    return out.sort((x, y) => x.at - y.at);
  }

  function planMeal(dishes, opts) {
    const o = opts || {};
    let events = [], ahead = [];
    dishes.forEach((d) => {
      const r = scheduleDish(d, o.overrides || {}, (o.offsets || {})[d.slug] || 0);
      events = events.concat(r.events);
      ahead = ahead.concat(r.ahead);
    });
    events.sort((a, b) => a.start - b.start || (a.background ? -1 : 1) || a.dish.localeCompare(b.dish));
    const conflicts = findConflicts(events);
    const first = events.length ? events[0].start : 0;
    // Do-earlier work should be finished before the first timed step.
    let cursor = first;
    for (let i = ahead.length - 1; i >= 0; i -= 1) { ahead[i].by = first; cursor -= ahead[i].minutes || 0; }
    return { events: events, ahead: ahead, conflicts: conflicts, start: first, aheadStart: cursor };
  }

  function extractRecipe(json) {
    const stack = [json];
    while (stack.length) {
      const n = stack.shift();
      if (!n || typeof n !== "object") continue;
      if (Array.isArray(n)) { stack.push.apply(stack, n); continue; }
      const t = n["@type"];
      if (t === "Recipe" || (Array.isArray(t) && t.indexOf("Recipe") !== -1)) return n;
      if (n["@graph"]) stack.push(n["@graph"]);
    }
    return null;
  }

  const core = { parseStepMinutes: parseStepMinutes, isoMinutes: isoMinutes, buildDish: buildDish, scheduleDish: scheduleDish, planMeal: planMeal, findConflicts: findConflicts, extractRecipe: extractRecipe, equipmentOf: equipmentOf, tempOf: tempOf };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  if (typeof document === "undefined") return;

  // ---------------------------- UI ----------------------------
  const app = document.querySelector("[data-meal-app]");
  if (!app) return;
  const MEAL_KEY = "clt:meal";
  const PLAN_KEY = "clt:meal-plan";
  const MAX_DISHES = 4;
  const store = {
    get(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
  };
  const $ = (sel) => app.querySelector(sel);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const live = $("[data-live]");
  const say = (m) => { if (live) { live.textContent = ""; window.setTimeout(() => { live.textContent = m; }, 30); } };

  let catalog = [];          // [{slug, title, cat, search}]
  const dishCache = {};      // slug -> dish
  let state = { slugs: [], eat: "18:30", day: null, overrides: {}, offsets: {}, done: {} };
  let plan = null;

  // --- state: URL beats saved plan beats the tray from recipe pages ---
  function readUrl() {
    const q = new URLSearchParams(location.search);
    if (!q.get("r")) return null;
    const s = { slugs: q.get("r").split(",").filter((x) => /^[a-z0-9-]+$/.test(x)).slice(0, MAX_DISHES), eat: /^\d{1,2}:\d{2}$/.test(q.get("t") || "") ? q.get("t") : "18:30", overrides: {}, offsets: {}, done: {} };
    (q.get("e") || "").split(",").forEach((p) => { const m = /^([a-z0-9-]+:\d+(?::(?:preheat|boil))?)=(\d+)$/.exec(p); if (m) s.overrides[m[1]] = +m[2]; });
    (q.get("o") || "").split(",").forEach((p) => { const m = /^([a-z0-9-]+)=(\d+)$/.exec(p); if (m) s.offsets[m[1]] = +m[2]; });
    return s;
  }
  function saveState() {
    store.set(PLAN_KEY, state);
    store.set(MEAL_KEY, state.slugs);
  }
  function shareUrl() {
    const u = new URL(location.href.replace(/[?#].*$/, ""));
    u.searchParams.set("r", state.slugs.join(","));
    u.searchParams.set("t", state.eat);
    const e = Object.keys(state.overrides).map((k) => k + "=" + state.overrides[k]).join(",");
    const o = Object.keys(state.offsets).filter((k) => state.offsets[k]).map((k) => k + "=" + state.offsets[k]).join(",");
    if (e) u.searchParams.set("e", e);
    if (o) u.searchParams.set("o", o);
    return u.toString();
  }

  // Next occurrence of HH:MM (today if still ahead, else tomorrow).
  function eatDate() {
    const [h, m] = state.eat.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (state.day) { const fixed = new Date(state.day); fixed.setHours(h, m, 0, 0); if (fixed.getTime() > Date.now() - 6 * 3600000) return fixed; }
    if (d.getTime() < Date.now() - 60 * 60000) d.setDate(d.getDate() + 1);
    return d;
  }
  const fmt = (date) => date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const at = (rel) => new Date(eatDate().getTime() + rel * 60000);

  // --- catalog from recipes.html + search-index.json ---
  async function loadCatalog() {
    try {
      const [html, idx] = await Promise.all([
        fetch("recipes.html").then((r) => r.text()),
        fetch("search-index.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      ]);
      const doc = new DOMParser().parseFromString(html, "text/html");
      const seen = new Set();
      doc.querySelectorAll(".book-list a[href$='.html']").forEach((a) => {
        const slug = a.getAttribute("href").replace(/^\.\//, "").replace(/\.html$/, "");
        if (seen.has(slug) || !/^[a-z0-9-]+$/.test(slug)) return;
        seen.add(slug);
        const title = (a.querySelector(".card-title") || a).textContent.trim();
        const cat = (a.querySelector(".card-cat") || { textContent: "" }).textContent.trim();
        catalog.push({ slug: slug, title: title, cat: cat, search: (title + " " + cat + " " + (a.getAttribute("data-search") || "") + " " + (idx[slug] || "")).toLowerCase() });
      });
    } catch (_) {}
  }
  const titleOf = (slug) => (catalog.find((c) => c.slug === slug) || {}).title || slug.replace(/-/g, " ");

  async function loadDish(slug, i) {
    if (dishCache[slug]) { dishCache[slug].color = i % 4; return dishCache[slug]; }
    const res = await fetch(slug + ".html");
    if (!res.ok) throw new Error("missing");
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    let recipe = null;
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      if (recipe) return;
      try { recipe = extractRecipe(JSON.parse(s.textContent)); } catch (_) {}
    });
    if (!recipe) throw new Error("no recipe data");
    dishCache[slug] = buildDish(recipe, slug, i);
    return dishCache[slug];
  }

  // --- picker ---
  const searchInput = $("[data-meal-search]");
  const results = $("[data-meal-results]");
  function renderResults() {
    results.replaceChildren();
    const q = (searchInput.value || "").trim().toLowerCase();
    if (!q) return;
    const terms = q.split(/\s+/);
    const hits = catalog.filter((c) => terms.every((t) => c.search.indexOf(t) !== -1)).slice(0, 8);
    if (!hits.length) { results.appendChild(el("li", "meal-empty", "No recipes match.")); return; }
    hits.forEach((c) => {
      const li = el("li");
      const b = el("button", "meal-pick");
      b.type = "button";
      const inMeal = state.slugs.indexOf(c.slug) !== -1;
      b.disabled = inMeal || state.slugs.length >= MAX_DISHES;
      b.appendChild(el("span", "card-cat", c.cat));
      b.appendChild(el("span", "meal-pick-title", c.title));
      b.appendChild(el("span", "meal-pick-add", inMeal ? "In meal" : "+ Add"));
      b.addEventListener("click", () => { addDish(c.slug); searchInput.focus(); });
      li.appendChild(b);
      results.appendChild(li);
    });
  }
  function addDish(slug) {
    if (state.slugs.indexOf(slug) !== -1 || state.slugs.length >= MAX_DISHES) return;
    state.slugs.push(slug);
    saveState();
    say(titleOf(slug) + " added to the meal");
    rebuild();
  }
  function removeDish(slug) {
    state.slugs = state.slugs.filter((s) => s !== slug);
    Object.keys(state.overrides).forEach((k) => { if (k.indexOf(slug + ":") === 0) delete state.overrides[k]; });
    delete state.offsets[slug];
    saveState();
    say(titleOf(slug) + " removed");
    rebuild();
  }

  function renderDishes(dishes, errors) {
    const list = $("[data-meal-dishes]");
    list.replaceChildren();
    state.slugs.forEach((slug, i) => {
      const li = el("li", "meal-dish dish-c" + (i % 4));
      const d = dishes.find((x) => x.slug === slug);
      const a = el("a", "meal-dish-name", d ? d.name : titleOf(slug));
      a.href = slug + ".html";
      li.appendChild(el("span", "dish-swatch"));
      li.appendChild(a);
      if (errors[slug]) li.appendChild(el("span", "meal-dish-err", "Couldn't load this recipe."));
      else if (d) li.appendChild(el("span", "meal-dish-meta", (d.total ? d.total + " min listed" : "no time listed") + " · " + d.steps.length + " steps"));
      const off = el("span", "meal-offset");
      const offLabel = el("span", "meal-offset-label", (state.offsets[slug] || 0) ? "Done " + state.offsets[slug] + " min early" : "Done at eat time");
      const mk = (txt, delta, aria) => { const b = el("button", "toolbar-btn meal-mini", txt); b.type = "button"; b.setAttribute("aria-label", aria); b.addEventListener("click", () => { state.offsets[slug] = Math.max(0, (state.offsets[slug] || 0) + delta); saveState(); rebuild(); }); return b; };
      off.appendChild(mk("−5", -5, "Finish " + titleOf(slug) + " 5 minutes later"));
      off.appendChild(offLabel);
      off.appendChild(mk("+5", 5, "Finish " + titleOf(slug) + " 5 minutes earlier"));
      li.appendChild(off);
      const rm = el("button", "toolbar-btn meal-remove", "Remove");
      rm.type = "button";
      rm.setAttribute("aria-label", "Remove " + titleOf(slug));
      rm.addEventListener("click", () => removeDish(slug));
      li.appendChild(rm);
      list.appendChild(li);
    });
    $("[data-meal-count]").textContent = state.slugs.length + " of " + MAX_DISHES + " dishes";
    renderResults();
  }

  function nudge(id, delta, value) {
    const ev = plan && (plan.events.find((e) => e.id === id) || plan.ahead.find((e) => e.id === id));
    if (!ev) return;
    const next = value != null ? value : Math.max(0, (ev.minutes || 0) + delta);
    state.overrides[id] = Math.min(600, Math.max(0, Math.round(next)));
    saveState();
    rebuild(id);
  }

  function stepRow(ev, withTime) {
    const li = el("li", "meal-step dish-c" + ev.color + (ev.background ? " is-background" : "") + (ev.active === false ? " is-passive" : ""));
    li.dataset.id = ev.id;
    if (withTime) li.appendChild(el("span", "meal-time", fmt(at(ev.start))));
    const body = el("div", "meal-step-body");
    const tag = el("span", "dish-tag", ev.name);
    body.appendChild(tag);
    body.appendChild(el("p", "meal-step-text", ev.label));
    const meta = el("p", "meal-step-meta");
    const bits = [];
    bits.push((ev.minutes || 0) + " min" + (ev.source === "default" ? " (estimated)" : ev.source === "edited" ? " (your edit)" : ""));
    if (ev.equip && ev.equip.length) bits.push(ev.equip.map((e) => (e === "stove" ? "stovetop" : e)).join(" + ") + (ev.temp ? " " + ev.temp + "°F" : ""));
    if (ev.active === false) bits.push("hands-off");
    meta.textContent = bits.join(" · ");
    body.appendChild(meta);
    li.appendChild(body);
    const ctl = el("div", "meal-nudge no-print");
    const minus = el("button", "toolbar-btn meal-mini", "−1");
    minus.type = "button"; minus.setAttribute("aria-label", "One minute shorter: " + ev.label);
    minus.addEventListener("click", () => nudge(ev.id, -1));
    const input = el("input", "meal-min-input");
    input.type = "number"; input.min = "0"; input.max = "600"; input.inputMode = "numeric"; input.value = String(ev.minutes || 0);
    input.setAttribute("aria-label", "Minutes for: " + ev.label);
    input.addEventListener("change", () => { const v = parseInt(input.value, 10); if (isFinite(v)) nudge(ev.id, 0, v); });
    const plus = el("button", "toolbar-btn meal-mini", "+1");
    plus.type = "button"; plus.setAttribute("aria-label", "One minute longer: " + ev.label);
    plus.addEventListener("click", () => nudge(ev.id, 1));
    ctl.appendChild(minus); ctl.appendChild(input); ctl.appendChild(el("span", "meal-min-unit", "min")); ctl.appendChild(plus);
    li.appendChild(ctl);
    return li;
  }

  function renderPlan(focusId) {
    const out = $("[data-meal-plan]");
    const empty = $("[data-meal-empty]");
    const tools = $("[data-meal-tools]");
    out.replaceChildren();
    if (!plan || !plan.events.length) { empty.hidden = false; tools.hidden = true; return; }
    empty.hidden = true; tools.hidden = false;
    const startAt = at(Math.min(plan.start, plan.aheadStart));
    $("[data-meal-summary]").textContent = "Start at " + fmt(at(plan.start)) + (plan.ahead.length ? " (do-earlier work before that)" : "") + " to eat at " + fmt(at(0)) + (at(0).toDateString() === new Date().toDateString() ? " today" : " " + at(0).toLocaleDateString([], { weekday: "long" })) + ". " + plan.events.length + " timed steps across " + state.slugs.length + " dishes.";

    if (plan.conflicts.length) {
      const box = el("section", "meal-conflicts");
      box.setAttribute("aria-label", "Timing conflicts");
      box.appendChild(el("h2", null, "Heads up"));
      const ul = el("ul");
      plan.conflicts.forEach((c) => {
        const li = el("li", "meal-conflict is-" + c.severity);
        li.appendChild(el("span", null, c.message.replace("{t}", fmt(at(c.at)))));
        if (c.shiftDish && c.shiftBy) {
          const b = el("button", "toolbar-btn meal-fix no-print", "Shift " + titleOf(c.shiftDish) + " " + c.shiftBy + " min earlier");
          b.type = "button";
          b.addEventListener("click", () => { state.offsets[c.shiftDish] = (state.offsets[c.shiftDish] || 0) + c.shiftBy; saveState(); rebuild(); say("Shifted"); });
          li.appendChild(b);
        }
        ul.appendChild(li);
      });
      box.appendChild(ul);
      out.appendChild(box);
    }

    if (plan.ahead.length) {
      const sec = el("section", "meal-ahead");
      sec.appendChild(el("h2", null, "Do earlier"));
      sec.appendChild(el("p", "meal-note", "Finish these any time before " + fmt(at(plan.start)) + ". They hold fine. About " + plan.ahead.reduce((a, e) => a + (e.minutes || 0), 0) + " min total."));
      const ul = el("ul", "meal-steps");
      plan.ahead.forEach((e) => ul.appendChild(stepRow(Object.assign({ equip: [], active: true, source: state.overrides[e.id] != null ? "edited" : "default" }, e), false)));
      sec.appendChild(ul);
      out.appendChild(sec);
    }

    const sec = el("section", "meal-timeline");
    sec.appendChild(el("h2", null, "Timeline"));
    const ol = el("ol", "meal-steps");
    plan.events.forEach((e) => ol.appendChild(stepRow(e, true)));
    const eat = el("li", "meal-step meal-eat");
    eat.appendChild(el("span", "meal-time", fmt(at(0))));
    eat.appendChild(el("p", "meal-step-text", "Eat. Everything lands together."));
    ol.appendChild(eat);
    sec.appendChild(ol);
    out.appendChild(sec);
    void startAt;
    if (focusId) {
      const row = out.querySelector('[data-id="' + CSS.escape(focusId) + '"] .meal-min-input');
      if (row) row.focus();
    }
  }

  let buildSeq = 0;
  async function rebuild(focusId) {
    const seq = ++buildSeq;
    const dishes = [], errors = {};
    const status = $("[data-meal-status]");
    if (state.slugs.length) status.textContent = "Reading recipes…";
    for (let i = 0; i < state.slugs.length; i += 1) {
      try { dishes.push(await loadDish(state.slugs[i], i)); } catch (_) { errors[state.slugs[i]] = true; }
    }
    if (seq !== buildSeq) return;
    status.textContent = "";
    plan = dishes.length ? planMeal(dishes, { overrides: state.overrides, offsets: state.offsets }) : null;
    renderDishes(dishes, errors);
    renderPlan(focusId);
    if (cook.on) renderCook();
  }

  // --- eat time ---
  const eatInput = $("[data-meal-eat]");
  eatInput.addEventListener("change", () => {
    if (/^\d{1,2}:\d{2}$/.test(eatInput.value)) { state.eat = eatInput.value; state.day = null; state.done = {}; saveState(); rebuild(); }
  });
  searchInput.addEventListener("input", renderResults);
  $("[data-action='meal-reset']").addEventListener("click", () => {
    state.overrides = {}; state.offsets = {}; state.done = {}; saveState(); rebuild(); say("Edits cleared");
  });
  $("[data-action='meal-clear']").addEventListener("click", () => {
    state = { slugs: [], eat: state.eat, day: null, overrides: {}, offsets: {}, done: {} }; saveState(); rebuild(); say("Meal cleared");
  });
  $("[data-action='meal-print']").addEventListener("click", () => window.print());
  const shareBtn = $("[data-action='meal-share']");
  shareBtn.addEventListener("click", async () => {
    const url = shareUrl();
    const title = "Meal plan: " + state.slugs.map(titleOf).join(" + ");
    try {
      if (navigator.share) { await navigator.share({ title: title, text: title + " — eat at " + fmt(at(0)), url: url }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); shareBtn.textContent = "Link copied"; say("Link copied"); window.setTimeout(() => { shareBtn.textContent = "Share"; }, 2000); }
    catch (_) { window.prompt("Copy this link", url); }
  });

  // --- Cook the meal ---
  const cook = { on: false, tick: null, wake: null, alerted: {}, sound: true, audio: null };
  const cookPanel = $("[data-meal-cook]");
  function chime() {
    if (!cook.sound) return;
    try {
      cook.audio = cook.audio || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = cook.audio;
      [0, 0.28, 0.56].forEach((t, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = [660, 880, 990][i];
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
        o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
      });
    } catch (_) {}
  }
  async function notify(ev) {
    chime();
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_) {}
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const title = fmt(at(ev.start)) + " · " + ev.name;
    const opts = { body: ev.label, tag: "clt-meal-" + ev.id, icon: "apple-touch-icon.png" };
    try {
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg && reg.showNotification) { reg.showNotification(title, opts); return; }
      new Notification(title, opts);
    } catch (_) {}
  }
  async function requestWake() {
    try { if ("wakeLock" in navigator && (!cook.wake || cook.wake.released)) cook.wake = await navigator.wakeLock.request("screen"); } catch (_) {}
  }
  function renderCook() {
    if (!plan) return;
    const now = Date.now();
    $("[data-cook-clock]").textContent = new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
    const evs = plan.events;
    const dueIdx = evs.reduce((acc, e, i) => (at(e.start).getTime() <= now ? i : acc), -1);
    const pending = evs.filter((e, i) => i <= dueIdx && !state.done[e.id]);
    const nowEv = pending[0] || null;
    const nextEv = evs.find((e, i) => i > dueIdx) || null;
    const fill = (sel, ev, empty) => {
      const box = $(sel);
      box.className = "cook-card " + (ev ? "dish-c" + ev.color : "");
      box.querySelector(".cook-card-time").textContent = ev ? fmt(at(ev.start)) : "";
      box.querySelector(".cook-card-dish").textContent = ev ? ev.name : "";
      box.querySelector(".cook-card-text").textContent = ev ? ev.text : empty;
    };
    const firstAt = evs.length ? at(evs[0].start).getTime() : now;
    fill("[data-cook-now]", nowEv, now < firstAt ? "Nothing yet. First step at " + fmt(new Date(firstAt)) + (plan.ahead.length ? ". Knock out the Do earlier list now." : ".") : at(0).getTime() <= now ? "Time to eat." : "All caught up. Wait for the next step.");
    const nb = nextEv ? Math.max(0, Math.round((at(nextEv.start).getTime() - now) / 60000)) : 0;
    fill("[data-cook-next]", nextEv, "That's everything. Plate up.");
    $("[data-cook-in]").textContent = nextEv ? (nb ? "in " + nb + " min" : "now") : "";
    $("[data-action='cook-done']").disabled = !nowEv;
    const doneCount = evs.filter((e) => state.done[e.id]).length;
    const prog = $("[data-cook-progress]");
    prog.max = evs.length; prog.value = doneCount;
    $("[data-cook-progress-label]").textContent = doneCount + " of " + evs.length + " steps done · eat at " + fmt(at(0));
    evs.forEach((e, i) => {
      if (i <= dueIdx && !cook.alerted[e.id] && !state.done[e.id]) {
        cook.alerted[e.id] = true;
        if (now - at(e.start).getTime() < 90000) { notify(e); say("Now: " + e.name + ". " + e.label); }
      }
    });
  }
  function enterCook() {
    if (!plan || !plan.events.length) return;
    cook.on = true;
    const now = Date.now();
    plan.events.forEach((e) => { if (at(e.start).getTime() < now - 90000) cook.alerted[e.id] = true; });
    document.body.classList.add("meal-cooking");
    cookPanel.hidden = false;
    renderCook();
    cook.tick = window.setInterval(renderCook, 1000);
    requestWake();
    try { cook.audio = cook.audio || new (window.AudioContext || window.webkitAudioContext)(); cook.audio.resume(); } catch (_) {}
    const btn = $("[data-action='cook-done']"); if (btn) btn.focus();
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function exitCook() {
    cook.on = false;
    window.clearInterval(cook.tick);
    document.body.classList.remove("meal-cooking");
    cookPanel.hidden = true;
    if (cook.wake) { cook.wake.release().catch(() => {}); cook.wake = null; }
    $("[data-action='meal-cook']").focus();
  }
  $("[data-action='meal-cook']").addEventListener("click", enterCook);
  $("[data-action='cook-exit']").addEventListener("click", exitCook);
  $("[data-action='cook-done']").addEventListener("click", () => {
    if (!plan) return;
    const now = Date.now();
    const ev = plan.events.find((e) => at(e.start).getTime() <= now && !state.done[e.id]);
    if (ev) { state.done[ev.id] = true; saveState(); say("Done: " + ev.label); renderCook(); }
  });
  const soundBox = $("[data-cook-sound]");
  soundBox.addEventListener("change", () => { cook.sound = soundBox.checked; if (cook.sound) chime(); });
  const notifBtn = $("[data-action='cook-notify']");
  const syncNotif = () => {
    if (!("Notification" in window)) { notifBtn.hidden = true; return; }
    notifBtn.textContent = Notification.permission === "granted" ? "Notifications on" : Notification.permission === "denied" ? "Notifications blocked" : "Turn on notifications";
    notifBtn.disabled = Notification.permission !== "default";
  };
  notifBtn.addEventListener("click", async () => { try { await Notification.requestPermission(); } catch (_) {} syncNotif(); });
  syncNotif();
  document.addEventListener("visibilitychange", () => { if (cook.on && document.visibilityState === "visible") { requestWake(); renderCook(); } });
  document.addEventListener("keydown", (e) => { if (cook.on && e.key === "Escape") exitCook(); });

  // --- boot ---
  (async function boot() {
    const fromUrl = readUrl();
    const saved = store.get(PLAN_KEY);
    const tray = store.get(MEAL_KEY);
    if (fromUrl) state = Object.assign(state, fromUrl);
    else if (saved && Array.isArray(saved.slugs)) state = Object.assign(state, saved, { slugs: Array.isArray(tray) ? tray.slice(0, MAX_DISHES) : saved.slugs });
    else if (Array.isArray(tray)) state.slugs = tray.slice(0, MAX_DISHES);
    state.overrides = state.overrides || {}; state.offsets = state.offsets || {}; state.done = state.done || {};
    if (!saved && !fromUrl) state.eat = "18:30";
    eatInput.value = state.eat.length === 4 ? "0" + state.eat : state.eat;
    saveState();
    await loadCatalog();
    rebuild();
  })();
})(this);
