/* Studio Prism — TÉLÉCHARGEMENTS réservés aux administrateurs (script classique, chargé après js/account.js).
 *
 *  - #/admin/telechargements : onglet « Téléchargements » de l'administration (APK Android d'ARCHIVISION pour l'instant) ;
 *  - page ArchiVision (#/archivision) : encart « Version Android » affiché aux seuls administrateurs connectés.
 *
 * Les fichiers ne sont PAS dans ce dépôt public : ils sont rangés dans le Google Drive de Studio Prism (dossier ARCHIVISION),
 * partagé uniquement avec les administrateurs. Le bouton n'est qu'un raccourci : c'est le partage Google Drive qui protège
 * réellement le fichier (un lien recopié par quelqu'un d'autre ouvre « Accès refusé » chez Google).
 * Nouvelle version : déposer le nouvel APK dans le dossier Drive, puis mettre à jour la version et la date ci-dessous. */
(function () {
  'use strict';
  const K = window.SP && window.SP.kit;
  if (!K) return;
  const { st, esc } = K;

  const FILES = [{
    id: 'archivision-android',
    name: 'ArchiVision · Android',
    desc: 'Application Android (APK) : maquettes BIM en visite 3D et en réalité augmentée (ARCore), compte Studio Prism, licence et stockage intégrés.',
    version: '1.0.0', date: '15/10/2026', size: '≈ 39 Mo',
    needs: 'Téléphone ou tablette Android 8.0 ou plus récent. Réalité augmentée : appareil compatible ARCore.',
    url: 'https://drive.google.com/drive/folders/1OtsH3rpuWwL3evhOFT7Y2OLm0aSVNq3V'   // Drive › ARCHIVISION › 03 Application
  }];

  const isAdmin = () => st.auth.status === 'in' && !!st.auth.profile && st.auth.profile.role === 'admin';
  const how = '<p class="mut dl-how">Le fichier est dans le Google Drive de Studio Prism : il s’ouvre avec un compte Google qui a accès au dossier ARCHIVISION. ' +
    'Sur le téléphone : télécharger l’APK, l’ouvrir, puis autoriser « Installer des applis inconnues » si Android le demande.</p>';
  const btn = (f) => `<a class="btn b1" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">Télécharger l’APK</a>`;

  const card = (f) => `<div class="panel dl-card">
    <div class="dl-h"><h3>${esc(f.name)}</h3><span class="bd bd-admin">Administrateurs</span></div>
    <p>${esc(f.desc)}</p>
    <p class="mut">Version ${esc(f.version)} · ${esc(f.date)} · ${esc(f.size)}</p>
    <p class="mut">${esc(f.needs)}</p>
    <p class="dl-act">${btn(f)}</p>${how}</div>`;

  function tab(p, shell) {
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
    d.className = 'panel dl-adm';
    d.innerHTML = `<div class="dl-h"><h3>Version Android</h3><span class="bd bd-admin">Administrateurs</span></div>
      <p class="mut">ArchiVision ${esc(f.version)} pour téléphone et tablette Android (${esc(f.size)}).</p>
      <p class="dl-act">${btn(f)} <a class="btn b4" href="#/admin/telechargements">Tous les téléchargements</a></p>${how}`;
    const ref = w.children[1] || null; w.insertBefore(d, ref);
  }
  new MutationObserver(deco).observe(document.getElementById('v'), { childList: true });
  K.loadAuth().then((api) => api.subscribe(() => setTimeout(deco, 0))).catch(() => {});
})();
