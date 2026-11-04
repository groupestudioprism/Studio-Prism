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
    if (h === '#/admin' || h === '#/admin/tableau') return later('d', renderDash, 250);
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
  const bar = (rows, color) => {
    const max = Math.max(1, ...rows.map((r) => r[1]));
    return rows.length ? `<ul class="dash-bars">${rows.map(([l, n, extra]) => `<li><span class="dash-bl">${esc(l)}</span><span class="dash-bt"><i style="width:${Math.round(n / max * 100)}%;${color ? 'background:' + color : ''}"></i></span><b>${n}</b>${extra ? `<small>${esc(extra)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="mut">Aucune donnée.</p>';
  };
  const kpi = (n, l, sub, href) => `<${href ? `a href="${href}"` : 'div'} class="dash-k"><span class="dash-n">${n}</span><span class="dash-l">${l}</span>${sub ? `<small>${sub}</small>` : ''}</${href ? 'a' : 'div'}>`;

  function dashPage() {
    K.adminGate('dash', (p, shell) => {
      V(shell(`<p class="lead">Vue d’ensemble en direct : les chiffres se mettent à jour tout seuls, sans recharger la page. <span class="dash-live" id="dash-live">● en direct</span></p><div id="dash"><p class="mut" role="status">Connexion aux données en direct…</p></div>`));
      ensureLive().then(renderDash);
    });
  }
  function renderDash() {
    const box = document.getElementById('dash'); if (!box || !LV) return;
    const S = LV.store, now = Date.now();
    if (!S.ready.users) { box.innerHTML = '<p class="mut" role="status">Connexion aux données en direct…</p>'; return; }
    if (S.errors.users) { box.innerHTML = `<div class="panel"><p>Lecture impossible (${esc(S.errors.users)}). Vérifiez que vous êtes administrateur et que les règles Firestore sont publiées.</p></div>`; return; }
    const U = S.users, nameOf = (id) => (S.products.find((p) => p.id === id) || {}).name;
    const type = (u) => K.acctType(u);
    const cnt = (f) => U.filter(f).length;
    const act = (l) => l.status === 'active' && (!ms(l.expiresAt) || ms(l.expiresAt) > now);
    const L = S.licenses, la = L.filter(act), usersById = new Map(U.map((u) => [u.uid, u]));
    const seen24 = (u) => ms(u.lastLogin) > now - DAY, seen7 = (u) => ms(u.lastLogin) > now - 7 * DAY;
    const prods = new Map();
    L.forEach((l) => { const id = l.productId, o = prods.get(id) || { name: nameOf(id) || l.productName || id, lic: 0, users: new Set(), on: new Set(), sub: 0 }; prods.set(id, o);
      if (act(l)) { o.lic++; o.users.add(l.userId); const u = usersById.get(l.userId); if (u && seen24(u)) o.on.add(l.userId); if (l.licenseType && l.licenseType !== 'free') o.sub++; } });
    const prodRows = [...prods.values()].sort((a, b) => b.lic - a.lic);
    const paying = new Set(la.filter((l) => l.licenseType && l.licenseType !== 'free').map((l) => l.userId));
    const days = Array.from({ length: 30 }, (_, i) => { const d0 = new Date(); d0.setHours(0, 0, 0, 0); const a = d0.getTime() - (29 - i) * DAY; return [new Date(a).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), cnt((u) => ms(u.createdAt) >= a && ms(u.createdAt) < a + DAY)]; });
    const dmax = Math.max(1, ...days.map((d) => d[1]));
    const pendCo = cnt((u) => u.status === 'pending'), pendCom = cnt((u) => u.commercialStatus === 'pending');
    const reqs = S.requests.filter((r) => r.status === 'pending' || r.status === 'open' || !r.status).length;
    const qOpen = S.quotes.filter((q) => ['issued', 'sent', 'accepted'].includes(q.status)).length;
    const soon = la.filter((l) => ms(l.expiresAt) && ms(l.expiresAt) < now + 30 * DAY).length;
    box.innerHTML = `<div class="dash-grid">
${kpi(U.length, 'Comptes créés', `+${cnt((u) => ms(u.createdAt) > now - 7 * DAY)} cette semaine`, '#/admin/comptes')}
${kpi(cnt(seen24), 'Connectés (24 h)', `${cnt(seen7)} sur 7 jours`)}
${kpi(paying.size, 'Comptes avec licence payante', `${la.length} licences actives`)}
${kpi(pendCo + pendCom + reqs + qOpen, 'À traiter', `${pendCo} entreprise · ${pendCom} commercial · ${reqs} ajout · ${qOpen} devis`, '#/admin/a-traiter')}
${kpi(soon, 'Licences expirant sous 30 j', '')}
${kpi(S.keys.filter((k) => k.status === 'available').length, 'Clés disponibles', `${S.keys.filter((k) => k.status === 'redeemed').length} activées`, '#/admin/entreprises')}
</div>
<div class="dash-cols">
<section class="panel"><h2 class="lh">Type de compte</h2>${bar([['Free', cnt((u) => type(u) === 'free')], ['Commercial', cnt((u) => type(u) === 'commercial')], ['Entreprise', cnt((u) => type(u) === 'entreprise')]])}<p class="mut">Particuliers : ${cnt((u) => u.accountKind !== 'company')} · Entreprises : ${cnt((u) => u.accountKind === 'company')}</p></section>
<section class="panel"><h2 class="lh">Utilisateurs par logiciel</h2>${bar(prodRows.map((o) => [o.name, o.users.size]))}<p class="mut">Comptes ayant une licence active du logiciel.</p></section>
<section class="panel"><h2 class="lh">Connectés (24 h) par logiciel</h2>${bar(prodRows.map((o) => [o.name, o.on.size]), 'var(--teal,#169999)')}<p class="mut">Comptes à licence active, vus ces dernières 24 h.</p></section>
<section class="panel"><h2 class="lh">Logiciels les plus utilisés</h2>${bar(prodRows.slice(0, 8).map((o) => [o.name, o.lic, o.sub ? o.sub + ' payantes' : '']))}</section>
</div>
<section class="panel"><h2 class="lh">Inscriptions des 30 derniers jours</h2><div class="dash-spark" role="img" aria-label="Inscriptions par jour">${days.map(([d, n]) => `<span title="${d} : ${n}"><i style="height:${Math.round(n / dmax * 100)}%"></i></span>`).join('')}</div><p class="mut">${days[0][0]} → ${days[29][0]} · pic : ${dmax} par jour</p></section>
<section class="panel"><h2 class="lh">Dernières inscriptions</h2><ul class="adm-pend-l">${U.slice(0, 6).map((u) => `<li><div><b>${esc(K.fullName(u))}</b><small>${esc(u.email)} · ${esc(fdate(u.createdAt, true))}</small></div><span class="bd bd-kind">${esc({ free: 'Free', commercial: 'Commercial', entreprise: 'Entreprise' }[type(u)])}</span></li>`).join('') || '<li class="mut">Aucune inscription.</li>'}</ul></section>`;
  }
  window.SP.dashboard = { render: renderDash };
  Object.assign(R, { 'admin': dashPage, 'admin/tableau': dashPage });
})();
