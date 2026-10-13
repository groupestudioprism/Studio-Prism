/* Studio Prism — logique des Cloud Functions (sans dépendance directe au SDK : tout est injecté, ce qui permet de la tester).
 *
 * SÉCURITÉ
 *  - Ce code s'exécute UNIQUEMENT sur les serveurs de Google (Admin SDK). Aucune clé privée n'est dans le dépôt : en production,
 *    Firebase fournit automatiquement les identifiants du compte de service par défaut du projet.
 *  - Le rôle de l'appelant est relu dans Firestore (users/{uid}) à chaque appel : rien n'est cru sur parole.
 *  - Aucun mot de passe n'est reçu, renvoyé, journalisé ni stocké. Un compte créé par un administrateur reçoit un mot de passe
 *    aléatoire jetable que personne ne connaît ; l'utilisateur choisit le sien via l'e-mail de réinitialisation Firebase.
 */
'use strict';
const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Doit rester identique aux tranches de js/app.js (SUBSCRIPTION_CONFIG) et à tierOk() dans firebase/firestore.rules.
const TIERS = { '1': 1, '2-10': 10, '11-25': 25, '26-50': 50, '51-100': 100, '100+': null };
const SUBSCRIPTIONS = ['free', 'pro', 'pro_entreprise'];
const RECENT_LOGIN_SECONDS = 300;
const VERSION = '2.0.0';   // incrémenté à chaque changement du service : visible dans le diagnostic (accountsHealth)

function makeHandlers({ auth, db, FieldValue, HttpsError, logger, now }) {
  const log = logger || { info() {}, error() {} };
  const clock = now || (() => Date.now());
  const fail = (code, message, details) => { throw new HttpsError(code, message, details); };

  const str = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;

  async function profileOf(uid) {
    const s = await db.collection('users').doc(uid).get();
    return s.exists ? s.data() : null;
  }

  function needAuth(request) {
    if (!request || !request.auth || !request.auth.uid) fail('unauthenticated', 'Connexion requise.');
    return request.auth.uid;
  }

  async function needAdmin(request) {
    const uid = needAuth(request);
    const p = await profileOf(uid);
    if (!p || p.role !== 'admin' || p.status !== 'active') fail('permission-denied', 'Accès refusé : réservé aux administrateurs.');
    return uid;
  }

  const tms = (t) => (t && typeof t.toMillis === 'function') ? t.toMillis() : (t && typeof t.ms === 'number' ? t.ms : 0);

  async function activeAdmins() {
    const snap = await db.collection('users').where('role', '==', 'admin').where('status', '==', 'active').limit(5).get();
    return snap.docs.map((d) => d.id);
  }

  /* Supprime un compte, dans cet ordre (chaque étape est relancée sans risque si elle a déjà eu lieu) :
   *   1. lecture de tout ce qui est lié au compte (aucune écriture) ;
   *   2. suppression du compte de connexion (Authentication) : si elle échoue, RIEN d'autre n'est modifié ;
   *   3. nettoyage Firestore : licences du compte, profil, puis entreprise :
   *        - plus aucun autre utilisateur rattaché → l'entreprise est supprimée ;
   *        - d'autres utilisateurs restent rattachés → l'entreprise est CONSERVÉE (données partagées) ; si le compte supprimé en
   *          était le responsable (ownerUid), la responsabilité passe au plus ancien compte restant.
   *      Si cette étape échoue après l'étape 2, l'erreur le dit (reason « partial ») : relancer la suppression termine le travail.
   * Ne touche jamais aux données d'un autre utilisateur. Renvoie un résumé explicite de ce qui a été fait. */
  async function purgeAccount(uid, opts) {
    const expectedEmail = opts && typeof opts.expectedEmail === 'string' ? opts.expectedEmail.trim().toLowerCase() : '';
    const profile = await profileOf(uid);
    let authUser = null;
    try { authUser = await auth.getUser(uid); } catch (e) { if (!e || e.code !== 'auth/user-not-found') throw e; }
    const licenses = await db.collection('licenses').where('userId', '==', uid).get();

    if (!profile && !authUser && !licenses.size) fail('not-found', 'Compte introuvable : il a peut-être déjà été supprimé.', { reason: 'not-found' });
    // La liste de l'administrateur peut être périmée : on vérifie que le compte ciblé est bien celui qui a été confirmé.
    const knownEmail = String((authUser && authUser.email) || (profile && profile.email) || '').toLowerCase();
    if (expectedEmail && knownEmail && knownEmail !== expectedEmail) {
      fail('failed-precondition', 'Ce compte ne correspond plus à celui affiché (liste périmée). Rechargez la liste puis recommencez.', { reason: 'stale' });
    }

    // Entreprise : conservée tant que d'autres comptes y sont rattachés.
    let company = null;
    if (profile && typeof profile.companyId === 'string' && profile.companyId) {
      const cref = db.collection('companies').doc(profile.companyId);
      const members = await db.collection('users').where('companyId', '==', profile.companyId).limit(200).get();
      const others = members.docs.filter((d) => d.id !== uid);
      if (!others.length) company = { ref: cref, action: 'delete' };
      else {
        const csnap = await cref.get();
        if (csnap.exists && csnap.data().ownerUid === uid) {
          const heir = others.slice().sort((a, b) => tms(a.data().createdAt) - tms(b.data().createdAt))[0];
          company = { ref: cref, action: 'transfer', heir: heir.id };
        }
      }
    }

    // Étape 2 : le compte de connexion. Après cela, la personne ne peut plus se connecter.
    let authDeleted = false;
    if (authUser) {
      try { await auth.deleteUser(uid); authDeleted = true; }
      catch (e) {
        if (e && e.code === 'auth/user-not-found') authDeleted = false;   // supprimé entre-temps : on poursuit
        else {
          log.error('purgeAccount:auth', { code: e && e.code, message: e && e.message });
          throw new HttpsError('internal', 'La suppression du compte de connexion a échoué (droits du service ou panne temporaire). Aucune donnée n’a été modifiée : réessayez.', { reason: 'auth-failed' });
        }
      }
    }

    // Étape 3 : les données Firestore.
    const result = { authDeleted, profileDeleted: false, licensesDeleted: 0, companyDeleted: false, companyOwnerTransferred: false };
    try {
      const del = licenses.docs.map((d) => d.ref);
      for (let i = 0; i < del.length; i += 400) {
        const batch = db.batch();
        del.slice(i, i + 400).forEach((r) => batch.delete(r));
        await batch.commit();
        result.licensesDeleted += Math.min(400, del.length - i);
      }
      if (company && company.action === 'transfer') {
        const b = db.batch();
        b.update(company.ref, { ownerUid: company.heir, updatedAt: FieldValue.serverTimestamp() });
        await b.commit();
        result.companyOwnerTransferred = true;
      }
      const last = db.batch();
      if (profile) last.delete(db.collection('users').doc(uid));
      if (company && company.action === 'delete') last.delete(company.ref);
      if (profile || (company && company.action === 'delete')) await last.commit();
      result.profileDeleted = !!profile;
      result.companyDeleted = !!(company && company.action === 'delete');
    } catch (e) {
      log.error('purgeAccount:data', { code: e && e.code, message: e && e.message });
      throw new HttpsError('internal', authDeleted || !authUser
        ? 'Le compte de connexion est supprimé, mais le nettoyage de ses données a échoué. Relancez la suppression pour le terminer.'
        : 'Le nettoyage des données du compte a échoué. Relancez la suppression.', { reason: 'partial', ...result });
    }
    return result;
  }

  function internal(e, what) {
    if (e instanceof HttpsError) throw e;
    log.error(what, { code: e && e.code, message: e && e.message });
    throw new HttpsError('internal', 'Opération impossible pour le moment. Réessayez dans quelques instants.');
  }

  /* ---- Administrateur : créer un utilisateur ---- */
  async function adminCreateUser(request) {
    const adminUid = await needAdmin(request);
    const d = (request.data && typeof request.data === 'object') ? request.data : {};
    const email = typeof d.email === 'string' ? d.email.trim().toLowerCase() : '';
    const kind = d.accountKind === 'company' ? 'company' : d.accountKind === 'individual' ? 'individual' : '';
    const sub = d.subscription === undefined ? 'free' : d.subscription;

    if (!str(d.firstName, 1, 80)) fail('invalid-argument', 'Renseignez le prénom (80 caractères maximum).');
    if (d.lastName !== undefined && d.lastName !== '' && !str(d.lastName, 1, 80)) fail('invalid-argument', 'Nom invalide (80 caractères maximum).');
    if (!EMAIL_RE.test(email) || email.length > 160) fail('invalid-argument', 'Adresse e-mail invalide.');
    if (!kind) fail('invalid-argument', 'Choisissez le type de compte (Particulier ou Entreprise).');
    if (!SUBSCRIPTIONS.includes(sub)) fail('invalid-argument', 'Abonnement invalide.');
    let company = null;
    if (kind === 'company') {
      const c = (d.company && typeof d.company === 'object') ? d.company : {};
      const range = String(c.userRange || '');
      if (!str(c.name, 1, 120)) fail('invalid-argument', 'Renseignez le nom de l’entreprise.');
      const cemail = typeof c.email === 'string' && c.email.trim() ? c.email.trim().toLowerCase() : email;
      if (!EMAIL_RE.test(cemail) || cemail.length > 160) fail('invalid-argument', 'E-mail de l’entreprise invalide.');
      if (!Object.prototype.hasOwnProperty.call(TIERS, range)) fail('invalid-argument', 'Choisissez le nombre de comptes de l’entreprise.');
      if (c.jobTitle !== undefined && c.jobTitle !== '' && !str(c.jobTitle, 1, 80)) fail('invalid-argument', 'Fonction invalide (80 caractères maximum).');
      company = { name: c.name.trim(), email: cemail, userRange: range, userLimit: TIERS[range], jobTitle: (c.jobTitle || '').trim() };
    }

    try {
      let exists = true;
      try { await auth.getUserByEmail(email); } catch (e) { if (e && e.code === 'auth/user-not-found') exists = false; else throw e; }
      if (exists) fail('already-exists', 'Un utilisateur existe déjà avec cette adresse e-mail.');

      // Mot de passe aléatoire JETABLE : jamais renvoyé, jamais journalisé. L'utilisateur définit le sien via l'e-mail Firebase.
      const throwaway = crypto.randomBytes(32).toString('base64url') + 'aA1!';
      const firstName = d.firstName.trim(), lastName = (d.lastName || '').trim();
      const rec = await auth.createUser({ email, password: throwaway, displayName: [firstName, lastName].filter(Boolean).join(' '), emailVerified: false, disabled: false });
      const uid = rec.uid;
      try {
        const ts = FieldValue.serverTimestamp();
        const profile = { firstName, lastName, email, accountKind: kind, subscription: sub, role: 'user', status: 'active', createdAt: ts, updatedAt: ts, lastLogin: null };
        const batch = db.batch();
        if (company) {
          const cref = db.collection('companies').doc();
          Object.assign(profile, { companyId: cref.id, companyName: company.name, companyEmail: company.email, companyUserRange: company.userRange, companyUserLimit: company.userLimit });
          if (company.jobTitle) profile.jobTitle = company.jobTitle;
          batch.set(cref, { name: company.name, email: company.email, ownerUid: uid, userRange: company.userRange, userLimit: company.userLimit, subscription: sub, createdAt: ts, updatedAt: ts });
        }
        batch.set(db.collection('users').doc(uid), profile);
        await batch.commit();
      } catch (e) {
        await auth.deleteUser(uid).catch(() => {}); // pas de compte Authentication sans profil
        throw e;
      }
      log.info('adminCreateUser', { by: adminUid, uid });
      return { uid, email };
    } catch (e) {
      return internal(e, 'adminCreateUser');
    }
  }

  /* ---- Administrateur : supprimer un utilisateur ---- */
  async function adminDeleteUser(request) {
    const adminUid = await needAdmin(request);
    const d = (request.data && typeof request.data === 'object') ? request.data : {};
    const uid = d.uid;
    if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/')) fail('invalid-argument', 'Compte introuvable.');
    if (uid === adminUid) fail('failed-precondition', 'Vous ne pouvez pas supprimer votre propre compte depuis l’administration.', { reason: 'self' });
    const expectedEmail = typeof d.email === 'string' ? d.email : '';
    if (expectedEmail.length > 160) fail('invalid-argument', 'Adresse e-mail invalide.');
    try {
      const target = await profileOf(uid);
      if (target && target.role === 'admin' && target.status === 'active') {
        // Filet de sécurité : il doit rester au moins un autre administrateur actif (l'appelant en est un, mais on le vérifie).
        const admins = await activeAdmins();
        if (!admins.some((id) => id !== uid)) fail('failed-precondition', 'C’est le dernier administrateur actif : il ne peut pas être supprimé.', { reason: 'last-admin' });
      }
      const r = await purgeAccount(uid, { expectedEmail });
      log.info('adminDeleteUser', { by: adminUid, uid, ...r });
      return { ok: true, uid, ...r };
    } catch (e) {
      return internal(e, 'adminDeleteUser');
    }
  }

  /* ---- Utilisateur : supprimer SON compte ---- */
  async function deleteMyAccount(request) {
    const uid = needAuth(request);
    const authTime = Number(request.auth.token && request.auth.token.auth_time);
    if (!authTime || clock() / 1000 - authTime > RECENT_LOGIN_SECONDS) {
      fail('failed-precondition', 'Pour votre sécurité, saisissez de nouveau votre mot de passe pour confirmer.', { reason: 'reauth-required' });
    }
    try {
      const p = await profileOf(uid);
      if (p && p.role === 'admin' && p.status === 'active') {
        const admins = await activeAdmins();
        if (!admins.some((id) => id !== uid)) {
          fail('failed-precondition', 'Vous êtes le dernier administrateur actif : désignez d’abord un autre administrateur.', { reason: 'last-admin' });
        }
      }
      const r = await purgeAccount(uid);
      log.info('deleteMyAccount', { uid, ...r });
      return { ok: true, ...r };
    } catch (e) {
      return internal(e, 'deleteMyAccount');
    }
  }

  /* ---- Diagnostic du service (appelable sans connexion : ne révèle que « le service répond ») ---- */
  async function accountsHealth(request) {
    const out = { ok: true, service: 'studio-prism-accounts', version: VERSION, region: 'europe-west1' };
    const uid = request && request.auth && request.auth.uid;
    if (!uid) return out;
    // Pour un administrateur actif seulement : vérifie que le compte de service a bien les droits dont les suppressions ont besoin.
    let admin = false;
    try { const p = await profileOf(uid); admin = !!p && p.role === 'admin' && p.status === 'active'; } catch (e) { return { ...out, admin: false }; }
    if (!admin) return { ...out, admin: false };
    const probe = async (f) => { try { await f(); return { ok: true }; } catch (e) { return { ok: false, code: String((e && e.code) || 'error').slice(0, 60) }; } };
    out.admin = true;
    out.checks = {
      auth: await probe(() => auth.listUsers(1)),
      firestore: await probe(() => db.collection('users').where('role', '==', 'admin').limit(1).get())
    };
    out.ok = out.checks.auth.ok && out.checks.firestore.ok;
    return out;
  }

  return { adminCreateUser, adminDeleteUser, deleteMyAccount, accountsHealth, purgeAccount };
}

module.exports = { makeHandlers, TIERS, VERSION };
