/* Studio Prism — interface des comptes (script classique, chargé après js/app.js dont il réutilise V, A, R, go, navTo…).
 *
 *  - pages : #/compte/connexion, #/compte/inscription (alias #/archivision/connexion|inscription, avec le contexte ArchiVision),
 *            #/admin, #/admin/catalogue, #/admin/abonnements (Administration Studio Prism : liste des utilisateurs ici,
 *            catalogue, offres, fiche utilisateur et licences dans js/platform.js) ;
 *  - #/compte (Mon compte) et #/abonnements (page publique des offres) : js/platform.js ;
 *  - header / footer / menu mobile : bascule « visiteur » ↔ « connecté » ;
 *  - toute la logique Firebase est dans js/auth.js et js/admin.js (modules ES chargés à la demande).
 *
 * Ce fichier n'est qu'une interface : les droits réels sont appliqués par Firebase Authentication et par les règles Firestore.
 */
(function () {
  'use strict';

  const BASE = document.currentScript ? document.currentScript.src : location.href;
  const MOD = (name) => new URL(name, BASE).href;

  /* ------------------------------------------------------------------ libellés & utilitaires */
  const L = {
    kind: { individual: 'Particulier', company: 'Entreprise' },
    sub: { free: 'Free', pro: 'Pro', pro_entreprise: 'Pro Entreprise' },
    role: { user: 'Utilisateur', admin: 'Administrateur' },
    status: { active: 'Actif', suspended: 'Désactivé' }   // « suspended » = valeur enregistrée dans Firestore (inchangée) ; « Désactivé » = libellé affiché
  };
  const TIERS = SUBSCRIPTION_CONFIG.plans.PRO_ENTREPRISE.tiers;
  const AUTH_ROUTES = new Set(['compte/connexion', 'compte/inscription', 'archivision/connexion', 'archivision/inscription']);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* Toute donnée venant de Firestore est du texte utilisateur : elle est TOUJOURS échappée avant d'entrer dans du HTML
     (sinon un compte nommé « <img onerror=…> » exécuterait du code dans la session de l'administrateur). */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ERR = {
    'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous ou réinitialisez votre mot de passe.',
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/weak-password': 'Mot de passe trop faible : choisissez-en un plus long et plus varié.',
    'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
    'auth/invalid-login-credentials': 'E-mail ou mot de passe incorrect.',
    'auth/wrong-password': 'E-mail ou mot de passe incorrect.',
    'auth/user-not-found': 'E-mail ou mot de passe incorrect.',
    'auth/too-many-requests': 'Trop de tentatives. Patientez quelques minutes ou réinitialisez votre mot de passe.',
    'auth/network-request-failed': 'Connexion impossible : vérifiez votre connexion internet puis réessayez.',
    'auth/user-disabled': 'Ce compte a été désactivé. Contactez Studio Prism.',
    'auth/operation-not-allowed': 'La connexion par e-mail et mot de passe n’est pas activée pour ce projet Firebase.',
    'app/suspended': 'Ce compte est désactivé. Contactez Studio Prism pour le réactiver.',
    'app/profile-missing': 'Votre profil Studio Prism est introuvable. Contactez Studio Prism.',
    'app/timeout': 'Le service met trop de temps à répondre. Réessayez.',
    'app/auth-timeout': 'Firebase Authentication ne répond pas (délai dépassé). Vérifiez votre connexion internet et les éventuels bloqueurs de contenus, puis réessayez.',
    'app/firestore-timeout': 'Authentification réussie, mais la lecture de votre profil (Firestore) ne répond pas : délai de 15 secondes dépassé. Vérifiez que la base Firestore est créée dans le projet Firebase et que le navigateur peut joindre firestore.googleapis.com (réseau, bloqueur de contenus).',
    'app/profile-invalid': 'Votre profil Studio Prism est incomplet (champ « status » absent ou invalide). Contactez Studio Prism.',
    'app/unavailable': 'Le service de comptes est momentanément indisponible. Rechargez la page ou réessayez plus tard.',
    'auth/requires-recent-login': 'Pour votre sécurité, reconnectez-vous puis réessayez.',
    'auth/no-current-user': 'Votre session a expiré. Reconnectez-vous puis réessayez.',
    'app/product-missing': 'Produit inexistant.',
    'app/license-missing': 'Licence inexistante.',
    'app/offer-missing': 'Abonnement inexistant.',
    'app/user-missing': 'Compte introuvable.',
    'app/product-exists': 'Un produit avec cet identifiant existe déjà.',
    'app/offer-exists': 'Une offre avec cet identifiant existe déjà.',
    'app/license-exists': 'Cet utilisateur a déjà une licence pour ce produit : modifiez-la plutôt.',
    'app/product-in-use': 'Suppression impossible : des licences ou des offres utilisent encore ce produit. Masquez-le plutôt, ou supprimez d’abord ses offres et ses licences.',
    'app/functions-sdk': 'Le composant de gestion des comptes (Firebase Functions) n’a pas pu être chargé. Vérifiez votre connexion internet et les éventuels bloqueurs de contenu, puis réessayez.',
    'app/functions-not-deployed': 'Le service de gestion des comptes n’est pas déployé sur ce projet Firebase : la fonction est introuvable (région europe-west1). Un administrateur technique doit déployer les Cloud Functions (voir FONCTIONS_SERVEUR.md).',
    'app/functions-unreachable': 'Le service de gestion des comptes ne répond pas : réseau, blocage du navigateur (CORS), droits d’appel de la fonction, ou fonction non déployée. Lancez le diagnostic ci-dessous pour en connaître la cause.',
    'app/functions-denied': 'Google a refusé l’appel avant qu’il atteigne le service (session expirée ou droits d’appel de la fonction). Reconnectez-vous ; si le problème persiste, lancez le diagnostic.',
    'app/functions-unavailable': 'Le service de gestion des comptes (fonctions serveur) est indisponible ou n’est pas encore déployé. Réessayez plus tard ou contactez Studio Prism.',
    'not-found': 'Élément introuvable : il a peut-être été supprimé.',
    'unavailable': 'Service momentanément indisponible. Vérifiez votre connexion puis réessayez.',
    'app/server-disabled': 'Cette opération nécessite un service serveur (Cloud Functions) qui n’est pas activé sur ce site : le site fonctionne avec le forfait gratuit Firebase Spark. Vous pouvez désactiver le compte à la place ; la suppression définitive se fait dans la console Firebase.',
    'app/self-delete-unavailable': 'Ce compte ne peut pas être supprimé depuis le site. Contactez Studio Prism.',
    'app/self-delete-partial': 'Vos données (profil et licences) ont été supprimées, mais la fermeture de votre compte de connexion a échoué. Reconnectez-vous puis relancez « Supprimer mon compte » pour terminer.',
    'app/last-admin': 'Ce compte est le dernier administrateur actif : il ne peut être ni désactivé ni rétrogradé. Désignez d’abord un autre administrateur.',
    'app/admin-count': 'Impossible de vérifier le nombre d’administrateurs actifs. Par sécurité, la modification n’a pas été faite : réessayez.',
    'permission-denied': 'Accès refusé par les règles de sécurité. Vérifiez vos droits (et, à l’installation, que les règles Firestore sont déployées).'
  };
  const errMsg = (e) => {
    const code = (e && e.code) || (typeof e === 'string' ? e : 'unknown');
    if (code === 'app/server' && e.message) return e.message; // message français renvoyé par nos Cloud Functions
    const msg = ERR[code] || `Une erreur est survenue. Réessayez. (${code})`;
    // Erreur survenue à l'étape « lecture du profil » (après une authentification réussie) : on le dit.
    return e && e.step === 'firestore' && code.indexOf('app/') !== 0 ? `Authentification réussie, mais la lecture de votre profil a échoué. ${msg}` : msg;
  };

  /* ------------------------------------------------------------------ état & chargement du module d'authentification */
  const st = { auth: { status: 'loading', user: null, profile: null, notice: null }, api: null, admin: null, loading: null };

  function loadAuth() {
    if (st.loading) return st.loading;
    st.loading = import(MOD('auth.js'))
      .then((api) => { st.api = api; api.subscribe(onAuth); return api; })
      .catch((err) => {
        console.error('[Studio Prism] Service de comptes indisponible :', err);
        st.loading = null;
        onAuth({ status: 'unavailable', user: null, profile: null, notice: 'app/unavailable' });
        throw Object.assign(new Error('unavailable'), { code: 'app/unavailable' });
      });
    return st.loading;
  }

  /* Le SDK n'est pas bloquant : chargé tout de suite sur les pages de compte, au repos sur les autres pages. */
  const guarded = (k) => k === 'compte' || /^admin(\/|$)/.test(k);
  const live = (k) => guarded(k) || /^abonnements(\/|$)/.test(k) || /^produits\/./.test(k); // pages qui dépendent de l'état de connexion (boutons des offres)
  if (AUTH_ROUTES.has(CUR) || live(CUR)) loadAuth().catch(() => {});
  else (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => loadAuth().catch(() => {}), { timeout: 3000 });

  /* Où envoyer l'utilisateur après connexion : l'administration pour un administrateur, « Mon compte » pour les autres. */
  function spHome(profile) {
    return profile.role === 'admin' ? '#/admin' : '#/compte';
  }

  function redirect(h) {
    const k = h.replace(/^#\/?/, '');
    if (k === CUR) return;
    try { history.replaceState(null, '', '#/' + k); } catch (e) { /* ignore */ }
    const prev = CUR;
    CUR = k;
    navTo({ from: prev });
  }

  function onAuth(a) {
    const prev = st.auth.status;
    st.auth = a;
    if (a.status === 'loading' && prev === 'loading') return;
    chrome();
    patchView();
    if (a.status === 'in' && AUTH_ROUTES.has(CUR)) return redirect(spHome(a.profile));
    if (guarded(CUR)) {
      if (prev === 'in' && a.status !== 'in' && a.status !== 'loading') return redirect('#/');
      return route();
    }
    if (live(CUR)) return route(); // page Abonnements : boutons selon connecté / licences
    if (AUTH_ROUTES.has(CUR) && a.notice && a.status !== 'in') formMsg(errMsg(a.notice), false);
  }

  /* header, menu mobile, footer : éléments marqués data-acc="in" (connecté) / data-acc="out" (visiteur). */
  function chrome() {
    const inn = st.auth.status === 'in';
    document.querySelectorAll('[data-acc="in"]').forEach((e) => { e.hidden = !inn; });
    document.querySelectorAll('[data-acc="out"]').forEach((e) => { e.hidden = inn; });
    const adm = inn && st.auth.profile.role === 'admin';
    document.querySelectorAll('[data-acc="admin"]').forEach((e) => { e.hidden = !adm; });
    document.body.dataset.auth = st.auth.status;
  }

  /* Page ArchiVision : les liens « Créer un compte · Se connecter » deviennent « Mon compte » une fois connecté. */
  function patchView() {
    const el = document.querySelector('#v .cz-a');
    if (!el || st.auth.status !== 'in') return;
    const n = st.auth.profile.firstName;
    el.innerHTML = `<span class="mut">Connecté avec votre compte Studio Prism${n ? ' · ' + esc(n) : ''}</span><span class="cz-d" aria-hidden="true">·</span><a class="cz-l" href="#/compte">Mon compte</a>`;
  }
  new MutationObserver(patchView).observe(document.getElementById('v'), { childList: true });

  window.SP = {
    get state() { return st.auth; },
    planLabel() { const p = st.auth.profile; return p ? (L.sub[p.subscription] || '—') : '—'; }
  };

  A.logout = async () => {
    try {
      const api = await loadAuth();
      await api.signOutUser();
    } catch (e) {
      toast('Déconnexion impossible. Réessayez.');
      return;
    }
    toast('Vous êtes déconnecté.');
  };

  /* ------------------------------------------------------------------ formulaires : aides communes */
  const field = (id, label, type, ac, o) => {
    o = o || {};
    return `<div class="acc-f"><label for="${id}">${label}${o.opt ? ' <span class="mut">(facultatif)</span>' : ''}</label>` +
      `<input id="${id}" name="${id}" type="${type || 'text'}" autocomplete="${ac || 'off'}" aria-describedby="${o.hint ? 'h-' + id + ' ' : ''}e-${id}" ${o.attrs || ''}>` +
      `${o.hint ? `<p class="acc-h" id="h-${id}">${o.hint}</p>` : ''}<p class="fe" id="e-${id}" role="alert"></p></div>`;
  };

  function clearErrors() {
    document.querySelectorAll('#v .fe').forEach((x) => { x.textContent = ''; });
    document.querySelectorAll('#v [aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
  }

  function showErrors(fm, er) {
    const ids = Object.keys(er);
    ids.forEach((k) => {
      const o = document.getElementById('e-' + k), i = document.getElementById(k);
      if (o) o.textContent = er[k];
      if (i) i.setAttribute('aria-invalid', 'true');
    });
    if (!ids.length) return false;
    const first = Array.from(fm.elements).find((el) => er[el.id]);
    if (first) first.focus();
    return true;
  }

  function formMsg(text, ok) {
    const el = document.getElementById('e-form');
    if (!el) return;
    el.textContent = text;
    el.className = 'fe' + (ok ? ' ok' : '');
    el.setAttribute('role', ok ? 'status' : 'alert');
  }

  function setBusy(fm, busy, label) {
    const btn = fm.querySelector('button.btn.b1:not([type=button])');
    if (!btn) return;
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.disabled = busy;
    btn.textContent = busy ? label : btn.dataset.label;
    fm.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function pwProblem(p) {
    if (p.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
    if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Utilisez au moins une lettre et un chiffre.';
    if (p.length > 200) return 'Mot de passe trop long (200 caractères maximum).';
    return '';
  }

  function normUrl(v) {
    if (!v) return '';
    const s = /^https?:\/\//i.test(v) ? v : 'https://' + v;
    try {
      const u = new URL(s);
      return u.hostname.indexOf('.') > 0 && u.href.length <= 200 ? u.href : null;
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------ pages de connexion / inscription */
  function authPage(up) {
    if (st.auth.status === 'in') { // déjà connecté : pas de formulaire, on renvoie vers l'espace
      V('<section class="pg au acc"><div class="w"><p class="lead" role="status">Vous êtes déjà connecté. Redirection…</p></div></section>');
      setTimeout(() => { if (AUTH_ROUTES.has(CUR) && st.auth.status === 'in') redirect(spHome(st.auth.profile)); }, 0);
      return;
    }
    const av = CUR.indexOf('archivision/') === 0;
    const other = (av ? '#/archivision/' : '#/compte/') + (up ? 'connexion' : 'inscription');
    const notice = st.auth.notice && st.auth.status !== 'in' && st.auth.status !== 'loading' ? errMsg(st.auth.notice) : '';
    const company = `<div id="co" class="acc-co" hidden><h2 class="lh">Votre entreprise</h2>` +
      field('coName', 'Nom de l’entreprise', 'text', 'organization', { attrs: 'maxlength="120"' }) +
      field('coEmail', 'E-mail de l’entreprise', 'email', 'off', { attrs: 'maxlength="160" inputmode="email"' }) +
      `<div class="row">${field('coJob', 'Votre fonction', 'text', 'organization-title', { opt: 1, attrs: 'maxlength="80"' })}${field('coPhone', 'Téléphone professionnel', 'tel', 'tel', { opt: 1, attrs: 'maxlength="30"' })}</div>` +
      field('coSite', 'Site internet', 'text', 'url', { opt: 1, attrs: 'maxlength="200" inputmode="url" placeholder="www.exemple.fr"' }) +
      `<div class="acc-f"><label for="coTier">Nombre de comptes nécessaires</label><select id="coTier" name="coTier" aria-describedby="h-coTier e-coTier"><option value="">Choisir…</option>${TIERS.map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}</select>` +
      `<p class="acc-h" id="h-coTier">Indicatif : il sert à préparer l’accès de votre équipe. Aucun abonnement n’est activé automatiquement.</p><p class="fe" id="e-coTier" role="alert"></p></div></div>`;

    const reg = `<fieldset class="acc-kind"><legend>Type de compte</legend>` +
      `<label class="acc-card on"><input type="radio" name="kind" value="individual" checked><span><b>Particulier</b><small>Usage personnel ou indépendant</small></span></label>` +
      `<label class="acc-card"><input type="radio" name="kind" value="company"><span><b>Entreprise</b><small>Société, équipe ou structure</small></span></label></fieldset>` +
      `<div class="row">${field('prenom', 'Prénom', 'text', 'given-name', { attrs: 'maxlength="80"' })}${field('nom', 'Nom', 'text', 'family-name', { attrs: 'maxlength="80"' })}</div>` +
      field('email', 'Adresse e-mail', 'email', 'email', { attrs: 'maxlength="160" inputmode="email"' }) +
      field('mdp', 'Mot de passe', 'password', 'new-password', { hint: '8 caractères minimum, avec au moins une lettre et un chiffre.' }) +
      field('mdp2', 'Confirmation du mot de passe', 'password', 'new-password') +
      company +
      `<label class="opt"><input type="checkbox" id="cgu" aria-describedby="e-cgu"><span>J’accepte les <a class="more" href="#/conditions-utilisation">conditions d’utilisation</a> et la <a class="more" href="#/confidentialite">politique de confidentialité</a>.</span></label><p class="fe" id="e-cgu" role="alert"></p>`;

    const log = field('email', 'Adresse e-mail', 'email', 'email', { attrs: 'maxlength="160" inputmode="email"' }) +
      field('mdp', 'Mot de passe', 'password', 'current-password') +
      `<div class="aur"><label class="opt"><input type="checkbox" id="rm" checked> Se souvenir de moi</label><button type="button" class="lk" data-a="forgot">Mot de passe oublié ?</button></div>`;

    V(`<section class="pg au acc"><div class="w aug">
<aside class="aup acc-side" aria-label="Compte Studio Prism">
<div class="acc-brand"><img src="${IMG.logo}" width="128" height="144" alt="Logo Studio Prism"><span><b>Studio Prism</b><small>Creative &amp; Technical Solutions</small></span></div>
<p class="aul">Applications · BIM / XR · Expériences interactives · Modélisation et impression 3D</p>
<ul class="uxl acc-pts"><li>Un seul compte pour les services Studio Prism</li><li>ArchiVision vous identifie avec ce compte</li><li>Pour les particuliers comme pour les entreprises</li></ul>
</aside>
<div class="auf acc-main"><p class="crumb">${av ? '<a href="#/projets/archivision">ArchiVision</a> / Compte Studio Prism' : '<a href="#/">Studio Prism</a> / Compte'}</p>
<h1>${up ? 'Créer votre compte Studio Prism' : 'Se connecter à Studio Prism'}</h1>
<p class="lead">${up ? 'Créez votre espace Studio Prism pour retrouver vos services, applications et projets au même endroit.' : 'Accédez à votre espace Studio Prism et retrouvez vos services et applications.'}</p>
${av ? '<p class="acc-note">ArchiVision est un service de Studio Prism : votre compte Studio Prism vous y identifie, sans compte séparé.</p>' : ''}
<form data-f="${up ? 'asu' : 'asi'}" novalidate>${up ? reg : log}
<button class="btn b1" style="margin-top:14px">${up ? 'Créer mon compte' : 'Se connecter'}</button>
<p class="fe" id="e-form" role="status" aria-live="polite">${esc(notice)}</p></form>
<p class="mt2">${up ? 'Vous avez déjà un compte Studio Prism ?' : 'Vous n’avez pas encore de compte ?'} <a class="more" href="${other}">${up ? 'Se connecter' : 'Créer un compte'}</a></p></div></div></section>`);
  }

  function kindChanged() {
    const sel = document.querySelector('input[name=kind]:checked');
    const co = !!sel && sel.value === 'company';
    const box = document.getElementById('co');
    if (box) box.hidden = !co;
    const lb = document.querySelector('label[for=email]');
    if (lb) lb.textContent = co ? 'E-mail professionnel' : 'Adresse e-mail';
    document.querySelectorAll('.acc-card').forEach((c) => c.classList.toggle('on', c.contains(sel)));
  }

  window.authSubmit = async function (fm, up) {
    const g = (id) => ((fm.elements[id] && fm.elements[id].value) || '').trim();
    clearErrors();
    const email = g('email').toLowerCase(), pw = fm.elements.mdp.value, er = {};
    if (!EMAIL_RE.test(email)) er.email = g('email') ? 'Adresse e-mail invalide.' : 'Renseignez votre adresse e-mail.';
    let isCo = false, tier = null, site = '';
    if (up) {
      isCo = fm.elements.kind.value === 'company';
      if (!g('prenom')) er.prenom = 'Renseignez votre prénom.';
      if (!g('nom')) er.nom = 'Renseignez votre nom.';
      const pb = pwProblem(pw);
      if (pb) er.mdp = pb;
      if (!fm.elements.mdp2.value) er.mdp2 = 'Confirmez votre mot de passe.';
      else if (fm.elements.mdp2.value !== pw) er.mdp2 = 'Les mots de passe ne correspondent pas.';
      if (isCo) {
        if (!g('coName')) er.coName = 'Renseignez le nom de l’entreprise.';
        if (!EMAIL_RE.test(g('coEmail'))) er.coEmail = g('coEmail') ? 'E-mail de l’entreprise invalide.' : 'Renseignez l’e-mail de l’entreprise.';
        tier = TIERS.find((t) => t.id === g('coTier'));
        if (!tier) er.coTier = 'Choisissez le nombre de comptes nécessaires.';
        site = normUrl(g('coSite'));
        if (site === null) er.coSite = 'Adresse de site internet invalide.';
        if (g('coPhone') && !/^[+(]?\d[\d\s().-]{4,28}$/.test(g('coPhone'))) er.coPhone = 'Numéro de téléphone invalide.';
      }
      if (!fm.elements.cgu.checked) er.cgu = 'Acceptez les conditions pour continuer.';
    } else if (!pw) {
      er.mdp = 'Saisissez votre mot de passe.';
    }
    if (showErrors(fm, er)) return;

    setBusy(fm, true, up ? 'Création du compte…' : 'Connexion…');
    formMsg('', false);
    try {
      const api = await loadAuth();
      if (up) {
        const payload = { firstName: g('prenom'), lastName: g('nom'), email, password: pw, accountKind: isCo ? 'company' : 'individual' };
        if (isCo) {
          payload.company = {
            name: g('coName'), email: g('coEmail').toLowerCase(), jobTitle: g('coJob'), phone: g('coPhone'),
            website: site, userRange: tier.id, userLimit: tier.limit
          };
        }
        await api.signUp(payload);
        toast('Compte créé. Bienvenue chez Studio Prism !');
      } else {
        await api.signIn({ email, password: pw, remember: fm.elements.rm.checked });
        toast('Connexion réussie.');
      }
    } catch (e) {
      formMsg(errMsg(e), false);
      if (!up) fm.querySelectorAll('[type=password]').forEach((x) => { x.value = ''; });
    } finally {
      setBusy(fm, false);
    }
  };

  A.forgot = async (btn) => {
    clearErrors();
    const input = document.getElementById('email'), em = (input && input.value || '').trim().toLowerCase();
    if (!EMAIL_RE.test(em)) {
      showErrors(input.form, { email: em ? 'Adresse e-mail invalide.' : 'Saisissez d’abord votre adresse e-mail, puis cliquez sur « Mot de passe oublié ? ».' });
      return;
    }
    btn.disabled = true;
    try {
      const api = await loadAuth();
      await api.resetPassword(em);
      formMsg(`Si un compte existe pour ${em}, un e-mail de réinitialisation vient d’être envoyé. Pensez à vérifier vos courriers indésirables.`, true);
    } catch (e) {
      formMsg(errMsg(e), false);
    } finally {
      btn.disabled = false;
    }
  };

  /* ------------------------------------------------------------------ administration */
  const AD = { users: [], cursor: null, hasMore: false, counts: null, error: '', busy: false, q: '', kind: '', sub: '', role: '', status: '', prod: '', licf: '', products: null, sellable: null, lic: {}, licError: false };
  const AD_FILTERS = { q: '', kind: '', sub: '', role: '', status: '', prod: '', licf: '' };
  const fdate = (ts, withTime) => {
    const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
    if (!d || isNaN(d)) return '—';
    return withTime ? d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : d.toLocaleDateString('fr-FR');
  };
  const badge = (cls, txt) => `<span class="bd ${cls}">${esc(txt)}</span>`;
  const SUBCLS = { free: 'bd-free', pro: 'bd-pro', pro_entreprise: 'bd-ent' };
  const fullName = (u) => [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';

  const ADMIN_TABS = [['users', 'Utilisateurs', '#/admin'], ['catalogue', 'Catalogue', '#/admin/catalogue'], ['offers', 'Offres et prix', '#/admin/abonnements'], ['pages', 'Pages', '#/admin/pages'], ['projects', 'Projets', '#/admin/projets'], ['media', 'Médiathèque', '#/admin/medias']];
  const adminShell = (inner, tab) => `<section class="pg adm"><div class="w"><p class="crumb"><a href="#/">Studio Prism</a> / Administration</p><div class="k">Comptes, produits, contenu du site et accès</div><h1>Administration Studio Prism</h1>` +
    `<div class="adm-tabs" role="navigation" aria-label="Sections de l’administration">${ADMIN_TABS.map(([id, t, h]) => `<a href="${h}"${id === tab ? ' class="on" aria-current="page"' : ''}>${t}</a>`).join('')}</div>${inner}</div></section>`;

  /* Garde commune aux pages d'administration : session en cours, déconnecté, service indisponible, accès refusé. */
  function adminGate(tab, render) {
    const a = st.auth, shell = (inner) => adminShell(inner, tab);
    if (a.status === 'loading') return V(shell('<p class="lead" role="status">Vérification de votre session…</p>'));
    if (a.status === 'out') {
      V(shell('<p class="lead" role="status">Redirection vers la page de connexion…</p>'));
      setTimeout(() => { if (guarded(CUR) && st.auth.status === 'out') redirect('#/compte/connexion'); }, 0);
      return;
    }
    if (a.status === 'unavailable' || a.status === 'error') {
      V(shell(`<p class="lead">${esc(errMsg(a.notice))}</p><p><button class="btn b1" data-a="acc-retry">Réessayer</button></p>`));
      return;
    }
    if (a.profile.role !== 'admin') {
      V(`<section class="pg adm"><div class="w"><p class="crumb"><a href="#/">Studio Prism</a> / Administration</p><h1>Accès refusé</h1><p class="lead">Cette section est réservée aux administrateurs Studio Prism.</p><p><a class="btn b1" href="#/compte">Mon compte</a></p></div></section>`);
      return;
    }
    render(a.profile, shell);
  }

  function adminPage() {
    adminGate('users', (p, shell) => usersTab(p, shell));
  }

  function usersTab(p, shell) {
    Object.assign(AD, { users: [], cursor: null, hasMore: false, counts: null, error: '', busy: false, lic: {}, licError: false, products: null, sellable: null }, AD_FILTERS);
    const sel = (id, label, opts) => `<div class="acc-f"><label for="${id}">${label}</label><select id="${id}">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>`;
    V(shell(`<p class="lead">Connecté en tant que ${esc(fullName(p))}. Les comptes ci-dessous proviennent de Firebase.</p>
<div class="adm-stats" id="adm-stats" aria-live="polite"></div>
<div class="panel adm-bar"><div class="acc-f adm-q"><label for="adm-q">Rechercher</label><input id="adm-q" type="search" placeholder="Nom, prénom, e-mail ou entreprise" autocomplete="off"></div>
${sel('adm-kind', 'Compte', [['', 'Tous'], ['individual', 'Particulier'], ['company', 'Entreprise']])}
${sel('adm-sub', 'Abonnement', [['', 'Tous'], ['free', 'Free'], ['pro', 'Pro'], ['pro_entreprise', 'Pro Entreprise']])}
${sel('adm-role', 'Rôle', [['', 'Tous'], ['user', 'Utilisateur'], ['admin', 'Administrateur']])}
${sel('adm-status', 'Statut', [['', 'Tous'], ['active', 'Actif'], ['suspended', 'Désactivé']])}
${sel('adm-prod', 'Application', [['', 'Toutes']])}
${sel('adm-licf', 'Licence', [['', 'Toutes'], ['with', 'Avec licence'], ['none', 'Sans licence'], ['free', 'Free'], ['pro', 'Pro'], ['pro_entreprise', 'Pro Entreprise']])}
<div class="acc-f adm-rs"><button type="button" class="btn b4" data-a="adm-reset">Réinitialiser</button></div></div>
<div class="adm-tools"><p class="mt2" id="adm-info" role="status" aria-live="polite"></p><button type="button" class="btn b4" data-a="adm-svc-open">Gestion des comptes : état du service</button> <button type="button" class="btn b1" data-a="adm-add-user">+ Ajouter un utilisateur</button></div><div id="adm-list"></div>
<p class="c"><button class="btn b4" id="adm-more" data-a="adm-more" hidden>Charger plus d’utilisateurs</button></p>`));
    renderStats();
    $('#adm-info').textContent = 'Chargement des utilisateurs…';
    loadAdmin(false);
  }

  async function loadAdmin(more) {
    if (AD.busy) return;
    AD.busy = true;
    try {
      if (!st.admin) st.admin = await import(MOD('admin.js'));
      const r = await st.admin.listUsers(more ? AD.cursor : null);
      AD.users = more ? AD.users.concat(r.users) : r.users;
      AD.cursor = r.cursor;
      AD.hasMore = r.hasMore;
      AD.error = '';
      await loadLicenses(r.users);
    } catch (e) {
      console.error('[Studio Prism] Liste des utilisateurs :', e);
      AD.error = errMsg(e);
    }
    AD.busy = false;
    renderAdmin();
    if (!more && !AD.error) refreshCounts();
  }

  async function dataMod() {
    if (!st.data) st.data = await import(MOD('data.js'));
    return st.data;
  }

  /* Produits + licences des utilisateurs chargés (requêtes ciblées). Une panne ici ne bloque pas la liste des utilisateurs. */
  async function loadLicenses(users) {
    try {
      const d = await dataMod();
      if (!AD.products) AD.products = await d.adminListProducts();
      // produits « commercialisables » = au moins une formule active (une panne ici ne bloque rien : on n'affiche alors que les licences existantes)
      if (!AD.sellable) { try { AD.sellable = new Set((await d.adminListOffers()).filter((o) => o.status === 'active').map((o) => o.productId)); } catch (e2) { console.warn('[Studio Prism] Formules indisponibles :', e2); } }
      users.forEach((u) => { AD.lic[u.uid] = []; });
      (await d.adminLicensesFor(users.map((u) => u.uid))).forEach((l) => { if (AD.lic[l.userId]) AD.lic[l.userId].push(l); });
      AD.licError = false;
      const sel = document.getElementById('adm-prod');
      if (sel && sel.options.length <= 1) AD.products.forEach((p) => sel.add(new Option(p.name, p.id)));
    } catch (e) {
      console.warn('[Studio Prism] Licences indisponibles :', e);
      AD.licError = true;
    }
  }

  async function refreshCounts() {
    try { AD.counts = await st.admin.countUsers(); } catch (e) { console.warn('[Studio Prism] Compteurs indisponibles :', e); AD.counts = null; }
    renderStats();
  }

  function renderStats() {
    const el = document.getElementById('adm-stats');
    if (!el) return;
    const c = AD.counts;
    el.innerHTML = [['Utilisateurs', 'total'], ['Free', 'free'], ['Pro', 'pro'], ['Pro Entreprise', 'proEntreprise'], ['Administrateurs', 'admins']]
      .map(([l, k]) => `<div class="adm-stat"><span class="adm-n">${c ? c[k] : '—'}</span><span class="adm-l">${l}</span></div>`).join('');
  }

  function licenseMatch(u) {
    if (!AD.prod && !AD.licf) return true;
    const all = AD.lic[u.uid];
    if (!all) return false; // licences non chargées : on ne peut pas filtrer
    const pool = AD.prod ? all.filter((l) => l.productId === AD.prod) : all;
    if (!AD.licf) return pool.length > 0;
    if (AD.licf === 'with') return pool.length > 0;
    if (AD.licf === 'none') return pool.length === 0;
    return pool.some((l) => l.licenseType === AD.licf);
  }

  function filtered() {
    const q = AD.q.trim().toLowerCase();
    return AD.users.filter((u) => (!AD.kind || u.accountKind === AD.kind) && (!AD.sub || u.subscription === AD.sub) &&
      (!AD.role || u.role === AD.role) && (!AD.status || u.status === AD.status) && licenseMatch(u) &&
      (!q || [u.firstName, u.lastName, u.firstName + ' ' + u.lastName, u.email, u.companyName].some((v) => String(v || '').toLowerCase().indexOf(q) >= 0)));
  }

  const typeLabel = (t) => L.sub[t] || String(t || '—').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const LIC_STATUS = { active: 'Active', suspended: 'Suspendue', expired: 'Expirée' };
  /* Une licence « active » dont la date d'expiration est passée est affichée comme expirée. */
  const licState = (l) => {
    const exp = l.expiresAt && typeof l.expiresAt.toDate === 'function' ? l.expiresAt.toDate() : null;
    return l.status === 'active' && exp && exp < new Date() ? 'expired' : l.status;
  };

  /* Colonne « Applications / Licences » : une ligne par produit publié qui a au moins une formule active (ou pour lequel l'utilisateur a une
     licence), « Aucun » s'il n'y a pas de licence. Les produits sans formule (concepts, créations…) n'encombrent pas la colonne. */
  function licCell(u) {
    const mine = AD.lic[u.uid];
    if (!mine) return `<span class="mut">${AD.licError ? '—' : 'Chargement…'}</span>`;
    const prods = (AD.products || []).filter((p) => p.status !== 'draft' && p.status !== 'hidden' && ((AD.sellable && AD.sellable.has(p.id)) || mine.some((l) => l.productId === p.id)));
    const lines = prods.map((p) => {
      const l = mine.find((x) => x.productId === p.id);
      const stt = l ? licState(l) : '';
      return `<div class="adm-lic"><b>${esc(p.name)}</b> — ${l ? `${esc(typeLabel(l.licenseType))}${stt !== 'active' ? ` <span class="bd bd-off">${esc(LIC_STATUS[stt] || stt)}</span>` : ''}` : '<span class="mut">Aucun</span>'}</div>`;
    });
    mine.filter((l) => !prods.some((p) => p.id === l.productId)).forEach((l) => {
      lines.push(`<div class="adm-lic"><b>${esc(l.productName)}</b> — ${esc(typeLabel(l.licenseType))}</div>`);
    });
    return lines.length ? lines.join('') : '<span class="mut">—</span>';
  }

  function rowHtml(u) {
    const co = u.accountKind === 'company';
    const tr = co ? TIERS.find((t) => t.id === u.companyUserRange) : null, tier = tr ? tr.short : '—';
    const cell = (label, html, cls) => `<td role="cell"${cls ? ` class="${cls}"` : ''} data-label="${label}"><div class="adm-v">${html}</div></td>`;
    return `<tr role="row">` +
      cell('Utilisateur', `<b>${esc(fullName(u))}</b><small class="adm-mail">${esc(u.email)}</small>`) +
      cell('Compte', `${badge('bd-kind', L.kind[u.accountKind] || '—')}${co ? `<small class="adm-co">${esc(u.companyName)}</small>` : ''}`) +
      cell('Abonnement', badge(SUBCLS[u.subscription] || '', L.sub[u.subscription] || u.subscription || '—')) +
      cell('Rôle', badge(u.role === 'admin' ? 'bd-admin' : 'bd-user', L.role[u.role] || u.role || '—')) +
      cell('Applications / Licences', licCell(u), 'adm-l') +
      cell('Comptes demandés', esc(tier), 'adm-d') +
      cell('Créé le', fdate(u.createdAt), 'adm-d') +
      cell('Dernière connexion', fdate(u.lastLogin, true), 'adm-d') +
      cell('Statut', badge(u.status === 'active' ? 'bd-ok' : 'bd-off', L.status[u.status] || u.status || '—')) +
      `<td role="cell" class="adm-act"><button class="btn b4" data-a="adm-fiche" data-uid="${esc(u.uid)}" aria-label="Ouvrir la fiche de ${esc(fullName(u))}">Fiche</button> <button class="btn b4" data-a="adm-edit" data-uid="${esc(u.uid)}" aria-label="Modifier le compte de ${esc(fullName(u))}">Modifier</button></td></tr>`;
  }

  function renderAdmin() {
    if (CUR !== 'admin') return;
    renderStats();
    renderList();
  }

  function renderList() {
    const list = document.getElementById('adm-list');
    if (!list) return;
    const info = document.getElementById('adm-info'), more = document.getElementById('adm-more');
    if (AD.error) {
      list.innerHTML = `<div class="panel"><p>${esc(AD.error)}</p><p style="margin-top:12px"><button class="btn b1" data-a="adm-retry">Réessayer</button></p></div>`;
      info.textContent = '';
      more.hidden = true;
      return;
    }
    const rows = filtered(), active = AD.q || AD.kind || AD.sub || AD.role || AD.status;
    info.textContent = `${rows.length} utilisateur${rows.length > 1 ? 's' : ''} affiché${rows.length > 1 ? 's' : ''}` +
      (AD.hasMore ? ` sur ${AD.users.length} chargés${active ? ' — la recherche et les filtres portent sur les utilisateurs chargés : utilisez « Charger plus » pour en inclure d’autres' : ''}.` : '.');
    list.innerHTML = rows.length
      ? `<div class="adm-tw"><table class="adm-t" role="table"><caption class="sr">Utilisateurs Studio Prism</caption><thead><tr role="row"><th scope="col" role="columnheader">Utilisateur</th><th scope="col" role="columnheader">Compte</th><th scope="col" role="columnheader">Abonnement</th><th scope="col" role="columnheader">Rôle</th><th scope="col" role="columnheader">Applications / Licences</th><th scope="col" role="columnheader">Comptes demandés</th><th scope="col" role="columnheader">Créé le</th><th scope="col" role="columnheader">Dernière connexion</th><th scope="col" role="columnheader">Statut</th><th scope="col" role="columnheader"><span class="sr">Actions</span></th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`
      : `<div class="panel"><p>${AD.users.length ? 'Aucun utilisateur ne correspond à cette recherche.' : 'Aucun utilisateur enregistré pour le moment.'}</p></div>`;
    more.hidden = !AD.hasMore;
    more.disabled = AD.busy;
  }

  A['adm-more'] = () => loadAdmin(true);
  A['adm-retry'] = () => { AD.error = ''; loadAdmin(false); };
  A['acc-retry'] = async () => { try { if (st.api) await st.api.refresh(); else { await loadAuth(); } } catch (e) { route(); } };
  A['adm-reset'] = () => {
    Object.assign(AD, AD_FILTERS);
    ['adm-q', 'adm-kind', 'adm-sub', 'adm-role', 'adm-status', 'adm-prod', 'adm-licf'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderList();
  };

  A['adm-edit'] = (btn) => {
    const u = AD.users.find((x) => x.uid === btn.dataset.uid);
    if (!u) return;
    const self = !!st.auth.user && u.uid === st.auth.user.uid;
    const opts = (map, cur) => Object.keys(map).map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${map[k]}</option>`).join('');
    modal(`<h3>Modifier le compte</h3><p class="mut">${esc(fullName(u))} · ${esc(u.email)}</p>
<form data-f="adm-edit" data-uid="${esc(u.uid)}" novalidate>
<label for="ed-sub">Abonnement</label><select id="ed-sub" name="ed-sub">${opts(L.sub, u.subscription)}</select>
<label for="ed-role">Rôle</label><select id="ed-role" name="ed-role" ${self ? 'disabled' : ''}>${opts(L.role, u.role)}</select>
<label for="ed-status">Statut</label><select id="ed-status" name="ed-status" ${self ? 'disabled' : ''}>${opts(L.status, u.status)}</select>
${self ? '<p class="acc-h">Vous ne pouvez pas modifier votre propre rôle ni votre propre statut.</p>' : '<p class="acc-h">Un administrateur peut consulter et modifier tous les comptes. <b>Désactivé</b> : l’utilisateur ne peut plus se connecter à Studio Prism ni accéder à ses licences ; ses données sont conservées et le compte peut être réactivé à tout moment. Ce n’est pas une suppression : son compte de connexion Firebase Authentication continue d’exister.</p>'}
<p class="fe" id="ed-err" role="alert"></p>
<p style="margin-top:14px"><button class="btn b1" type="submit">Enregistrer</button></p></form>`);
  };

  /* Refus AVANT l'écriture (les règles Firestore refusent de toute façon un changement de rôle ou de statut sur son propre compte).
     Le dernier administrateur actif ne peut être ni désactivé ni rétrogradé. Renvoie '' si le changement est permis, sinon le message. */
  async function guardAdminChange(u, patch) {
    if (!('status' in patch) && !('role' in patch)) return '';
    const self = !!st.auth.user && u.uid === st.auth.user.uid;
    const drops = u.role === 'admin' && u.status === 'active' && (patch.status === 'suspended' || patch.role === 'user');
    if (drops) {
      let n;
      try { n = await st.admin.countActiveAdmins(); } catch (e) { console.warn('[Studio Prism] Comptage des administrateurs :', e); return errMsg({ code: 'app/admin-count' }); }
      if (n < 2) return errMsg({ code: 'app/last-admin' });
    }
    if (self) return 'Vous ne pouvez pas modifier votre propre rôle ni votre propre statut.';
    return '';
  }

  async function saveEdit(fm) {
    const u = AD.users.find((x) => x.uid === fm.dataset.uid), err = fm.querySelector('#ed-err');
    if (!u) return;
    const next = { subscription: fm.elements['ed-sub'].value, role: fm.elements['ed-role'].value, status: fm.elements['ed-status'].value };
    const patch = {};
    Object.keys(next).forEach((k) => { if (next[k] !== u[k]) patch[k] = next[k]; });
    if (!Object.keys(patch).length) { A.x(); return; }
    const btn = fm.querySelector('button[type=submit]');
    btn.disabled = true;
    err.textContent = '';
    try {
      const why = await guardAdminChange(u, patch);
      if (why) { err.textContent = why; btn.disabled = false; return; }
      await st.admin.updateUser(u, patch);
      Object.assign(u, patch);
      A.x();
      renderAdmin();
      refreshCounts();
      toast('Compte mis à jour.');
    } catch (e) {
      console.error('[Studio Prism] Mise à jour refusée :', e);
      err.textContent = errMsg(e);
      btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------ outils partagés avec js/platform.js */
  window.SP.kit = {
    st, AD, L, TIERS, esc, errMsg, loadAuth, redirect, guarded, field, clearErrors, showErrors, formMsg, setBusy, pwProblem, normUrl,
    EMAIL_RE, fdate, badge, SUBCLS, fullName, typeLabel, licState, LIC_STATUS, adminGate, licCell,
    dataMod, guardAdminChange,
    serverOn: () => !!(st.data && st.data.ACCOUNT_SERVER === true),   // mode « avec Cloud Functions » ? (faux par défaut : forfait gratuit Spark)
    renderUsers: () => { if (CUR === 'admin') renderAdmin(); },
    refreshCounts, loadLicenses, MOD
  };

  /* ------------------------------------------------------------------ écouteurs & routes */
  document.addEventListener('submit', (e) => { if (e.target.dataset && e.target.dataset.f === 'adm-edit') saveEdit(e.target); });
  document.addEventListener('input', (e) => { if (e.target.id === 'adm-q') { AD.q = e.target.value; renderList(); } });
  document.addEventListener('change', (e) => {
    const k = { 'adm-kind': 'kind', 'adm-sub': 'sub', 'adm-role': 'role', 'adm-status': 'status', 'adm-prod': 'prod', 'adm-licf': 'licf' }[e.target.id];
    if (k) { AD[k] = e.target.value; renderList(); }
    if (e.target.name === 'kind' && e.target.closest('.acc-kind')) kindChanged();
  });

  Object.assign(R, {
    'compte/connexion': () => authPage(0),
    'compte/inscription': () => authPage(1),
    'archivision/connexion': () => authPage(0),
    'archivision/inscription': () => authPage(1),
    'admin': adminPage
  });
})();
