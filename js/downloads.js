/* Studio Prism — TÉLÉCHARGEMENTS réservés aux administrateurs (script classique, chargé après js/account.js).
 *
 *  - #/admin/telechargements : onglet « Téléchargements » de l'administration (APK Android d'ARCHIVISION pour l'instant) ;
 *  - page ArchiVision (#/archivision) : encart « Version Android » affiché aux seuls administrateurs connectés.
 *
 * TÉLÉCHARGEMENT DIRECT : « Télécharger l'APK » ouvre une fenêtre de confirmation, puis le fichier se télécharge
 * directement sur l'appareil (plus de passage par Google Drive). Le fichier est servi par les « Releases » GitHub
 * du dépôt groupestudioprism/ArchiVision : l'adresse …/releases/latest/download/ArchiVision.apk pointe toujours vers
 * la dernière version publiée, et GitHub l'envoie comme pièce jointe (le navigateur l'enregistre au lieu de l'ouvrir).
 * La version, la date et la taille affichées sont lues sur l'API publique de GitHub ; sans réseau, les valeurs ci-dessous servent.
 *
 * Attention : un fichier de Release d'un dépôt public est téléchargeable par toute personne qui a le lien. Le bouton n'est
 * montré qu'aux administrateurs, mais c'est l'APK lui-même qui protège l'app (connexion Studio Prism + licence ARCHIVISION).
 *
 * NOUVELLE VERSION : sur GitHub → groupestudioprism/ArchiVision → Releases → « Draft a new release » → tag vX.Y.Z →
 * glisser le fichier en le nommant exactement ArchiVision.apk → Publish. Le site l'affiche tout seul, rien à modifier ici. */
(function () {
  'use strict';
  const K = window.SP && window.SP.kit;
  if (!K) return;
  const { st, esc } = K;

  const FILES = [{
    id: 'archivision-android',
    name: 'ArchiVision · Android',
    desc: 'Application Android (APK) : maquettes BIM en visite 3D et en réalité augmentée (ARCore), compte Studio Prism, licence et stockage intégrés.',
    repo: 'groupestudioprism/ArchiVision', asset: 'ArchiVision.apk',
    version: '1.0.0', date: '15/10/2026', size: '≈ 39 Mo',       // valeurs de secours si l'API GitHub ne répond pas
    needs: 'Téléphone ou tablette Android 8.0 ou plus récent. Réalité augmentée : appareil compatible ARCore.',
    // Secours tant qu'aucune Release GitHub n'existe : téléchargement direct depuis le Drive (compte Google ayant accès au fichier)
    fallback: 'https://drive.usercontent.google.com/download?id=1gRHiLpZp0ZW8XnVDLugpkDTTNMKM4Zsh&export=download&confirm=t'
  }];
  FILES.forEach((f) => { f.url = `https://github.com/${f.repo}/releases/latest/download/${f.asset}`; });

  /* Dernière version publiée (une requête par fichier et par visite ; 60 requêtes / heure autorisées sans compte GitHub). */
  const mo = (b) => (b / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';
  function refresh(f) {
    if (f._p) return f._p;
    f._p = fetch(`https://api.github.com/repos/${f.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : (r.status === 404 ? {} : null)))
      .then((rel) => {
        if (!rel) return;
        const a = (rel.assets || []).find((x) => x.name === f.asset) || (rel.assets || []).find((x) => /\.apk$/i.test(x.name));
        if (!a) { if (f.fallback) f.url = f.fallback; return; }   // aucune Release publiée : secours Drive
        f.version = String(rel.tag_name || f.version).replace(/^v/i, '');
        f.date = new Date(rel.published_at || a.updated_at).toLocaleDateString('fr-FR');
        f.size = mo(a.size);
        f.url = a.browser_download_url;
        f.file = a.name;
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
