/* Studio Prism — administration EN DIRECT (onSnapshot Firestore).
 *
 * Un seul jeu d'écouteurs pour toute l'administration, ouvert à la première page d'administration et refermé à la déconnexion :
 *   users            tous les comptes (liste « Comptes », tableau de bord, demandes en attente, comptes commerciaux)
 *   licenses         toutes les licences (abonnements pris, logiciels, expirations)
 *   presence         qui est connecté maintenant, et dans quel logiciel (shared/prism-status.js)
 *   licenseRequests  demandes en attente (inscriptions d'entreprise, ajouts de personnes)
 *   quotes           devis (acceptés à encaisser, brouillons)
 * Chaque changement est diffusé par l'évènement window « sp-live » (detail : { kind, added[], changed[] }) : les onglets se
 * redessinent seuls et une notification signale les nouveautés. Lecture seule : les règles Firestore réservent ces listes aux
 * administrateurs actifs. */
import { db, collection, query, where, onSnapshot } from "./firebase.js";

export const S = { users: null, licenses: null, presence: null, requests: null, quotes: null, at: 0, errors: {} };
let subs = [];
const emit = (kind, added, changed) => { S.at = Date.now(); window.dispatchEvent(new CustomEvent("sp-live", { detail: { kind, added: added || [], changed: changed || [] } })); };

function listen(kind, q, map) {
  let first = true;
  const un = onSnapshot(q, (snap) => {
    S[kind] = snap.docs.map(map);
    const added = [], changed = [];
    if (!first) snap.docChanges().forEach((c) => { const row = map(c.doc); if (c.type === "added") added.push(row); else if (c.type === "modified") changed.push(row); });
    first = false; delete S.errors[kind];
    emit(kind, added, changed);
  }, (e) => { console.warn(`[Studio Prism] Direct (${kind}) :`, e.code || e); S.errors[kind] = e.code || "unknown"; if (!S[kind]) S[kind] = []; emit(kind); });
  subs.push(un);
}

export function start() {
  if (subs.length) return S;
  const row = (d) => ({ id: d.id, ...d.data() });
  listen("users", collection(db, "users"), (d) => ({ uid: d.id, ...d.data() }));
  listen("licenses", collection(db, "licenses"), row);
  listen("presence", collection(db, "presence"), row);
  listen("requests", query(collection(db, "licenseRequests"), where("status", "==", "pending")), row);
  listen("quotes", collection(db, "quotes"), row);
  return S;
}
export function stop() { subs.forEach((u) => { try { u(); } catch (e) { /* déjà fermé */ } }); subs = []; Object.assign(S, { users: null, licenses: null, presence: null, requests: null, quotes: null, errors: {} }); }
export const running = () => subs.length > 0;
