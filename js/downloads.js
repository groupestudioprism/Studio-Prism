/* Studio Prism — TÉLÉCHARGEMENTS réservés aux administrateurs (script classique, chargé après js/account.js).
 *
 *  - #/admin/telechargements : onglet « Téléchargements » de l'administration (APK Android : app Unity ARCHIVISION, applications web
 *    des gammes Archi et SPECTRA, et l'application d'administration Studio Prism Admin) ;
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
 },
  /* Applications Android « web » (Trusted Web Activity, signées Studio Prism) : chacune ouvre l'app en ligne en plein écran,
     joue l'animation d'ouverture et se met à jour avec le site. Sources et clé de signature : hors dépôt (voir le LISEZMOI des sources). */
  {
    id: 'admin-android', name: 'Studio Prism Admin · Android', asset: 'Studio-Prism-Admin.apk', version: '1.0.0', date: '12/11/2026', size: '≈ 0,6 Mo',
    desc: 'Application d’administration du site : tableau de bord, comptes, licences, offres, contenus et téléchargements, sur téléphone.',
    needs: 'Android 5.0 ou plus récent, avec Google Chrome. L’app s’ouvre en plein écran et suit automatiquement les mises à jour du site.'
  },
  {
    id: 'archiplan-android', name: 'ARCHIPLAN · Android', asset: 'ARCHIPLAN.apk', version: '1.0.0', date: '12/11/2026', size: '≈ 0,6 Mo',
    desc: 'Le modeleur BIM sur téléphone et tablette : plan, 3D, parois, vérifications, métré et exports.',
    needs: 'Android 5.0 ou plus récent, avec Google Chrome. L’app s’ouvre en plein écran et suit automatiquement les mises à jour du site.'
  },
  {
    id: 'archivision-web-android', name: 'ARCHIVISION Web · Android', asset: 'ARCHIVISION-Web.apk', version: '1.0.0', date: '12/11/2026', size: '≈ 0,6 Mo',
    desc: 'La visionneuse de maquettes (GLB, IFC) en version web installée : visite 3D, données BIM et réalité augmentée WebXR. Peut cohabiter avec l’app Unity ci-dessus.',
    needs: 'Android 5.0 ou plus récent, avec Google Chrome. L’app s’ouvre en plein écran et suit automatiquement les mises à jour du site. Réalité augmentée : appareil compatible ARCore.'
  },
  {
    id: 'architrafic-android', name: 'ARCHITRAFIC · Android', asset: 'ARCHITRAFIC.apk', version: '1.0.0', date: '12/11/2026', size: '≈ 0,6 Mo',
    desc: 'Préparation de la circulation autour des chantiers : routes barrées, déviations, panneaux, mode terrain.',
    needs: 'Android 5.0 ou plus récent, avec Google Chrome. L’app s’ouvre en plein écran et suit automatiquement les mises à jour du site.'
  },
  {
    id: 'spectrawriter-android', name: 'SPECTRA Writer · Android', asset: 'SPECTRA-Writer.apk', version: '1.0.0', date: '12/11/2026', size: '≈ 0,6 Mo',
    desc: 'Le traitement de texte de la gamme SPECTRA.',
    needs: 'Android 5.0 ou plus récent, avec Google Chrome. L’app s’ouvre en plein écran et suit automatiquement les mises à jour du site.'
  },
  {
    id: 'spectracalc-android', name: 'SPECTRA Calc · Android', asset: 'SPECTRA-Calc.apk', version: '1.0.0', date: '12/11/2026', size: '≈ 0,6 Mo',
    desc: 'Le tableur de la gamme SPECTRA.',
    needs: 'Android 5.0 ou plus récent, avec Google Chrome. L’app s’ouvre en plein écran et suit automatiquement les mises à jour du site.'
  },
  {
    id: 'spectraslide-android', name: 'SPECTRA Slide · Android', asset: 'SPECTRA-Slide.apk', version: '1.0.0', date: '12/11/2026', size: '≈ 0,6 Mo',
    desc: 'Le logiciel de présentation de la gamme SPECTRA.',
    needs: 'Android 5.0 ou plus récent, avec Google Chrome. L’app s’ouvre en plein écran et suit automatiquement les mises à jour du site.'
  },
  {
    id: 'spectramotion-android', name: 'SPECTRA Motion · Android', asset: 'SPECTRA-Motion.apk', version: '1.0.0', date: '12/11/2026', size: '≈ 0,6 Mo',
    desc: 'Le studio de création : design, photo, vidéo, animation et audio.',
    needs: 'Android 5.0 ou plus récent, avec Google Chrome. L’app s’ouvre en plein écran et suit automatiquement les mises à jour du site.'
  }
  ];
  FILES.forEach((f) => { f.url = 'telechargements/' + f.asset; });

  /* Version publiée : lue une fois par visite dans le fichier d'informations (même site, sans cache). */
  const mo = (b) => (b / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';
  function refresh(f) {
    if (f._p) return f._p;
    if (!f.info) return (f._p = Promise.resolve());
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
  const meta = (f) => f.version ? `Version ${f.version} · ${f.date} · ${f.size}` : `${f.date} · ${f.size}`;

  const isAdmin = () => st.auth.status === 'in' && !!st.auth.profile && st.auth.profile.role === 'admin';
  const how = '<p class="mut dl-how">Le fichier se télécharge directement sur l’appareil, après confirmation. ' +
    'Sur un téléphone Android : ouvrir le fichier .apk depuis les téléchargements, puis autoriser « Installer des applis inconnues » si Android le demande.</p>';
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
    <p class="mut" data-dl-meta="${esc(f.id)}">${esc(meta2(f))}</p>
    <p class="mut">${esc(f.needs)}</p>
    <p class="dl-act">${btn(f)}</p>${how}</div>`;

  /* Liste AUTOMATIQUE : tous les .apk du dossier telechargements/ du dépôt GitHub (API publique « contents »), à défaut le manifeste
     telechargements/manifest.json (généré par le workflow GitHub Actions « Manifeste des téléchargements »). Aucune liste à tenir à jour. */
  const REPO = 'groupestudioprism/studio-prism';
  const slug = (n) => String(n).toLowerCase().replace(/\.apk$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  async function discover() {
    let list = null;
    try { const r = await fetch(`https://api.github.com/repos/${REPO}/contents/telechargements`, { headers: { Accept: 'application/vnd.github+json' } }); if (r.ok) list = (await r.json()).filter((x) => x.type === 'file' && /\.apk$/i.test(x.name)).map((x) => ({ name: x.name, size: x.size })); } catch (e) { /* hors ligne ou limite atteinte */ }
    if (!list) { try { const r = await fetch('telechargements/manifest.json?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) list = (await r.json()).files || []; } catch (e) { /* ignore */ } }
    if (!list) return;
    list.forEach((x) => {
      let f = FILES.find((y) => y.asset.toLowerCase() === x.name.toLowerCase());
      if (!f) { f = { id: 'apk-' + slug(x.name), name: x.name.replace(/\.apk$/i, '').replace(/[_-]+/g, ' '), desc: 'Application Android (APK) déposée dans le dossier telechargements/ du site.', asset: x.name, version: '', date: x.date ? new Date(x.date).toLocaleDateString('fr-FR') : '—', size: mo(x.size), needs: 'Téléphone ou tablette Android.', auto: true }; FILES.push(f); }
      else if (x.size && !f.info) f.size = mo(x.size);
      f.url = 'telechargements/' + encodeURIComponent(x.name) + '?v=' + (x.size || ''); f.file = x.name; f.listed = true;
    });
    FILES.forEach((f) => { if (f.auto && !list.some((x) => x.name === f.asset)) f.gone = true; });
  }
  const meta2 = (f) => (f.version ? meta(f) : `${f.date} · ${f.size}`);
  function tab(p, shell) {
    const draw = () => { const el = document.getElementById('dl-list'); if (el) el.innerHTML = FILES.filter((f) => !f.gone).map(card).join(''); };
    V(shell(`<h2 class="dl-t">Téléchargements</h2><p class="lead">Tous les fichiers .apk du dossier <code>telechargements/</code> du dépôt GitHub apparaissent ici automatiquement.</p><div class="dl-list" id="dl-list"></div>`));
    draw();
    FILES.forEach(refresh);
    discover().then(draw);
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
