/* Studio Prism — administration du CMS : PROJETS / RÉALISATIONS (script classique, chargé après js/cmsmedia.js).
 *
 *  #/admin/projets : liste, recherche, statuts uniformes Brouillon / Publié / Archivé (dépublié), création, modification, suppression.
 *
 * Un projet est enregistré UNE fois (collection « projects ») et peut être affiché sur plusieurs pages (sections « Cartes » de l'éditeur de
 * pages, page « Réalisations », fiche #/projets/<adresse>) sans jamais être recopié. Seuls les projets PUBLIÉS sont lisibles par les visiteurs :
 * c'est firestore.rules qui l'impose côté serveurs Google. Les droits d'écriture sont réservés aux administrateurs actifs. */
(function () {
  'use strict';
  const K = window.SP && window.SP.kit, CMS = window.SP && window.SP.cms, X = window.SP && window.SP.cmsx;
  if (!K || !CMS || !X || !X.pick) return;
  const { esc } = K;
  const { cd, msg } = X;
  const RESERVED = ['archivision', 'prism-game', 'prism-3d'];    // adresses déjà prises par des pages du site
  const LABEL = { published: 'Publié', draft: 'Brouillon', archived: 'Archivé' };
  const CLS = { published: 'ok', draft: 'dr', archived: 'ar' };
  const URL_RE = /^(https:\/\/[!#-:=?-~]+|#\/[!#-:=?-~]*|assets\/[!#-:=?-~]+)$/;
  const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const qs = (s) => document.querySelector(s);

  const PJ = { list: null, products: [], q: '', st: '', form: null, shell: null, busy: false };

  /* ---- confirmation (même principe que l'éditeur de pages) */
  let CF = null;
  function confirmBox(title, body, okLabel, fn, danger) {
    CF = fn;
    A.x();
    modal(`<h3>${esc(title)}</h3>${body}<p class="fe" id="pj-cf-err" role="alert"></p><p style="margin-top:14px"><button type="button" class="btn ${danger ? 'btn-danger' : 'b1'}" data-a="pj-cf-ok">${esc(okLabel)}</button></p>`);
  }
  A['pj-cf-ok'] = async (btn) => {
    if (!CF) return;
    btn.disabled = true;
    try { await CF(); A.x(); } catch (e) {
      X.log('Projet :', e);
      const el = document.getElementById('pj-cf-err');
      if (el) el.textContent = msg(e);
      btn.disabled = false;
    }
  };

  /* ---- données */
  async function load() {
    const d = await cd();
    const [list, products] = await Promise.all([d.adminListProjects(), d.adminListProducts().catch(() => []), X.loadMedia().catch(() => null)]);
    PJ.list = list; PJ.products = products;
  }

  /* Pages (publiées ou brouillons) dont une section « Cartes » affiche ce projet. */
  async function usage(id) {
    const d = await cd();
    const [pages, drafts] = await Promise.all([d.adminListPages(), d.adminListDrafts()]);
    const ref = 'project:' + id, out = [];
    const uses = (p) => ((p.content && p.content.extra) || []).some((x) => Array.isArray(x.items) && x.items.some((it) => it && it.ref === ref));
    pages.forEach((p) => { if (uses(p)) out.push({ label: p.title || p.id, draft: false }); });
    drafts.forEach((p) => { if (uses(p)) out.push({ label: p.title || p.id, draft: true }); });
    return out;
  }

  /* ---- liste */
  const filtered = () => {
    const q = PJ.q.trim().toLowerCase();
    return (PJ.list || []).filter((p) => (!PJ.st || p.status === PJ.st) && (!q || [p.title, p.id, p.summary, p.year, (p.tags || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0));
  };

  function actions(p) {
    const b = (a, t, cls) => `<button type="button" class="btn ${cls || 'b4'}" data-a="${a}" data-id="${esc(p.id)}" aria-label="${esc(t)} : ${esc(p.title)}">${t}</button>`;
    return b('pj-edit', 'Modifier', 'b1') +
      (p.status === 'published' ? b('pj-unpub', 'Dépublier') : p.status === 'draft' ? b('pj-pub', 'Publier') : b('pj-pub', 'Republier') + b('pj-todraft', 'En brouillon')) +
      b('pj-del', 'Supprimer') +
      (p.status === 'published' ? `<a class="btn b4" href="#/projets/${esc(p.id)}" target="_blank" rel="noopener" aria-label="Voir le projet ${esc(p.title)} sur le site">Voir</a>` : '');
  }

  function paintList() {
    const box = qs('#pj-list');
    if (!box) return;
    const list = filtered();
    const inf = qs('#pj-info');
    if (inf) inf.textContent = `${list.length} projet${list.length > 1 ? 's' : ''}${list.length !== (PJ.list || []).length ? ` sur ${(PJ.list || []).length}` : ''}`;
    if (!(PJ.list || []).length) { box.innerHTML = '<div class="panel"><h3>Aucun projet</h3><p class="mut" style="margin-top:6px">Créez un premier projet avec « Nouveau projet ». Les réalisations d’origine du site (ArchiVision, concepts…) restent affichées comme avant.</p></div>'; return; }
    if (!list.length) { box.innerHTML = '<div class="panel"><p>Aucun projet ne correspond à ces filtres.</p></div>'; return; }
    box.innerHTML = `<div class="cmsa-list">${list.map((p) => {
      const u = p.image ? X.refUrl(p.image) : '';
      return `<div class="cmsa-row"><div class="cmsa-th" style="width:56px;height:56px;flex:none;border-radius:8px;overflow:hidden;background:var(--soft)">${u ? `<img src="${esc(u)}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy">` : ''}</div>` +
        `<div class="cmsa-t"><b>${esc(p.title)}</b><small>#/projets/${esc(p.id)}${p.year ? ' · ' + esc(p.year) : ''}${(p.tags || []).length ? ' · ' + esc((p.tags || []).join(', ')) : ''}${p.productId ? ' · produit : ' + esc(p.productId) : ''}</small></div>` +
        `<div class="cmsa-act"><span class="cmsa-b ${CLS[p.status] || 'df'}">${LABEL[p.status] || esc(p.status)}</span>${p.featured ? ' <span class="cmsa-b">Mis en avant</span>' : ''}</div><div class="cmsa-act">${actions(p)}</div></div>`;
    }).join('')}</div>`;
  }

  function projectsTab(shell) {
    PJ.shell = shell; PJ.form = null;
    V(shell(`<p class="lead">Réalisations et projets du site. Un projet n’est enregistré qu’une fois : il peut ensuite être affiché sur plusieurs pages (sections « Cartes » de l’éditeur de pages). Seuls les projets <b>publiés</b> sont visibles des visiteurs.</p>` +
      `<div class="cmsa-tools"><div class="cmsa-f"><label for="pj-q">Rechercher</label><input id="pj-q" type="text" autocomplete="off" placeholder="Titre, adresse, étiquette…" value="${esc(PJ.q)}"></div>` +
      `<div class="cmsa-f"><label for="pj-st">Statut</label><select id="pj-st">${[['', 'Tous'], ['published', 'Publié'], ['draft', 'Brouillon'], ['archived', 'Archivé']].map(([v, t]) => `<option value="${v}"${PJ.st === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>` +
      `<button type="button" class="btn b1" data-a="pj-new">+ Nouveau projet</button><p class="mut" id="pj-info" role="status" aria-live="polite" style="margin:0"></p></div>` +
      `<div id="pj-list" aria-live="polite"><p class="mut">Chargement des projets…</p></div>`));
    load().then(paintList).catch((e) => {
      X.log('Projets :', e);
      const b = qs('#pj-list');
      if (b) b.innerHTML = `<div class="panel"><p>${esc(msg(e))}</p><p style="margin-top:12px"><button class="btn b1" data-a="pj-retry">Réessayer</button></p></div>`;
    });
  }
  A['pj-retry'] = () => { const b = qs('#pj-list'); if (b) b.innerHTML = '<p class="mut">Chargement…</p>'; load().then(paintList).catch((e) => { if (b) b.innerHTML = `<div class="panel"><p>${esc(msg(e))}</p><p style="margin-top:12px"><button class="btn b1" data-a="pj-retry">Réessayer</button></p></div>`; }); };

  document.addEventListener('input', (e) => { if (e.target.id === 'pj-q') { PJ.q = e.target.value; paintList(); } });
  document.addEventListener('change', (e) => { if (e.target.id === 'pj-st') { PJ.st = e.target.value; paintList(); } });

  /* ---- changement de statut (publication, dépublication) : toujours confirmé */
  const byId = (id) => (PJ.list || []).find((p) => p.id === id);
  async function setStatus(p, status, done) {
    await (await cd()).setProjectStatus(p.id, status);
    p.status = status;
    CMS.loadProjects(true);
    paintList();
    toast(done);
  }
  A['pj-pub'] = (b) => {
    const p = byId(b.dataset.id);
    if (!p) return;
    confirmBox(`${p.status === 'archived' ? 'Republier' : 'Publier'} « ${p.title} » ?`, `<p>Le projet sera visible <b>immédiatement par tous les visiteurs</b> (page « Réalisations », fiche #/projets/${esc(p.id)} et sections qui l’affichent).</p>`, 'Publier maintenant',
      () => setStatus(p, 'published', 'Projet publié.'));
  };
  A['pj-unpub'] = (b) => {
    const p = byId(b.dataset.id);
    if (!p) return;
    confirmBox(`Dépublier « ${p.title} » ?`, `<p>Le projet disparaît du site (liste, fiche et sections qui l’affichent). Il est archivé, <b>rien n’est effacé</b> : vous pourrez le republier.</p>`, 'Dépublier',
      () => setStatus(p, 'archived', 'Projet dépublié (archivé).'));
  };
  A['pj-todraft'] = (b) => {
    const p = byId(b.dataset.id);
    if (!p) return;
    confirmBox(`Remettre « ${p.title} » en brouillon ?`, `<p>Le projet reste invisible des visiteurs et redevient modifiable comme un brouillon.</p>`, 'Remettre en brouillon', () => setStatus(p, 'draft', 'Projet remis en brouillon.'));
  };
  A['pj-del'] = async (b) => {
    const p = byId(b.dataset.id);
    if (!p) return;
    b.disabled = true;
    let use = [];
    try { use = await usage(p.id); } catch (e) { toast(msg(e)); b.disabled = false; return; }
    b.disabled = false;
    confirmBox(`Supprimer « ${p.title} » ?`, `<p><b>Suppression définitive</b> : le projet est effacé de la base. Pour seulement le retirer du site, utilisez plutôt « Dépublier ».</p>` +
      (use.length ? `<p class="cmsa-warn">Ce projet est affiché par ${use.length > 1 ? 'des pages' : 'une page'} : <b>${esc(use.map((u) => u.label + (u.draft ? ' (brouillon)' : '')).join(', '))}</b>. Ces cartes disparaîtront.</p>` : '<p class="mut">Ce projet n’est affiché dans aucune section de page.</p>'), 'Supprimer définitivement', async () => {
      await (await cd()).deleteProject(p.id);
      PJ.list = PJ.list.filter((x) => x.id !== p.id);
      CMS.loadProjects(true);
      paintList();
      toast('Projet supprimé.');
    }, true);
  };

  /* ---- formulaire (création / modification) */
  const blank = () => ({ isNew: true, id: '', title: '', summary: '', description: '', image: '', link: '', productId: '', tags: '', year: '', status: 'draft', featured: false,
    displayOrder: Math.min(9999, ((PJ.list || []).reduce((m, p) => Math.max(m, p.displayOrder || 0), 0)) + 1), idTouched: false });
  const fromDoc = (p) => ({ isNew: false, id: p.id, title: p.title || '', summary: p.summary || '', description: p.description || '', image: p.image || '', link: p.link || '', productId: p.productId || '',
    tags: (p.tags || []).join(', '), year: p.year || '', status: p.status || 'draft', featured: !!p.featured, displayOrder: p.displayOrder || 0, oldStatus: p.status, createdAt: p.createdAt });

  const fld = (id, label, control, hint) => `<div class="acc-f"><label for="${id}">${label}</label>${control}${hint ? `<p class="acc-h" id="${id}-h">${hint}</p>` : ''}<p class="fe" id="${id}-e" role="alert"></p></div>`;

  function paintForm() {
    const f = PJ.form, box = qs('#pj-form');
    if (!f || !box) return;
    const u = f.image ? X.refUrl(f.image) : '';
    box.innerHTML = `<form data-f="pj-save" novalidate class="panel" aria-labelledby="pj-form-t"><h2 id="pj-form-t" style="font-size:22px;margin-bottom:6px">${f.isNew ? 'Nouveau projet' : 'Modifier « ' + esc(f.title) + ' »'}</h2>` +
      fld('pj-title', 'Titre *', `<input id="pj-title" name="title" type="text" maxlength="120" value="${esc(f.title)}" autocomplete="off">`) +
      fld('pj-id', 'Adresse du projet *', `<input id="pj-id" name="id" type="text" maxlength="60" value="${esc(f.id)}" autocomplete="off"${f.isNew ? '' : ' readonly'} aria-describedby="pj-id-h">`,
        f.isNew ? 'Adresse publique : <b id="pj-id-u">#/projets/' + esc(f.id || '…') + '</b> (minuscules, chiffres, tirets ; 2 à 60 caractères). Elle ne pourra plus être changée.' : 'Adresse publique : #/projets/' + esc(f.id) + ' (non modifiable).') +
      fld('pj-sum', 'Résumé (300 caractères au plus)', `<textarea id="pj-sum" name="summary" rows="2" maxlength="300">${esc(f.summary)}</textarea>`) +
      fld('pj-desc', 'Description (3 000 caractères au plus)', `<textarea id="pj-desc" name="description" rows="8" maxlength="3000" aria-describedby="pj-desc-h">${esc(f.description)}</textarea>`, 'Une ligne vide sépare deux paragraphes. Texte simple : aucun code n’est interprété.') +
      `<div class="acc-f"><span class="cmsa-l" id="pj-img-l">Image</span><div class="cmsa-img" role="group" aria-labelledby="pj-img-l">${u ? `<img src="${esc(u)}" alt="">` : ''}<code>${f.image ? esc(/^media:/.test(f.image) ? X.refName(f.image) : trunc(f.image, 50)) : 'aucune image'}</code>` +
      `<button type="button" class="btn b4" id="pj-pick" data-a="pj-pick">${f.image ? 'Changer' : 'Choisir'} dans la médiathèque</button>${f.image ? '<button type="button" class="btn b4" data-a="pj-clr">Retirer</button>' : ''}</div><p class="fe" id="pj-image-e" role="alert"></p></div>` +
      fld('pj-link', 'Lien « En savoir plus » (facultatif)', `<input id="pj-link" name="link" type="text" maxlength="300" value="${esc(f.link)}" autocomplete="off" aria-describedby="pj-link-h">`, 'https://… ou #/page du site.') +
      fld('pj-prod', 'Produit associé (facultatif)', `<select id="pj-prod" name="productId"><option value="">Aucun</option>${PJ.products.map((p) => `<option value="${esc(p.id)}"${p.id === f.productId ? ' selected' : ''}>${esc(p.name || p.id)}${p.status && p.status !== 'published' ? ' (' + esc(p.status) + ')' : ''}</option>`).join('')}${f.productId && !PJ.products.some((p) => p.id === f.productId) ? `<option value="${esc(f.productId)}" selected>${esc(f.productId)} (introuvable)</option>` : ''}</select>`, 'Le produit s’affiche dans la fiche du projet, sans être recopié.') +
      fld('pj-tags', 'Étiquettes (séparées par des virgules, 8 au plus)', `<input id="pj-tags" name="tags" type="text" maxlength="300" value="${esc(f.tags)}" autocomplete="off">`) +
      `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0 16px">` + fld('pj-year', 'Année', `<input id="pj-year" name="year" type="text" maxlength="10" value="${esc(f.year)}" autocomplete="off">`) +
      fld('pj-order', 'Ordre d’affichage (0 à 9999)', `<input id="pj-order" name="displayOrder" type="number" min="0" max="9999" step="1" value="${esc(f.displayOrder)}" inputmode="numeric">`) +
      fld('pj-status', 'Statut', `<select id="pj-status" name="status">${['draft', 'published', 'archived'].map((v) => `<option value="${v}"${f.status === v ? ' selected' : ''}>${LABEL[v]}${v === 'published' ? ' (visible des visiteurs)' : v === 'archived' ? ' (dépublié)' : ''}</option>`).join('')}</select>`) + `</div>` +
      `<label class="opt"><input type="checkbox" name="featured"${f.featured ? ' checked' : ''}> Mettre en avant</label>` +
      `<p class="fe" id="pj-err" role="alert"></p><p style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button type="submit" class="btn b1">${f.isNew ? 'Créer le projet' : 'Enregistrer'}</button><button type="button" class="btn b4" data-a="pj-cancel">Annuler</button></p></form>`;
    const t = qs('#pj-title');
    if (t && f.isNew) t.focus();
  }

  const showForm = (f) => {
    PJ.form = f;
    const list = qs('#pj-listwrap'), box = qs('#pj-form');
    if (list) list.hidden = true;
    if (box) { box.hidden = false; paintForm(); box.scrollIntoView({ block: 'start' }); }
  };
  A['pj-new'] = () => showForm(blank());
  A['pj-edit'] = (b) => { const p = byId(b.dataset.id); if (p) showForm(fromDoc(p)); };
  A['pj-cancel'] = () => {
    PJ.form = null;
    const list = qs('#pj-listwrap'), box = qs('#pj-form');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    if (list) list.hidden = false;
  };
  A['pj-pick'] = () => X.pick({ kind: 'image', onPick: (ref) => { if (!PJ.form) return; syncForm(); PJ.form.image = ref; paintForm(); const b = qs('#pj-pick'); if (b) b.focus(); } });
  A['pj-clr'] = () => { if (!PJ.form) return; syncForm(); PJ.form.image = ''; paintForm(); const b = qs('#pj-pick'); if (b) b.focus(); };

  /* Recopie les champs saisis dans l'état avant de redessiner le formulaire (choix d'une image). */
  function syncForm() {
    const fm = qs('form[data-f=pj-save]'), f = PJ.form;
    if (!fm || !f) return;
    ['title', 'summary', 'description', 'link', 'productId', 'tags', 'year', 'status'].forEach((k) => { if (fm.elements[k]) f[k] = fm.elements[k].value; });
    if (fm.elements.displayOrder) f.displayOrder = fm.elements.displayOrder.value;
    if (fm.elements.featured) f.featured = fm.elements.featured.checked;
    if (f.isNew && fm.elements.id) f.id = fm.elements.id.value;
  }

  document.addEventListener('input', (e) => {
    const t = e.target, f = PJ.form;
    if (!f || !f.isNew) return;
    if (t.id === 'pj-title' && !f.idTouched) {
      const idEl = qs('#pj-id');
      if (idEl) { idEl.value = CMS.slugify(t.value).slice(0, 60); const u = qs('#pj-id-u'); if (u) u.textContent = '#/projets/' + (idEl.value || '…'); }
    } else if (t.id === 'pj-id') { f.idTouched = true; const u = qs('#pj-id-u'); if (u) u.textContent = '#/projets/' + (t.value || '…'); }
  });

  document.addEventListener('submit', async (e) => {
    const fm = e.target;
    if (!fm.dataset || fm.dataset.f !== 'pj-save') return;
    e.preventDefault();
    const f = PJ.form;
    if (!f) return;
    syncForm();
    ['title', 'id', 'sum', 'desc', 'link', 'tags', 'year', 'order', 'status', 'image'].forEach((k) => { const el = document.getElementById('pj-' + k + '-e'); if (el) el.textContent = ''; });
    const er = qs('#pj-err'); er.textContent = '';
    const bad = (k, m) => { const el = document.getElementById('pj-' + k + '-e'); if (el) el.textContent = m; return true; };
    let invalid = false;
    const title = f.title.trim(), id = f.id.trim();
    if (!title) invalid = bad('title', 'Saisissez le titre du projet.') || invalid;
    if (f.isNew) {
      if (!/^[a-z0-9][a-z0-9_-]{1,59}$/.test(id)) invalid = bad('id', 'Adresse invalide : 2 à 60 caractères, minuscules, chiffres, tirets.') || invalid;
      else if (RESERVED.indexOf(id) >= 0) invalid = bad('id', 'Cette adresse est déjà utilisée par une page du site : choisissez-en une autre.') || invalid;
    }
    if (f.summary.length > 300) invalid = bad('sum', '300 caractères au plus.') || invalid;
    if (f.description.length > 3000) invalid = bad('desc', '3 000 caractères au plus.') || invalid;
    const link = f.link.trim();
    if (link && (link.length > 300 || !URL_RE.test(link))) invalid = bad('link', 'Adresse non valide : utilisez https://… ou #/page.') || invalid;
    const tags = f.tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.length > 8) invalid = bad('tags', '8 étiquettes au plus.') || invalid;
    if (tags.some((t) => t.length > 30)) invalid = bad('tags', 'Chaque étiquette : 30 caractères au plus.') || invalid;
    if (String(f.year).trim().length > 10) invalid = bad('year', '10 caractères au plus.') || invalid;
    const order = Number(f.displayOrder);
    if (!Number.isInteger(order) || order < 0 || order > 9999) invalid = bad('order', 'Nombre entier de 0 à 9999.') || invalid;
    if (f.image && !(CMS.MEDIA_RE.test(f.image) || (f.image.length <= 300 && URL_RE.test(f.image)))) invalid = bad('image', 'Image non valable.') || invalid;
    if (invalid) { er.textContent = 'Corrigez les champs signalés.'; const first = fm.querySelector('.fe:not(:empty)'); if (first) { const inp = first.parentNode.querySelector('input,textarea,select'); if (inp) inp.focus(); } return; }
    const p = { id, title, summary: f.summary.trim(), description: f.description.trim(), image: f.image || '', link, productId: f.productId || '', tags, year: String(f.year).trim(), status: f.status, featured: !!f.featured, displayOrder: order };
    const go2 = async () => {
      await (await cd()).saveProject(p, f.isNew);
      const row = Object.assign({}, byId(id) || {}, p);
      if (f.isNew) PJ.list.push(row); else PJ.list = PJ.list.map((x) => (x.id === id ? row : x));
      PJ.list.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || String(a.title || '').localeCompare(String(b.title || ''), 'fr'));
      CMS.loadProjects(true);
      A['pj-cancel']();
      paintList();
      toast(f.isNew ? 'Projet créé.' : 'Projet enregistré.');
    };
    if (p.status === 'published' && (f.isNew || f.oldStatus !== 'published')) {
      confirmBox(`Publier « ${title} » ?`, `<p>Le projet sera visible <b>immédiatement par tous les visiteurs</b>.</p>`, 'Enregistrer et publier', go2);
      return;
    }
    if (p.status !== 'published' && !f.isNew && f.oldStatus === 'published') {
      confirmBox(`Retirer « ${title} » du site ?`, `<p>En passant ce projet en « ${LABEL[p.status]} », il <b>disparaît du site</b> (rien n’est effacé).</p>`, 'Enregistrer', go2);
      return;
    }
    const btn = fm.querySelector('button[type=submit]');
    btn.disabled = true;
    try { await go2(); } catch (e2) { X.log('Enregistrement du projet :', e2); er.textContent = msg(e2); btn.disabled = false; }
  });

  /* ---- route */
  Object.assign(R, {
    'admin/projets': () => K.adminGate('projects', (p, shell) => {
      projectsTab((inner) => shell(`<div id="pj-listwrap">${inner}</div><div id="pj-form" hidden></div>`));
    })
  });
})();
