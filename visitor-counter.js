// Site-wide visitor count (Abacus free counter, no cookies, no tracking).
// Counts once per browser session; hides itself quietly if the service fails.
(function () {
  "use strict";
  var footer = document.querySelector(".site-footer");
  if (!footer) return;
  var base = "https://abacus.jasoncameron.dev/";
  var key = "brandnu76-recipes/visits";
  var flag = "clt-visit-counted";
  var counted = false;
  try { counted = sessionStorage.getItem(flag) === "1"; } catch (e) {}
  var url = base + (counted ? "get/" : "hit/") + key;
  var ctrl = typeof AbortController === "function" ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 5000);
  fetch(url, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); })
    .then(function (d) {
      clearTimeout(timer);
      var n = d && Number(d.value);
      if (!isFinite(n) || n < 1) return;
      if (!counted) { try { sessionStorage.setItem(flag, "1"); } catch (e) {} }
      var p = document.createElement("p");
      p.className = "footer-visitors";
      p.setAttribute("aria-live", "polite");
      p.textContent = "Visitors: " + n.toLocaleString("en-US");
      footer.appendChild(p);
    })
    .catch(function () { clearTimeout(timer); });
})();
