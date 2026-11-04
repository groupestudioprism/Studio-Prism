/* Studio Prism — PrismStatus : présence en direct + compteur de jours restants d'abonnement (code commun à tous les logiciels).
 *
 *   PrismStatus.start({ app, db, auth, firestoreFns, product, top, accountUrl })
 *
 *   app           identifiant court du logiciel (minuscules, chiffres, tirets) : 'archiplan', 'spectrawriter', 'studio-prism'…
 *   db, auth      instances Firebase du logiciel (SDK modulaire v9+ OU SDK « compat » v8 : détecté automatiquement)
 *   firestoreFns  SDK modulaire seulement : { doc, setDoc, deleteDoc, serverTimestamp, collection, query, where, getDocs }
 *   product       identifiant du produit dont on affiche l'échéance (défaut : app ; null = la licence qui expire le plus tôt)
 *   top           décalage du badge depuis le haut, en px (nombre ou fonction ; défaut 12)
 *   accountUrl    lien du badge (défaut https://studio-prism.com/#/compte)
 *
 * 1) Présence : presence/{uid}_{app} = { uid, app, lastSeen } réécrit toutes les 60 s tant que l'onglet est visible (et au retour
 *    sur l'onglet), supprimé à la fermeture de la page et à la déconnexion. « Connecté maintenant » = lastSeen de moins de 3 minutes.
 * 2) Compteur : si la licence (à durée définie) expire dans moins de 30 jours, un petit badge s'affiche en haut à droite, par-dessus
 *    l'interface (position fixe : rien n'est déplacé dans l'en-tête). On peut le déplacer (glisser) et le replier (bouton –) ;
 *    sa position et son état sont retenus sur l'appareil. Une licence expirée reste signalée 7 jours.
 *
 * Renvoie { stop() }. Aucune dépendance, aucun réseau en dehors de Firestore. Les règles Firestore (bloc presence) valident tout.
 * Modifier ce fichier ICI uniquement (dépôt Studio-Prism, dossier shared/), puis le recopier dans les logiciels. */
(function (g) {
  'use strict';
  const BEAT = 60000, DAY = 864e5, WARN_DAYS = 30, GRACE_DAYS = 7, LS = 'sp.status.badge';
  const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : t instanceof Date ? t.getTime() : typeof t === 'number' ? t : 0);
  const store = { get() { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } }, set(v) { try { localStorage.setItem(LS, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } } };

  /* ---------------------------------------------------------------- accès Firestore (modulaire ou compat) */
  function fsApi(db, F) {
    const compat = !F && db && typeof db.collection === 'function';
    if (!compat && !(F && F.doc && F.setDoc)) throw new Error('PrismStatus : firestoreFns manquant (SDK modulaire)');
    const now = () => (compat ? g.firebase.firestore.FieldValue.serverTimestamp() : F.serverTimestamp());
    return {
      set: (id, data) => (compat ? db.collection('presence').doc(id).set({ ...data, lastSeen: now() }) : F.setDoc(F.doc(db, 'presence', id), { ...data, lastSeen: now() })),
      del: (id) => (compat ? db.collection('presence').doc(id).delete() : F.deleteDoc(F.doc(db, 'presence', id))),
      licenses: async (uid) => {
        const snap = compat ? await db.collection('licenses').where('userId', '==', uid).get()
          : await F.getDocs(F.query(F.collection(db, 'licenses'), F.where('userId', '==', uid)));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
    };
  }

  /* ---------------------------------------------------------------- échéance à afficher */
  function deadline(lics, product) {
    const now = Date.now();
    const l = lics.filter((x) => (product == null || x.productId === product) && x.status !== 'suspended' && ms(x.expiresAt))
      .map((x) => ({ x, end: ms(x.expiresAt) }))
      .filter(({ end }) => end > now - GRACE_DAYS * DAY && end < now + WARN_DAYS * DAY)
      .sort((a, b) => a.end - b.end)[0];
    if (!l) return null;
    const left = Math.ceil((l.end - now) / DAY);
    return { name: l.x.productName || l.x.productId, end: l.end, left, expired: l.end <= now };
  }

  /* ---------------------------------------------------------------- badge */
  const CSS = `.sp-st{position:fixed;z-index:2147483000;right:12px;top:12px;display:flex;align-items:center;gap:6px;max-width:min(320px,calc(100vw - 24px));
padding:6px 8px 6px 10px;border-radius:999px;background:#fff;color:#0b1d40;border:1px solid #c9d7e6;box-shadow:0 4px 16px rgba(7,27,85,.16);
font:600 12.5px/1.2 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;cursor:grab;user-select:none;touch-action:none}
.sp-st.drag{cursor:grabbing}.sp-st a{color:inherit;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-st a:hover{text-decoration:underline}.sp-st i{flex:none;width:8px;height:8px;border-radius:50%;background:#eda100}
.sp-st.urgent i{background:#d03b3b}.sp-st.exp{border-color:#e6b4ae;background:#fdf1ef;color:#8c1d18}.sp-st.exp i{background:#d03b3b}
.sp-st button{flex:none;width:20px;height:20px;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;font:700 14px/20px system-ui;cursor:pointer;opacity:.6}
.sp-st button:hover,.sp-st button:focus-visible{opacity:1;background:rgba(7,27,85,.08)}.sp-st.min{padding:6px 6px 6px 10px}.sp-st.min .sp-t{display:none}
@media (prefers-color-scheme:dark){.sp-st{background:#13213b;color:#eef3fb;border-color:#2b3d5e}.sp-st.exp{background:#3a1715;color:#ffd8d4;border-color:#7a2a24}}
@media print{.sp-st{display:none}}`;
  function badge(opts) {
    let el = null, info = null;
    const pref = store.get();
    function ensure() {
      if (el) return el;
      if (!document.getElementById('sp-st-css')) { const s = document.createElement('style'); s.id = 'sp-st-css'; s.textContent = CSS; document.head.appendChild(s); }
      el = document.createElement('div'); el.className = 'sp-st'; el.setAttribute('role', 'status');
      el.innerHTML = '<i aria-hidden="true"></i><a class="sp-n" target="_blank" rel="noopener"></a><span class="sp-t" hidden></span><button type="button" class="sp-m"></button>';
      document.body.appendChild(el);
      el.querySelector('.sp-m').addEventListener('click', (e) => { e.stopPropagation(); pref.min = !pref.min; store.set(pref); paint(); });
      drag(el);
      place();
      g.addEventListener('resize', place);
      return el;
    }
    function place() {
      if (!el) return;
      const top = typeof opts.top === 'function' ? opts.top() : (opts.top == null ? 12 : opts.top);
      if (pref.x != null && pref.y != null) {
        const w = el.offsetWidth || 160, h = el.offsetHeight || 30;
        el.style.left = Math.max(4, Math.min(innerWidth - w - 4, pref.x)) + 'px'; el.style.top = Math.max(4, Math.min(innerHeight - h - 4, pref.y)) + 'px'; el.style.right = 'auto';
      } else { el.style.top = top + 'px'; el.style.right = '12px'; el.style.left = 'auto'; }
    }
    function drag(node) {
      let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, id = null;
      node.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        id = e.pointerId; moved = false; const r = node.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      });
      node.addEventListener('pointermove', (e) => {
        if (id !== e.pointerId) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
        if (!moved) { moved = true; node.classList.add('drag'); try { node.setPointerCapture(id); } catch (x) { /* rien */ } }
        pref.x = ox + dx; pref.y = oy + dy; place();
      });
      const end = (e) => { if (id !== e.pointerId) return; id = null; node.classList.remove('drag'); if (moved) store.set(pref); };
      node.addEventListener('pointerup', end); node.addEventListener('pointercancel', end);
      node.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
      node.addEventListener('dblclick', () => { delete pref.x; delete pref.y; store.set(pref); place(); });   // double-clic : position d'origine
    }
    function paint() {
      if (!info) { if (el) el.hidden = true; return; }
      ensure(); el.hidden = false;
      const d = info, a = el.querySelector('.sp-n'), txt = d.expired ? `${d.name} : licence expirée` : d.left <= 1 ? `${d.name} : expire aujourd’hui` : `${d.name} : ${d.left} jours restants`;
      el.classList.toggle('exp', d.expired); el.classList.toggle('urgent', !d.expired && d.left <= 7); el.classList.toggle('min', !!pref.min);
      a.textContent = pref.min ? (d.expired ? 'Expirée' : `J-${Math.max(0, d.left)}`) : txt;
      a.href = opts.accountUrl || 'https://studio-prism.com/#/compte';
      a.title = `${txt} — fin le ${new Date(d.end).toLocaleDateString('fr-FR')}. Renouveler depuis Mon compte. Glisser pour déplacer, double-clic pour replacer.`;
      const b = el.querySelector('.sp-m'); b.textContent = pref.min ? '+' : '–'; b.setAttribute('aria-label', pref.min ? 'Déplier le compteur' : 'Replier le compteur');
      place();
    }
    return { show(d) { info = d; paint(); }, remove() { if (el) el.remove(); el = null; g.removeEventListener('resize', place); } };
  }

  /* ---------------------------------------------------------------- démarrage */
  function start(o) {
    if (!o || !o.db || !o.auth || !/^[a-z0-9-]{2,30}$/.test(String(o.app || ''))) throw new Error('PrismStatus.start : { app, db, auth } requis');
    const fs = fsApi(o.db, o.firestoreFns), product = o.product === undefined ? o.app : o.product, bd = badge(o);
    let uid = '', timer = 0, lic = 0, stopped = false;
    const pid = () => uid + '_' + o.app;
    const beat = () => { if (uid && document.visibilityState === 'visible') fs.set(pid(), { uid, app: o.app }).catch(() => {}); };
    const loop = () => { clearInterval(timer); timer = 0; if (uid && document.visibilityState === 'visible') { beat(); timer = setInterval(beat, BEAT); } };
    const bye = () => { if (uid) fs.del(pid()).catch(() => {}); };
    const check = () => { if (!uid) return bd.show(null); fs.licenses(uid).then((l) => bd.show(deadline(l, product))).catch(() => bd.show(null)); };
    const onVis = () => { loop(); if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    g.addEventListener('pagehide', bye);
    const unsub = o.auth.onAuthStateChanged((u) => {
      if (stopped) return;
      if (uid && (!u || u.uid !== uid)) bye();   // déconnexion / changement de compte : on retire l'ancienne présence
      uid = u ? u.uid : '';
      loop(); check();
      clearInterval(lic); lic = uid ? setInterval(check, 3600000) : 0;   // l'échéance est relue toutes les heures
    });
    return {
      refresh: check,
      stop() { stopped = true; bye(); clearInterval(timer); clearInterval(lic); document.removeEventListener('visibilitychange', onVis); g.removeEventListener('pagehide', bye); if (typeof unsub === 'function') unsub(); bd.remove(); uid = ''; }
    };
  }

  g.PrismStatus = { start, deadline, ONLINE_MS: 180000 };
})(typeof globalThis !== 'undefined' ? globalThis : window);
