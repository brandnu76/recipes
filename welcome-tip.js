/* Carroll Lowcountry Table — one-time welcome tip for first-time visitors.
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

  if (HELP.test(location.pathname) || HELP.test(location.href)) {
    markSeen();
    return;
  }
  if (seen()) return;
  if (document.body && document.body.classList.contains("no-welcome-tip")) return;

  function build() {
    if (document.getElementById("welcome-tip")) return;
    var tip = document.createElement("aside");
    tip.id = "welcome-tip";
    tip.className = "welcome-tip";
    tip.setAttribute("role", "status");
    tip.setAttribute("aria-live", "polite");
    tip.setAttribute("aria-label", "Site tip");

    var text = document.createElement("p");
    text.className = "welcome-tip-text";
    text.id = "welcome-tip-text";
    text.innerHTML = 'New here? <a class="welcome-tip-link" href="help.html">See how to use the site</a>.';

    var close = document.createElement("button");
    close.type = "button";
    close.className = "welcome-tip-close";
    close.setAttribute("aria-label", "Dismiss tip");
    close.textContent = "\u00d7";

    function dismiss() {
      markSeen();
      tip.classList.add("is-dismissed");
      window.setTimeout(function () {
        if (tip.parentNode) tip.parentNode.removeChild(tip);
      }, 220);
    }
    close.addEventListener("click", dismiss);

    tip.appendChild(text);
    tip.appendChild(close);

    var header = document.querySelector(".site-header");
    if (header && header.parentNode) {
      header.insertAdjacentElement("afterend", tip);
    } else {
      document.body.insertBefore(tip, document.body.firstChild);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
