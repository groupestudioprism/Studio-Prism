/* Studio Prism — CMS : moteur d'affichage PUBLIC (script classique, chargé après js/app.js et js/catalog.js, avant js/platform.js).
 *
 * PRINCIPE — le contenu d'origine du site (les pages écrites dans js/app.js) n'est JAMAIS remplacé ni supprimé. Une page « gérée » est
 * toujours rendue d'abord telle qu'elle a été conçue ; si un administrateur a PUBLIÉ des modifications pour cette page (collection
 * Firestore « pages »), elles sont appliquées par-dessus, de façon réversible :
 *   - textes, liens et images modifiés (chaque élément éditable a une clé stable : bloc / balise + rang ~ empreinte du texte d'origine ;
 *     si le texte d'origine change dans le code, l'ancienne modification devient « obsolète » et n'est plus appliquée — jamais mal placée) ;
 *   - blocs masqués ou réordonnés ;
 *   - sections TYPÉES ajoutées (bannière, texte, texte + image, galerie, cartes projets / produits, équipe, fonctionnalités, appel à
 *     l'action, bloc contact) — construites à partir de champs validés, JAMAIS à partir de HTML ou de JavaScript fournis par les données ;
 *   - titre et métadonnées SEO ; pages personnalisées (#/p/<adresse>) ; projets / réalisations (#/projets/<adresse>).
 * Aucune page publiée = aucun changement. Si Firestore est injoignable, le site s'affiche tel qu'il a été conçu.
 *
 * CONFIDENTIALITÉ — le visiteur ne lit que les documents « publiés » (règles Firestore) : brouillons, pages archivées, projets non publiés
 * et médias non publics ne lui parviennent JAMAIS, même en ouvrant la console du navigateur.
 *
 * APERÇU — l'éditeur de l'administration ouvre le site dans une iframe (?cmsembed=1) et lui envoie le brouillon par postMessage
 * (même origine uniquement) ; rien n'est lu dans Firestore par l'iframe et rien n'est publié.
 */
(function () {
  'use strict';

  const BASE = document.currentScript ? document.currentScript.src : location.href;
  const MOD = (n) => new URL(n, BASE).href;
  const EMBED = /(^|[?&])cmsembed=1(&|$)/.test(location.search);
  const API = window.SP = window.SP || {};

  /* ------------------------------------------------------------------ utilitaires */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max || 500) : '');
  const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const hash = (s) => { let h = 2166136261; s = String(s).replace(/\s+/g, ' ').trim(); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const MEDIA_RE = /^media:([A-Za-z0-9]{10,40})$/;
  const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const $q = (s, r) => (r || document).querySelector(s);

  /* Liens autorisés : https://, #/ (page du site), assets/ (fichier du site), mailto:, tel:. Tout le reste (javascript:, data:…) est ignoré. */
  function safeHref(u) {
    if (typeof u !== 'string') return '';
    u = u.trim();
    if (u.length > 500) return '';
    if (/^https:\/\/[^\s<>"']+$/.test(u) || /^#\/[^\s<>"']*$/.test(u) || /^assets\/[^\s<>"']+$/.test(u)) return u;
    if (/^mailto:[^\s<>"'?&]+@[^\s<>"'?&]+$/.test(u) || /^tel:[+0-9 ().-]{3,30}$/.test(u)) return u;
    return '';
  }
  /* Image autorisée : https:// ou assets/ (une référence « media:{id} » passe par mediaUrl). */
  const safeImg = (u) => (typeof u === 'string' && u.length <= 1500 && (/^https:\/\/[^\s<>"']+$/.test(u.trim()) || /^assets\/[^\s<>"']+$/.test(u.trim())) ? u.trim() : '');
  const extAttr = (h) => { try { return /^https:/.test(h) && new URL(h).host !== location.host ? ' target="_blank" rel="noopener noreferrer"' : ''; } catch (e) { return ''; } };

  /* ------------------------------------------------------------------ pages gérées (catalogue des pages du site) */
  const GROUPS = ['Pages principales', 'Univers', 'Projets', 'Services', 'Catalogue', 'Contact', 'Informations légales', 'Modèles de fiches', 'Site'];
  const REG = [
    { id: 'home', label: 'Accueil', group: 0, routes: [''] },
    { id: 'apropos', label: 'À propos et Équipe', group: 0, routes: ['a-propos', 'a-propos/equipe'] },
    { id: 'prism-app', label: 'Prism App', group: 1, routes: ['prism-app'] },
    { id: 'prism-game', label: 'Prism Game', group: 1, routes: ['prism-game'] },
    { id: 'prism-3d', label: 'Prism 3D', group: 1, routes: ['prism-3d'] },
    { id: 'projets', label: 'Réalisations', group: 2, routes: ['projets'] },
    { id: 'archivision', label: 'ArchiVision', group: 2, routes: ['projets/archivision'] },
    { id: 'services', label: 'Services (vue d’ensemble)', group: 3, routes: ['services'] },
    { id: 'svc-applications', label: 'Service — Applications', group: 3, routes: ['services/applications'] },
    { id: 'svc-bim-xr', label: 'Service — BIM / XR', group: 3, routes: ['services/bim-xr'] },
    { id: 'svc-interactif', label: 'Service — Expériences interactives', group: 3, routes: ['services/interactif'] },
    { id: 'svc-fabrication', label: 'Service — Prototypage et impression 3D', group: 3, routes: ['services/fabrication'] },
    { id: 'produits', label: 'Produits', group: 4, routes: ['produits'] },
    { id: 'abonnements', label: 'Abonnements', group: 4, routes: ['abonnements'] },
    { id: 'contact', label: 'Contact', group: 5, routes: ['contact'] },
    { id: 'rendez-vous', label: 'Rendez-vous', group: 5, routes: ['rendez-vous'], tpl: true },
    { id: 'devis', label: 'Demande de devis', group: 5, routes: ['devis'] },
    { id: 'support', label: 'Support', group: 5, routes: ['support'] },
    { id: 'faq', label: 'Questions fréquentes', group: 5, routes: ['faq'] },
    { id: 'mentions-legales', label: 'Mentions légales', group: 6, routes: ['mentions-legales'] },
    { id: 'confidentialite', label: 'Confidentialité', group: 6, routes: ['confidentialite'] },
    { id: 'conditions-utilisation', label: 'Conditions d’utilisation', group: 6, routes: ['conditions-utilisation'] },
    { id: 'cookies', label: 'Cookies et données', group: 6, routes: ['cookies'] },
    { id: 'fiche-produit', label: 'Fiche produit (toutes les fiches)', group: 7, routes: [], prefix: 'produits/', tpl: true, sample: 'produits' },
    { id: 'fiche-offre', label: 'Fiche d’offre (toutes les fiches)', group: 7, routes: [], prefix: 'abonnements/', tpl: true, sample: 'abonnements' },
    { id: 'fiche-jeu', label: 'Fiche concept Prism Game', group: 7, routes: [], prefix: 'prism-game/', tpl: true, sample: 'prism-game' },
    { id: 'fiche-3d', label: 'Fiche création Prism 3D', group: 7, routes: [], prefix: 'prism-3d/', tpl: true, sample: 'prism-3d' },
    { id: 'global', label: 'Pied de page et réglages du site', group: 8, routes: [], global: true, sample: '' }
  ];
  const BYID = new Map(REG.map((r) => [r.id, r]));
  const routeOf = (r) => (r.routes && r.routes.length ? r.routes[0] : r.sample || '');

  function match(route) {
    route = String(route || '').replace(/^#?\/?/, '').replace(/\/+$/, '');
    for (const r of REG) if (r.routes.indexOf(route) >= 0) return r;
    if (/^p\/[a-z0-9-]+$/.test(route)) return { id: 'c-' + route.slice(2), label: '', custom: true, multi: true, routes: [route] };
    for (const r of REG) if (r.prefix && route.indexOf(r.prefix) === 0 && route.length > r.prefix.length) return r;
    return null;
  }

  /* ------------------------------------------------------------------ sections typées (schéma partagé avec l'éditeur de l'administration) */
  const BG = [['', 'Clair'], ['alt', 'Clair alternatif'], ['dark', 'Sombre']];
  const f = (k, label, kind, o) => Object.assign({ k, label, kind }, o || {});
  const TYPES = {
    hero: { label: 'Bannière (héros)', help: 'Grand bandeau d’introduction : titre, texte, image et boutons.', fields: [
      f('kicker', 'Sur-titre', 'text', { max: 60 }), f('title', 'Titre', 'text', { max: 120, req: 1 }), f('text', 'Texte', 'area', { max: 600 }),
      f('image', 'Image', 'image'), f('alt', 'Texte alternatif de l’image', 'text', { max: 200, hint: 'Décrit l’image aux personnes malvoyantes. Laisser vide si l’image est purement décorative.' }),
      f('cta', 'Bouton principal', 'cta'), f('cta2', 'Bouton secondaire', 'cta'), f('bg', 'Fond', 'select', { options: BG })] },
    text: { label: 'Texte', help: 'Un titre et des paragraphes.', fields: [
      f('kicker', 'Sur-titre', 'text', { max: 60 }), f('title', 'Titre', 'text', { max: 120 }), f('body', 'Texte', 'area', { max: 4000, rows: 8, hint: 'Une ligne vide sépare deux paragraphes.' }), f('bg', 'Fond', 'select', { options: BG })] },
    textimage: { label: 'Texte + image', help: 'Un texte à côté d’une image.', fields: [
      f('title', 'Titre', 'text', { max: 120 }), f('body', 'Texte', 'area', { max: 3000, rows: 6 }), f('image', 'Image', 'image'),
      f('alt', 'Texte alternatif de l’image', 'text', { max: 200 }), f('side', 'Position de l’image', 'select', { options: [['right', 'À droite'], ['left', 'À gauche']] }),
      f('cta', 'Bouton', 'cta'), f('bg', 'Fond', 'select', { options: BG })] },
    gallery: { label: 'Galerie d’images', help: 'Plusieurs images avec légende.', fields: [
      f('title', 'Titre', 'text', { max: 120 }), f('intro', 'Introduction', 'area', { max: 600, rows: 3 }),
      f('items', 'Images', 'list', { max: 24, add: 'Ajouter une image', item: [f('image', 'Image', 'image'), f('alt', 'Texte alternatif', 'text', { max: 200 }), f('caption', 'Légende', 'text', { max: 160 })] }),
      f('bg', 'Fond', 'select', { options: BG })] },
    cards: { label: 'Cartes (projets, produits, libres)', help: 'Affiche des projets ou des produits existants (sans les recopier) et/ou des cartes libres.', fields: [
      f('title', 'Titre', 'text', { max: 120 }), f('intro', 'Introduction', 'area', { max: 600, rows: 3 }), f('items', 'Cartes', 'cards', { max: 24 }), f('bg', 'Fond', 'select', { options: BG })] },
    team: { label: 'Équipe', help: 'Présentation de personnes (photo, nom, rôle).', fields: [
      f('title', 'Titre', 'text', { max: 120 }), f('intro', 'Introduction', 'area', { max: 600, rows: 3 }),
      f('items', 'Personnes', 'list', { max: 12, add: 'Ajouter une personne', item: [f('name', 'Nom', 'text', { max: 80, req: 1 }), f('role', 'Rôle', 'text', { max: 120 }), f('text', 'Présentation', 'area', { max: 400, rows: 3 }), f('image', 'Photo', 'image'), f('alt', 'Texte alternatif de la photo', 'text', { max: 200 })] }),
      f('bg', 'Fond', 'select', { options: BG })] },
    features: { label: 'Liste de fonctionnalités', help: 'Points forts : un titre et un court texte chacun.', fields: [
      f('title', 'Titre', 'text', { max: 120 }), f('intro', 'Introduction', 'area', { max: 600, rows: 3 }),
      f('items', 'Points', 'list', { max: 12, add: 'Ajouter un point', item: [f('title', 'Titre', 'text', { max: 100, req: 1 }), f('text', 'Texte', 'area', { max: 400, rows: 3 })] }),
      f('bg', 'Fond', 'select', { options: BG })] },
    cta: { label: 'Appel à l’action', help: 'Un message et un bouton.', fields: [
      f('title', 'Titre', 'text', { max: 120, req: 1 }), f('text', 'Texte', 'area', { max: 500, rows: 3 }), f('cta', 'Bouton', 'cta'), f('bg', 'Fond', 'select', { options: BG, dflt: 'dark' })] },
    contact: { label: 'Bloc contact', help: 'Coordonnées et bouton vers le formulaire de contact.', fields: [
      f('title', 'Titre', 'text', { max: 120 }), f('text', 'Texte', 'area', { max: 500, rows: 3 }), f('email', 'Adresse e-mail', 'text', { max: 120 }),
      f('phone', 'Téléphone', 'text', { max: 40 }), f('address', 'Adresse', 'area', { max: 300, rows: 3 }), f('cta', 'Bouton', 'cta'), f('bg', 'Fond', 'select', { options: BG })] }
  };

  /* ------------------------------------------------------------------ état */
  const ST = {
    pages: new Map(), loaded: false, at: 0, error: null, loading: null,
    projects: null, projAt: 0, projLoading: null,
    media: new Map(), mediaPending: new Set(), mediaCbs: [],
    emb: null, cur: null, g: null, token: 0, baseTitle: '', curProject: null, routeCbs: []
  };
  const CACHE_KEY = 'sp-cms-v1', TTL = 120000, CACHE_MAX_AGE = 86400000;
  const dataMod = () => (ST.mod || (ST.mod = import(MOD('cmsdata.js'))));

  /* ------------------------------------------------------------------ contenu : forme garantie */
  function cleanContent(c) {
    const out = { texts: {}, attrs: {}, layout: [], hidden: [], extra: [], seo: {} };
    if (!isMap(c)) return out;
    const strMap = (m, into) => { if (isMap(m)) Object.keys(m).forEach((k) => { if (typeof m[k] === 'string') into[k] = m[k]; }); };
    strMap(c.texts, out.texts); strMap(c.attrs, out.attrs);
    if (Array.isArray(c.layout)) out.layout = c.layout.filter((x) => typeof x === 'string');
    if (Array.isArray(c.hidden)) out.hidden = c.hidden.filter((x) => typeof x === 'string');
    if (Array.isArray(c.extra)) out.extra = c.extra.filter((x) => isMap(x) && typeof x.id === 'string' && /^[a-z0-9]{3,12}$/.test(x.id) && TYPES[x.t]);
    if (isMap(c.seo)) {
      ['title', 'description', 'image'].forEach((k) => { if (typeof c.seo[k] === 'string') out.seo[k] = c.seo[k]; });
      out.seo.noindex = c.seo.noindex === true;
    }
    return out;
  }

  /* ------------------------------------------------------------------ chargement des pages publiées (visiteurs) */
  function readCache() {
    try {
      const j = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!j || !isMap(j.pages) || Date.now() - j.t > CACHE_MAX_AGE) return;
      Object.keys(j.pages).forEach((id) => ST.pages.set(id, j.pages[id]));
      ST.fromCache = true;
    } catch (e) { /* stockage indisponible : sans importance */ }
  }
  function writeCache() {
    try {
      const pages = {};
      ST.pages.forEach((p, id) => { pages[id] = { kind: p.kind, title: p.title, slug: p.slug, footer: !!p.footer, content: p.content, revision: p.revision, status: 'published' }; });
      const s = JSON.stringify({ t: Date.now(), pages });
      if (s.length < 600000) localStorage.setItem(CACHE_KEY, s); else localStorage.removeItem(CACHE_KEY);
    } catch (e) { /* ignoré */ }
  }

  function loadPages(force) {
    if (EMBED) return Promise.resolve();
    if (!force && ST.loaded && Date.now() - ST.at < TTL) return Promise.resolve();
    if (ST.loading) return ST.loading;
    ST.loading = dataMod().then((d) => d.listPublishedPages()).then((list) => {
      const before = signature();
      ST.pages = new Map();
      list.forEach((p) => { if (p.status === 'published') ST.pages.set(p.id, p); });
      ST.loaded = true; ST.at = Date.now(); ST.error = null; ST.fromCache = false;
      writeCache();
      if (signature() !== before) changed();
    }).catch((e) => {
      ST.error = e; ST.at = Date.now();
      console.warn('[Studio Prism] CMS : pages publiées indisponibles, contenu d’origine affiché.', (e && e.code) || e);
    }).finally(() => { ST.loading = null; });
    return ST.loading;
  }
  const signature = () => JSON.stringify(Array.from(ST.pages.entries()).map(([id, p]) => [id, p.revision, p.title, p.footer, p.content]));

  /* ------------------------------------------------------------------ médias */
  function mediaUrl(ref) {
    const m = MEDIA_RE.exec(String(ref || ''));
    if (!m) return '';
    const e = ST.media.get(m[1]);
    if (e) return e.url;
    fetchMedia(m[1]);
    return '';
  }
  const mediaAlt = (ref) => { const m = MEDIA_RE.exec(String(ref || '')); const e = m && ST.media.get(m[1]); return (e && e.alt) || ''; };
  function fetchMedia(id) {
    if (EMBED && ST.emb && ST.emb.media && ST.emb.media[id]) { ST.media.set(id, ST.emb.media[id]); return; }
    if (ST.mediaPending.has(id)) return;
    ST.mediaPending.add(id);
    dataMod().then((d) => d.getPublicMedia(id)).then((m) => {
      ST.media.set(id, m && m.public !== false && /^https:\/\//.test(m.url || '') ? { url: m.url, alt: m.alt || '', kind: m.kind } : { url: '', alt: '' });
    }).catch(() => { ST.media.set(id, { url: '', alt: '' }); }).finally(() => {
      ST.mediaPending.delete(id);
      if (!ST.mediaPending.size) mediaChanged();
    });
  }
  let mcTimer = 0;
  function mediaChanged() { clearTimeout(mcTimer); mcTimer = setTimeout(() => { ST.mediaCbs.forEach((cb) => { try { cb(); } catch (e) { /* ignoré */ } }); changed(); }, 30); }
  const imgUrl = (v) => (MEDIA_RE.test(String(v || '')) ? mediaUrl(v) : safeImg(v));

  /* ------------------------------------------------------------------ projets / réalisations */
  function loadProjects(force) {
    if (!force && ST.projects && Date.now() - ST.projAt < TTL) return Promise.resolve(ST.projects);
    if (ST.projLoading) return ST.projLoading;
    ST.projLoading = (EMBED && ST.emb && ST.emb.projects ? Promise.resolve(ST.emb.projects) : dataMod().then((d) => d.listPublishedProjects()))
      .then((l) => { ST.projects = l.filter((p) => p.status === 'published'); ST.projAt = Date.now(); repaintProjects(); return ST.projects; })
      .catch((e) => { console.warn('[Studio Prism] CMS : projets indisponibles.', (e && e.code) || e); if (!ST.projects) ST.projects = []; ST.projAt = Date.now(); repaintProjects(); return ST.projects; })
      .finally(() => { ST.projLoading = null; });
    return ST.projLoading;
  }
  const projectById = (id) => (ST.projects || []).find((p) => p.id === id) || null;
  const initial = (t) => esc(String(t || '?').charAt(0).toUpperCase());

  function projectCard(p) {
    const img = imgUrl(p.image);
    return `<a class="card pcard cms-pc" href="#/projets/${esc(p.id)}" data-cms-pid="${esc(p.id)}"><div class="im pim ia${img ? ' pim-i' : ''}" aria-hidden="true">${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async">` : `<span class="pim-ph">${initial(p.title)}</span>`}</div>` +
      `<div class="t">${p.year ? `<span class="tag">${esc(p.year)}</span>` : ''}${(p.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(str(t, 30))}</span>`).join('')}<h3>${esc(p.title)}</h3>${p.summary ? `<p class="pc-d">${esc(p.summary)}</p>` : ''}</div></a>`;
  }

  const projMounts = new Set();
  function paintProjects(el) {
    const list = ST.projects || [];
    const wrap = el.closest('.cms-pj-w') || el;
    if (!ST.projects) return;
    el.innerHTML = list.map(projectCard).join('');
    wrap.hidden = !list.length;
  }
  function repaintProjects() { projMounts.forEach((el) => { if (!el.isConnected) projMounts.delete(el); else paintProjects(el); }); }
  function mountProjects(el) {
    if (!el) return;
    projMounts.add(el);
    paintProjects(el);
    loadProjects();
  }

  function projectPage(slug) {
    const draw = () => {
      if (CUR !== 'projets/' + slug) return;
      const p = projectById(slug);
      if (!p) return nf();
      const img = imgUrl(p.image), link = safeHref(p.link), prod = p.productId && window.SP.catalog && window.SP.catalog.find(p.productId);
      V(`<section class="pg cms-proj"><div class="w"><p class="crumb"><a href="#/projets">Réalisations</a> / ${esc(p.title)}</p>` +
        `${p.year || (p.tags || []).length ? `<p class="cms-tags">${p.year ? `<span class="tag">${esc(p.year)}</span>` : ''}${(p.tags || []).map((t) => `<span class="tag">${esc(str(t, 30))}</span>`).join('')}</p>` : ''}` +
        `<h1>${esc(p.title)}</h1>${p.summary ? `<p class="lead">${esc(p.summary)}</p>` : ''}` +
        `${img ? `<figure class="cms-fig"><img src="${esc(img)}" alt="${esc(mediaAlt(p.image) || '')}" loading="lazy" decoding="async"></figure>` : ''}` +
        `${paras(p.description)}` +
        `${prod ? `<h2 class="cms-h2">Produit associé</h2><div class="g cms-g">${window.SP.catalog.pcard(prod)}</div>` : ''}` +
        `<p class="cms-act">${link ? `<a class="btn b1" href="${esc(link)}"${extAttr(link)}>En savoir plus</a>` : ''}<a class="btn b4" href="#/projets">Toutes les réalisations</a></p></div></section>`);
      ST.curProject = p;
      document.title = p.title + ' — Studio Prism — Creative & Technical Solutions';
      after();
    };
    if (ST.projects) return draw();
    V('<section class="pg"><div class="w"><p class="lead" role="status">Chargement…</p></div></section>');
    loadProjects().then(() => { if (CUR === 'projets/' + slug) draw(); });
    if (window.SP.catalog) window.SP.catalog.load().then(() => { if (CUR === 'projets/' + slug && ST.projects) draw(); });
  }

  /* ------------------------------------------------------------------ rendu des sections typées */
  const paras = (t, cls) => String(t || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean).map((x) => `<p${cls ? ` class="${cls}"` : ''}>${esc(x.slice(0, 2000)).replace(/\n/g, '<br>')}</p>`).join('');
  const cbtn = (c, cls) => {
    if (!isMap(c)) return '';
    const l = str(c.label, 60), h = safeHref(c.href);
    return l && h ? `<a class="btn ${cls}" href="${esc(h)}"${extAttr(h)}>${esc(l)}</a>` : '';
  };
  const picture = (src, alt, cls) => {
    const u = imgUrl(src);
    if (!u) return '';
    const a = typeof alt === 'string' && alt.trim() ? alt.trim().slice(0, 200) : mediaAlt(src);
    return `<img${cls ? ` class="${cls}"` : ''} src="${esc(u)}" alt="${esc(a)}" loading="lazy" decoding="async">`;
  };
  const head = (x, dark) => `${x.kicker ? `<div class="k">${esc(str(x.kicker, 60))}</div>` : ''}${x.title ? `<h2 class="cms-h">${esc(str(x.title, 120))}</h2>` : ''}${x.intro ? paras(str(x.intro, 600), 'cms-intro' + (dark ? ' cms-lt' : '')) : ''}`;
  const items = (x, max) => (Array.isArray(x.items) ? x.items.filter(isMap).slice(0, max) : []);
  const bgOf = (x, dflt) => { const b = x.bg === 'alt' || x.bg === 'dark' || x.bg === '' ? x.bg : dflt || ''; return b; };

  function bodyOf(x) {
    const dark = bgOf(x, x.t === 'cta' ? 'dark' : '') === 'dark';
    const b1 = dark ? 'bw' : 'b1', b2 = dark ? 'b3' : 'b4';
    switch (x.t) {
      case 'hero':
        return `<div class="cms-hero"><div class="cms-hero-t">${x.kicker ? `<div class="k">${esc(str(x.kicker, 60))}</div>` : ''}<h2 class="cms-h cms-h-xl">${esc(str(x.title, 120))}</h2>${x.text ? paras(str(x.text, 600), 'lead') : ''}` +
          `<p class="cms-act">${cbtn(x.cta, b1 + ' ar')}${cbtn(x.cta2, b2 + ' ar')}</p></div>${picture(x.image, x.alt) ? `<div class="cms-hero-i">${picture(x.image, x.alt)}</div>` : ''}</div>`;
      case 'text':
        return `<div class="cms-narrow">${head(x, dark)}${paras(str(x.body, 4000))}</div>`;
      case 'textimage': {
        const pic = picture(x.image, x.alt);
        return `<div class="cms-split${x.side === 'left' ? ' cms-rev' : ''}${pic ? '' : ' cms-solo'}"><div class="cms-split-t">${head(x, dark)}${paras(str(x.body, 3000))}${x.cta ? `<p class="cms-act">${cbtn(x.cta, b1 + ' ar')}</p>` : ''}</div>${pic ? `<div class="cms-split-i">${pic}</div>` : ''}</div>`;
      }
      case 'gallery':
        return `${head(x, dark)}<ul class="cms-gal">${items(x, 24).map((it) => { const p = picture(it.image, it.alt); return p ? `<li><figure>${p}${it.caption ? `<figcaption>${esc(str(it.caption, 160))}</figcaption>` : ''}</figure></li>` : ''; }).join('')}</ul>`;
      case 'cards':
        return `${head(x, dark)}<div class="g cms-g">${items(x, 24).map((it) => {
          const ref = typeof it.ref === 'string' && /^(project|product):[a-z0-9][a-z0-9_-]{0,59}$/.test(it.ref) ? it.ref : '';
          if (ref) return `<div class="cms-ref" data-cms-ref="${esc(ref)}"></div>`;
          const h = safeHref(it.href), p = picture(it.image, it.alt), t = str(it.title, 100);
          if (!t) return '';
          const inner = `<div class="im pim ia${p ? ' pim-i' : ''}" aria-hidden="true">${p || `<span class="pim-ph">${initial(t)}</span>`}</div><div class="t"><h3>${esc(t)}</h3>${it.text ? `<p class="pc-d">${esc(str(it.text, 300))}</p>` : ''}</div>`;
          return h ? `<a class="card pcard" href="${esc(h)}"${extAttr(h)}>${inner}</a>` : `<article class="card pcard">${inner}</article>`;
        }).join('')}</div>`;
      case 'team':
        return `${head(x, dark)}<div class="team cms-team">${items(x, 12).map((it) => {
          const n = str(it.name, 80);
          if (!n) return '';
          const p = picture(it.image, it.alt || n);
          return `<div class="tm"><figure class="ph">${p || `<span aria-hidden="true">${initial(n)}</span>`}</figure><h3>${esc(n)}</h3>${it.role ? `<p class="mt2">${esc(str(it.role, 120))}</p>` : ''}${it.text ? `<p class="cms-sm">${esc(str(it.text, 400))}</p>` : ''}</div>`;
        }).join('')}</div>`;
      case 'features':
        return `${head(x, dark)}<ul class="cms-feat">${items(x, 12).map((it, i) => (str(it.title, 100) ? `<li><span class="cms-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><h3>${esc(str(it.title, 100))}</h3>${it.text ? `<p>${esc(str(it.text, 400))}</p>` : ''}</li>` : '')).join('')}</ul>`;
      case 'cta':
        return `<div class="cms-narrow">${x.title ? `<h2 class="cms-h">${esc(str(x.title, 120))}</h2>` : ''}${x.text ? paras(str(x.text, 500)) : ''}<p class="cms-act">${cbtn(x.cta, b1 + ' ar')}</p></div>`;
      case 'contact': {
        const mail = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(str(x.email, 120)) ? str(x.email, 120) : '';
        const tel = /^[+0-9 ().-]{3,40}$/.test(str(x.phone, 40)) ? str(x.phone, 40) : '';
        const addr = str(x.address, 300);
        return `<div class="cms-narrow">${x.title ? `<h2 class="cms-h">${esc(str(x.title, 120))}</h2>` : ''}${x.text ? paras(str(x.text, 500)) : ''}` +
          `<ul class="cms-ct">${mail ? `<li><span>E-mail</span><a href="mailto:${esc(mail)}">${esc(mail)}</a></li>` : ''}${tel ? `<li><span>Téléphone</span><a href="tel:${esc(tel)}">${esc(tel)}</a></li>` : ''}${addr ? `<li><span>Adresse</span><address>${esc(addr).replace(/\n/g, '<br>')}</address></li>` : ''}</ul>` +
          `<p class="cms-act">${cbtn(x.cta, b1 + ' ar')}</p></div>`;
      }
    }
    return '';
  }

  /* Section prête à insérer. inner = true : placée DANS le conteneur d'une page à section unique (div), sinon section autonome. */
  function renderExtra(x, inner) {
    const bg = bgOf(x, x.t === 'cta' ? 'dark' : ''), cls = `cms-x cms-x-${x.t}${bg ? ' ' + bg : ''}`;
    const el = document.createElement(inner ? 'div' : 'section');
    el.className = cls + (inner ? ' cms-in' : '');
    el.setAttribute('data-cms-x', x.id);
    el.innerHTML = inner ? bodyOf(x) : `<div class="w">${bodyOf(x)}</div>`;
    hydrate(el);
    return el;
  }

  /* Cartes qui référencent un projet ou un produit EXISTANT (jamais recopié) : retirées si l'élément n'est plus public. */
  function hydrate(root) {
    const refs = root.querySelectorAll('[data-cms-ref]');
    if (!refs.length) return;
    const fill = () => {
      refs.forEach((ph) => {
        if (!ph.isConnected) return;
        const [kind, id] = ph.getAttribute('data-cms-ref').split(':');
        let html = '';
        if (kind === 'project') { const p = projectById(id); html = p ? projectCard(p) : ''; }
        else if (window.SP.catalog) { const p = window.SP.catalog.find(id); html = p ? window.SP.catalog.pcard(p) : ''; }
        if (html) ph.insertAdjacentHTML('afterend', html);
        ph.remove();
      });
      const grid = root.querySelector('.cms-g');
      if (grid && !grid.children.length) root.classList.add('cms-off');   // aucune carte publique à montrer : la section n'est pas affichée
    };
    const needs = [];
    if (Array.from(refs).some((r) => /^project:/.test(r.getAttribute('data-cms-ref')))) needs.push(loadProjects());
    if (Array.from(refs).some((r) => /^product:/.test(r.getAttribute('data-cms-ref'))) && window.SP.catalog) needs.push(window.SP.catalog.load());
    Promise.all(needs).then(fill, fill);
  }

  /* ------------------------------------------------------------------ analyse du DOM d'origine : blocs et éléments éditables */
  const TXT = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'DT', 'DD', 'A', 'BUTTON', 'SPAN', 'SMALL', 'B', 'STRONG', 'EM', 'LABEL', 'SUMMARY', 'TD', 'TH', 'FIGCAPTION', 'BLOCKQUOTE', 'DIV']);
  const INLINE_OK = new Set(['B', 'STRONG', 'EM', 'I', 'BR', 'SMALL', 'WBR']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT', 'SELECT', 'OPTION', 'TEXTAREA', 'INPUT', 'CANVAS', 'IFRAME', 'TEMPLATE', 'CODE', 'PRE']);
  const DYN = '#gg,#pg-app,#pg-3d,#rfeat,.rfeat,.pcard,.cm,[data-pid],#cms-pj,.cms-pj-w,#bimh,.cat-box,.cat-grid,#cat-box,[data-cms-dyn],.toast,.mod';
  const ROLE = { H1: 'Titre principal', H2: 'Titre de section', H3: 'Sous-titre', H4: 'Sous-titre', H5: 'Sous-titre', H6: 'Sous-titre', P: 'Paragraphe', LI: 'Élément de liste', DT: 'Terme', DD: 'Définition', A: 'Lien', BUTTON: 'Bouton', SPAN: 'Texte', SMALL: 'Petit texte', B: 'Texte en gras', STRONG: 'Texte en gras', EM: 'Texte', LABEL: 'Libellé', SUMMARY: 'Question', TD: 'Cellule de tableau', TH: 'En-tête de tableau', FIGCAPTION: 'Légende', BLOCKQUOTE: 'Citation', DIV: 'Texte' };
  const DECOR = /^[\d\s.\-–—·→←↗↘✕☰+×•*/|:]*$/;

  const plain = (el) => { let s = ''; el.childNodes.forEach((n) => { if (n.nodeType === 3) s += n.data; else if (n.nodeName === 'BR') s += '\n'; else s += n.textContent; }); return s; };
  const norm = (s) => s.replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
  const isSlot = (el) => (el.tagName === 'FIGURE' && el.classList.contains('ph')) || (el.classList.contains('pl') && el.hasAttribute('data-pl'));

  function qualifies(el) {
    if (!TXT.has(el.tagName)) return false;
    const kids = el.children;
    for (let i = 0; i < kids.length; i++) if (!INLINE_OK.has(kids[i].tagName)) return false;
    const t = norm(plain(el));
    return t.length > 0 && t.length <= 1500 && !DECOR.test(t);
  }

  function scanUnit(u) {
    const counters = {}, out = [];
    const bump = (t) => (counters[t] = (counters[t] || 0) + 1);
    const key = (t, n, suffix, h) => `${u.key}/${t}_${n}${suffix || ''}~${h}`;
    const visit = (el) => {
      if (el.nodeType !== 1) return;
      const T = el.tagName;
      if (SKIP.has(T.toUpperCase()) || el.matches(DYN) || (el.getAttribute('aria-hidden') === 'true' && !isSlot(el)) || el.closest('svg')) return;
      if (isSlot(el)) {
        const n = bump('slot'), id = el.getAttribute('aria-label') || el.getAttribute('data-pl') || '';
        out.push({ kind: 'slot', attr: 'photo', el, tag: 'slot', key: key('slot', n, '@photo', hash(id)), orig: '', html: el.innerHTML, label: 'Visuel : ' + (norm(id) || 'illustration').slice(0, 60), role: 'Visuel' });
        return;
      }
      const lt = T.toLowerCase();
      let n = 0;
      if (TXT.has(T) || T === 'IMG') n = bump(lt);
      if (T === 'IMG') {
        const src = el.getAttribute('src') || '';
        out.push({ kind: 'attr', attr: 'src', el, tag: lt, key: key(lt, n, '@src', hash(src)), orig: src, label: 'Image : ' + (el.getAttribute('alt') || src.split('/').pop() || '').slice(0, 60), role: 'Image' });
        out.push({ kind: 'attr', attr: 'alt', el, tag: lt, key: key(lt, n, '@alt', hash(el.getAttribute('alt') || '')), orig: el.getAttribute('alt') || '', label: 'Texte alternatif de l’image', role: 'Texte alternatif' });
        return;
      }
      if (T === 'A' && el.hasAttribute('href')) {
        const hv = el.getAttribute('href') || '';
        out.push({ kind: 'attr', attr: 'href', el, tag: lt, key: key(lt, n, '@href', hash(hv)), orig: hv, label: 'Adresse du lien : ' + norm(el.textContent).slice(0, 50), role: 'Lien (adresse)' });
      }
      if (TXT.has(T) && qualifies(el)) {
        const orig = norm(plain(el));
        out.push({ kind: 'text', el, tag: lt, key: key(lt, n, '', hash(orig)), orig, html: el.innerHTML, lossy: el.children.length > 0, label: orig.slice(0, 70), role: ROLE[T] || 'Texte' });
        return;
      }
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) visit(c);
    };
    u.nodes.forEach(visit);
    return out;
  }

  /* Découpe une page à section unique en blocs : en-tête (fil d'Ariane, titre, chapeau…) puis un bloc par titre de section. */
  function groupKids(container) {
    const kids = Array.from(container.children).filter((k) => !SKIP.has(k.tagName.toUpperCase()));
    const groups = [];
    let cur = null;
    const start = (k) => { cur = [k]; groups.push(cur); };
    kids.forEach((k, i) => {
      const nxt = kids[i + 1];
      if (k.matches('h2,h3')) { if (cur && cur.length === 1 && cur[0].matches('.k')) cur.push(k); else start(k); }
      else if (k.matches('.k') && nxt && nxt.matches('h2,h3')) start(k);
      else if (k.querySelector('h2,h3') && !k.matches('h1')) { start(k); cur = null; }
      else if (!cur) start(k);
      else cur.push(k);
    });
    return groups;
  }

  function labelOf(nodes, i) {
    for (const n of nodes) {
      const h = n.matches('h1,h2,h3,h4') ? n : n.querySelector('h1,h2,h3,h4');
      if (h && norm(h.textContent)) return norm(h.textContent).slice(0, 70);
    }
    for (const n of nodes) { const k = n.matches('.k') ? n : n.querySelector('.k'); if (k && norm(k.textContent)) return norm(k.textContent).slice(0, 70); }
    return 'Bloc ' + (i + 1);
  }

  function makeUnits(groups, prefix) {
    const seen = new Set();
    return groups.map((nodes, i) => {
      const label = labelOf(nodes, i);
      let key = slugify(label).slice(0, 28).replace(/-+$/, '') || 'bloc' + (i + 1);
      if (seen.has(key)) { let n = 2; while (seen.has(key + '-' + n)) n++; key += '-' + n; }
      seen.add(key);
      const u = { key: (prefix || '') + key, label, nodes, extra: false };
      u.items = scanUnit(u);
      return u;
    });
  }

  function scanView(reg) {
    const v = $q('#v');
    const tops = Array.from(v.children).filter((e) => !e.classList.contains('mo') && !e.hasAttribute('data-cms-x') && /^(SECTION|DIV|ASIDE|ARTICLE)$/.test(e.tagName));
    if (reg.tpl) return { container: v, multi: true, units: [], origOrder: [], tops };
    let container = v, multi = true, groups = tops.map((t) => [t]);
    if (!reg.multi && tops.length === 1) {
      const inner = tops[0].querySelector(':scope > .w') || tops[0];
      container = inner; multi = false; groups = groupKids(inner);
    }
    const units = makeUnits(groups);
    if (reg.custom) units.forEach((u) => { u.items = []; });    // en-tête d'une page personnalisée : le titre se règle dans les propriétés de la page
    return { container, multi, units, origOrder: units.flatMap((u) => u.nodes), tops };
  }

  /* ------------------------------------------------------------------ application / retour à l'état d'origine */
  function setText(el, value) {
    el.textContent = '';
    String(value).slice(0, 2000).split('\n').forEach((line, i) => { if (i) el.appendChild(document.createElement('br')); el.appendChild(document.createTextNode(line)); });
  }

  function undo(sc) {
    if (!sc.undo) return;
    sc.undo.forEach((fn) => { try { fn(); } catch (e) { /* ignoré */ } });
    sc.undo = [];
    sc.units.forEach((u) => { u.nodes.forEach((n) => n.classList.remove('cms-off')); });
    if (sc.extras) { sc.extras.forEach((u) => u.nodes.forEach((n) => n.remove())); sc.extras = []; }
    if (sc.origOrder && sc.container) sc.origOrder.forEach((n) => { if (n.parentNode === sc.container || n.isConnected) sc.container.appendChild(n); });
  }

  function applyItem(it, v, sc) {
    if (it.kind === 'text') {
      setText(it.el, v);
      sc.undo.push(() => { it.el.innerHTML = it.html; });
    } else if (it.kind === 'attr') {
      const old = it.el.getAttribute(it.attr);
      let nv = '';
      if (it.attr === 'href') nv = safeHref(v);
      else if (it.attr === 'src') { nv = imgUrl(v); if (nv) { it.el.removeAttribute('srcset'); it.el.removeAttribute('loading'); } }
      else if (it.attr === 'alt') nv = String(v).slice(0, 250);
      if (!nv && it.attr !== 'alt') return;
      it.el.setAttribute(it.attr, nv);
      if (it.attr === 'href') { const ext = extAttr(nv); if (ext && !it.el.hasAttribute('target')) { it.el.setAttribute('target', '_blank'); it.el.setAttribute('rel', 'noopener noreferrer'); sc.undo.push(() => { it.el.removeAttribute('target'); it.el.removeAttribute('rel'); }); } }
      sc.undo.push(() => { if (old === null) it.el.removeAttribute(it.attr); else it.el.setAttribute(it.attr, old); });
    } else if (it.kind === 'slot') {
      const u = imgUrl(v);
      if (!u) return;
      const name = (it.el.getAttribute('aria-label') || '').replace(/^Emplacement photo\s*:\s*/i, '');
      it.el.innerHTML = '';
      const img = document.createElement('img');
      img.className = 'cms-slot-img'; img.src = u; img.alt = name || mediaAlt(v); img.loading = 'lazy';
      it.el.appendChild(img);
      sc.undo.push(() => { it.el.innerHTML = it.html; });
    }
  }

  function applyScan(sc, content) {
    undo(sc);
    sc.undo = []; sc.extras = [];
    const c = cleanContent(content);
    sc.units.forEach((u) => u.items.forEach((it) => {
      const m = it.kind === 'attr' || it.kind === 'slot' ? c.attrs : c.texts;
      if (Object.prototype.hasOwnProperty.call(m, it.key)) applyItem(it, m[it.key], sc);
    }));
    if (sc.global) {                                // pied de page : textes, liens et blocs masqués seulement
      c.hidden.forEach((k) => { const u = sc.units.find((x) => x.key === k); if (u) u.nodes.forEach((n) => n.classList.add('cms-off')); });
      return;
    }
    const all = sc.units.slice();
    c.extra.forEach((x) => { const node = renderExtra(x, !sc.multi); const u = { key: x.id, label: TYPES[x.t].label, nodes: [node], extra: true, items: [] }; all.push(u); sc.extras.push(u); });
    const by = new Map(all.map((u) => [u.key, u]));
    const order = [];
    c.layout.forEach((k) => { const u = by.get(k); if (u && order.indexOf(u) < 0) order.push(u); });
    all.forEach((u) => { if (order.indexOf(u) < 0) order.push(u); });
    if (sc.tpl) { order.length = 0; sc.extras.forEach((u) => order.push(u)); }
    order.forEach((u) => u.nodes.forEach((n) => sc.container.appendChild(n)));
    c.hidden.forEach((k) => { const u = by.get(k); if (u) u.nodes.forEach((n) => n.classList.add('cms-off')); });
  }

  /* ------------------------------------------------------------------ branchement sur l'affichage (appelé par V() et route() dans js/app.js) */
  function pageFor(reg) {
    if (!reg) return null;
    if (EMBED) return ST.emb && ST.emb.pageId === reg.id ? ST.emb : null;
    const p = ST.pages.get(reg.id);
    return p && (p.status === undefined || p.status === 'published') ? p : null;
  }

  function view() {
    try {
      ST.token++;
      if (ST.cur) ST.cur = null;
      ST.curProject = null;
      const reg = match(CUR);
      if (!reg || reg.global) { if (EMBED) postScan(null); return; }
      if (reg.custom) { ST.cur = { reg, sc: scanView(reg), token: ST.token }; }
      else if (EMBED || pageFor(reg)) ST.cur = { reg, sc: scanView(reg), token: ST.token };
      if (!ST.cur) return;
      ST.cur.sc.tpl = !!reg.tpl;
      const pg = pageFor(reg);
      applyScan(ST.cur.sc, pg ? pg.content : null);
      prefetch(pg);
      if (EMBED) postScan(ST.cur);
    } catch (e) { console.warn('[Studio Prism] CMS (affichage) :', e); }
  }

  function prefetch(pg) {
    if (!pg || EMBED) return;
    (Array.isArray(pg.mediaIds) ? pg.mediaIds : []).slice(0, 80).forEach((id) => { if (!ST.media.has(id)) fetchMedia(id); });
  }

  /* Les données ont changé (publication reçue, média arrivé) : on ré-applique sans re-rendre la page. */
  function changed() {
    try {
      const reg = match(CUR);
      if (reg && !reg.global) {
        if (reg.custom) route();                                  // page personnalisée : la page entière dépend des données
        else {
          const pg = pageFor(reg);
          if (ST.cur && ST.cur.token === ST.token) applyScan(ST.cur.sc, pg ? pg.content : null);
          else if (pg || EMBED) view();
          prefetch(pg);
        }
      }
      applyGlobal(); footerLinks(); seo();
    } catch (e) { console.warn('[Studio Prism] CMS :', e); }
  }

  /* ------------------------------------------------------------------ pied de page (page « global ») */
  function scanGlobal() {
    const f = $q('footer');
    if (!f) return null;
    const groups = [];
    const fc = $q('.fc', f), cols = f.querySelectorAll('.fg > div'), cp = $q('.cp', f);
    if (fc) groups.push([fc]);
    cols.forEach((c) => groups.push([c]));
    if (cp) groups.push([cp]);
    const units = makeUnits(groups, '');
    return { container: f, multi: true, units, global: true, undo: [], origOrder: [] };
  }
  function applyGlobal() {
    if (!ST.g) ST.g = scanGlobal();
    if (!ST.g) return;
    const pg = EMBED ? (ST.emb && ST.emb.pageId === 'global' ? ST.emb : null) : ST.pages.get('global');
    applyScan(ST.g, pg ? pg.content : null);
  }

  function footerLinks() {
    document.querySelectorAll('[data-cms-fl]').forEach((a) => a.remove());
    if (EMBED) return;
    const col = $q('footer .fg > div:last-child');
    if (!col) return;
    Array.from(ST.pages.values()).filter((p) => p.kind === 'custom' && p.footer && p.status !== 'archived').sort((a, b) => String(a.title).localeCompare(String(b.title), 'fr')).forEach((p) => {
      const a = document.createElement('a');
      a.setAttribute('data-cms-fl', ''); a.href = '#/p/' + p.slug; a.textContent = str(p.title, 80) || p.slug;
      col.appendChild(a);
    });
  }

  /* ------------------------------------------------------------------ SEO (titre, description, image, noindex) */
  function setMeta(sel, create, content) {
    let m = $q(sel);
    if (content == null) { if (m && m.hasAttribute('data-cms-meta')) m.remove(); else if (m && m.hasAttribute('data-cms-base')) m.setAttribute('content', m.getAttribute('data-cms-base')); return; }
    if (!m) { m = document.createElement('meta'); create(m); m.setAttribute('data-cms-meta', ''); document.head.appendChild(m); }
    else if (!m.hasAttribute('data-cms-base') && !m.hasAttribute('data-cms-meta')) m.setAttribute('data-cms-base', m.getAttribute('content') || '');
    m.setAttribute('content', content);
  }
  function seo() {
    try {
      const reg = match(CUR), pg = pageFor(reg), gl = EMBED ? null : ST.pages.get('global');
      const c = cleanContent(pg ? pg.content : null).seo, g = cleanContent(gl ? gl.content : null).seo;
      let title = c.title, desc = c.description || g.description, image = c.image || g.image, noindex = !!c.noindex;
      if (ST.curProject && !desc) desc = ST.curProject.summary;
      if (ST.curProject && !image && ST.curProject.image) image = ST.curProject.image;
      if (ST.baseTitle) document.title = ST.baseTitle;
      if (title) document.title = /Studio Prism/i.test(title) ? str(title, 160) : str(title, 120) + ' — Studio Prism';
      const named = (n) => `meta[name="${n}"]`, prop = (p) => `meta[property="${p}"]`;
      setMeta(named('description'), (m) => m.setAttribute('name', 'description'), desc ? str(desc, 300) : null);
      setMeta(prop('og:title'), (m) => m.setAttribute('property', 'og:title'), title || desc ? document.title : null);
      setMeta(prop('og:description'), (m) => m.setAttribute('property', 'og:description'), desc ? str(desc, 300) : null);
      const iu = image ? imgUrl(image) : '';
      setMeta(prop('og:image'), (m) => m.setAttribute('property', 'og:image'), iu && /^https:/.test(iu) ? iu : null);
      setMeta(named('robots'), (m) => m.setAttribute('name', 'robots'), noindex ? 'noindex' : null);
    } catch (e) { console.warn('[Studio Prism] CMS (SEO) :', e); }
  }
  function after() { ST.baseTitle = document.title; seo(); ST.routeCbs.forEach((cb) => { try { cb(); } catch (e) { /* ignoré */ } }); }

  /* ------------------------------------------------------------------ pages personnalisées : #/p/<adresse> */
  function customPage(slug) {
    const id = 'c-' + slug, pg = pageFor({ id });
    if (EMBED) { if (!pg) return V('<section class="pg"><div class="w"><p class="lead" role="status">Page en cours d’édition…</p></div></section>'); }
    else if (!pg || pg.kind !== 'custom') {
      if (!ST.loaded && !ST.error) { V('<section class="pg"><div class="w"><p class="lead" role="status">Chargement…</p></div></section>'); loadPages().then(() => { if (CUR === 'p/' + slug) route(); }); return; }
      return nf();
    }
    V(`<section class="pg cms-head"><div class="w"><p class="crumb"><a href="#/">Studio Prism</a> / ${esc(str(pg.title, 120) || slug)}</p><h1>${esc(str(pg.title, 120) || slug)}</h1></div></section>`);
  }

  /* ------------------------------------------------------------------ aperçu de l'éditeur (iframe) */
  function postScan(cur) {
    if (!EMBED || window.parent === window) return;
    const msg = { sp: 'cms', type: 'scan', route: CUR, pageId: cur ? cur.reg.id : null, custom: !!(cur && cur.reg.custom), tpl: !!(cur && cur.reg.tpl), units: [] };
    if (cur) msg.units = cur.sc.units.filter((u) => !u.extra).map(unitJson);
    window.parent.postMessage(msg, location.origin);
  }
  const unitJson = (u) => ({ key: u.key, label: u.label, items: u.items.map((i) => ({ key: i.key, kind: i.kind, attr: i.attr || '', tag: i.tag, role: i.role, orig: i.orig, lossy: !!i.lossy, label: i.label })) });
  function postGlobal() {
    if (!ST.g || window.parent === window) return;
    window.parent.postMessage({ sp: 'cms', type: 'scan', route: CUR, pageId: 'global', units: ST.g.units.map(unitJson) }, location.origin);
  }

  if (EMBED) {
    document.documentElement.classList.add('cms-embed');
    addEventListener('message', (e) => {
      if (e.origin !== location.origin || e.source !== window.parent || !isMap(e.data) || e.data.sp !== 'cms') return;
      const d = e.data;
      if (d.type === 'set' && typeof d.pageId === 'string') {
        ST.emb = { pageId: d.pageId, content: d.content, kind: d.kind, title: d.title, footer: d.footer, media: d.media || null, projects: d.projects || null, status: 'published' };
        if (ST.emb.media) Object.keys(ST.emb.media).forEach((k) => ST.media.set(k, ST.emb.media[k]));
        const reg = match(CUR);
        if (d.pageId === 'global') { applyGlobal(); if (!ST.g) return; }
        else if (reg && reg.id === d.pageId && reg.custom) route();
        else changed();
        seo();
      } else if (d.type === 'goto' && typeof d.route === 'string' && /^[a-z0-9/-]*$/.test(d.route)) {
        location.hash = '#/' + d.route;
      } else if (d.type === 'scroll' && d.to === 'footer') {
        const f = $q('footer'); if (f) f.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    });
    addEventListener('load', () => { applyGlobal(); postGlobal(); if (window.parent !== window) window.parent.postMessage({ sp: 'cms', type: 'ready', route: CUR }, location.origin); });
  }

  /* ------------------------------------------------------------------ démarrage */
  if (!EMBED) {
    readCache();
    loadPages();
    addEventListener('load', () => { applyGlobal(); footerLinks(); });
    document.addEventListener('DOMContentLoaded', () => { applyGlobal(); footerLinks(); });
  }
  addEventListener('hashchange', () => { if (!EMBED && ST.loaded) loadPages(); });

  API.cms = {
    EMBED, REG, GROUPS, TYPES, BYID, match, routeOf, MEDIA_RE,
    view, after, changed, customPage, projectPage, mountProjects, projectCard, loadProjects, loadPages,
    mediaUrl, mediaAlt, onMedia: (cb) => ST.mediaCbs.push(cb), imgUrl, safeHref, safeImg, cleanContent, esc, hash, slugify,
    state: ST, hydrate, renderExtra, projectById, onRoute: (cb) => ST.routeCbs.push(cb)
  };
})();
