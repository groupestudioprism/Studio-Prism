/* Studio Prism - présence et activité des apps (module commun, aucune dépendance).
 *
 * Rôle : alimenter le tableau de bord d'administration (personnes connectées en direct par logiciel, temps d'utilisation,
 * liste des personnes ayant déjà utilisé une app). Écrit dans Firestore (règles : appPresence, appSessions) via l'API REST,
 * donc indépendant du SDK Firebase de l'app (compat ou modulaire).
 *
 * Intégration (une ligne dans la page de l'app, après le chargement de Firebase si possible) :
 *   <script async src="https://studio-prism.com/shared/prism-presence.js" data-app="archiplan"></script>
 * Le module trouve seul la personne connectée (SDK compat : firebase.auth().currentUser). Sinon, l'app peut définir
 *   window.PRISM_PRESENCE_USER = () => auth.currentUser;
 *
 * Vie privée : seulement l'identifiant du compte, le nom de l'app et des horodatages. Jamais de contenu, de nom, d'adresse IP,
 * d'appareil ni de page consultée. Un battement toutes les 60 s tant que l'onglet est visible. Désactivable :
 * localStorage 'sp.presence.off' = '1'. Inactif en local (localhost, file:) et dans les navigateurs automatisés.
 */
(function () {
  'use strict';
  if (window.__prismPresence) return; window.__prismPresence = 1;
  var cs = document.currentScript;
  var APP = String((window.PRISM_PRESENCE && window.PRISM_PRESENCE.app) || (cs && cs.getAttribute('data-app')) || '').toLowerCase();
  if (!/^[a-z]{3,20}$/.test(APP)) return;
  try {
    if (/^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname) || navigator.webdriver || localStorage.getItem('sp.presence.off') === '1') return;
  } catch (e) { /* stockage indisponible : on continue */ }

  var DB = 'projects/archivision-studioprism/databases/(default)/documents';
  var URL_ = 'https://firestore.googleapis.com/v1/' + DB;
  var BEAT = 60000, NEW_SESSION_AFTER = 30 * 60000;
  var st = { uid: null, user: null, sid: null, active: 0, last: 0, busy: false, fails: 0, stopped: false };

  var rid = function () {
    var a = new Uint8Array(12); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return (b % 36).toString(36); }).join('') + Date.now().toString(36);
  };
  var currentUser = function () {
    try {
      if (typeof window.PRISM_PRESENCE_USER === 'function') return window.PRISM_PRESENCE_USER() || null;
      if (window.firebase && window.firebase.apps && window.firebase.apps.length) return window.firebase.auth().currentUser;
    } catch (e) { /* pas encore prêt */ }
    return null;
  };
  var TS = function (f) { return { fieldPath: f, setToServerValue: 'REQUEST_TIME' }; };
  var int = function (n) { return { integerValue: String(n) }; };
  var str = function (s) { return { stringValue: s }; };

  async function commit(token, writes) {
    var r = await fetch(URL_ + ':commit', {
      method: 'POST', keepalive: true,
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: writes })
    });
    if (!r.ok) { var e = new Error('presence ' + r.status); e.status = r.status; throw e; }
  }

  async function begin(u) {
    var token = await u.getIdToken();
    var pid = u.uid + '__' + APP, pname = DB + '/appPresence/' + pid, sid = rid(), n = 1, exists = false;
    var g = await fetch(URL_ + '/appPresence/' + pid, { headers: { 'Authorization': 'Bearer ' + token } });
    if (g.ok) { exists = true; var d = await g.json(); n = Number(d.fields && d.fields.sessions && d.fields.sessions.integerValue || 0) + 1; }
    else if (g.status !== 404) { var e = new Error('presence ' + g.status); e.status = g.status; throw e; }
    var w = [exists
      ? { update: { name: pname, fields: { sessions: int(n) } }, updateMask: { fieldPaths: ['sessions'] }, updateTransforms: [TS('lastSeen')], currentDocument: { exists: true } }
      : { update: { name: pname, fields: { uid: str(u.uid), app: str(APP), sessions: int(1) } }, updateTransforms: [TS('firstSeen'), TS('lastSeen')], currentDocument: { exists: false } },
      { update: { name: DB + '/appSessions/' + sid, fields: { uid: str(u.uid), app: str(APP), seconds: int(0) } }, updateTransforms: [TS('start'), TS('lastSeen')], currentDocument: { exists: false } }];
    await commit(token, w);
    st.uid = u.uid; st.sid = sid; st.active = 0; st.last = Date.now();
  }

  async function beat(u) {
    var now = Date.now();
    st.active = Math.min(86400, st.active + Math.min(90, Math.round((now - st.last) / 1000))); st.last = now;
    var token = await u.getIdToken();
    await commit(token, [
      { update: { name: DB + '/appPresence/' + u.uid + '__' + APP, fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: [TS('lastSeen')], currentDocument: { exists: true } },
      { update: { name: DB + '/appSessions/' + st.sid, fields: { seconds: int(st.active) } }, updateMask: { fieldPaths: ['seconds'] }, updateTransforms: [TS('lastSeen')], currentDocument: { exists: true } }
    ]);
  }

  async function tick() {
    if (st.stopped || st.busy) return;
    var u = currentUser();
    if (!u || !u.uid) { st.sid = null; st.uid = null; return; }
    if (document.visibilityState === 'hidden') return;   // onglet masqué : pas de battement
    st.busy = true;
    try {
      if (st.uid !== u.uid || !st.sid || Date.now() - st.last > NEW_SESSION_AFTER) await begin(u); else await beat(u);
      st.fails = 0;
    } catch (e) {
      st.fails++;
      if (e && e.status === 404) st.sid = null;                       // document supprimé : nouvelle session au prochain battement
      if (e && (e.status === 403 || e.status === 401) && st.fails >= 5) st.stopped = true;   // règles non publiées ou compte non actif : on se tait
    }
    st.busy = false;
  }

  tick(); setInterval(tick, BEAT);
  setTimeout(tick, 4000);   // la personne n'est souvent connectée que quelques secondes après le chargement
  setTimeout(tick, 12000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && Date.now() - st.last > 30000) tick(); });
  window.PrismPresence = { app: APP, tick: tick };
})();
