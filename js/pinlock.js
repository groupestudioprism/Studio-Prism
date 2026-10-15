/* Studio Prism — bouton « Afficher » sur tous les mots de passe, et code PIN du compte sur le site.
 *
 *  1) Tout champ mot de passe (et code PIN) reçoit un bouton « Afficher / Masquer », y compris ceux ajoutés plus tard
 *     (fenêtres, formulaires d'administration).
 *  2) Code PIN : le même que dans ARCHIPLAN et ARCHITRAFIC. Quand une session déjà ouverte est reprise (rechargement,
 *     retour sur le site) et qu'un code PIN existe, « Mon compte », l'administration et l'activation de clé demandent le
 *     code une fois par onglet. Une connexion par mot de passe déverrouille directement. 5 erreurs : déconnexion.
 *     Le code se choisit ou se modifie dans Mon compte › Sécurité.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ 1) « Afficher » sur les mots de passe */
  function enhance(i) {
    if (i.dataset.eye === '1') return;
    i.dataset.eye = '1';
    const host = i.parentElement;
    if (!host || host.querySelector('.pw-eye, .ap-eye')) return;
    const w = document.createElement('span');
    w.className = 'pw-wrap';
    host.insertBefore(w, i);
    w.appendChild(i);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pw-eye'; b.textContent = 'Afficher';
    b.setAttribute('aria-label', 'Afficher le mot de passe'); b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      const show = i.type === 'password';
      i.type = show ? 'text' : 'password';
      b.textContent = show ? 'Masquer' : 'Afficher';
      b.setAttribute('aria-pressed', String(show));
      b.setAttribute('aria-label', (show ? 'Masquer' : 'Afficher') + ' le mot de passe');
      i.focus();
    });
    w.appendChild(b);
  }
  const scan = (root) => { if (root.querySelectorAll) root.querySelectorAll('input[type=password]:not([data-eye="1"])').forEach(enhance); };
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches && n.matches('input[type=password]')) enhance(n);
    scan(n);
  }))).observe(document.documentElement, { childList: true, subtree: true });
  scan(document);

  /* ------------------------------------------------------------------ 2) code PIN du compte */
  const K = window.SP && window.SP.kit;
  if (!K) return;
  const { st, esc } = K;
  const PD = () => import(K.MOD('pindata.js'));
  const TRIES = 5;
  const key = (uid) => 'sp.unlocked.' + uid;
  const unlocked = (uid) => { try { return sessionStorage.getItem(key(uid)) === '1'; } catch (e) { return true; } };
  const markUnlocked = (uid) => { try { sessionStorage.setItem(key(uid), '1'); } catch (e) { /* stockage indisponible */ } };
  const lockedRoute = () => { const c = (location.hash || '').replace(/^#\/?/, ''); return c === 'compte' || /^admin(\/|$)/.test(c) || c === 'activer'; };
  const say = (m) => { try { toast(m); } catch (e) { /* pas de zone de messages */ } };
  let rec = null, recUid = '', tries = 0, busy = false;

  /* connexion par mot de passe (ou inscription) : pas de code PIN demandé dans cet onglet */
  K.pinUnlocked = (uid) => markUnlocked(uid);

  async function gate(ev) {
    const a = (ev && ev.status) ? ev : st.auth;
    if (a.status === 'in' && a.user && window.SP.pwLogin) { window.SP.pwLogin = false; markUnlocked(a.user.uid); }
    if (a.status !== 'in' || !a.user || !lockedRoute() || unlocked(a.user.uid) || busy) return;
    busy = true;
    try {
      if (recUid !== a.user.uid) { rec = await (await PD()).getPin(a.user.uid).catch(() => null); recUid = a.user.uid; tries = 0; }
      if (!rec || !rec.pinHash) { markUnlocked(a.user.uid); return; }   // pas de code PIN sur ce compte
      show();
    } finally { busy = false; }
  }

  function show() {
    if (document.getElementById('pinlock')) return;
    const a = st.auth, d = document.createElement('div');
    d.id = 'pinlock'; d.className = 'pinlock'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'pl-t');
    d.innerHTML = `<div class="panel pl-box"><h2 id="pl-t" class="lh">Code PIN</h2><p class="mt2">Compte ${esc(a.user.email || '')}. Saisissez votre code PIN Studio Prism, le même que dans ARCHIPLAN et ARCHITRAFIC.</p>
      <form id="pl-f" novalidate><div class="acc-f"><label for="pl-pin">Code PIN (6 chiffres)</label><input id="pl-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" pattern="[0-9]*"></div>
      <p class="fe" id="pl-err" role="alert"></p><p style="margin-top:12px"><button class="btn b1" type="submit">Déverrouiller</button></p></form>
      <p class="mt2"><button type="button" class="lk" id="pl-out">Code oublié ? Se reconnecter avec le mot de passe</button></p></div>`;
    document.body.appendChild(d);
    document.documentElement.classList.add('pl-open');
    setTimeout(() => { const i = document.getElementById('pl-pin'); if (i) i.focus(); }, 50);
    d.querySelector('#pl-out').onclick = signOutToLogin;
    d.querySelector('#pl-f').onsubmit = async (e) => {
      e.preventDefault();
      const i = document.getElementById('pl-pin'), err = document.getElementById('pl-err'), b = d.querySelector('button[type=submit]'), pin = i.value.trim();
      if (!/^\d{6}$/.test(pin)) { err.textContent = 'Le code PIN contient 6 chiffres.'; return; }
      b.disabled = true; err.textContent = '';
      let ok = false;
      try { ok = await (await PD()).checkPin(rec, pin); } catch (x) { ok = false; }
      b.disabled = false;
      if (ok) { markUnlocked(st.auth.user.uid); hide(); return; }
      tries++; i.value = '';
      if (tries >= TRIES) { await signOutToLogin('Trop de codes incorrects : pour votre sécurité, reconnectez-vous avec votre mot de passe.'); return; }
      err.textContent = `Code incorrect. ${TRIES - tries} essai${TRIES - tries > 1 ? 's' : ''} restant${TRIES - tries > 1 ? 's' : ''}.`;
    };
  }
  function hide() { const d = document.getElementById('pinlock'); if (d) d.remove(); document.documentElement.classList.remove('pl-open'); }
  async function signOutToLogin(msg) {
    hide();
    try { await (await K.loadAuth()).signOutUser(); } catch (e) { /* rien */ }
    location.hash = '#/compte/connexion';
    if (typeof msg === 'string') setTimeout(() => say(msg), 300);
  }
  K.pinGate = gate;
  window.addEventListener('hashchange', () => setTimeout(gate, 0));
  setInterval(() => { const ps = document.getElementById('pin-state'); if (ps && ps.textContent === '…' && st.auth.user && K.pinState) { ps.textContent = '… '; K.pinState(st.auth.user.uid, ps); }
    if (st.auth.status === 'in' && lockedRoute() && !unlocked(st.auth.user.uid)) gate(); else if (st.auth.status !== 'in') hide(); }, 1500);

  /* ------------------------------------------------------------------ choisir / modifier son code PIN (Mon compte › Sécurité) */
  if (typeof A === 'undefined' || typeof modal !== 'function') return;
  A['pin-set'] = () => {
    modal(`<h3>Mon code PIN</h3><p class="mt2">6 chiffres. Il ouvre aussi ARCHIPLAN et ARCHITRAFIC sur vos appareils, et confirme la suppression de votre compte.</p>
      <form id="ps-f" novalidate><div class="acc-f"><label for="ps-1">Nouveau code PIN</label><input id="ps-1" type="password" inputmode="numeric" autocomplete="off" maxlength="6" pattern="[0-9]*"></div>
      <div class="acc-f"><label for="ps-2">Confirmez le code PIN</label><input id="ps-2" type="password" inputmode="numeric" autocomplete="off" maxlength="6" pattern="[0-9]*"></div>
      <p class="fe" id="ps-err" role="alert"></p><p style="margin-top:12px"><button class="btn b1" type="submit">Enregistrer le code PIN</button></p></form>`);
    const f = document.getElementById('ps-f');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const p1 = document.getElementById('ps-1').value.trim(), p2 = document.getElementById('ps-2').value.trim(), err = document.getElementById('ps-err'), b = f.querySelector('button[type=submit]');
      if (!/^\d{6}$/.test(p1)) { err.textContent = 'Le code PIN contient 6 chiffres.'; return; }
      if (/^(\d)\1{5}$/.test(p1) || '0123456789'.includes(p1) || '9876543210'.includes(p1)) { err.textContent = 'Code trop simple : évitez les suites et les chiffres répétés.'; return; }
      if (p1 !== p2) { err.textContent = 'Les deux codes ne correspondent pas.'; return; }
      b.disabled = true; b.textContent = 'Enregistrement…';
      try {
        const uid = st.auth.user.uid; await (await PD()).setPin(uid, p1); recUid = ''; markUnlocked(uid);
        A.x();
        say('Code PIN enregistré : il est aussi valable dans ARCHIPLAN et ARCHITRAFIC.');
        const s = document.getElementById('pin-state'); if (s) s.textContent = 'Défini';
      } catch (x) { err.textContent = K.errMsg(x); b.disabled = false; b.textContent = 'Enregistrer le code PIN'; }
    };
  };
  K.pinState = async (uid, el) => { try { const r = await (await PD()).getPin(uid); if (el) el.textContent = r && r.pinHash ? 'Défini' : 'Non défini'; } catch (e) { if (el) el.textContent = '—'; } };
})();
