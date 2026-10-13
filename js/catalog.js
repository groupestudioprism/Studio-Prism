/* Studio Prism — catalogue central des produits (script classique, chargé après js/account.js et avant js/platform.js).
 *
 *  - #/produits            : catalogue de TOUS les produits publiés (filtres par pôle, type, mode d'accès ; recherche) ;
 *  - #/produits/<id>       : page d'un produit, avec ses formules et prix s'il en a (sélecteur mensuel / annuel si nécessaire) ;
 *  - grilles des pôles (Prism App / Prism Game / Prism 3D) et produits mis en avant de « Réalisations » : mêmes données, même carte.
 *
 * UN produit = UN enregistrement. Il apparaît partout où il doit (catalogue, page de son pôle, mise en avant) sans être recopié.
 * Sources, fusionnées par identifiant (jamais de doublon) :
 *   1. le catalogue INTÉGRÉ au site (ci-dessous : ArchiVision, concepts Prism Game, créations Prism 3D) ;
 *   2. les produits Firestore publiés ou indisponibles. Un produit Firestore de même identifiant remplace l'intégré ;
 *      une fois « Importer le catalogue du site » exécuté (settings/catalogue), seuls les produits Firestore sont affichés.
 * Sans Firebase (hors-ligne, règles non déployées), le catalogue intégré reste affiché : le site ne dépend pas de la base pour
 * montrer ses produits. Les formules et les PRIX, eux, ne viennent que de Firestore : aucun prix n'est affiché s'il n'y est pas.
 *
 * Aucun paiement n'est ouvert ici : les boutons mènent à la création de compte, à la fiche de l'offre ou au contact.
 * Toute donnée Firestore est échappée (esc) avant d'entrer dans du HTML ; les liens sont filtrés (https://, #/ ou assets/).
 */
(function () {
  'use strict';
  const K = window.SP && window.SP.kit;
  if (!K) return; // js/account.js indisponible : le catalogue ne se charge pas (le reste du site fonctionne)
  const { esc } = K;

  /* ------------------------------------------------------------------ libellés */
  const POLES = { app: 'Prism App', game: 'Prism Game', p3d: 'Prism 3D' };
  const POLE_ORDER = ['app', 'game', 'p3d'];
  const POLE_PAGE = { app: '#/prism-app', game: '#/prism-game', p3d: '#/prism-3d' };
  const POLE_CLS = { app: 'ia', game: 'ig', p3d: 'i3' };
  const TYPES = { application: 'Application', game: 'Jeu', '3d': 'Objet 3D', service: 'Service', other: 'Autre' };
  const STATUS = { published: 'Publié', draft: 'Brouillon', unavailable: 'Indisponible', archived: 'Archivé' };
  const STAGES = { concept: 'Concept', conception: 'En conception', prototype: 'Prototype', beta: 'Bêta', released: 'Disponible' };
  const MODES = { free: 'Gratuit', one_time: 'Achat unique', subscription: 'Abonnement', quote: 'Sur devis' };
  const PERIODS = { once: 'Achat unique', monthly: 'Mensuel', quarterly: 'Trimestriel', yearly: 'Annuel' };
  const BILLED = { once: 'unique', monthly: 'mensuelle', quarterly: 'trimestrielle', yearly: 'annuelle' };
  const PER = { once: '', monthly: '/ mois', quarterly: '/ trimestre', yearly: '/ an' };
  const PERIOD_ORDER = ['monthly', 'quarterly', 'yearly'];

  /* Lien affichable : https://, #/ (page du site) ou assets/ (fichier du site). Tout le reste (javascript:, data:…) est ignoré. */
  const safeUrl = (u) => (typeof u === 'string' && (/^https:\/\/[^\s<>"]+$/.test(u) || /^#\/[^\s<>"]*$/.test(u) || /^assets\/[^\s<>"]+$/.test(u)) && u.length <= 300 ? u : '');

  function money(n, cur) {
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur || 'EUR', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n); }
    catch (e) { return n + ' ' + (cur || ''); }
  }

  const byOrder = (a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'fr');
  const byPole = (a, b) => POLE_ORDER.indexOf(a.pole) - POLE_ORDER.indexOf(b.pole) || byOrder(a, b);
  const $id = (id) => document.getElementById(id);

  /* ------------------------------------------------------------------ catalogue INTÉGRÉ au site (produits de départ)
     Dérivé des données du site (app.js : G = concepts Prism Game, P = créations Prism 3D, UV, IMG). Mêmes champs qu'un produit
     Firestore : « Importer le catalogue du site » (administration) les copie tels quels. */
  const BUILTIN = [];
  (function () {
    BUILTIN.push({
      id: 'archivision', name: 'ArchiVision', category: 'application', pole: 'app', stage: 'conception', status: 'published',
      tagline: 'Application BIM / XR', description: UV.av[1], availability: 'Démonstration disponible — application en conception',
      info: 'Démonstration : disponible en ligne sur la page ArchiVision\nFonctions : explorer · isoler · analyser · mesurer',
      platforms: [], logo: IMG.logo, image: IMG.av, url: '#/projets/archivision', featured: true, displayOrder: 1
    });
    G.forEach((g, i) => BUILTIN.push({
      id: slug(g[0]), name: g[0], category: 'game', pole: 'game', stage: 'concept', status: 'published', tagline: g[1], description: g[2],
      availability: 'Concept expérimental — non disponible', info: 'Genre : ' + g[1] + '\nStatut : concept expérimental, ni jeu publié ni réalisation pour un client',
      platforms: ['Roblox'], logo: '', image: '', url: '#/prism-game/' + slug(g[0]), featured: false, displayOrder: 100 + i
    }));
    P.forEach((p, i) => BUILTIN.push({
      id: '3d-' + p[0], name: p[1], category: '3d', pole: 'p3d', stage: 'concept', status: 'published', tagline: 'Gamme ' + p[2], description: p[3],
      availability: 'Concept — prix et dimensions à confirmer après essais',
      info: 'Matériaux : PLA ou PETG\nProcédé : impression 3D\nGamme : ' + p[2] + '\nDimensions : à confirmer après essais',
      platforms: [], logo: '', image: '', url: '#/prism-3d/' + p[0], featured: false, displayOrder: 200 + i
    }));
  })();

  /* ------------------------------------------------------------------ normalisation (anciens et nouveaux documents) */

  function normProduct(p) {
    const status = ({ active: 'published', hidden: 'draft' })[p.status] || p.status;
    const category = TYPES[p.category] ? p.category : 'other';
    const pole = POLES[p.pole] ? p.pole : ({ game: 'game', '3d': 'p3d' })[category] || 'app';
    return Object.assign({}, p, {
      status, category, pole, stage: STAGES[p.stage] ? p.stage : '', tagline: p.tagline || '', description: p.description || '',
      availability: p.availability || '', info: p.info || '', platforms: Array.isArray(p.platforms) ? p.platforms.filter((x) => typeof x === 'string') : [],
      featured: !!p.featured, displayOrder: Number.isFinite(p.displayOrder) ? p.displayOrder : 0, logo: p.logo || '', image: p.image || '', url: p.url || ''
    });
  }

  const priceOrder = (a, b) => (PERIOD_ORDER.indexOf(a.period) + 1 || 9) - (PERIOD_ORDER.indexOf(b.period) + 1 || 9);

  /* Anciens documents « une offre = un prix » : free (prix 0), quote (sur devis), sinon abonnement (mensuel / annuel). */
  const legacyKind = (o) => (o.billingPeriod === 'free' || o.price === 0 ? 'free' : o.billingPeriod === 'quote' || typeof o.price !== 'number' ? 'quote' : 'sub');
  const legacyPlanId = (productId, licenseType) => `${productId}-${String(licenseType).replace(/_/g, '-')}`.slice(0, 60);

  /* subs : documents « subscriptions » (les deux formats) ; prices : documents « prices ».
     Renvoie { plans, archived } :
       plans    formules normalisées { id, productId, productName, name, description, mode, features[], licenseType, status, featured,
                displayOrder, legacy, docs[], prices[{ id, period, amount, currency, status, legacyId }] } ;
       archived anciens documents remplacés par une formule du nouveau format (conservés en base, jamais affichés). */
  function buildPlans(subs, prices) {
    const byPlan = new Map();
    prices.forEach((pr) => { if (!byPlan.has(pr.planId)) byPlan.set(pr.planId, []); byPlan.get(pr.planId).push(pr); });
    const plans = [], legacy = [], archived = [];
    subs.forEach((o) => {
      if (o.mode) {
        plans.push({
          id: o.id, productId: o.productId, productName: o.productName, name: o.name, description: o.description || '', mode: o.mode,
          features: Array.isArray(o.features) ? o.features : [], licenseType: o.licenseType, status: o.status, featured: !!o.featured,
          displayOrder: o.displayOrder || 0, legacy: false, docs: [o],
          prices: (byPlan.get(o.id) || []).map((x) => ({ id: x.id, period: x.period, amount: x.amount, currency: x.currency || 'EUR', status: x.status, legacyId: x.legacyId || '' })).sort(priceOrder)
        });
      } else legacy.push(o);
    });
    const groups = new Map();
    legacy.slice().sort(byOrder).forEach((o) => {
      const k = [o.productId, o.licenseType, legacyKind(o)].join('|');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(o);
    });
    groups.forEach((docs, k) => {
      const [productId, licenseType, kind] = k.split('|');
      const mode = kind === 'sub' ? 'subscription' : kind;
      // une formule du nouveau format couvre déjà ce produit + ce type de licence : les anciens documents ne sont plus que des archives
      if (plans.some((p) => !p.legacy && p.productId === productId && p.licenseType === licenseType && (mode === 'subscription' ? (p.mode === 'subscription' || p.mode === 'one_time') : p.mode === mode))) {
        archived.push(...docs);
        return;
      }
      const first = docs[0], seen = new Set(), pr = [];
      if (kind === 'sub') docs.forEach((d) => { if (!seen.has(d.billingPeriod)) { seen.add(d.billingPeriod); pr.push({ id: d.id, period: d.billingPeriod, amount: d.price, currency: d.currency || 'EUR', status: d.status, legacyId: d.id }); } });
      const feats = [], fseen = new Set();
      docs.forEach((d) => (Array.isArray(d.features) ? d.features : []).forEach((f) => { const t = String(f).trim().toLowerCase(); if (t && !fseen.has(t)) { fseen.add(t); feats.push(String(f).trim()); } }));
      plans.push({
        id: legacyPlanId(productId, licenseType), productId, productName: first.productName, name: first.name, description: docs.map((d) => d.description).find(Boolean) || '',
        mode, features: feats, licenseType, status: docs.some((d) => d.status === 'active') ? 'active' : 'inactive', featured: docs.some((d) => d.featured),
        displayOrder: Math.min(...docs.map((d) => d.displayOrder || 0)), legacy: true, docs, prices: pr.sort(priceOrder)
      });
    });
    return { plans: plans.sort(byOrder), archived };
  }

  /* ------------------------------------------------------------------ tarifs */

  const priceFor = (plan, period) => plan.prices.find((x) => x.period === period && x.status !== 'inactive') || null;
  const livePrices = (plan) => plan.prices.filter((x) => x.status !== 'inactive' && typeof x.amount === 'number' && x.amount > 0);
  const monthlyEq = (x) => (x.period === 'yearly' ? x.amount / 12 : x.period === 'quarterly' ? x.amount / 3 : x.amount);

  /* Périodes proposées par les formules d'abonnement d'un produit (ordre : mensuel, trimestriel, annuel). */
  function periodsOf(plans) {
    const set = new Set();
    plans.filter((p) => p.mode === 'subscription').forEach((p) => livePrices(p).forEach((x) => { if (PERIOD_ORDER.includes(x.period)) set.add(x.period); }));
    return PERIOD_ORDER.filter((x) => set.has(x));
  }

  /* Affichage du tarif d'une formule pour la période choisie : { main, per, note }. */
  function planPrice(plan, period) {
    if (plan.mode === 'free') return { main: 'Gratuit', per: '', note: '' };
    if (plan.mode === 'quote') return { main: 'Sur devis', per: '', note: '' };
    const lp = livePrices(plan);
    if (plan.mode === 'one_time') {
      const x = lp.find((y) => y.period === 'once') || lp[0];
      return x ? { main: money(x.amount, x.currency), per: '', note: 'Achat unique' } : { main: 'Tarif sur demande', per: '', note: '' };
    }
    const x = lp.find((y) => y.period === period) || lp.slice().sort(priceOrder)[0];
    if (!x) return { main: 'Tarif sur demande', per: '', note: '' };
    const note = x.period !== period && period ? `Disponible uniquement en facturation ${BILLED[x.period]}` : (x.period === 'yearly' && lp.length ? `Soit ${money(monthlyEq(x), x.currency)} / mois` : '');
    return { main: money(x.amount, x.currency), per: PER[x.period], note };
  }
  const priceText = (plan, period) => { const p = planPrice(plan, period); return p.per ? `${p.main} ${p.per}` : p.main; };

  /* Économie de l'annuel sur le mensuel (%), la plus forte parmi les formules ; 0 si non calculable. */
  function yearlySaving(plans) {
    let best = 0;
    plans.filter((p) => p.mode === 'subscription').forEach((p) => {
      const m = priceFor(p, 'monthly'), y = priceFor(p, 'yearly');
      if (m && y && m.amount > 0 && y.amount > 0) best = Math.max(best, Math.round((1 - y.amount / (12 * m.amount)) * 100));
    });
    return best;
  }

  /* Résumé court des formules, pour les cartes du catalogue. */
  function planChips(plans) {
    const out = [];
    plans.forEach((p) => {
      const lp = livePrices(p);
      let t = '';
      if (p.mode === 'free') t = plans.length > 1 ? `${p.name} : gratuit` : 'Gratuit';
      else if (p.mode === 'quote') t = `${p.name} : sur devis`;
      else if (p.mode === 'one_time') t = lp.length ? `${p.name} : ${money(lp[0].amount, lp[0].currency)}` : `${p.name} : sur demande`;
      else {
        const m = lp.find((x) => x.period === 'monthly') || lp.slice().sort(priceOrder)[0];
        t = m ? `${p.name} ${lp.length > 1 ? 'dès ' : ': '}${money(m.amount, m.currency)} ${PER[m.period]}` : `${p.name} : sur demande`;
      }
      if (t && !out.includes(t)) out.push(t);
    });
    return out;
  }

  /* ------------------------------------------------------------------ données publiques (en cache) */

  const C = { done: false, at: 0, p: null, products: [], fsError: null, offersError: null, builtinImported: false };
  const TTL = 120000; // le catalogue en cache est relu au plus tard après 2 minutes (une modification faite en administration finit par apparaître sans recharger la page)
  const stale = () => !C.done || Date.now() - C.at > TTL;
  const slots = new Set();

  function rebuild(fsProducts, subs, prices) {
    const map = new Map();
    if (!C.builtinImported) BUILTIN.forEach((b) => map.set(b.id, Object.assign(normProduct(b), { source: 'site' })));
    (fsProducts || []).forEach((p) => map.set(p.id, Object.assign(normProduct(p), { source: 'firestore' })));
    const live = buildPlans(subs || [], prices || []).plans.filter((pl) => pl.status === 'active');
    map.forEach((p) => { p.plans = live.filter((pl) => pl.productId === p.id).sort(byOrder); });
    C.products = Array.from(map.values()).filter((p) => p.status === 'published' || p.status === 'unavailable').sort(byPole);
  }
  rebuild([], [], []); // avant tout chargement : le catalogue intégré, immédiatement

  const settled = (r) => (r.status === 'fulfilled' ? r.value : null);

  function load(force) {
    if (!stale() && !force) return Promise.resolve(C);
    if (C.p) return C.p;
    C.p = K.dataMod()
      .then((d) => Promise.allSettled([d.listPublicProducts(), d.listActiveOffers(), d.listActivePrices(), d.getCatalogueSettings()]))
      .catch((e) => [0, 1, 2, 3].map(() => ({ status: 'rejected', reason: e })))
      .then(([pr, of, px, se]) => {
        C.fsError = pr.status === 'rejected' ? pr.reason : null;
        C.offersError = of.status === 'rejected' ? of.reason : px.status === 'rejected' ? px.reason : null;
        C.builtinImported = !!(settled(se) && settled(se).builtinImported);
        if (C.fsError) console.warn('[Studio Prism] Catalogue Firestore indisponible, catalogue intégré affiché :', C.fsError.code || C.fsError);
        rebuild(settled(pr), settled(of), settled(px));
        C.done = true; C.at = Date.now();
        refreshSlots();
        return C;
      })
      .finally(() => { C.p = null; });
    return C.p;
  }
  const reset = () => { C.done = false; C.at = 0; };

  const find = (id) => C.products.find((p) => p.id === id) || null;
  const featured = (exclude) => C.products.filter((p) => p.featured && !(exclude || []).includes(p.id));

  /* ------------------------------------------------------------------ cartes */

  const hooks = { myLic: () => [], loadMine: () => Promise.resolve([]) };

  const pageOf = (p) => { const u = safeUrl(p.url); return u && u.charAt(0) === '#' ? u : ''; };
  const productHref = (p) => { const u = pageOf(p); return u && u !== '#/produits/' + p.id ? u : '#/produits/' + p.id; };

  /* Visuel d'un produit : adresse https:// / assets/, ou référence « media:{id} » de la médiathèque (js/cms.js). */
  const mediaOf = (v) => (typeof v === 'string' && v.indexOf('media:') === 0 && window.SP.cms ? window.SP.cms.mediaUrl(v) : '');
  const picUrl = (v) => safeUrl(v) || mediaOf(v);

  function visual(p) {
    const img = picUrl(p.image) || (!(typeof ART !== 'undefined' && ART[p.name]) && picUrl(p.logo)) || '';
    if (img) return `<img src="${esc(img)}" alt="" loading="lazy" decoding="async">`;
    if (typeof ART !== 'undefined' && ART[p.name]) return art(p.name);
    return `<span class="pim-ph">${esc(String(p.name || '?').charAt(0).toUpperCase())}</span>`;
  }

  const tags = (p) => `<span class="tag">${esc(POLES[p.pole])}</span>${p.stage ? `<span class="tag">${esc(STAGES[p.stage])}</span>` : ''}${p.status === 'unavailable' ? '<span class="tag tag-off">Indisponible</span>' : ''}`;

  function pcard(p) {
    const href = productHref(p), chips = planChips(p.plans || []), vis = visual(p);
    const offers = p.plans && p.plans.length && href !== '#/produits/' + p.id;
    return `<article class="card pcard" data-pid="${esc(p.id)}"><a class="pc-a" href="${esc(href)}"><div class="im pim ${POLE_CLS[p.pole]}${vis.charAt(1) === 'i' ? ' pim-i' : ''}" aria-hidden="true">${vis}</div>` +
      `<div class="t">${tags(p)}<h3>${esc(p.name)}</h3>${p.tagline ? `<p class="mt2 pc-t">${esc(p.tagline)}</p>` : ''}${p.description ? `<p class="pc-d">${esc(p.description)}</p>` : ''}</div></a>` +
      (chips.length || offers ? `<div class="pc-f">${chips.slice(0, 3).map((c) => `<span class="pc-chip">${esc(c)}</span>`).join('')}${chips.length > 3 ? `<span class="pc-chip">+ ${chips.length - 3}</span>` : ''}${offers ? `<a class="more" href="#/produits/${esc(p.id)}">Voir les offres →</a>` : ''}</div>` : '') +
      `</article>`;
  }

  /* ------------------------------------------------------------------ emplacements (grilles alimentées par le catalogue) */

  function select(o) {
    let l = C.products.slice();
    if (o.pole) l = l.filter((p) => p.pole === o.pole);
    if (o.featured) l = l.filter((p) => p.featured);
    if (o.exclude) l = l.filter((p) => !o.exclude.includes(p.id));
    if (o.ids) l = o.ids.map((id) => C.products.find((p) => p.id === id)).filter(Boolean);
    return l;
  }

  function paint(el) {
    const o = el._o || {};
    if (o.catalogue) return paintCatalogue(el);
    const l = select(o);
    const note = o.note && l.length ? `<p class="pc-note mut">${esc(l.every((p) => p.stage === 'concept') ? o.note[0] : o.note[1])}</p>` : '';
    el.innerHTML = l.length ? note + l.map(pcard).join('') : `<p class="mut">${esc(o.empty || 'Aucun produit publié pour le moment.')}</p>`;
    const sec = o.hideIfEmpty && el.closest(o.hideIfEmpty);   // hideIfEmpty = sélecteur du bloc à masquer quand il n'y a rien à montrer
    if (sec) sec.hidden = !l.length;
  }

  function refreshSlots() {
    slots.forEach((el) => { if (!el.isConnected) slots.delete(el); else paint(el); });
  }

  /* Remplit `el` avec les cartes des produits correspondant à `o` : { pole, featured, exclude[], empty, note[2], hideIfEmpty (sélecteur) }.
     Affichage immédiat (catalogue intégré), puis mise à jour quand Firestore a répondu. */
  function mount(el, o) {
    if (!el) return;
    el._o = o || {};
    slots.add(el);
    paint(el);
    if (stale()) load();
  }

  /* ------------------------------------------------------------------ page « Produits » */

  const F = { pole: '', type: '', mode: '', q: '' };

  const chipRow = (label, k, opts) => `<div class="chips" role="group" aria-label="${esc(label)}">${opts.map(([v, t]) => `<button type="button" class="chip${F[k] === v ? ' on' : ''}" data-a="cat-f" data-k="${k}" data-v="${esc(v)}" aria-pressed="${F[k] === v}">${esc(t)}</button>`).join('')}</div>`;

  function filtered() {
    const q = F.q.trim().toLowerCase();
    return C.products.filter((p) => (!F.pole || p.pole === F.pole) && (!F.type || p.category === F.type)
      && (!F.mode || (p.plans || []).some((pl) => pl.mode === F.mode))
      && (!q || [p.name, p.tagline, p.description, p.info, p.platforms.join(' ')].join(' ').toLowerCase().includes(q)));
  }

  function paintCatalogue(box) {
    const chips = box.querySelector('#cat-chips'), count = box.querySelector('#cat-count'), grid = box.querySelector('#cat-grid');
    if (!chips || !grid) return;
    const types = Object.keys(TYPES).filter((t) => C.products.some((p) => p.category === t));
    const modes = Object.keys(MODES).filter((m) => C.products.some((p) => (p.plans || []).some((pl) => pl.mode === m)));
    chips.innerHTML = chipRow('Pôle', 'pole', [['', 'Tous les pôles']].concat(POLE_ORDER.map((k) => [k, POLES[k]]))) +
      (types.length > 1 ? chipRow('Type de produit', 'type', [['', 'Tous les types']].concat(types.map((t) => [t, TYPES[t]]))) : '') +
      (modes.length ? chipRow('Mode d’accès', 'mode', [['', 'Tous les accès']].concat(modes.map((m) => [m, MODES[m]]))) : '');
    const l = filtered();
    count.textContent = `${l.length} produit${l.length > 1 ? 's' : ''}`;
    if (!l.length) {
      grid.innerHTML = `<div class="panel"><p>${C.products.length ? 'Aucun produit ne correspond à ces critères.' : 'Aucun produit n’est publié pour le moment.'}</p>${C.products.length ? '<p style="margin-top:12px"><button type="button" class="btn b4" data-a="cat-reset">Réinitialiser les filtres</button></p>' : '<p style="margin-top:12px"><a class="btn b1" href="#/contact">Nous contacter</a></p>'}</div>`;
      return;
    }
    grid.innerHTML = POLE_ORDER.filter((k) => l.some((p) => p.pole === k)).map((k) => {
      const items = l.filter((p) => p.pole === k);
      return `<div class="cat-grp" role="group" aria-labelledby="cg-${k}"><h2 id="cg-${k}" class="cat-h"><a href="${POLE_PAGE[k]}">${esc(POLES[k])}</a> <span class="mut">${items.length}</span></h2><div class="g">${items.map(pcard).join('')}</div></div>`;
    }).join('');
  }

  function cataloguePage() {
    V(`<section class="pg cat"><div class="w"><p class="crumb"><a href="#/">Studio Prism</a> / Produits</p><div class="k">Catalogue Studio Prism</div><h1>Produits</h1>` +
      `<p class="lead">Tous les produits Studio Prism, réunis au même endroit : applications, jeux, créations 3D et services. Chacun appartient à un pôle — Prism App, Prism Game ou Prism 3D.</p>` +
      `<div id="cat-box"><div class="acc-f cat-s"><label for="cat-q">Rechercher un produit</label><input id="cat-q" type="search" maxlength="80" autocomplete="off" placeholder="Nom, mot-clé…" value="${esc(F.q)}"></div>` +
      `<div id="cat-chips"></div><p class="mut cat-cnt" id="cat-count" role="status" aria-live="polite"></p><div id="cat-grid"></div></div></div></section>`);
    mount($id('cat-box'), { catalogue: true });
  }

  A['cat-f'] = (btn) => { F[btn.dataset.k] = btn.dataset.v; const b = $id('cat-box'); if (b) paintCatalogue(b); const nb = b && b.querySelector(`[data-k="${btn.dataset.k}"][data-v="${CSS.escape(btn.dataset.v)}"]`); if (nb) nb.focus(); };
  A['cat-reset'] = () => { F.pole = ''; F.type = ''; F.mode = ''; F.q = ''; const q = $id('cat-q'); if (q) q.value = ''; const b = $id('cat-box'); if (b) paintCatalogue(b); };
  document.addEventListener('input', (e) => { if (e.target.id === 'cat-q') { F.q = e.target.value; const b = $id('cat-box'); if (b) paintCatalogue(b); } });

  /* ------------------------------------------------------------------ bloc commercial : formules d'un produit (page produit ET page Abonnements) */

  const BILL = {}; // période choisie par produit

  function billSel(pid, periods) {
    return periods.includes(BILL[pid]) ? BILL[pid] : (periods.includes('monthly') ? 'monthly' : periods[0] || '');
  }

  function planCta(plan, prod) {
    if (prod.status === 'unavailable') return '<button class="btn b4" type="button" disabled aria-disabled="true">Indisponible pour le moment</button>';
    if (plan.mode === 'quote' || (plan.mode !== 'free' && !livePrices(plan).length)) return '<a class="btn b4 ar" href="#/contact">Nous contacter</a>';
    const a = K.st.auth;
    if (a.status === 'loading') return '<span class="mut">Chargement…</span>';
    if (a.status !== 'in') return '<a class="btn b1 ar" href="#/compte/inscription">Créer un compte</a>';
    if (hooks.myLic().some((l) => l.productId === prod.id)) return `<a class="btn b1 ar" href="#/compte">${plan.mode === 'one_time' ? 'Voir ma licence' : 'Gérer mon abonnement'}</a>`;
    if (a.profile.accountKind === 'company') return '<a class="btn b4 ar" href="#/contact">Nous contacter</a>';
    return `<button class="btn b1" type="button" data-a="plan-detail" data-pid="${esc(prod.id)}" data-id="${esc(plan.id)}">Découvrir l’offre</button>`;
  }

  function planCard(plan, prod, period, many) {
    const pp = planPrice(plan, period), feats = plan.features || [], shown = many ? feats.slice(0, 6) : feats;
    const mine = K.st.auth.status === 'in' ? hooks.myLic().find((l) => l.productId === prod.id && l.licenseType === plan.licenseType) : null;
    return `<article class="pc ab-card${plan.featured ? ' pro' : ''}" id="plan-${esc(plan.id)}">` +
      `${plan.featured ? '<span class="ab-flag">Recommandé</span>' : ''}<p class="no">${esc(plan.name)}</p>` +
      `<p class="pp2">${esc(pp.main)}${pp.per ? `<small> ${esc(pp.per)}</small>` : ''}</p>` +
      `<p class="mt2">${esc(pp.note || (plan.mode === 'subscription' ? 'Abonnement' : ''))}</p>` +
      `${plan.description ? `<p class="ab-d">${esc(plan.description)}</p>` : ''}` +
      `<ul>${shown.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` +
      `${feats.length > shown.length ? `<p class="mt2">+ ${feats.length - shown.length} autre${feats.length - shown.length > 1 ? 's' : ''} fonctionnalité${feats.length - shown.length > 1 ? 's' : ''} dans le comparatif</p>` : ''}` +
      `<div class="ab-cta">${planCta(plan, prod)}</div>${mine ? '<p class="ab-yours">Votre licence actuelle</p>' : ''}</article>`;
  }

  /* Tableau comparatif : une colonne par formule, une ligne par fonctionnalité (champ « features » de chaque formule). */
  function comparison(plans, period) {
    const rows = new Map();
    plans.forEach((pl) => (pl.features || []).forEach((f) => { const k = String(f).trim().toLowerCase(); if (k && !rows.has(k)) rows.set(k, String(f).trim()); }));
    if (plans.length < 2 || !rows.size) return '';
    const has = (pl, k) => (pl.features || []).some((f) => String(f).trim().toLowerCase() === k);
    return `<h3 class="ab-h3">Comparer les offres</h3><div class="cmp-w" tabindex="0" role="region" aria-label="Tableau comparatif des offres"><table class="cmp"><caption class="sr">Comparaison des offres</caption>` +
      `<thead><tr><th scope="col">Fonctionnalités</th>${plans.map((pl) => `<th scope="col">${esc(pl.name)}</th>`).join('')}</tr></thead><tbody>` +
      `<tr class="cmp-pr"><th scope="row">Tarif</th>${plans.map((pl) => `<td>${esc(priceText(pl, period))}</td>`).join('')}</tr>` +
      Array.from(rows).map(([k, label]) => `<tr><th scope="row">${esc(label)}</th>${plans.map((pl) => (has(pl, k) ? '<td class="cmp-y"><span aria-hidden="true">✓</span><span class="sr">Inclus</span></td>' : '<td class="cmp-n"><span aria-hidden="true">—</span><span class="sr">Non inclus</span></td>')).join('')}</tr>`).join('') +
      `</tbody></table></div>`;
  }

  /* Bloc des formules d'un produit : sélecteur de période (seulement s'il y a au moins deux périodes), cartes, comparatif.
     Renvoie '' si le produit n'a aucune formule (un produit n'en a pas besoin). */
  function commercial(p) {
    const plans = p.plans || [];
    if (!plans.length) return '';
    const periods = periodsOf(plans), sel = billSel(p.id, periods), save = yearlySaving(plans);
    const toggle = periods.length > 1
      ? `<div class="bill" role="group" aria-label="Période de facturation">${periods.map((x) => `<button type="button" class="bill-b${x === sel ? ' on' : ''}" data-a="bill" data-pid="${esc(p.id)}" data-v="${x}" aria-pressed="${x === sel}">${PERIODS[x]}${x === 'yearly' && save > 0 ? `<span class="bill-s">−${save} %</span>` : ''}</button>`).join('')}</div>`
      : '';
    const cur = (plans.flatMap((pl) => livePrices(pl))[0] || {}).currency;
    return `<div class="cm" data-pid="${esc(p.id)}">${toggle}<div class="ab-grid">${plans.map((pl) => planCard(pl, p, sel, plans.length > 1)).join('')}</div>${comparison(plans, sel)}` +
      `<p class="mt2 ab-note">Aucun paiement en ligne n’est ouvert : l’activation d’une offre se fait avec Studio Prism, qui ajoute la licence à votre compte.${cur ? ` Prix indiqués en ${esc(cur)}.` : ''}</p></div>`;
  }

  function repaintCommercial(pid) {
    const p = find(pid);
    document.querySelectorAll('.cm').forEach((el) => {
      if (el.dataset.pid !== pid) return;
      if (p) el.outerHTML = commercial(p); else el.remove();
    });
  }
  const repaintAll = () => { const seen = new Set(); document.querySelectorAll('.cm').forEach((el) => seen.add(el.dataset.pid)); seen.forEach(repaintCommercial); };

  A.bill = (btn) => {
    const { pid, v } = btn.dataset;
    BILL[pid] = v;
    repaintCommercial(pid);
    const nb = document.querySelector(`.cm[data-pid="${CSS.escape(pid)}"] .bill-b[data-v="${v}"]`);
    if (nb) nb.focus();
  };

  A['plan-detail'] = (btn) => {
    const p = find(btn.dataset.pid), pl = p && (p.plans || []).find((x) => x.id === btn.dataset.id);
    if (!pl) return;
    const sel = billSel(p.id, periodsOf(p.plans));
    A.x();
    modal(`<h3>${esc(p.name)} — ${esc(pl.name)}</h3><p class="pp2" style="margin:6px 0">${esc(priceText(pl, sel))}</p>` +
      `${pl.description ? `<p>${esc(pl.description)}</p>` : ''}` +
      `<ul class="ab-ul">${(pl.features || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` +
      `<p class="acc-note">Aucun paiement en ligne n’est ouvert. Pour activer cette offre, contactez Studio Prism : la licence est ensuite ajoutée à votre compte.</p>` +
      `<p><a class="btn b1 ar" href="#/contact" data-a="x">Contacter Studio Prism</a></p>`);
  };

  /* ------------------------------------------------------------------ page d'un produit */

  /* « Libellé : valeur » → ligne de fiche technique ; toute autre ligne → puce. */
  function infoBlock(p) {
    const lines = String(p.info || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const rows = [], bullets = [];
    lines.forEach((l) => { const i = l.indexOf(' : '); if (i > 0 && i < 40) rows.push([esc(l.slice(0, i)), esc(l.slice(i + 3))]); else bullets.push(l); });
    return { rows, bullets };
  }

  function productHtml(p) {
    const own = '#/produits/' + p.id, page = pageOf(p), ext = safeUrl(p.url);
    const { rows, bullets } = infoBlock(p);
    const spec = [['Pôle', `<a class="more" href="${POLE_PAGE[p.pole]}">${esc(POLES[p.pole])}</a>`], ['Type', esc(TYPES[p.category])]];
    if (p.stage) spec.push(['Avancement', esc(STAGES[p.stage])]);
    if (p.availability) spec.push(['Disponibilité', esc(p.availability)]);
    if (p.platforms.length) spec.push(['Plateformes', esc(p.platforms.join(' · '))]);
    rows.forEach((r) => spec.push(r));
    const others = C.products.filter((x) => x.pole === p.pole && x.id !== p.id).slice(0, 3);
    const plans = p.plans || [];
    const cta = (page && page !== own ? `<a class="btn b1 ar" href="${esc(page)}">Découvrir ${esc(p.name)}</a>` : (!page && ext ? `<a class="btn b1 ar" href="${esc(ext)}" rel="noopener noreferrer">Ouvrir ${esc(p.name)}</a>` : '')) +
      (plans.length ? '<button type="button" class="btn b4 ar" data-a="goto" data-v="produit-offres">Voir les offres</button>' : '') +
      `<a class="btn b4 ar" href="#/contact">Nous contacter</a>`;
    return `<section class="pg prod"><div class="w"><p class="crumb"><a href="#/">Studio Prism</a> / <a href="#/produits">Produits</a> / ${esc(p.name)}</p>` +
      `<div class="pp"><div class="im pim ${POLE_CLS[p.pole]} pimg${visual(p).charAt(1) === 'i' ? ' pim-i' : ''}" aria-hidden="true">${visual(p)}</div><div>${tags(p)}` +
      `<h1 style="font-size:clamp(32px,4vw,52px);margin:10px 0 14px">${esc(p.name)}</h1>${p.tagline ? `<p class="mt2" style="margin-bottom:8px">${esc(p.tagline)}</p>` : ''}` +
      `${p.description ? `<p class="lead2">${esc(p.description)}</p>` : ''}` +
      `${p.status === 'unavailable' ? '<p class="acc-note">Ce produit est momentanément indisponible. Contactez Studio Prism pour en savoir plus.</p>' : ''}` +
      `<p class="prod-cta">${cta}</p></div></div>` +
      `<h2 style="margin-top:56px">Informations</h2>${spec.length ? `<dl class="spec">${spec.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${b}</dd></div>`).join('')}</dl>` : ''}` +
      `${bullets.length ? `<ul class="ab-ul prod-ul">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}` +
      `<h2 id="produit-offres" style="margin-top:56px">${plans.length ? 'Offres' : 'Offres et accès'}</h2>` +
      (plans.length ? commercial(p) : `<div class="panel"><p>Ce produit n’a pas d’offre en ligne pour le moment.</p><p class="mut" style="margin-top:6px">Pour connaître ses conditions d’accès ou demander un devis, contactez Studio Prism.</p><p style="margin-top:12px"><a class="btn b1 ar" href="#/contact">Nous contacter</a></p></div>`) +
      (others.length ? `<h2 style="margin-top:56px">Autres produits ${esc(POLES[p.pole])}</h2><div class="g">${others.map(pcard).join('')}</div>` : '') +
      `</div></section>`;
  }

  function productPage() {
    const id = CUR.split('/')[1] || '', key = CUR;
    const paint2 = () => {
      if (CUR !== key) return;
      const p = find(id);
      if (!p) return nf();
      V(productHtml(p));
      if (K.st.auth.status === 'in') hooks.loadMine().then(() => { if (CUR === key) repaintAll(); }).catch(() => {});
    };
    if (find(id) || C.done) {
      paint2();
      if (stale()) load().then(paint2); // produit intégré affiché tout de suite, formules et prix ajoutés dès que Firestore a répondu
      return;
    }
    V('<section class="pg"><div class="w"><p class="lead" role="status">Chargement du produit…</p></div></section>');
    load().then(paint2);
  }

  /* ------------------------------------------------------------------ routes */
  Object.assign(R, { produits: cataloguePage, 'produits-fiche': productPage });

  window.SP.catalog = {
    POLES, POLE_ORDER, POLE_PAGE, TYPES, STATUS, STAGES, MODES, PERIODS, PER, PERIOD_ORDER,
    BUILTIN, safeUrl, money, byOrder, byPole, normProduct, buildPlans, legacyPlanId, planPrice, priceText, planChips, periodsOf, livePrices,
    load, reset, find, featured, all: () => C.products, state: C, mount, pcard, commercial, repaintAll, productHref, hooks, refresh: refreshSlots, picUrl
  };
})();
