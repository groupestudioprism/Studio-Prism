/* Studio Prism — administration du CMS : MÉDIATHÈQUE et sélecteur de média (script classique, chargé après js/cms.js et js/platform.js).
 *
 *  - #/admin/medias : envoi depuis l'ordinateur ou le téléphone (images JPEG, PNG, WebP, GIF ≤ 8 Mo ; vidéos MP4, WebM ≤ 50 Mo),
 *    dossiers, recherche, texte alternatif, remplacement d'un fichier SANS casser les références, suppression contrôlée (refusée tant
 *    que le média est utilisé par une page, un projet ou un produit) ;
 *  - sélecteur de média (window.SP.cmsx.pick) utilisé par l'éditeur de pages, les projets et le formulaire des produits.
 *
 * Les fichiers sont dans Firebase Storage (media/{id}/{fichier}), leurs métadonnées dans Firestore (collection « media »). Les droits réels
 * sont imposés par storage.rules et firestore.rules, côté serveurs Google : ce fichier n'est qu'une interface. */
(function () {
  'use strict';
  const K = window.SP && window.SP.kit;
  if (!K || !window.SP.cms) return;
  const { esc, errMsg } = K;
  const CMS = window.SP.cms;
  let cdp = null;
  const cd = () => (cdp || (cdp = import(K.MOD('cmsdata.js'))));

  const CMS_ERR = {
    'app/media-type': 'Format non accepté. Formats autorisés : images JPEG, PNG, WebP, GIF et vidéos MP4, WebM (pas de SVG, de PDF ni d’autres fichiers).',
    'app/media-size': 'Fichier trop volumineux (images : 8 Mo au plus ; vidéos : 50 Mo au plus).',
    'app/media-empty': 'Le fichier est vide.',
    'app/media-url': 'Adresse invalide : elle doit commencer par https:// et ne contenir ni espace ni guillemet.',
    'app/media-kind': 'Le nouveau fichier doit être du même genre (image ou vidéo) que le média remplacé.',
    'app/media-link': 'Ce média est un lien externe : remplacez son adresse plutôt que son fichier.',
    'app/media-upload': 'Ce média est un fichier de la médiathèque : remplacez son fichier plutôt que son adresse.',
    'app/not-signed-in': 'Votre session a expiré : reconnectez-vous.',
    'app/page-conflict': 'Cette page a été publiée par quelqu’un d’autre depuis l’ouverture de l’éditeur.',
    'app/project-exists': 'Un projet porte déjà cet identifiant.',
    'app/page-builtin': 'Les pages du site ne se suppriment pas : dépubliez-les pour revenir au contenu d’origine.',
    'storage/unauthorized': 'Envoi refusé par Firebase Storage : vérifiez que vous êtes administrateur actif et que les règles Storage (storage.rules) sont publiées.',
    'storage/unauthenticated': 'Envoi refusé : votre session a expiré, reconnectez-vous.',
    'storage/bucket-not-found': 'Firebase Storage n’est pas activé sur ce projet : activez-le dans la console Firebase (Build → Storage), puis publiez storage.rules.',
    'storage/project-not-found': 'Firebase Storage n’est pas activé sur ce projet : activez-le dans la console Firebase (Build → Storage).',
    'storage/quota-exceeded': 'Quota Firebase Storage dépassé.',
    'storage/retry-limit-exceeded': 'L’envoi a échoué (connexion instable). Réessayez.',
    'storage/canceled': 'Envoi annulé.',
    'storage/invalid-argument': 'Fichier refusé par Firebase Storage.'
  };
  /* Erreurs de validation attendues (codes « app/… ») : simple avertissement ; autres erreurs : console.error. */
  const log = (label, e) => (e && /^app\//.test(e.code || '') ? console.warn : console.error)('[Studio Prism] ' + label, e && /^app\//.test(e.code || '') ? e.code : e);
  const msg = (e) => {
    const c = e && e.code;
    if (c && CMS_ERR[c]) return CMS_ERR[c];
    if (c && String(c).indexOf('storage/') === 0) return 'Firebase Storage a refusé l’opération (' + c + '). Vérifiez que Storage est activé et que storage.rules est publié.';
    return errMsg(e);
  };
  const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : n >= 1024 ? Math.round(n / 1024) + ' Ko' : n ? n + ' o' : '—');
  const fdate = (ts) => { try { const d = ts && ts.toDate ? ts.toDate() : ts instanceof Date ? ts : null; return d ? d.toLocaleDateString('fr-FR') : '—'; } catch (e) { return '—'; } };

  /* ------------------------------------------------------------------ état commun */
  const MD = { list: null, q: '', folder: '', kind: '', noalt: false, busy: false };
  const X = window.SP.cmsx = Object.assign(window.SP.cmsx || {}, { cd, msg, log, esc, fmtSize, fdate, MD });

  async function loadMedia(force) {
    if (MD.list && !force) return MD.list;
    MD.list = await (await cd()).adminListMedia();
    return MD.list;
  }
  const byId = (id) => (MD.list || []).find((m) => m.id === id) || null;
  X.loadMedia = loadMedia;
  X.mediaById = byId;
  X.folders = () => Array.from(new Set((MD.list || []).map((m) => m.folder).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'));

  /* Adresse affichable (miniature) d'une valeur « media:{id} » ou d'un lien. */
  X.refUrl = (ref) => {
    const m = CMS.MEDIA_RE.exec(String(ref || ''));
    if (m) { const x = byId(m[1]); return x ? x.url : ''; }
    return CMS.safeImg(ref);
  };
  X.refName = (ref) => {
    const m = CMS.MEDIA_RE.exec(String(ref || ''));
    if (m) { const x = byId(m[1]); return x ? x.name : 'média introuvable'; }
    return ref ? 'lien' : '';
  };

  const thumb = (m) => (m.kind === 'video' ? `<span class="cmsa-th v" aria-hidden="true">▶</span>` : `<img src="${esc(m.url)}" alt="" loading="lazy" decoding="async">`);

  /* ------------------------------------------------------------------ téléversement */
  const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';

  function addUploadRow(box, file) {
    const row = document.createElement('div');
    row.innerHTML = `<span>${esc(file.name)} <small class="mut">(${fmtSize(file.size)})</small></span><progress max="1" value="0" aria-label="Envoi de ${esc(file.name)}"></progress><span class="cmsa-us" role="status">En attente…</span>`;
    box.appendChild(row);
    return { pr: row.querySelector('progress'), st: row.querySelector('.cmsa-us'), row };
  }

  /* Envoie des fichiers l'un après l'autre. Renvoie les médias créés. */
  async function uploadFiles(files, meta, box, afterEach) {
    const out = [];
    for (const f of Array.from(files)) {
      const ui = box ? addUploadRow(box, f) : null;
      try {
        if (ui) ui.st.textContent = 'Envoi…';
        const m = await (await cd()).uploadMedia(f, meta, (p) => { if (ui) ui.pr.value = p; });
        if (MD.list) MD.list.unshift(m);
        out.push(m);
        if (ui) { ui.pr.value = 1; ui.st.textContent = 'Envoyé ✓'; }
        if (afterEach) afterEach(m);
      } catch (e) {
        log('Envoi du média :', e);
        if (ui) { ui.st.textContent = msg(e); ui.st.classList.add('fe'); ui.st.style.display = 'block'; ui.pr.remove(); }
        else toast(msg(e));
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ page « Médiathèque » */
  const filtered = () => (MD.list || []).filter((m) => {
    if (MD.folder && m.folder !== MD.folder) return false;
    if (MD.kind && m.kind !== MD.kind) return false;
    if (MD.noalt && (m.kind !== 'image' || (m.alt || '').trim())) return false;
    const q = MD.q.trim().toLowerCase();
    return !q || [m.name, m.alt, m.title, m.folder].some((v) => String(v || '').toLowerCase().indexOf(q) >= 0);
  });

  function renderGrid() {
    const box = document.getElementById('md-grid');
    if (!box) return;
    const fsel = document.getElementById('md-folder');
    if (fsel) fsel.innerHTML = `<option value="">Tous les dossiers</option>` + X.folders().map((f) => `<option value="${esc(f)}"${f === MD.folder ? ' selected' : ''}>${esc(f)}</option>`).join('');
    const dl = document.getElementById('md-folders');
    if (dl) dl.innerHTML = X.folders().map((f) => `<option value="${esc(f)}">`).join('');
    const info = document.getElementById('md-info');
    const list = filtered();
    if (info) info.textContent = `${list.length} média${list.length > 1 ? 's' : ''}${list.length !== (MD.list || []).length ? ` sur ${(MD.list || []).length}` : ''}`;
    if (!(MD.list || []).length) { box.innerHTML = '<div class="panel"><h3>La médiathèque est vide</h3><p class="mut" style="margin-top:6px">Envoyez une première image ou vidéo avec la zone ci-dessus.</p></div>'; return; }
    if (!list.length) { box.innerHTML = '<div class="panel"><p>Aucun média ne correspond à ces filtres.</p></div>'; return; }
    box.innerHTML = `<div class="cmsa-grid">${list.map((m) => `<div class="cmsa-m"><button type="button" class="cmsa-th" data-a="md-open" data-id="${esc(m.id)}" aria-label="Ouvrir ${esc(m.name)}">${thumb(m)}</button>` +
      `<div class="cmsa-mt"><b title="${esc(m.name)}">${esc(m.name)}</b><small>${esc(m.folder || 'Sans dossier')} · ${fmtSize(m.size)}${m.source === 'link' ? ' · lien' : ''}</small>` +
      `${m.kind === 'image' && !(m.alt || '').trim() ? '<br><small class="fe" style="display:block">Texte alternatif manquant</small>' : ''}${m.public === false ? '<br><small>Non public</small>' : ''}</div></div>`).join('')}</div>`;
  }

  function mediaTab(p, shell) {
    V(shell(`<div class="cmsa"><p class="lead">Images et vidéos du site. Un média se choisit ensuite dans les pages, les projets et les produits : le remplacer ici met à jour tous les endroits où il est utilisé.</p>` +
      `<div class="cmsa-drop" id="md-drop"><p>Glissez des fichiers ici, ou choisissez-les depuis votre ordinateur ou votre téléphone.</p>` +
      `<div class="cmsa-tools" style="justify-content:center"><div class="cmsa-f"><label for="md-upfolder">Dossier <span class="mut">(facultatif)</span></label><input id="md-upfolder" type="text" list="md-folders" maxlength="60" autocomplete="off" placeholder="Accueil, Projets, Équipe…"><datalist id="md-folders"></datalist></div>` +
      `<button type="button" class="btn b1" data-a="md-choose">Choisir des fichiers</button><button type="button" class="btn b4" data-a="md-link">Ajouter un média par lien</button></div>` +
      `<input id="md-file" type="file" accept="${ACCEPT}" multiple hidden aria-label="Fichiers à envoyer">` +
      `<p class="cmsa-h mut">Images JPEG, PNG, WebP, GIF (8 Mo au plus) · vidéos MP4, WebM (50 Mo au plus). Les fichiers de la médiathèque sont publics : n’y déposez rien de confidentiel.</p><div class="cmsa-up" id="md-up" aria-live="polite"></div></div>` +
      `<div class="cmsa-tools"><div class="cmsa-f"><label for="md-q">Rechercher</label><input id="md-q" type="text" placeholder="Nom, texte alternatif, dossier…" value="${esc(MD.q)}" autocomplete="off"></div>` +
      `<div class="cmsa-f"><label for="md-folder">Dossier</label><select id="md-folder"></select></div>` +
      `<div class="cmsa-f"><label for="md-kind">Type</label><select id="md-kind"><option value="">Tous</option><option value="image"${MD.kind === 'image' ? ' selected' : ''}>Images</option><option value="video"${MD.kind === 'video' ? ' selected' : ''}>Vidéos</option></select></div>` +
      `<label class="opt"><input type="checkbox" id="md-noalt"${MD.noalt ? ' checked' : ''}> Sans texte alternatif</label><p class="mut" id="md-info" role="status" aria-live="polite" style="margin:0"></p></div>` +
      `<div id="md-grid" aria-live="polite"><p class="mut">Chargement de la médiathèque…</p></div></div>`));
    loadMedia(true).then(renderGrid).catch((e) => {
      X.log('Médiathèque :', e);
      const box = document.getElementById('md-grid');
      if (box) box.innerHTML = `<div class="panel"><p>${esc(msg(e))}</p><p style="margin-top:12px"><button class="btn b1" data-a="md-retry">Réessayer</button></p></div>`;
    });
  }

  A['md-retry'] = () => K.adminGate('media', mediaTab);
  A['md-choose'] = () => { const i = document.getElementById('md-file'); if (i) i.click(); };

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'md-file' && t.files && t.files.length) {
      const folder = (document.getElementById('md-upfolder') || {}).value || '';
      const box = document.getElementById('md-up');
      uploadFiles(t.files, { folder }, box, () => renderGrid()).then(() => { t.value = ''; renderGrid(); });
    } else if (t.id === 'md-folder') { MD.folder = t.value; renderGrid(); }
    else if (t.id === 'md-kind') { MD.kind = t.value; renderGrid(); }
    else if (t.id === 'md-noalt') { MD.noalt = t.checked; renderGrid(); }
    else if (t.id === 'md-replace' && t.files && t.files.length) replaceFile(t.files[0], t);
    else if (t.id === 'pk-file' && t.files && t.files.length) pickerUpload(t.files[0], t);
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'md-q') { MD.q = e.target.value; renderGrid(); }
    else if (e.target.id === 'pk-q') { PK.q = e.target.value; paintPicker(); }
  });
  ['dragover', 'dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => {
    const z = e.target.closest && e.target.closest('#md-drop');
    if (!z) return;
    e.preventDefault();
    z.classList.toggle('on', ev === 'dragover');
    if (ev === 'drop' && e.dataTransfer && e.dataTransfer.files.length) {
      const folder = (document.getElementById('md-upfolder') || {}).value || '';
      uploadFiles(e.dataTransfer.files, { folder }, document.getElementById('md-up'), () => renderGrid()).then(renderGrid);
    }
  }));

  /* ------------------------------------------------------------------ fiche d'un média */
  function pm(html, wide) {
    A.x();
    modal(html);
    const m = document.querySelector('.mod');
    if (m && wide) m.classList.add('mod-w');
    return m;
  }
  const fld = (id, label, control, hint) => `<div class="acc-f"><label for="${id}">${label}</label>${control}${hint ? `<p class="acc-h" id="h-${id}">${hint}</p>` : ''}<p class="fe" id="e-${id}" role="alert"></p></div>`;

  async function usageOf(id) {
    const d = await cd();
    const [pages, drafts, projects, products] = await Promise.all([d.adminListPages(), d.adminListDrafts(), d.adminListProjects(), d.adminListProducts()]);
    return d.findMediaUsage(id, { pages, drafts, projects, products });
  }
  const usageHtml = (u) => (u.length
    ? `<ul class="cmsa-use">${u.map((x) => `<li>${x.type === 'page' ? 'Page' : x.type === 'project' ? 'Projet' : 'Produit'} : <b>${esc(x.label)}</b>${x.draft ? ' <small>(brouillon)</small>' : ''}</li>`).join('')}</ul>`
    : '<p class="mut">Ce média n’est utilisé nulle part.</p>');

  A['md-open'] = (btn) => {
    const m = byId(btn.dataset.id);
    if (!m) return;
    pm(`<h3>${esc(m.name)}</h3><div class="cmsa-dt"><div>${m.kind === 'video' ? `<video src="${esc(m.url)}" controls preload="metadata" style="max-width:100%"></video>` : `<img src="${esc(m.url)}" alt="${esc(m.alt || '')}">`}` +
      `<p class="mut" style="margin-top:8px;font-size:13px">${esc(m.mime)} · ${fmtSize(m.size)}${m.width ? ` · ${m.width}×${m.height} px` : ''} · ajouté le ${fdate(m.createdAt)}${m.source === 'link' ? ' · lien externe' : ''}</p></div>` +
      `<form data-f="md-edit" data-id="${esc(m.id)}" novalidate>` +
      fld('md-n', 'Nom', `<input id="md-n" name="n" type="text" value="${esc(m.name)}" maxlength="120">`) +
      fld('md-fo', 'Dossier', `<input id="md-fo" name="fo" type="text" list="md-folders" value="${esc(m.folder || '')}" maxlength="60" autocomplete="off"><datalist id="md-folders">${X.folders().map((f) => `<option value="${esc(f)}">`).join('')}</datalist>`) +
      (m.kind === 'image' ? fld('md-a', 'Texte alternatif', `<input id="md-a" name="a" type="text" value="${esc(m.alt || '')}" maxlength="250">`, 'Décrit l’image aux personnes qui ne la voient pas. À laisser vide seulement si l’image est purement décorative.') : '') +
      fld('md-t', 'Titre <span class="mut">(facultatif)</span>', `<input id="md-t" name="t" type="text" value="${esc(m.title || '')}" maxlength="120">`) +
      `<label class="opt"><input type="checkbox" name="pub"${m.public === false ? '' : ' checked'}> Visible du public (nécessaire pour l’afficher sur le site)</label>` +
      `<div class="acc-f"><label>Référence à utiliser</label><code>media:${esc(m.id)}</code> <button type="button" class="btn b4" data-a="md-copy" data-v="media:${esc(m.id)}">Copier</button><p class="acc-h">Les pages, projets et produits référencent le média par cet identifiant : remplacer le fichier ne casse rien.</p></div>` +
      `<h4 style="margin-top:14px">Utilisation</h4><div id="md-use"><p class="mut">Recherche des utilisations…</p></div>` +
      `<p class="fe" id="md-err" role="alert"></p><p style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn b1" type="submit">Enregistrer</button>` +
      `<button type="button" class="btn b4" data-a="md-rep" data-id="${esc(m.id)}">${m.source === 'link' ? 'Changer l’adresse' : 'Remplacer le fichier'}</button>` +
      `<button type="button" class="btn b4" data-a="md-del" data-id="${esc(m.id)}">Supprimer</button></p>` +
      `<input id="md-replace" type="file" accept="${m.kind === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,image/gif'}" data-id="${esc(m.id)}" hidden aria-label="Nouveau fichier"></form></div>`, true);
    usageOf(m.id).then((u) => { const el = document.getElementById('md-use'); if (el) el.innerHTML = usageHtml(u); }).catch((e) => { const el = document.getElementById('md-use'); if (el) el.innerHTML = `<p class="fe" style="display:block">${esc(msg(e))}</p>`; });
  };

  A['md-copy'] = (btn) => {
    const v = btn.dataset.v;
    const done = () => toast('Copié.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, () => toast(v));
    else toast(v);
  };

  document.addEventListener('submit', async (e) => {
    const fm = e.target;
    if (!fm.dataset || fm.dataset.f !== 'md-edit') return;
    e.preventDefault();
    const m = byId(fm.dataset.id), err = document.getElementById('md-err'), btn = fm.querySelector('button[type=submit]');
    if (!m) return;
    const name = fm.elements.n.value.trim();
    if (!name) { err.textContent = 'Le nom ne peut pas être vide.'; return; }
    btn.disabled = true; err.textContent = '';
    const next = { name, folder: fm.elements.fo.value.trim(), alt: fm.elements.a ? fm.elements.a.value.trim() : m.alt || '', title: fm.elements.t.value.trim(), public: fm.elements.pub.checked };
    try {
      await (await cd()).updateMediaMeta(m.id, next);
      Object.assign(m, next);
      A.x(); renderGrid(); toast('Média enregistré.');
    } catch (e2) { X.log('Média :', e2); err.textContent = msg(e2); btn.disabled = false; }
  });

  A['md-rep'] = async (btn) => {
    const m = byId(btn.dataset.id);
    if (!m) return;
    if (m.source === 'link') {
      pm(`<h3>Changer l’adresse du média</h3><form data-f="md-relink" data-id="${esc(m.id)}" novalidate>${fld('md-ru', 'Nouvelle adresse (https://)', `<input id="md-ru" name="u" type="text" value="${esc(m.url)}" maxlength="1500" autocomplete="off">`)}` +
        `<p class="fe" id="md-rerr" role="alert"></p><p style="margin-top:12px"><button class="btn b1" type="submit">Enregistrer</button></p></form>`);
      return;
    }
    const inp = document.getElementById('md-replace');
    if (inp) inp.click();
  };

  async function replaceFile(file, inp) {
    const m = byId(inp.dataset.id), err = document.getElementById('md-err');
    if (!m) return;
    if (err) err.textContent = 'Envoi du nouveau fichier…';
    try {
      const r = await (await cd()).replaceMediaFile(m, file, (p) => { if (err) err.textContent = `Envoi du nouveau fichier… ${Math.round(p * 100)} %`; });
      Object.assign(m, r);
      A.x(); renderGrid(); toast('Fichier remplacé : tous les affichages qui utilisent ce média sont mis à jour.');
    } catch (e) { X.log('Remplacement :', e); if (err) err.textContent = msg(e); }
    inp.value = '';
  }

  document.addEventListener('submit', async (e) => {
    const fm = e.target;
    if (!fm.dataset || fm.dataset.f !== 'md-relink') return;
    e.preventDefault();
    const m = byId(fm.dataset.id), err = document.getElementById('md-rerr');
    if (!m) return;
    try {
      const url = fm.elements.u.value.trim();
      await (await cd()).replaceMediaLink(m, url, m.mime);
      m.url = url;
      A.x(); renderGrid(); toast('Adresse mise à jour.');
    } catch (e2) { err.textContent = msg(e2); }
  });

  A['md-del'] = async (btn) => {
    const m = byId(btn.dataset.id);
    if (!m) return;
    btn.disabled = true;
    let use;
    try { use = await usageOf(m.id); } catch (e) { toast(msg(e)); btn.disabled = false; return; }
    if (use.length) {
      pm(`<h3>Suppression impossible</h3><p><b>« ${esc(m.name)} » est encore utilisé.</b></p><p class="mut" style="margin:6px 0 10px">Retirez-le d’abord des contenus suivants (ou remplacez son fichier plutôt que de le supprimer) :</p>${usageHtml(use)}`);
      return;
    }
    pm(`<h3>Supprimer le média</h3><p><b>Supprimer définitivement « ${esc(m.name)} » ?</b></p><p class="mut" style="margin-top:6px">${m.source === 'upload' ? 'Le fichier sera effacé de Firebase Storage. ' : ''}Ce média n’est utilisé dans aucune page, aucun projet ni aucun produit. Cette action est irréversible.</p>` +
      `<p class="fe" id="md-derr" role="alert"></p><p style="margin-top:12px"><button class="btn btn-danger" data-a="md-del-ok" data-id="${esc(m.id)}">Supprimer le média</button></p>`);
  };
  A['md-del-ok'] = async (btn) => {
    const m = byId(btn.dataset.id);
    if (!m) return;
    btn.disabled = true;
    try {
      const use = await usageOf(m.id);       // contrôle refait au dernier moment, sur des données fraîches
      if (use.length) { document.getElementById('md-derr').textContent = 'Ce média vient d’être utilisé : suppression annulée.'; return; }
      await (await cd()).deleteMedia(m);
      MD.list = MD.list.filter((x) => x.id !== m.id);
      A.x(); renderGrid(); toast('Média supprimé.');
    } catch (e) { X.log('Suppression du média :', e); const el = document.getElementById('md-derr'); if (el) el.textContent = msg(e); btn.disabled = false; }
  };

  /* ------------------------------------------------------------------ média par lien */
  const guessMime = (u) => ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm' })[String(u).split('?')[0].split('.').pop().toLowerCase()] || 'image/jpeg';
  A['md-link'] = () => {
    pm(`<h3>Ajouter un média par lien</h3><p class="mut">Pour une image ou une vidéo hébergée ailleurs (adresse https://). Le fichier n’est pas copié : s’il disparaît du site d’origine, il disparaît aussi ici.</p>` +
      `<form data-f="md-addlink" novalidate>${fld('ml-u', 'Adresse (https://)', '<input id="ml-u" name="u" type="text" maxlength="1500" autocomplete="off" placeholder="https://exemple.fr/image.png">')}` +
      fld('ml-m', 'Type', `<select id="ml-m" name="m">${[['image/jpeg', 'Image JPEG'], ['image/png', 'Image PNG'], ['image/webp', 'Image WebP'], ['image/gif', 'Image GIF'], ['video/mp4', 'Vidéo MP4'], ['video/webm', 'Vidéo WebM']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`) +
      fld('ml-n', 'Nom', '<input id="ml-n" name="n" type="text" maxlength="120" autocomplete="off">') + fld('ml-a', 'Texte alternatif', '<input id="ml-a" name="a" type="text" maxlength="250" autocomplete="off">') +
      `<p class="fe" id="ml-err" role="alert"></p><p style="margin-top:12px"><button class="btn b1" type="submit">Ajouter</button></p></form>`);
  };
  document.addEventListener('input', (e) => { if (e.target.id === 'ml-u') { const s = document.getElementById('ml-m'); if (s) s.value = guessMime(e.target.value); } });
  document.addEventListener('submit', async (e) => {
    const fm = e.target;
    if (!fm.dataset || fm.dataset.f !== 'md-addlink') return;
    e.preventDefault();
    const err = document.getElementById('ml-err'), btn = fm.querySelector('button[type=submit]');
    btn.disabled = true; err.textContent = '';
    try {
      const m = await (await cd()).addMediaLink({ url: fm.elements.u.value, mime: fm.elements.m.value, name: fm.elements.n.value, alt: fm.elements.a.value, folder: (document.getElementById('md-upfolder') || {}).value || '' });
      if (MD.list) MD.list.unshift(m);
      A.x(); renderGrid(); toast('Média ajouté.');
    } catch (e2) { err.textContent = msg(e2); btn.disabled = false; }
  });

  /* ------------------------------------------------------------------ sélecteur de média (fenêtre au-dessus de tout le reste) */
  const PK = { q: '', folder: '', kind: 'image', onPick: null };

  const ax = A.x;
  A.x = function () {
    const pk = document.querySelector('.mod.cms-pick');
    if (pk && pk._restore) { pk._restore(); return; }
    return ax.apply(this, arguments);
  };

  function paintPicker() {
    const box = document.getElementById('pk-grid');
    if (!box) return;
    const q = PK.q.trim().toLowerCase();
    const list = (MD.list || []).filter((m) => (PK.kind === 'any' || m.kind === PK.kind) && m.public !== false && (!PK.folder || m.folder === PK.folder) &&
      (!q || [m.name, m.alt, m.title, m.folder].some((v) => String(v || '').toLowerCase().indexOf(q) >= 0)));
    box.innerHTML = list.length
      ? `<div class="cmsa-grid">${list.map((m) => `<div class="cmsa-m"><button type="button" class="cmsa-th" data-a="pk-ok" data-id="${esc(m.id)}" aria-label="Choisir ${esc(m.name)}">${thumb(m)}</button><div class="cmsa-mt"><b title="${esc(m.name)}">${esc(m.name)}</b><small>${esc(m.folder || 'Sans dossier')}</small></div></div>`).join('')}</div>`
      : `<p class="mut">${(MD.list || []).length ? 'Aucun média ne correspond.' : 'La médiathèque est vide : envoyez un fichier ci-dessus.'}</p>`;
  }

  /* opts : { kind: 'image' | 'video' | 'any', onPick(ref, media|null) } */
  function pick(opts) {
    const o = opts || {};
    PK.q = ''; PK.folder = ''; PK.kind = o.kind || 'image'; PK.onPick = o.onPick;
    const stash = Array.from(document.querySelectorAll('.mod'));
    stash.forEach((s) => s.remove());
    const m = document.createElement('div');
    m.className = 'mod mod-w cms-pick';
    m._f = document.activeElement;
    m._restore = () => { m.remove(); stash.forEach((s) => document.body.appendChild(s)); if (m._f && m._f.focus && m._f.isConnected) m._f.focus(); };
    m.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-label="Choisir un média" tabindex="-1"><h3>Choisir ${PK.kind === 'video' ? 'une vidéo' : PK.kind === 'any' ? 'un média' : 'une image'}</h3>` +
      `<div class="cmsa-tools"><div class="cmsa-f"><label for="pk-q">Rechercher</label><input id="pk-q" type="text" autocomplete="off" placeholder="Nom, texte alternatif…"></div>` +
      `<button type="button" class="btn b1" data-a="pk-choose">Envoyer un nouveau fichier</button><input id="pk-file" type="file" accept="${PK.kind === 'video' ? 'video/mp4,video/webm' : PK.kind === 'any' ? ACCEPT : 'image/jpeg,image/png,image/webp,image/gif'}" hidden aria-label="Nouveau fichier"></div>` +
      `<p class="fe" id="pk-err" role="alert"></p><div class="cmsa-pick" id="pk-grid" aria-live="polite"><p class="mut">Chargement…</p></div>` +
      `<div class="acc-f" style="margin-top:14px"><label for="pk-url">Ou utiliser un lien (https:// ou assets/…)</label><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="pk-url" type="text" maxlength="500" autocomplete="off" style="flex:1;min-width:200px"><button type="button" class="btn b4" data-a="pk-link">Utiliser ce lien</button></div></div>` +
      `<p style="margin-top:14px"><button type="button" class="btn b4" data-a="x">Annuler</button></p></div>`;
    document.body.appendChild(m);
    m.querySelector('.panel').focus();
    loadMedia().then(paintPicker).catch((e) => { const b = document.getElementById('pk-grid'); if (b) b.innerHTML = `<p class="fe" style="display:block">${esc(msg(e))}</p>`; });
  }
  X.pick = pick;

  function chosen(ref, media) {
    const pk = document.querySelector('.mod.cms-pick');
    const cb = PK.onPick;
    if (pk) pk._restore();
    if (cb) cb(ref, media);
  }
  A['pk-ok'] = (btn) => { const m = byId(btn.dataset.id); if (m) chosen('media:' + m.id, m); };
  A['pk-choose'] = () => { const i = document.getElementById('pk-file'); if (i) i.click(); };
  A['pk-link'] = () => {
    const v = (document.getElementById('pk-url').value || '').trim(), er = document.getElementById('pk-err');
    if (!CMS.safeImg(v)) { er.textContent = 'Lien invalide : utilisez https://… ou assets/…'; return; }
    chosen(v, null);
  };
  async function pickerUpload(file, inp) {
    const er = document.getElementById('pk-err');
    er.textContent = 'Envoi en cours…';
    const r = await uploadFiles([file], { folder: PK.folder }, null, null);
    inp.value = '';
    if (r.length) chosen('media:' + r[0].id, r[0]);
    else er.textContent = 'L’envoi a échoué (voir le message en bas de l’écran).';
  }

  /* Bouton « Choisir dans la médiathèque » des formulaires (produits) : remplit le champ de lien visé. */
  A['cms-pick-into'] = (btn) => {
    const id = btn.dataset.target;
    pick({ kind: 'image', onPick: (ref) => { const el = document.getElementById(id); if (el) { el.value = ref; el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); } } });
  };

  Object.assign(R, { 'admin/medias': () => K.adminGate('media', mediaTab) });
})();
