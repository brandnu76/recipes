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

(function () {
  const input = document.querySelector("#recipe-search");
  const meta = document.querySelector("#search-meta");
  if (meta) {
    meta.setAttribute("aria-live", "polite");
    meta.setAttribute("aria-atomic", "true");
  }
  const chips = Array.from(document.querySelectorAll("[data-filter-cat]"));
  if (!input && !chips.length) return;

  const cards = Array.from(document.querySelectorAll(".book-list a"));
  const sections = Array.from(document.querySelectorAll(".book-section"));
  let activeCat = "all";
  let activeLabel = "";

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
      const matchC = activeCat === "all" || cat === activeCat;
      const match = matchQ && matchC;
      a.parentElement.hidden = !match;
      if (match) shown += 1;
    });
    sections.forEach((sec) => {
      const any = Array.from(sec.querySelectorAll(".book-list li")).some((li) => !li.hidden);
      sec.classList.toggle("is-empty", !any);
    });
    if (meta) {
      const bits = [];
      if (activeLabel) bits.push(activeLabel);
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

  input?.addEventListener("input", update);
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      activeCat = (chip.getAttribute("data-filter-cat") || "all").toLowerCase();
      activeLabel = activeCat === "all" ? "" : chip.textContent.trim();
      chips.forEach((c) => c.classList.toggle("is-active", c === chip));
      update();
    });
  });
  update();
})();
