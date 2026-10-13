/* Studio Prism — accès aux données de la plateforme : produits, formules (collection « subscriptions »), prix (« prices »),
 * licences, réglage du catalogue, et appels aux Cloud Functions.
 *
 * MODÈLE (quatre niveaux, volontairement séparés) :
 *   products        le produit : nom, description, visuels, pôle, type, statut de publication, informations. AUCUNE formule requise.
 *   subscriptions   les FORMULES du produit (0, 1 ou plusieurs) : mode free / one_time / subscription / quote, droits et fonctionnalités.
 *                   Les anciens documents « une offre = un prix » (billingPeriod + price) sont toujours lus et regroupés (voir js/catalog.js).
 *   prices          les PRIX d'une formule, un par période de facturation (once / monthly / quarterly / yearly).
 *   licenses        les droits accordés à un utilisateur.
 *
 * ATTENTION : rien ici ne protège quoi que ce soit. Les écritures du catalogue, des offres et des licences ne réussissent que
 * pour un administrateur (role = "admin", status = "active" dans users/{uid}) : ce sont les règles Firestore
 * (firebase/firestore.rules) qui l'imposent, côté serveurs Google. Les suppressions de comptes passent par les Cloud
 * Functions (functions/), qui utilisent l'Admin SDK côté serveur.
 *
 * Les requêtes sont ciblées et n'ont besoin d'aucun index composite : un seul filtre d'égalité (ou deux), tri fait ici.
 */
import {
  auth, db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where, limit,
  serverTimestamp, Timestamp, reauthenticateWithCredential, EmailAuthProvider, updatePassword, deleteUser
} from "./firebase.js";

const fail = (code, extra) => Object.assign(new Error(code), { code }, extra || {});
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const byOrder = (a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || String(a.name || "").localeCompare(String(b.name || ""), "fr");

/* ------------------------------------------------------------------ lecture publique (visiteurs compris) */

/* Produits visibles du public : publiés, indisponibles (visibles mais non commandables) et anciens « active ». Brouillons exclus.
   Une requête par statut (filtre d'égalité obligatoire : les règles refusent toute requête qui pourrait renvoyer un brouillon). */
export async function listPublicProducts() {
  const out = await Promise.allSettled(["published", "unavailable", "active"].map((st) => getDocs(query(collection(db, "products"), where("status", "==", st)))));
  const bad = out.filter((r) => r.status === "rejected");
  // Règles pas encore à jour (seul « active » est autorisé) : on garde ce qui est lisible. Toute autre panne (réseau…) fait échouer la lecture.
  if (bad.some((r) => (r.reason && r.reason.code) !== "permission-denied") || bad.length === out.length) throw bad[0].reason;
  bad.forEach((r) => console.warn("[Studio Prism] Lecture partielle des produits (règles Firestore à publier ?) :", r.reason && r.reason.code));
  return out.filter((r) => r.status === "fulfilled").flatMap((r) => rows(r.value)).sort(byOrder);
}

/* Formules actives (nouveau format et anciennes offres). */
export async function listActiveOffers() {
  return rows(await getDocs(query(collection(db, "subscriptions"), where("status", "==", "active")))).sort(byOrder);
}

export async function listActivePrices() {
  return rows(await getDocs(query(collection(db, "prices"), where("status", "==", "active"))));
}

/* Réglage public : le catalogue intégré au site a-t-il été importé dans Firestore ? (document absent = non) */
export async function getCatalogueSettings() {
  const snap = await getDoc(doc(db, "settings", "catalogue"));
  return { builtinImported: !!(snap.exists() && snap.data().builtinImported === true) };
}

/* Licences de l'utilisateur connecté (les règles n'autorisent que where userId == son uid). */
export async function listMyLicenses(uid) {
  return rows(await getDocs(query(collection(db, "licenses"), where("userId", "==", uid))));
}

/* ------------------------------------------------------------------ lecture administrateur */

export async function adminListProducts() {
  return rows(await getDocs(collection(db, "products"))).sort(byOrder);
}

export async function adminListOffers() {
  return rows(await getDocs(collection(db, "subscriptions"))).sort(byOrder);
}

export async function adminListPrices() {
  return rows(await getDocs(collection(db, "prices")));
}

/* Licences d'un lot d'utilisateurs (requêtes `in` de 30 identifiants maximum, limite de Firestore). */
export async function adminLicensesFor(uids) {
  const out = [];
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    if (chunk.length) out.push(...rows(await getDocs(query(collection(db, "licenses"), where("userId", "in", chunk)))));
  }
  return out;
}

/* ------------------------------------------------------------------ produits */

/* Document Firestore d'un produit (tous les champs, valeurs par défaut comprises). */
function productData(input) {
  return {
    name: input.name, slug: input.id, category: input.category, pole: input.pole || "app", stage: input.stage || "concept",
    tagline: input.tagline || "", description: input.description || "", availability: input.availability || "", info: input.info || "",
    platforms: input.platforms || [], logo: input.logo || "", image: input.image || "", url: input.url || "", status: input.status,
    featured: !!input.featured, displayOrder: input.displayOrder, updatedAt: serverTimestamp()
  };
}

/* input : { id, name, category, pole, stage, tagline, description, availability, info, platforms[], logo, image, url, status, featured, displayOrder }.
   status : published / draft / unavailable. Aucune formule ni prix n'est requis pour enregistrer ou publier un produit.
   Renvoie { cascadeFailed } : nombre d'offres / licences dont le nom de produit n'a pas pu être resynchronisé après un renommage. */
export async function saveProduct(input, isNew, previousName) {
  const data = productData(input);
  const ref = doc(db, "products", input.id);
  if (isNew) {
    if ((await getDoc(ref)).exists()) throw fail("app/product-exists");
    await setDoc(ref, { ...data, createdAt: serverTimestamp() });
    return { cascadeFailed: 0 };
  }
  await updateDoc(ref, data);
  let cascadeFailed = 0;
  if (previousName && previousName !== input.name) cascadeFailed = await renameCascade(input.id, input.name);
  return { cascadeFailed };
}

/* Les offres et les licences recopient le nom du produit (les règles vérifient la cohérence) : on les remet à jour. */
async function renameCascade(productId, name) {
  let failed = 0;
  for (const col of ["subscriptions", "licenses"]) {
    try {
      const snap = await getDocs(query(collection(db, col), where("productId", "==", productId)));
      // Lots de 10 au plus : Firestore limite à 20 les accès aux autres documents (get / exists) des règles pour un lot entier.
      for (let i = 0; i < snap.docs.length; i += 10) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 10).forEach((d) => batch.update(d.ref, { productName: name, updatedAt: serverTimestamp() }));
        await batch.commit();
      }
    } catch (e) {
      console.warn("[Studio Prism] Renommage non propagé à", col, e.code || e);
      failed += 1;
    }
  }
  return failed;
}

export async function setProductStatus(id, status) {
  await updateDoc(doc(db, "products", id), { status, updatedAt: serverTimestamp() });
}

/* Refus s'il reste des licences ou des offres rattachées : on masque plutôt que de laisser des références orphelines. */
export async function deleteProduct(id) {
  const used = async (col) => !(await getDocs(query(collection(db, col), where("productId", "==", id), limit(1)))).empty;
  if ((await used("licenses")) || (await used("subscriptions"))) throw fail("app/product-in-use");
  await deleteDoc(doc(db, "products", id));
}

/* ------------------------------------------------------------------ formules (collection subscriptions) et prix (collection prices) */

const planData = (plan) => ({
  productId: plan.productId, productName: plan.productName, name: plan.name, slug: plan.id, description: plan.description || "",
  mode: plan.mode, features: plan.features || [], licenseType: plan.licenseType, status: plan.status, featured: !!plan.featured,
  displayOrder: plan.displayOrder, updatedAt: serverTimestamp()
});

/* Enregistre une formule ET l'ensemble de ses prix dans UN lot (jamais une formule sans ses prix, ni l'inverse).
   plan   : { id, productId, productName, name, description, mode, features[], licenseType, status, featured, displayOrder }
   prices : prix souhaités [{ period, amount, currency, status?, legacyId? }] ; ceux qui existent et ne figurent plus ici sont supprimés
            (mode gratuit / sur devis : liste vide ; achat unique : période « once » ; abonnement : « monthly », « quarterly », « yearly »)
   legacy : null, ou { docs } = anciens documents « une offre = un prix » que cette formule remplace : si l'un a l'identifiant de la
            formule il est converti sur place (identifiant et date de création conservés), les autres sont CONSERVÉS mais désactivés. */
export async function savePlan(plan, prices, isNew, legacy) {
  const ref = doc(db, "subscriptions", plan.id);
  const inPlace = legacy && legacy.docs.find((d) => d.id === plan.id);
  if (isNew && !inPlace) {
    if ((await getDoc(ref)).exists()) throw fail("app/offer-exists");
  }
  if (isNew && !(await getDoc(doc(db, "products", plan.productId))).exists()) throw fail("app/product-missing");
  const existing = isNew ? [] : rows(await getDocs(query(collection(db, "prices"), where("planId", "==", plan.id))));
  const batch = writeBatch(db);
  const data = planData(plan);
  if (inPlace) batch.set(ref, { ...data, createdAt: inPlace.createdAt });             // remplacement complet du document d'origine
  else if (isNew) batch.set(ref, { ...data, createdAt: serverTimestamp() });
  else batch.update(ref, data);
  if (legacy) legacy.docs.filter((d) => d.id !== plan.id).forEach((d) => batch.update(doc(db, "subscriptions", d.id), { status: "inactive", updatedAt: serverTimestamp() }));
  const want = new Map(prices.map((p) => [p.period, p]));
  existing.forEach((e) => { if (!want.has(e.period)) batch.delete(doc(db, "prices", e.id)); });
  want.forEach((p, period) => {
    const id = `${plan.id}_${period}`;
    const pd = { planId: plan.id, productId: plan.productId, period, amount: p.amount, currency: p.currency, status: p.status || "active", updatedAt: serverTimestamp() };
    if (p.legacyId) pd.legacyId = p.legacyId;
    if (existing.some((e) => e.id === id)) batch.update(doc(db, "prices", id), pd);
    else batch.set(doc(db, "prices", id), { ...pd, createdAt: serverTimestamp() });
  });
  await batch.commit();
}

/* Active / désactive une formule. ids : [identifiant] (nouveau format) ou les identifiants des anciennes offres du groupe. */
export async function setPlanStatus(ids, status) {
  for (let i = 0; i < ids.length; i += 10) {
    const batch = writeBatch(db);
    ids.slice(i, i + 10).forEach((id) => batch.update(doc(db, "subscriptions", id), { status, updatedAt: serverTimestamp() }));
    await batch.commit();
  }
}

/* Supprime une formule et ses prix (les licences déjà accordées ne sont pas touchées). ids : documents « subscriptions » à supprimer. */
export async function deletePlan(planId, ids) {
  const prices = rows(await getDocs(query(collection(db, "prices"), where("planId", "==", planId))));
  const refs = prices.map((p) => doc(db, "prices", p.id)).concat(ids.map((id) => doc(db, "subscriptions", id)));
  for (let i = 0; i < refs.length; i += 10) {
    const batch = writeBatch(db);
    refs.slice(i, i + 10).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

/* ------------------------------------------------------------------ licences */

export const licenseId = (userId, productId) => `${userId}_${productId}`;
const ts = (d) => (d ? Timestamp.fromDate(d) : null);

/* input : { userId, productId, productName, licenseType, status, activatedAt: Date, expiresAt: Date|null } */
export async function saveLicense(input, isNew) {
  const id = licenseId(input.userId, input.productId);
  const ref = doc(db, "licenses", id);
  const data = {
    productName: input.productName, licenseType: input.licenseType, status: input.status,
    activatedAt: ts(input.activatedAt), expiresAt: ts(input.expiresAt), updatedAt: serverTimestamp()
  };
  if (isNew) {
    if (!(await getDoc(doc(db, "users", input.userId))).exists()) throw fail("app/user-missing");
    if (!(await getDoc(doc(db, "products", input.productId))).exists()) throw fail("app/product-missing");
    if ((await getDoc(ref)).exists()) throw fail("app/license-exists");
    await setDoc(ref, { userId: input.userId, productId: input.productId, ...data, createdAt: serverTimestamp() });
  } else {
    if (!(await getDoc(ref)).exists()) throw fail("app/license-missing");
    await updateDoc(ref, data);
  }
  return id;
}

export async function setLicenseStatus(id, status) {
  await updateDoc(doc(db, "licenses", id), { status, updatedAt: serverTimestamp() });
}

export async function deleteLicense(id) {
  await deleteDoc(doc(db, "licenses", id));
}

/* ------------------------------------------------------------------ catalogue intégré et formules d'exemple */

/* Copie le catalogue INTÉGRÉ au site (ArchiVision, concepts Prism Game et Prism 3D : js/catalog.js) dans Firestore, puis note dans
   settings/catalogue que c'est fait : le site cesse alors de l'afficher depuis le code (aucun doublon) et chaque produit devient
   modifiable, masquable et supprimable depuis l'administration. Ne remplace JAMAIS un produit existant. Renvoie le nombre créé. */
export async function importBuiltins(items) {
  const have = new Set((await adminListProducts()).map((p) => p.id));
  const todo = items.filter((it) => !have.has(it.id));
  for (let i = 0; i < todo.length; i += 10) {   // 10 créations au plus par lot : 1 accès aux règles chacune, 20 maximum par lot
    const batch = writeBatch(db);
    todo.slice(i, i + 10).forEach((it) => batch.set(doc(db, "products", it.id), { ...productData(it), createdAt: serverTimestamp() }));
    await batch.commit();
  }
  await setDoc(doc(db, "settings", "catalogue"), { builtinImported: true, updatedAt: serverTimestamp() });
  return todo.length;
}

/* Formules d'EXEMPLE d'ArchiVision (Free, Pro mensuel + annuel, Pro Entreprise sur devis), créées seulement si absentes.
   Facultatif : aucun produit n'a besoin de formule. Renvoie le nombre de formules créées. */
export async function seedExamplePlans() {
  const { SEED } = await import("./seed.js");
  const have = new Set((await adminListOffers()).map((o) => o.id));
  let n = 0;
  for (const it of SEED.plans) {
    if (have.has(it.plan.id)) continue;
    await savePlan(it.plan, it.prices, true, null);
    n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ Cloud Functions */

/* MODE DE GESTION DES COMPTES.
 *   false (par défaut) : le site fonctionne SANS serveur, avec le forfait gratuit Firebase Spark. Aucune Cloud Function n'est appelée.
 *                        Disponible : consulter / modifier les comptes, DÉSACTIVER et RÉACTIVER un compte, licences, supprimer SON
 *                        propre compte (particulier). Indisponible (accès privilégié requis) : supprimer le compte de connexion d'un
 *                        AUTRE utilisateur, créer un compte à sa place.
 *   true               : à n'activer qu'APRÈS avoir déployé les Cloud Functions du dossier functions/ (forfait Blaze, voir
 *                        FONCTIONS_SERVEUR.md). Les suppressions et créations de comptes passent alors par le serveur.
 * Le diagnostic (checkAccountsService) peut tester la présence des fonctions dans les deux modes : c'est une simple vérification. */
export const ACCOUNT_SERVER = false;

/* Codes serveur dont le message (en français, sans détail technique) peut être montré tel quel. */
const SAFE = new Set(["invalid-argument", "already-exists", "failed-precondition", "permission-denied", "unauthenticated", "not-found", "internal"]);

/* Appelle une Cloud Function et classe précisément les échecs, pour que le message dise la VRAIE cause :
 *   app/functions-sdk           le composant Firebase Functions n'a pas pu être chargé (réseau, bloqueur de contenu)
 *   app/functions-not-deployed  la fonction n'existe pas dans ce projet / cette région (réponse 404 de Google) : à déployer
 *   app/functions-unreachable   aucune réponse exploitable (réseau, blocage CORS ou droits d'appel, fonction qui démarre)
 *   app/functions-denied        appel refusé par Google avant d'atteindre notre code (droits d'appel du service)
 *   app/server                  la fonction a répondu : son message (en français) est montré tel quel
 * `name` est conservé dans l'erreur : le diagnostic sait de quelle fonction il s'agit. */
async function call(name, payload, probe) {
  // Mode sans serveur : on n'appelle JAMAIS les fonctions (sauf le diagnostic explicite, `probe`).
  if (!ACCOUNT_SERVER && !probe) throw fail("app/server-disabled", { fn: name });
  let fn;
  try {
    fn = (await import("./functions.js")).callable(name);
  } catch (e) {
    throw fail("app/functions-sdk", { fn: name });
  }
  try {
    return (await fn(payload)).data;
  } catch (e) {
    const code = String((e && e.code) || "").replace(/^functions\//, "");
    const msg = String((e && e.message) || "");
    // Un message « lisible » est une phrase écrite par notre fonction ; les messages techniques du SDK ("not-found", "internal"…) n'en sont pas.
    const readable = /\s/.test(msg) && msg.length > 12;
    if (SAFE.has(code) && readable) throw fail("app/server", { message: msg, reason: e.details && e.details.reason, fn: name, details: e.details });
    if (code === "not-found") throw fail("app/functions-not-deployed", { fn: name });
    if (code === "permission-denied" || code === "unauthenticated") throw fail("app/functions-denied", { fn: name });
    throw fail("app/functions-unreachable", { fn: name, sdkCode: code || "unknown" });
  }
}

/* Crée le compte (Authentication + profil) côté serveur. Renvoie { uid, email }. Aucun mot de passe n'est connu de personne. */
export const createUserByAdmin = (payload) => call("adminCreateUser", payload);
/* Supprime le compte côté serveur (Authentication, profil, licences ; entreprise seulement si plus aucun membre). `email` = adresse
   affichée à l'administrateur : le serveur refuse si elle ne correspond plus au compte (liste périmée). Renvoie un résumé explicite. */
export const deleteUserByAdmin = (uid, email) => call("adminDeleteUser", { uid, email: email || "" });
/* Diagnostic du service : { reachable, ... } ; ne lève jamais d'erreur. */
export async function checkAccountsService() {
  const t0 = Date.now();
  try {
    const r = await call("accountsHealth", {}, true);
    return { reachable: true, ms: Date.now() - t0, ...r };
  } catch (e) {
    return { reachable: false, ms: Date.now() - t0, code: (e && e.code) || "app/functions-unreachable", fn: e && e.fn, sdkCode: e && e.sdkCode };
  }
}

/* ------------------------------------------------------------------ sécurité du compte (utilisateur connecté) */

async function reauth(password) {
  const u = auth.currentUser;
  if (!u || !u.email) throw fail("auth/no-current-user");
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
  return u;
}

export async function changePassword(current, next) {
  const u = await reauth(current);
  await updatePassword(u, next);
}

/* Suppression de SON PROPRE compte.
 *  - Avec serveur (ACCOUNT_SERVER) : réauthentifie (connexion de moins de 5 minutes exigée par le serveur), puis le serveur supprime
 *    Authentication + profil + licences (+ entreprise si plus aucun membre).
 *  - Sans serveur (forfait Spark) : réservé aux PARTICULIERS ACTIFS non administrateurs, avec exactement ce que permettent le SDK et
 *    les règles Firestore : 1) réauthentification (prouve le mot de passe et rend la connexion « récente »), 2) suppression du profil
 *    ET de toutes les licences dans UN SEUL lot (les règles n'acceptent la suppression d'une licence que si le profil disparaît dans
 *    le même lot), 3) suppression du compte de connexion avec le SDK. Les comptes Entreprise et administrateur, ou un utilisateur
 *    qui a plus de MAX_SELF_LICENSES licences (limite de 20 accès des règles par lot), sont refusés avec un message qui renvoie vers
 *    un administrateur : app/self-delete-unavailable. */
export const MAX_SELF_LICENSES = 6;
export async function deleteMyAccount(password) {
  const u = await reauth(password);
  if (ACCOUNT_SERVER) {
    await u.getIdToken(true); // jeton renouvelé : auth_time = maintenant
    return call("deleteMyAccount", {});
  }
  const uid = u.uid, ref = doc(db, "users", uid);
  const prof = await getDoc(ref);
  if (prof.exists()) {
    const p = prof.data();
    if (p.role !== "user" || p.status !== "active" || (p.accountKind || "individual") !== "individual") throw fail("app/self-delete-unavailable", { reason: p.role === "admin" ? "admin" : p.accountKind === "company" ? "company" : "status" });
  }
  const lics = await getDocs(query(collection(db, "licenses"), where("userId", "==", uid)));
  if (lics.size > MAX_SELF_LICENSES) throw fail("app/self-delete-unavailable", { reason: "licenses" });
  const batch = writeBatch(db);
  lics.docs.forEach((d) => batch.delete(d.ref));
  if (prof.exists()) batch.delete(ref);
  await batch.commit();            // si cela échoue, RIEN n'est supprimé (lot atomique) et le compte de connexion n'est pas touché
  try { await deleteUser(u); }     // le profil est déjà supprimé : en cas d'échec ici, le message le dit (relancer la suppression est sans risque)
  catch (e) { throw fail("app/self-delete-partial", { cause: e && e.code }); }
  return { ok: true, authDeleted: true, profileDeleted: prof.exists(), licensesDeleted: lics.size, server: false };
}
