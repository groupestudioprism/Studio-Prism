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
    name: 'ARCHIVISION (réalité augmentée)', branch: 'prism-app', gamme: 'archi', logo: 'assets/img/telechargements/archivision.png',
    desc: 'Application Android (APK) : maquettes BIM en visite 3D et en réalité augmentée (ARCore), compte Studio Prism, licence et stockage intégrés.',
    asset: 'ArchiVision.apk', info: 'telechargements/archivision.json',
    version: '1.0.0', date: '15/10/2026', size: '≈ 39 Mo',       // valeurs de secours si l'API GitHub ne répond pas
    needs: 'Téléphone ou tablette Android 8.0 ou plus récent. Réalité augmentée : appareil compatible ARCore.'
 },
  /* Applications Android natives (vue web intégrée, signées Studio Prism) : chacune s’ouvre dans sa propre fenêtre, sans Chrome.
     Sources et clé de signature : hors dépôt (voir le LISEZMOI des sources). */
  {
    id: 'admin-android', name: 'Studio Prism Admin', asset: 'Studio-Prism-Admin.apk', branch: 'studio', gamme: 'admin', logo: 'assets/img/telechargements/studio-prism-admin.png',
    version: '1.1.0', date: '12/11/2026', size: '≈ 0,3 Mo',
    desc: 'N’ouvre que l’administration du site : tableau de bord, comptes, devis, entreprises, produits et prix, téléchargements. Les autres pages du site s’ouvrent dans le navigateur.',
    needs: 'Android 7.0 ou plus récent. Vraie application : elle s’ouvre dans sa propre fenêtre (sans Chrome). Connexion par e-mail et mot de passe d’un compte administrateur.'
  },
  {
    id: 'archiplan-android', name: 'ARCHIPLAN', asset: 'ARCHIPLAN.apk', branch: 'prism-app', gamme: 'archi', logo: 'assets/img/telechargements/archiplan.png',
    version: '1.1.0', date: '12/11/2026', size: '≈ 0,3 Mo',
    desc: 'Le modeleur BIM sur téléphone et tablette : plan, 3D, parois, vérifications, métré et exports.',
    needs: 'Android 7.0 ou plus récent. Vraie application : elle s’ouvre dans sa propre fenêtre (sans Chrome), joue l’animation d’ouverture et suit automatiquement les mises à jour de l’app en ligne.'
  },
  {
    id: 'archivision-web-android', name: 'ARCHIVISION Web', asset: 'ARCHIVISION-Web.apk', branch: 'prism-app', gamme: 'archi', logo: 'assets/img/telechargements/archivision.png',
    version: '1.1.0', date: '12/11/2026', size: '≈ 0,3 Mo',
    desc: 'La visionneuse de maquettes (GLB, IFC) en application : visite 3D et données BIM. Pour la réalité augmentée, utiliser l’app ArchiVision (Unity). Les deux peuvent être installées ensemble.',
    needs: 'Android 7.0 ou plus récent. Vraie application : elle s’ouvre dans sa propre fenêtre (sans Chrome), joue l’animation d’ouverture et suit automatiquement les mises à jour de l’app en ligne.'
  },
  {
    id: 'architrafic-android', name: 'ARCHITRAFIC', asset: 'ARCHITRAFIC.apk', branch: 'prism-app', gamme: 'archi', logo: 'assets/img/telechargements/architrafic.png',
    version: '1.1.0', date: '12/11/2026', size: '≈ 0,3 Mo',
    desc: 'Préparation de la circulation autour des chantiers : routes barrées, déviations, panneaux, mode terrain.',
    needs: 'Android 7.0 ou plus récent. Vraie application : elle s’ouvre dans sa propre fenêtre (sans Chrome), joue l’animation d’ouverture et suit automatiquement les mises à jour de l’app en ligne.'
  },
  {
    id: 'spectrawriter-android', name: 'SPECTRA Writer', asset: 'SPECTRA-Writer.apk', branch: 'prism-app', gamme: 'spectra', logo: 'assets/img/apps/writer.svg',
    version: '1.1.0', date: '12/11/2026', size: '≈ 0,3 Mo',
    desc: 'Le traitement de texte de la gamme SPECTRA.',
    needs: 'Android 7.0 ou plus récent. Vraie application : elle s’ouvre dans sa propre fenêtre (sans Chrome), joue l’animation d’ouverture et suit automatiquement les mises à jour de l’app en ligne.'
  },
  {
    id: 'spectracalc-android', name: 'SPECTRA Calc', asset: 'SPECTRA-Calc.apk', branch: 'prism-app', gamme: 'spectra', logo: 'assets/img/apps/calc.svg',
    version: '1.1.0', date: '12/11/2026', size: '≈ 0,3 Mo',
    desc: 'Le tableur de la gamme SPECTRA.',
    needs: 'Android 7.0 ou plus récent. Vraie application : elle s’ouvre dans sa propre fenêtre (sans Chrome), joue l’animation d’ouverture et suit automatiquement les mises à jour de l’app en ligne.'
  },
  {
    id: 'spectraslide-android', name: 'SPECTRA Slide', asset: 'SPECTRA-Slide.apk', branch: 'prism-app', gamme: 'spectra', logo: 'assets/img/apps/slide.svg',
    version: '1.1.0', date: '12/11/2026', size: '≈ 0,3 Mo',
    desc: 'Le logiciel de présentation de la gamme SPECTRA.',
    needs: 'Android 7.0 ou plus récent. Vraie application : elle s’ouvre dans sa propre fenêtre (sans Chrome), joue l’animation d’ouverture et suit automatiquement les mises à jour de l’app en ligne.'
  },
  {
    id: 'spectramotion-android', name: 'SPECTRA Motion', asset: 'SPECTRA-Motion.apk', branch: 'prism-app', gamme: 'spectra', logo: 'assets/img/apps/motion.svg',
    version: '1.1.0', date: '12/11/2026', size: '≈ 0,3 Mo',
    desc: 'Le studio de création : design, photo, vidéo, animation et audio.',
    needs: 'Android 7.0 ou plus récent. Vraie application : elle s’ouvre dans sa propre fenêtre (sans Chrome), joue l’animation d’ouverture et suit automatiquement les mises à jour de l’app en ligne.'
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

  /* Carte d'une application : logo, nom, version, description, bouton. */
  const card = (f) => `<article class="panel dl-card">
    <div class="dl-h">${f.logo ? `<img class="dl-logo" src="${esc(f.logo)}" alt="" width="56" height="56" loading="lazy">` : '<span class="dl-logo dl-logo-x" aria-hidden="true">APK</span>'}
      <div class="dl-nm"><h4>${esc(f.name)}</h4><p class="mut" data-dl-meta="${esc(f.id)}">${esc(meta2(f))}</p></div></div>
    <p>${esc(f.desc)}</p>
    <p class="mut dl-need">${esc(f.needs)}</p>
    <p class="dl-act">${btn(f)}</p></article>`;

  /* Rangement : branche → gamme → applications. Un .apk déposé sans fiche va dans « Autres fichiers ». */
  const BRANCHES = [
    { id: 'prism-app', name: 'Prism App', note: 'Les logiciels Studio Prism', gammes: [
      { id: 'archi', name: 'Gamme Archi', note: 'Architecture, BIM et chantier' },
      { id: 'spectra', name: 'Gamme SPECTRA', note: 'Bureautique et création' }] },
    { id: 'studio', name: 'Studio Prism', note: 'Gestion du site', gammes: [
      { id: 'admin', name: 'Administration', note: 'Réservé aux administrateurs' }] }
  ];
  function grouped(list) {
    const used = new Set(), html = [];
    BRANCHES.forEach((b) => {
      const parts = b.gammes.map((g) => {
        const fs = list.filter((f) => f.branch === b.id && f.gamme === g.id); fs.forEach((f) => used.add(f));
        return fs.length ? `<div role="group" class="dl-gamme" aria-label="${esc(g.name)}"><h4 class="dl-gt">${esc(g.name)} <small>${esc(g.note)} · ${fs.length} app${fs.length > 1 ? 's' : ''}</small></h4><div class="dl-grid">${fs.map(card).join('')}</div></div>` : '';
      }).join('');
      if (parts) html.push(`<div class="dl-branche"><h3 class="dl-bt">${esc(b.name)} <small>${esc(b.note)}</small></h3>${parts}</div>`);
    });
    const rest = list.filter((f) => !used.has(f));
    if (rest.length) html.push(`<div class="dl-branche"><h3 class="dl-bt">Autres fichiers <small>déposés dans telechargements/</small></h3><div class="dl-grid">${rest.map(card).join('')}</div></div>`);
    return html.join('');
  }

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
    const draw = () => { const el = document.getElementById('dl-list'); if (el) el.innerHTML = grouped(FILES.filter((f) => !f.gone)); };
    V(shell(`<h2 class="dl-t">Téléchargements</h2><p class="lead">Applications Android de Studio Prism, rangées par branche et par gamme. Un fichier .apk ajouté au dossier <code>telechargements/</code> du dépôt apparaît ici automatiquement.</p>${how}<div class="dl-list" id="dl-list"></div>`));
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
