/* Studio Prism — liens vers l'ancienne adresse du site (kmauger18.github.io) : redirigés vers le site actuel (groupestudioprism).
 * Les contenus enregistrés dans Firestore (pages, produits, projets) peuvent encore contenir l'ancienne adresse : on la corrige à
 * l'affichage, pour tous les visiteurs, sans toucher aux données. Un lien vers une page du site devient un lien interne (#/…). */
(function () {
  'use strict';
  const OLD = /^https?:\/\/kmauger18\.github\.io\/?/i;
  const SITE_PATH = /^https?:\/\/kmauger18\.github\.io\/Studio-Prism\/?(index\.html)?/i;
  const NEW_ORIGIN = 'https://groupestudioprism.github.io/';
  function fix(a) {
    const h = a.getAttribute('href') || '';
    if (!OLD.test(h)) return;
    const m = h.replace(SITE_PATH, '');
    if (m !== h && (m === '' || m.startsWith('#'))) { a.setAttribute('href', m || '#/'); a.removeAttribute('target'); a.removeAttribute('rel'); return; }
    a.setAttribute('href', h.replace(OLD, NEW_ORIGIN));
  }
  const scan = (root) => { if (root && root.querySelectorAll) root.querySelectorAll('a[href*="kmauger18"]').forEach(fix); };
  scan(document);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches && n.matches('a[href*="kmauger18"]')) fix(n); scan(n); } })))
    .observe(document.documentElement, { childList: true, subtree: true });
  // dernier filet : un clic sur un lien encore ancien est redirigé
  document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[href*="kmauger18"]'); if (a) fix(a); }, true);
})();
