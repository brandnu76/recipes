/* Carroll Lowcountry Table — Cook from what I have (what-can-i-make.html)
   Rank recipes by ingredients on hand. Chips live in clt:have-v1.
   Pantry staples use the shopping list key clt-pantry-v1 (shopping-list.js).
   Nothing syncs, nothing is sent anywhere. */
"use strict";
(function (root) {
  const sl = (typeof module !== "undefined" && module.exports)
    ? require("./shopping-list.js")
    : root.CLTShoppingList;

  const HAVE_KEY = "clt:have-v1";
  const SHOW_LIMIT = 30;
  const SHOP = new Set(["shop", "shop-order"]);
  const QUICK = ["chicken", "ground beef", "pork", "shrimp", "sausage", "rice", "pasta", "potatoes", "tomatoes", "spinach", "cheese", "eggs"];
  const STAPLES_LINE = "Staples assumed: salt, pepper, oils, flour, sugar, dried spices, water, and cooking spray.";

  // Same simple singular rules as the shopping list, applied to every word.
  function singular(word) {
    const w = String(word || "").toLowerCase();
    if (/(ss|us|is)$/.test(w)) return w;
    if (/oes$/.test(w)) return w.slice(0, -2); // tomatoes -> tomato, potatoes -> potato
    if (/ies$/.test(w)) return w.slice(0, -3) + "y";
    if (/(ches|shes|xes)$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w) && w.length > 3) return w.slice(0, -1);
    return w;
  }

  function tokens(text) {
    const raw = String(text || "").toLowerCase().match(/[a-z0-9]+/g);
    return raw ? raw.map(singular) : [];
  }

  function normKey(chip) {
    return tokens(chip).join(" ");
  }

  function cleanLabel(raw) {
    return String(raw || "").replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, 48);
  }

  function cleanList(list) {
    const out = [];
    const seen = Object.create(null);
    (Array.isArray(list) ? list : []).forEach((raw) => {
      if (typeof raw !== "string") return;
      const label = cleanLabel(raw);
      const key = normKey(label);
      if (!key || seen[key]) return;
      seen[key] = 1;
      out.push(label);
    });
    return out.slice(0, 24);
  }

  // A following word that makes a different ingredient (rice vinegar, chicken broth).
  const COMPOUND = new Set(["vinegar", "wine", "powder", "broth", "stock", "paste", "flour", "oil", "sauce", "bouillon", "noodle", "noodles", "seasoning", "base"]);

  // Whole words on the ingredient name, so "rice" does not match "licorice",
  // "price", "ricotta", or "rice vinegar".
  function lineHits(line, chip) {
    const need = tokens(chip);
    if (!need.length) return false;
    const words = tokens(sl.parseLine(line).key);
    for (let i = 0; i < need.length; i++) if (words.indexOf(need[i]) === -1) return false;
    if (need.length === 1) {
      const rest = words.slice(words.indexOf(need[0]) + 1);
      if (rest.some((w) => COMPOUND.has(w))) return false;
    }
    return true;
  }

  function isDessert(recipe) {
    const cats = [];
    if (recipe && recipe.category) cats.push(recipe.category);
    if (recipe && Array.isArray(recipe.categories)) cats.push.apply(cats, recipe.categories);
    return cats.some((c) => String(c || "").trim().toLowerCase() === "dessert");
  }

  function timeOk(minutes, time) {
    const mode = String(time || "any").toLowerCase();
    if (mode === "any") return true;
    const t = Number(minutes) || 0;
    if (!t) return false;
    if (mode === "slow") return t >= 180;
    const cap = Number(mode);
    if (!cap) return true;
    return t <= cap;
  }

  function stillNeeded(lines, have, pantry) {
    return (lines || []).filter((line) => {
      if (have.some((chip) => lineHits(line, chip))) return false;
      const key = sl.parseLine(line).key;
      return !(key && sl.isStaple(key, pantry || []));
    });
  }

  function rank(recipes, haveIn, omitIn, pantry, opts) {
    opts = opts || {};
    const have = cleanList(haveIn);
    const omit = cleanList(omitIn);
    const hideDesserts = opts.hideDesserts !== false;
    const out = [];
    (recipes || []).forEach((r) => {
      if (!r || SHOP.has(String(r.slug || "").toLowerCase())) return;
      const lines = Array.isArray(r.lines) ? r.lines : [];
      if (!lines.length) return;
      if (hideDesserts && isDessert(r)) return;
      if (!timeOk(r.minutes, opts.time)) return;
      if (omit.some((chip) => lines.some((line) => lineHits(line, chip)))) return;
      const uses = have.filter((chip) => lines.some((line) => lineHits(line, chip)));
      if (!uses.length) return;
      const still = stillNeeded(lines, have, pantry);
      const minutes = Number(r.minutes) || 0;
      out.push({
        slug: r.slug,
        title: r.title || r.slug,
        minutes: minutes,
        category: r.category || "",
        uses: uses,
        still: still,
        stillCount: still.length,
      });
    });
    out.sort((a, b) =>
      (b.uses.length - a.uses.length) ||
      (a.stillCount - b.stillCount) ||
      ((a.minutes || 1e9) - (b.minutes || 1e9)) ||
      a.title.localeCompare(b.title) ||
      a.slug.localeCompare(b.slug));
    return typeof opts.limit === "number" ? out.slice(0, opts.limit) : out;
  }

  function decodeHtml(s) {
    return String(s || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'");
  }

  function catalogFromHtml(html) {
    const map = Object.create(null);
    const re = /<a\b([^>]*\bhref="([a-z0-9-]+)\.html"[^>]*)>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html || ""))) {
      const attrs = m[1];
      const slug = m[2].toLowerCase();
      if (SHOP.has(slug) || slug.indexOf("category-") === 0) continue;
      if (!/\bdata-cat="/.test(attrs) || /\bsplash-cat\b/.test(attrs)) continue;
      const catM = /\bdata-cat="([^"]*)"/.exec(attrs);
      const cat = catM ? decodeHtml(catM[1]).trim() : "";
      const titleM = /<span class="card-title">([\s\S]*?)<\/span>/.exec(m[3]);
      if (!titleM) continue;
      const title = decodeHtml(titleM[1]).replace(/\s+/g, " ").trim();
      if (!map[slug]) {
        map[slug] = { slug: slug, title: title, category: cat, categories: cat ? [cat] : [] };
      } else if (cat && map[slug].categories.indexOf(cat) === -1) {
        map[slug].categories.push(cat);
      }
    }
    return map;
  }

  function assemble(ingredients, meta, catalog) {
    const out = [];
    Object.keys(catalog || {}).forEach((slug) => {
      if (SHOP.has(slug)) return;
      const ing = ingredients && ingredients[slug];
      if (!ing || !Array.isArray(ing.i) || !ing.i.length) return;
      const card = catalog[slug] || {};
      const info = meta && meta[slug];
      out.push({
        slug: slug,
        title: card.title || ing.n || slug,
        category: card.category || "",
        categories: card.categories || (card.category ? [card.category] : []),
        minutes: info && Number(info.t) ? Number(info.t) : 0,
        lines: ing.i,
      });
    });
    return out;
  }

  function loadHave(storage) {
    try {
      const v = JSON.parse(storage.getItem(HAVE_KEY) || "null");
      if (!v || typeof v !== "object") return { have: [], omit: [] };
      return { have: cleanList(v.have), omit: cleanList(v.omit) };
    } catch (_) {
      return { have: [], omit: [] };
    }
  }

  function saveHave(storage, state) {
    const have = cleanList(state && state.have);
    const omit = cleanList(state && state.omit);
    try {
      storage.setItem(HAVE_KEY, JSON.stringify({ v: 1, have: have, omit: omit }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function staplesLine(pantry) {
    if (!pantry || !pantry.length) return STAPLES_LINE;
    const shown = pantry.slice(0, 6);
    const more = pantry.length > shown.length ? " +" + (pantry.length - shown.length) + " more" : "";
    return STAPLES_LINE + " Also saved on this device: " + shown.join(", ") + more + ".";
  }

  const core = {
    HAVE_KEY: HAVE_KEY, SHOW_LIMIT: SHOW_LIMIT, QUICK: QUICK, STAPLES_LINE: STAPLES_LINE,
    singular: singular, tokens: tokens, normKey: normKey, lineHits: lineHits, timeOk: timeOk,
    rank: rank, catalogFromHtml: catalogFromHtml, assemble: assemble,
    loadHave: loadHave, saveHave: saveHave, staplesLine: staplesLine,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = core;
    return;
  }
  root.CLTHaveFinder = core;
  if (!sl || typeof document === "undefined" || !document.querySelector("[data-have-app]")) return;

  const $ = (sel) => document.querySelector(sel);
  const state = { have: [], omit: [] };
  let recipeList = [];
  let pantry = [];
  let ready = false;
  let loadError = "";
  let activeTime = "any";

  function fmtTime(m) {
    m = Math.round(Number(m) || 0);
    if (!m) return "";
    if (m >= 1440) {
      const d = Math.round(m / 1440);
      return d + (d === 1 ? " day" : " days");
    }
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h ? h + " hr" + (r ? " " + r + " min" : "") : r + " min";
  }

  function cap(s) {
    s = String(s || "");
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }

  function persist() {
    saveHave(localStorage, state);
  }

  function addTo(kind, raw) {
    const label = cleanLabel(raw);
    const key = normKey(label);
    if (!key) return;
    const other = kind === "have" ? "omit" : "have";
    state[other] = state[other].filter((c) => normKey(c) !== key);
    if (!state[kind].some((c) => normKey(c) === key)) {
      if (state[kind].length >= 24) {
        const count = $("#have-count");
        if (count) count.textContent = "You can list up to 24 ingredients.";
        return;
      }
      state[kind].push(label);
    }
    persist();
    render();
  }

  function addMany(kind, raws) {
    let changed = false;
    raws.forEach((raw) => {
      const label = cleanLabel(raw);
      const key = normKey(label);
      if (!key) return;
      const other = kind === "have" ? "omit" : "have";
      const before = state[other].length;
      state[other] = state[other].filter((c) => normKey(c) !== key);
      if (state[other].length !== before) changed = true;
      if (!state[kind].some((c) => normKey(c) === key) && state[kind].length < 24) {
        state[kind].push(label);
        changed = true;
      }
    });
    if (changed) { persist(); render(); }
  }

  function removeKind(kind, key) {
    state[kind] = state[kind].filter((c) => normKey(c) !== key);
    persist();
    render();
  }

  function renderChips(listEl, items, kind) {
    if (!listEl) return;
    listEl.textContent = "";
    items.forEach((label) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "have-chip" + (kind === "omit" ? " is-omit" : "");
      b.dataset.key = normKey(label);
      b.setAttribute("aria-label", "Remove " + label);
      const text = document.createElement("span");
      text.textContent = label;
      const x = document.createElement("span");
      x.className = "have-chip-x";
      x.setAttribute("aria-hidden", "true");
      x.textContent = "\u00d7";
      b.appendChild(text);
      b.appendChild(x);
      li.appendChild(b);
      listEl.appendChild(li);
    });
  }

  function resultCard(r) {
    const art = document.createElement("article");
    art.className = "have-result";
    const h = document.createElement("h3");
    const a = document.createElement("a");
    a.href = r.slug + ".html";
    a.textContent = r.title;
    h.appendChild(a);
    art.appendChild(h);
    const meta = document.createElement("p");
    meta.className = "have-meta";
    if (r.minutes) {
      const tag = document.createElement("span");
      tag.className = "card-time";
      tag.textContent = fmtTime(r.minutes);
      meta.appendChild(tag);
    }
    if (r.category) {
      const cat = document.createElement("span");
      cat.className = "have-cat";
      cat.textContent = cap(r.category);
      meta.appendChild(cat);
    }
    art.appendChild(meta);
    const uses = document.createElement("p");
    uses.className = "have-uses";
    uses.textContent = "Uses: " + r.uses.join(", ");
    art.appendChild(uses);
    if (!r.stillCount) {
      const p = document.createElement("p");
      p.className = "have-need";
      p.textContent = "Still need: nothing else";
      art.appendChild(p);
    } else {
      const det = document.createElement("details");
      det.className = "have-still";
      const sum = document.createElement("summary");
      sum.textContent = "Still need: " + r.stillCount + (r.stillCount === 1 ? " item" : " items");
      det.appendChild(sum);
      const ul = document.createElement("ul");
      r.still.forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        ul.appendChild(li);
      });
      det.appendChild(ul);
      art.appendChild(det);
    }
    return art;
  }

  function renderResults() {
    const box = $("#have-results");
    const count = $("#have-count");
    if (!box || !count) return;
    box.textContent = "";
    if (!ready) {
      count.textContent = loadError || "Loading recipes\u2026";
      return;
    }
    if (!state.have.length) {
      count.textContent = "Add an ingredient you have. Two or three is enough \u2014 salt, oil, and the other staples are already assumed.";
      return;
    }
    const hide = $("#have-hide-dessert");
    const all = rank(recipeList, state.have, state.omit, pantry, {
      hideDesserts: !hide || hide.checked,
      time: activeTime,
    });
    const shown = all.slice(0, SHOW_LIMIT);
    if (!all.length) {
      count.textContent = "No recipes use those ingredients with these filters. Try fewer items, a longer time, or turn off Hide desserts.";
      return;
    }
    count.textContent = all.length > shown.length
      ? "Showing " + shown.length + " of " + all.length + " recipes"
      : all.length + (all.length === 1 ? " recipe" : " recipes");
    shown.forEach((r) => box.appendChild(resultCard(r)));
  }

  function render() {
    renderChips($("#have-chips"), state.have, "have");
    renderChips($("#omit-chips"), state.omit, "omit");
    document.querySelectorAll("[data-quick]").forEach((b) => {
      const on = state.have.some((c) => normKey(c) === normKey(b.getAttribute("data-quick")));
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("is-active", on);
    });
    const staples = $("#have-staples");
    if (staples) staples.textContent = staplesLine(pantry);
    renderResults();
  }

  function wireInput(input, kind) {
    if (!input) return;
    input.addEventListener("keydown", (e) => {
      if (e.key === ",") {
        e.preventDefault();
        addTo(kind, input.value);
        input.value = "";
      } else if (e.key === "Backspace" && !input.value && state[kind].length) {
        removeKind(kind, normKey(state[kind][state[kind].length - 1]));
      }
    });
    input.addEventListener("input", () => {
      if (input.value.indexOf(",") === -1) return;
      const parts = input.value.split(",");
      const rest = parts.pop();
      addMany(kind, parts);
      input.value = rest.replace(/^\s+/, "");
    });
  }

  function onSubmit(form, input, kind) {
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      addTo(kind, input ? input.value : "");
      if (input) input.value = "";
    });
  }

  const haveInput = $("#have-input");
  const omitInput = $("#omit-input");
  wireInput(haveInput, "have");
  wireInput(omitInput, "omit");
  onSubmit($("#have-form"), haveInput, "have");
  onSubmit($("#omit-form"), omitInput, "omit");

  $("#have-chips").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !b.dataset.key) return;
    removeKind("have", b.dataset.key);
    if (haveInput) haveInput.focus();
  });
  $("#omit-chips").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !b.dataset.key) return;
    removeKind("omit", b.dataset.key);
    if (omitInput) omitInput.focus();
  });
  document.querySelectorAll("[data-quick]").forEach((b) => {
    b.addEventListener("click", () => {
      const label = b.getAttribute("data-quick");
      const key = normKey(label);
      if (state.have.some((c) => normKey(c) === key)) removeKind("have", key);
      else addTo("have", label);
    });
  });
  document.querySelectorAll("[data-have-time]").forEach((b) => {
    b.addEventListener("click", () => {
      activeTime = b.getAttribute("data-have-time") || "any";
      document.querySelectorAll("[data-have-time]").forEach((c) => {
        const on = c === b;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      renderResults();
    });
  });
  const hideBox = $("#have-hide-dessert");
  if (hideBox) hideBox.addEventListener("change", renderResults);
  $("#have-clear").addEventListener("click", () => {
    state.have = [];
    state.omit = [];
    try { localStorage.removeItem(HAVE_KEY); } catch (_) {}
    if (haveInput) haveInput.value = "";
    if (omitInput) omitInput.value = "";
    render();
    if (haveInput) haveInput.focus();
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== HAVE_KEY) return;
    const next = loadHave(localStorage);
    state.have = next.have;
    state.omit = next.omit;
    render();
  });

  try { pantry = sl.loadPantry(localStorage); } catch (_) { pantry = []; }
  const saved = loadHave(localStorage);
  state.have = saved.have;
  state.omit = saved.omit;
  render();

  Promise.all([
    fetch("ingredients.json").then((r) => { if (!r.ok) throw new Error("ingredients"); return r.json(); }),
    fetch("recipe-meta.json").then((r) => { if (!r.ok) throw new Error("meta"); return r.json(); }),
    fetch("recipes.html").then((r) => { if (!r.ok) throw new Error("recipes"); return r.text(); }),
  ]).then(([ingredients, meta, html]) => {
    recipeList = assemble(ingredients, meta, catalogFromHtml(html));
    ready = true;
    render();
  }).catch(() => {
    loadError = "Couldn't load the recipe list. Reload this page once you're online.";
    ready = false;
    render();
  });
})(typeof window !== "undefined" ? window : globalThis);
