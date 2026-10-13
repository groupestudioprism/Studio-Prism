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
  updateProfile, deleteUser, doc, collection, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp
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

function emit(next) {
  state = next;
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
    // Compte Authentication sans profil Firestore (créé depuis la console, ou avant Firestore) : profil créé automatiquement.
    log("Firestore: profil absent → création automatique du profil par défaut (user / free / active)");
    try {
      snap = await withTimeout(ensureProfile(user, ref), FIRESTORE_TIMEOUT_MS, "app/firestore-timeout");
    } catch (err) {
      log(`Firestore profile creation error: ${err.code || "unknown"} / ${err.message || err}`);
      if (!err.step) err.step = "firestore";
      throw err;
    }
    log(`Firestore profile created, exists: ${snap.exists()}`);
    if (!snap.exists()) throw appError("app/profile-missing");
  }
  const data = snap.data();
  const missing = ["firstName", "lastName", "email", "accountKind", "subscription", "role", "status"].filter((k) => data[k] == null);
  log(`Firestore profile read success — status=${data.status} role=${data.role} subscription=${data.subscription}` +
      (missing.length ? ` — CHAMPS ABSENTS : ${missing.join(", ")}` : ""));
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
    if (err.code === "app/profile-missing" || err.code === "app/suspended") return forceOut(err.code);
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
/* p : { firstName, lastName, email, password, accountKind: "individual"|"company",
 *       company?: { name, email, jobTitle?, phone?, website?, userRange, userLimit } } */
export async function signUp(p) {
  await whenReady();
  await setPersistence(auth, browserLocalPersistence);
  const next = waitNext();
  const task = (async () => {
    const cred = await createUserWithEmailAndPassword(auth, p.email, p.password);
    const user = cred.user;
    try {
      const batch = writeBatch(db);
      const profile = {
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        accountKind: p.accountKind,
        subscription: "free",   // une entreprise ne reçoit PAS Pro Entreprise automatiquement
        role: "user",
        status: "active",
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
      await batch.commit();
      updateProfile(user, { displayName: `${p.firstName} ${p.lastName}` }).catch(() => {});
    } catch (err) {
      // Profil non enregistré : on annule la création du compte pour que l'utilisateur puisse réessayer proprement.
      await deleteUser(user).catch(() => signOut(auth).catch(() => {}));
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
      if (err.code === "app/profile-missing" || err.code === "app/suspended") pendingNotice = err.code;
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
