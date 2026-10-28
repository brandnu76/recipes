/* Carroll Lowcountry Table — Plan a Meal.
   Works backward from the time you want to eat so every dish lands together.
   The shopping list combines ingredient lines from each dish's schema.org
   recipeIngredient (scaled when a dish's servings differ from its base yield).
   Everything stays on this device (localStorage). No accounts, no server. */
(function (root) {
  "use strict";

  // ---------- pure planning logic (also used by the node test) ----------
  // Steps up to 3 hours always count. Longer ones (slow cooker, smoker,
  // braise) count up to 14 hours, but only when the sentence reads like
  // cooking, not chilling, marinating, proofing, or storage notes.
  const MAX_TIMER_MS = 3 * 60 * 60 * 1000;
  const MAX_LONG_MS = 14 * 60 * 60 * 1000;
  const LONG_COOK_RE = /\b(cook|cooking|slow[- ]?cook|crock|on (?:low|high)|smok|braise|braising|simmer|roast|bake|oven|pit|start to pull|low and slow)/i;
  const LONG_BLOCK_RE = /\b(refrigerat|fridge|chill|marinat|brine|overnight|up to|keeps?|store|freez|ferment|proof|rise|soak|feed|before you|ahead|rest|thaw|cure|days?)\b/i;
  function sentenceAround(text, i) {
    const a = text.lastIndexOf(".", i - 1) + 1;
    let b = text.indexOf(".", i);
    if (b === -1) b = text.length;
    return text.slice(a, b);
  }
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
      if (ms > MAX_LONG_MS) continue;
      if (ms > MAX_TIMER_MS) {
        const sent = sentenceAround(text, m.index);
        if (LONG_BLOCK_RE.test(sent) || !LONG_COOK_RE.test(sent)) continue;
      }
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
    const slow = /\bslow[- ]?cooker\b|\bcrock[- ]?pot\b|\bcrockpot\b/.test(t);
    const t2 = t.replace(/dutch oven/g, "pot").replace(/\bslow[- ]?cooker\b|\bcrock[- ]?pot\b|\bcrockpot\b/g, "slowcooker");
    if (slow) eq.add("slowcooker");
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
    // Never cut step text: long instructions wrap instead (max is ignored).
    return s;
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
    let usesSlow = false;
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
        equip: (function () {
          const e = equipmentOf(remaining || text);
          if (e.has("slowcooker")) usesSlow = true;
          // "Cover and cook on low 7 hours" after "put it in the slow cooker".
          else if (usesSlow && /\bon (low|high)\b/i.test(remaining || text) && !e.has("oven") && !e.has("grill")) { e.delete("stove"); e.add("slowcooker"); }
          return Array.from(e);
        })(),
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
      if (/(?<!the )\b(rest|let (it |them )?(rest|stand|sit|cool))\b(?! of)/i.test(remaining) || /^\s*cool\b|\bcool (for )?\d/i.test(remaining)) step.kind = "rest";
      const heat = step.equip.length > 0;
      step.active = !(PASSIVE_RE.test(remaining) && (step.minutes || 0) >= 8) || step.kind === "preheat-only";
      if (!heat && !seenHeat && MAKE_AHEAD_RE.test(remaining) && !LAST_MINUTE_RE.test(remaining) && !NOT_AHEAD_RE.test(remaining)) step.makeAhead = true;
      if (!heat && SAUCE_AHEAD_RE.test(remaining) && !LAST_MINUTE_RE.test(remaining) && !NOT_AHEAD_RE.test(remaining)) step.makeAhead = true;
      if (!heat && /\b(marinat|dry[- ]brine|brine)\w*/i.test(remaining) && !LAST_MINUTE_RE.test(remaining)) step.makeAhead = true;
      // A cooked component the recipe says keeps ("make them up to a day
      // ahead", "store airtight") can be done before the main timeline.
      if (heat && idx < raw.length - 1 && /\b(make (it |them )?(up to [^.]*)?ahead|a day ahead|up to \d+ days|store (it |them )?airtight)\b/i.test(remaining) && !LAST_MINUTE_RE.test(remaining)) step.makeAhead = true;
      if (heat && !step.makeAhead) seenHeat = true;
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
  const DEFAULT_KITCHEN = { burners: 4, ovens: 1, slowCookers: 1, airFryer: false, grill: "pellet", grillPreheat: 15, ovenPreheat: 15, boil: 15 };
  function kitchenOf(k) {
    const o = Object.assign({}, DEFAULT_KITCHEN, k || {});
    o.burners = Math.max(1, Math.min(8, +o.burners || 4));
    o.ovens = +o.ovens === 2 ? 2 : 1;
    o.slowCookers = o.slowCookers === "" || o.slowCookers == null || !isFinite(+o.slowCookers) ? 1 : Math.max(0, Math.min(4, Math.round(+o.slowCookers)));
    o.airFryer = !!o.airFryer;
    o.grill = ["none", "pellet", "gas", "charcoal"].indexOf(o.grill) !== -1 ? o.grill : "pellet";
    ["grillPreheat", "ovenPreheat", "boil"].forEach((f) => { o[f] = Math.max(0, Math.min(90, Math.round(+o[f]))); if (!isFinite(o[f])) o[f] = 15; });
    return o;
  }
  // Rests, cools, and holds can shrink to half (never below 3 min).
  function compressibleOf(e) {
    const base = e.baseMinutes || e.minutes;
    if (e.background || e.kind !== "rest" || base <= 3) return 0;
    return Math.max(0, e.minutes - Math.max(3, Math.ceil(base * 0.5)));
  }

  function scheduleDish(dish, overrides, offset, kitchen) {
    const kit = kitchenOf(kitchen);
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
          kind: s.kind, label: s.label, text: s.label.length < s.text.length && s.label.slice(-1) !== "…" ? s.label : s.text, start: p.start, end: p.end, minutes: p.minutes, baseMinutes: s.minutes,
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
        const kitMins = b.kind === "boil" ? kit.boil : b.equip === "grill" ? kit.grillPreheat : b.equip === "oven" ? kit.ovenPreheat : b.minutes;
        const mins = overrides && overrides[keyB] != null ? Math.max(0, +overrides[keyB]) : kitMins;
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
      label: s.background.length ? shortText(s.text) : s.label, text: s.text, minutes: overrides && overrides[dish.slug + ":" + s.idx] != null ? +overrides[dish.slug + ":" + s.idx] : s.minutes,
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

  const GRILL_RANGE = { pellet: [180, 500], gas: [250, 550], charcoal: [225, 450] };
  function findConflicts(events, kitchen) {
    const kit = kitchenOf(kitchen);
    const out = [];
    const seen = new Set();
    const uses = (e, k) => e.equip.indexOf(k) !== -1 && e.minutes > 0;
    // Ovens: at each moment, count distinct temperatures vs ovens on hand,
    // then try the air fryer oven or the grill (as an outdoor oven).
    const ovenEv = events.filter((e) => uses(e, "oven") && e.temp);
    const ovenPoints = Array.from(new Set(ovenEv.map((e) => e.start))).sort((x, y) => x - y);
    ovenPoints.forEach((p) => {
      const live = ovenEv.filter((e) => e.start <= p && e.end > p);
      const byDish = {};
      live.forEach((e) => { if (!byDish[e.dish] || !e.background) byDish[e.dish] = e; });
      const list = Object.keys(byDish).map((k) => byDish[k]).sort((x, y) => x.start - y.start);
      const temps = [];
      list.forEach((e) => { if (!temps.some((t) => Math.abs(t - e.temp) <= 10)) temps.push(e.temp); });
      if (temps.length <= kit.ovens) return;
      const key = "oven|" + list.map((e) => e.dish).sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);
      // Dishes beyond the main oven(s), latest starters first get moved.
      const ovenTemps = temps.slice(0, kit.ovens);
      const extra = list.filter((e) => !ovenTemps.some((t) => Math.abs(t - e.temp) <= 10));
      const grillBusy = events.some((g) => uses(g, "grill") && g.start <= p && g.end > p);
      const spare = [];
      if (kit.airFryer) spare.push({ name: "air fryer oven", max: 450, min: 150 });
      if (kit.grill !== "none" && !grillBusy) spare.push({ name: kit.grill + " grill", min: GRILL_RANGE[kit.grill][0], max: GRILL_RANGE[kit.grill][1] });
      const moves = [];
      let stuck = null;
      const doneTemps = [];
      extra.forEach((e) => {
        if (doneTemps.some((t) => Math.abs(t - e.temp) <= 10)) return;
        const i = spare.findIndex((sp) => e.temp >= sp.min && e.temp <= sp.max);
        if (i === -1) { stuck = stuck || e; return; }
        moves.push(e.name + " → " + spare[i].name + " at " + e.temp + "°F" + (/air fryer/.test(spare[i].name) ? " (small batches)" : ""));
        doneTemps.push(e.temp);
        spare.splice(i, 1);
      });
      const ovensTxt = kit.ovens === 2 ? "both ovens" : "the oven";
      if (!stuck) {
        out.push({ type: "oven-move", severity: "info", message: "Around {t} " + ovensTxt + " can't hold every temperature (" + temps.map((t) => t + "°F").join(", ") + "). Plan: " + moves.join("; ") + ".", at: p, events: live.map((e) => e.id) });
      } else {
        const other = list.find((e) => e.dish !== stuck.dish && ovenTemps.some((t) => Math.abs(t - e.temp) <= 10)) || list[0];
        const f = bestShift(events, stuck, other, ["oven", "broiler"]);
        out.push({ type: "oven", severity: "conflict", message: "Oven clash around {t}: " + list.map((e) => e.name + " " + e.temp + "°F").join(", ") + " and you have " + (kit.ovens === 2 ? "2 ovens" : "1 oven") + (moves.length ? " (" + moves.join("; ") + ")" : "") + ". Finish " + f.name + " " + f.by + " min early and hold it covered, or add an air fryer / grill in My kitchen.", at: p, shiftDish: f.dish, shiftBy: f.by, events: live.map((e) => e.id) });
      }
    });
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
        if (uses(a, "broiler") && uses(b, "broiler")) {
          push("broiler", "conflict", "Both " + a.name + " and " + b.name + " need the broiler around {t}. Broil " + earlier.name + " first.", earlier.dish, Math.ceil(ov));
        }
        if (uses(a, "grill") && uses(b, "grill") && a.temp && b.temp && Math.abs(a.temp - b.temp) > 25) {
          const f = bestShift(events, a, b, ["grill"]);
          push("grill", "conflict", "Grill clash around {t}: " + a.name + " at " + a.temp + "°F vs " + b.name + " at " + b.temp + "°F. Finish " + f.name + " " + f.by + " min early, or cook one on the stovetop or in the oven.", f.dish, f.by);
        }
        if (kit.ovens < 2 && (uses(a, "broiler") && uses(b, "oven") || uses(b, "broiler") && uses(a, "oven"))) {
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
      if (live.length > kit.burners) {
        out.push({ type: "burners", severity: "conflict", message: live.length + " burners at once around {t}, and your range has " + kit.burners + ". Move one stovetop job earlier and hold it warm.", at: p, shiftDish: live[0].dish, shiftBy: 5, events: live.map((e) => e.id) });
        break;
      }
    }
    // Slow cookers are their own appliance (not a burner or the oven).
    const slowEv = events.filter((e) => uses(e, "slowcooker"));
    const slowPts = Array.from(new Set(slowEv.map((e) => e.start))).sort((x, y) => x - y);
    for (const p of slowPts) {
      const live = slowEv.filter((e) => e.start <= p && e.end > p);
      const dishesLive = Array.from(new Set(live.map((e) => e.dish)));
      if (dishesLive.length > kit.slowCookers) {
        out.push({ type: "slowcooker", severity: kit.slowCookers ? "conflict" : "warning", message: kit.slowCookers ? dishesLive.length + " dishes need a slow cooker around {t}, and My kitchen says you have " + kit.slowCookers + ". Use a Dutch oven on low in a 275°F oven for one, or add a slow cooker in My kitchen." : "A dish needs a slow cooker, and My kitchen says you don't have one. A covered Dutch oven at 275°F works for most braises.", at: p, events: live.map((e) => e.id) });
        break;
      }
    }
    return out.sort((x, y) => x.at - y.at);
  }

  function planMeal(dishes, opts) {
    const o = opts || {};
    let events = [], ahead = [];
    dishes.forEach((d) => {
      const r = scheduleDish(d, o.overrides || {}, (o.offsets || {})[d.slug] || 0, o.kitchen);
      events = events.concat(r.events);
      ahead = ahead.concat(r.ahead);
    });
    events.sort((a, b) => a.start - b.start || Number(!!b.background) - Number(!!a.background) || a.dish.localeCompare(b.dish) || a.idx - b.idx || a.id.localeCompare(b.id));
    const kit = kitchenOf(o.kitchen);
    if (kit.grill === "none" && events.some((e) => e.equip.indexOf("grill") !== -1)) {
      var noGrill = true;
    }
    const conflicts = findConflicts(events, kit);
    if (noGrill) conflicts.unshift({ type: "no-grill", severity: "warning", message: "A dish needs a grill or smoker, and My kitchen says you don't have one. Use the oven method in that recipe if it has one.", at: events[0].start, events: [] });
    // Slack: how long a step can slip before dinner moves (finish-early hold
    // plus any rest that can shrink later in the same dish).
    const done = o.done || {};
    events.forEach((e) => {
      const later = events.filter((x) => x.dish === e.dish && !x.background && x.start >= e.end && !done[x.id]);
      e.compressible = compressibleOf(e);
      e.slack = ((o.offsets || {})[e.dish] || 0) + later.reduce((a, x) => a + compressibleOf(x), 0);
    });
    const first = events.length ? events[0].start : 0;
    // Do-earlier work should be finished before the first timed step.
    let cursor = first;
    for (let i = ahead.length - 1; i >= 0; i -= 1) { ahead[i].by = first; cursor -= ahead[i].minutes || 0; }
    return { events: events, ahead: ahead, conflicts: conflicts, start: first, aheadStart: cursor };
  }

  // Re-time mid-cook. delay > 0 = behind, < 0 = ahead. nowRel = minutes from
  // eat time to now (negative before dinner). mode "push" moves dinner;
  // "keep" absorbs the delay in holds and rests first, then moves dinner by
  // whatever is left. Returns new overrides/offsets and the eat-time shift.
  function retime(dishes, opts, delay, mode, nowRel) {
    const o = opts || {};
    const overrides = Object.assign({}, o.overrides || {});
    const offsets = Object.assign({}, o.offsets || {});
    const done = o.done || {};
    const d = Math.round(delay);
    if (!d) return { overrides: overrides, offsets: offsets, shift: 0, absorbed: {}, stuck: [] };
    if (mode === "push" || d < 0) return { overrides: overrides, offsets: offsets, shift: d, absorbed: {}, stuck: [] };
    const plan = planMeal(dishes, o);
    const remaining = plan.events.filter((e) => !done[e.id] && e.end > nowRel && !e.background);
    // A dish is only late if it is under way, or its next step would now
    // start after the time it was due.
    const cap = {}, late = {};
    dishes.forEach((di) => {
      const rest = remaining.filter((e) => e.dish === di.slug);
      if (!rest.length) { late[di.slug] = 0; cap[di.slug] = 0; return; }
      const next = rest[0];
      late[di.slug] = next.start <= nowRel ? d : Math.max(0, nowRel + d - next.start);
      cap[di.slug] = (offsets[di.slug] || 0) + rest.reduce((a, e) => a + compressibleOf(e), 0);
    });
    const live = dishes.filter((di) => late[di.slug] > 0);
    const shift = live.reduce((m, di) => Math.max(m, late[di.slug] - cap[di.slug]), 0);
    const absorbed = {}, stuck = [];
    live.forEach((di) => {
      const need = Math.max(0, late[di.slug] - shift);
      let left = need;
      const take = Math.min(left, offsets[di.slug] || 0);
      if (take) { offsets[di.slug] = (offsets[di.slug] || 0) - take; left -= take; }
      remaining.filter((e) => e.dish === di.slug).reverse().forEach((e) => {
        if (left <= 0) return;
        const c = Math.min(left, compressibleOf(e));
        if (c > 0) { overrides[e.id] = e.minutes - c; left -= c; }
      });
      absorbed[di.slug] = need;
      if (cap[di.slug] < late[di.slug]) stuck.push(di.slug);
    });
    return { overrides: overrides, offsets: offsets, shift: shift, absorbed: absorbed, stuck: stuck };
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

  // ---------- shopping list (pure; UI below) ----------
  // Scaling matches the recipe page: leading amounts, plus one "plus 1 teaspoon"
  // style second amount. Parenthetical conversions are left alone. Merging only
  // sums lines that parse to the same food and the same unit. Anything unsure
  // (ranges, "or", "to taste", odd parentheticals, pinches) stays its own line.
  const SHOP_FRAC = {
    "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3,
    "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
    "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 1 / 6, "⅚": 5 / 6,
  };
  const SHOP_FRAC_CHARS = "¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚";

  function formatShopQty(n) {
    if (!isFinite(n) || n <= 0) return "";
    const nearest = Math.round(n);
    if (Math.abs(n - nearest) < 0.02) n = nearest;
    const whole = Math.floor(n + 1e-9);
    const frac = n - whole;
    if (frac < 0.008) return String(whole);
    const glyphs = {
      "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾",
      "1/5": "⅕", "2/5": "⅖", "3/5": "⅗", "4/5": "⅘",
      "1/6": "⅙", "5/6": "⅚", "1/8": "⅛", "3/8": "⅜", "5/8": "⅝", "7/8": "⅞",
    };
    let best = null;
    let bestDiff = 0.008;
    [2, 3, 4, 5, 6, 8, 12].forEach((d) => {
      const k = Math.round(frac * d);
      if (k <= 0 || k >= d) return;
      const diff = Math.abs(frac - k / d);
      if (diff < bestDiff) { bestDiff = diff; best = k + "/" + d; }
    });
    if (!best) {
      // Nearest eighth keeps a scaled 11/9 cup shoppable ("1¼") instead of "1.22".
      let eighths = Math.round(frac * 8);
      if (eighths >= 8) return String(whole + 1);
      if (eighths <= 0) return whole ? String(whole) : "⅛";
      const reduced = { 1: "1/8", 2: "1/4", 3: "3/8", 4: "1/2", 5: "5/8", 6: "3/4", 7: "7/8" }[eighths];
      best = reduced;
    }
    const g = glyphs[best] || best;
    if (whole === 0) return g;
    return glyphs[best] ? whole + g : whole + " " + best;
  }

  function readShopQtyAt(text, i) {
    const s = text.slice(i);
    let m = s.match(new RegExp("^(\\d+)([" + SHOP_FRAC_CHARS + "])"));
    if (m) return { n: +m[1] + SHOP_FRAC[m[2]], end: i + m[0].length };
    m = s.match(/^(\d+)\s+(\d+)\/(\d+)/);
    if (m && +m[3]) return { n: +m[1] + +m[2] / +m[3], end: i + m[0].length };
    m = s.match(new RegExp("^(\\d+)\\s+([" + SHOP_FRAC_CHARS + "])"));
    if (m) return { n: +m[1] + SHOP_FRAC[m[2]], end: i + m[0].length };
    m = s.match(new RegExp("^([" + SHOP_FRAC_CHARS + "])"));
    if (m) return { n: SHOP_FRAC[m[1]], end: i + m[0].length };
    m = s.match(/^(\d+)\/(\d+)/);
    if (m && +m[2]) return { n: +m[1] / +m[2], end: i + m[0].length };
    m = s.match(/^(\d+(?:\.\d+)?)/);
    if (m) return { n: parseFloat(m[1]), end: i + m[0].length };
    return null;
  }

  function readLeadingShopQty(text) {
    const pad = /^(\s*)/.exec(text);
    const start = pad[1].length;
    const first = readShopQtyAt(text, start);
    if (!first) return null;
    const sep = /^\s*(?:-|–|to)\s*/i.exec(text.slice(first.end));
    if (sep) {
      const second = readShopQtyAt(text, first.end + sep[0].length);
      if (second) return { start: start, end: second.end, n: first.n, n2: second.n, range: true, sep: sep[0] };
    }
    return { start: start, end: first.end, n: first.n, range: false };
  }

  const SHOP_UNIT_WORDS = [
    ["tablespoons", "tbsp"], ["tablespoon", "tbsp"], ["teaspoons", "tsp"], ["teaspoon", "tsp"],
    ["tbsp", "tbsp"], ["tbs", "tbsp"], ["tbl", "tbsp"], ["tsp", "tsp"],
    ["cups", "cup"], ["cup", "cup"],
    ["ounces", "oz"], ["ounce", "oz"], ["pounds", "lb"], ["pound", "lb"], ["lbs", "lb"], ["lb", "lb"],
    ["grams", "g"], ["gram", "g"], ["kilograms", "kg"], ["kilogram", "kg"],
    ["milliliters", "ml"], ["milliliter", "ml"], ["liters", "l"], ["liter", "l"], ["litres", "l"], ["litre", "l"],
    ["quarts", "qt"], ["quart", "qt"], ["pints", "pt"], ["pint", "pt"], ["gallons", "gal"], ["gallon", "gal"],
    ["cloves", "clove"], ["clove", "clove"], ["slices", "slice"], ["slice", "slice"],
    ["cans", "can"], ["can", "can"], ["jars", "jar"], ["jar", "jar"],
    ["packages", "package"], ["package", "package"], ["pkg", "package"],
    ["bunches", "bunch"], ["bunch", "bunch"], ["heads", "head"], ["head", "head"],
    ["sprigs", "sprig"], ["sprig", "sprig"], ["stalks", "stalk"], ["stalk", "stalk"],
    ["sticks", "stick"], ["stick", "stick"], ["fillets", "fillet"], ["fillet", "fillet"],
    ["strips", "strip"], ["strip", "strip"], ["pieces", "piece"], ["piece", "piece"],
    ["scoops", "scoop"], ["scoop", "scoop"], ["packets", "packet"], ["packet", "packet"],
    ["envelopes", "envelope"], ["envelope", "envelope"], ["bags", "bag"], ["bag", "bag"],
    ["boxes", "box"], ["box", "box"], ["bottles", "bottle"], ["bottle", "bottle"],
    ["ears", "ear"], ["ear", "ear"], ["links", "link"], ["link", "link"],
    ["rashers", "rasher"], ["rasher", "rasher"],
    ["pinches", "pinch"], ["pinch", "pinch"], ["dashes", "dash"], ["dash", "dash"],
    ["handfuls", "handful"], ["handful", "handful"], ["splashes", "splash"], ["splash", "splash"],
    ["oz", "oz"], ["qt", "qt"], ["pt", "pt"], ["kg", "kg"], ["ml", "ml"], ["gal", "gal"], ["g", "g"], ["l", "l"],
  ];

  function matchShopUnit(s) {
    const fluid = /^(fl\.?\s*oz|fluid ounces?)\b\s*(?:of\s+)?(.*)$/i.exec(s);
    if (fluid) return { unit: "fl-oz", rest: fluid[2], word: fluid[1] };
    for (let i = 0; i < SHOP_UNIT_WORDS.length; i += 1) {
      const word = SHOP_UNIT_WORDS[i][0];
      const re = new RegExp("^(" + word + ")\\.?\\b(?:\\s+of)?\\s*(.*)$", "i");
      const m = re.exec(s);
      if (m) return { unit: SHOP_UNIT_WORDS[i][1], rest: m[2], word: m[1] };
    }
    return null;
  }

  const SHOP_ABBREV = { tsp: 1, tbsp: 1, tbs: 1, tbl: 1, oz: 1, lb: 1, lbs: 1, g: 1, kg: 1, ml: 1, qt: 1, pt: 1 };

  function shopUnitWord(unit, qty, originalWord) {
    const w = String(originalWord || "").toLowerCase().replace(/\.$/, "");
    if (SHOP_ABBREV[w]) {
      if ((w === "lb" || w === "lbs") && qty > 1) return "lbs";
      if ((w === "lb" || w === "lbs") && qty <= 1) return "lb";
      return w;
    }
    if (/^fl/i.test(w) && unit === "fl-oz") return qty > 1 ? "fl oz" : "fl oz";
    return shopUnitPhrase(unit, qty);
  }

  function rewriteShopUnit(after, qty) {
    const leadSpace = (/^(\s*)/.exec(after) || ["", ""])[1];
    const body = after.slice(leadSpace.length);
    const um = matchShopUnit(body);
    if (!um) return after;
    const word = shopUnitWord(um.unit, qty, um.word);
    const consumed = body.slice(0, body.length - um.rest.length);
    const ofWord = /\bof\b/i.test(consumed) ? " of " : " ";
    return leadSpace + word + (um.rest ? ofWord + um.rest : "");
  }

  function scaleShopPlus(rest, factor) {
    let depth = 0;
    for (let i = 0; i < rest.length; i += 1) {
      const ch = rest[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      if (depth) continue;
      if (i > 0 && /[A-Za-z]/.test(rest[i - 1])) continue;
      const m = /^(?:plus|\+)\s+/i.exec(rest.slice(i));
      if (!m) continue;
      const q = readShopQtyAt(rest, i + m[0].length);
      if (!q) return rest;
      const after = rest.slice(q.end);
      if (!matchShopUnit(after.replace(/^\s+/, ""))) return rest;
      return rest.slice(0, i + m[0].length) + formatShopQty(q.n * factor) + rewriteShopUnit(after, q.n * factor);
    }
    return rest;
  }

  function scaleShopText(text, factor) {
    const raw = String(text || "");
    if (!(factor > 0) || Math.abs(factor - 1) < 1e-9) return raw;
    const lead = readLeadingShopQty(raw);
    if (!lead) return raw;
    const qtyForUnit = (lead.range ? Math.max(lead.n, lead.n2) : lead.n) * factor;
    const scaled = lead.range
      ? formatShopQty(lead.n * factor) + lead.sep + formatShopQty(lead.n2 * factor)
      : formatShopQty(lead.n * factor);
    const rest = scaleShopPlus(rewriteShopUnit(raw.slice(lead.end), qtyForUnit), factor);
    return stripStaleMeasures(raw.slice(0, lead.start) + scaled + rest);
  }

  // Equivalent weights in parentheses go stale once the leading amount changes.
  function stripStaleMeasures(text) {
    let s = String(text).replace(/\s*\(([^)]*)\)/g, (full, inner) => shopMeasureNote(inner) ? "" : full);
    s = s.replace(/,\s*about\s+[\d./\s¼½¾⅓⅔⅛⅜⅝⅞-]+(?:fl\.?\s*oz|cups?|tablespoons?|teaspoons?|tbsp|tsp|ounces?|oz|pounds?|lbs?|grams?|g|kg|ml)\b[^,]*/gi, "");
    return s.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").replace(/,\s*$/g, "").trim();
  }

  const SHOP_NO_SINGULAR = new Set("asparagus molasses hummus couscous oats grits bitters greens series species lens citrus news shorts".split(" "));
  function singularShopWord(w) {
    if (SHOP_NO_SINGULAR.has(w)) return w;
    if (w === "leaves") return "leaf";
    if (w === "loaves") return "loaf";
    if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 4 && /(oes|ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /[^s]s$/.test(w) && !w.endsWith("ss")) return w.slice(0, -1);
    return w;
  }
  function pluralShopWord(w) {
    const l = w.toLowerCase();
    if (SHOP_NO_SINGULAR.has(l)) return w;
    if (l === "leaf") return "leaves";
    if (l === "loaf") return "loaves";
    if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + "ies";
    if (/^(potato|tomato)$/i.test(w)) return w + "es";
    if (/(s|x|z|ch|sh)$/i.test(w)) return w + "es";
    return w + "s";
  }

  const SHOP_PREP_SEG = /^(divided|diced|minced|chopped|grated|shredded|sliced|peeled|deveined|halved|quartered|trimmed|rinsed|drained|beaten|cubed|crushed|toasted|packed|melted|softened|zested|juiced|washed|torn|mashed|cooled|thawed|seeded|stemmed|cored|optional|plus\b|for\b|cut\b|thinly|roughly|finely|freshly|at room|room temperature|to serve|to taste|into\b|about\b|preferably|preferred|if\b|patted|spun|scrubbed|separated|warmed|chilled|crumbled|and sliced|and minced|and deveined|and peeled|and halved|sliced into|cut into|plus more|or more|for serving|for the|to reduce|warm|ground)\b/i;

  function cleanShopName(rest) {
    const stripped = String(rest || "").replace(/\([^)]*\)/g, " ");
    const parts = stripped.split(",");
    const kept = [];
    for (let i = 0; i < parts.length; i += 1) {
      const t = parts[i].trim();
      if (!t) continue;
      if (i > 0 && SHOP_PREP_SEG.test(t)) continue;
      kept.push(t);
    }
    return kept.join(" ").replace(/\s+/g, " ").trim();
  }

  function shopNameKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/-/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map(singularShopWord)
      .join(" ");
  }

  function isPantryStaple(nameKey) {
    const n = String(nameKey || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!n) return false;
    if (/^(flaky |kosher |sea |table |fine |coarse |maldon |iodized )?(salt)$/.test(n)) return true;
    if (/^(freshly ground |ground |cracked |fresh ground )?(black )?pepper$/.test(n)) return true;
    if (/^(kosher |sea |table |fine |flaky )?salt and (freshly ground |ground |cracked )?(black )?pepper$/.test(n)) return true;
    if (/^(cold |warm |hot |boiling |ice |cool |filtered |tap |lukewarm |room temperature )?water$/.test(n)) return true;
    if (/^(extra virgin |virgin )?olive oil$/.test(n)) return true;
    if (/^(vegetable|canola|avocado|neutral|cooking|salad|grapeseed|sunflower|peanut) oil$/.test(n)) return true;
    if (/^oil$/.test(n)) return true;
    if (/^(avocado oil|cooking|nonstick|non stick|baking) spray$/.test(n)) return true;
    return false;
  }

  function shopMeasureNote(inner) {
    const s = String(inner || "").trim().toLowerCase().replace(/[–—]/g, "-");
    if (!/\d|[¼½¾⅓⅔⅛⅜⅝⅞]/.test(s)) return false;
    if (/\binch/.test(s)) return false;
    const words = s.replace(/[^a-z0-9.\s/-]/g, " ").split(/\s+/).filter(Boolean);
    const ok = /^(about|approx|approximately|roughly|each|or|to|and|a|of|cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|ml|l|liter|liters|fl|stick|sticks|mashed|chopped|diced|grated|sliced|halved|minced|packed|softened|melted|divided)$/;
    return words.length > 0 && words.every((w) => ok.test(w) || /^[\d./-]+$/.test(w));
  }

  const SHOP_OPEN_RE = /\b(to taste|as needed|plus more|or more|or so|for serving|for the pan|for greasing|for frying|for drizzling|for brushing|for dusting|for finishing|for the top|for the grill|for soaking|if needed|optional|to serve)\b/i;
  const SHOP_VAGUE_UNITS = { pinch: 1, dash: 1, splash: 1, handful: 1 };
  const SHOP_UNIT_PHRASE = {
    cup: ["cup", "cups"], tbsp: ["tablespoon", "tablespoons"], tsp: ["teaspoon", "teaspoons"],
    oz: ["ounce", "ounces"], lb: ["pound", "pounds"], g: ["gram", "grams"], kg: ["kilogram", "kilograms"],
    ml: ["milliliter", "milliliters"], l: ["liter", "liters"], "fl-oz": ["fluid ounce", "fluid ounces"],
    qt: ["quart", "quarts"], pt: ["pint", "pints"], gal: ["gallon", "gallons"],
    clove: ["clove", "cloves"], slice: ["slice", "slices"], can: ["can", "cans"], jar: ["jar", "jars"],
    package: ["package", "packages"], bunch: ["bunch", "bunches"], head: ["head", "heads"],
    sprig: ["sprig", "sprigs"], stalk: ["stalk", "stalks"], stick: ["stick", "sticks"],
    fillet: ["fillet", "fillets"], strip: ["strip", "strips"], piece: ["piece", "pieces"],
    scoop: ["scoop", "scoops"], packet: ["packet", "packets"], envelope: ["envelope", "envelopes"],
    bag: ["bag", "bags"], box: ["box", "boxes"], bottle: ["bottle", "bottles"],
    ear: ["ear", "ears"], link: ["link", "links"], rasher: ["rasher", "rashers"],
  };

  function shopUnitPhrase(unit, qty) {
    const pair = SHOP_UNIT_PHRASE[unit];
    if (!pair) return unit || "";
    return qty > 1 ? pair[1] : pair[0];
  }

  function applyShopName(base, rest) {
    const cleaned = cleanShopName(rest);
    base.nameDisplay = cleaned || String(rest || "").replace(/\s+/g, " ").trim();
    base.nameKey = shopNameKey(base.nameDisplay);
  }

  function hoistGarlicClove(name) {
    const m = /^(.*)\s+cloves?$/i.exec(name);
    if (!m) return null;
    const food = m[1].trim();
    if (!food || /\d/.test(food)) return null;
    return food;
  }

  function parseShopLine(display) {
    const text = String(display || "").trim();
    const base = {
      qty: null, unit: null, nameKey: "", nameDisplay: text, qualKey: "", qualDisplay: "",
      pantry: false, summable: false, optional: /\boptional\b/i.test(text), unitTail: false, ranged: false,
    };
    const parens = [];
    const parenRe = /\(([^)]*)\)/g;
    let pm;
    while ((pm = parenRe.exec(text))) parens.push(pm[1]);
    const significant = parens.some((p) => !shopMeasureNote(p));
    const outside = text.replace(/\([^)]*\)/g, " ");
    const open = SHOP_OPEN_RE.test(text);
    const compound = /\b(?:plus|\+)\s+\d/i.test(outside);
    const orAlt = /\bor\b/i.test(outside);
    const finish = () => {
      base.pantry = isPantryStaple(base.nameKey);
      return base;
    };

    const vague = /^(a\s+)?(pinch|pinches|dash|dashes|splash|splashes)(?:\s+of)?\s+(.+)$/i.exec(text);
    if (vague && !/^[\d¼½¾⅓⅔⅛⅜⅝⅞]/.test(text)) {
      applyShopName(base, vague[3]);
      base.unit = vague[2].toLowerCase().replace(/es$/, "").replace(/s$/, "");
      base.summable = false;
      return finish();
    }

    const lead = readLeadingShopQty(text);
    if (lead && !lead.range) {
      const afterQty = text.slice(lead.end).replace(/^\s+/, "");
      const can = /^\(([^)]+)\)\s*(cans?|jars?|bottles?|packages?|pkgs?|bags?|boxes|box)\b(?:\s+of\b)?\s*(.*)$/i.exec(afterQty);
      if (can) {
        const canon = matchShopUnit(can[2]);
        applyShopName(base, can[3]);
        base.qty = lead.n;
        base.unit = canon ? canon.unit : "can";
        base.qualDisplay = can[1].trim();
        base.qualKey = base.qualDisplay.toLowerCase().replace(/\s+/g, " ");
        base.summable = !open && !compound && !orAlt && !significant && !!base.nameKey && base.qty > 0;
        return finish();
      }
      const unit = matchShopUnit(afterQty);
      if (unit) {
        applyShopName(base, unit.rest);
        base.qty = lead.n;
        base.unit = unit.unit;
      } else {
        applyShopName(base, afterQty);
        const food = hoistGarlicClove(base.nameDisplay);
        if (food) {
          base.unit = "clove";
          base.unitTail = true;
          applyShopName(base, food);
        }
        base.qty = lead.n;
      }
      const vagueUnit = !!SHOP_VAGUE_UNITS[base.unit];
      base.summable = !open && !compound && !orAlt && !significant && !vagueUnit && base.qty > 0 && !!base.nameKey;
      return finish();
    }

    if (lead && lead.range) {
      const after = text.slice(lead.end).replace(/^\s+/, "");
      const unit = matchShopUnit(after);
      applyShopName(base, unit ? unit.rest : after);
      base.ranged = true;
      base.summable = false;
      return finish();
    }

    applyShopName(base, text);
    base.summable = false;
    return finish();
  }

  function roundShopQty(n) {
    const r = Math.round(n * 1000) / 1000;
    const nearest = Math.round(r);
    if (Math.abs(r - nearest) < 0.02) return nearest;
    return r;
  }

  function countShopName(nameDisplay, qty) {
    const parts = String(nameDisplay || "").split(" ");
    if (!parts.length || !parts[0]) return nameDisplay;
    const last = parts[parts.length - 1];
    const sing = singularShopWord(last.toLowerCase());
    const cased = last[0] === last[0].toUpperCase() ? sing.charAt(0).toUpperCase() + sing.slice(1) : sing;
    parts[parts.length - 1] = qty > 1 ? pluralShopWord(cased) : cased;
    return parts.join(" ");
  }

  function formatSummedShop(items, qty) {
    const sample = items[0];
    const q = roundShopQty(qty);
    const qText = formatShopQty(q);
    if (!sample.unit) return (qText + " " + countShopName(sample.nameDisplay, q)).replace(/\s+/g, " ").trim();
    const unit = shopUnitPhrase(sample.unit, q);
    const qual = sample.qualDisplay ? "(" + sample.qualDisplay + ") " : "";
    const tail = items.every((it) => it.unitTail);
    const body = tail ? sample.nameDisplay + " " + unit : unit + " " + sample.nameDisplay;
    return (qText + " " + qual + body).replace(/\s+/g, " ").trim();
  }

  function shopLineFrom(item) {
    return { ids: [item.id], text: item.display, sources: [item.dish], pantry: !!item.pantry };
  }

  function buildShoppingList(dishes, mode) {
    const items = [];
    (dishes || []).forEach((dish) => {
      const base = dish.baseYield > 0 ? dish.baseYield : 1;
      const servings = dish.servings > 0 ? dish.servings : base;
      const factor = servings / base;
      (dish.ingredients || []).forEach((line, index) => {
        const display = scaleShopText(line, factor);
        const item = parseShopLine(display);
        item.id = dish.slug + ":" + index;
        item.slug = dish.slug;
        item.dish = dish.name || dish.slug;
        item.color = dish.color;
        item.display = display;
        item.servings = servings;
        item.baseYield = base;
        items.push(item);
      });
    });
    if (mode === "merged") return mergeShopItems(items);
    return groupShopByDish(items);
  }

  function groupShopByDish(items) {
    const groups = [];
    const bySlug = new Map();
    const pantrySubs = [];
    const pantryBy = new Map();
    items.forEach((item) => {
      if (item.pantry) {
        if (!pantryBy.has(item.slug)) {
          const sub = { title: item.dish, slug: item.slug, color: item.color, lines: [] };
          pantryBy.set(item.slug, sub);
          pantrySubs.push(sub);
        }
        pantryBy.get(item.slug).lines.push(shopLineFrom(item));
        return;
      }
      if (!bySlug.has(item.slug)) {
        const g = {
          kind: "dish", title: item.dish, slug: item.slug, color: item.color,
          servings: item.servings, baseYield: item.baseYield, lines: [],
        };
        bySlug.set(item.slug, g);
        groups.push(g);
      }
      bySlug.get(item.slug).lines.push(shopLineFrom(item));
    });
    if (pantrySubs.length) groups.push({ kind: "pantry", title: "Probably on hand", lines: [], subgroups: pantrySubs });
    return { groups: groups };
  }

  function mergeShopItems(items) {
    const shop = [];
    const pantry = [];
    const index = new Map();
    items.forEach((item) => {
      let key;
      if (item.summable) {
        key = "sum\u0001" + (item.pantry ? "p" : "s") + "\u0001" + (item.unit || "count") + "\u0001" + item.nameKey + "\u0001" + (item.qualKey || "") + "\u0001" + (item.optional ? "1" : "0");
      } else if (item.qty == null && !item.ranged) {
        key = "plain\u0001" + (item.pantry ? "p" : "s") + "\u0001" + item.nameKey + "\u0001" + (item.optional ? "1" : "0");
      } else {
        key = "solo\u0001" + item.id;
      }
      let line = index.get(key);
      if (!line) {
        line = { ids: [], text: item.display, sources: [], pantry: !!item.pantry, items: [] };
        index.set(key, line);
        (item.pantry ? pantry : shop).push(line);
      }
      line.ids.push(item.id);
      line.items.push(item);
      if (line.sources.indexOf(item.dish) === -1) line.sources.push(item.dish);
    });
    const unpack = (list) => {
      const out = [];
      list.forEach((line) => {
        const items = line.items || [];
        const canSum = items.length > 1 && items[0].summable && items.every((it) => it.summable && it.unit === items[0].unit && it.nameKey === items[0].nameKey);
        if (canSum) {
          const sum = items.reduce((a, it) => a + it.qty, 0);
          const text = formatSummedShop(items, sum);
          if (/\d\.\d/.test(text)) items.forEach((it) => out.push(shopLineFrom(it)));
          else { line.text = text; delete line.items; out.push(line); }
          return;
        }
        line.text = items.length ? items[0].display : line.text;
        delete line.items;
        out.push(line);
      });
      return out;
    };
    const shopLines = unpack(shop);
    const pantryLines = unpack(pantry);
    const groups = [];
    if (shopLines.length) groups.push({ kind: "shop", title: "", lines: shopLines });
    if (pantryLines.length) groups.push({ kind: "pantry", title: "Probably on hand", lines: pantryLines });
    return { groups: groups };
  }

  const core = { parseStepMinutes: parseStepMinutes, isoMinutes: isoMinutes, buildDish: buildDish, scheduleDish: scheduleDish, planMeal: planMeal, retime: retime, kitchenOf: kitchenOf, findConflicts: findConflicts, extractRecipe: extractRecipe, equipmentOf: equipmentOf, tempOf: tempOf, scaleShopText: scaleShopText, parseShopLine: parseShopLine, buildShoppingList: buildShoppingList, isPantryStaple: isPantryStaple };
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
  let state = { slugs: [], eat: "18:30", day: null, overrides: {}, offsets: {}, done: {}, servings: {}, retimeMode: "keep", note: null };
  const KITCHEN_KEY = "clt:kitchen";
  let kitchen = kitchenOf(store.get(KITCHEN_KEY));
  let currentDishes = [];
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
    // Keep a shared link in the address bar in step with edits and re-times,
    // so a reload mid-cook rebuilds this plan, not the original link.
    try { if (/[?&]r=/.test(location.search)) history.replaceState(null, "", state.slugs.length ? shareUrl() : location.pathname); } catch (_) {}
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
  const fmtClock = (date) => date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  // Times on a different day than dinner get the weekday ("Mon 9:00 PM").
  const fmt = (date) => (date.toDateString() !== eatDate().toDateString() ? date.toLocaleDateString([], { weekday: "short" }) + " " : "") + fmtClock(date);
  const at = (rel) => new Date(eatDate().getTime() + rel * 60000);
  function earlyNote(date) {
    if (date.toDateString() !== eatDate().toDateString()) return " That's the day before, " + date.toLocaleDateString([], { weekday: "long" }) + " at " + fmtClock(date) + ".";
    if (date.getHours() < 12) return " That's a morning start.";
    return "";
  }

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
    const dish = buildDish(recipe, slug, i);
    dish.ingredients = listIngredients(recipe, doc);
    dish.baseYield = yieldCount(recipe, doc);
    dishCache[slug] = dish;
    return dishCache[slug];
  }

  function listIngredients(recipe, doc) {
    const out = [];
    const push = (v) => {
      if (v == null) return;
      if (typeof v === "string") { const t = v.trim(); if (t) out.push(t); return; }
      if (typeof v === "object") push(v.text || v.name);
    };
    const raw = recipe && recipe.recipeIngredient;
    if (Array.isArray(raw)) raw.forEach(push);
    else if (raw) push(raw);
    if (!out.length && doc) {
      doc.querySelectorAll("[itemprop='recipeIngredient']").forEach((node) => {
        const t = (node.textContent || "").replace(/\s+/g, " ").trim();
        if (t) out.push(t);
      });
    }
    return out;
  }

  function yieldCount(recipe, doc) {
    let raw = recipe && recipe.recipeYield;
    if (Array.isArray(raw)) raw = raw[0];
    if (raw && typeof raw === "object") raw = raw.value || raw.name || "";
    if (!raw && doc) {
      const node = doc.querySelector("[itemprop='recipeYield']");
      raw = node ? node.textContent : "";
    }
    const m = String(raw || "").match(/(\d+)/);
    return m ? Math.max(1, parseInt(m[1], 10)) : 1;
  }

  function servingsFor(dish) {
    const n = state.servings && parseInt(state.servings[dish.slug], 10);
    if (n >= 1 && n <= 48) return n;
    return dish.baseYield || 1;
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
    if (state.servings) delete state.servings[slug];
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
      if (d) li.appendChild(servingsControl(d));
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

  function servingsControl(dish) {
    const base = dish.baseYield || 1;
    const serv = el("span", "meal-servings");
    serv.setAttribute("role", "group");
    serv.setAttribute("aria-label", "Servings for " + dish.name);
    const minus = el("button", "toolbar-btn meal-mini", "−");
    minus.type = "button";
    minus.setAttribute("aria-label", "Fewer servings of " + dish.name);
    const readout = el("span", "meal-servings-readout");
    const num = el("span", null, "");
    readout.appendChild(num);
    readout.appendChild(document.createTextNode(" servings"));
    const plus = el("button", "toolbar-btn meal-mini", "+");
    plus.type = "button";
    plus.setAttribute("aria-label", "More servings of " + dish.name);
    const hint = el("span", "meal-servings-base", "");
    const paint = () => {
      const n = servingsFor(dish);
      num.textContent = String(n);
      hint.textContent = n === base ? "" : "base " + base;
      minus.disabled = n <= 1;
      plus.disabled = n >= 48;
    };
    const setN = (n) => {
      n = Math.max(1, Math.min(48, n));
      if (!state.servings || typeof state.servings !== "object") state.servings = {};
      if (n === base) delete state.servings[dish.slug];
      else state.servings[dish.slug] = n;
      saveState();
      paint();
      renderShop();
      say(dish.name + ", " + n + " servings");
    };
    minus.addEventListener("click", () => setN(servingsFor(dish) - 1));
    plus.addEventListener("click", () => setN(servingsFor(dish) + 1));
    paint();
    serv.appendChild(minus);
    serv.appendChild(readout);
    serv.appendChild(plus);
    serv.appendChild(hint);
    return serv;
  }

  function nudge(id, delta, value) {
    const ev = plan && (plan.events.find((e) => e.id === id) || plan.ahead.find((e) => e.id === id));
    if (!ev) return;
    const next = value != null ? value : Math.max(0, (ev.minutes || 0) + delta);
    state.overrides[id] = Math.min(900, Math.max(0, Math.round(next)));
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
    if (ev.equip && ev.equip.length) bits.push(ev.equip.map((e) => (e === "stove" ? "stovetop" : e === "slowcooker" ? "slow cooker" : e)).join(" + ") + (ev.temp ? " " + ev.temp + "°F" : ""));
    if (ev.active === false) bits.push("hands-off");
    if (ev.slack > 0 && !(state.done || {})[ev.id]) bits.push("can wait " + ev.slack + " min");
    if (state.done && state.done[ev.id]) { bits.push("done"); li.classList.add("is-done"); }
    meta.textContent = bits.join(" · ");
    body.appendChild(meta);
    li.appendChild(body);
    const ctl = el("div", "meal-nudge no-print");
    const minus = el("button", "toolbar-btn meal-mini", "−1");
    minus.type = "button"; minus.setAttribute("aria-label", "One minute shorter: " + ev.label);
    minus.addEventListener("click", () => nudge(ev.id, -1));
    const input = el("input", "meal-min-input");
    input.type = "number"; input.min = "0"; input.max = "900"; input.inputMode = "numeric"; input.value = String(ev.minutes || 0);
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
    $("[data-meal-summary]").textContent = "Start at " + fmt(at(plan.start)) + (plan.ahead.length ? " (do-earlier work before that)" : "") + " to eat at " + fmtClock(at(0)) + (at(0).toDateString() === new Date().toDateString() ? " today" : " " + at(0).toLocaleDateString([], { weekday: "long" })) + "." + earlyNote(at(plan.start)) + " " + plan.events.length + " timed steps across " + state.slugs.length + " dishes.";

    if (plan.conflicts.length) {
      const box = el("section", "meal-conflicts" + (plan.conflicts.every((c) => c.severity === "info") ? " is-info-only" : ""));
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
    const early = at(plan.start);
    if (early.getHours() < 12 || early.toDateString() !== at(0).toDateString()) {
      const li = el("li", "meal-step meal-eat meal-early-start");
      li.appendChild(el("span", "meal-time", fmt(early)));
      li.appendChild(el("p", "meal-step-text", "Start " + fmt(early) + ". Long hands-off cook, so this dish starts early." + earlyNote(early)));
      ol.appendChild(li);
    }
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
    currentDishes = dishes;
    lastErrors = errors;
    plan = dishes.length ? planMeal(dishes, { overrides: state.overrides, offsets: state.offsets, kitchen: kitchen, done: state.done }) : null;
    renderNote();
    renderDishes(dishes, errors);
    renderPlan(focusId);
    renderShop();
    if (cook.on) renderCook();
  }

  // --- eat time ---
  const eatInput = $("[data-meal-eat]");
  eatInput.addEventListener("change", () => {
    if (/^\d{1,2}:\d{2}$/.test(eatInput.value)) { state.eat = eatInput.value; state.day = null; state.done = {}; state.note = null; saveState(); rebuild(); }
  });
  searchInput.addEventListener("input", renderResults);
  $("[data-action='meal-reset']").addEventListener("click", () => {
    state.overrides = {}; state.offsets = {}; state.done = {}; state.note = null; saveState(); rebuild(); say("Edits cleared");
  });
  $("[data-action='meal-clear']").addEventListener("click", () => {
    state = { slugs: [], eat: state.eat, day: null, overrides: {}, offsets: {}, done: {}, servings: {} }; saveState(); rebuild(); say("Meal cleared");
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
  // Keep screen on: on by default, remembered on this device.
  const WAKE_KEY = "clt:meal-wake";
  const wakeSwitch = $("[data-wake-switch]");
  const wakeStatus = $("[data-wake-status]");
  const wakeSupported = "wakeLock" in navigator;
  let wakeOn = store.get(WAKE_KEY) !== false;
  function paintWake() {
    wakeSwitch.setAttribute("aria-checked", wakeOn ? "true" : "false");
    wakeSwitch.classList.toggle("is-on", wakeOn);
    if (!wakeSupported) { wakeSwitch.disabled = true; wakeStatus.textContent = "Not supported on this browser"; return; }
    const held = cook.wake && !cook.wake.released;
    wakeStatus.textContent = wakeOn && (held || !cook.on) ? "Screen will stay on" : "Screen may sleep";
  }
  async function requestWake() {
    if (!wakeSupported || !wakeOn || !cook.on) { paintWake(); return; }
    try {
      if (!cook.wake || cook.wake.released) {
        cook.wake = await navigator.wakeLock.request("screen");
        cook.wake.addEventListener("release", paintWake);
      }
    } catch (_) {}
    paintWake();
  }
  function releaseWake() {
    if (cook.wake) { const w = cook.wake; cook.wake = null; w.release().catch(() => {}); }
    paintWake();
  }
  wakeSwitch.addEventListener("click", () => {
    wakeOn = !wakeOn;
    store.set(WAKE_KEY, wakeOn);
    if (wakeOn) requestWake(); else releaseWake();
    say(wakeOn ? "Screen will stay on" : "Screen may sleep");
  });
  paintWake();
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
    if (!state.day) { state.day = at(0).toISOString(); saveState(); }
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
    releaseWake();
    $("[data-action='meal-cook']").focus();
  }
  $("[data-action='meal-cook']").addEventListener("click", enterCook);
  $("[data-action='cook-exit']").addEventListener("click", exitCook);
  $("[data-action='cook-done']").addEventListener("click", () => {
    if (!plan) return;
    const now = Date.now();
    const ev = plan.events.find((e) => at(e.start).getTime() <= now && !state.done[e.id]);
    if (ev) {
      state.done[ev.id] = true; saveState(); say("Done: " + ev.label); renderCook();
      if (!ev.background) {
        const drift = Math.round((now - at(ev.end).getTime()) / 60000);
        if (drift >= 3 || drift <= -3) offerDrift(drift);
      }
    }
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

  // --- My kitchen ---
  const kitForm = $("[data-kitchen]");
  const kitSummary = $("[data-kitchen-summary]");
  function kitchenLine(k) {
    const g = { none: "no grill", pellet: "pellet grill", gas: "gas grill", charcoal: "charcoal grill" }[k.grill];
    return k.burners + " burners · " + (k.ovens === 2 ? "2 ovens" : "1 oven") + " · " + k.slowCookers + " slow cooker" + (k.slowCookers === 1 ? "" : "s") + (k.airFryer ? " · air fryer oven" : "") + " · " + g + (k.grill !== "none" ? " (" + k.grillPreheat + " min to heat)" : "") + " · oven preheat " + k.ovenPreheat + " min · water boils in " + k.boil + " min";
  }
  function paintKitchen() {
    kitForm.elements.burners.value = kitchen.burners;
    kitForm.elements.ovens.value = String(kitchen.ovens);
    if (kitForm.elements.slowCookers) kitForm.elements.slowCookers.value = kitchen.slowCookers;
    kitForm.elements.airFryer.checked = kitchen.airFryer;
    kitForm.elements.grill.value = kitchen.grill;
    kitForm.elements.grillPreheat.value = kitchen.grillPreheat;
    kitForm.elements.ovenPreheat.value = kitchen.ovenPreheat;
    kitForm.elements.boil.value = kitchen.boil;
    kitForm.elements.grillPreheat.disabled = kitchen.grill === "none";
    kitSummary.textContent = "My kitchen: " + kitchenLine(kitchen);
  }
  kitForm.addEventListener("change", (e) => {
    const f = kitForm.elements;
    const prevGrill = kitchen.grill;
    const next = { burners: f.burners.value, ovens: f.ovens.value, slowCookers: f.slowCookers ? f.slowCookers.value : 1, airFryer: f.airFryer.checked, grill: f.grill.value, grillPreheat: f.grillPreheat.value, ovenPreheat: f.ovenPreheat.value, boil: f.boil.value };
    if (e.target === f.grill && next.grill !== prevGrill) next.grillPreheat = { pellet: 15, gas: 10, charcoal: 25, none: 15 }[next.grill];
    kitchen = kitchenOf(next);
    store.set(KITCHEN_KEY, kitchen);
    paintKitchen();
    say("Kitchen saved");
    rebuild();
  });
  kitForm.addEventListener("submit", (e) => e.preventDefault());
  paintKitchen();

  // --- Running behind / ahead ---
  const noteEl = $("[data-retime-note]");
  const noteCook = $("[data-cook-retime-note]");
  const driftEl = $("[data-drift]");
  function hhmm(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function renderNote() {
    [noteEl, noteCook].forEach((n) => {
      if (!n) return;
      n.hidden = !state.note;
      n.textContent = state.note || "";
    });
  }
  function applyRetime(delay, mode) {
    if (!plan || !currentDishes.length || !delay) return;
    const was = at(0);
    const nowRel = (Date.now() - was.getTime()) / 60000;
    let msg;
    if (delay < 0 && mode !== "push") {
      msg = "You're " + -delay + " min ahead. Dinner stays at " + fmt(was) + "; the next step can wait.";
    } else {
      const r = retime(currentDishes, { overrides: state.overrides, offsets: state.offsets, kitchen: kitchen, done: state.done }, delay, mode, nowRel);
      state.overrides = r.overrides;
      state.offsets = r.offsets;
      if (r.shift) {
        const next = new Date(was.getTime() + r.shift * 60000);
        state.eat = hhmm(next);
        state.day = next.toISOString();
        eatInput.value = state.eat;
      }
      const now = at(0);
      const absorbedTxt = delay > 0 && mode === "keep" && delay - r.shift > 0 ? " Absorbed " + (delay - r.shift) + " min in rests and holds." : "";
      const stuckTxt = r.stuck.length && r.shift ? " Couldn't fully absorb it: " + r.stuck.map(titleOf).join(", ") + "." : "";
      msg = r.shift ? "New eat time " + fmt(now) + " (was " + fmt(was) + ")." + absorbedTxt + stuckTxt : "Dinner still at " + fmt(now) + "." + absorbedTxt;
    }
    state.note = msg;
    driftEl.hidden = true;
    // Steps that moved later should chime again when they come due.
    Object.keys(cook.alerted).forEach((id) => { if (!state.done[id]) delete cook.alerted[id]; });
    saveState();
    say(msg);
    rebuild().then(() => { if (cook.on) { const t = Date.now(); plan.events.forEach((e) => { if (at(e.start).getTime() < t - 90000) cook.alerted[e.id] = true; }); } });
  }
  const modeInputs = app.querySelectorAll("input[name='retime-mode']");
  modeInputs.forEach((r) => {
    r.addEventListener("change", () => { if (r.checked) { state.retimeMode = r.value; saveState(); } });
  });
  app.querySelectorAll("[data-behind]").forEach((b) => b.addEventListener("click", () => applyRetime(+b.getAttribute("data-behind"), state.retimeMode)));
  const customMin = $("[data-retime-min]");
  const customVal = () => Math.max(1, Math.min(120, parseInt(customMin.value, 10) || 5));
  $("[data-action='retime-behind']").addEventListener("click", () => applyRetime(customVal(), state.retimeMode));
  $("[data-action='retime-ahead']").addEventListener("click", () => applyRetime(-customVal(), state.retimeMode));
  let driftBy = 0;
  function offerDrift(mins) {
    driftBy = mins;
    const late = mins > 0;
    $("[data-drift-text]").textContent = late ? "That step finished " + mins + " min behind schedule. Re-time the rest?" : "You're " + -mins + " min ahead of schedule.";
    $("[data-action='drift-keep']").textContent = late ? "Keep dinner at " + fmt(at(0)) + " if possible" : "Keep dinner at " + fmt(at(0));
    $("[data-action='drift-push']").textContent = late ? "Push dinner to " + fmt(new Date(at(0).getTime() + mins * 60000)) : "Eat earlier, at " + fmt(new Date(at(0).getTime() + mins * 60000));
    driftEl.hidden = false;
  }
  $("[data-action='drift-keep']").addEventListener("click", () => { if (driftBy > 0) applyRetime(driftBy, "keep"); else { driftEl.hidden = true; } });
  $("[data-action='drift-push']").addEventListener("click", () => applyRetime(driftBy, "push"));
  $("[data-action='drift-dismiss']").addEventListener("click", () => { driftEl.hidden = true; });
  $("[data-action='retime-clear']").addEventListener("click", () => { state.note = null; saveState(); renderNote(); });

  // --- Shopping list ---
  const TICK_KEY = "clt:shop-ticks";
  const SHOP_VIEW_KEY = "clt:shop-view";
  const SHOP_OPEN_KEY = "clt:shop-open";
  let ticks = store.get(TICK_KEY);
  if (!ticks || typeof ticks !== "object" || Array.isArray(ticks)) ticks = {};
  let shopView = store.get(SHOP_VIEW_KEY) === "merged" ? "merged" : "dish";
  let shopOpen = store.get(SHOP_OPEN_KEY) !== false;
  let shopModel = { groups: [] };
  let lastErrors = {};

  function saveTicks() { store.set(TICK_KEY, ticks); }

  function eachShopLine(fn) {
    (shopModel.groups || []).forEach((g) => {
      (g.lines || []).forEach((line) => fn(line, g));
      (g.subgroups || []).forEach((sub) => (sub.lines || []).forEach((line) => fn(line, g)));
    });
  }

  function shopPlainText() {
    const lines = [];
    eachShopLine((line) => {
      const ids = line.ids || [];
      if (ids.length && ids.every((id) => ticks[id])) return;
      if (line.text) lines.push(line.text);
    });
    return lines.join("\n");
  }

  function paintShopChrome() {
    const panel = $("[data-shop-panel]");
    const toggle = $("[data-shop-toggle]");
    if (panel) panel.hidden = !shopOpen;
    if (toggle) {
      toggle.setAttribute("aria-expanded", shopOpen ? "true" : "false");
      toggle.textContent = shopOpen ? "Hide list" : "Show list";
    }
    app.querySelectorAll("[data-shop-view]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-shop-view") === shopView ? "true" : "false");
    });
  }

  function paintShopStatus() {
    const status = $("[data-shop-status]");
    if (!status) return;
    let shopN = 0;
    let pantryN = 0;
    let any = 0;
    eachShopLine((line, g) => {
      any += 1;
      const ids = line.ids || [];
      if (ids.length && ids.every((id) => ticks[id])) return;
      if (g.kind === "pantry") pantryN += 1;
      else shopN += 1;
    });
    if (!any) { status.textContent = ""; return; }
    if (!shopN && !pantryN) { status.textContent = "All ticked"; return; }
    const bits = [];
    if (shopN) bits.push(shopN + " still to shop");
    if (pantryN) bits.push(pantryN + " probably on hand");
    status.textContent = bits.join(" · ");
  }

  function renderShop() {
    const section = $("[data-meal-shop]");
    const list = $("[data-shop-list]");
    if (!section || !list) return;
    if (!state.slugs.length) {
      section.hidden = true;
      shopModel = { groups: [] };
      list.replaceChildren();
      paintShopStatus();
      return;
    }
    section.hidden = false;
    paintShopChrome();
    const modelDishes = [];
    state.slugs.forEach((slug) => {
      const d = currentDishes.find((x) => x.slug === slug);
      if (!d) return;
      modelDishes.push({
        slug: slug, name: d.name, color: d.color,
        ingredients: d.ingredients || [], baseYield: d.baseYield || 1, servings: servingsFor(d),
      });
    });
    shopModel = buildShoppingList(modelDishes, shopView);
    list.replaceChildren();
    state.slugs.forEach((slug) => {
      if (lastErrors[slug]) list.appendChild(el("p", "shop-miss", "Couldn't load ingredients for " + titleOf(slug) + "."));
      else {
        const d = modelDishes.find((x) => x.slug === slug);
        if (d && !d.ingredients.length) list.appendChild(el("p", "shop-miss", "No ingredient list on " + d.name + "."));
      }
    });
    let headingN = 0;
    const addLine = (ul, line) => {
      const li = el("li", "shop-line");
      const ids = line.ids || [];
      const allOn = ids.length > 0 && ids.every((id) => ticks[id]);
      const some = ids.some((id) => ticks[id]);
      if (allOn) li.classList.add("is-checked");
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!allOn;
      input.dataset.ids = ids.join(",");
      label.appendChild(input);
      label.appendChild(el("span", "shop-line-text", line.text));
      if (shopView === "merged" && line.sources && line.sources.length) label.appendChild(el("span", "shop-sources", line.sources.join(" · ")));
      li.appendChild(label);
      ul.appendChild(li);
      if (some && !allOn) input.indeterminate = true;
      input.addEventListener("change", () => {
        (input.dataset.ids || "").split(",").filter(Boolean).forEach((id) => {
          if (input.checked) ticks[id] = 1;
          else delete ticks[id];
        });
        input.indeterminate = false;
        li.classList.toggle("is-checked", input.checked);
        saveTicks();
        paintShopStatus();
        say((input.checked ? "Ticked " : "Cleared ") + line.text);
      });
    };
    (shopModel.groups || []).forEach((g) => {
      const sec = el("section", "shop-group" + (g.color != null && g.kind !== "pantry" ? " dish-c" + (g.color % 4) : "") + (g.kind === "pantry" ? " shop-pantry" : ""));
      let labelled = "";
      if (g.title) {
        headingN += 1;
        const h = el("h3");
        h.id = "shop-h-" + headingN;
        labelled = h.id;
        h.appendChild(document.createTextNode(g.title));
        if (g.servings) {
          let meta = " · " + g.servings + (g.servings === 1 ? " serving" : " servings");
          if (g.baseYield && g.servings !== g.baseYield) meta += " (base " + g.baseYield + ")";
          h.appendChild(el("span", "shop-yield", meta));
        }
        sec.appendChild(h);
      }
      if ((g.lines || []).length) {
        const ul = el("ul", "shop-lines");
        if (labelled) ul.setAttribute("aria-labelledby", labelled);
        g.lines.forEach((line) => addLine(ul, line));
        sec.appendChild(ul);
      }
      (g.subgroups || []).forEach((sub) => {
        if (!sub.lines || !sub.lines.length) return;
        headingN += 1;
        const subH = el("p", "shop-sub" + (sub.color != null ? " dish-c" + (sub.color % 4) : ""), sub.title);
        subH.id = "shop-h-" + headingN;
        sec.appendChild(subH);
        const ul = el("ul", "shop-lines");
        ul.setAttribute("aria-labelledby", subH.id);
        sub.lines.forEach((line) => addLine(ul, line));
        sec.appendChild(ul);
      });
      if (sec.childNodes.length) list.appendChild(sec);
    });
    paintShopStatus();
  }

  function writeShopText(btn, idleLabel) {
    const text = shopPlainText();
    if (!text) {
      say("All items are ticked");
      if (btn) { btn.textContent = "All ticked"; window.setTimeout(() => { btn.textContent = idleLabel; }, 1600); }
      return "";
    }
    return text;
  }

  async function copyPlain(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) return true;
    } catch (_) {}
    window.prompt("Copy this list", text);
    return false;
  }

  const shopToggle = $("[data-shop-toggle]");
  if (shopToggle) shopToggle.addEventListener("click", () => {
    shopOpen = !shopOpen;
    store.set(SHOP_OPEN_KEY, shopOpen);
    paintShopChrome();
    say(shopOpen ? "Shopping list shown" : "Shopping list hidden");
  });
  app.querySelectorAll("[data-shop-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      shopView = btn.getAttribute("data-shop-view") === "merged" ? "merged" : "dish";
      store.set(SHOP_VIEW_KEY, shopView);
      renderShop();
      say(shopView === "merged" ? "Merged list" : "List by dish");
    });
  });
  const copyShopBtn = $("[data-action='shop-copy']");
  if (copyShopBtn) copyShopBtn.addEventListener("click", async () => {
    const text = writeShopText(copyShopBtn, "Copy list");
    if (!text) return;
    const ok = await copyPlain(text);
    if (!ok) return;
    copyShopBtn.classList.add("is-success");
    copyShopBtn.textContent = "Copied";
    say("Shopping list copied");
    window.setTimeout(() => { copyShopBtn.classList.remove("is-success"); copyShopBtn.textContent = "Copy list"; }, 1600);
  });
  const shareShopBtn = $("[data-action='shop-share']");
  if (shareShopBtn) shareShopBtn.addEventListener("click", async () => {
    const text = writeShopText(shareShopBtn, "Share list");
    if (!text) return;
    const title = "Shopping list: " + state.slugs.map(titleOf).join(", ");
    try {
      if (navigator.share) { await navigator.share({ title: title, text: text }); say("Shopping list shared"); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    const ok = await copyPlain(text);
    if (!ok) return;
    shareShopBtn.classList.add("is-success");
    shareShopBtn.textContent = "Copied";
    say("Shopping list copied");
    window.setTimeout(() => { shareShopBtn.classList.remove("is-success"); shareShopBtn.textContent = "Share list"; }, 1600);
  });
  const clearShopBtn = $("[data-action='shop-clear']");
  if (clearShopBtn) clearShopBtn.addEventListener("click", () => {
    ticks = {};
    saveTicks();
    renderShop();
    say("Ticks cleared");
  });
  window.addEventListener("beforeprint", () => {
    const panel = $("[data-shop-panel]");
    if (panel && state.slugs.length) panel.hidden = false;
  });
  window.addEventListener("afterprint", paintShopChrome);
  paintShopChrome();

  // --- boot ---
  (async function boot() {
    const fromUrl = readUrl();
    const saved = store.get(PLAN_KEY);
    const tray = store.get(MEAL_KEY);
    const sameAsSaved = fromUrl && saved && Array.isArray(saved.slugs) && saved.slugs.join(",") === fromUrl.slugs.join(",") && saved.eat === fromUrl.eat;
    if (sameAsSaved) state = Object.assign(state, saved);
    else if (fromUrl) state = Object.assign(state, fromUrl);
    else if (saved && Array.isArray(saved.slugs)) state = Object.assign(state, saved, { slugs: Array.isArray(tray) ? tray.slice(0, MAX_DISHES) : saved.slugs });
    else if (Array.isArray(tray)) state.slugs = tray.slice(0, MAX_DISHES);
    state.overrides = state.overrides || {}; state.offsets = state.offsets || {}; state.done = state.done || {};
    if (!state.servings || typeof state.servings !== "object" || Array.isArray(state.servings)) state.servings = {};
    if (!saved && !fromUrl) state.eat = "18:30";
    eatInput.value = state.eat.length === 4 ? "0" + state.eat : state.eat;
    state.retimeMode = state.retimeMode === "push" ? "push" : "keep";
    modeInputs.forEach((r) => { r.checked = r.value === state.retimeMode; });
    saveState();
    await loadCatalog();
    rebuild();
  })();
})(this);
