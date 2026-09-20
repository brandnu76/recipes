(function () {
  const article = document.querySelector(".hrecipe, .h-recipe");
  if (!article) return;

  const ingredients = Array.from(article.querySelectorAll("ul li"));
  const steps = Array.from(article.querySelectorAll("ol li"));

  ingredients.forEach((li) => {
    li.setAttribute("role", "checkbox");
    li.setAttribute("aria-checked", "false");
    li.tabIndex = 0;
    const toggle = () => {
      const on = li.classList.toggle("is-checked");
      li.setAttribute("aria-checked", on ? "true" : "false");
    };
    li.addEventListener("click", toggle);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  });

  steps.forEach((li) => {
    li.style.cursor = "pointer";
    li.title = "Tap to mark done";
    li.addEventListener("click", () => li.classList.toggle("is-done"));
  });

  const copyBtn = document.querySelector("[data-action='copy-ingredients']");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const text = ingredients.map((li) => li.textContent.trim()).join("\n");
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.classList.add("is-success");
        copyBtn.textContent = "Copied";
        setTimeout(() => {
          copyBtn.classList.remove("is-success");
          copyBtn.textContent = "Copy ingredients";
        }, 1600);
      } catch (_) {
        copyBtn.textContent = "Copy failed";
      }
    });
  }

  const backTop = document.querySelector(".back-top");
  if (backTop) {
    const onScroll = () => {
      backTop.classList.toggle("is-visible", window.scrollY > 480);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
})();
