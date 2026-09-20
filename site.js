(function () {
  const input = document.querySelector("#recipe-search");
  const meta = document.querySelector("#search-meta");
  const chips = Array.from(document.querySelectorAll("[data-filter-cat]"));
  if (!input && !chips.length) return;

  const cards = Array.from(document.querySelectorAll(".book-list a"));
  const sections = Array.from(document.querySelectorAll(".book-section"));
  let activeCat = "all";

  const update = () => {
    const q = (input?.value || "").trim().toLowerCase();
    let shown = 0;
    cards.forEach((a) => {
      const hay = (a.dataset.search || a.textContent).toLowerCase();
      const cat = (a.dataset.cat || "").toLowerCase();
      const matchQ = !q || hay.includes(q);
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
      if (activeCat !== "all") bits.push(activeCat);
      if (q) bits.push("“" + (input?.value || "").trim() + "”");
      meta.textContent = bits.length
        ? shown + " recipe" + (shown === 1 ? "" : "s") + " · " + bits.join(" · ")
        : cards.length + " recipes";
    }
  };

  input?.addEventListener("input", update);
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      activeCat = chip.getAttribute("data-filter-cat") || "all";
      chips.forEach((c) => c.classList.toggle("is-active", c === chip));
      update();
    });
  });
  update();
})();
