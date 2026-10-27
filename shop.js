/* Lowcountry Table Bakery draft shop: preselect item from ?item= and keep pickup to weekends. */
(function () {
  "use strict";
  var form = document.querySelector("[data-shop-form]");
  if (!form) return;
  var item = new URLSearchParams(location.search).get("item");
  if (item) {
    var input = form.querySelector('input[data-item="' + item.replace(/[^a-z-]/g, "") + '"]');
    if (input) {
      if (!+input.value) input.value = 1;
      var row = input.closest(".shop-qty-row");
      if (row) row.classList.add("is-picked");
    }
  }
  var date = form.querySelector("[data-weekend-date]");
  var msg = form.querySelector("[data-date-msg]");
  if (date) {
    var d = new Date(); d.setDate(d.getDate() + 3);
    date.min = d.toISOString().slice(0, 10);
    date.addEventListener("change", function () {
      var day = new Date(date.value + "T12:00:00").getDay();
      var ok = !date.value || day === 0 || day === 6;
      date.setCustomValidity(ok ? "" : "Pickup is Saturday or Sunday only.");
      if (msg) msg.textContent = ok ? "" : "Pickup is Saturday or Sunday only.";
    });
  }
  form.addEventListener("submit", function (e) {
    var btn = form.querySelector(".shop-submit");
    if (btn && btn.disabled) { e.preventDefault(); return; }
    var any = Array.prototype.some.call(form.querySelectorAll("input[data-item]"), function (i) { return +i.value > 0; });
    if (!any) { e.preventDefault(); if (msg) msg.textContent = "Add at least one item."; }
  });
})();
