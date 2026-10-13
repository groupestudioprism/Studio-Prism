/* Studio Prism — administration du CMS : LISTE DES PAGES et ÉDITEUR DE PAGE (script classique, chargé après js/cmsmedia.js).
 *
 *  #/admin/pages        toutes les pages du site (regroupées), leur statut (Contenu d'origine / Publié / Brouillon / Archivé), création de pages ;
 *  #/admin/pages/<id>   éditeur : sections (ordre, visibilité, sections typées), textes et liens, titre / SEO, aperçu en direct (iframe),
 *                       enregistrement automatique du brouillon, publication, dépublication.
 *
 * Rien n'est jamais publié sans clic explicite et confirmation. L'aperçu est une copie du site (même origine) à laquelle on envoie le
 * brouillon par postMessage : aucune donnée n'est lue ni écrite par l'aperçu. Les droits réels sont imposés par firestore.rules. */
(function () {
  'use strict';
  const K = window.SP && window.SP.kit, CMS = window.SP && window.SP.cms, X = window.SP && window.SP.cmsx;
  if (!K || !CMS || !X || !X.pick) return;
  const { esc } = K;
  const { cd, msg } = X;
  const TYPES = CMS.TYPES;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const qs = (s) => document.querySelector(s);
  const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const hhmm = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const emptyContent = () => ({ v: 1, seo: {}, texts: {}, attrs: {}, layout: [], hidden: [], extra: [] });
  const newId = (taken) => { let id; do { id = 'x' + (Math.random().toString(36) + '00000').slice(2, 8); } while (taken && taken.indexOf(id) >= 0); return id; };
  const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

  let E = null;          // éditeur ouvert
  let loadTok = 0;
  let CF = null;         // action de la fenêtre de confirmation en cours

  /* ------------------------------------------------------------------ outils */
  function confirmBox(title, body, okLabel, fn, danger) {
    CF = fn;
    A.x();
    modal(`<h3>${esc(title)}</h3>${body}<p class="fe" id="cf-err" role="alert"></p><p style="margin-top:14px"><button type="button" class="btn ${danger ? 'btn-danger' : 'b1'}" data-a="cf-ok">${esc(okLabel)}</button></p>`);
  }
  A['cf-ok'] = async (btn) => {
    if (!CF) return;
    btn.disabled = true;
    try {
      const r = await CF(btn);
      if (r !== 'keep') A.x();
    } catch (e) {
      X.log('Action refusée :', e);
      const el = document.getElementById('cf-err');
      if (el) el.textContent = msg(e);
      btn.disabled = false;
    }
  };
  const info = (title, body) => { CF = null; A.x(); modal(`<h3>${esc(title)}</h3>${body}`); };

  const validImg = (v) => typeof v === 'string' && (CMS.MEDIA_RE.test(v) || !!CMS.safeImg(v));
  const routeLabel = (r) => (r.routes && r.routes.length ? r.routes.map((x) => '#/' + x).join(' · ') : r.prefix ? '#/' + r.prefix + '…' : r.global ? 'Pied de page de toutes les pages' : '');

  /* ================================================================== LISTE DES PAGES */
  const PL = { pages: new Map(), drafts: new Map(), q: '', st: '', ok: false };

  function docState(id) {
    const pub = PL.pages.get(id), dr = PL.drafts.get(id);
    return { pub, dr, published: !!pub && pub.status === 'published', archived: !!pub && pub.status === 'archived', draft: !!dr, orig: !pub && !dr };
  }
  const badgesFor = (s) => (s.published ? '<span class="cmsa-b ok">Publié</span>' : s.archived ? '<span class="cmsa-b ar">Archivé</span>' : '') +
    (s.draft ? ` <span class="cmsa-b dr">${s.pub ? 'Brouillon en cours' : 'Brouillon'}</span>` : '') + (s.orig ? '<span class="cmsa-b df">Contenu d’origine</span>' : '');

  function customRegs() {
    const ids = new Set();
    PL.pages.forEach((p, id) => { if (/^c-/.test(id)) ids.add(id); });
    PL.drafts.forEach((p, id) => { if (/^c-/.test(id)) ids.add(id); });
    return Array.from(ids).sort().map((id) => {
      const src = PL.drafts.get(id) || PL.pages.get(id);
      return { id, label: (src && src.title) || id.slice(2), custom: true, routes: ['p/' + id.slice(2)], multi: true };
    });
  }

  function rowHtml(reg) {
    const s = docState(reg.id), src = s.dr || s.pub;
    const title = reg.custom ? reg.label : reg.label;
    const view = reg.custom ? (s.published ? '#/p/' + reg.id.slice(2) : '') : (reg.routes && reg.routes.length ? '#/' + reg.routes[0] : '');
    return `<div class="cmsa-row"><div class="cmsa-t"><b>${esc(title)}</b><small>${esc(routeLabel(reg))}${src && src.updatedAt ? ' · modifiée le ' + esc(X.fdate(src.updatedAt)) : ''}</small></div>` +
      `<div class="cmsa-act">${badgesFor(s)}</div><div class="cmsa-act"><a class="btn b1" href="#/admin/pages/${esc(reg.id)}" aria-label="Modifier la page ${esc(title)}">Modifier</a>` +
      `${view ? `<a class="btn b4" href="${esc(view)}" target="_blank" rel="noopener" aria-label="Voir la page ${esc(title)} sur le site">Voir</a>` : ''}</div></div>`;
  }

  function paintList() {
    const box = qs('#pl-list');
    if (!box) return;
    const q = PL.q.trim().toLowerCase();
    const ok = (reg) => {
      const s = docState(reg.id);
      if (q && [reg.label, reg.id, routeLabel(reg)].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return PL.st === 'published' ? s.published : PL.st === 'draft' ? s.draft : PL.st === 'archived' ? s.archived : PL.st === 'orig' ? s.orig : true;
    };
    let html = '', n = 0;
    const customs = customRegs().filter(ok);
    n += customs.length;
    html += `<h2 class="cmsa-gh">Pages personnalisées</h2>` + (customs.length ? `<div class="cmsa-list">${customs.map(rowHtml).join('')}</div>` : `<p class="mut">${q || PL.st ? 'Aucune page personnalisée ne correspond.' : 'Aucune page personnalisée pour le moment. Créez-en une avec « Nouvelle page ».'}</p>`);
    CMS.GROUPS.forEach((g, gi) => {
      const rows = CMS.REG.filter((r) => r.group === gi && ok(r));
      n += rows.length;
      if (rows.length) html += `<h2 class="cmsa-gh">${esc(g)}</h2><div class="cmsa-list">${rows.map(rowHtml).join('')}</div>`;
    });
    box.innerHTML = html;
    const inf = qs('#pl-info');
    if (inf) inf.textContent = `${n} page${n > 1 ? 's' : ''} affichée${n > 1 ? 's' : ''}`;
  }

  async function loadList() {
    const box = qs('#pl-list');
    try {
      const d = await cd();
      const [pages, drafts] = await Promise.all([d.adminListPages(), d.adminListDrafts()]);
      PL.pages = new Map(pages.map((p) => [p.id, p])); PL.drafts = new Map(drafts.map((p) => [p.id, p])); PL.ok = true;
      paintList();
    } catch (e) {
      X.log('Liste des pages :', e);
      if (box) box.innerHTML = `<div class="panel"><p>${esc(msg(e))}</p><p style="margin-top:12px"><button class="btn b1" data-a="pl-retry">Réessayer</button></p></div>`;
    }
  }
  A['pl-retry'] = () => { const b = qs('#pl-list'); if (b) b.innerHTML = '<p class="mut">Chargement…</p>'; loadList(); };

  function pagesList(shell) {
    V(shell(`<p class="lead">Choisissez la page à modifier. Les pages gardent leur contenu d’origine tant que vous n’en publiez pas une nouvelle version : rien n’est jamais supprimé.</p>` +
      `<div class="cmsa-tools"><div class="cmsa-f"><label for="pl-q">Rechercher une page</label><input id="pl-q" type="text" autocomplete="off" placeholder="Nom ou adresse…" value="${esc(PL.q)}"></div>` +
      `<div class="cmsa-f"><label for="pl-st">Statut</label><select id="pl-st">${[['', 'Tous'], ['published', 'Publié'], ['draft', 'Brouillon'], ['archived', 'Archivé'], ['orig', 'Contenu d’origine']].map(([v, t]) => `<option value="${v}"${PL.st === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>` +
      `<button type="button" class="btn b1" data-a="pl-new">+ Nouvelle page</button><p class="mut" id="pl-info" role="status" aria-live="polite" style="margin:0"></p></div>` +
      `<div id="pl-list" aria-live="polite"><p class="mut">Chargement des pages…</p></div>`));
    loadList();
  }

  document.addEventListener('input', (e) => { if (e.target.id === 'pl-q') { PL.q = e.target.value; paintList(); } });
  document.addEventListener('change', (e) => { if (e.target.id === 'pl-st') { PL.st = e.target.value; paintList(); } });

  /* ---- nouvelle page personnalisée */
  A['pl-new'] = () => {
    A.x();
    modal(`<h3>Nouvelle page</h3><p class="mut">La page est créée en brouillon : elle n’est visible de personne tant que vous ne l’avez pas publiée.</p><form data-f="pl-new" novalidate>` +
      `<div class="acc-f"><label for="pn-t">Titre de la page</label><input id="pn-t" name="t" type="text" maxlength="120" autocomplete="off"><p class="fe" id="e-pn-t" role="alert"></p></div>` +
      `<div class="acc-f"><label for="pn-s">Adresse</label><input id="pn-s" name="s" type="text" maxlength="56" autocomplete="off" aria-describedby="h-pn-s"><p class="acc-h" id="h-pn-s">Adresse publique : <b id="pn-u">#/p/…</b> (lettres minuscules, chiffres et tirets ; elle ne pourra plus être changée).</p><p class="fe" id="e-pn-s" role="alert"></p></div>` +
      `<p class="fe" id="pn-err" role="alert"></p><p style="margin-top:12px"><button class="btn b1" type="submit">Créer la page</button></p></form>`);
    const t = document.getElementById('pn-t');
    if (t) t.focus();
  };
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'pn-t') { const s = document.getElementById('pn-s'); if (s && !s.dataset.touched) { s.value = CMS.slugify(t.value).slice(0, 56); } const u = document.getElementById('pn-u'); if (u && s) u.textContent = '#/p/' + (s.value || '…'); }
    else if (t.id === 'pn-s') { t.dataset.touched = '1'; const u = document.getElementById('pn-u'); if (u) u.textContent = '#/p/' + (t.value || '…'); }
  });
  document.addEventListener('submit', async (e) => {
    const fm = e.target;
    if (!fm.dataset || fm.dataset.f !== 'pl-new') return;
    e.preventDefault();
    const title = fm.elements.t.value.trim(), slug = fm.elements.s.value.trim();
    const et = document.getElementById('e-pn-t'), es = document.getElementById('e-pn-s'), er = document.getElementById('pn-err'), btn = fm.querySelector('button[type=submit]');
    et.textContent = ''; es.textContent = ''; er.textContent = '';
    let bad = false;
    if (!title) { et.textContent = 'Saisissez le titre de la page.'; bad = true; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 56) { es.textContent = 'Adresse invalide : lettres minuscules, chiffres et tirets seulement (56 caractères au plus).'; bad = true; }
    if (bad) return;
    btn.disabled = true;
    try {
      const d = await cd(), id = 'c-' + slug;
      const [a, b] = await Promise.all([d.adminGetPage(id), d.adminGetDraft(id)]);
      if (a || b) { es.textContent = 'Une page personnalisée utilise déjà cette adresse.'; btn.disabled = false; return; }
      await d.savePageDraft(id, { kind: 'custom', title, slug, footer: false, content: emptyContent() }, 0);
      PL.drafts.set(id, { id, kind: 'custom', title, slug, footer: false, content: emptyContent(), baseRevision: 0 });
      A.x();
      go('#/admin/pages/' + id);
    } catch (e2) { X.log('Création de page :', e2); er.textContent = msg(e2); btn.disabled = false; }
  });

  /* ================================================================== ÉDITEUR */

  /* Contenu tel qu'il sera enregistré (forme garantie, champs vides retirés). */
  function pack(w) {
    const c = CMS.cleanContent(clone(w.content));
    const seo = {};
    ['title', 'description', 'image'].forEach((k) => { const v = String(c.seo[k] || '').trim(); if (v) seo[k] = v; });
    if (c.seo.noindex) seo.noindex = true;
    return { v: 1, seo, texts: c.texts, attrs: c.attrs, layout: c.layout, hidden: c.hidden, extra: c.extra };
  }
  const sigOf = (w) => JSON.stringify([w.title || '', !!w.footer, pack(w)]);
  const ext = (id) => (E ? E.w.content.extra.find((x) => x.id === id) : null);

  function previewRoute(e) {
    const reg = e.reg;
    if (reg.custom) return 'p/' + reg.id.slice(2);
    try {
      if (reg.id === 'fiche-produit') {
        const l = (window.SP.catalog && window.SP.catalog.all && window.SP.catalog.all()) || [];
        const p = l.find((x) => x.status === 'published') || l[0];
        return p ? 'produits/' + p.id : 'produits';
      }
      if (reg.id === 'fiche-offre') return 'abonnements/archivision';
      if (reg.id === 'fiche-jeu') return 'prism-game/' + slug(G[0][0]);
      if (reg.id === 'fiche-3d') return 'prism-3d/' + P[0][0];
    } catch (err) { /* repli ci-dessous */ }
    return CMS.routeOf(reg);
  }

  async function loadEditor(id) {
    const d = await cd();
    const [pub, draft] = await Promise.all([d.adminGetPage(id), d.adminGetDraft(id)]);
    const side = await Promise.all([X.loadMedia().catch(() => null), d.adminListProjects().catch(() => null), d.adminListProducts().catch(() => null),
      window.SP.catalog ? window.SP.catalog.load().catch(() => null) : null]);
    let reg = CMS.BYID.get(id) || null;
    if (!reg && /^c-[a-z0-9-]{1,56}$/.test(id) && (pub || draft)) reg = { id, label: (draft || pub).title || id.slice(2), custom: true, multi: true, routes: ['p/' + id.slice(2)], group: -1 };
    if (!reg) return null;
    const src = draft || pub;
    const w = {
      kind: reg.custom ? 'custom' : 'builtin', title: reg.custom ? (src ? src.title || '' : '') : reg.label, slug: reg.custom ? id.slice(2) : id,
      footer: !!(reg.custom && src && src.footer), content: Object.assign(emptyContent(), clone(CMS.cleanContent(src && src.content)))
    };
    w.content.seo = Object.assign({}, w.content.seo);
    const e = {
      id, reg, pub, hasDraft: !!draft, w, base: draft ? (draft.baseRevision || 0) : pub ? (pub.revision || 0) : 0,
      projects: side[1] || [], products: side[2] || [], tab: 'sec', adding: false, open: {}, openU: {}, filter: '', device: 'd',
      units: null, tpl: !!reg.tpl, ready: false, away: null, scrolled: false, err: '', saving: false, publishing: false, tm: 0, pm: 0, savedAt: draft && draft.updatedAt && draft.updatedAt.toDate ? draft.updatedAt.toDate() : null
    };
    e.savedSig = sigOf(w);
    e.dirty = false;
    e.pubSig = pub && pub.status === 'published' ? sigOf({ title: pub.title || '', footer: !!pub.footer, content: Object.assign(emptyContent(), clone(CMS.cleanContent(pub.content))) }) : null;
    e.emptySig = sigOf({ title: w.title, footer: false, content: emptyContent() });
    e.route = previewRoute(e);
    return e;
  }

  function openEditor(id, shell) {
    if (E && E.id === id) { E.shell = shell; renderEditor(); return; }     // la route est rejouée : on garde le travail en mémoire
    if (E) leave();
    const tok = ++loadTok;
    V(shell('<p class="lead" role="status">Chargement de l’éditeur…</p>'));
    loadEditor(id).then((e) => {
      if (tok !== loadTok || CUR.indexOf('admin/pages/' + id) !== 0) return;
      if (!e) { V(shell(`<h2>Page introuvable</h2><p class="lead">Cette page n’existe pas.</p><p><a class="btn b1" href="#/admin/pages">Toutes les pages</a></p>`)); return; }
      E = e; E.shell = shell;
      renderEditor();
    }).catch((err) => {
      if (tok !== loadTok) return;
      X.log('Éditeur :', err);
      V(shell(`<h2>Impossible d’ouvrir l’éditeur</h2><div class="panel"><p>${esc(msg(err))}</p><p style="margin-top:12px"><button class="btn b1" data-a="ed-retry">Réessayer</button> <a class="btn b4" href="#/admin/pages">Toutes les pages</a></p></div>`));
    });
  }
  A['ed-retry'] = () => { route(); };

  function leave() {
    const e = E;
    if (!e) return;
    clearTimeout(e.tm); clearTimeout(e.pm);
    if (e.dirty && !e.saving && !e.publishing && !e.err) saveDraft(e);
    window.onbeforeunload = null;
    e.gone = true;
    E = null;
  }
  CMS.onRoute(() => { if (E && CUR.indexOf('admin/pages/' + E.id) !== 0) leave(); });
  addEventListener('pagehide', () => { if (E && E.dirty && !E.saving && !E.publishing) saveDraft(E); });

  /* ---- squelette */
  const TABS = [['sec', 'Sections'], ['txt', 'Textes et liens'], ['prop', 'Page et référencement']];

  function renderEditor() {
    const e = E, reg = e.reg;
    e.ready = false; e.units = null; e.unitSig = ''; e.away = null; e.scrolled = false;
    const frameSrc = location.origin + location.pathname + '?cmsembed=1#/' + e.route;
    V(e.shell(`<div id="ed-root"><p class="crumb"><a href="#/admin/pages">← Toutes les pages</a></p>` +
      `<div class="cmsa-head"><h2 id="ed-title"></h2><span id="ed-badges"></span></div>` +
      `<div class="cmsa-bar" role="toolbar" aria-label="Actions de la page"><button type="button" class="btn b1" data-a="ed-save" id="ed-save">Enregistrer le brouillon</button>` +
      `<button type="button" class="btn b1" data-a="ed-pub" id="ed-pub">Publier…</button><button type="button" class="btn b4" data-a="ed-unpub" id="ed-unpub" hidden>Dépublier…</button>` +
      `<button type="button" class="btn b4" data-a="ed-reset" id="ed-reset" hidden>Abandonner le brouillon…</button>${reg.custom ? '<button type="button" class="btn b4" data-a="ed-del" id="ed-del">Supprimer la page…</button>' : ''}` +
      `<span class="cmsa-st" id="ed-st" role="status" aria-live="polite"></span></div><div id="ed-warn" aria-live="polite"></div>` +
      `<div class="cmsa-ed"><div class="cmsa-panel"><div class="cmsa-tabs" role="tablist" aria-label="Parties de l’éditeur">${TABS.map(([k, t]) => `<button type="button" role="tab" id="tab-${k}" data-a="ed-tab" data-t="${k}" aria-selected="${k === e.tab}" aria-controls="ed-body">${t}</button>`).join('')}</div>` +
      `<div class="cmsa-body" id="ed-body" role="tabpanel" aria-labelledby="tab-${e.tab}"></div></div>` +
      `<div class="cmsa-prev"><div class="cmsa-prev-bar"><span id="ed-prev-l">Aperçu du brouillon (rien n’est publié)</span><button type="button" class="btn b4" data-a="ed-dev" data-d="d" id="dev-d" aria-pressed="true">Ordinateur</button><button type="button" class="btn b4" data-a="ed-dev" data-d="m" id="dev-m" aria-pressed="false">Mobile</button><button type="button" class="btn b4" data-a="ed-reload">Recharger</button></div>` +
      `<iframe id="ed-frame" class="cmsa-frame" title="Aperçu de la page en cours de modification" src="${esc(frameSrc)}"></iframe></div></div>` +
      `<datalist id="ed-routes">${CMS.REG.filter((r) => r.routes.length).map((r) => `<option value="#/${esc(r.routes[0])}">${esc(r.label)}</option>`).join('')}</datalist></div>`));
    paintHead(); paintBody(); setStatus();
    // L'aperçu met du temps à répondre ou n'y parvient pas : on le dit, l'édition reste possible.
    e.pm = setTimeout(() => { if (E === e && !e.ready) warn('L’aperçu ne répond pas. Vous pouvez continuer à modifier la page ; cliquez sur « Recharger » pour réessayer.'); }, 12000);
  }

  function warn(html) { const w = qs('#ed-warn'); if (w) w.innerHTML = html ? `<p class="cmsa-warn" role="status">${html}</p>` : ''; }

  function paintHead() {
    const e = E;
    if (!e) return;
    const t = qs('#ed-title'); if (t) t.textContent = (e.reg.custom ? e.w.title : e.reg.label) || e.reg.label;
    const pubd = e.pub && e.pub.status === 'published', arch = e.pub && e.pub.status === 'archived';
    const diff = sigOf(e.w) !== (e.pubSig || e.emptySig);
    const b = qs('#ed-badges');
    if (b) b.innerHTML = (pubd ? '<span class="cmsa-b ok">Publié</span>' : arch ? '<span class="cmsa-b ar">Archivé</span>' : (!e.hasDraft && !e.dirty && !diff) ? '<span class="cmsa-b df">Contenu d’origine</span>' : '') +
      ((e.hasDraft || e.dirty) && (diff || !pubd) ? ` <span class="cmsa-b dr">${e.pub ? 'Brouillon en cours' : 'Brouillon'}</span>` : '');
    const un = qs('#ed-unpub'), rs = qs('#ed-reset'), pb = qs('#ed-pub');
    if (un) un.hidden = !pubd;
    if (rs) rs.hidden = !e.hasDraft;
    if (pb) {
      const can = e.pubSig ? sigOf(e.w) !== e.pubSig : (e.w.kind === 'custom' || sigOf(e.w) !== e.emptySig);
      pb.disabled = !can;
      pb.title = can ? '' : 'Aucune modification à publier.';
    }
  }

  function setStatus() {
    const e = E, el = qs('#ed-st');
    if (!e || !el) return;
    el.classList.toggle('fe', !!e.err);
    el.textContent = e.err ? 'Échec de l’enregistrement : ' + e.err : e.publishing ? 'Publication…' : e.saving ? 'Enregistrement du brouillon…' : e.dirty ? 'Modifications non enregistrées' :
      e.hasDraft ? 'Brouillon enregistré' + (e.savedAt ? ' à ' + hhmm(e.savedAt) : '') : 'Aucune modification en attente';
    window.onbeforeunload = e.dirty && e.err ? (ev) => { ev.preventDefault(); ev.returnValue = ''; } : null;
  }

  /* ---- enregistrement du brouillon (automatique 2 s après la dernière modification, ou bouton) */
  function touch() {
    const e = E;
    if (!e) return;
    e.dirty = sigOf(e.w) !== e.savedSig;
    paintHead(); setStatus();
    clearTimeout(e.pv); e.pv = setTimeout(sendSet, 120);
    clearTimeout(e.tm);
    if (e.dirty && !e.publishing) e.tm = setTimeout(() => saveDraft(e), 2000);
  }

  async function saveDraft(e) {
    if (!e || e.gone && !e.dirty) return;
    if (e.saving) { e.again = true; return; }
    if (e.publishing) return;
    clearTimeout(e.tm);
    const snap = sigOf(e.w);
    if (snap === e.savedSig && e.hasDraft) { e.dirty = false; if (E === e) { paintHead(); setStatus(); } return; }
    e.saving = true; e.err = '';
    if (E === e) setStatus();
    try {
      const w = Object.assign({}, e.w, { content: pack(e.w) });
      await (await cd()).savePageDraft(e.id, w, e.base);
      e.savedSig = snap; e.hasDraft = true; e.savedAt = new Date();
    } catch (err) {
      X.log('Enregistrement du brouillon :', err);
      e.err = msg(err);
    }
    e.saving = false;
    e.dirty = sigOf(e.w) !== e.savedSig;
    if (E === e) { paintHead(); setStatus(); }
    if (!e.err && (e.again || e.dirty) && !e.gone) { e.again = false; e.tm = setTimeout(() => saveDraft(e), 400); }
  }
  A['ed-save'] = async () => {
    const e = E;
    if (!e) return;
    e.err = '';
    await saveDraft(e);
    if (E === e && !e.err) toast('Brouillon enregistré.');
  };

  /* ---- aperçu */
  const frame = () => qs('#ed-frame');
  function mediaMap() {
    const out = {};
    ((X.MD && X.MD.list) || []).forEach((m) => { if (m.public !== false && /^https:\/\//.test(m.url || '')) out[m.id] = { url: m.url, alt: m.alt || '', kind: m.kind }; });
    return out;
  }
  function sendSet() {
    const e = E, f = frame();
    if (!e || !f || !f.contentWindow || !e.ready) return;
    try {
      f.contentWindow.postMessage({ sp: 'cms', type: 'set', pageId: e.id, content: pack(e.w), kind: e.w.kind, title: e.w.title, footer: !!e.w.footer, media: mediaMap(),
        projects: (e.projects || []).filter((p) => p.status === 'published') }, location.origin);
    } catch (err) { console.warn('[Studio Prism] Aperçu :', err); }
  }
  addEventListener('message', (ev) => {
    const e = E, f = frame();
    if (!e || !f || ev.origin !== location.origin || ev.source !== f.contentWindow || !isMap(ev.data) || ev.data.sp !== 'cms') return;
    const d = ev.data;
    if (d.type === 'ready') { e.ready = true; sendSet(); if (e.reg.global && !e.scrolled) { e.scrolled = true; f.contentWindow.postMessage({ sp: 'cms', type: 'scroll', to: 'footer' }, location.origin); } return; }
    if (d.type !== 'scan') return;
    if (d.pageId === 'global' && !e.reg.global) return;       // le pied de page est analysé une fois le site chargé : sans rapport avec la page éditée
    e.ready = true;
    if (d.pageId === e.id || (e.reg.global && d.pageId === 'global')) {
      const sig = JSON.stringify(d.units || []);
      const changedUnits = sig !== e.unitSig;
      e.units = Array.isArray(d.units) ? d.units : []; e.unitSig = sig; e.tpl = !!d.tpl || !!e.reg.tpl;
      e.away = null; warn('');
      sendSet();
      if (e.reg.global && !e.scrolled) { e.scrolled = true; f.contentWindow.postMessage({ sp: 'cms', type: 'scroll', to: 'footer' }, location.origin); }
      if (changedUnits) paintBody();
    } else if (!e.reg.global) {
      e.away = d.route;
      warn(`L’aperçu affiche une autre page (<b>${esc(d.route || 'accueil')}</b>) : vos modifications ne s’y appliquent pas. <button type="button" class="btn b4" data-a="ed-back">Revenir à la page modifiée</button>`);
    }
  });
  A['ed-back'] = () => { const f = frame(); if (f && f.contentWindow) f.contentWindow.postMessage({ sp: 'cms', type: 'goto', route: E.route }, location.origin); };
  A['ed-reload'] = () => { const f = frame(); if (!f || !E) return; E.ready = false; E.units = null; E.unitSig = ''; warn(''); f.src = f.src; };
  A['ed-dev'] = (b) => {
    const f = frame(); if (!f) return;
    E.device = b.dataset.d;
    f.classList.toggle('m', E.device === 'm');
    ['d', 'm'].forEach((k) => { const x = qs('#dev-' + k); if (x) x.setAttribute('aria-pressed', String(E.device === k)); });
  };

  /* ---- onglets */
  A['ed-tab'] = (b) => { E.tab = b.dataset.t; E.adding = false; TABS.forEach(([k]) => { const t = qs('#tab-' + k); if (t) t.setAttribute('aria-selected', String(k === E.tab)); }); paintBody(); };

  function paintBody() {
    const e = E, b = qs('#ed-body');
    if (!e || !b) return;
    const act = document.activeElement, fid = act && act.id && b.contains(act) ? act.id : '';
    b.setAttribute('aria-labelledby', 'tab-' + e.tab);
    b.innerHTML = e.tab === 'txt' ? txtHtml() : e.tab === 'prop' ? propHtml() : secHtml();
    if (fid) { const el = document.getElementById(fid); if (el && el.focus) el.focus(); }
  }

  /* ---- champs liés aux données : data-b = nature, data-x/data-p pour les sections ajoutées, data-k pour les modifications de texte */
  const bind = (id, path) => `data-b="x" data-x="${esc(id)}" data-p="${esc(JSON.stringify(path))}"`;
  function bound(ds) {
    const c = E.w.content;
    if (ds.b === 'x') {
      const x = ext(ds.x), p = JSON.parse(ds.p);
      if (!x) return null;
      return {
        get: () => p.reduce((o, k) => (o == null ? o : o[k]), x),
        set: (v) => { let o = x; for (let i = 0; i < p.length - 1; i++) { if (o[p[i]] == null) o[p[i]] = typeof p[i + 1] === 'number' ? [] : {}; o = o[p[i]]; } o[p[p.length - 1]] = v; },
        del: () => { let o = x; for (let i = 0; i < p.length - 1 && o; i++) o = o[p[i]]; if (o) delete o[p[p.length - 1]]; },
        has: () => { const v = p.reduce((o, k) => (o == null ? o : o[k]), x); return v != null && v !== ''; }
      };
    }
    if (ds.b === 't' || ds.b === 'a') {
      const m = ds.b === 't' ? c.texts : c.attrs;
      return { get: () => m[ds.k], set: (v) => { m[ds.k] = v; }, del: () => { delete m[ds.k]; }, has: () => own(m, ds.k) };
    }
    if (ds.b === 'seo') return { get: () => c.seo[ds.k], set: (v) => { c.seo[ds.k] = v; }, del: () => { delete c.seo[ds.k]; }, has: () => !!c.seo[ds.k] };
    if (ds.b === 'prop') return { get: () => E.w[ds.k], set: (v) => { E.w[ds.k] = v; }, del: () => { E.w[ds.k] = ''; }, has: () => !!E.w[ds.k] };
    return null;
  }

  /* ---- champ image (miniature + choix dans la médiathèque) */
  function imgField(label, id, attrs, value, orig) {
    const shown = value || orig || '';
    const u = shown ? X.refUrl(shown) : '';
    const name = value ? (CMS.MEDIA_RE.test(value) ? X.refName(value) : trunc(value, 50)) : orig ? 'image d’origine du site' : 'aucune image';
    return `<div class="cmsa-f"><span class="cmsa-l" id="${id}-l">${esc(label)}</span><div class="cmsa-img" role="group" aria-labelledby="${id}-l">${u ? `<img src="${esc(u)}" alt="">` : '<span class="cmsa-th v" aria-hidden="true" style="width:64px;height:64px;display:grid;place-items:center;border:1px dashed var(--line);border-radius:8px">＋</span>'}` +
      `<code>${esc(name)}</code><button type="button" class="btn b4" id="${id}" data-a="ed-pick" ${attrs}>${value ? 'Changer' : 'Choisir'} dans la médiathèque</button>` +
      `${value ? `<button type="button" class="btn b4" data-a="ed-clr" ${attrs}>${orig ? 'Rétablir l’image d’origine' : 'Retirer'}</button>` : ''}</div></div>`;
  }
  A['ed-pick'] = (btn) => {
    const ds = Object.assign({}, btn.dataset);
    X.pick({ kind: 'image', onPick: (ref) => { const t = E && bound(ds); if (!t) return; t.set(ref); touch(); paintBody(); } });
  };
  A['ed-clr'] = (btn) => {
    const t = E && bound(btn.dataset);
    if (!t) return;
    if (btn.dataset.b === 'x') t.set(''); else t.del();
    touch(); paintBody();
  };

  /* ================================================================== onglet SECTIONS */
  const sectionName = (x) => TYPES[x.t].label + (x.title ? ' — ' + trunc(x.title, 40) : x.name ? ' — ' + trunc(x.name, 40) : '');

  function orderList(e) {
    const c = e.w.content, items = [];
    (e.units || []).forEach((u) => items.push({ key: u.key, label: u.label, extra: false }));
    c.extra.forEach((x) => items.push({ key: x.id, label: sectionName(x), extra: true }));
    const by = new Map(items.map((i) => [i.key, i])), out = [];
    c.layout.forEach((k) => { const i = by.get(k); if (i && out.indexOf(i) < 0) out.push(i); });
    items.forEach((i) => { if (out.indexOf(i) < 0) out.push(i); });
    return out;
  }

  function secHtml() {
    const e = E, c = e.w.content, list = orderList(e), g = !!e.reg.global;
    let h = `<p class="mut">${g ? 'Blocs du pied de page : vous pouvez en masquer, et modifier leurs textes dans l’onglet « Textes et liens ».' : e.tpl ? 'Ce modèle s’applique à toutes les fiches de ce type. Les sections ajoutées ici s’affichent sous le contenu de chaque fiche ; le contenu d’origine de la fiche ne se modifie pas.' : 'Les sections d’origine peuvent être masquées ou déplacées (jamais supprimées). Vous pouvez aussi ajouter des sections.'}</p>`;
    if (!e.units && !e.tpl && !e.reg.custom) h += '<p class="mut" role="status">Chargement des sections d’origine depuis l’aperçu…</p>';
    h += `<div id="ed-secs" role="list">`;
    list.forEach((it, i) => {
      const off = c.hidden.indexOf(it.key) >= 0, open = it.extra && e.open[it.key];
      h += `<div class="cmsa-sec${off ? ' off' : ''}" role="listitem">` +
        (g ? '' : `<button type="button" data-a="ed-mv" data-k="${esc(it.key)}" data-d="-1" aria-label="Monter la section ${esc(it.label)}"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" data-a="ed-mv" data-k="${esc(it.key)}" data-d="1" aria-label="Descendre la section ${esc(it.label)}"${i === list.length - 1 ? ' disabled' : ''}>↓</button>`) +
        `<span class="cmsa-n">${esc(it.label)}<small>${it.extra ? 'ajoutée' : 'd’origine'}${off ? ' · masquée' : ''}</small></span>` +
        `<button type="button" data-a="ed-vis" data-k="${esc(it.key)}" aria-label="${off ? 'Afficher' : 'Masquer'} la section ${esc(it.label)}" aria-pressed="${off}">${off ? 'Afficher' : 'Masquer'}</button>` +
        (it.extra ? `<button type="button" id="open-${esc(it.key)}" data-a="ed-open" data-k="${esc(it.key)}" aria-expanded="${!!open}" aria-controls="blk-${esc(it.key)}">${open ? 'Replier' : 'Modifier'}</button><button type="button" data-a="ed-dup" data-k="${esc(it.key)}" aria-label="Dupliquer la section ${esc(it.label)}">Dupliquer</button><button type="button" data-a="ed-rm" data-k="${esc(it.key)}" aria-label="Supprimer la section ${esc(it.label)}">Supprimer</button>` : '') +
        `</div>`;
      if (open) { const x = ext(it.key); if (x) h += `<div class="cmsa-blk-b" id="blk-${esc(x.id)}">${extraForm(x)}</div>`; }
    });
    if (!list.length) h += '<p class="mut">Aucune section à afficher.</p>';
    h += `</div>`;
    if (!g) {
      h += `<div class="cmsa-add"><button type="button" class="btn b1" data-a="ed-addtoggle" aria-expanded="${e.adding}"${c.extra.length >= 40 ? ' disabled' : ''}>+ Ajouter une section</button></div>`;
      if (e.adding) h += `<div class="cmsa-types" role="group" aria-label="Type de section à ajouter">${Object.keys(TYPES).map((k) => `<button type="button" data-a="ed-add" data-t="${k}"><b>${esc(TYPES[k].label)}</b><small>${esc(TYPES[k].help)}</small></button>`).join('')}</div>`;
      if (c.extra.length >= 40) h += '<p class="mut">Limite atteinte : 40 sections ajoutées par page.</p>';
    }
    return h;
  }

  A['ed-mv'] = (b) => {
    const e = E, keys = orderList(e).map((i) => i.key), i = keys.indexOf(b.dataset.k), j = i + Number(b.dataset.d);
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    e.w.content.layout = keys;
    touch(); paintBody();
    const nb = document.querySelector(`[data-a="ed-mv"][data-k="${CSS.escape(b.dataset.k)}"][data-d="${b.dataset.d}"]`);
    if (nb && !nb.disabled) nb.focus();
  };
  A['ed-vis'] = (b) => {
    const h = E.w.content.hidden, i = h.indexOf(b.dataset.k);
    if (i >= 0) h.splice(i, 1); else h.push(b.dataset.k);
    touch(); paintBody();
    const nb = document.querySelector(`[data-a="ed-vis"][data-k="${CSS.escape(b.dataset.k)}"]`);
    if (nb) nb.focus();
  };
  A['ed-open'] = (b) => { E.open[b.dataset.k] = !E.open[b.dataset.k]; paintBody(); };
  A['ed-addtoggle'] = () => { E.adding = !E.adding; paintBody(); };
  A['ed-add'] = (b) => {
    const e = E, c = e.w.content, t = b.dataset.t;
    if (!TYPES[t] || c.extra.length >= 40) return;
    const taken = c.extra.map((x) => x.id).concat((e.units || []).map((u) => u.key));
    const x = { id: newId(taken), t };
    TYPES[t].fields.forEach((f) => { if (f.kind === 'list' || f.kind === 'cards') x[f.k] = []; });
    c.extra.push(x);
    if (c.layout.length) c.layout.push(x.id);
    e.open[x.id] = true; e.adding = false;
    touch(); paintBody();
    const el = document.getElementById('blk-' + x.id);
    if (el) { el.scrollIntoView({ block: 'nearest' }); const f = el.querySelector('input,textarea,select'); if (f) f.focus(); }
  };
  A['ed-dup'] = (b) => {
    const e = E, c = e.w.content, x = ext(b.dataset.k);
    if (!x || c.extra.length >= 40) return;
    const y = clone(x);
    y.id = newId(c.extra.map((q) => q.id).concat((e.units || []).map((u) => u.key)));
    c.extra.push(y);
    const keys = orderList(e).map((i) => i.key).filter((k) => k !== y.id), at = keys.indexOf(x.id);
    keys.splice(at + 1, 0, y.id);
    c.layout = keys;
    if (c.hidden.indexOf(x.id) >= 0) c.hidden.push(y.id);
    e.open[y.id] = true;
    touch(); paintBody();
  };
  A['ed-rm'] = (b) => {
    const x = ext(b.dataset.k);
    if (!x) return;
    confirmBox('Supprimer cette section ?', `<p><b>${esc(sectionName(x))}</b></p><p class="mut" style="margin-top:6px">La section est retirée de votre brouillon. Elle ne disparaîtra du site qu’à la prochaine publication.</p>`, 'Supprimer la section', () => {
      const c = E.w.content;
      c.extra = c.extra.filter((q) => q.id !== x.id); c.layout = c.layout.filter((k) => k !== x.id); c.hidden = c.hidden.filter((k) => k !== x.id);
      delete E.open[x.id];
      touch(); paintBody();
    }, true);
  };

  /* ---- formulaires typés */
  function extraForm(x) {
    const def = TYPES[x.t];
    return `<p class="mut" style="font-size:13px">${esc(def.help)}</p>` + def.fields.map((f) => fieldHtml(x, f, [f.k], x[f.k], `f-${x.id}-${f.k}`)).join('');
  }

  function fieldHtml(x, f, path, val, id) {
    const b = bind(x.id, path), hint = f.hint ? `<p class="cmsa-h" id="${id}-h">${esc(f.hint)}</p>` : '', desc = f.hint ? ` aria-describedby="${id}-h"` : '';
    const lab = `${esc(f.label)}${f.req ? ' <span aria-hidden="true">*</span><span class="sr"> (obligatoire)</span>' : ''}`;
    switch (f.kind) {
      case 'text': return `<div class="cmsa-f"><label for="${id}">${lab}</label><input type="text" id="${id}" maxlength="${f.max || 200}" value="${esc(val || '')}" ${b}${desc} autocomplete="off">${hint}</div>`;
      case 'area': return `<div class="cmsa-f"><label for="${id}">${lab}</label><textarea id="${id}" rows="${f.rows || 4}" maxlength="${f.max || 600}" ${b}${desc}>${esc(val || '')}</textarea>${hint}</div>`;
      case 'select': {
        const cur = val == null ? (f.dflt || '') : val;
        return `<div class="cmsa-f"><label for="${id}">${lab}</label><select id="${id}" ${b}>${f.options.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
      }
      case 'image': return imgField(f.label, id, b, val || '', '');
      case 'cta': {
        const c = isMap(val) ? val : {};
        return `<div class="cmsa-sub" role="group" aria-labelledby="${id}-l"><span class="cmsa-sub-h" id="${id}-l"><span>${esc(f.label)}</span></span>` +
          `<div class="cmsa-f"><label for="${id}-a">Texte du bouton</label><input type="text" id="${id}-a" maxlength="60" value="${esc(c.label || '')}" ${bind(x.id, path.concat('label'))} autocomplete="off"></div>` +
          `<div class="cmsa-f"><label for="${id}-b">Adresse du bouton</label><input type="text" id="${id}-b" list="ed-routes" maxlength="300" value="${esc(c.href || '')}" ${bind(x.id, path.concat('href'))} autocomplete="off" aria-describedby="${id}-bh"><p class="cmsa-h" id="${id}-bh">https://…, #/contact (page du site), mailto:… ou tel:…</p><p class="fe" id="${id}-be" role="alert"></p></div></div>`;
      }
      case 'link': return `<div class="cmsa-f"><label for="${id}">${lab}</label><input type="text" id="${id}" list="ed-routes" maxlength="300" value="${esc(val || '')}" ${b} autocomplete="off"><p class="fe" id="${id}-e" role="alert"></p></div>`;
      case 'list': return listHtml(x, f, path, val, id);
      case 'cards': return cardsHtml(x, f, path, val, id);
    }
    return '';
  }

  function itemHead(x, f, j, n, id) {
    const a = `data-x="${esc(x.id)}" data-f="${esc(f.k)}" data-i="${j}"`;
    return `<div class="cmsa-sub-h"><span id="${id}-t">${esc(f.kind === 'cards' ? 'Carte' : 'Élément')} ${j + 1}</span>` +
      `<button type="button" data-a="ed-li-mv" ${a} data-d="-1" aria-label="Monter l’élément ${j + 1}"${j === 0 ? ' disabled' : ''}>↑</button><button type="button" data-a="ed-li-mv" ${a} data-d="1" aria-label="Descendre l’élément ${j + 1}"${j === n - 1 ? ' disabled' : ''}>↓</button>` +
      `<button type="button" data-a="ed-li-rm" ${a} aria-label="Supprimer l’élément ${j + 1}">✕</button></div>`;
  }

  function listHtml(x, f, path, val, id) {
    const items = Array.isArray(val) ? val : [];
    return `<div class="cmsa-f" role="group" aria-labelledby="${id}-l"><span class="cmsa-l" id="${id}-l">${esc(f.label)}</span>` +
      items.map((it, j) => `<div class="cmsa-sub">${itemHead(x, f, j, items.length, `${id}-${j}`)}${f.item.map((sf) => fieldHtml(x, sf, path.concat(j, sf.k), (it || {})[sf.k], `${id}-${j}-${sf.k}`)).join('')}</div>`).join('') +
      `<div class="cmsa-add"><button type="button" class="btn b4" data-a="ed-li-add" data-x="${esc(x.id)}" data-f="${esc(f.k)}"${items.length >= f.max ? ' disabled' : ''}>+ ${esc(f.add)}</button></div></div>`;
  }

  const projStatus = { published: '', draft: ' — brouillon, non visible', archived: ' — archivé, non visible' };
  const prodStatus = { published: '', draft: ' — brouillon, non visible', unavailable: ' — indisponible', archived: ' — archivé, non visible' };
  function cardsHtml(x, f, path, val, id) {
    const e = E, items = Array.isArray(val) ? val : [];
    const projs = (e.projects || []), prods = (e.products || []);
    return `<div class="cmsa-f" role="group" aria-labelledby="${id}-l"><span class="cmsa-l" id="${id}-l">${esc(f.label)}</span><p class="cmsa-h">Un projet ou un produit existant est affiché sans être recopié : il disparaît de la section dès qu’il n’est plus publié.</p>` +
      items.map((it, j) => {
        const ref = typeof it.ref === 'string' ? it.ref : '', sid = `${id}-${j}`, free = !ref;
        const known = (ref.indexOf('project:') === 0 && projs.some((p) => 'project:' + p.id === ref)) || (ref.indexOf('product:') === 0 && prods.some((p) => 'product:' + p.id === ref));
        const opts = `<option value="free"${free ? ' selected' : ''}>Carte libre (titre, texte, image, lien)</option>` +
          `<optgroup label="Projets et réalisations">${projs.map((p) => `<option value="project:${esc(p.id)}"${ref === 'project:' + p.id ? ' selected' : ''}>${esc(p.title)}${projStatus[p.status] || ''}</option>`).join('')}</optgroup>` +
          `<optgroup label="Produits">${prods.map((p) => `<option value="product:${esc(p.id)}"${ref === 'product:' + p.id ? ' selected' : ''}>${esc(p.name || p.id)}${prodStatus[p.status] || ''}</option>`).join('')}</optgroup>` +
          (ref && !known ? `<option value="${esc(ref)}" selected>${esc(ref)} (introuvable)</option>` : '');
        return `<div class="cmsa-sub">${itemHead(x, f, j, items.length, sid)}<div class="cmsa-f"><label for="${sid}-k">Contenu de la carte</label><select id="${sid}-k" data-b="card" data-x="${esc(x.id)}" data-f="${esc(f.k)}" data-i="${j}">${opts}</select></div>` +
          (free ? [['title', 'Titre', 'text', 100, 1], ['text', 'Texte', 'area', 300], ['image', 'Image', 'image'], ['alt', 'Texte alternatif de l’image', 'text', 200], ['href', 'Lien de la carte (facultatif)', 'text', 300]]
            .map(([k, l, kind, max, req]) => fieldHtml(x, { k, label: l, kind: k === 'href' ? 'link' : kind, max, req, rows: 3 }, path.concat(j, k), it[k], `${sid}-${k}`)).join('') : '') + `</div>`;
      }).join('') +
      `<div class="cmsa-add"><button type="button" class="btn b4" data-a="ed-li-add" data-x="${esc(x.id)}" data-f="${esc(f.k)}"${items.length >= f.max ? ' disabled' : ''}>+ Ajouter une carte</button></div></div>`;
  }

  const listField = (x, k) => TYPES[x.t].fields.find((f) => f.k === k);
  A['ed-li-add'] = (b) => {
    const x = ext(b.dataset.x), f = x && listField(x, b.dataset.f);
    if (!x || !f) return;
    const arr = x[f.k] = Array.isArray(x[f.k]) ? x[f.k] : [];
    if (arr.length >= f.max) return;
    arr.push(f.kind === 'cards' ? { title: '' } : {});
    touch(); paintBody();
    const sub = document.querySelectorAll(`#blk-${CSS.escape(x.id)} [data-a="ed-li-rm"][data-f="${CSS.escape(f.k)}"]`);
    const last = sub[sub.length - 1] && sub[sub.length - 1].closest('.cmsa-sub');
    if (last) { const i = last.querySelector('input,textarea,select'); if (i) i.focus(); }
  };
  A['ed-li-mv'] = (b) => {
    const x = ext(b.dataset.x), arr = x && x[b.dataset.f], i = Number(b.dataset.i), j = i + Number(b.dataset.d);
    if (!Array.isArray(arr) || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    touch(); paintBody();
  };
  A['ed-li-rm'] = (b) => {
    const x = ext(b.dataset.x), arr = x && x[b.dataset.f];
    if (!Array.isArray(arr)) return;
    arr.splice(Number(b.dataset.i), 1);
    touch(); paintBody();
  };

  /* ================================================================== onglet TEXTES ET LIENS */
  const unitItems = (e) => (e.units || []).reduce((n, u) => n + u.items.length, 0);

  function itemHtml(it, idx) {
    const c = E.w.content, isAttr = it.kind === 'attr' || it.kind === 'slot', m = isAttr ? c.attrs : c.texts, has = own(m, it.key);
    const val = has ? m[it.key] : '', id = 'ov-' + idx, attrs = `data-b="${isAttr ? 'a' : 't'}" data-k="${esc(it.key)}"`;
    const rev = `<button type="button" class="cmsa-r" data-a="ed-rev" ${attrs}${has ? '' : ' hidden'}>Rétablir l’original</button>`;
    if (it.kind === 'slot' || (it.kind === 'attr' && it.attr === 'src')) {
      return `<div class="cmsa-f cmsa-it" data-key="${esc(it.key)}">${imgField(it.kind === 'slot' ? it.label : 'Image du site', id, attrs, val, it.kind === 'slot' ? '' : it.orig)}</div>`;
    }
    const orig = `<small class="cmsa-o"${has ? '' : ' hidden'}>Original : ${esc(trunc(it.orig, 140))}</small>`;
    const label = esc(it.kind === 'attr' ? it.label : `${it.role}`);
    const note = it.lossy ? '<p class="cmsa-h">Ce texte contient une mise en forme interne (gras…) : elle est perdue si vous le modifiez.</p>' : '';
    if (it.kind === 'attr') {
      return `<div class="cmsa-f cmsa-it" data-key="${esc(it.key)}"><label for="${id}">${label}</label><input type="text" id="${id}" value="${esc(has ? val : it.orig)}" maxlength="${it.attr === 'alt' ? 250 : 300}" ${attrs} data-o="${esc(it.orig)}" data-at="${it.attr}"${has ? ' class="cmsa-mod"' : ''}${it.attr === 'href' ? ' list="ed-routes"' : ''} autocomplete="off">` +
        `${it.attr === 'href' ? `<p class="fe" id="${id}-e" role="alert"></p>` : ''}${orig}${rev}</div>`;
    }
    const long = it.orig.length > 70 || it.orig.indexOf('\n') >= 0;
    const v = has ? val : it.orig;
    return `<div class="cmsa-f cmsa-it" data-key="${esc(it.key)}"><label for="${id}">${label}</label>` +
      (long ? `<textarea id="${id}" rows="${Math.min(8, Math.max(3, Math.ceil(v.length / 55)))}" maxlength="1500" ${attrs} data-o="${esc(it.orig)}"${has ? ' class="cmsa-mod"' : ''}>${esc(v)}</textarea>`
        : `<input type="text" id="${id}" maxlength="1500" value="${esc(v)}" ${attrs} data-o="${esc(it.orig)}"${has ? ' class="cmsa-mod"' : ''} autocomplete="off">`) + note + orig + rev + `</div>`;
  }

  function txtHtml() {
    const e = E, c = e.w.content;
    if (e.tpl) return '<p class="mut">Cette page est un modèle appliqué à toutes les fiches : ses textes viennent de chaque fiche (produit, offre…) et se modifient dans le catalogue. Utilisez l’onglet « Sections » pour ajouter du contenu sous chaque fiche.</p>';
    if (e.reg.custom) return '<p class="mut">Les textes d’une page personnalisée sont ses sections (onglet « Sections ») ; son titre se règle dans « Page et référencement ».</p>';
    if (!e.units) return '<p class="mut" role="status">Chargement des textes depuis l’aperçu… Si rien n’apparaît, cliquez sur « Recharger » au-dessus de l’aperçu.</p>';
    const q = e.filter.trim().toLowerCase();
    let idx = 0, shown = 0, h = `<div class="cmsa-f"><label for="ed-filter">Chercher un texte ou un lien</label><input type="text" id="ed-filter" value="${esc(e.filter)}" placeholder="Mot du texte, du titre…" autocomplete="off"></div>` +
      `<p class="mut" style="font-size:13px">${unitItems(e)} éléments modifiables. Seuls les éléments que vous changez sont enregistrés ; « Rétablir l’original » les remet comme dans le site d’origine.</p><div id="ed-txt">`;
    const modCount = (u) => u.items.filter((it) => own(it.kind === 'attr' || it.kind === 'slot' ? c.attrs : c.texts, it.key)).length;
    e.units.forEach((u, ui) => {
      let its = u.items;
      if (q) its = its.filter((it) => [it.label, it.orig, it.role, (own(c.texts, it.key) ? c.texts[it.key] : ''), (own(c.attrs, it.key) ? c.attrs[it.key] : '')].join(' ').toLowerCase().indexOf(q) >= 0);
      if (!its.length) return;
      const open = q ? true : !!e.openU[u.key];
      const mc = modCount(u);
      h += `<div class="cmsa-unit"><button type="button" class="cmsa-uh" data-a="ed-unit" data-k="${esc(u.key)}" aria-expanded="${open}"><span>${esc(u.label)}</span><small>${u.items.length} élément${u.items.length > 1 ? 's' : ''}${mc ? ` · ${mc} modifié${mc > 1 ? 's' : ''}` : ''}</small></button>`;
      if (open) { its.slice(0, 150 - shown).forEach((it) => { h += itemHtml(it, ++idx); shown++; }); if (shown >= 150) h += '<p class="mut">Résultats limités à 150 éléments : affinez la recherche.</p>'; }
      h += `</div>`;
    });
    h += '</div>';
    // Modifications dont le texte d'origine a changé dans le site : elles ne sont plus appliquées.
    const keys = new Set(); e.units.forEach((u) => u.items.forEach((it) => keys.add(it.key)));
    const obs = Object.keys(c.texts).filter((k) => !keys.has(k)).map((k) => ['t', k, c.texts[k]]).concat(Object.keys(c.attrs).filter((k) => !keys.has(k)).map((k) => ['a', k, c.attrs[k]]));
    if (obs.length) {
      h += `<div class="cmsa-obs"><h3>Modifications obsolètes (${obs.length})</h3><p class="mut" style="font-size:13px">Le texte d’origine de ces éléments a changé dans le site : ces modifications ne sont plus appliquées (elles ne s’afficheront jamais au mauvais endroit). Vous pouvez les supprimer.</p><ul class="cmsa-use">` +
        obs.slice(0, 50).map(([b, k, v]) => `<li><code>${esc(trunc(k, 60))}</code> → ${esc(trunc(v, 80))} <button type="button" class="cmsa-r" data-a="ed-obs" data-b="${b}" data-k="${esc(k)}">Supprimer</button></li>`).join('') +
        `</ul></div>`;
    }
    return h;
  }
  A['ed-unit'] = (b) => { E.openU[b.dataset.k] = !E.openU[b.dataset.k]; paintBody(); const nb = document.querySelector(`[data-a="ed-unit"][data-k="${CSS.escape(b.dataset.k)}"]`); if (nb) nb.focus(); };
  A['ed-obs'] = (b) => { const t = bound(b.dataset); if (t) { t.del(); touch(); paintBody(); } };
  A['ed-rev'] = (b) => {
    const t = bound(b.dataset);
    if (!t) return;
    t.del(); touch();
    const wrap = b.closest('.cmsa-it'), f = wrap && wrap.querySelector('input,textarea');
    paintBody();
    const again = document.querySelector(`.cmsa-it[data-key="${CSS.escape(b.dataset.k)}"] input,.cmsa-it[data-key="${CSS.escape(b.dataset.k)}"] textarea`);
    if (again) again.focus();
  };

  /* ================================================================== onglet PAGE ET RÉFÉRENCEMENT */
  function propHtml() {
    const e = E, w = e.w, s = w.content.seo, reg = e.reg;
    let h = '';
    if (reg.custom) {
      h += `<div class="cmsa-f"><label for="pp-title">Titre de la page</label><input type="text" id="pp-title" maxlength="120" value="${esc(w.title)}" data-b="prop" data-k="title" autocomplete="off"></div>` +
        `<p class="mut" style="font-size:13px">Adresse : <b>#/p/${esc(w.slug)}</b> (non modifiable).</p>` +
        `<label class="opt"><input type="checkbox" id="pp-footer" data-b="prop" data-k="footer"${w.footer ? ' checked' : ''}> Ajouter un lien vers cette page dans le pied de page</label>`;
    } else {
      h += `<p class="mut">Adresse${reg.routes.length > 1 ? 's' : ''} : <b>${esc(routeLabel(reg))}</b>${reg.tpl ? ' — ces réglages s’appliquent à toutes les fiches de ce type.' : ''}</p>`;
    }
    h += `<h3 style="margin:18px 0 6px">Référencement (SEO)</h3><p class="mut" style="font-size:13px">${reg.global ? 'Valeurs par défaut utilisées par les pages qui n’ont pas les leurs.' : 'Laisser vide pour garder les valeurs d’origine du site.'} Les moteurs de recherche et les réseaux sociaux lisent surtout l’adresse de base du site : ces réglages sont appliqués par le navigateur et ne remplacent pas un référencement serveur.</p>`;
    if (!reg.global) h += `<div class="cmsa-f"><label for="seo-title">Titre de l’onglet et du partage</label><input type="text" id="seo-title" maxlength="120" value="${esc(s.title || '')}" data-b="seo" data-k="title" autocomplete="off"></div>`;
    h += `<div class="cmsa-f"><label for="seo-desc">Description (environ 150 caractères)</label><textarea id="seo-desc" rows="3" maxlength="300" data-b="seo" data-k="description" aria-describedby="seo-desc-n">${esc(s.description || '')}</textarea><p class="cmsa-h" id="seo-desc-n" aria-live="polite">${(s.description || '').length} / 300 caractères</p></div>` +
      imgField('Image de partage', 'seo-img', 'data-b="seo" data-k="image"', s.image || '', '') +
      (reg.global ? '' : `<label class="opt"><input type="checkbox" id="seo-noindex" data-b="seo" data-k="noindex"${s.noindex ? ' checked' : ''}> Demander aux moteurs de recherche de ne pas indexer cette page</label>`);
    return h;
  }

  /* ================================================================== saisie */
  document.addEventListener('input', (ev) => { const t = ev.target; if (E && t.closest && t.closest('#ed-root')) onField(t, false); });
  document.addEventListener('change', (ev) => { const t = ev.target; if (E && t.closest && t.closest('#ed-root')) onField(t, true); });

  function onField(el, committed) {
    const e = E, d = el.dataset;
    if (el.id === 'ed-filter') {
      if (!committed) { e.filter = el.value; clearTimeout(e.ft); e.ft = setTimeout(() => { const b = qs('#ed-body'); if (b && e.tab === 'txt') { const pos = el.selectionStart; paintBody(); const f = document.getElementById('ed-filter'); if (f) { f.focus(); try { f.setSelectionRange(pos, pos); } catch (er) { /* ignoré */ } } } }, 250); }
      return;
    }
    if (!d || !d.b) return;
    const c = e.w.content;
    if (d.b === 'card') {
      if (!committed) return;
      const x = ext(d.x), arr = x && x[d.f], j = Number(d.i);
      if (!Array.isArray(arr) || !arr[j]) return;
      arr[j] = el.value === 'free' ? { title: '' } : { ref: el.value };
      touch(); paintBody();
      return;
    }
    const t = bound(d);
    if (!t) return;
    const isCheck = el.type === 'checkbox';
    let v = isCheck ? el.checked : String(el.value);

    if (d.b === 't') {                                   // texte d'une page d'origine
      v = v.replace(/\r\n?/g, '\n');
      if (!v.trim()) { if (committed) { t.del(); el.value = d.o || ''; syncItem(el, false); touch(); } return; }
      if (v.trim() === d.o) t.del(); else t.set(v);
      syncItem(el, t.has());
      touch();
      return;
    }
    if (d.b === 'a') {                                   // lien ou texte alternatif d'une page d'origine
      const er = document.getElementById(el.id + '-e');
      if (d.at === 'href') {
        v = v.trim();
        if (!v) { if (committed) { t.del(); el.value = d.o || ''; if (er) er.textContent = ''; syncItem(el, false); touch(); } return; }
        if (!CMS.safeHref(v)) { el.setAttribute('aria-invalid', 'true'); if (er) er.textContent = 'Adresse non valide : utilisez https://…, #/page, mailto:… ou tel:….'; return; }
        el.removeAttribute('aria-invalid'); if (er) er.textContent = '';
      }
      if (v === d.o) t.del(); else t.set(v);
      syncItem(el, t.has());
      touch();
      return;
    }
    if (d.b === 'seo') {
      if (d.k === 'noindex') t.set(!!v); else t.set(v);
      if (d.k === 'description') { const n = document.getElementById('seo-desc-n'); if (n) n.textContent = `${v.length} / 300 caractères`; }
      touch();
      return;
    }
    if (d.b === 'prop') {
      t.set(isCheck ? !!v : v);
      if (d.k === 'title') { const h = qs('#ed-title'); if (h) h.textContent = v || e.reg.label; }
      touch();
      return;
    }
    if (d.b === 'x') {                                   // section ajoutée
      t.set(v);
      if (el.getAttribute('data-p') && /"href"\]$/.test(el.getAttribute('data-p'))) {
        const er = document.getElementById(/-b$/.test(el.id) ? el.id.replace(/-b$/, '-be') : el.id + '-e'), s = v.trim();
        if (er) { er.textContent = s && !CMS.safeHref(s) ? 'Adresse non valide : utilisez https://…, #/page, mailto:… ou tel:….' : ''; el.toggleAttribute('aria-invalid', !!(s && !CMS.safeHref(s))); }
      }
      // le nom de la section dans la liste suit son titre
      if (/\["(title|name)"\]$/.test(el.getAttribute('data-p') || '')) { const n = document.querySelector(`#open-${CSS.escape(d.x)}`); const nm = n && n.parentNode.querySelector('.cmsa-n'); const x = ext(d.x); if (nm && x) nm.firstChild.textContent = sectionName(x); }
      touch();
    }
  }
  /* Met à jour, sans redessiner (le focus reste dans le champ), l'aspect « modifié » d'un élément. */
  function syncItem(el, has) {
    el.classList.toggle('cmsa-mod', has);
    const w = el.closest('.cmsa-it');
    if (!w) return;
    const o = w.querySelector('.cmsa-o'), r = w.querySelector('.cmsa-r');
    if (o) o.hidden = !has;
    if (r) r.hidden = !has;
  }

  /* ================================================================== validation avant publication */
  function check(e) {
    const c = pack(e.w), errs = [], warns = [];
    const mediaOk = (ref, where) => {
      const m = CMS.MEDIA_RE.exec(ref);
      if (!m) return;
      const x = X.mediaById(m[1]);
      if (X.MD.list && (!x || x.public === false)) warns.push(`${where} : le média choisi est introuvable ou non public ; l’image ne s’affichera pas.`);
    };
    const altMissing = (o, where) => { if (o && o.image && validImg(o.image) && !String(o.alt || '').trim() && !(CMS.MEDIA_RE.test(o.image) && (X.mediaById(o.image.slice(6)) || {}).alt)) warns.push(`${where} : l’image n’a pas de texte alternatif.`); };
    if (e.w.kind === 'custom' && !String(e.w.title || '').trim()) errs.push('Le titre de la page est obligatoire (onglet « Page et référencement »).');
    if ((c.seo.title || '').length > 120) errs.push('Le titre SEO dépasse 120 caractères.');
    if ((c.seo.description || '').length > 300) errs.push('La description SEO dépasse 300 caractères.');
    if (c.seo.image && !validImg(c.seo.image)) errs.push('L’image de partage (SEO) n’est pas valable.');
    else if (c.seo.image) mediaOk(c.seo.image, 'Image de partage (SEO)');
    if (Object.keys(c.texts).length > 800 || Object.keys(c.attrs).length > 400 || c.layout.length > 120 || c.hidden.length > 120 || c.extra.length > 40) errs.push('La page dépasse les limites de taille autorisées (800 textes, 400 liens ou images, 40 sections ajoutées).');
    if (JSON.stringify(c).length > 900000) errs.push('Le contenu de la page est trop volumineux.');
    Object.keys(c.attrs).forEach((k) => {
      if (/@href~/.test(k) && !CMS.safeHref(c.attrs[k])) errs.push('Un lien modifié n’est pas valable : ' + trunc(c.attrs[k], 60));
      if (/@(src|photo)~/.test(k)) { if (!validImg(c.attrs[k])) errs.push('Une image modifiée n’est pas valable.'); else mediaOk(c.attrs[k], 'Image modifiée'); }
    });
    c.extra.forEach((x, i) => {
      const n = `Section ${i + 1} (${TYPES[x.t].label})`;
      TYPES[x.t].fields.forEach((f) => {
        const v = x[f.k];
        if (f.kind === 'text' || f.kind === 'area') {
          if (f.req && !String(v || '').trim()) errs.push(`${n} : « ${f.label} » est obligatoire.`);
          if (String(v || '').length > (f.max || 600)) errs.push(`${n} : « ${f.label} » est trop long.`);
          if (f.k === 'email' && String(v || '').trim() && !EMAIL_RE.test(String(v).trim())) errs.push(`${n} : l’adresse e-mail n’est pas valable.`);
          if (f.k === 'phone' && String(v || '').trim() && !/^[+0-9 ().-]{3,40}$/.test(String(v).trim())) errs.push(`${n} : le numéro de téléphone n’est pas valable.`);
        } else if (f.kind === 'image') {
          if (v && !validImg(v)) errs.push(`${n} : l’image n’est pas valable.`);
          else if (v) { mediaOk(v, n); altMissing(x, n); }
        } else if (f.kind === 'cta') {
          const b = isMap(v) ? v : {}, l = String(b.label || '').trim(), hr = String(b.href || '').trim();
          if ((l || hr) && (!l || !CMS.safeHref(hr))) errs.push(`${n} : « ${f.label} » est incomplet ou son adresse n’est pas valable.`);
        } else if (f.kind === 'list') {
          (Array.isArray(v) ? v : []).forEach((it, j) => f.item.forEach((sf) => {
            const sv = (it || {})[sf.k];
            if (sf.kind === 'image' && sv) { if (!validImg(sv)) errs.push(`${n}, élément ${j + 1} : l’image n’est pas valable.`); else { mediaOk(sv, `${n}, élément ${j + 1}`); altMissing(it, `${n}, élément ${j + 1}`); } }
            else if (sf.req && !String(sv || '').trim()) errs.push(`${n}, élément ${j + 1} : « ${sf.label} » est obligatoire.`);
          }));
        } else if (f.kind === 'cards') {
          (Array.isArray(v) ? v : []).forEach((it, j) => {
            const w = `${n}, carte ${j + 1}`;
            if (typeof it.ref === 'string' && it.ref) {
              if (!/^(project|product):[a-z0-9][a-z0-9_-]{0,59}$/.test(it.ref)) errs.push(`${w} : référence invalide.`);
              else if (it.ref.indexOf('project:') === 0) { const p = (e.projects || []).find((q) => 'project:' + q.id === it.ref); if (!p) warns.push(`${w} : projet introuvable.`); else if (p.status !== 'published') warns.push(`${w} : le projet « ${p.title} » n’est pas publié, il ne s’affichera pas.`); }
              else { const p = (e.products || []).find((q) => 'product:' + q.id === it.ref); if (!p) warns.push(`${w} : produit introuvable.`); else if (p.status !== 'published') warns.push(`${w} : le produit « ${p.name || p.id} » n’est pas publié, il ne s’affichera pas.`); }
            } else {
              if (!String(it.title || '').trim()) errs.push(`${w} : le titre est obligatoire.`);
              if (it.href && !CMS.safeHref(String(it.href).trim())) errs.push(`${w} : l’adresse du lien n’est pas valable.`);
              if (it.image) { if (!validImg(it.image)) errs.push(`${w} : l’image n’est pas valable.`); else { mediaOk(it.image, w); altMissing(it, w); } }
            }
          });
        }
      });
    });
    return { errs, warns, c };
  }

  const summary = (c, e) => {
    const rows = [];
    const n = (k, one, many) => { if (k) rows.push(`${k} ${k > 1 ? many : one}`); };
    n(Object.keys(c.texts).length, 'texte modifié', 'textes modifiés');
    n(Object.keys(c.attrs).length, 'lien ou image modifié', 'liens ou images modifiés');
    n(c.extra.length, 'section ajoutée', 'sections ajoutées');
    n(c.hidden.length, 'bloc masqué', 'blocs masqués');
    if (c.layout.length) rows.push('ordre des sections modifié');
    if (c.seo.title || c.seo.description || c.seo.image || c.seo.noindex) rows.push('réglages de référencement (SEO)');
    if (e.w.kind === 'custom') rows.push(`page personnalisée à l’adresse #/p/${e.w.slug}`);
    return rows.length ? `<ul class="cmsa-use">${rows.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p class="mut">Aucune modification par rapport au contenu d’origine.</p>';
  };

  /* ================================================================== publier, dépublier, abandonner, supprimer */
  A['ed-pub'] = async () => {
    const e = E;
    if (!e) return;
    const { errs, warns, c } = check(e);
    if (errs.length) {
      info('Publication impossible', `<p>Corrigez d’abord ces points :</p><ul class="cmsa-use">${errs.slice(0, 20).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${errs.length > 20 ? `<p class="mut">… et ${errs.length - 20} autre(s).</p>` : ''}`);
      return;
    }
    const was = e.pub && e.pub.status === 'archived';
    confirmBox(`Publier « ${(e.reg.custom ? e.w.title : e.reg.label)} » ?`,
      `<p>Cette version sera visible <b>immédiatement par tous les visiteurs</b> du site.${was ? ' La page est actuellement archivée (dépubliée).' : ''}</p>${summary(c, e)}` +
      (warns.length ? `<p class="cmsa-warn">À vérifier (non bloquant) :</p><ul class="cmsa-use">${warns.slice(0, 8).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''), 'Publier maintenant', () => doPublish(e, false));
  };

  async function doPublish(e, force) {
    clearTimeout(e.tm);
    e.publishing = true; e.err = '';
    if (E === e) setStatus();
    while (e.saving) await new Promise((r) => setTimeout(r, 60));    // pas de course avec l'enregistrement automatique
    try {
      const w = Object.assign({}, e.w, { content: pack(e.w), baseRevision: e.base });
      const rev = await (await cd()).publishPage(e.id, w, { force: !!force });
      e.pub = { id: e.id, kind: w.kind, title: w.title, slug: w.slug, footer: w.footer, content: w.content, revision: rev, status: 'published' };
      e.base = rev; e.hasDraft = false; e.savedSig = e.pubSig = sigOf(e.w); e.dirty = false; e.savedAt = null;
      e.publishing = false;
      PL.pages.set(e.id, e.pub); PL.drafts.delete(e.id);
      CMS.loadPages(true);
      if (E === e) { paintHead(); setStatus(); toast('Page publiée : elle est visible par les visiteurs.'); }
    } catch (err) {
      e.publishing = false;
      if (E === e) setStatus();
      if (err && err.code === 'app/page-conflict' && !force) {
        confirmBox('Cette page a été publiée par quelqu’un d’autre',
          `<p>Une version plus récente a été publiée depuis l’ouverture de l’éditeur (révision ${err.current && err.current.revision}). La publier quand même <b>remplace</b> cette version par la vôtre.</p>`, 'Publier quand même', () => doPublish(e, true), true);
        return 'keep';
      }
      throw err;
    }
  }

  A['ed-unpub'] = () => {
    const e = E;
    if (!e || !e.pub || e.pub.status !== 'published') return;
    confirmBox(`Dépublier « ${(e.reg.custom ? e.w.title : e.reg.label)} » ?`,
      `<p>${e.reg.custom ? 'La page ne sera <b>plus accessible</b> aux visiteurs (elle reste dans l’administration, en archive).' : 'La page <b>reviendra à son contenu d’origine</b> pour tous les visiteurs.'} Rien n’est effacé : vous pourrez la republier.</p>`, 'Dépublier', async () => {
        await (await cd()).unpublishPage(e.id);
        e.pub = Object.assign({}, e.pub, { status: 'archived' }); e.pubSig = null;
        PL.pages.set(e.id, e.pub);
        CMS.loadPages(true);
        if (E === e) { paintHead(); setStatus(); toast('Page dépubliée.'); }
      });
  };

  A['ed-reset'] = () => {
    const e = E;
    if (!e || !e.hasDraft) return;
    confirmBox('Abandonner le brouillon ?', `<p>Les modifications non publiées de cette page seront <b>perdues</b>. Le contenu publié (ou le contenu d’origine) est conservé.</p>`, 'Abandonner le brouillon', async () => {
      clearTimeout(e.tm);
      while (e.saving) await new Promise((r) => setTimeout(r, 60));
      await (await cd()).deletePageDraft(e.id);
      PL.drafts.delete(e.id);
      e.gone = true; E = null; window.onbeforeunload = null;
      toast('Brouillon abandonné.');
      route();
    }, true);
  };

  A['ed-del'] = () => {
    const e = E;
    if (!e || !e.reg.custom) return;
    confirmBox(`Supprimer la page « ${e.w.title || e.reg.label} » ?`, `<p>La page personnalisée, sa version publiée et son brouillon seront <b>supprimés définitivement</b>. Les médias utilisés restent dans la médiathèque. Cette action est irréversible.</p>`, 'Supprimer la page', async () => {
      clearTimeout(e.tm);
      while (e.saving) await new Promise((r) => setTimeout(r, 60));
      await (await cd()).deleteCustomPage(e.id);
      PL.pages.delete(e.id); PL.drafts.delete(e.id);
      e.gone = true; E = null; window.onbeforeunload = null;
      CMS.loadPages(true);
      toast('Page supprimée.');
      go('#/admin/pages');
    }, true);
  };

  /* ================================================================== route */
  Object.assign(R, {
    'admin/pages': () => K.adminGate('pages', (p, shell) => {
      const id = CUR.split('/')[2];
      if (id) openEditor(id, shell);
      else { if (E) leave(); pagesList(shell); }
    })
  });
})();
