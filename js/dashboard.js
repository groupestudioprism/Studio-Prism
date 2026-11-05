/* Studio Prism — administration : tableau de bord en direct (#/admin) + moteur « temps réel » de toute l'administration.
 * Les données viennent de js/live.js (onSnapshot) : rien à actualiser. Quand une collection change, l'écran ouvert se met à jour seul. */
(function () {
  'use strict';
  const K = window.SP && window.SP.kit;
  if (!K) return;
  const { st, esc, fdate } = K;
  const DAY = 864e5, ms = (t) => (t && t.toMillis ? t.toMillis() : 0);
  let LV = null, started = false, timer = {};

  const isAdminNow = () => st.auth.status === 'in' && st.auth.profile && st.auth.profile.role === 'admin';
  async function ensureLive() {
    if (started || !isAdminNow()) return;
    started = true;
    LV = await import(K.MOD('live.js'));
    LV.onChange(onLive);
    LV.start();
  }
  window.addEventListener('hashchange', () => { if (/^#\/admin/.test(location.hash)) ensureLive(); });
  if (/^#\/admin/.test(location.hash)) setTimeout(ensureLive, 0);
  K.ensureLive = ensureLive;

  const later = (k, fn, wait) => { clearTimeout(timer[k]); timer[k] = setTimeout(fn, wait || 600); };
  /* Un changement Firestore → mise à jour de l'écran ouvert (sans toucher aux formulaires en cours de saisie). */
  function onLive(name) {
    const h = location.hash.split('?')[0].replace(/\/$/, '');
    if (h === '#/admin' || h === '#/admin/tableau') return name === 'presence' || name === 'sessions' ? later('d', () => renderDash(false), 1500) : later('d', renderDash, 250);
    if (h === '#/admin/activite') return later('ac', () => window.SP.dashboard && window.SP.dashboard.activity(), 1200);
    if (h === '#/admin/comptes' && (name === 'users' || name === 'licenses')) return later('u', () => K.applyLive && K.applyLive(LV.store), 300);
    const O = window.SP.orgsKit, QU = window.SP.quotesUI;
    if (/^#\/admin\/(a-traiter|entreprises|scolaire|etablissements)$/.test(h) && ['requests', 'keys', 'users', 'quotes', 'licenses'].includes(name)) {
      if (name === 'users') { const n = LV.store.users.filter((u) => u.status === 'pending').length; if (n === onLive.pend) return; onLive.pend = n; }
      return later('o', async () => { try { if (QU && QU.load && (name === 'quotes' || h.endsWith('a-traiter'))) await QU.load(); if (O) O.reload(); } catch (e) { /* ignore */ } }, 800);
    }
    if (h === '#/admin/devis' && name === 'quotes') return later('q', () => { if (QU) QU.load().then(() => window.SP.quotesUI.refresh && window.SP.quotesUI.refresh()).catch(() => {}); }, 600);
    if (name === 'users' || name === 'licenses') later('sweep', sweepExpired, 3000);
  }

  /* Licence expirée : visible 7 jours puis retirée (compte repassé en Free) */
  const GRACE = 7 * DAY;
  function sweepExpired() {
    if (!LV || !isAdminNow() || !LV.store.ready.users || !LV.store.ready.licenses) return;
    const now = Date.now(), by = {};
    LV.store.licenses.forEach((l) => { (by[l.userId] = by[l.userId] || []).push(l); });
    LV.store.users.forEach((u) => {
      const ls = by[u.uid]; if (!ls || !ls.length || u.role === 'admin' || u.subscription === 'free' || u.status !== 'active' || u.orgId) return;
      const alive = ls.some((l) => l.status === 'active' && (!ms(l.expiresAt) || ms(l.expiresAt) + GRACE > now));
      if (!alive && ls.every((l) => ms(l.expiresAt) && ms(l.expiresAt) + GRACE <= now)) {
        if (sweepExpired.done[u.uid]) return; sweepExpired.done[u.uid] = 1;
        K.dataMod().then(() => import(K.MOD('admin.js'))).then((a) => a.updateUser(u, { subscription: 'free' })).catch(() => {});
      }
    });
  }
  sweepExpired.done = {};

  /* ------------------------------------------------------------------ rendu */
  /* Logiciels suivis par la présence (shared/prism-presence.js) : identifiant d'app → nom + couleur */
  const APPS = [['archiplan', 'ArchiPlan', '#0877B9'], ['archivision', 'ArchiVision', '#169999'], ['architrafic', 'ArchiTrafic', '#E0A800'], ['archiindus', 'ArchiIndus', '#8B5CF6'],
    ['spectrawriter', 'Spectra Writer', '#E4572E'], ['spectracalc', 'Spectra Calc', '#2E9E5B'], ['spectraslide', 'Spectra Slide', '#D6458A'], ['spectramotion', 'Spectra Motion', '#6B7280'], ['nexus', 'Nexus', '#071B55']];
  const APP = Object.fromEntries(APPS.map(([id, name, color]) => [id, { id, name, color }]));
  const appOf = (id) => APP[id] || { id, name: id, color: '#9CA3AF' };
  const ONLINE = 150e3;   // une personne est « connectée » si son dernier battement date de moins de 2 min 30
  const fmtDur = (sec) => { sec = Math.round(sec); if (sec < 60) return sec + ' s'; if (sec < 3600) return Math.round(sec / 60) + ' min'; const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return m ? `${h} h ${String(m).padStart(2, '0')}` : h + ' h'; };
  const rel = (t) => { if (!t) return '—'; const d = Date.now() - t; if (d < 90e3) return 'à l’instant'; if (d < 3600e3) return 'il y a ' + Math.round(d / 60e3) + ' min'; if (d < DAY) return 'il y a ' + Math.round(d / 3600e3) + ' h'; if (d < 7 * DAY) return 'il y a ' + Math.round(d / DAY) + ' j'; return new Date(t).toLocaleDateString('fr-FR'); };
  const nf = (n) => Number(n).toLocaleString('fr-FR');
  let CH = null;   // module des diagrammes (dashcharts.js)
  const D = { period: 7, metric: 'time', stackMetric: 'time', hidden: new Set(), built: false, tick: null };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('#adm-th'); if (!b) return;
    const sec = b.closest('.adm'), on = !sec.classList.contains('dk'); sec.classList.toggle('dk', on);
    try { localStorage.setItem('sp.adm.dk', on ? '1' : '0'); } catch (x) { /* ignore */ }
  });
  const kpi = (n, l, sub, href, ico) => `<${href ? `a href="${href}"` : 'div'} class="dash-k"><span class="dash-ic" aria-hidden="true">${ico || ''}</span><span class="dash-n">${n}</span><span class="dash-l">${l}</span>${sub ? `<small>${sub}</small>` : ''}</${href ? 'a' : 'div'}>`;
  const IC = {
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5a3 3 0 0 1 0 6M18 14c1.8.7 3 2.5 3 5"/></svg>',
    pulse: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>',
    key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/></svg>',
    todo: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    box: '<svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>'
  };
  const chip = (on, a, v, t) => `<button type="button" class="dc-chip${on ? ' on' : ''}" data-dc="${a}" data-v="${v}" aria-pressed="${on}">${t}</button>`;
  const panel = (title, sub, body, ctrl, cls) => `<section class="panel dp${cls ? ' ' + cls : ''}"><div class="dp-h"><div><h2 class="lh">${title}</h2>${sub ? `<p class="dp-s">${sub}</p>` : ''}</div>${ctrl ? `<div class="dp-c">${ctrl}</div>` : ''}</div>${body}</section>`;

  function dashPage() {
    K.adminGate('dash', (p, shell) => {
      D.built = false;
      V(shell(`<p class="lead adm-lead">Vue d’ensemble en direct : les chiffres se mettent à jour tout seuls, sans recharger la page. <span class="dash-live" id="dash-live"><i></i>en direct</span></p><div id="dash"><p class="mut" role="status">Connexion aux données en direct…</p></div>`));
      Promise.all([ensureLive(), import(K.MOD('dashcharts.js')).then((m) => { CH = m; })]).then(() => renderDash(true));
    });
  }

  const dayStarts = () => Array.from({ length: 30 }, (_, i) => { const d0 = new Date(); d0.setHours(0, 0, 0, 0); return d0.getTime() - (29 - i) * DAY; });
  function usageBy(S, from) {
    const m = {}; APPS.forEach(([id]) => { m[id] = { sec: 0, sess: 0, ppl: new Set() }; });
    S.sessions.forEach((x) => { if (ms(x.start) < from) return; const o = m[x.app] || (m[x.app] = { sec: 0, sess: 0, ppl: new Set() }); o.sec += x.seconds || 0; o.sess++; o.ppl.add(x.uid); });
    return m;
  }
  const onlineBy = (S, now) => {
    const m = {}, all = new Set(); S.presence.forEach((x) => { if (ms(x.lastSeen) > now - ONLINE) { (m[x.app] = m[x.app] || new Set()).add(x.uid); all.add(x.uid); } });
    return { m, all };
  };
  const mval = (o, metric) => metric === 'time' ? o.sec : metric === 'sessions' ? o.sess : o.ppl.size;
  const mfmt = (metric) => metric === 'time' ? fmtDur : (n) => nf(n) + (metric === 'sessions' ? (n > 1 ? ' sessions' : ' session') : (n > 1 ? ' personnes' : ' personne'));

  function renderDash(first) {
    const box = document.getElementById('dash'); if (!box || !LV || !CH) return;
    const S = LV.store;
    if (!S.ready.users) { box.innerHTML = '<p class="mut" role="status">Connexion aux données en direct…</p>'; return; }
    if (S.errors.users) { box.innerHTML = `<div class="panel"><p>Lecture impossible (${esc(S.errors.users)}). Vérifiez que vous êtes administrateur et que les règles Firestore sont publiées.</p></div>`; return; }
    if (!D.built || first === true) { buildDash(box); D.built = true; paintAll(true); } else paintAll(false);
    clearInterval(D.tick); D.tick = setInterval(() => { if (!document.getElementById('dash-live-box')) return clearInterval(D.tick); paintLive(false); }, 15000);
  }

  function buildDash(box) {
    box.innerHTML = `<div class="dash-grid" id="d-kpi"></div>
<div class="dash-row r-live">
${panel('Connectés en ce moment', 'Nombre de personnes ouvertes sur chaque logiciel, sans aucun nom. Actualisé en continu.', '<div id="dash-live-box"></div>', '', 'p-live')}
${panel('Logiciels les plus utilisés', '', '<div id="d-donut"></div>', `<div class="dc-seg-c" role="group" aria-label="Période">${[[1, '24 h'], [7, '7 jours'], [30, '30 jours']].map(([v, t]) => chip(D.period === v, 'period', v, t)).join('')}</div><div class="dc-seg-c" role="group" aria-label="Mesure">${[['time', 'Temps'], ['sessions', 'Sessions'], ['people', 'Personnes']].map(([v, t]) => chip(D.metric === v, 'metric', v, t)).join('')}</div>`)}
</div>
${panel('Activité par jour', '30 derniers jours, par logiciel. Survolez une colonne pour le détail, cliquez sur la légende pour filtrer.', '<div id="d-stack"></div>', `<div class="dc-seg-c" role="group" aria-label="Mesure">${[['time', 'Temps'], ['sessions', 'Sessions'], ['people', 'Personnes']].map(([v, t]) => chip(D.stackMetric === v, 'smetric', v, t)).join('')}</div>`)}
<div class="dash-row">
${panel('Inscriptions', '30 derniers jours', '<div id="d-signups"></div>')}
${panel('Type de compte', '', '<div id="d-types"></div>')}
</div>
<div class="dash-row">
${panel('Licences actives par logiciel', 'Comptes ayant une licence active du logiciel.', '<div id="d-lic"></div>')}
${panel('Dernières inscriptions', '', '<ul class="adm-pend-l dash-ul" id="d-last"></ul>', '<a class="dp-link" href="#/admin/comptes">Tous les comptes →</a>')}
</div>
<p class="dash-more"><a class="btn b4" href="#/admin/activite">Voir qui a déjà utilisé une app →</a></p>`;
    box.onclick = (e) => {
      const b = e.target.closest('[data-dc]'); if (!b) return;
      const a = b.dataset.dc, v = b.dataset.v;
      if (a === 'period') D.period = Number(v); else if (a === 'metric') D.metric = v; else if (a === 'smetric') D.stackMetric = v;
      b.parentNode.querySelectorAll('.dc-chip').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      if (a === 'smetric') paintStack(true); else paintDonut(true);
    };
  }
  const toggle = (id) => { D.hidden.has(id) ? D.hidden.delete(id) : D.hidden.add(id); paintDonut(true); paintStack(true); };

  function paintAll(anim) {
    const S = LV.store, now = Date.now(), U = S.users, type = (u) => K.acctType(u), cnt = (f) => U.filter(f).length;
    const act = (l) => l.status === 'active' && (!ms(l.expiresAt) || ms(l.expiresAt) > now);
    const L = S.licenses.filter((l) => !K.licGone(l)), la = L.filter(act);
    const seen24 = (u) => ms(u.lastLogin) > now - DAY, seen7 = (u) => ms(u.lastLogin) > now - 7 * DAY;
    const paying = new Set(la.filter((l) => l.licenseType && l.licenseType !== 'free').map((l) => l.userId));
    const pendCo = cnt((u) => u.status === 'pending'), pendCom = cnt((u) => u.commercialStatus === 'pending');
    const reqs = S.requests.filter((r) => r.status === 'pending' || r.status === 'open' || !r.status).length;
    const qOpen = S.quotes.filter((q) => ['issued', 'sent', 'accepted'].includes(q.status)).length;
    const soon = la.filter((l) => ms(l.expiresAt) && ms(l.expiresAt) < now + 30 * DAY).length;
    const on = onlineBy(S, now);
    document.getElementById('d-kpi').innerHTML =
      kpi(nf(U.length), 'Comptes créés', `+${cnt((u) => ms(u.createdAt) > now - 7 * DAY)} cette semaine`, '#/admin/comptes', IC.users) +
      kpi(nf(on.all.size), 'Connectés maintenant', `${cnt(seen24)} comptes vus en 24 h · ${cnt(seen7)} en 7 j`, '#/admin/activite', IC.pulse) +
      kpi(nf(paying.size), 'Licences payantes', `${la.length} licences actives`, '', IC.key) +
      kpi(nf(pendCo + pendCom + reqs + qOpen), 'À traiter', `${pendCo} entreprise · ${pendCom} commercial · ${reqs} ajout · ${qOpen} devis`, '#/admin/a-traiter', IC.todo) +
      kpi(nf(soon), 'Expirent sous 30 j', 'licences actives', '', IC.clock) +
      kpi(nf(S.keys.filter((k) => k.status === 'available').length), 'Clés disponibles', `${S.keys.filter((k) => k.status === 'redeemed').length} activées`, '#/admin/entreprises', IC.box);
    paintLive(anim); paintDonut(anim); paintStack(anim);
    // inscriptions
    const days = dayStarts(), perDay = days.map((a) => cnt((u) => ms(u.createdAt) >= a && ms(u.createdAt) < a + DAY));
    CH.line(document.getElementById('d-signups'), { id: 'su', labels: days.map((a) => new Date(a).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })), long: days.map((a) => new Date(a).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })), values: perDay, unit: 'inscription(s)', color: '#0877B9', anim });
    // types de compte
    const TY = [['free', 'Free', '#0877B9'], ['commercial', 'Commercial', '#169999'], ['entreprise', 'Entreprise', '#071B55']];
    CH.donut(document.getElementById('d-types'), { items: TY.map(([id, label, color]) => ({ id, label, color, value: cnt((u) => type(u) === id) })), hidden: new Set(), center: [nf(U.length), 'comptes'], fmt: (n) => nf(n) + (n > 1 ? ' comptes' : ' compte'), notes: (s) => nf(s.value), anim, label: 'Types de compte' });
    // licences par logiciel
    const prods = new Map(), nameOf = (id) => (S.products.find((p) => p.id === id) || {}).name;
    L.forEach((l) => { if (!act(l)) return; const o = prods.get(l.productId) || { name: nameOf(l.productId) || l.productName || l.productId, n: 0, users: new Set() }; prods.set(l.productId, o); o.n++; o.users.add(l.userId); });
    CH.hbars(document.getElementById('d-lic'), { rows: [...prods.values()].sort((a, b) => b.n - a.n).map((o, i) => ({ label: o.name, value: o.n, color: APPS[i % APPS.length][2], sub: `${o.users.size} compte(s)` })), fmt: (n) => nf(n), empty: 'Aucune licence active.', anim });
    document.getElementById('d-last').innerHTML = U.slice(0, 6).map((u) => `<li><div><b>${esc(K.fullName(u))}</b><small>${esc(u.email)} · ${esc(fdate(u.createdAt, true))}</small></div><span class="bd bd-kind">${esc({ free: 'Free', commercial: 'Commercial', entreprise: 'Entreprise' }[type(u)])}</span></li>`).join('') || '<li class="mut">Aucune inscription.</li>';
  }

  const rulesHint = (S) => (S.errors.presence || S.errors.sessions) ? `<p class="dash-warn" role="alert">Les données d’usage ne sont pas lisibles (${esc(S.errors.presence || S.errors.sessions)}). Publiez les règles Firestore à jour (morceau <code>40-presence.rules</code>).</p>` : '';
  const noData = (S) => (!S.errors.presence && S.ready.presence && !S.presence.length) ? '<p class="dash-warn soft">Aucune activité reçue pour l’instant : les apps envoient leur présence dès qu’une personne connectée les ouvre. Les premières données apparaissent alors ici, en direct.</p>' : '';

  function paintLive(anim) {
    const S = LV.store, box = document.getElementById('dash-live-box'); if (!box) return;
    const on = onlineBy(S, Date.now()), tot = on.all.size;
    if (!box.firstChild) box.innerHTML = '<div class="lv-top"><span class="lv-n" id="lv-n" data-v="0">0</span><span class="lv-t">personne(s) connectée(s)<small id="lv-s"></small></span></div><div id="lv-b"></div><div id="lv-w"></div>';
    CH.countTo(document.getElementById('lv-n'), tot);
    document.getElementById('lv-s').textContent = tot ? ' sur l’ensemble des logiciels' : ' pour le moment';
    document.getElementById('lv-w').innerHTML = rulesHint(S) + noData(S);
    const rows = APPS.map(([id, name, color]) => ({ label: name, value: (on.m[id] || new Set()).size, color })).sort((a, b) => b.value - a.value);
    CH.hbars(document.getElementById('lv-b'), { rows, fmt: (n) => nf(n), anim: anim && !box.dataset.done });
    box.dataset.done = 1;
  }
  function paintDonut(anim) {
    const S = LV.store, el = document.getElementById('d-donut'); if (!el) return;
    const u = usageBy(S, Date.now() - D.period * DAY), items = APPS.map(([id, name, color]) => ({ id, label: name, color, value: mval(u[id], D.metric) }));
    const f = mfmt(D.metric);
    CH.donut(el, { items, hidden: D.hidden, fmt: f, notes: (s) => f(s.value).replace(/ (sessions?|personnes?)$/, ''), center: [f(items.filter((s) => !D.hidden.has(s.id)).reduce((a, s) => a + s.value, 0)).replace(/ (sessions?|personnes?)$/, ''), D.metric === 'time' ? 'd’utilisation' : D.metric === 'sessions' ? 'sessions' : 'personnes (cumul)'], anim, onToggle: toggle, label: 'Répartition par logiciel', empty: 'Aucune utilisation enregistrée sur cette période.' });
  }
  function paintStack(anim) {
    const S = LV.store, el = document.getElementById('d-stack'); if (!el) return;
    const days = dayStarts(), m = D.stackMetric, per = {}; APPS.forEach(([id]) => { per[id] = days.map(() => ({ sec: 0, sess: 0, ppl: new Set() })); });
    S.sessions.forEach((x) => { const t = ms(x.start); if (t < days[0]) return; const i = Math.min(29, Math.floor((t - days[0]) / DAY)); const o = (per[x.app] || (per[x.app] = days.map(() => ({ sec: 0, sess: 0, ppl: new Set() }))))[i]; o.sec += x.seconds || 0; o.sess++; o.ppl.add(x.uid); });
    const series = APPS.map(([id, name, color]) => ({ id, label: name, color, values: per[id].map((o) => m === 'time' ? o.sec / 3600 : m === 'sessions' ? o.sess : o.ppl.size) }));
    const f = m === 'time' ? (h) => fmtDur(h * 3600) : (n) => nf(Math.round(n)) + (m === 'sessions' ? ' sess.' : ' pers.');
    CH.stack(el, { labels: days.map((a) => new Date(a).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })), long: days.map((a) => new Date(a).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })), series, hidden: D.hidden, fmt: f, axis: m === 'time' ? (h) => h < 1 ? Math.round(h * 60) + ' min' : (Math.round(h * 10) / 10) + ' h' : (n) => nf(Math.round(n * 10) / 10), anim, onToggle: toggle });
  }

  /* ------------------------------------------------------------------ « Activité » : qui a déjà utilisé une app */
  const AC = { q: '', app: '', f: '', sort: 'last', dir: -1, page: 1, per: 15 };
  const hue = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; };
  const initials = (u, em) => { const n = u ? [u.firstName, u.lastName].filter(Boolean).map((x) => x[0]).join('') : ''; return (n || (em || '?')[0] || '?').slice(0, 2).toUpperCase(); };

  function activityPage() {
    K.adminGate('activity', (p, shell) => {
      V(shell(`<p class="lead adm-lead">Toutes les personnes qui se sont connectées au moins une fois à un site d’app, avec ou sans licence. <span class="dash-live"><i></i>en direct</span></p>
<section class="panel ac"><div class="ac-bar"><div class="ac-s"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input id="ac-q" type="search" placeholder="Rechercher un nom, un e-mail…" autocomplete="off" aria-label="Rechercher" value="${esc(AC.q)}"></div>
<div class="ac-f"><label class="sr" for="ac-app">Logiciel</label><select id="ac-app"><option value="">Tous les logiciels</option>${APPS.map(([id, n]) => `<option value="${id}"${AC.app === id ? ' selected' : ''}>${n}</option>`).join('')}</select>
<label class="sr" for="ac-sort">Trier</label><select id="ac-sort">${[['last', 'Dernière activité'], ['first', 'Première visite'], ['name', 'Nom (A → Z)'], ['sess', 'Nombre de sessions'], ['time', 'Temps (30 j)']].map(([v, t]) => `<option value="${v}"${AC.sort === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div></div>
<div class="ac-chips" role="group" aria-label="Filtres">${[['', 'Tous'], ['online', 'En ligne'], ['lic', 'Avec licence'], ['nolic', 'Sans licence'], ['week', 'Actifs 7 j']].map(([v, t]) => chip(AC.f === v, 'acf', v, t)).join('')}<span class="ac-cnt" id="ac-cnt" aria-live="polite"></span></div>
<div id="ac-list"><p class="mut" role="status">Connexion aux données en direct…</p></div></section>`));
      const root = document.querySelector('.ac');
      root.addEventListener('input', (e) => { if (e.target.id === 'ac-q') { AC.q = e.target.value; AC.page = 1; paintAct(); } });
      root.addEventListener('change', (e) => { if (e.target.id === 'ac-app') AC.app = e.target.value; else if (e.target.id === 'ac-sort') AC.sort = e.target.value; else return; AC.page = 1; paintAct(); });
      root.addEventListener('click', (e) => {
        const c = e.target.closest('[data-dc="acf"]'); if (c) { AC.f = c.dataset.v; AC.page = 1; root.querySelectorAll('[data-dc="acf"]').forEach((x) => { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', x === c); }); return paintAct(); }
        const g = e.target.closest('[data-pg]'); if (g) { AC.page = Number(g.dataset.pg); paintAct(); root.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      });
      ensureLive().then(() => { D.tick2 = D.tick2 || setInterval(() => { if (document.getElementById('ac-list')) paintAct(); else clearInterval(D.tick2), D.tick2 = null; }, 30000); paintAct(); });
    });
  }
  function paintAct() {
    const el = document.getElementById('ac-list'); if (!el || !LV) return;
    const S = LV.store, now = Date.now();
    if (!S.ready.users || !S.ready.presence) { el.innerHTML = '<p class="mut" role="status">Connexion aux données en direct…</p>'; return; }
    if (S.errors.presence) { el.innerHTML = rulesHint(S); return; }
    const byU = new Map(S.users.map((u) => [u.uid, u])), lic = new Set(S.licenses.filter((l) => !K.licGone(l) && l.status === 'active' && (!ms(l.expiresAt) || ms(l.expiresAt) > now)).map((l) => l.userId));
    const sec = {}; S.sessions.forEach((x) => { if (ms(x.start) > now - 30 * DAY) sec[x.uid] = (sec[x.uid] || 0) + (x.seconds || 0); });
    const P = new Map();
    S.presence.forEach((x) => {
      const o = P.get(x.uid) || { uid: x.uid, apps: [], first: Infinity, last: 0, sess: 0 }; P.set(x.uid, o);
      o.apps.push({ id: x.app, last: ms(x.lastSeen), first: ms(x.firstSeen), sess: x.sessions || 0 });
      o.first = Math.min(o.first, ms(x.firstSeen) || Infinity); o.last = Math.max(o.last, ms(x.lastSeen)); o.sess += x.sessions || 0;
    });
    let rows = [...P.values()].map((o) => { const u = byU.get(o.uid); return { ...o, u, name: u ? K.fullName(u) : 'Compte supprimé', email: u ? u.email : '', lic: lic.has(o.uid), sec: sec[o.uid] || 0, on: o.apps.some((a) => a.last > now - ONLINE) }; });
    const total = rows.length, q = AC.q.trim().toLowerCase();
    if (q) rows = rows.filter((r) => (r.name + ' ' + r.email).toLowerCase().includes(q));
    if (AC.app) rows = rows.filter((r) => r.apps.some((a) => a.id === AC.app));
    if (AC.f === 'online') rows = rows.filter((r) => r.on); else if (AC.f === 'lic') rows = rows.filter((r) => r.lic); else if (AC.f === 'nolic') rows = rows.filter((r) => !r.lic); else if (AC.f === 'week') rows = rows.filter((r) => r.last > now - 7 * DAY);
    const cmp = { last: (a, b) => b.last - a.last, first: (a, b) => b.first - a.first, name: (a, b) => a.name.localeCompare(b.name, 'fr'), sess: (a, b) => b.sess - a.sess, time: (a, b) => b.sec - a.sec }[AC.sort];
    rows.sort(cmp);
    const pages = Math.max(1, Math.ceil(rows.length / AC.per)); AC.page = Math.min(AC.page, pages);
    const slice = rows.slice((AC.page - 1) * AC.per, AC.page * AC.per);
    document.getElementById('ac-cnt').textContent = `${rows.length} sur ${total} personne${total > 1 ? 's' : ''}`;
    const pill = (a) => `<span class="ac-p" title="${esc(appOf(a.id).name)} · ${a.sess} session(s) · dernière : ${esc(new Date(a.last).toLocaleString('fr-FR'))}"><i style="background:${appOf(a.id).color}"></i>${esc(appOf(a.id).name)}</span>`;
    el.innerHTML = (rulesHint(S) || '') + (slice.length ? `<div class="ac-t" role="table" aria-label="Personnes ayant utilisé une app"><div class="ac-r ac-hd" role="row"><span role="columnheader">Personne</span><span role="columnheader">Logiciels</span><span role="columnheader">Dernière activité</span><span role="columnheader" class="r">Sessions</span><span role="columnheader" class="r">Temps (30 j)</span><span role="columnheader">Licence</span></div>` +
      slice.map((r) => `<div class="ac-r" role="row"><span class="ac-who" role="cell"><span class="ac-av${r.on ? ' on' : ''}" style="--h:${hue(r.uid)}" aria-hidden="true">${esc(initials(r.u, r.email))}</span><span class="ac-nm"><b>${esc(r.name)}</b><small>${esc(r.email)}</small></span></span><span class="ac-apps" role="cell">${r.apps.sort((a, b) => b.last - a.last).map(pill).join('')}</span><span class="ac-last" role="cell" data-l="Dernière activité">${r.on ? '<span class="ac-live"><i></i>en ligne</span>' : esc(rel(r.last))}</span><span class="r" role="cell" data-l="Sessions">${nf(r.sess)}</span><span class="r" role="cell" data-l="Temps (30 j)">${r.sec ? esc(fmtDur(r.sec)) : '—'}</span><span role="cell" data-l="Licence"><span class="bd ${r.lic ? 'bd-ok' : 'bd-no'}">${r.lic ? 'Avec licence' : 'Sans licence'}</span></span></div>`).join('') + '</div>' +
      (pages > 1 ? `<nav class="ac-pg" aria-label="Pagination"><button type="button" class="btn b4" data-pg="${AC.page - 1}"${AC.page <= 1 ? ' disabled' : ''}>← Précédent</button><span>Page ${AC.page} sur ${pages}</span><button type="button" class="btn b4" data-pg="${AC.page + 1}"${AC.page >= pages ? ' disabled' : ''}>Suivant →</button></nav>` : '')
      : `<div class="ac-empty"><b>${total ? 'Aucun résultat' : 'Personne pour l’instant'}</b><p>${total ? 'Aucune personne ne correspond à ces filtres.' : 'Dès qu’une personne se connecte à un site d’app, elle apparaît ici, avec ou sans licence.'}</p></div>`);
  }
  window.SP.dashboard = { render: renderDash, activity: paintAct };
  window.SP.liveStore = () => (LV && LV.store.ready.users ? LV.store : null);
  Object.assign(R, { 'admin': dashPage, 'admin/tableau': dashPage, 'admin/activite': activityPage });
})();
