// Install public PWA shell only. This module does not claim notifications or SSO are available.
(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', {scope:'/'})
      .catch(() => { /* Keep site usable in browsers where offline mode is unsupported. */ });
  }, {once:true});
})();
