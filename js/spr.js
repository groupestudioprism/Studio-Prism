/* Studio Prism — adresses des pages : vraies URL (/produits/archiphase) au lieu de #/produits/archiphase.
 * Google ignore tout ce qui suit « # » : avec des adresses en #/, il ne voyait qu'une seule page du site.
 * - Les liens du code restent écrits « #/page » : le clic est intercepté par app.js, qui affiche l'adresse /page.
 * - Une ancienne adresse en #/… (favori, lien partagé) est convertie en /… au chargement.
 * - GitHub Pages sert le fichier pré-rendu de chaque page publique (tools/build_pages.py) ou 404.html (même application). */
(function () {
  'use strict';
  var h = location.hash;
  if (h.length > 1 && h.charAt(1) === '/') {
    try { history.replaceState(null, '', '/' + h.slice(2).replace(/^\/+/, '')); } catch (e) { /* navigateur ancien */ }
  }
  function route() {
    var p = location.pathname;
    try { p = decodeURI(p); } catch (e) { /* adresse mal encodée */ }
    return p.replace(/^\/+/, '').replace(/(^|\/)index\.html$/, '').replace(/\/+$/, '') + location.search;
  }
  function url(x) { return '/' + String(x == null ? '' : x).replace(/^#?\/*/, ''); }
  function go(x) {
    var k = String(x == null ? '' : x).replace(/^#?\/*/, '');
    if (k === route()) return;
    try { history.pushState(null, '', url(k)); } catch (e) { location.href = url(k); return; }
    // même effet qu'un changement de location.hash : popstate puis hashchange
    dispatchEvent(new PopStateEvent('popstate', { state: null }));
    var ev; try { ev = new HashChangeEvent('hashchange'); } catch (e) { ev = new Event('hashchange'); }
    dispatchEvent(ev);
  }
  window.SPR = { route: route, hash: function () { return '#/' + route(); }, url: url, go: go,
    href: function (a) { var v = a && a.getAttribute('href') || ''; return a && a.hasAttribute('data-spr') && v.charAt(0) === '/' ? '#' + v : v; } };
})();
