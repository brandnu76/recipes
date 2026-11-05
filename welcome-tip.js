/* Carroll Lowcountry Table — help chrome + one-time welcome tip.
   Dismissal and "visited help" live in localStorage (this device only). */
(function () {
  "use strict";
  var KEY = "clt:welcome-tip-seen";
  var HELP = /(?:^|\/)help\.html(?:$|[?#])/i;

  function seen() {
    try { return window.localStorage.getItem(KEY) === "1"; } catch (e) { return true; }
  }
  function markSeen() {
    try { window.localStorage.setItem(KEY, "1"); } catch (e) {}
  }

  function ensureHelpChrome() {
    var header = document.querySelector(".site-header");
    if (header && !header.querySelector('a[href="help.html"]')) {
      var row = header.querySelector(".site-nav-row");
      if (!row) {
        var existing = header.querySelector("a.site-nav");
        row = document.createElement("nav");
        row.className = "site-nav-row";
        row.setAttribute("aria-label", "Site");
        if (existing) {
          existing.replaceWith(row);
          row.appendChild(existing);
        } else {
          header.appendChild(row);
        }
      }
      var help = document.createElement("a");
      help.className = "site-nav";
      help.href = "help.html";
      help.textContent = "Help";
      if (HELP.test(location.pathname) || HELP.test(location.href)) {
        help.setAttribute("aria-current", "page");
      }
      row.appendChild(help);
    }
    var foot = document.querySelector(".footer-links");
    if (foot && !foot.querySelector('a[href="help.html"]')) {
      var a = document.createElement("a");
      a.href = "help.html";
      a.textContent = "How to use this site";
      foot.insertBefore(a, foot.firstChild);
      foot.insertBefore(document.createTextNode(" · "), a.nextSibling);
    }
  }

  function buildTip() {
    if (document.getElementById("welcome-tip")) return;
    if (document.body && document.body.classList.contains("no-welcome-tip")) return;
    if (HELP.test(location.pathname) || HELP.test(location.href)) {
      markSeen();
      return;
    }
    if (seen()) return;

    var tip = document.createElement("aside");
    tip.id = "welcome-tip";
    tip.className = "welcome-tip";
    tip.setAttribute("role", "status");
    tip.setAttribute("aria-live", "polite");
    tip.setAttribute("aria-label", "Site tip");

    var text = document.createElement("p");
    text.className = "welcome-tip-text";
    text.innerHTML = 'New here? <a class="welcome-tip-link" href="help.html">See how to use the site</a>.';

    var close = document.createElement("button");
    close.type = "button";
    close.className = "welcome-tip-close";
    close.setAttribute("aria-label", "Dismiss tip");
    close.textContent = "\u00d7";
    close.addEventListener("click", function () {
      markSeen();
      tip.classList.add("is-dismissed");
      window.setTimeout(function () {
        if (tip.parentNode) tip.parentNode.removeChild(tip);
      }, 220);
    });

    tip.appendChild(text);
    tip.appendChild(close);
    var header = document.querySelector(".site-header");
    if (header && header.parentNode) header.insertAdjacentElement("afterend", tip);
    else document.body.insertBefore(tip, document.body.firstChild);
  }

  function boot() {
    ensureHelpChrome();
    if (HELP.test(location.pathname) || HELP.test(location.href)) markSeen();
    else buildTip();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
