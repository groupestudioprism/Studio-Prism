/* Studio Prism — TÉLÉCHARGEMENTS réservés aux administrateurs (script classique, chargé après js/account.js).
 *
 *  - #/admin/telechargements : onglet « Téléchargements » de l'administration (APK Android d'ARCHIVISION pour l'instant) ;
 *  - page ArchiVision (#/archivision) : encart « Version Android » affiché aux seuls administrateurs connectés.
 *
 * TÉLÉCHARGEMENT DIRECT : « Télécharger l'APK » ouvre une fenêtre de confirmation, puis « Autoriser le téléchargement »
 * enregistre le fichier directement sur l'appareil (plus de passage par Google Drive). L'APK est servi par ce même site
 * (dossier telechargements/), donc le navigateur l'enregistre au lieu de l'ouvrir. Version, date et taille sont lues dans
 * telechargements/archivision.json ; sans réponse, les valeurs de secours ci-dessous s'affichent.
 *
 * Attention : un fichier publié sur GitHub Pages est téléchargeable par toute personne qui a le lien. Le bouton n'est montré
 * qu'aux administrateurs, mais c'est l'APK lui-même qui protège l'app (connexion Studio Prism + licence ARCHIVISION).
 *
 * NOUVELLE VERSION : remplacer telechargements/ArchiVision.apk (même nom) et mettre à jour version, date et taille (en octets)
 * dans telechargements/archivision.json. Rien d'autre à modifier. */
(function () {
  'use strict';
  const K = window.SP && window.SP.kit;
  if (!K) return;
  const { st, esc } = K;

  const FILES = [{
    id: 'archivision-android',
    name: 'ArchiVision · Android',
    desc: 'Application Android (APK) : maquettes BIM en visite 3D et en réalité augmentée (ARCore), compte Studio Prism, licence et stockage intégrés.',
    asset: 'ArchiVision.apk', info: 'telechargements/archivision.json',
    version: '1.0.0', date: '15/10/2026', size: '≈ 39 Mo',       // valeurs de secours si l'API GitHub ne répond pas
    needs: 'Téléphone ou tablette Android 8.0 ou plus récent. Réalité augmentée : appareil compatible ARCore.'
  }];
  FILES.forEach((f) => { f.url = 'telechargements/' + f.asset; });

  /* Version publiée : lue une fois par visite dans le fichier d'informations (même site, sans cache). */
  const mo = (b) => (b / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';
  function refresh(f) {
    if (f._p) return f._p;
    f._p = fetch(f.info + '?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        if (j.version) f.version = String(j.version);
        if (j.date) f.date = new Date(j.date + 'T12:00:00').toLocaleDateString('fr-FR');
        if (j.size) f.size = mo(+j.size);
        if (j.file) { f.file = j.file; f.url = 'telechargements/' + encodeURIComponent(j.file) + '?v=' + encodeURIComponent(f.version); }
        document.querySelectorAll(`[data-dl-meta="${f.id}"]`).forEach((el) => { el.textContent = meta(f); });
      })
      .catch(() => {});
    return f._p;
  }
  const meta = (f) => `Version ${f.version} · ${f.date} · ${f.size}`;

  const isAdmin = () => st.auth.status === 'in' && !!st.auth.profile && st.auth.profile.role === 'admin';
  const how = '<p class="mut dl-how">Le fichier se télécharge directement sur l’appareil, après confirmation. ' +
    'Sur un téléphone Android : ouvrir ArchiVision.apk depuis les téléchargements, puis autoriser « Installer des applis inconnues » si Android le demande.</p>';
  const btn = (f) => `<button type="button" class="btn b1" data-a="dl-ask" data-id="${esc(f.id)}">Télécharger l’APK</button>`;

  /* Clic → fenêtre de confirmation → téléchargement direct. */
  A['dl-ask'] = (b) => {
    const f = FILES.find((x) => x.id === b.dataset.id); if (!f) return;
    if (!isAdmin()) return;
    refresh(f).then(() => modal(`<h3>Télécharger ${esc(f.name)} ?</h3>
      <p class="mut" data-dl-meta="${esc(f.id)}">${esc(meta(f))}</p>
      <p>Le fichier <b>${esc(f.file || f.asset)}</b> va être enregistré sur cet appareil.</p>
      <p class="mut dl-how">Android : une fois téléchargé, ouvrez-le et autorisez l’installation si le téléphone le demande. Sur ordinateur, transférez-le ensuite sur le téléphone.</p>
      <p class="dl-act"><button type="button" class="btn b1" data-a="dl-go" data-id="${esc(f.id)}">Autoriser le téléchargement</button></p>`));
  };
  A['dl-go'] = (b) => {
    const f = FILES.find((x) => x.id === b.dataset.id); if (!f) return;
    A.x();
    const a = document.createElement('a');
    a.href = f.url; a.download = f.file || f.asset; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const card = (f) => `<div class="panel dl-card">
    <div class="dl-h"><h3>${esc(f.name)}</h3><span class="bd bd-admin">Administrateurs</span></div>
    <p>${esc(f.desc)}</p>
    <p class="mut" data-dl-meta="${esc(f.id)}">${esc(meta(f))}</p>
    <p class="mut">${esc(f.needs)}</p>
    <p class="dl-act">${btn(f)}</p>${how}</div>`;

  function tab(p, shell) {
    FILES.forEach(refresh);
    V(shell(`<h2 class="dl-t">Téléchargements</h2><p class="lead">Versions internes des applications Studio Prism, réservées aux administrateurs pour l’instant.</p><div class="dl-list">${FILES.map(card).join('')}</div>`));
  }
  Object.assign(R, { 'admin/telechargements': () => K.adminGate('downloads', tab) });

  /* Encart sur la page ArchiVision : ajouté après chaque affichage de la page, et retiré dès que ce n'est plus un administrateur. */
  function deco() {
    const v = document.getElementById('v'); if (!v) return;
    const old = v.querySelector('.dl-adm');
    if (CUR !== 'archivision' || !isAdmin()) { if (old) old.remove(); return; }
    if (old) return;
    const w = v.querySelector('.pg .w') || v.querySelector('.w'); if (!w) return;
    const f = FILES[0], d = document.createElement('div');
    refresh(f);
    d.className = 'panel dl-adm';
    d.innerHTML = `<div class="dl-h"><h3>Version Android</h3><span class="bd bd-admin">Administrateurs</span></div>
      <p class="mut">ArchiVision pour téléphone et tablette Android · <span data-dl-meta="${esc(f.id)}">${esc(meta(f))}</span></p>
      <p class="dl-act">${btn(f)} <a class="btn b4" href="#/admin/telechargements">Tous les téléchargements</a></p>${how}`;
    const ref = w.children[1] || null; w.insertBefore(d, ref);
  }
  new MutationObserver(deco).observe(document.getElementById('v'), { childList: true });
  K.loadAuth().then((api) => api.subscribe(() => setTimeout(deco, 0))).catch(() => {});
})();
