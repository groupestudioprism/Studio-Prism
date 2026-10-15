/* Studio Prism — comptes : Firebase Authentication + profil Firestore (users/{uid}).
 *
 * Ce module est la SEULE source de vérité côté navigateur pour l'état de connexion.
 * Il n'affiche rien : l'interface (js/account.js) s'abonne via subscribe() et appelle signUp / signIn / signOutUser / resetPassword.
 *
 * Rappels de sécurité :
 *  - le mot de passe n'est jamais lu ni stocké par le site : il est transmis à Firebase Authentication uniquement ;
 *  - un profil neuf est TOUJOURS créé avec role = "user", subscription = "free", status = "active" ;
 *    les règles Firestore (firebase/firestore.rules) refusent toute autre valeur à la création et interdisent à un
 *    utilisateur de modifier son rôle, son abonnement ou son statut. Ce code n'est qu'un confort d'interface.
 */
import {
  auth, db, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence,
  updateProfile, deleteUser, doc, collection, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp, onSnapshot
} from "./firebase.js";

/* status : "loading" (état inconnu) | "out" | "in" | "error" (connecté mais profil illisible) */
let state = { status: "loading", user: null, profile: null, notice: null };
const listeners = new Set();
let seq = 0;              // ignore les chargements de profil devenus obsolètes
let pendingSignup = null; // empêche de lire le profil avant que l'inscription ne l'ait créé
let pendingNotice = null; // raison d'une déconnexion forcée (compte suspendu, profil introuvable…)

const appError = (code) => Object.assign(new Error(code), { code });

/* ------------------------------------------------------------------ journal de diagnostic (TEMPORAIRE)
 * Affiche chaque étape de la connexion dans la console du navigateur, avec le temps écoulé depuis « signIn start ».
 * Passer DEBUG à false (ou supprimer ce bloc) une fois le diagnostic terminé. Aucun mot de passe n'est journalisé. */
const DEBUG = true;
let t0 = 0;
const log = (msg, ...rest) => {
  if (DEBUG) console.log(`[AUTH] ${msg}${t0 ? ` (+${Math.round(performance.now() - t0)} ms)` : ""}`, ...rest);
};

/* Délais par ÉTAPE. Chaque dépassement a son propre code (donc son propre message) : « app/timeout » (message générique
   « le service met trop de temps ») n'est plus utilisé que par waitNext(), c'est-à-dire par l'inscription. */
const AUTH_TIMEOUT_MS = 35000;       // Firebase Authentication abandonne lui-même à 30 s (auth/network-request-failed)
const FIRESTORE_TIMEOUT_MS = 15000;  // lecture de users/{uid}
const withTimeout = (promise, ms, code) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(appError(code)), ms);
  promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

/* Résolue dès que l'état initial est connu (premier retour de onAuthStateChanged + profil). Sans cette attente, un clic très
   rapide sur « Se connecter » pourrait recevoir l'état initial « déconnecté » à la place du résultat de la connexion. */
let markReady;
const ready = new Promise((resolve) => { markReady = resolve; });
const whenReady = () => Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 10000))]);

/* Surveillance du profil pendant la session : si l'administration supprime, désactive ou remet en attente le compte, la personne est
 * déconnectée tout de suite avec un message clair (au lieu d'erreurs « accès refusé » en naviguant). */
let unwatch = null, watchedUid = "";
function watchProfile(uid) {
  if (watchedUid === uid && unwatch) return;
  stopWatch(); watchedUid = uid;
  try {
    unwatch = onSnapshot(doc(db, "users", uid), (snap) => {
      if (!auth.currentUser || auth.currentUser.uid !== uid) return;
      const d = snap.exists() ? snap.data() : null;
      const code = !d ? "app/account-deleted" : d.status === "suspended" ? "app/suspended" : d.status === "pending" ? "app/pending" : d.status !== "active" ? "app/profile-invalid" : "";
      if (code) { log(`Profil modifié pendant la session → ${code}`); stopWatch(); forceOut(code); }
    }, () => {});
  } catch (e) { unwatch = null; }
}
function stopWatch() { if (unwatch) { try { unwatch(); } catch (e) { /* rien */ } } unwatch = null; watchedUid = ""; }
function emit(next) {
  state = next;
  if (next.status === "in" && next.user) watchProfile(next.user.uid); else if (next.status === "out") stopWatch();
  if (next.status !== "loading") markReady();
  listeners.forEach((fn) => {
    try { fn(state); } catch (e) { console.error(e); }
  });
}

export const getState = () => state;

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

/* Attend la prochaine émission « résolue » (hors "loading") — utilisé après signIn / signUp. */
function waitNext(ms = 20000) {
  let fn, timer;
  const promise = new Promise((resolve, reject) => {
    timer = setTimeout(() => { listeners.delete(fn); reject(appError("app/timeout")); }, ms);
    fn = (s) => {
      if (s.status === "loading") return;
      clearTimeout(timer);
      listeners.delete(fn);
      resolve(s);
    };
    listeners.add(fn);
  });
  promise.catch(() => {});
  return { promise, cancel: () => { clearTimeout(timer); listeners.delete(fn); } };
}

async function forceOut(code) {
  pendingNotice = code;
  await signOut(auth);
}

/* Profil créé automatiquement pour un compte Firebase Authentication qui n'a pas de document users/{uid}.
 * TOUJOURS les valeurs non privilégiées : Particulier / free / user / active. Les règles Firestore refusent à la création
 * tout autre rôle ou abonnement : pour devenir administrateur, `role` doit être passé à "admin" dans la console Firebase. */
function defaultProfile(user) {
  // Nom : celui du compte Firebase s'il existe, sinon déduit de la partie locale de l'e-mail (« jean.dupont@… » → Jean / Dupont).
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  let words = (user.displayName || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) words = (user.email || "").split("@")[0].split(/[._+-]+/).filter(Boolean).map(cap);
  return {
    firstName: (words[0] || "Utilisateur").slice(0, 80),
    lastName: words.slice(1).join(" ").slice(0, 80),
    email: user.email,
    accountKind: "individual",
    subscription: "free",
    role: "user",
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLogin: serverTimestamp()
  };
}

async function ensureProfile(user, ref) {
  try {
    await setDoc(ref, defaultProfile(user));
  } catch (err) {
    const again = await getDoc(ref); // créé entre-temps (autre onglet) ?
    if (again.exists()) return again;
    throw err;
  }
  return getDoc(ref);
}

/* Lecture du profil Firestore users/{uid} — étape DISTINCTE de l'authentification.
 * Erreurs possibles, chacune avec son code :
 *   app/firestore-timeout  la lecture reste sans réponse (> FIRESTORE_TIMEOUT_MS)
 *   permission-denied, unavailable, not-found… (erreur Firestore d'origine, marquée step = "firestore")
 *   app/profile-missing    le document n'existe pas ET n'a pas pu être créé automatiquement
 *   app/profile-invalid    le document existe mais `status` est absent ou invalide
 *   app/suspended          status = "suspended" */
async function readProfile(user) {
  log("Firestore profile read start");
  log(`Firestore UID: ${user.uid}`);
  const ref = doc(db, "users", user.uid);
  let snap;
  try {
    snap = await withTimeout(getDoc(ref), FIRESTORE_TIMEOUT_MS, "app/firestore-timeout");
  } catch (err) {
    log(`Firestore error: ${err.code || "unknown"} / ${err.message || err}`);
    if (!err.step) err.step = "firestore";
    throw err;
  }
  log(`Firestore exists: ${snap.exists()}`);
  if (!snap.exists()) {
    // Compte supprimé depuis l'administration : la personne se reconnecte → son compte de connexion est supprimé à son tour
    // (une connexion récente l'autorise), ce qui libère aussi l'adresse e-mail. La trace deletedAccounts/{uid} reste.
    let gone = false;
    try { gone = (await withTimeout(getDoc(doc(db, "deletedAccounts", user.uid)), FIRESTORE_TIMEOUT_MS, "app/firestore-timeout")).exists(); } catch (e) { gone = false; }
    if (gone) {
      log("Compte supprimé par l'administration → suppression du compte de connexion");
      try { await user.delete(); } catch (e) { log(`auth delete: ${e.code || e}`); }
      throw appError("app/account-deleted");
    }
    // Profil absent sans trace : jamais recréé automatiquement (un compte supprimé ne doit pas « revenir » tout seul). Le profil
    // n'est créé que par une inscription explicite (ou par l'administration). La personne est déconnectée avec un message clair.
    log("Firestore: profil absent → aucune recréation automatique");
    throw appError("app/account-deleted");
  }
  const data = snap.data();
  const missing = ["firstName", "lastName", "email", "accountKind", "subscription", "role", "status"].filter((k) => data[k] == null);
  log(`Firestore profile read success — status=${data.status} role=${data.role} subscription=${data.subscription}` +
      (missing.length ? ` — CHAMPS ABSENTS : ${missing.join(", ")}` : ""));
  if (data.status === "pending") throw appError("app/pending");
  if (data.status !== "active" && data.status !== "suspended") throw appError("app/profile-invalid");
  if (data.status !== "active") throw appError("app/suspended");
  return { uid: user.uid, ...data };
}

/* Profil d'une session RESTAURÉE (rechargement de page) ; la connexion explicite passe par signIn(). */
async function loadProfile(user) {
  const mine = ++seq;
  if (pendingSignup) await pendingSignup;
  if (mine !== seq || !auth.currentUser || auth.currentUser.uid !== user.uid) return;
  try {
    const profile = await readProfile(user);
    if (mine !== seq) return;
    emit({ status: "in", user: { uid: user.uid, email: user.email }, profile, notice: null });
    log("profile state emitted");
  } catch (err) {
    if (mine !== seq) return;
    if (err.code === "app/profile-missing" || err.code === "app/suspended" || err.code === "app/account-deleted" || err.code === "app/pending") return forceOut(err.code);
    console.error("[Studio Prism] Lecture du profil impossible :", err);
    emit({ status: "error", user: { uid: user.uid, email: user.email }, profile: null, notice: err.code || "unknown" });
  }
}

/* Persistance de session + détection de l'état de connexion.
 * Pendant signIn() (manualSignIns > 0), l'arrivée de l'utilisateur est traitée EXPLICITEMENT par signIn() : l'observateur
 * ne lance pas une seconde lecture du profil. */
let manualSignIns = 0;
onAuthStateChanged(auth, (user) => {
  log(user ? `onAuthStateChanged user received (uid ${user.uid})` : "onAuthStateChanged: no user");
  if (!user) {
    seq++;
    const notice = pendingNotice;
    pendingNotice = null;
    emit({ status: "out", user: null, profile: null, notice });
    return;
  }
  if (manualSignIns > 0) {
    log("onAuthStateChanged: user handled by signIn() (no second profile read)");
    return;
  }
  loadProfile(user);
});

/* Relit le profil de l'utilisateur connecté (bouton « Réessayer » après une erreur réseau, par exemple). */
export function refresh() {
  const user = auth.currentUser;
  if (!user) return Promise.resolve();
  emit({ ...state, status: "loading" });
  return loadProfile(user);
}

/* ------------------------------------------------------------------ inscription */
/* L'administration ne peut pas supprimer le compte de connexion d'un autre (pas de serveur) : elle supprime le profil et laisse une trace
 * deletedAccounts/{uid}. Quand la personne se réinscrit avec la même adresse et le même mot de passe, on reprend ce compte :
 *   - si Firebase accepte de le supprimer, l'adresse est libérée et un compte neuf est créé ({ freed: true }) ;
 *   - sinon, le même compte de connexion reçoit un profil neuf (les règles l'autorisent pour une inscription explicite, avec acceptation
 *     des conditions, et la trace est retirée dans le même lot) ({ user }).
 * Renvoie null si l'adresse appartient à un compte actif ou si le mot de passe ne correspond pas. */
async function reclaimDeleted(email, password) {
  let old = null;
  try { old = (await signInWithEmailAndPassword(auth, email, password)).user; } catch (e) { return null; }
  try {
    const prof = await getDoc(doc(db, "users", old.uid));
    const gone = !prof.exists() && (await getDoc(doc(db, "deletedAccounts", old.uid))).exists();
    if (!gone) { await signOut(auth).catch(() => {}); return null; }
  } catch (e) { await signOut(auth).catch(() => {}); return null; }
  try { await deleteUser(old); log("Adresse libérée : ancien compte de connexion supprimé"); return { freed: true }; }
  catch (e) { log(`Ancien compte non supprimable (${e.code || e}) : il est repris avec un profil neuf`); return { user: old }; }
}
/* p : { firstName, lastName, email, password, accountKind: "individual"|"company",
 *       company?: { name, email, jobTitle?, phone?, website?, userRange, userLimit } } */
export async function signUp(p) {
  await whenReady();
  await setPersistence(auth, browserLocalPersistence);
  const next = waitNext();
  const task = (async () => {
    let user = null, reused = false;
    try { user = (await createUserWithEmailAndPassword(auth, p.email, p.password)).user; }
    catch (err) {
      // Adresse encore enregistrée par un compte supprimé depuis l'administration : avec le bon mot de passe, on la reprend.
      if (!(err && err.code === "auth/email-already-in-use")) throw err;
      const r = await reclaimDeleted(p.email, p.password);
      if (!r) throw err;
      if (r.freed) user = (await createUserWithEmailAndPassword(auth, p.email, p.password)).user;
      else { user = r.user; reused = true; }
    }
    try {
      const batch = writeBatch(db);
      const profile = {
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        accountKind: p.accountKind,
        subscription: "free",   // une entreprise ne reçoit PAS Pro Entreprise automatiquement
        role: "user",
        status: p.accountKind === "company" ? "pending" : "active",   // compte Entreprise : validé à la main par l'administration
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        termsAcceptedAt: serverTimestamp()
      };
      if (p.accountKind === "company" && p.company) {
        const c = p.company;
        const companyRef = doc(collection(db, "companies"));
        const companyDoc = {
          name: c.name,
          email: c.email,
          ownerUid: user.uid,
          userRange: c.userRange,
          userLimit: c.userLimit,
          subscription: "free",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        if (c.phone) companyDoc.phone = c.phone;
        if (c.website) companyDoc.website = c.website;
        batch.set(companyRef, companyDoc);
        Object.assign(profile, {
          companyId: companyRef.id,
          companyName: c.name,
          companyEmail: c.email,
          companyUserRange: c.userRange,
          companyUserLimit: c.userLimit
        });
        if (c.jobTitle) profile.jobTitle = c.jobTitle;
      }
      batch.set(doc(db, "users", user.uid), profile);
      if (reused) batch.delete(doc(db, "deletedAccounts", user.uid));   // compte repris : la trace de suppression disparaît avec le nouveau profil
      await batch.commit();
      updateProfile(user, { displayName: `${p.firstName} ${p.lastName}` }).catch(() => {});
    } catch (err) {
      // Profil non enregistré : on annule la création du compte pour que l'utilisateur puisse réessayer proprement.
      if (reused) await signOut(auth).catch(() => {});
      else await deleteUser(user).catch(() => signOut(auth).catch(() => {}));
      throw err;
    }
  })();
  pendingSignup = task.catch(() => {});
  try {
    await task;
  } catch (err) {
    next.cancel();
    throw err;
  } finally {
    pendingSignup = null;
  }
  const s = await next.promise;
  if (s.status !== "in") throw appError(s.notice || "unknown");
  return s;
}

/* ------------------------------------------------------------------ connexion / déconnexion */
/* Connexion : 1) Firebase Authentication  →  2) UID  →  3) lecture Firestore  →  4) profil  →  5) état « connecté ».
 * Les étapes sont enchaînées explicitement (aucune attente d'un événement global) et chacune a sa propre erreur.
 * Si Authentication réussit mais que le profil est inutilisable, la session Firebase est refermée (pas d'état à moitié connecté). */
export async function signIn({ email, password, remember }) {
  t0 = performance.now();
  log("signIn start");
  manualSignIns++;
  let user = null;
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    log("persistence configured");

    log("signInWithEmailAndPassword start");
    const cred = await withTimeout(signInWithEmailAndPassword(auth, email, password), AUTH_TIMEOUT_MS, "app/auth-timeout");
    user = cred.user;
    log("Firebase Authentication success");
    const cu = auth.currentUser;
    log(`auth.currentUser: ${cu ? `uid=${cu.uid} email=${cu.email}` : "null"} | credential.user.uid=${user.uid}`);

    // — Authentification terminée. À partir d'ici, seule la lecture du profil est en jeu. —
    const profile = await readProfile(user);

    seq++; // invalide toute lecture de profil lancée ailleurs
    emit({ status: "in", user: { uid: user.uid, email: user.email }, profile, notice: null });
    log("profile state emitted");

    // Meilleur effort : la connexion ne doit jamais échouer à cause de la date de dernière connexion.
    updateDoc(doc(db, "users", user.uid), { lastLogin: serverTimestamp() })
      .catch((e) => console.warn("[Studio Prism] lastLogin non mis à jour :", e.code || e));
    log("signIn complete");
    return state;
  } catch (err) {
    log(`signIn failed: ${err.code || "unknown"}${err.step ? ` (étape ${err.step})` : ""}`);
    if (user) {
      // Authentification OK mais profil inutilisable : on referme la session Firebase.
      if (err.code === "app/profile-missing" || err.code === "app/suspended" || err.code === "app/account-deleted" || err.code === "app/pending") pendingNotice = err.code;
      await signOut(auth).catch(() => {});
    }
    throw err;
  } finally {
    manualSignIns--;
  }
}

export async function signOutUser() {
  await signOut(auth);
}

/* ------------------------------------------------------------------ mot de passe oublié */
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    // Adresse inconnue : même réponse que pour une adresse connue, pour ne pas révéler quels e-mails ont un compte.
    if (err && err.code === "auth/user-not-found") return;
    throw err;
  }
}
