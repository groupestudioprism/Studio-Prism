/* Studio Prism — page Équipe : photos et descriptions lues dans le dossier Profil/ du dépôt (Kéliann.jpg, Paul.jpg, description.txt). */
(function () {
  'use strict';
  const NAMES = { 'Kéliann': ['Kéliann', 'Keliann', 'Kéliann'], 'Paul': ['Paul'] }, EXT = ['jpg', 'jpeg', 'png', 'webp'];
  let desc = null;
  const loadDesc = () => desc ? Promise.resolve(desc) : fetch('Profil/description.txt?t=' + Math.floor(Date.now() / 600000), { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => '').then((t) => {
    desc = {}; String(t).split(/\r?\n/).forEach((l) => { const m = /^\s*([^:]+?)\s*:\s*(.*)$/.exec(l); if (m && m[2].replace(/[….\s]/g, '')) desc[m[1].toLowerCase()] = m[2].trim(); }); return desc; });
  const tryImg = (names) => new Promise((res) => {
    const list = []; names.forEach((n) => EXT.forEach((e) => list.push(`Profil/${encodeURIComponent(n)}.${e}`)));
    (function next(i) { if (i >= list.length) return res(''); const im = new Image(); im.onload = () => res(list[i]); im.onerror = () => next(i + 1); im.src = list[i]; })(0);
  });
  async function enhance() {
    document.querySelectorAll('#v .team .tm:not([data-pf])').forEach(async (tm) => {
      tm.dataset.pf = '1';
      const h = tm.querySelector('h3'); if (!h) return;
      const first = h.textContent.trim().split(/\s+/)[0], key = Object.keys(NAMES).find((k) => k.toLowerCase() === first.toLowerCase()) || first;
      const [d, img] = await Promise.all([loadDesc(), tryImg(NAMES[key] || [first])]);
      const fig = tm.querySelector('figure.ph');
      if (img && fig) fig.innerHTML = `<img src="${img}" alt="${h.textContent.trim()}" loading="lazy" style="width:100%;height:100%;object-fit:cover">`;
      const text = d[key.toLowerCase()] || d[first.toLowerCase()] || (key === 'Kéliann' && d.keliann);
      if (text) { const p = document.createElement('p'); p.className = 'mt2'; p.textContent = text; tm.appendChild(p); }
    });
  }
  const v = document.getElementById('v');
  if (v) { new MutationObserver(enhance).observe(v, { childList: true, subtree: true }); enhance(); }
})();
