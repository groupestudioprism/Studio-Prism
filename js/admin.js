/* Studio Prism — administration des comptes (lecture / modification des profils Firestore).
 *
 * ATTENTION : rien ici ne protège quoi que ce soit. Ces appels ne réussissent que si l'utilisateur connecté a
 * role = "admin" dans Firestore : c'est le rôle des règles de sécurité (firebase/firestore.rules), appliquées par
 * les serveurs Google. Un utilisateur qui modifierait ce fichier dans son navigateur obtiendrait « permission-denied ».
 */
import {
  db, collection, doc, query, orderBy, limit, startAfter, where, getDocs, getCountFromServer,
  updateDoc, serverTimestamp
} from "./firebase.js";

export const PAGE_SIZE = 50;

/* Utilisateurs, du plus récent au plus ancien, par pages de PAGE_SIZE. `cursor` = dernier document de la page précédente. */
export async function listUsers(cursor = null) {
  const parts = [collection(db, "users"), orderBy("createdAt", "desc")];
  if (cursor) parts.push(startAfter(cursor));
  parts.push(limit(PAGE_SIZE));
  const snap = await getDocs(query(...parts));
  return {
    users: snap.docs.map((d) => ({ uid: d.id, ...d.data() })),
    cursor: snap.docs.length ? snap.docs[snap.docs.length - 1] : cursor,
    hasMore: snap.docs.length === PAGE_SIZE
  };
}

/* Compteurs calculés côté serveur (aucune lecture de document) : restent exacts même avec beaucoup d'utilisateurs. */
export async function countUsers() {
  const count = (...constraints) =>
    getCountFromServer(query(collection(db, "users"), ...constraints)).then((s) => s.data().count);
  const [total, free, pro, proEntreprise, admins] = await Promise.all([
    count(),
    count(where("subscription", "==", "free")),
    count(where("subscription", "==", "pro")),
    count(where("subscription", "==", "pro_entreprise")),
    count(where("role", "==", "admin"))
  ]);
  return { total, free, pro, proEntreprise, admins };
}

/* Nombre d'administrateurs ACTIFS (role = admin ET status = active), calculé côté serveur Google. Sert à refuser la désactivation ou
   la rétrogradation du dernier administrateur actif (les règles empêchent déjà qu'un administrateur modifie son propre compte). */
export async function countActiveAdmins() {
  const s = await getCountFromServer(query(collection(db, "users"), where("role", "==", "admin"), where("status", "==", "active")));
  return s.data().count;
}

/* patch ⊂ { subscription, role, status }. Les règles refusent tout autre champ et toute valeur hors liste. */
export async function updateUser(user, patch) {
  const data = {};
  ["subscription", "role", "status"].forEach((k) => { if (k in patch) data[k] = patch[k]; });
  await updateDoc(doc(db, "users", user.uid), { ...data, updatedAt: serverTimestamp() });
  // Cohérence : l'abonnement d'une entreprise suit celui de son responsable (meilleur effort, ne bloque pas la mise à jour).
  if (data.subscription && user.companyId) {
    try {
      await updateDoc(doc(db, "companies", user.companyId), { subscription: data.subscription, updatedAt: serverTimestamp() });
    } catch (e) {
      console.warn("[Studio Prism] Abonnement de l'entreprise non synchronisé :", e.code || e);
    }
  }
}
