(function () {
  const input = document.querySelector("#recipe-search");
  const meta = document.querySelector("#search-meta");
  if (!input) return;

  const cards = Array.from(document.querySelectorAll(".book-list a"));
  const sections = Array.from(document.querySelectorAll(".book-section"));

  const update = () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    cards.forEach((a) => {
      const hay = (a.dataset.search || a.textContent).toLowerCase();
      const match = !q || hay.includes(q);
      a.parentElement.hidden = !match;
      if (match) shown += 1;
    });
    sections.forEach((sec) => {
      const any = Array.from(sec.querySelectorAll(".book-list li")).some((li) => !li.hidden);
      sec.classList.toggle("is-empty", !any);
    });
    if (meta) {
      meta.textContent = q
        ? shown + " recipe" + (shown === 1 ? "" : "s") + " match " + input.value.trim() + ""
        : cards.length + " recipes";
    }
  };

  input.addEventListener("input", update);
  update();
})();
