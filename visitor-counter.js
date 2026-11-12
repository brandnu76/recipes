// Load the welcome tip / Help chrome helper when the page did not include it.
// Kept so older cached pages that still request this file do not break, and
// so they no longer call the retired visitor-count service.
(function () {
  if (document.querySelector('script[src="welcome-tip.js"]')) return;
  var s = document.createElement("script");
  s.src = "welcome-tip.js";
  s.defer = true;
  document.head.appendChild(s);
})();
