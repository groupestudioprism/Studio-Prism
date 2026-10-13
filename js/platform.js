/* Studio Prism — plateforme multi-produits (script classique, chargé après js/account.js dont il réutilise les outils : window.SP.kit).
 *
 *  - #/abonnements[/produit] : page publique des offres, présentées PAR PRODUIT, avec tableau comparatif ;
 *  - #/compte               : Mon compte (profil, abonnement, applications, licences, sécurité, suppression du compte) ;
 *  - #/admin (fiche utilisateur, licences, ajout / suppression d'utilisateur), #/admin/catalogue, #/admin/abonnements.
 *
 * Les données viennent de Firestore (js/data.js : produits, offres, licences). Ce fichier n'est qu'une INTERFACE : les droits
 * réels sont appliqués par les règles Firestore et par les Cloud Functions (functions/). Toute donnée Firestore est échappée
 * (esc) avant d'entrer dans du HTML ; les liens (logo, image, url) sont filtrés (https://, #/ ou assets/ uniquement).
 */
(function () {
  'use strict';
  const K = window.SP && window.SP.kit;
  if (!K) return; // js/account.js indisponible : la plateforme ne se charge pas
  const { st, AD, L, TIERS, esc, errMsg, field, clearErrors, showErrors, setBusy, pwProblem, fdate, badge, fullName, typeLabel, licState, LIC_STATUS } = K;
  const CATLG = window.SP.catalog;
  if (!CATLG) return; // js/catalog.js indisponible
  const { safeUrl, money, POLES, TYPES, STATUS, STAGES, MODES, PERIODS } = CATLG;

  /* ------------------------------------------------------------------ libellés & petits utilitaires */
  const BASE_TYPES = ['free', 'pro', 'pro_entreprise'];
  const D = () => K.dataMod();
  const id2 = (n) => String(n).padStart(2, '0');

  const toDate = (ts) => (ts && typeof ts.toDate === 'function' ? ts.toDate() : null);
  const dInput = (d) => (d ? `${d.getFullYear()}-${id2(d.getMonth() + 1)}-${id2(d.getDate())}` : '');
  const fromInput = (v, end) => (v ? new Date(v + (end ? 'T23:59:59' : 'T00:00:00')) : null);
  const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const ID_RE = /^[a-z0-9][a-z0-9_-]{1,59}$/;
  const TYPE_RE = /^[a-z][a-z0-9_]{1,39}$/;

  const logoImg = (p, cls) => { const u = CATLG.picUrl(p && p.logo); return u ? `<img class="${cls}" src="${esc(u)}" alt="" loading="lazy" width="48" height="48">` : `<span class="${cls} ph" aria-hidden="true">${esc(String((p && p.name) || '?').charAt(0).toUpperCase())}</span>`; };

  /* Fenêtre : remplace toute fenêtre déjà ouverte (pas de fenêtres empilées). wide = fenêtre large. */
  function pmodal(html, wide) {
    A.x();
    modal(html);
    const m = document.querySelector('.mod');
    if (m && wide) m.classList.add('mod-w');
    return m;
  }

  const lede = (t) => `<p class="lead">${t}</p>`;

  /* ------------------------------------------------------------------ données publiques (catalogue : js/catalog.js) */
  const resetCatalogue = () => CATLG.reset();

  const MY = { uid: '', lic: null, p: null };
  function loadMine(force) {
    const uid = st.auth.user && st.auth.user.uid;
    if (!uid) return Promise.resolve([]);
    if (MY.uid !== uid) { MY.uid = uid; MY.lic = null; MY.p = null; }
    if (MY.lic && !force) return Promise.resolve(MY.lic);
    if (MY.p) return MY.p;
    MY.p = D().then((d) => d.listMyLicenses(uid)).then((l) => { if (MY.uid === uid) MY.lic = l; return l; }).finally(() => { MY.p = null; });
    return MY.p;
  }

  /* ================================================================== PAGE PUBLIQUE « ABONNEMENTS » */

  /* Licences de l'utilisateur CONNECTÉ (jamais celles d'un compte précédent). */
  const myLic = () => (st.auth.user && MY.uid === st.auth.user.uid && MY.lic) || [];
  CATLG.hooks.myLic = myLic;
  CATLG.hooks.loadMine = () => loadMine().catch(() => { MY.lic = []; return []; });

  const abShell = (inner) => `<section class="pg ab"><div class="w"><p class="crumb"><a href="#/">Studio Prism</a> / Abonnements</p><div class="k">Produits Studio Prism</div><h1>Abonnements</h1>${inner}</div></section>`;

  /* Même bloc de formules que la page d'un produit (#/produits/<id>) : une seule présentation, un seul sélecteur mensuel / annuel. */
  function offersPage() {
    const slug = CUR.split('/')[1] || '';
    const key = CUR;
    const stillHere = () => CUR === key;
    const signed = st.auth.status === 'in';
    if (CATLG.state.done && (!signed || (MY.uid === st.auth.user.uid && MY.lic))) { renderOffers(slug); return; }
    V(abShell(lede('Chargement des offres…')));
    Promise.all([CATLG.load(), signed ? loadMine().catch(() => { MY.lic = []; return []; }) : null])
      .then(() => { if (stillHere()) renderOffers(slug); });
  }

  function renderOffers(slug) {
    const state = CATLG.state;
    // panne de lecture : message + « Réessayer » ; si seuls les prix sont illisibles (règles pas encore republiées) mais que des formules sont là, on les montre
    const err = state.fsError || (state.offersError && !CATLG.all().some((p) => p.plans && p.plans.length) ? state.offersError : null);
    if (err) {
      console.error('[Studio Prism] Offres :', err);
      V(abShell(`<div class="panel"><p>${esc(errMsg(err))}</p><p style="margin-top:12px"><button class="btn b1" data-a="ab-retry">Réessayer</button></p></div>`));
      return;
    }
    const sections = CATLG.all().filter((p) => p.plans && p.plans.length);
    if (!sections.length) {
      V(abShell(`${lede('Les offres Studio Prism sont en cours de préparation.')}<div class="panel"><p>Aucune offre n’est disponible pour le moment.</p><p style="margin-top:12px"><a class="btn b1" href="#/contact">Nous contacter</a> <a class="btn b4" href="#/produits">Voir les produits</a></p></div>`));
      return;
    }
    const jump = sections.length > 1 ? `<div class="chips ab-jump" role="navigation" aria-label="Produits">${sections.map((p) => `<a class="chip" href="#/abonnements/${esc(p.id)}">${esc(p.name)}</a>`).join('')}</div>` : '';
    V(abShell(`${lede('Un seul compte Studio Prism, des licences par produit. Choisissez l’offre adaptée à chaque application ou service. Tous les produits sont dans le <a class="more" href="#/produits">catalogue</a>.')}${jump}` +
      sections.map((p) => {
        const href = CATLG.productHref(p);
        return `<article class="ab-prod" id="ab-${esc(p.id)}"><div class="ab-ph">${logoImg(p, 'ab-logo')}<div><h2>${esc(p.name)}</h2>` +
          `<p class="mt2">${esc(p.tagline || TYPES[p.category] || '')}</p>${p.description ? `<p class="ab-pd">${esc(p.description)}</p>` : ''}</div>` +
          `<div class="ab-links"><a class="more ab-more" href="${esc(href)}">Découvrir ${esc(p.name)} →</a>${href !== '#/produits/' + p.id ? `<a class="more ab-more" href="#/produits/${esc(p.id)}">Fiche produit →</a>` : ''}</div></div>` +
          `${CATLG.commercial(p)}</article>`;
      }).join('')));
    const target = slug && document.getElementById('ab-' + slug);
    if (target) setTimeout(() => target.scrollIntoView({ behavior: 'auto', block: 'start' }), 0);
  }

  A['ab-retry'] = () => { resetCatalogue(); offersPage(); };

  /* ================================================================== MON COMPTE */

  const accShell = (inner) => `<section class="pg acc-page"><div class="w"><p class="crumb"><a href="#/">Studio Prism</a> / Mon compte</p><div class="k">Compte Studio Prism</div><h1>Mon compte</h1>${inner}</div></section>`;

  function accountPage() {
    const a = st.auth;
    if (a.status === 'loading') return V(accShell(lede('Vérification de votre session…')));
    if (a.status === 'out') {
      V(accShell(lede('Redirection vers la page de connexion…')));
      setTimeout(() => { if (CUR === 'compte' && st.auth.status === 'out') K.redirect('#/compte/connexion'); }, 0);
      return;
    }
    if (a.status === 'unavailable' || a.status === 'error') {
      V(accShell(`<div class="panel"><p>${esc(errMsg(a.notice))}</p><p style="margin-top:12px"><button class="btn b1" data-a="acc-retry">Réessayer</button></p></div>`));
      return;
    }
    const p = a.profile, co = p.accountKind === 'company', admin = p.role === 'admin';
    V(accShell(`${lede(`Bonjour ${esc(p.firstName || '')}. Retrouvez votre profil, vos applications et vos licences Studio Prism.`)}` +
      `${admin ? '<p><a class="btn b4" href="#/admin">Administration</a></p>' : ''}` +
      `<div class="acc-grid">` +
      `<section class="panel acc-sec" aria-labelledby="s-profil"><h2 id="s-profil" class="lh">Profil</h2>${spec([
        ['Prénom', esc(p.firstName || '—')], ['Nom', esc(p.lastName || '—')], ['E-mail', esc(p.email || '—')],
        ['Type de compte', esc(L.kind[p.accountKind] || '—')], ['Entreprise', esc((co && p.companyName) || '—')],
        ['Fonction', esc((co && p.jobTitle) || '—')], ['Compte créé le', esc(fdate(p.createdAt))], ['Dernière connexion', esc(fdate(p.lastLogin, true))]
      ])}</section>` +
      `<section class="panel acc-sec" aria-labelledby="s-abo"><h2 id="s-abo" class="lh">Mon abonnement</h2>${spec([
        ['Abonnement Studio Prism', badge(({ free: 'bd-free', pro: 'bd-pro', pro_entreprise: 'bd-ent' })[p.subscription] || '', L.sub[p.subscription] || '—')]
      ])}<p class="mt2" style="margin-top:10px">Votre abonnement est géré par Studio Prism : il ne peut pas être modifié depuis cette page.</p><div id="acc-sum" class="acc-sum" aria-live="polite"></div>` +
      `<p style="margin-top:14px"><a class="btn b4 ar" href="#/abonnements">Voir tous les abonnements</a></p></section></div>` +
      `<section class="acc-sec" aria-labelledby="s-apps"><h2 id="s-apps" class="lh">Mes applications</h2><div id="acc-apps" class="acc-apps" aria-live="polite"><p class="mut">Chargement de vos applications…</p></div></section>` +
      `<section class="acc-sec" aria-labelledby="s-lic"><h2 id="s-lic" class="lh">Mes licences</h2><div id="acc-lics" aria-live="polite"><p class="mut">Chargement de vos licences…</p></div></section>` +
      securityHtml(p)));
    const key = CUR;
    Promise.all([loadMine(true), CATLG.load()]).then(([lics]) => { if (CUR === key) fillAccount(lics); })
      .catch((e) => {
        console.error('[Studio Prism] Licences :', e);
        const msg = `<p>${esc(errMsg(e))}</p><p style="margin-top:10px"><button class="btn b4" data-a="acc-lic-retry">Réessayer</button></p>`;
        ['acc-apps', 'acc-lics'].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = msg; });
      });
  }

  A['acc-lic-retry'] = () => accountPage();

  function fillAccount(lics) {
    const prods = new Map(CATLG.all().map((p) => [p.id, p]));
    const sorted = lics.slice().sort((x, y) => String(x.productName).localeCompare(String(y.productName), 'fr'));
    const apps = document.getElementById('acc-apps'), tbl = document.getElementById('acc-lics'), sum = document.getElementById('acc-sum');
    if (!apps || !tbl) return;
    if (!sorted.length) {
      apps.innerHTML = '<div class="panel"><p>Aucune application n’est encore associée à votre compte.</p><p class="mut" style="margin-top:6px">Découvrez les offres Studio Prism : pour en activer une, contactez-nous.</p><p style="margin-top:12px"><a class="btn b1 ar" href="#/abonnements">Voir les abonnements</a></p></div>';
      tbl.innerHTML = '<p class="mut">Aucune licence.</p>';
      if (sum) sum.innerHTML = '';
      return;
    }
    apps.innerHTML = sorted.map((l) => {
      const p = prods.get(l.productId), s = licState(l), url = safeUrl(p && p.url), name = (p && p.name) || l.productName;
      const open = s === 'active' && url
        ? `<a class="btn b1 ar" href="${esc(url)}">Ouvrir ${esc(name)}</a>`
        : `<button class="btn b1" disabled aria-disabled="true">Ouvrir ${esc(name)}</button><p class="fe" style="display:block">${s !== 'active' ? `Licence ${esc((LIC_STATUS[s] || s).toLowerCase())} : contactez Studio Prism.` : 'Application momentanément indisponible.'}</p>`;
      return `<article class="app-card">${logoImg(p || { name }, 'app-logo')}<div class="app-b"><h3>${esc(name)}</h3><p class="mt2">${esc((p && (p.tagline || TYPES[p.category])) || 'Application')}</p>` +
        `<dl class="app-d"><div><dt>Licence</dt><dd>${esc(typeLabel(l.licenseType))}</dd></div><div><dt>Statut</dt><dd>${licBadge(l)}</dd></div>` +
        `<div><dt>Activée le</dt><dd>${esc(fdate(l.activatedAt))}</dd></div><div><dt>Expire le</dt><dd>${l.expiresAt ? esc(fdate(l.expiresAt)) : 'Sans date d’expiration'}</dd></div></dl>${open}</div></article>`;
    }).join('');
    tbl.innerHTML = `<div class="adm-tw"><table class="adm-t lic-t" role="table"><caption class="sr">Mes licences</caption><thead><tr role="row"><th scope="col" role="columnheader">Produit</th><th scope="col" role="columnheader">Licence</th><th scope="col" role="columnheader">Statut</th><th scope="col" role="columnheader">Activation</th><th scope="col" role="columnheader">Expiration</th></tr></thead><tbody>` +
      sorted.map((l) => `<tr role="row"><td role="cell" data-label="Produit"><div class="adm-v"><b>${esc((prods.get(l.productId) || {}).name || l.productName)}</b></div></td><td role="cell" data-label="Licence"><div class="adm-v">${esc(typeLabel(l.licenseType))}</div></td><td role="cell" data-label="Statut"><div class="adm-v">${licBadge(l)}</div></td><td role="cell" class="adm-d" data-label="Activation"><div class="adm-v">${esc(fdate(l.activatedAt))}</div></td><td role="cell" class="adm-d" data-label="Expiration"><div class="adm-v">${l.expiresAt ? esc(fdate(l.expiresAt)) : '—'}</div></td></tr>`).join('') + '</tbody></table></div>';
    if (sum) sum.innerHTML = `<ul class="acc-sumul">${sorted.map((l) => `<li><b>${esc((prods.get(l.productId) || {}).name || l.productName)}</b> — ${esc(typeLabel(l.licenseType))} ${licBadge(l)}</li>`).join('')}</ul>`;
  }

  const licBadge = (l) => { const s = licState(l); return badge(s === 'active' ? 'bd-ok' : 'bd-off', LIC_STATUS[s] || s); };

  /* ---- Sécurité : mot de passe, réinitialisation, déconnexion, suppression du compte */
  function securityHtml(p) {
    return `<section class="panel acc-sec acc-secu" aria-labelledby="s-sec"><h2 id="s-sec" class="lh">Sécurité</h2>` +
      `<div class="acc-grid acc-grid2"><div><h3 class="acc-h3">Changer mon mot de passe</h3>` +
      `<form data-f="acc-pw" novalidate>${field('pw0', 'Mot de passe actuel', 'password', 'current-password')}${field('pw1', 'Nouveau mot de passe', 'password', 'new-password', { hint: '8 caractères minimum, avec au moins une lettre et un chiffre.' })}${field('pw2', 'Confirmation du nouveau mot de passe', 'password', 'new-password')}` +
      `<button class="btn b1" style="margin-top:12px">Modifier mon mot de passe</button><p class="fe" id="pw-msg" role="status" aria-live="polite"></p></form></div>` +
      `<div><h3 class="acc-h3">Autres actions</h3><p class="mt2">Mot de passe oublié ou changé depuis un autre appareil : recevez un lien de réinitialisation sur ${esc(p.email)}.</p>` +
      `<p><button class="btn b4" data-a="acc-reset">Réinitialiser par e-mail</button><button class="btn b4" data-a="logout">Se déconnecter</button></p></div></div>` +
      `<div class="acc-dz"><h3 class="acc-h3">Supprimer mon compte</h3><p class="mt2">Supprime définitivement votre compte de connexion, votre profil et vos licences. Cette action est irréversible.</p>` +
      `<p><button class="btn btn-danger" data-a="acc-del">Supprimer mon compte</button></p></div></section>`;
  }

  A['acc-reset'] = async (btn) => {
    const em = st.auth.profile && st.auth.profile.email;
    if (!em) return;
    btn.disabled = true;
    try {
      await (await K.loadAuth()).resetPassword(em);
      toast('E-mail de réinitialisation envoyé. Pensez à vérifier vos courriers indésirables.');
    } catch (e) { toast(errMsg(e)); }
    btn.disabled = false;
  };

  async function submitPassword(fm) {
    clearErrors();
    const msg = document.getElementById('pw-msg'), cur = fm.elements.pw0.value, nxt = fm.elements.pw1.value, er = {};
    msg.textContent = ''; msg.className = 'fe';
    if (!cur) er.pw0 = 'Saisissez votre mot de passe actuel.';
    const pb = pwProblem(nxt);
    if (pb) er.pw1 = pb; else if (nxt === cur) er.pw1 = 'Le nouveau mot de passe doit être différent de l’actuel.';
    if (!fm.elements.pw2.value) er.pw2 = 'Confirmez le nouveau mot de passe.';
    else if (fm.elements.pw2.value !== nxt) er.pw2 = 'Les mots de passe ne correspondent pas.';
    if (showErrors(fm, er)) return;
    setBusy(fm, true, 'Modification…');
    try {
      await (await D()).changePassword(cur, nxt);
      fm.reset();
      msg.textContent = 'Votre mot de passe a été modifié.';
      msg.className = 'fe ok';
      toast('Mot de passe modifié.');
    } catch (e) {
      const code = e && e.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/invalid-login-credentials') showErrors(fm, { pw0: 'Mot de passe actuel incorrect.' });
      else if (code === 'auth/weak-password') showErrors(fm, { pw1: errMsg(e) });
      else { msg.textContent = errMsg(e); msg.className = 'fe'; }
    } finally { setBusy(fm, false); }
  }

  A['acc-del'] = async () => {
    const d = await D(), p = st.auth.profile || {};
    if (!d.ACCOUNT_SERVER && (p.role === 'admin' || p.accountKind === 'company')) {
      // Sans serveur, seuls les particuliers peuvent supprimer eux-mêmes leur compte (voir js/data.js, deleteMyAccount).
      pmodal(`<h3>Supprimer mon compte</h3><p>${p.role === 'admin' ? 'Un compte administrateur ne peut pas être supprimé depuis le site.' : 'Un compte Entreprise ne peut pas être supprimé depuis le site : son entreprise et ses comptes rattachés demandent un traitement par un administrateur.'}</p>` +
        `<p class="mut" style="margin:8px 0">Contactez Studio Prism pour demander la suppression de votre compte.</p>`);
      return;
    }
    pmodal(`<h3>Supprimer mon compte</h3><p><b>Supprimer définitivement votre compte Studio Prism ? Cette action est irréversible.</b></p>` +
      `<p class="mut" style="margin:8px 0">${d.ACCOUNT_SERVER ? 'Seront supprimés : votre compte de connexion, votre profil, vos licences et vos données personnelles. Votre entreprise n’est supprimée que si aucun autre utilisateur ne lui est rattaché.' : 'Seront supprimés : votre compte de connexion, votre profil et vos licences.'}</p>` +
      `<form data-f="acc-del" novalidate><label for="del-pw">Mot de passe (confirmation)</label><input id="del-pw" type="password" autocomplete="current-password">` +
      `<p class="fe" id="del-err" role="alert"></p><p style="margin-top:12px"><button class="btn btn-danger" type="submit">Supprimer définitivement</button></p></form>`);
    const i = document.getElementById('del-pw');
    if (i) i.focus();
  };

  async function submitDeleteAccount(fm) {
    const pw = fm.querySelector('#del-pw').value, err = fm.querySelector('#del-err'), btn = fm.querySelector('button[type=submit]');
    err.textContent = '';
    if (!pw) { err.textContent = 'Saisissez votre mot de passe pour confirmer.'; return; }
    btn.disabled = true;
    btn.textContent = 'Suppression…';
    try {
      await (await D()).deleteMyAccount(pw);
      try { await (await K.loadAuth()).signOutUser(); } catch (e) { /* le compte n'existe plus : la session locale sera purgée */ }
      MY.uid = ''; MY.lic = null;
      A.x();
      toast('Votre compte a été supprimé.');
      K.redirect('#/');
    } catch (e) {
      console.error('[Studio Prism] Suppression du compte :', e);
      const code = e && e.code;
      err.textContent = code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/invalid-login-credentials'
        ? 'Mot de passe incorrect.' : 'Suppression impossible. ' + errMsg(e);
      btn.disabled = false;
      btn.textContent = 'Supprimer définitivement';
    }
  }

  /* ================================================================== ADMINISTRATION : FICHE UTILISATEUR, LICENCES */

  /* Petits constructeurs de champs de formulaire (mêmes classes que les pages de compte). */
  const fld = (id, label, control, hint) => `<div class="acc-f"><label for="${id}">${label}</label>${control}${hint ? `<p class="acc-h" id="h-${id}">${hint}</p>` : ''}<p class="fe" id="e-${id}" role="alert"></p></div>`;
  const inp = (id, type, val, attrs) => `<input id="${id}" name="${id}" type="${type}" value="${esc(val == null ? '' : val)}" ${attrs || ''}>`;
  const sel = (id, opts, cur, attrs) => `<select id="${id}" name="${id}" ${attrs || ''}>${opts.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const txa = (id, val, rows, attrs) => `<textarea id="${id}" name="${id}" rows="${rows}" ${attrs || ''}>${esc(val || '')}</textarea>`;
  const chk = (id, label, on) => `<label class="opt"><input type="checkbox" id="${id}" name="${id}"${on ? ' checked' : ''}> ${label}</label>`;
  /* Bouton « Médiathèque » à côté d'un champ de lien : remplit le champ avec une référence media:{id} (js/cmsmedia.js). */
  const pickBtn = (target) => `<p style="margin-top:6px"><button type="button" class="btn b4" data-a="cms-pick-into" data-target="${target}">Choisir dans la médiathèque</button></p>`;

  const adminCache = { offers: null, prods: null };
  const findUser = (uid) => AD.users.find((u) => u.uid === uid);

  async function openFiche(uid) {
    const u = findUser(uid);
    if (!u) return;
    const self = !!st.auth.user && u.uid === st.auth.user.uid, co = u.accountKind === 'company';
    const m = pmodal(`<h3>Fiche utilisateur</h3><p class="mut">${esc(fullName(u))} · ${esc(u.email)}</p>${spec([
      ['Type de compte', esc(L.kind[u.accountKind] || '—')], ['Entreprise', esc((co && u.companyName) || '—')], ['Fonction', esc((co && u.jobTitle) || '—')],
      ['Abonnement Studio Prism', badge(K.SUBCLS[u.subscription] || '', L.sub[u.subscription] || u.subscription || '—')],
      ['Rôle', esc(L.role[u.role] || u.role || '—')], ['Statut', badge(u.status === 'active' ? 'bd-ok' : 'bd-off', L.status[u.status] || u.status || '—')],
      ['Compte créé le', esc(fdate(u.createdAt))], ['Dernière connexion', esc(fdate(u.lastLogin, true))]
    ])}${u.status === 'active' ? '' : '<p class="acc-h" role="note">Compte désactivé : l’utilisateur ne peut plus se connecter ni accéder à ses licences. Ses données sont conservées ; vous pouvez le réactiver à tout moment.</p>'}<div class="fiche-h"><h4>Applications / licences</h4><button class="btn b1" data-a="adm-lic-add" data-uid="${esc(uid)}">+ Ajouter une licence</button></div>` +
      `<div id="fiche-lics" aria-live="polite"><p class="mut">Chargement des licences…</p></div>` +
      `<div class="fiche-act"><button class="btn b4" data-a="adm-edit" data-uid="${esc(uid)}">Modifier le compte</button>` +
      `<button class="btn b4" data-a="adm-send-reset" data-uid="${esc(uid)}">Envoyer un e-mail de réinitialisation</button>` +
      (self ? '<p class="acc-h">Vous ne pouvez pas désactiver ni supprimer votre propre compte depuis l’administration.</p>'
        : (u.status === 'active'
            ? `<button class="btn b4" data-a="adm-deact" data-uid="${esc(uid)}">Désactiver le compte</button>`
            : `<button class="btn b1" data-a="adm-react" data-uid="${esc(uid)}">Réactiver le compte</button>`) +
          (K.serverOn()
            ? `<button class="btn btn-danger" data-a="adm-del-user" data-uid="${esc(uid)}">Supprimer le compte</button>`
            : `<span class="acc-h">Suppression définitive : indisponible sans serveur. <button type="button" class="lk" data-a="adm-spark-info">Pourquoi ?</button></span>`)) + `</div>`, true);
    try {
      const d = await D();
      if (!AD.products) AD.products = await d.adminListProducts();
      AD.lic[uid] = await d.adminLicensesFor([uid]);
      AD.licError = false;
      K.renderUsers();
    } catch (e) {
      console.error('[Studio Prism] Licences de l’utilisateur :', e);
      const box = m && m.querySelector('#fiche-lics');
      if (box) box.innerHTML = `<p class="fe" style="display:block">${esc(errMsg(e))}</p>`;
      return;
    }
    const box = m && m.querySelector('#fiche-lics');
    if (box && m.isConnected) box.innerHTML = ficheLicenses(uid);
  }

  function ficheLicenses(uid) {
    const list = AD.lic[uid] || [];
    if (!list.length) return '<p class="mut">Aucune licence pour cet utilisateur.</p>';
    return list.slice().sort((a, b) => String(a.productName).localeCompare(String(b.productName), 'fr')).map((l) => {
      const s = licState(l), p = (AD.products || []).find((x) => x.id === l.productId);
      return `<div class="lic-card"><div class="lic-top"><b>${esc((p && p.name) || l.productName)}</b> <span class="bd bd-kind">${esc(typeLabel(l.licenseType))}</span> ${licBadge(l)}</div>` +
        `<p class="mt2">Activée le ${esc(fdate(l.activatedAt))} · ${l.expiresAt ? 'expire le ' + esc(fdate(l.expiresAt)) : 'sans date d’expiration'}</p>` +
        `<div class="lic-act"><button class="btn b4" data-a="adm-lic-edit" data-uid="${esc(uid)}" data-pid="${esc(l.productId)}">Modifier</button>` +
        `${l.status === 'active' && s === 'active' ? `<button class="btn b4" data-a="adm-lic-status" data-uid="${esc(uid)}" data-pid="${esc(l.productId)}" data-v="suspended">Suspendre</button>` : ''}` +
        `${l.status === 'suspended' ? `<button class="btn b4" data-a="adm-lic-status" data-uid="${esc(uid)}" data-pid="${esc(l.productId)}" data-v="active">Réactiver</button>` : ''}` +
        `<button class="btn b4" data-a="adm-lic-del" data-uid="${esc(uid)}" data-pid="${esc(l.productId)}">Supprimer</button></div></div>`;
    }).join('');
  }

  A['adm-fiche'] = (btn) => openFiche(btn.dataset.uid);

  /* « Modifier le compte » (défini dans account.js) ouvre sa propre fenêtre : on ferme d'abord la fiche. */
  const baseEdit = A['adm-edit'];
  A['adm-edit'] = (btn) => { A.x(); baseEdit(btn); };

  A['adm-send-reset'] = async (btn) => {
    const u = findUser(btn.dataset.uid);
    if (!u) return;
    btn.disabled = true;
    try {
      await (await K.loadAuth()).resetPassword(u.email);
      toast('E-mail de réinitialisation envoyé à ' + u.email + '.');
    } catch (e) { toast(errMsg(e)); }
    btn.disabled = false;
  };

  /* ---- licences : ajout / modification / suspension / suppression */

  /* Types proposés : free / pro / pro_entreprise + ceux déclarés par les offres du produit (extensible depuis l'onglet Abonnements). */
  function typesFor(productId, current) {
    const set = new Set(BASE_TYPES);
    (adminCache.offers || []).filter((o) => o.productId === productId).forEach((o) => set.add(o.licenseType));
    if (current) set.add(current);
    return Array.from(set).map((t) => [t, typeLabel(t)]);
  }

  async function licenseForm(uid, pid) {
    const u = findUser(uid);
    if (!u) return;
    const edit = !!pid;
    pmodal('<h3>Licence</h3><p class="mut">Chargement…</p>');
    let prods, lic;
    try {
      const d = await D();
      [prods, adminCache.offers] = await Promise.all([d.adminListProducts(), d.adminListOffers()]);
      AD.products = prods;
      AD.lic[uid] = await d.adminLicensesFor([uid]);
      lic = edit ? AD.lic[uid].find((l) => l.productId === pid) : null;
      if (edit && !lic) throw Object.assign(new Error('x'), { code: 'app/license-missing' });
    } catch (e) {
      pmodal(`<h3>Licence</h3><p class="fe" style="display:block">${esc(errMsg(e))}</p>`);
      return;
    }
    const taken = new Set(AD.lic[uid].map((l) => l.productId));
    const sold = new Set((adminCache.offers || []).filter((o) => o.status === 'active').map((o) => o.productId));
    // produits qui ont une formule en premier (ordre du catalogue conservé sinon)
    const avail = (edit ? prods.filter((p) => p.id === pid) : prods.filter((p) => !taken.has(p.id))).sort((a, b) => (sold.has(b.id) ? 1 : 0) - (sold.has(a.id) ? 1 : 0));
    if (!avail.length) {
      pmodal(`<h3>Ajouter une licence</h3><p>${prods.length ? 'Ce compte a déjà une licence pour chaque produit du catalogue.' : 'Le catalogue est vide : ajoutez d’abord un produit (onglet Catalogue).'}</p>` +
        `<p style="margin-top:10px"><button class="btn b4" data-a="adm-fiche" data-uid="${esc(uid)}">Retour à la fiche</button></p>`);
      return;
    }
    const first = avail[0];
    pmodal(`<h3>${edit ? 'Modifier la licence' : 'Ajouter une licence'}</h3><p class="mut">${esc(fullName(u))} · ${esc(u.email)}</p>` +
      `<form data-f="adm-lic" data-uid="${esc(uid)}" data-mode="${edit ? 'edit' : 'new'}" novalidate>` +
      fld('lic-prod', 'Produit', sel('lic-prod', avail.map((p) => [p.id, p.name + (p.status === 'hidden' || p.status === 'draft' ? ' (brouillon)' : '')]), first.id, edit ? 'disabled' : '')) +
      fld('lic-type', 'Type de licence', sel('lic-type', typesFor(first.id, lic && lic.licenseType), lic ? lic.licenseType : (typesFor(first.id)[1] || typesFor(first.id)[0])[0])) +
      fld('lic-status', 'Statut', sel('lic-status', Object.keys(LIC_STATUS).map((k) => [k, LIC_STATUS[k]]), lic ? lic.status : 'active')) +
      `<div class="row">${fld('lic-start', 'Date d’activation', inp('lic-start', 'date', dInput(lic ? toDate(lic.activatedAt) : new Date())))}` +
      `${fld('lic-end', 'Date d’expiration <span class="mut">(facultatif)</span>', inp('lic-end', 'date', dInput(lic ? toDate(lic.expiresAt) : null)), 'Laissez vide pour une licence sans date d’expiration.')}</div>` +
      `<p class="fe" id="lic-err" role="alert"></p><p style="margin-top:14px"><button class="btn b1" type="submit">${edit ? 'Enregistrer' : 'Activer la licence'}</button> <button class="btn b4" type="button" data-a="adm-fiche" data-uid="${esc(uid)}">Retour à la fiche</button></p></form>`);
  }

  A['adm-lic-add'] = (btn) => licenseForm(btn.dataset.uid, '');
  A['adm-lic-edit'] = (btn) => licenseForm(btn.dataset.uid, btn.dataset.pid);

  async function submitLicense(fm) {
    clearErrors();
    const uid = fm.dataset.uid, edit = fm.dataset.mode === 'edit', err = fm.querySelector('#lic-err'), g = (n) => fm.elements[n].value;
    const pid = g('lic-prod'), prod = (AD.products || []).find((p) => p.id === pid), start = fromInput(g('lic-start')), end = fromInput(g('lic-end'), true), er = {};
    err.textContent = '';
    if (!prod) er['lic-prod'] = 'Produit inexistant.';
    if (!TYPE_RE.test(g('lic-type'))) er['lic-type'] = 'Choisissez un type de licence.';
    if (!start || isNaN(start)) er['lic-start'] = 'Renseignez la date d’activation.';
    if (end && isNaN(end)) er['lic-end'] = 'Date d’expiration invalide.';
    else if (end && start && end <= start) er['lic-end'] = 'La date d’expiration doit être postérieure à la date d’activation.';
    if (showErrors(fm, er)) return;
    const btn = fm.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await (await D()).saveLicense({ userId: uid, productId: pid, productName: prod.name, licenseType: g('lic-type'), status: g('lic-status'), activatedAt: start, expiresAt: end || null }, !edit);
      toast(edit ? 'Licence mise à jour.' : 'Licence activée.');
      await openFiche(uid);
    } catch (e) {
      console.error('[Studio Prism] Licence :', e);
      err.textContent = errMsg(e);
      btn.disabled = false;
    }
  }

  document.addEventListener('change', (e) => {
    if (e.target.id !== 'lic-prod') return;
    const t = document.getElementById('lic-type');
    if (t) t.innerHTML = typesFor(e.target.value).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  });

  A['adm-lic-status'] = async (btn) => {
    const { uid, pid, v } = btn.dataset;
    btn.disabled = true;
    try {
      await (await D()).setLicenseStatus((await D()).licenseId(uid, pid), v);
      toast(v === 'active' ? 'Licence réactivée.' : 'Licence suspendue.');
      await openFiche(uid);
    } catch (e) { toast(errMsg(e)); btn.disabled = false; }
  };

  A['adm-lic-del'] = (btn) => {
    const { uid, pid } = btn.dataset, l = (AD.lic[uid] || []).find((x) => x.productId === pid);
    if (!l) return;
    pmodal(`<h3>Supprimer la licence</h3><p><b>Supprimer la licence ${esc(typeLabel(l.licenseType))} de ${esc(l.productName)} ?</b></p><p class="mut" style="margin-top:6px">L’utilisateur n’aura plus accès à cette licence. Vous pourrez en ajouter une nouvelle plus tard.</p>` +
      `<p class="fe" id="lic-del-err" role="alert"></p><p style="margin-top:12px"><button class="btn btn-danger" data-a="adm-lic-del-ok" data-uid="${esc(uid)}" data-pid="${esc(pid)}">Supprimer la licence</button> <button class="btn b4" data-a="adm-fiche" data-uid="${esc(uid)}">Annuler</button></p>`);
  };

  A['adm-lic-del-ok'] = async (btn) => {
    const { uid, pid } = btn.dataset;
    btn.disabled = true;
    try {
      const d = await D();
      await d.deleteLicense(d.licenseId(uid, pid));
      toast('Licence supprimée.');
      await openFiche(uid);
    } catch (e) {
      const el = document.getElementById('lic-del-err');
      if (el) el.textContent = errMsg(e);
      btn.disabled = false;
    }
  };

  /* ---- ajouter un utilisateur (création côté serveur : l'utilisateur choisit lui-même son mot de passe) */

  /* Sans serveur : créer le compte d'un tiers exige l'Admin SDK. Procédure gratuite : l'utilisateur s'inscrit lui-même. */
  A['adm-copy-reg'] = async (btn) => {
    const el = document.getElementById('reg-url');
    try { await navigator.clipboard.writeText(el ? el.value : ''); toast('Adresse copiée.'); } catch (e) { if (el) { el.focus(); el.select(); } toast('Sélectionnez l’adresse puis copiez-la (Ctrl+C).'); }
    if (btn) btn.blur();
  };
  const regUrl = () => location.href.split('#')[0] + '#/compte/inscription';
  A['adm-add-user'] = () => {
    if (!K.serverOn()) {
      pmodal(`<h3>Ajouter un utilisateur</h3><p>Créer un compte à la place d’un utilisateur exige un accès privilégié (serveur), indisponible avec le forfait gratuit Firebase Spark. Le site n’en a pas besoin pour fonctionner.</p>` +
        `<p><b>Procédure gratuite :</b> envoyez à la personne l’adresse d’inscription ci-dessous. Une fois son compte créé, il apparaît dans cette liste (rechargez-la) et vous pouvez régler son abonnement, son rôle, son statut et ses licences.</p>` +
        `<p><input id="reg-url" readonly value="${esc(regUrl())}" aria-label="Adresse de la page d’inscription"></p><p><button type="button" class="btn b1" data-a="adm-copy-reg">Copier l’adresse</button></p>`);
      return;
    }
    pmodal(`<h3>Ajouter un utilisateur</h3><p class="mut">Le compte est créé côté serveur. Aucun mot de passe n’est défini ici : l’utilisateur reçoit un e-mail pour choisir le sien.</p>` +
      `<form data-f="adm-newuser" novalidate><div class="row">${fld('nu-first', 'Prénom', inp('nu-first', 'text', '', 'maxlength="80" autocomplete="off"'))}${fld('nu-last', 'Nom', inp('nu-last', 'text', '', 'maxlength="80" autocomplete="off"'))}</div>` +
      fld('nu-email', 'Adresse e-mail', inp('nu-email', 'email', '', 'maxlength="160" autocomplete="off" inputmode="email"')) +
      `<div class="row">${fld('nu-kind', 'Type de compte', sel('nu-kind', [['individual', 'Particulier'], ['company', 'Entreprise']], 'individual'))}` +
      `${fld('nu-sub', 'Abonnement Studio Prism', sel('nu-sub', Object.keys(L.sub).map((k) => [k, L.sub[k]]), 'free'))}</div>` +
      `<div id="nu-co" hidden>${fld('nu-coname', 'Nom de l’entreprise', inp('nu-coname', 'text', '', 'maxlength="120" autocomplete="off"'))}` +
      `<div class="row">${fld('nu-tier', 'Nombre de comptes', sel('nu-tier', [['', 'Choisir…']].concat(TIERS.map((t) => [t.id, t.label])), ''))}${fld('nu-job', 'Fonction <span class="mut">(facultatif)</span>', inp('nu-job', 'text', '', 'maxlength="80" autocomplete="off"'))}</div></div>` +
      `<p class="fe" id="nu-err" role="alert"></p><p style="margin-top:14px"><button class="btn b1" type="submit">Créer l’utilisateur</button></p></form>`, true);
  };

  document.addEventListener('change', (e) => {
    if (e.target.id !== 'nu-kind') return;
    const box = document.getElementById('nu-co');
    if (box) box.hidden = e.target.value !== 'company';
  });

  async function submitNewUser(fm) {
    clearErrors();
    const g = (n) => fm.elements[n].value.trim(), err = fm.querySelector('#nu-err'), er = {}, co = g('nu-kind') === 'company', em = g('nu-email').toLowerCase();
    err.textContent = '';
    if (!g('nu-first')) er['nu-first'] = 'Renseignez le prénom.';
    if (!K.EMAIL_RE.test(em)) er['nu-email'] = em ? 'Adresse e-mail invalide.' : 'Renseignez l’adresse e-mail.';
    if (co && !g('nu-coname')) er['nu-coname'] = 'Renseignez le nom de l’entreprise.';
    if (co && !g('nu-tier')) er['nu-tier'] = 'Choisissez le nombre de comptes.';
    if (showErrors(fm, er)) return;
    const btn = fm.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Création…';
    try {
      const d = await D();
      const payload = { firstName: g('nu-first'), lastName: g('nu-last'), email: em, accountKind: co ? 'company' : 'individual', subscription: g('nu-sub') };
      if (co) payload.company = { name: g('nu-coname'), userRange: g('nu-tier'), jobTitle: g('nu-job'), email: em };
      await d.createUserByAdmin(payload);
      let mailed = true;
      try { await (await K.loadAuth()).resetPassword(em); } catch (e2) { mailed = false; console.warn('[Studio Prism] E-mail d’initialisation non envoyé :', e2); }
      A.x();
      toast(mailed ? 'Utilisateur créé. Un e-mail lui a été envoyé pour choisir son mot de passe.' : 'Utilisateur créé, mais l’e-mail n’a pas pu être envoyé : utilisez « Envoyer un e-mail de réinitialisation » depuis sa fiche.');
      A['adm-retry']();
    } catch (e) {
      console.error('[Studio Prism] Création d’utilisateur :', e);
      err.textContent = errMsg(e);
      if (isFnFailure(e) && !document.getElementById('svc-diag')) err.insertAdjacentHTML('afterend', diagBlock());
      btn.disabled = false;
      btn.textContent = 'Créer l’utilisateur';
    }
  }

  /* ---- diagnostic du service de gestion des comptes (Cloud Functions) ---- */
  const FN_CODES = new Set(['app/functions-sdk', 'app/functions-not-deployed', 'app/functions-unreachable', 'app/functions-denied']);
  const isFnFailure = (e) => !!e && FN_CODES.has(e.code);
  const DIAG_BOX = '<div id="svc-diag" class="svc-diag" role="status" aria-live="polite"></div>';
  /* Bloc à placer sous un message d'erreur du service : bouton de diagnostic + zone de résultat. */
  const diagBlock = () => `<p style="margin-top:8px"><button type="button" class="btn b4" data-a="adm-svc-check">Lancer le diagnostic du service</button></p>${DIAG_BOX}`;

  function diagHtml(r) {
    const li = (ok, t) => `<li class="${ok ? 'svc-ok' : 'svc-ko'}"><span aria-hidden="true">${ok ? '✓' : '✕'}</span> ${t}</li>`;
    if (!r.reachable && !K.serverOn()) {
      // Mode sans serveur : l'absence de réponse est le résultat ATTENDU (les fonctions ne peuvent pas être déployées sans forfait Blaze).
      const kind = r.code === 'app/functions-not-deployed' ? 'non déployées (réponse « introuvable » de Google)'
        : r.code === 'app/functions-sdk' ? 'non vérifiables : le composant Firebase Functions n’a pas pu être chargé (connexion ou bloqueur de contenu)'
        : r.code === 'app/functions-denied' ? 'refusées par Google avant d’atteindre le service (session expirée ou droits d’appel)'
        : 'sans réponse (non déployées, ou réseau / navigateur)';
      return `<ul class="svc-l">${li(false, `Fonctions serveur : ${kind}.`)}</ul><p><b>Ce n’est pas une panne du site.</b> Avec le forfait gratuit Firebase Spark, les Cloud Functions ne peuvent pas être déployées, et Studio Prism n’en a pas besoin pour les opérations disponibles ci-dessus. Seules la suppression définitive du compte de connexion d’un autre utilisateur et la création d’un compte à sa place les nécessitent.</p>`;
    }
    if (r.reachable) {
      const c = r.checks;
      let h = `<ul class="svc-l">${li(true, `Le service répond (version ${esc(r.version || '?')}, région ${esc(r.region || '?')}, ${r.ms} ms).`)}`;
      if (!c) h += li(true, 'Connectez-vous avec un compte administrateur actif pour vérifier aussi les droits du service.');
      else {
        h += li(c.auth.ok, c.auth.ok ? 'Droits sur Firebase Authentication : suffisants.' : `Droits sur Firebase Authentication : INSUFFISANTS (${esc(c.auth.code)}). Le compte de service des fonctions doit avoir le rôle « Administrateur Firebase Authentication » (ou Éditeur) — voir FONCTIONS_SERVEUR.md, section « Droits ».`);
        h += li(c.firestore.ok, c.firestore.ok ? 'Droits sur Cloud Firestore : suffisants.' : `Droits sur Cloud Firestore : INSUFFISANTS (${esc(c.firestore.code)}). Voir FONCTIONS_SERVEUR.md, section « Droits ».`);
      }
      return h + '</ul>' + (r.ok === false ? '<p class="fe">Le service est déployé mais ne peut pas encore supprimer ou créer des comptes : corrigez les droits ci-dessus.</p>' : '<p class="mut">Le service est opérationnel. Si une suppression échoue malgré tout, le message qui s’affiche en donne la cause.</p>');
    }
    const why = {
      'app/functions-not-deployed': 'La fonction « accountsHealth » est introuvable : <b>les Cloud Functions ne sont pas déployées sur le projet Firebase</b> (ou le sont dans une autre région / un autre projet). Téléverser les fichiers sur GitHub ne déploie pas les fonctions : il faut exécuter <code>firebase deploy --only functions</code> (procédure pas à pas dans FONCTIONS_SERVEUR.md).',
      'app/functions-sdk': 'Le composant Firebase Functions n’a pas pu être chargé depuis gstatic.com : vérifiez la connexion internet et les bloqueurs de contenu.',
      'app/functions-denied': 'Google a refusé l’appel (session expirée ou droits d’appel). Reconnectez-vous puis relancez le diagnostic.',
      'app/functions-unreachable': 'Aucune réponse exploitable. Causes possibles : fonctions non déployées dans cette région, droit d’appel public retiré par une politique de l’organisation Google Cloud, blocage réseau ou extension du navigateur. Vérifiez dans la console Firebase (Fonctions) que « adminDeleteUser » et « accountsHealth » existent en europe-west1.'
    }[r.code] || 'Cause inconnue.';
    return `<ul class="svc-l">${li(false, `Le service ne répond pas (${esc(r.code)}).`)}</ul><p>${why}</p>`;
  }

  A['adm-svc-check'] = async (btn) => {
    const box = document.getElementById('svc-diag');
    if (!box) return;
    btn.disabled = true;
    box.innerHTML = '<p class="mut">Diagnostic en cours…</p>';
    try { box.innerHTML = diagHtml(await (await D()).checkAccountsService()); }
    catch (e) { box.innerHTML = '<p class="fe">Le diagnostic a échoué. Rechargez la page puis réessayez.</p>'; }
    btn.disabled = false;
  };
  const sparkPanel = () => {
    const li = (ok, t) => `<li class="${ok ? 'svc-ok' : 'svc-ko'}"><span aria-hidden="true">${ok ? '✓' : '✕'}</span> ${t}</li>`;
    return `<h3>Gestion des comptes : état du service</h3><p class="mut">Studio Prism fonctionne <b>sans serveur</b>, avec le forfait gratuit Firebase Spark : aucune Cloud Function n’est utilisée et aucune facturation n’est possible de ce fait.</p>` +
      `<h4 class="acc-h3">Disponible</h4><ul class="svc-l">${li(true, 'Connexion, inscription, réinitialisation du mot de passe par e-mail.')}${li(true, 'Consultation et modification des comptes (abonnement, rôle).')}` +
      `${li(true, '<b>Désactivation</b> et réactivation d’un compte : les données sont conservées. Un compte désactivé ne peut plus se connecter ni accéder à ses licences et à son entreprise.')}` +
      `${li(true, 'Licences, catalogue, offres, pages, projets et médiathèque.')}${li(true, 'Suppression de son propre compte par un particulier, depuis « Mon compte ».')}</ul>` +
      `<h4 class="acc-h3">Indisponible : accès privilégié (serveur) requis</h4><ul class="svc-l">${li(false, '<b>Suppression définitive</b> du compte de connexion d’un autre utilisateur.')}${li(false, 'Création d’un compte à la place d’un utilisateur (il s’inscrit lui-même).')}</ul>` +
      `<p class="mut"><b>Désactiver n’est pas supprimer</b> : le compte de connexion Firebase Authentication continue d’exister. Pour le supprimer vraiment, utilisez la console Firebase › Authentication (gratuit, manuel).</p>` +
      `<p><button type="button" class="btn b4" data-a="adm-svc-check">Vérifier si les fonctions serveur sont déployées (facultatif)</button></p>${DIAG_BOX}`;
  };
  A['adm-spark-info'] = () => {
    pmodal(`<h3>Suppression définitive : indisponible sans serveur</h3><p>Supprimer le <b>compte de connexion</b> d’un autre utilisateur exige un accès privilégié (Firebase Admin SDK) que seul un serveur peut avoir : les Cloud Functions, qui demandent le forfait payant Blaze. Elles ne sont pas déployées et ce site n’en dépend pas.</p>` +
      `<p><b>Ce que vous pouvez faire gratuitement :</b></p><ul class="acc-ul"><li><b>Désactiver le compte</b> depuis sa fiche : l’utilisateur ne peut plus se connecter à Studio Prism ni accéder à ses licences ; ses données sont conservées et vous pouvez le réactiver.</li>` +
      `<li>Pour supprimer aussi le compte de connexion : console Firebase › Authentication › Utilisateurs › menu ⋮ › « Supprimer le compte ». Le profil se supprime ensuite dans Firestore (collection <code>users</code>) ; ses licences, depuis sa fiche.</li>` +
      `<li>Un particulier peut supprimer lui-même son compte depuis « Mon compte ».</li></ul>` +
      `<p class="mut">Désactiver n’est pas supprimer : le compte de connexion Firebase Authentication continue d’exister.</p>` +
      `<p><button type="button" class="btn b4" data-a="adm-svc-open">Voir l’état de la gestion des comptes</button></p>`);
  };
  A['adm-svc-open'] = () => {
    if (!K.serverOn()) { pmodal(sparkPanel(), true); return; }
    pmodal(`<h3>Service de gestion des comptes</h3><p class="mut">Les Cloud Functions (Google) créent et suppriment réellement les comptes : le navigateur ne peut pas le faire. Ce diagnostic vérifie qu’elles sont déployées et qu’elles ont les droits nécessaires.</p>` +
      `<p><button type="button" class="btn b1" data-a="adm-svc-check">Lancer le diagnostic</button></p>${DIAG_BOX}`);
  };

  /* ---- supprimer un utilisateur (Authentication + profil + licences : Cloud Function, Admin SDK côté serveur) */

  const summary = (r) => {
    const bits = [];
    if (r.authDeleted) bits.push('compte de connexion');
    if (r.profileDeleted) bits.push('profil');
    if (r.licensesDeleted) bits.push(r.licensesDeleted + (r.licensesDeleted > 1 ? ' licences' : ' licence'));
    if (r.companyDeleted) bits.push('entreprise (plus aucun membre)');
    return (bits.length ? 'Supprimé : ' + bits.join(', ') + '. ' : '') + (r.companyOwnerTransferred ? 'L’entreprise est conservée (d’autres comptes y sont rattachés) ; sa responsabilité a été transférée. ' : '');
  };

  A['adm-del-user'] = (btn) => {
    if (!K.serverOn()) { A['adm-spark-info'](); return; }   // sans serveur : jamais d'appel de fonction, explication à la place
    const u = findUser(btn.dataset.uid);
    if (!u) return;
    if (st.auth.user && u.uid === st.auth.user.uid) { toast('Vous ne pouvez pas supprimer votre propre compte depuis l’administration.'); return; }
    const isAdm = u.role === 'admin';
    pmodal(`<h3>Supprimer le compte</h3><p><b>Supprimer définitivement le compte de ${esc(fullName(u))} (${esc(u.email)}) ?</b></p>` +
      `<p class="mut" style="margin:8px 0">Son compte de connexion, son profil et ses licences seront supprimés. Son entreprise n’est supprimée que si plus aucun autre compte n’y est rattaché. Cette action est irréversible.</p>` +
      (isAdm ? `<p class="fe" style="margin:8px 0" role="note">⚠ Ce compte est <b>administrateur</b>. Pour confirmer, tapez SUPPRIMER :</p><p><input id="du-conf" autocomplete="off" aria-label="Tapez SUPPRIMER pour confirmer" placeholder="SUPPRIMER" maxlength="20"></p>` : '') +
      `<p class="fe" id="du-err" role="alert"></p><div id="du-help"></div><p style="margin-top:12px"><button class="btn btn-danger" data-a="adm-del-ok" data-uid="${esc(u.uid)}">Supprimer définitivement</button> <button class="btn b4" data-a="adm-fiche" data-uid="${esc(u.uid)}">Annuler</button></p>`);
  };

  A['adm-del-ok'] = async (btn) => {
    const uid = btn.dataset.uid, u = findUser(uid), err = document.getElementById('du-err'), help = document.getElementById('du-help');
    if (!u) return;
    if (u.role === 'admin') {
      const c = document.getElementById('du-conf');
      if (!c || c.value.trim() !== 'SUPPRIMER') { err.textContent = 'Tapez SUPPRIMER pour confirmer la suppression d’un administrateur.'; if (c) c.focus(); return; }
    }
    err.textContent = '';
    if (help) help.innerHTML = '';
    btn.disabled = true;
    btn.textContent = 'Suppression…';
    try {
      const r = await (await D()).deleteUserByAdmin(uid, u.email);
      if (!r || r.ok !== true) throw Object.assign(new Error('app/functions-unreachable'), { code: 'app/functions-unreachable' });   // jamais de succès sans confirmation explicite du serveur
      AD.users = AD.users.filter((x) => x.uid !== uid);
      delete AD.lic[uid];
      A.x();
      K.renderUsers();
      K.refreshCounts();
      toast('Compte supprimé' + (u ? ' : ' + u.email : '') + '. ' + summary(r));
    } catch (e) {
      console.error('[Studio Prism] Suppression d’un utilisateur :', e);
      err.textContent = 'Suppression impossible. ' + errMsg(e);
      if (isFnFailure(e) && help) {
        help.innerHTML = diagBlock() + `<p class="mut" style="margin-top:8px">En attendant, vous pouvez <button type="button" class="lk" data-a="adm-suspend-instead" data-uid="${esc(uid)}">désactiver ce compte</button> : il ne pourra plus accéder à son espace (le compte de connexion n’est pas supprimé).</p>`;
      }
      btn.disabled = false;
      btn.textContent = e && e.reason === 'partial' ? 'Relancer la suppression' : 'Supprimer définitivement';
    }
  };

  /* ---- désactiver / réactiver un compte : seul users/{uid}.status change (valeur « suspended »). Aucune Cloud Function, aucune suppression :
     profil, licences et entreprise sont conservés. L'application côté serveur Google est faite par les règles Firestore (compte désactivé :
     plus de lecture des licences ni de l'entreprise, aucune écriture, plus de droits d'administration). */
  const DEACT_NOTE = () => K.serverOn()
    ? '<p class="fe" style="margin:8px 0" role="note">Ce n’est pas une suppression : le compte de connexion n’est pas supprimé.</p>'
    : '<p class="fe" style="margin:8px 0" role="note">Ce n’est pas une suppression : son compte de connexion Firebase Authentication n’est pas supprimé. La suppression définitive d’un compte nécessite un accès serveur (Cloud Functions, forfait payant Blaze) ou la console Firebase.</p>';

  A['adm-deact'] = (btn) => {
    const u = findUser(btn.dataset.uid);
    if (!u) return;
    if (st.auth.user && u.uid === st.auth.user.uid) { toast('Vous ne pouvez pas désactiver votre propre compte.'); return; }
    pmodal(`<h3>Désactiver le compte</h3><p><b>Désactiver le compte de ${esc(fullName(u))} (${esc(u.email)}) ?</b></p>` +
      `<p class="mut" style="margin:8px 0">Cette personne ne pourra plus se connecter à Studio Prism ni accéder à ses licences et à son entreprise. Ses données (profil, licences, entreprise) sont conservées et vous pourrez réactiver le compte à tout moment depuis sa fiche.</p>` +
      DEACT_NOTE() +
      (u.role === 'admin' ? '<p class="fe" style="margin:8px 0" role="note">⚠ Ce compte est <b>administrateur</b> : il perdra tous ses droits d’administration.</p>' : '') +
      `<p class="fe" id="dc-err" role="alert"></p><p style="margin-top:12px"><button class="btn btn-danger" data-a="adm-deact-ok" data-uid="${esc(u.uid)}">Désactiver le compte</button> <button class="btn b4" data-a="adm-fiche" data-uid="${esc(u.uid)}">Annuler</button></p>`);
  };
  A['adm-react'] = (btn) => {
    const u = findUser(btn.dataset.uid);
    if (!u) return;
    pmodal(`<h3>Réactiver le compte</h3><p><b>Réactiver le compte de ${esc(fullName(u))} (${esc(u.email)}) ?</b></p>` +
      `<p class="mut" style="margin:8px 0">La personne pourra de nouveau se connecter et retrouvera ses licences et son entreprise.${u.role === 'admin' ? ' Ce compte est <b>administrateur</b> : il retrouvera ses droits d’administration.' : ''}</p>` +
      `<p class="fe" id="dc-err" role="alert"></p><p style="margin-top:12px"><button class="btn b1" data-a="adm-react-ok" data-uid="${esc(u.uid)}">Réactiver le compte</button> <button class="btn b4" data-a="adm-fiche" data-uid="${esc(u.uid)}">Annuler</button></p>`);
  };
  async function setAccountStatus(btn, status) {
    const u = findUser(btn.dataset.uid), err = document.getElementById('dc-err');
    if (!u) return;
    if (err) err.textContent = '';
    btn.disabled = true;
    try {
      const why = await K.guardAdminChange(u, { status });   // dernier administrateur actif, soi-même
      if (why) { if (err) err.textContent = why; btn.disabled = false; return; }
      await st.admin.updateUser(u, { status });
      u.status = status;
      A.x();
      K.renderUsers();
      K.refreshCounts();
      toast(status === 'suspended' ? 'Compte désactivé : ' + u.email + '. Ses données sont conservées ; ce n’est pas une suppression.' : 'Compte réactivé : ' + u.email + '.');
    } catch (e) {
      console.error('[Studio Prism] Changement de statut :', e);
      if (err) err.textContent = (status === 'suspended' ? 'Désactivation impossible. ' : 'Réactivation impossible. ') + errMsg(e);
      btn.disabled = false;
    }
  }
  A['adm-deact-ok'] = (btn) => setAccountStatus(btn, 'suspended');
  A['adm-react-ok'] = (btn) => setAccountStatus(btn, 'active');

  /* Solution d'attente quand les fonctions serveur sont indisponibles : suspendre (modifie seulement users/{uid}.status, règles inchangées). */
  A['adm-suspend-instead'] = async (btn) => {
    const u = findUser(btn.dataset.uid), err = document.getElementById('du-err');
    if (!u) return;
    btn.disabled = true;
    try {
      await st.admin.updateUser(u, { status: 'suspended' });
      u.status = 'suspended';
      A.x();
      K.renderUsers();
      K.refreshCounts();
      toast('Compte désactivé : ' + u.email + '. Il n’a pas été supprimé.');
    } catch (e) {
      if (err) err.textContent = 'Désactivation impossible. ' + errMsg(e);
      btn.disabled = false;
    }
  };

  /* ================================================================== ADMINISTRATION : CATALOGUE (PRODUITS) */

  /* Un produit est enregistré UNE fois ; publié, il apparaît seul dans « Produits », sur la page de son pôle et (mis en avant) dans
     « Réalisations ». Aucune formule, aucun prix, aucun abonnement n'est nécessaire pour créer ou publier un produit. */
  const CT = { prods: null, plans: null, built: true, pole: '', status: '', error: '' };
  const STATUS_CLS = { published: 'bd-ok', draft: 'bd-off', unavailable: 'bd-warn', archived: 'bd-off' };
  const STATUS_FILTERS = [['', 'Tous les statuts'], ['published', 'Publiés'], ['draft', 'Brouillons'], ['unavailable', 'Indisponibles'], ['archived', 'Archivés']];
  const nProducts = () => CATLG.BUILTIN.length;

  function catalogueTab(p, shell) {
    CT.prods = null; CT.error = '';
    V(shell(`${lede('Catalogue central des produits. Un produit publié apparaît automatiquement dans « Produits », sur la page de son pôle (Prism App, Prism Game, Prism 3D) et, s’il est mis en avant, dans « Réalisations ». Aucune offre n’est obligatoire.')}` +
      `<div id="cat-ban" aria-live="polite"></div>` +
      `<div class="adm-tools"><div id="cat-fil"></div><button type="button" class="btn b1" data-a="cat-add">+ Ajouter un produit</button></div><div id="cat-list" aria-live="polite"><p class="mut">Chargement du catalogue…</p></div>`));
    loadCatalogueAdmin();
  }

  async function loadCatalogueAdmin() {
    try {
      const d = await D();
      const [prods, offers, prices, settings] = await Promise.all([d.adminListProducts(), d.adminListOffers(), d.adminListPrices(), d.getCatalogueSettings()]);
      CT.prods = prods.map((x) => Object.assign(CATLG.normProduct(x), { source: 'firestore' }));
      CT.plans = CATLG.buildPlans(offers, prices);
      CT.built = settings.builtinImported;
      CT.error = '';
    } catch (e) {
      console.error('[Studio Prism] Catalogue :', e);
      CT.error = errMsg(e);
    }
    renderCatalogue();
  }

  /* Lignes affichées : produits Firestore + (tant que le catalogue du site n'est pas importé) les produits intégrés pas encore en base. */
  function catalogueRows() {
    const have = new Set(CT.prods.map((x) => x.id));
    const site = CT.built ? [] : CATLG.BUILTIN.filter((b) => !have.has(b.id)).map((b) => Object.assign(CATLG.normProduct(b), { source: 'site' }));
    return CT.prods.concat(site).sort(CATLG.byPole);
  }

  function renderCatalogue() {
    const box = document.getElementById('cat-list'), ban = document.getElementById('cat-ban'), fil = document.getElementById('cat-fil');
    if (!box) return;
    if (CT.error) {
      if (ban) ban.innerHTML = ''; if (fil) fil.innerHTML = '';
      box.innerHTML = `<div class="panel"><p>${esc(CT.error)}</p><p style="margin-top:12px"><button class="btn b1" data-a="cat-retry">Réessayer</button></p></div>`;
      return;
    }
    const all = catalogueRows();
    if (ban) {
      const missing = CATLG.BUILTIN.filter((b) => !CT.prods.some((x) => x.id === b.id)).length;
      ban.innerHTML = CT.built ? '' : `<div class="panel cat-ban"><h3>Catalogue intégré au site</h3><p class="mut" style="margin:6px 0 12px">Les ${nProducts()} produits de départ (ArchiVision, concepts Prism Game, créations Prism 3D) sont affichés depuis le site${missing < nProducts() ? ` (${missing} pas encore dans Firestore)` : ''}. Importez-les dans Firestore pour pouvoir les modifier, les masquer, les mettre en avant ou les supprimer ici. Aucun produit existant n’est écrasé.</p>` +
        `<p><button type="button" class="btn b1" data-a="cat-import">Importer le catalogue du site</button></p><p class="fe" id="seed-err" role="alert"></p></div>`;
    }
    if (fil) {
      const chipRow = (label, k, opts) => `<div class="chips" role="group" aria-label="${label}">${opts.map(([v, t]) => `<button type="button" class="chip${CT[k] === v ? ' on' : ''}" data-a="cat-filter" data-k="${k}" data-v="${v}" aria-pressed="${CT[k] === v}">${t}</button>`).join('')}</div>`;
      fil.innerHTML = chipRow('Pôle', 'pole', [['', 'Tous les pôles']].concat(CATLG.POLE_ORDER.map((k) => [k, POLES[k]]))) + chipRow('Statut', 'status', STATUS_FILTERS);
    }
    if (!all.length) {
      box.innerHTML = `<div class="panel"><h3>Le catalogue est vide</h3><p class="mut" style="margin:6px 0 12px">Ajoutez un premier produit avec « + Ajouter un produit ».</p></div>`;
      return;
    }
    const rows = all.filter((x) => (!CT.pole || x.pole === CT.pole) && (!CT.status || x.status === CT.status));
    if (!rows.length) { box.innerHTML = '<div class="panel"><p>Aucun produit ne correspond à ces filtres.</p></div>'; return; }
    const cell = (label, html, cls) => `<td role="cell"${cls ? ` class="${cls}"` : ''} data-label="${label}"><div class="adm-v">${html}</div></td>`;
    box.innerHTML = `<div class="adm-tw"><table class="adm-t cat-t" role="table"><caption class="sr">Produits</caption><thead><tr role="row">` +
      ['Produit', 'Pôle', 'Type', 'Statut', 'Mis en avant', 'Offres'].map((h) => `<th scope="col" role="columnheader">${h}</th>`).join('') + '<th scope="col" role="columnheader"><span class="sr">Actions</span></th></tr></thead><tbody>' +
      rows.map((x) => {
        const plans = CT.plans.plans.filter((pl) => pl.productId === x.id), act = plans.filter((pl) => pl.status === 'active').length;
        const site = x.source === 'site', pub = x.status === 'published';
        const actions = site
          ? '<span class="mut">Intégré au site</span>'
          : `<button class="btn b4" data-a="cat-edit" data-id="${esc(x.id)}">Modifier</button> <button class="btn b4" data-a="cat-toggle" data-id="${esc(x.id)}">${pub ? 'Dépublier' : x.status === 'unavailable' ? 'Rendre disponible' : x.status === 'archived' ? 'Republier' : 'Publier'}</button> <button class="btn b4" data-a="cat-del" data-id="${esc(x.id)}">Supprimer</button>`;
        return `<tr role="row">${cell('Produit', `<span class="cat-n">${logoImg(x, 'cat-logo')}<span><b>${esc(x.name)}</b><small>${esc(x.id)}${x.tagline ? ' · ' + esc(x.tagline) : ''}</small></span></span>`)}` +
          cell('Pôle', esc(POLES[x.pole]), 'adm-d') + cell('Type', esc(TYPES[x.category]), 'adm-d') +
          cell('Statut', badge(STATUS_CLS[x.status] || 'bd-off', STATUS[x.status] || x.status) + (site ? ' ' + badge('bd-kind', 'Site') : '')) +
          cell('Mis en avant', x.featured ? 'Oui' : 'Non', 'adm-d') +
          cell('Offres', plans.length ? `${act} active${act > 1 ? 's' : ''} / ${plans.length}` : 'Aucune', 'adm-d') +
          `<td role="cell" class="adm-act">${actions}</td></tr>`;
      }).join('') + '</tbody></table></div>';
  }

  A['cat-retry'] = () => loadCatalogueAdmin();
  A['cat-filter'] = (btn) => { CT[btn.dataset.k] = btn.dataset.v; renderCatalogue(); };

  /* Importe le catalogue intégré au site dans Firestore (jamais d'écrasement) et note qu'il l'est : plus de doublon avec le code. */
  A['cat-import'] = async (btn) => {
    btn.disabled = true;
    try {
      const n = await (await D()).importBuiltins(CATLG.BUILTIN);
      resetCatalogue();
      A.x();
      toast(n ? `Catalogue du site importé (${n} produit${n > 1 ? 's' : ''}).` : 'Rien à importer : tout existe déjà.');
      await loadCatalogueAdmin();
    } catch (e) {
      console.error('[Studio Prism] Import du catalogue :', e);
      const el = document.getElementById('seed-err') || document.getElementById('imp-err');
      if (el) el.textContent = errMsg(e); else toast(errMsg(e));
      btn.disabled = false;
    }
  };

  /* Un produit intégré au site ne peut être modifié, dépublié ou supprimé qu'une fois le catalogue importé (sinon il réapparaîtrait). */
  function needsImport(id) { return !CT.built && CATLG.BUILTIN.some((b) => b.id === id); }
  function importFirst() {
    pmodal(`<h3>Importer le catalogue du site</h3><p>Ce produit fait partie du catalogue intégré au site (${nProducts()} produits). Pour le modifier, le dépublier ou le supprimer, importez d’abord ce catalogue dans Firestore. Aucun produit existant n’est écrasé.</p>` +
      `<p class="fe" id="imp-err" role="alert"></p><p style="margin-top:12px"><button class="btn b1" data-a="cat-import">Importer maintenant</button></p>`);
  }

  const INITIAL_OFFERS = [['', 'Aucune offre pour le moment'], ['free', 'Gratuit'], ['one_time', 'Achat unique'], ['subscription', 'Abonnement'], ['quote', 'Sur devis']];

  function productForm(id) {
    const x = id ? CT.prods.find((p) => p.id === id) : null;
    if (id && !x) { toast('Produit inexistant.'); return; }
    const plans = x ? CT.plans.plans.filter((pl) => pl.productId === x.id) : [];
    pmodal(`<h3>${x ? 'Modifier le produit' : 'Ajouter un produit'}</h3>` +
      `<form data-f="cat-prod" data-mode="${x ? 'edit' : 'new'}" data-prev="${esc(x ? x.name : '')}" novalidate>` +
      fld('pf-name', 'Nom', inp('pf-name', 'text', x && x.name, 'maxlength="80" autocomplete="off"')) +
      fld('pf-id', 'Identifiant', inp('pf-id', 'text', x && x.id, `maxlength="60" autocomplete="off" ${x ? 'readonly' : ''}`), x ? 'L’identifiant ne peut plus être modifié.' : 'Lettres minuscules, chiffres et tirets. Il sert d’adresse (#/produits/identifiant).') +
      `<div class="row">${fld('pf-pole', 'Pôle responsable', sel('pf-pole', CATLG.POLE_ORDER.map((k) => [k, POLES[k]]), x ? x.pole : 'app'))}` +
      `${fld('pf-cat', 'Type de produit', sel('pf-cat', Object.keys(TYPES).map((k) => [k, TYPES[k]]), x ? x.category : 'application'), 'Indépendant du pôle.')}</div>` +
      `<div class="row">${fld('pf-status', 'Statut de publication', sel('pf-status', Object.keys(STATUS).map((k) => [k, STATUS[k]]), x ? x.status : 'draft'), 'Brouillon : pas encore publié. Archivé : dépublié, conservé, invisible du public. Indisponible : visible mais non commandable.')}` +
      `${fld('pf-stage', 'Avancement', sel('pf-stage', [['', '—']].concat(Object.keys(STAGES).map((k) => [k, STAGES[k]])), x ? x.stage : ''))}</div>` +
      fld('pf-tag', 'Accroche <span class="mut">(facultatif)</span>', inp('pf-tag', 'text', x && x.tagline, 'maxlength="80" autocomplete="off" placeholder="Application BIM / XR"')) +
      fld('pf-desc', 'Description', txa('pf-desc', x && x.description, 3, 'maxlength="1000"')) +
      fld('pf-avail', 'Disponibilité <span class="mut">(facultatif)</span>', inp('pf-avail', 'text', x && x.availability, 'maxlength="120" autocomplete="off" placeholder="Disponible sur Roblox, sur commande…"')) +
      fld('pf-info', 'Informations utiles <span class="mut">(facultatif)</span>', txa('pf-info', x && x.info, 4, 'maxlength="1000"'), 'Une information par ligne. « Libellé : valeur » devient une ligne de la fiche produit.') +
      fld('pf-plat', 'Plateformes <span class="mut">(facultatif)</span>', inp('pf-plat', 'text', x && x.platforms.join(', '), 'maxlength="200" autocomplete="off" placeholder="Web, iOS, Android, Roblox…"'), 'Séparées par des virgules (8 au maximum).') +
      fld('pf-logo', 'Logo <span class="mut">(médiathèque ou lien)</span>', inp('pf-logo', 'text', x && x.logo, 'maxlength="300" autocomplete="off" placeholder="media:… (médiathèque), assets/img/logo.png ou https://…"') + pickBtn('pf-logo'), 'Choisissez un fichier de la médiathèque (recommandé : le remplacer met à jour tous les affichages) ou collez un lien.') +
      fld('pf-img', 'Image <span class="mut">(médiathèque ou lien)</span>', inp('pf-img', 'text', x && x.image, 'maxlength="300" autocomplete="off"') + pickBtn('pf-img')) +
      fld('pf-url', 'Page du produit <span class="mut">(lien)</span>', inp('pf-url', 'text', x && x.url, 'maxlength="300" autocomplete="off" placeholder="#/projets/archivision ou https://…"'), 'Page du site (#/…), fichier du site (assets/…) ou adresse https://. Vide : la fiche #/produits/identifiant est utilisée.') +
      `<div class="row">${fld('pf-order', 'Ordre d’affichage', inp('pf-order', 'number', x ? x.displayOrder : (CT.prods.length + 1), 'min="0" max="9999" step="1"'))}<div class="acc-f">${chk('pf-feat', 'Mis en avant (« Réalisations »)', x && x.featured)}</div></div>` +
      (x ? `<div class="pf-offers"><h4>Offres</h4><p class="mt2">${plans.length ? `${plans.length} formule${plans.length > 1 ? 's' : ''} : ${esc(plans.map((pl) => pl.name).join(', '))}.` : 'Aucune offre : le produit est présenté sans tarif.'} Les formules, prix et périodes se gèrent dans l’onglet <a class="more" href="#/admin/abonnements" data-a="x">Offres et prix</a>.</p></div>`
        : `<fieldset class="pf-offers"><legend>Offre initiale <span class="mut">(facultative)</span></legend>${fld('pf-offer', 'Mode de commercialisation', sel('pf-offer', INITIAL_OFFERS, ''), 'Un produit n’a besoin d’aucune offre : vous pourrez en ajouter, ou non, plus tard (onglet Offres et prix).')}` +
          `<div id="pf-prices" hidden><div class="row">${fld('pf-pone', 'Prix (achat unique)', inp('pf-pone', 'number', '', 'min="0" step="0.01"'))}${fld('pf-pmon', 'Prix mensuel', inp('pf-pmon', 'number', '', 'min="0" step="0.01"'))}${fld('pf-pyear', 'Prix annuel', inp('pf-pyear', 'number', '', 'min="0" step="0.01"'))}</div>` +
          `${fld('pf-cur', 'Devise', inp('pf-cur', 'text', 'EUR', 'maxlength="3" autocomplete="off"'))}</div></fieldset>`) +
      `<p class="fe" id="pf-err" role="alert"></p><p style="margin-top:14px"><button class="btn b1" type="submit">${x ? 'Enregistrer' : 'Ajouter le produit'}</button></p></form>`, true);
  }

  A['cat-add'] = () => productForm('');
  A['cat-edit'] = (btn) => { if (needsImport(btn.dataset.id)) return importFirst(); productForm(btn.dataset.id); };

  document.addEventListener('change', (e) => {
    if (e.target.id !== 'pf-offer') return;
    const v = e.target.value, box = document.getElementById('pf-prices');
    if (!box) return;
    box.hidden = !(v === 'one_time' || v === 'subscription');
    document.getElementById('e-pf-pone').closest('.acc-f').hidden = v !== 'one_time';
    document.getElementById('e-pf-pmon').closest('.acc-f').hidden = v !== 'subscription';
    document.getElementById('e-pf-pyear').closest('.acc-f').hidden = v !== 'subscription';
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'pf-name') {
      const idEl = document.getElementById('pf-id');
      if (idEl && !idEl.readOnly && !idEl.dataset.touched) idEl.value = slugify(e.target.value);
    } else if (e.target.id === 'pf-id') e.target.dataset.touched = '1';
    else if (e.target.id === 'of-name' || e.target.id === 'of-prod') offerAutoId();
    else if (e.target.id === 'of-id') e.target.dataset.touched = '1';
  });

  const optUrl = (v) => !v || !!safeUrl(v);
  const optMedia = (v) => optUrl(v) || /^media:[A-Za-z0-9]{10,40}$/.test(v);

  /* Offre initiale du formulaire produit → formule + prix (nouveau format). Renvoie null si « aucune offre ». */
  function initialOffer(fm, prod, er) {
    const mode = fm.elements['pf-offer'].value, g = (n) => fm.elements[n].value.trim(), cur = g('pf-cur').toUpperCase();
    if (!mode) return null;
    const names = { free: 'Gratuit', one_time: 'Achat unique', subscription: 'Abonnement', quote: 'Sur devis' };
    const lic = { free: 'free', one_time: 'standard', subscription: 'pro', quote: 'pro_entreprise' }[mode];
    const prices = [];
    const amt = (k, period, label) => {
      if (!g(k)) return;
      const n = Number(g(k));
      if (!isFinite(n) || n <= 0 || n >= 1000000) er[k] = `${label} : saisissez un prix supérieur à 0.`; else prices.push({ period, amount: n, currency: cur });
    };
    if (mode === 'one_time') amt('pf-pone', 'once', 'Prix');
    if (mode === 'subscription') { amt('pf-pmon', 'monthly', 'Prix mensuel'); amt('pf-pyear', 'yearly', 'Prix annuel'); }
    if ((mode === 'one_time' || mode === 'subscription')) {
      if (!/^[A-Za-z]{3}$/.test(cur)) er['pf-cur'] = 'Code à 3 lettres (ex. EUR).';
      if (!prices.length && !Object.keys(er).some((k) => /^pf-p/.test(k))) er[mode === 'one_time' ? 'pf-pone' : 'pf-pmon'] = 'Saisissez au moins un prix, ou choisissez « Sur devis ».';
    }
    return { plan: { id: slugify(`${prod.id}-${names[mode]}`), productId: prod.id, productName: prod.name, name: names[mode], description: '', mode, features: [], licenseType: lic, status: 'active', featured: false, displayOrder: 1 }, prices };
  }

  async function submitProduct(fm) {
    clearErrors();
    const g = (n) => fm.elements[n].value.trim(), edit = fm.dataset.mode === 'edit', err = fm.querySelector('#pf-err'), er = {};
    err.textContent = '';
    const order = Number(g('pf-order')), plats = g('pf-plat').split(',').map((x) => x.trim()).filter(Boolean);
    if (!g('pf-name')) er['pf-name'] = 'Renseignez le nom du produit.';
    else if (g('pf-name').length > 80) er['pf-name'] = '80 caractères maximum.';
    if (!ID_RE.test(g('pf-id'))) er['pf-id'] = 'Identifiant invalide : 2 à 60 caractères, lettres minuscules, chiffres, tirets ou underscores.';
    if (g('pf-tag').length > 80) er['pf-tag'] = '80 caractères maximum.';
    if (g('pf-desc').length > 1000) er['pf-desc'] = '1000 caractères maximum.';
    if (g('pf-avail').length > 120) er['pf-avail'] = '120 caractères maximum.';
    if (fm.elements['pf-info'].value.length > 1000) er['pf-info'] = '1000 caractères maximum.';
    if (plats.length > 8) er['pf-plat'] = '8 plateformes au maximum.';
    [['pf-logo', 'Lien du logo', optMedia], ['pf-img', 'Lien de l’image', optMedia], ['pf-url', 'Lien du produit', optUrl]].forEach(([k, l, ok]) => { if (!ok(g(k))) er[k] = `${l} invalide : utilisez #/…, assets/…, https://… ou un média de la médiathèque.`; });
    if (!Number.isInteger(order) || order < 0 || order > 9999) er['pf-order'] = 'Nombre entier entre 0 et 9999.';
    const prod = { id: g('pf-id'), name: g('pf-name') };
    const offer = edit ? null : initialOffer(fm, prod, er);
    if (showErrors(fm, er)) return;
    const btn = fm.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const d = await D();
      const r = await d.saveProduct({
        id: prod.id, name: prod.name, category: g('pf-cat'), pole: g('pf-pole'), stage: g('pf-stage'), tagline: g('pf-tag'), description: g('pf-desc'),
        availability: g('pf-avail'), info: fm.elements['pf-info'].value.trim(), platforms: plats, logo: g('pf-logo'), image: g('pf-img'), url: g('pf-url'),
        status: g('pf-status'), featured: fm.elements['pf-feat'].checked, displayOrder: order
      }, !edit, fm.dataset.prev);
      let offerFailed = false;
      if (offer) {
        // lot suivant : la règle de la formule exige que le produit existe déjà. Un échec ici ne remet JAMAIS en cause le produit.
        try { await d.savePlan(offer.plan, offer.prices, true, null); } catch (e2) { offerFailed = true; console.error('[Studio Prism] Offre initiale :', e2); }
      }
      resetCatalogue();
      A.x();
      toast(offerFailed ? 'Produit enregistré, mais son offre initiale n’a pas pu être créée : ajoutez-la dans l’onglet Offres et prix.'
        : r.cascadeFailed ? 'Produit enregistré, mais certains noms n’ont pas pu être mis à jour dans les offres ou licences.' : (edit ? 'Produit mis à jour.' : 'Produit ajouté.'));
      loadCatalogueAdmin();
    } catch (e) {
      console.error('[Studio Prism] Produit :', e);
      err.textContent = errMsg(e);
      btn.disabled = false;
    }
  }

  A['cat-toggle'] = (btn) => {
    const x = CT.prods.find((p) => p.id === btn.dataset.id);
    if (!x) return;
    if (needsImport(x.id)) return importFirst();
    const pub = x.status === 'published';
    pmodal(`<h3>${pub ? 'Dépublier le produit' : 'Publier le produit'}</h3>` +
      (pub ? `<p><b>Dépublier « ${esc(x.name)} » ?</b></p><p class="mut" style="margin-top:6px">Le produit passe en « Archivé » : il n’est plus visible du public (Produits, page de son pôle, Réalisations) mais il est conservé et peut être republié à tout moment. Ses formules et licences ne sont pas touchées.</p>`
        : `<p><b>Publier « ${esc(x.name)} » ?</b></p><p class="mut" style="margin-top:6px">Le produit devient visible de tous les visiteurs : page Produits, page de son pôle et, s’il est mis en avant, Réalisations.</p>`) +
      `<p class="fe" id="ct-err" role="alert"></p><p style="margin-top:12px"><button class="btn b1" data-a="cat-toggle-ok" data-id="${esc(x.id)}">${pub ? 'Dépublier' : 'Publier'}</button></p>`);
  };
  A['cat-toggle-ok'] = async (btn) => {
    const x = CT.prods.find((p) => p.id === btn.dataset.id);
    if (!x) return;
    btn.disabled = true;
    try {
      const next = x.status === 'published' ? 'archived' : 'published';
      await (await D()).setProductStatus(x.id, next);
      resetCatalogue();
      A.x();
      toast(next === 'archived' ? 'Produit dépublié (archivé) : il n’apparaît plus sur le site.' : 'Produit publié.');
      loadCatalogueAdmin();
    } catch (e) { const el = document.getElementById('ct-err'); if (el) el.textContent = errMsg(e); btn.disabled = false; }
  };

  A['cat-del'] = (btn) => {
    const x = CT.prods.find((p) => p.id === btn.dataset.id);
    if (!x) return;
    if (needsImport(x.id)) return importFirst();
    pmodal(`<h3>Supprimer le produit</h3><p><b>Supprimer définitivement « ${esc(x.name)} » ?</b></p><p class="mut" style="margin-top:6px">La suppression est refusée tant que des licences ou des formules utilisent ce produit : passez-le en brouillon plutôt.</p>` +
      `<p class="fe" id="cd-err" role="alert"></p><p style="margin-top:12px"><button class="btn btn-danger" data-a="cat-del-ok" data-id="${esc(x.id)}">Supprimer le produit</button></p>`);
  };

  A['cat-del-ok'] = async (btn) => {
    btn.disabled = true;
    try {
      await (await D()).deleteProduct(btn.dataset.id);
      resetCatalogue();
      A.x();
      toast('Produit supprimé.');
      loadCatalogueAdmin();
    } catch (e) {
      const el = document.getElementById('cd-err');
      if (el) el.textContent = errMsg(e);
      btn.disabled = false;
    }
  };

  /* ================================================================== ADMINISTRATION : OFFRES ET PRIX (formules d'un produit) */

  /* Une FORMULE (collection subscriptions) = ce que l'on obtient : mode, droits (type de licence), fonctionnalités.
     Ses PRIX (collection prices) = un montant par période de facturation. Un produit a 0, 1 ou plusieurs formules ;
     une formule gratuite ou sur devis n'a aucun prix ; un abonnement peut n'avoir qu'une seule période. */
  const OT = { prods: null, plans: null, archived: [], prod: '', status: '', error: '', editing: null };

  function offersTab(p, shell) {
    OT.prods = null; OT.plans = null; OT.error = '';
    V(shell(`${lede('Formules (gratuit, achat unique, abonnement, sur devis) et prix de chaque produit. Tout est facultatif : un produit peut n’avoir aucune offre, une seule, ou plusieurs. Les prix sont enregistrés ici (Firestore) et nulle part ailleurs.')}` +
      `<div class="panel adm-bar of-bar"><div class="acc-f"><label for="ot-prod">Produit</label><select id="ot-prod"><option value="">Tous</option></select></div>` +
      `<div class="acc-f"><label for="ot-status">Statut</label><select id="ot-status"><option value="">Tous</option><option value="active">Actives</option><option value="inactive">Inactives</option></select></div>` +
      `<div class="acc-f adm-rs"><button type="button" class="btn b1" data-a="of-add">+ Ajouter une formule</button></div></div>` +
      `<div id="of-list" aria-live="polite"><p class="mut">Chargement des offres…</p></div>`));
    loadOffersAdmin();
  }

  async function loadOffersAdmin() {
    try {
      const d = await D();
      const [prods, offers, prices] = await Promise.all([d.adminListProducts(), d.adminListOffers(), d.adminListPrices()]);
      OT.prods = prods.map((x) => Object.assign(CATLG.normProduct(x), { source: 'firestore' }));
      const b = CATLG.buildPlans(offers, prices);
      OT.plans = b.plans; OT.archived = b.archived;
      adminCache.offers = offers;
      OT.error = '';
      const s = document.getElementById('ot-prod');
      if (s) { s.length = 1; OT.prods.forEach((x) => s.add(new Option(x.name, x.id))); s.value = OT.prod; }
    } catch (e) {
      console.error('[Studio Prism] Offres :', e);
      OT.error = errMsg(e);
    }
    renderOffersAdmin();
  }

  /* Tarifs d'une formule, en clair : « 14,90 € / mois · 149 € / an ». */
  function pricesText(pl) {
    if (pl.mode === 'free') return 'Gratuit';
    if (pl.mode === 'quote') return 'Sur devis';
    const lp = CATLG.livePrices(pl);
    if (!lp.length) return 'Aucun prix';
    return lp.map((x) => `${money(x.amount, x.currency)}${CATLG.PER[x.period] ? ' ' + CATLG.PER[x.period] : ''}`).join(' · ');
  }

  function renderOffersAdmin() {
    const box = document.getElementById('of-list');
    if (!box) return;
    if (OT.error) { box.innerHTML = `<div class="panel"><p>${esc(OT.error)}</p><p style="margin-top:12px"><button class="btn b1" data-a="of-retry">Réessayer</button></p></div>`; return; }
    const hasAv = OT.prods.some((x) => x.id === 'archivision') && !OT.plans.some((pl) => pl.productId === 'archivision');
    const demo = hasAv ? `<p style="margin-top:12px"><button class="btn b4" data-a="of-example">Ajouter les formules d’exemple d’ArchiVision</button></p><p class="fe" id="of-seed-err" role="alert"></p>` : '';
    if (!OT.plans.length) {
      box.innerHTML = `<div class="panel"><p>Aucune formule pour le moment.</p><p class="mut" style="margin-top:6px">${OT.prods.length ? 'Les produits n’ont pas besoin d’offre : ajoutez une formule seulement si vous voulez en proposer une (« + Ajouter une formule »).' : 'Commencez par créer ou importer des produits (onglet Catalogue).'}</p>${demo}</div>`;
      return;
    }
    const rows = OT.plans.filter((pl) => (!OT.prod || pl.productId === OT.prod) && (!OT.status || pl.status === OT.status));
    if (!rows.length) { box.innerHTML = '<div class="panel"><p>Aucune formule ne correspond à ce filtre.</p></div>'; return; }
    const cell = (label, html, cls) => `<td role="cell"${cls ? ` class="${cls}"` : ''} data-label="${label}"><div class="adm-v">${html}</div></td>`;
    box.innerHTML = `<div class="adm-tw"><table class="adm-t of-t" role="table"><caption class="sr">Formules</caption><thead><tr role="row">` +
      ['Produit', 'Formule', 'Mode', 'Tarifs', 'Licence', 'Fonctions', 'Statut'].map((h) => `<th scope="col" role="columnheader">${h}</th>`).join('') + '<th scope="col" role="columnheader"><span class="sr">Actions</span></th></tr></thead><tbody>' +
      rows.map((pl) => {
        const on = pl.status === 'active';
        return `<tr role="row">${cell('Produit', esc(pl.productName))}${cell('Formule', `<b>${esc(pl.name)}</b><small>${esc(pl.id)}${pl.featured ? ' · recommandée' : ''}</small>${pl.legacy ? '<small>Ancien format</small>' : ''}`)}` +
          cell('Mode', esc(MODES[pl.mode] || pl.mode)) + cell('Tarifs', esc(pricesText(pl)), 'adm-p') + cell('Licence', badge('bd-kind', typeLabel(pl.licenseType))) +
          cell('Fonctions', String((pl.features || []).length), 'adm-d') + cell('Statut', badge(on ? 'bd-ok' : 'bd-off', on ? 'Active' : 'Inactive')) +
          `<td role="cell" class="adm-act"><button class="btn b4" data-a="of-edit" data-id="${esc(pl.id)}">Modifier</button> <button class="btn b4" data-a="of-toggle" data-id="${esc(pl.id)}">${on ? 'Désactiver' : 'Activer'}</button> <button class="btn b4" data-a="of-del" data-id="${esc(pl.id)}">Supprimer</button></td></tr>`;
      }).join('') + `</tbody></table></div>${OT.archived.length ? `<p class="mt2 of-arch">${OT.archived.length} ancien${OT.archived.length > 1 ? 's' : ''} document${OT.archived.length > 1 ? 's' : ''} d’offre conservé${OT.archived.length > 1 ? 's' : ''} (archives, non affichés).</p>` : ''}${demo}`;
  }

  document.addEventListener('change', (e) => {
    if (e.target.id === 'ot-prod') { OT.prod = e.target.value; renderOffersAdmin(); }
    else if (e.target.id === 'ot-status') { OT.status = e.target.value; renderOffersAdmin(); }
    else if (e.target.id === 'of-mode') offerModeChanged();
  });

  A['of-retry'] = () => loadOffersAdmin();

  A['of-example'] = async (btn) => {
    btn.disabled = true;
    try {
      const n = await (await D()).seedExamplePlans();
      resetCatalogue();
      toast(n ? `Formules d’exemple ajoutées (${n}).` : 'Rien à ajouter : tout existe déjà.');
      await loadOffersAdmin();
    } catch (e) {
      console.error('[Studio Prism] Formules d’exemple :', e);
      const el = document.getElementById('of-seed-err');
      if (el) el.textContent = errMsg(e);
      btn.disabled = false;
    }
  };

  function offerAutoId() {
    const idEl = document.getElementById('of-id'), n = document.getElementById('of-name'), p = document.getElementById('of-prod');
    if (idEl && n && p && !idEl.readOnly && !idEl.dataset.touched) idEl.value = slugify(`${p.value}-${n.value}`);
  }

  /* Affiche les champs de prix utiles au mode choisi : achat unique → un prix ; abonnement → mensuel, trimestriel, annuel (au choix). */
  function offerModeChanged() {
    const mode = document.getElementById('of-mode').value;
    const show = (k, on) => { const el = document.getElementById('e-' + k); if (el) el.closest('.acc-f').hidden = !on; };
    const paid = mode === 'one_time' || mode === 'subscription';
    const box = document.getElementById('of-prices');
    if (box) box.hidden = !paid;
    show('of-pone', mode === 'one_time');
    ['of-pmon', 'of-pqua', 'of-pyear'].forEach((k) => show(k, mode === 'subscription'));
  }

  function offerForm(id) {
    const pl = id ? OT.plans.find((x) => x.id === id) : null;
    if (id && !pl) { toast('Formule inexistante.'); return; }
    if (!OT.prods.length) { toast('Créez d’abord un produit (onglet Catalogue).'); return; }
    const types = Array.from(new Set(BASE_TYPES.concat(OT.plans.map((x) => x.licenseType)))).filter(Boolean);
    const amount = (period) => { const x = pl && pl.prices.find((y) => y.period === period); return x ? x.amount : ''; };
    const cur = (pl && pl.prices[0] && pl.prices[0].currency) || 'EUR';
    OT.editing = pl;
    pmodal(`<h3>${pl ? 'Modifier la formule' : 'Ajouter une formule'}</h3>` +
      (pl && pl.legacy ? '<p class="acc-note">Cette formule utilise l’ancien format (une offre = un prix). L’enregistrer la convertit : les anciens documents sont conservés, désactivés, et leurs identifiants reportés sur les prix.</p>' : '') +
      `<form data-f="of-form" data-mode="${pl ? 'edit' : 'new'}" novalidate>` +
      fld('of-prod', 'Produit', sel('of-prod', OT.prods.map((x) => [x.id, x.name]), pl ? pl.productId : (OT.prod || OT.prods[0].id), pl ? 'disabled' : '')) +
      `<div class="row">${fld('of-name', 'Nom de la formule', inp('of-name', 'text', pl && pl.name, 'maxlength="80" autocomplete="off" placeholder="Pro"'))}` +
      `${fld('of-id', 'Identifiant', inp('of-id', 'text', pl && pl.id, `maxlength="60" autocomplete="off" ${pl ? 'readonly' : ''}`), pl ? 'Non modifiable.' : 'Généré à partir du produit et du nom.')}</div>` +
      fld('of-desc', 'Description', txa('of-desc', pl && pl.description, 2, 'maxlength="500"')) +
      fld('of-mode', 'Mode de commercialisation', sel('of-mode', Object.keys(MODES).map((k) => [k, MODES[k]]), pl ? pl.mode : 'subscription'), 'Gratuit et sur devis : aucun prix. Achat unique : un seul prix. Abonnement : une ou plusieurs périodes.') +
      `<div id="of-prices"><div class="row">${fld('of-pone', 'Prix (achat unique)', inp('of-pone', 'number', amount('once'), 'min="0" step="0.01"'))}${fld('of-pmon', 'Prix mensuel', inp('of-pmon', 'number', amount('monthly'), 'min="0" step="0.01"'))}` +
      `${fld('of-pqua', 'Prix trimestriel', inp('of-pqua', 'number', amount('quarterly'), 'min="0" step="0.01"'))}${fld('of-pyear', 'Prix annuel', inp('of-pyear', 'number', amount('yearly'), 'min="0" step="0.01"'))}</div>` +
      `${fld('of-cur', 'Devise', inp('of-cur', 'text', cur, 'maxlength="3" autocomplete="off"'), 'Laissez une période vide pour ne pas la proposer.')}</div>` +
      fld('of-type', 'Type de licence', `<input id="of-type" name="of-type" list="of-types" value="${esc(pl ? pl.licenseType : 'pro')}" maxlength="40" autocomplete="off"><datalist id="of-types">${types.map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>`,
        'Droit accordé par la licence activée pour cette formule (minuscules, chiffres, underscore). Extensible : free, pro, pro_entreprise ou un nouveau type.') +
      fld('of-feat', 'Fonctionnalités <span class="mut">(une par ligne)</span>', txa('of-feat', (pl ? pl.features || [] : []).join('\n'), 7), 'Alimentent la carte de la formule et le tableau comparatif. 40 lignes maximum, 120 caractères par ligne.') +
      `<div class="row">${fld('of-status', 'Statut', sel('of-status', [['active', 'Active (visible)'], ['inactive', 'Inactive']], pl ? pl.status : 'active'))}` +
      `${fld('of-order', 'Ordre d’affichage', inp('of-order', 'number', pl ? pl.displayOrder : (OT.plans.length + 1), 'min="0" max="9999" step="1"'))}</div>` +
      chk('of-feat-on', 'Mettre cette formule en avant (« Recommandé »)', pl && pl.featured) +
      `<p class="fe" id="of-err" role="alert"></p><p style="margin-top:14px"><button class="btn b1" type="submit">${pl ? 'Enregistrer' : 'Ajouter la formule'}</button></p></form>`, true);
    offerModeChanged();
    if (!pl) offerAutoId();
  }

  A['of-add'] = () => offerForm('');
  A['of-edit'] = (btn) => offerForm(btn.dataset.id);

  async function submitOffer(fm) {
    clearErrors();
    const g = (n) => fm.elements[n].value.trim(), edit = fm.dataset.mode === 'edit', err = fm.querySelector('#of-err'), er = {};
    err.textContent = '';
    const cur = OT.editing && edit ? OT.editing : null;
    const mode = g('of-mode'), order = Number(g('of-order')), prodId = fm.elements['of-prod'].value, prod = (OT.prods || []).find((p) => p.id === prodId);
    const feats = fm.elements['of-feat'].value.split('\n').map((s) => s.trim()).filter(Boolean);
    const currency = g('of-cur').toUpperCase(), prices = [];
    const legacyOf = (period) => { const x = cur && cur.prices.find((y) => y.period === period); return x && x.legacyId ? x.legacyId : ''; };
    const amt = (k, period, label) => {
      if (!g(k)) return;
      const n = Number(g(k));
      if (!isFinite(n) || n <= 0 || n >= 1000000) { er[k] = `${label} : saisissez un prix supérieur à 0.`; return; }
      const pr = { period, amount: n, currency };
      const lg = legacyOf(period);
      if (lg) pr.legacyId = lg;
      prices.push(pr);
    };
    if (!prod) er['of-prod'] = 'Produit inexistant.';
    if (!g('of-name')) er['of-name'] = 'Renseignez le nom de la formule.';
    if (!ID_RE.test(g('of-id'))) er['of-id'] = 'Identifiant invalide : 2 à 60 caractères, lettres minuscules, chiffres, tirets ou underscores.';
    if (g('of-desc').length > 500) er['of-desc'] = '500 caractères maximum.';
    if (mode === 'one_time') amt('of-pone', 'once', 'Prix');
    if (mode === 'subscription') { amt('of-pmon', 'monthly', 'Prix mensuel'); amt('of-pqua', 'quarterly', 'Prix trimestriel'); amt('of-pyear', 'yearly', 'Prix annuel'); }
    if (mode === 'one_time' || mode === 'subscription') {
      if (!/^[A-Za-z]{3}$/.test(currency)) er['of-cur'] = 'Code à 3 lettres (ex. EUR).';
      if (!prices.length && !Object.keys(er).some((k) => /^of-p/.test(k))) er[mode === 'one_time' ? 'of-pone' : 'of-pmon'] = 'Saisissez au moins un prix, ou choisissez « Sur devis » ou « Gratuit ».';
    }
    if (!TYPE_RE.test(g('of-type'))) er['of-type'] = 'Type invalide : minuscules, chiffres et underscore (ex. pro_entreprise).';
    if (feats.length > 40) er['of-feat'] = '40 fonctionnalités maximum.';
    else if (feats.some((f) => f.length > 120)) er['of-feat'] = '120 caractères maximum par ligne.';
    if (!Number.isInteger(order) || order < 0 || order > 9999) er['of-order'] = 'Nombre entier entre 0 et 9999.';
    if (showErrors(fm, er)) return;
    const btn = fm.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const plan = { id: g('of-id'), productId: prodId, productName: prod.name, name: g('of-name'), description: g('of-desc'), mode, features: feats, licenseType: g('of-type'), status: g('of-status'), featured: fm.elements['of-feat-on'].checked, displayOrder: order };
      await (await D()).savePlan(plan, prices, !edit || !!(cur && cur.legacy), cur && cur.legacy ? { docs: cur.docs } : null);
      resetCatalogue();
      A.x();
      toast(edit ? 'Formule mise à jour.' : 'Formule ajoutée.');
      loadOffersAdmin();
    } catch (e) {
      console.error('[Studio Prism] Formule :', e);
      err.textContent = errMsg(e);
      btn.disabled = false;
    }
  }

  A['of-toggle'] = async (btn) => {
    const pl = OT.plans.find((x) => x.id === btn.dataset.id);
    if (!pl) return;
    btn.disabled = true;
    try {
      const next = pl.status === 'active' ? 'inactive' : 'active';
      await (await D()).setPlanStatus(pl.docs.map((x) => x.id), next);
      resetCatalogue();
      toast(next === 'inactive' ? 'Formule désactivée : elle n’apparaît plus sur le site.' : 'Formule activée.');
      loadOffersAdmin();
    } catch (e) { toast(errMsg(e)); btn.disabled = false; }
  };

  A['of-del'] = (btn) => {
    const pl = OT.plans.find((x) => x.id === btn.dataset.id);
    if (!pl) return;
    pmodal(`<h3>Supprimer la formule</h3><p><b>Supprimer définitivement la formule « ${esc(pl.name)} » (${esc(pl.productName)}) et ses prix ?</b></p><p class="mut" style="margin-top:6px">Les licences déjà activées ne sont pas modifiées. Pour retirer la formule du site sans la perdre, désactivez-la.</p>` +
      `<p class="fe" id="od-err" role="alert"></p><p style="margin-top:12px"><button class="btn btn-danger" data-a="of-del-ok" data-id="${esc(pl.id)}">Supprimer la formule</button></p>`);
  };

  A['of-del-ok'] = async (btn) => {
    const pl = OT.plans.find((x) => x.id === btn.dataset.id);
    if (!pl) return;
    btn.disabled = true;
    try {
      await (await D()).deletePlan(pl.id, pl.docs.map((x) => x.id));
      resetCatalogue();
      A.x();
      toast('Formule supprimée.');
      loadOffersAdmin();
    } catch (e) {
      const el = document.getElementById('od-err');
      if (el) el.textContent = errMsg(e);
      btn.disabled = false;
    }
  };

  /* ================================================================== écouteurs & routes */

  document.addEventListener('submit', (e) => {
    const f = e.target.dataset && e.target.dataset.f;
    if (f === 'acc-pw') submitPassword(e.target);
    else if (f === 'acc-del') submitDeleteAccount(e.target);
    else if (f === 'adm-lic') submitLicense(e.target);
    else if (f === 'adm-newuser') submitNewUser(e.target);
    else if (f === 'cat-prod') submitProduct(e.target);
    else if (f === 'of-form') submitOffer(e.target);
  });

  Object.assign(R, {
    abonnements: offersPage,
    compte: accountPage,
    'admin/catalogue': () => K.adminGate('catalogue', catalogueTab),
    'admin/abonnements': () => K.adminGate('offers', offersTab)
  });
})();
