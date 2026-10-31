/* Carroll Lowcountry Table — Shopping list from the Meal calendar (calendar.html)
   Reads the calendar (clt-meal-calendar-v1) and ingredients.json, both on this device.
   Pantry staples live in clt-pantry-v1 and check-offs in clt-shoplist-checks-v1.
   Nothing syncs, nothing is sent anywhere, nothing goes in the address bar. */
"use strict";
(function (root) {
  const PANTRY_KEY = "clt-pantry-v1";
  const CHECKS_KEY = "clt-shoplist-checks-v1";
  const CAL_KEY = "clt-meal-calendar-v1";
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const SECTIONS = ["Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Pantry/Canned", "Spices", "Frozen", "Other"];

  // ---------- parsing ----------
  const UNI = { "¼": "1/4", "½": "1/2", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅕": "1/5" };
  // unit -> [family, factor to family base, display]
  const UNITS = {
    tsp: ["vol", 1], teaspoon: ["vol", 1], teaspoons: ["vol", 1], t: ["vol", 1],
    tbsp: ["vol", 3], tbs: ["vol", 3], tbl: ["vol", 3], tablespoon: ["vol", 3], tablespoons: ["vol", 3], T: ["vol", 3],
    cup: ["vol", 48], cups: ["vol", 48], c: ["vol", 48],
    pint: ["vol", 96], pints: ["vol", 96], quart: ["vol", 192], quarts: ["vol", 192], qt: ["vol", 192], gallon: ["vol", 768], gallons: ["vol", 768],
    oz: ["wt", 1], ounce: ["wt", 1], ounces: ["wt", 1],
    lb: ["wt", 16], lbs: ["wt", 16], pound: ["wt", 16], pounds: ["wt", 16],
    g: ["g", 1], gram: ["g", 1], grams: ["g", 1], kg: ["g", 1000],
    ml: ["ml", 1], l: ["ml", 1000], liter: ["ml", 1000], liters: ["ml", 1000],
  };
  // Counted packaging words: kept as their own unit, summed only with the same word.
  const COUNTS = { clove: "clove", cloves: "clove", can: "can", cans: "can", package: "package", packages: "package", pkg: "package",
    bunch: "bunch", bunches: "bunch", stick: "stick", sticks: "stick", slice: "slice", slices: "slice", head: "head", heads: "head",
    jar: "jar", jars: "jar", bag: "bag", bags: "bag", box: "box", bottle: "bottle", bottles: "bottle", sprig: "sprig", sprigs: "sprig",
    stalk: "stalk", stalks: "stalk", rib: "rib", ribs: "rib", pinch: "pinch", dash: "dash", envelope: "envelope", packet: "packet", packets: "packet",
    link: "link", links: "link", fillet: "fillet", fillets: "fillet", container: "container", block: "block" };
  const DESCRIPTORS = new Set(("fresh freshly large medium small extra-large jumbo finely coarsely roughly thinly thickly chopped diced minced sliced " +
    "grated shredded crushed peeled cubed halved quartered packed lightly heaping level softened melted cold warm room-temperature " +
    "boneless skinless bone-in raw cooked uncooked whole ripe firm good-quality about plus divided optional").split(" "));

  function num(tok) {
    if (/^\d+\/\d+$/.test(tok)) { const [a, b] = tok.split("/").map(Number); return b ? a / b : NaN; }
    if (/^\d*\.?\d+$/.test(tok)) return Number(tok);
    return NaN;
  }
  function singular(w) {
    if (/(ss|us|is)$/.test(w)) return w;
    if (/oes$/.test(w)) return w.slice(0, -2);
    if (/ies$/.test(w)) return w.slice(0, -3) + "y";
    if (/(ches|shes|xes)$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w) && w.length > 3) return w.slice(0, -1);
    return w;
  }
  function keyOf(name) {
    let n = name.toLowerCase().replace(/\([^)]*\)/g, " ").split(/,|;| - | – | for (?:the|serving|garnish)\b/)[0];
    n = n.replace(/\b(?:or|and\/or)\b.*$/, (m) => (/^or\b/.test(m) ? "" : m)).replace(/[^\p{L}0-9' -]/gu, " ");
    const words = n.split(/\s+/).filter((w) => w && !DESCRIPTORS.has(w) && w !== "of");
    if (!words.length) return "";
    words[words.length - 1] = singular(words[words.length - 1]);
    return words.join(" ").trim();
  }

  function parseLine(line) {
    let s = String(line || "").replace(/[¼½¾⅓⅔⅛⅜⅝⅞⅕]/g, (c) => " " + UNI[c]).replace(/(\d)\s+(\d\/\d)/g, "$1+$2").replace(/\s+/g, " ").trim();
    const raw = String(line || "").trim();
    let qty = null, unit = "", rest = s;
    const m = s.match(/^(\d+\+\d+\/\d+|\d+\/\d+|\d*\.?\d+)(?:\s*(?:-|–|to)\s*(\d+\+\d+\/\d+|\d+\/\d+|\d*\.?\d+))?\s*/);
    if (m) {
      const val = (t) => t.split("+").reduce((a, x) => a + num(x), 0);
      qty = val(m[2] || m[1]); // ranges buy for the high end
      rest = s.slice(m[0].length);
      // "1 (8-oz) package cream cheese" -> 8 oz each
      const pk = rest.match(/^\((\d+\+?\d*\/?\d*\.?\d*)[- ]?(oz|ounce|lb|pound|g)\.?\)\s*(\w+)\s+/i);
      if (pk && COUNTS[pk[3].toLowerCase()]) {
        const per = val(pk[1]); const u = UNITS[pk[2].toLowerCase()] || UNITS.oz;
        if (!isNaN(per)) { qty = qty * per; unit = pk[2].toLowerCase().replace(/^ounce$/, "oz").replace(/^pound$/, "lb"); rest = rest.slice(pk[0].length); void u; }
      }
      if (!unit) {
        const um = rest.match(/^([A-Za-z]+)\.?\s+/);
        if (um) {
          const w = um[1];
          if (UNITS[w] || UNITS[w.toLowerCase()]) { unit = UNITS[w] ? w : w.toLowerCase(); rest = rest.slice(um[0].length); }
          else if (COUNTS[w.toLowerCase()]) { unit = COUNTS[w.toLowerCase()]; rest = rest.slice(um[0].length); }
        }
      }
      rest = rest.replace(/^of\s+/i, "");
      if (isNaN(qty)) qty = null;
    }
    const name = rest.trim();
    const key = keyOf(name) || name.toLowerCase();
    const label = key ? key.charAt(0).toUpperCase() + key.slice(1) : raw;
    return { raw, qty, unit, name, key, label };
  }

  // ---------- amounts ----------
  function fmtNum(x) {
    const whole = Math.floor(x + 1e-9); const f = x - whole;
    const fr = [[0, ""], [1 / 8, "1/8"], [1 / 4, "1/4"], [1 / 3, "1/3"], [3 / 8, "3/8"], [1 / 2, "1/2"], [5 / 8, "5/8"], [2 / 3, "2/3"], [3 / 4, "3/4"], [7 / 8, "7/8"], [1, ""]];
    let best = fr[0]; fr.forEach((p) => { if (Math.abs(p[0] - f) < Math.abs(best[0] - f)) best = p; });
    const w = best[0] === 1 ? whole + 1 : whole;
    if (Math.abs(best[0] - f) > 0.04 && x < 10) return String(Math.round(x * 100) / 100);
    return (w ? String(w) : "") + (best[1] ? (w ? " " : "") + best[1] : "") || "0";
  }
  function fmtFamily(fam, base) {
    if (fam === "vol") {
      if (base >= 12) {
        const c = base / 48, clean = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1].some((f) => Math.abs(c - Math.floor(c) - f) < 0.02);
        if (!clean) { const q = Math.floor(c * 4 + 1e-9) / 4, rest = Math.round((base - q * 48) / 3 * 2) / 2;
          if (q > 0 && rest > 0) return fmtNum(q) + (q > 1.01 ? " cups" : " cup") + " + " + fmtNum(rest) + " tbsp"; }
        return fmtNum(c) + (c > 1.01 ? " cups" : " cup");
      }
      if (base >= 3 && Math.abs(base / 3 - Math.round(base / 3 * 2) / 2) < 0.05) return fmtNum(base / 3) + " tbsp";
      return fmtNum(base) + " tsp";
    }
    if (fam === "wt") return base >= 16 ? fmtNum(base / 16) + " lb" : fmtNum(base) + " oz";
    if (fam === "g") return base >= 1000 ? fmtNum(base / 1000) + " kg" : fmtNum(base) + " g";
    if (fam === "ml") return base >= 1000 ? fmtNum(base / 1000) + " L" : fmtNum(base) + " ml";
    return fmtNum(base);
  }
  // Sum parsed lines that share a key. Returns display parts like ["2 lb", "1 cup chopped"].
  function combine(parts) {
    const fam = {}, order = [], extras = [];
    parts.forEach((p) => {
      if (p.qty == null) { const t = p.name.match(/to taste|as needed|for serving|for garnish/i); extras.push(t ? t[0].toLowerCase() : "as listed"); return; }
      const u = UNITS[p.unit] || UNITS[p.unit.toLowerCase && p.unit.toLowerCase()];
      const k = u ? u[0] : (p.unit ? "count:" + p.unit : "count");
      if (!(k in fam)) { fam[k] = 0; order.push(k); }
      fam[k] += p.qty * (u ? u[1] : 1);
    });
    const out = order.map((k) => {
      if (k.indexOf("count") === 0) { const w = k.split(":")[1]; const n = fam[k]; return fmtNum(n) + (w ? " " + w + (n > 1.01 && !/s$/.test(w) && w !== "pinch" && w !== "dash" ? (/(ch|sh|x)$/.test(w) ? "es" : "s") : "") : ""); }
      return fmtFamily(k, fam[k]);
    });
    extras.forEach((e) => { if (out.indexOf(e) === -1) out.push(e); });
    return out;
  }

  // ---------- sections & pantry ----------
  const SECTION_WORDS = [
    ["Frozen", /\bfrozen\b|\bice cream\b/],
    ["Spices", /\b(dried|ground)\b|paprika|cumin|oregano|chili powder|garlic powder|onion powder|cayenne|cinnamon|nutmeg|allspice|clove(s)? ground|seasoning|\brub\b|red pepper flake|bay lea|italian herb|curry powder|turmeric|coriander|pumpkin pie spice|old bay|cajun|creole|smoked salt|peppercorn|five spice|garam|chipotle powder|mustard seed|celery seed|sesame seed|granulated (garlic|onion)|everything bagel|msg|vanilla/],
    ["Meat & Seafood", /beef|steak|chuck|brisket|pork|bacon|ham\b|sausage|chorizo|chicken|turkey|thigh|breast|wing|drumstick|lamb|veal|rib\b|ribs|shrimp|salmon|catfish|fish|cod|tilapia|crab|scallop|oyster|clam|mussel|tuna|tenderloin|loin|roast|ground (beef|pork|turkey|chicken)|prosciutto|pepperoni|salami|andouille|kielbasa|hot dog|meatball|crawfish|flounder|grouper|trout/],
    ["Dairy & Eggs", /\bbutter\b|\bmilk\b|cream|cheese|cheddar|mozzarella|parmesan|parmigiano|ricotta|feta|yogurt|\begg|sour cream|half-and-half|half and half|buttermilk|ghee|mascarpone|gruyere|monterey|pepper jack|provolone|cotija|queso|whipped topping|cool whip/],
    ["Bakery", /\bbread\b|bun|roll\b|rolls|tortilla|pita|baguette|brioche|croissant|naan|bagel|english muffin|biscuit dough|crust\b/],
    ["Produce", /onion|garlic|shallot|scallion|leek|potato|carrot|celery|pepper(s)?\b(?! ?(flake|jack|corn))|jalape|poblano|serrano|habanero|tomato|lettuce|romaine|spinach|kale|arugula|cabbage|broccoli|cauliflower|zucchini|squash|cucumber|mushroom|corn\b|green bean|pea(s)?\b|okra|eggplant|asparagus|avocado|lemon|lime|orange|apple|banana|berr|peach|pear|grape|pineapple|mango|cherr|herb|parsley|cilantro|basil|thyme|rosemary|sage|dill|mint|chive|ginger|fingerling|radish|beet|sprout|bok choy|broccolini|fennel|collard|turnip|greens|bell pepper|fruit|melon|watermelon|plum|cranberr|pomegranate|lemongrass|edamame|bean sprout/],
    ["Pantry/Canned", /broth|stock|\bcan\b|canned|sauce|paste|vinegar|oil|flour|sugar|syrup|honey|molasses|rice|pasta|noodle|macaroni|ziti|rotini|penne|spaghetti|bean|lentil|chickpea|oat|cereal|cracker|chip|panko|breadcrumb|bread crumb|cornmeal|cornstarch|baking|yeast|cocoa|chocolate|nut|almond|pecan|walnut|peanut|raisin|coconut|mayo|mustard|ketchup|relish|pickle|olive|caper|salsa|soy|worcestershire|hoisin|sriracha|hot sauce|jam|jelly|preserve|filling|pudding|gelatin|jell|mix\b|stuffing|gum\b|extract|wine|beer|bourbon|whiskey|rum|water|spray|salt|pepper|sweetener|monk fruit|erythritol|stevia|tahini|miso|fish sauce|curry paste|marinara|tortellini|broth|quinoa|couscous|grits|evaporated|condensed|protein powder|powder/],
  ];
  function sectionOf(key, raw) {
    const s = (key + " " + (raw || "")).toLowerCase();
    if (/\bfrozen\b/.test(s)) return "Frozen";
    if (/(peanut|almond|nut|apple|cookie) butter|vinegar|\bsauce\b|broth|stock\b|paste\b|syrup|extract|\boil\b|canned|\bjam\b|jelly|\bchips?\b|preserves|pie filling|salsa/.test(key)) return "Pantry/Canned";
    if (SECTION_WORDS[2][1].test(key) && !/(seasoning|\brub\b|bouillon|broth|stock|powder|sauce)/.test(key)) return "Meat & Seafood";
    for (const [name, re] of SECTION_WORDS) if (name !== "Meat & Seafood" && re.test(key)) return name;
    return "Other";
  }
  const STAPLE_RE = /^(?:kosher |sea |table |flaky |fine |coarse )?salt$|^(?:kosher |sea )?salt (?:and|&) (?:ground )?(?:black )?pepper$|^(?:fresh(?:ly)? )?(?:ground )?(?:black )?pepper$|^(?:cracked )?black pepper$|\boil$|^(?:all-purpose |all purpose |bread |self-rising |plain )?flour$|\bsugar$|^water$|^(?:ice )?water$|cooking spray|nonstick spray/;
  function isDriedSpice(key) {
    if (/^(dried|ground)\b/.test(key) && !SECTION_WORDS[2][1].test(key) && !/flax|almond|oat|nut/.test(key)) return true;
    return /^(paprika|smoked paprika|cumin|chili powder|garlic powder|onion powder|cayenne|cayenne pepper|cinnamon|nutmeg|allspice|red pepper flake|crushed red pepper|italian seasoning|bay leaf|curry powder|turmeric|coriander|granulated garlic|granulated onion|old bay|cajun seasoning|creole seasoning|pumpkin pie spice|five spice|garam masala|celery seed|mustard powder|dry mustard)$/.test(key);
  }
  function isDefaultStaple(key) { return STAPLE_RE.test(key) || isDriedSpice(key); }

  function loadPantry(storage) {
    try { const v = JSON.parse(storage.getItem(PANTRY_KEY) || "null"); return v && Array.isArray(v.items) ? v.items.filter((x) => typeof x === "string").slice(0, 500) : []; }
    catch (_) { return []; }
  }
  function savePantry(storage, items) {
    const uniq = Array.from(new Set(items.filter((x) => typeof x === "string" && x))).slice(0, 500);
    try { storage.setItem(PANTRY_KEY, JSON.stringify({ v: 1, items: uniq })); return true; } catch (_) { return false; }
  }
  function addPantry(storage, key) { const l = loadPantry(storage); if (l.indexOf(key) === -1) l.push(key); return savePantry(storage, l); }
  function removePantry(storage, key) { return savePantry(storage, loadPantry(storage).filter((k) => k !== key)); }
  function isStaple(key, pantry) { return isDefaultStaple(key) || (pantry || []).indexOf(key) !== -1; }

  // ---------- range & list ----------
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const addDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
  function presetRange(name, todayStr) {
    if (name === "week") { const [y, m, d] = todayStr.split("-").map(Number); const dow = new Date(y, m - 1, d).getDay(); return { from: todayStr, to: addDays(todayStr, 6 - dow) }; }
    if (name === "two") return { from: todayStr, to: addDays(todayStr, 13) };
    return { from: todayStr, to: addDays(todayStr, 6) };
  }
  function inRange(entries, from, to, data) {
    if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) return [];
    if (from > to) { const t = from; from = to; to = t; }
    return (entries || []).filter((e) => e && e.slug && e.date >= from && e.date <= to && (!data || data[e.slug]))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  // Returns { sections: [{name, items:[{key,label,amounts,sources,staple}]}], recipes:[...], hidden:n, unparsed:[] }
  function buildList(entries, data, opts) {
    opts = opts || {};
    const items = {}; const recipes = [];
    entries.forEach((e) => {
      const r = data[e.slug]; if (!r) return;
      recipes.push({ slug: e.slug, title: r.n || e.title, date: e.date });
      r.i.forEach((line) => {
        const p = parseLine(line); if (!p.key) return;
        const it = items[p.key] || (items[p.key] = { key: p.key, label: p.label, parts: [], sources: [], section: sectionOf(p.key, p.raw) });
        it.parts.push(p);
        const src = { slug: e.slug, title: r.n || e.title, date: e.date };
        if (!it.sources.some((s) => s.slug === src.slug && s.date === src.date)) it.sources.push(src);
      });
    });
    let hidden = 0; const bySec = {};
    Object.keys(items).sort().forEach((k) => {
      const it = items[k]; it.amounts = combine(it.parts); it.staple = isStaple(k, opts.pantry);
      if (it.staple && opts.hideStaples !== false) { hidden++; return; }
      (bySec[it.section] = bySec[it.section] || []).push(it);
    });
    return { sections: SECTIONS.filter((s) => bySec[s]).map((s) => ({ name: s, items: bySec[s] })), recipes, hidden };
  }
  function toText(list, from, to) {
    const lines = ["Shopping list " + from + " to " + to, ""];
    list.sections.forEach((s) => {
      lines.push(s.name.toUpperCase());
      s.items.forEach((it) => lines.push("- " + it.label + (it.amounts.length ? ": " + it.amounts.join(" + ") : "") + "  (" + it.sources.map((x) => x.title).filter((t, i, a) => a.indexOf(t) === i).join("; ") + ")"));
      lines.push("");
    });
    return lines.join("\n").trim() + "\n";
  }

  // ---------- check-offs (per device, per range) ----------
  function loadChecks(storage, range) {
    try { const v = JSON.parse(storage.getItem(CHECKS_KEY) || "{}"); const r = v && v.r && v.r[range]; return r && typeof r === "object" ? r : {}; } catch (_) { return {}; }
  }
  function setCheck(storage, range, key, on) {
    let v; try { v = JSON.parse(storage.getItem(CHECKS_KEY) || "{}"); } catch (_) { v = {}; }
    if (!v || typeof v !== "object" || !v.r) v = { v: 1, r: {}, order: [] };
    if (!Array.isArray(v.order)) v.order = [];
    const r = v.r[range] || (v.r[range] = {});
    if (on) r[key] = 1; else delete r[key];
    v.order = v.order.filter((x) => x !== range).concat(range);
    while (v.order.length > 12) delete v.r[v.order.shift()];
    try { storage.setItem(CHECKS_KEY, JSON.stringify(v)); return true; } catch (_) { return false; }
  }

  const core = { PANTRY_KEY, CHECKS_KEY, SECTIONS, parseLine, keyOf, combine, fmtNum, sectionOf, isDefaultStaple, isStaple,
    loadPantry, savePantry, addPantry, removePantry, presetRange, inRange, buildList, toText, loadChecks, setCheck, ymd, addDays };
  if (typeof module !== "undefined" && module.exports) { module.exports = core; return; }
  root.CLTShoppingList = core;

  // ---------------- UI ----------------
  const card = document.querySelector("[data-shop-card]");
  if (!card) return;
  const ls = window.localStorage;
  const $ = (s) => card.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const status = $("[data-shop-status]");
  const say = (t) => { if (status) status.textContent = t; };
  const today = ymd(new Date());
  let range = presetRange("next7", today), preset = "next7", data = null, last = null;
  const fromIn = $("[data-shop-from]"), toIn = $("[data-shop-to]"), hideIn = $("[data-shop-hide]");
  const short = (d) => { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); };
  const calEntries = () => { try { const v = JSON.parse(ls.getItem(CAL_KEY) || "null"); return v && Array.isArray(v.entries) ? v.entries : []; } catch (_) { return []; } };

  function render() {
    const out = $("[data-shop-out]"); out.textContent = "";
    fromIn.value = range.from; toIn.value = range.to;
    card.querySelectorAll("[data-shop-preset]").forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-shop-preset") === preset)));
    if (!data) { out.appendChild(el("p", "cal-empty", "Loading ingredients…")); return; }
    const entries = inRange(calEntries(), range.from, range.to, data);
    const pantry = loadPantry(ls);
    last = buildList(entries, data, { pantry, hideStaples: hideIn.checked });
    const rkey = range.from + "_" + range.to; const checks = loadChecks(ls, rkey);
    const sum = $("[data-shop-summary]");
    sum.textContent = entries.length ? entries.length + (entries.length === 1 ? " recipe" : " recipes") + ", " + short(range.from) + " – " + short(range.to) +
      (last.hidden ? ". " + last.hidden + " pantry staple" + (last.hidden === 1 ? "" : "s") + " hidden." : ".") : "";
    if (!entries.length) { out.appendChild(el("p", "cal-empty", "No recipes on the calendar for these dates. Notes and leftovers don't add anything.")); renderPantry(pantry); return; }
    const rec = el("div", "shop-recipes"); rec.appendChild(el("h3", null, "Recipes"));
    const rul = el("ul", "shop-recipe-list");
    last.recipes.forEach((r) => { const li = el("li"); li.appendChild(el("span", "cal-entry-date", short(r.date))); const a = el("a", "cal-entry-link", r.title); a.href = r.slug + ".html"; li.appendChild(a); li.appendChild(el("span", "shop-hint", "Add to AnyList from the recipe page")); rul.appendChild(li); });
    rec.appendChild(rul); out.appendChild(rec);
    last.sections.forEach((s) => {
      const sec = el("section", "shop-sec"); sec.appendChild(el("h3", null, s.name));
      const ul = el("ul", "shop-items");
      s.items.forEach((it) => {
        const li = el("li", "shop-item" + (checks[it.key] ? " is-done" : ""));
        const lab = el("label", "shop-check"); const cb = el("input"); cb.type = "checkbox"; cb.checked = !!checks[it.key];
        cb.addEventListener("change", () => { setCheck(ls, rkey, it.key, cb.checked); li.classList.toggle("is-done", cb.checked); });
        lab.appendChild(cb);
        const txt = el("span", "shop-text"); txt.appendChild(el("strong", null, it.label)); if (it.amounts.length) txt.appendChild(document.createTextNode(": " + it.amounts.join(" + ")));
        lab.appendChild(txt); li.appendChild(lab);
        const src = el("span", "shop-src"); src.textContent = "for " + it.sources.map((x) => x.title + " (" + short(x.date) + ")").join("; ");
        li.appendChild(src);
        if (!it.staple) { const have = el("button", "toolbar-btn shop-have", "I have this"); have.type = "button";
          have.addEventListener("click", () => { addPantry(ls, it.key); say(it.label + " added to your pantry staples on this device"); render(); }); li.appendChild(have); }
        ul.appendChild(li);
      });
      sec.appendChild(ul); out.appendChild(sec);
    });
    renderPantry(pantry);
  }
  function renderPantry(pantry) {
    const box = $("[data-shop-pantry]"); box.textContent = "";
    if (!pantry.length) { box.appendChild(el("li", "cal-empty", "None yet. Tap “I have this” on an item.")); return; }
    pantry.slice().sort().forEach((k) => { const li = el("li"); li.appendChild(el("span", null, k)); const b = el("button", "toolbar-btn", "Remove"); b.type = "button";
      b.addEventListener("click", () => { removePantry(ls, k); say("Removed " + k + " from your staples"); render(); }); li.appendChild(b); box.appendChild(li); });
  }

  card.querySelectorAll("[data-shop-preset]").forEach((b) => b.addEventListener("click", () => { preset = b.getAttribute("data-shop-preset"); range = presetRange(preset, today); render(); }));
  [fromIn, toIn].forEach((i) => i.addEventListener("change", () => { if (DATE_RE.test(fromIn.value) && DATE_RE.test(toIn.value)) { preset = "custom"; range = fromIn.value <= toIn.value ? { from: fromIn.value, to: toIn.value } : { from: toIn.value, to: fromIn.value }; render(); } }));
  hideIn.addEventListener("change", render);
  $("[data-shop-copy]").addEventListener("click", () => {
    if (!last || !last.sections.length) { say("Nothing to copy yet."); return; }
    const text = toText(last, range.from, range.to);
    const done = () => say("Shopping list copied");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallback(text)); else fallback(text);
    function fallback(t) { const ta = el("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (_) { say("Couldn't copy. Select the list and copy it instead."); } ta.remove(); }
  });
  $("[data-shop-print]").addEventListener("click", () => { document.body.classList.add("print-shoplist"); window.print(); });
  window.addEventListener("afterprint", () => document.body.classList.remove("print-shoplist"));
  const shareBtn = $("[data-shop-share]");
  if (navigator.share) { shareBtn.hidden = false; shareBtn.addEventListener("click", () => { if (last && last.sections.length) navigator.share({ title: "Shopping list", text: toText(last, range.from, range.to) }).catch(() => {}); }); }
  document.querySelectorAll("[data-shop-open]").forEach((b) => b.addEventListener("click", () => { card.hidden = false; render(); card.scrollIntoView({ behavior: "smooth", block: "start" }); }));
  window.addEventListener("storage", (e) => { if ([CAL_KEY, PANTRY_KEY].indexOf(e.key) !== -1 && !card.hidden) render(); });
  fetch("ingredients.json").then((r) => (r.ok ? r.json() : {})).then((d) => { data = d || {}; if (!card.hidden) render(); }).catch(() => { data = {}; say("Couldn't load ingredients."); });
})(typeof window !== "undefined" ? window : globalThis);
