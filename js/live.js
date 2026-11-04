/* Studio Prism — administration en temps réel : écoute Firestore (onSnapshot) des collections utiles à l'administrateur.
 * Aucune actualisation manuelle : chaque changement (nouveau compte, demande, devis, clé, licence…) met à jour l'écran.
 * Les règles Firestore font foi : si l'utilisateur n'est pas administrateur actif, les écoutes sont refusées. */
import { db, collection, query, orderBy, limit, onSnapshot } from "./firebase.js";

export const store = { users: [], licenses: [], requests: [], quotes: [], keys: [], plans: [], products: [], ready: {}, errors: {} };
const cbs = new Set(); let unsubs = [], on = false;
const SRC = [
  ["users", () => query(collection(db, "users"), orderBy("createdAt", "desc"), limit(3000)), "uid"],
  ["licenses", () => collection(db, "licenses")],
  ["requests", () => collection(db, "licenseRequests")],
  ["quotes", () => collection(db, "quotes")],
  ["keys", () => query(collection(db, "licenseKeys"), limit(5000))],
  ["plans", () => collection(db, "subscriptions")],
  ["products", () => collection(db, "products")]
];
export function onChange(fn) { cbs.add(fn); return () => cbs.delete(fn); }
export function start() {
  if (on) return; on = true;
  SRC.forEach(([name, q, idKey]) => {
    unsubs.push(onSnapshot(q(), (snap) => {
      store[name] = snap.docs.map((d) => ({ [idKey || "id"]: d.id, ...d.data() }));
      store.ready[name] = true; delete store.errors[name];
      cbs.forEach((f) => { try { f(name); } catch (e) { console.warn("[Studio Prism] live :", e); } });
    }, (err) => {
      store.errors[name] = err.code || String(err); store.ready[name] = true;
      cbs.forEach((f) => { try { f(name); } catch (e) { /* ignore */ } });
    }));
  });
}
export function stop() { unsubs.forEach((u) => u()); unsubs = []; on = false; Object.keys(store.ready).forEach((k) => delete store.ready[k]); }
