/* Studio Prism — code PIN du compte (le même que dans ARCHIPLAN et ARCHITRAFIC).
 *
 * userSecrets/{uid} : { pinHash, pinSalt, pinIter, updatedAt } — PIN de 6 chiffres haché PBKDF2-SHA-256 (jamais en clair),
 * lisible par son seul titulaire (règles Firestore). Même format que les applications : un code choisi ici ouvre aussi les apps,
 * et inversement.
 */
import { db, doc, getDoc, setDoc, serverTimestamp } from "./firebase.js";

const enc = new TextEncoder();
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const ITER = 200000;

async function pbkdf2(secret, saltB64, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(saltB64), iterations: iter }, key, 256));
}

export async function getPin(uid) {
  const s = await getDoc(doc(db, "userSecrets", uid));
  return s.exists() ? s.data() : null;
}
export async function setPin(uid, pin) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  await setDoc(doc(db, "userSecrets", uid), { pinHash: await pbkdf2(pin, salt, ITER), pinSalt: salt, pinIter: ITER, updatedAt: serverTimestamp() });
}
export async function checkPin(rec, pin) {
  return !!rec && (await pbkdf2(pin, rec.pinSalt, rec.pinIter || ITER)) === rec.pinHash;
}
