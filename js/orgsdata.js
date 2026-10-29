/* Studio Prism — établissements / entreprises clientes et clés de licence (données Firestore).
 *
 *   organizations/{id}   fiche d'un établissement ou d'une entreprise cliente (nom, type, SIRET, contact, nombre de postes).
 *                        Les comptes rattachés portent users/{uid}.orgId ; leurs licences portent licenses/{…}.orgId.
 *   licenseKeys/{hash}   clé de licence « façon Windows » (ex. ARCH-7K2F-9QXM-4TNP). L'identifiant du document est le SHA-256
 *                        de la clé normalisée : connaître la clé est le seul moyen de lire sa fiche. La clé donne une licence
 *                        (produit + type + durée) et, si elle appartient à un établissement, rattache le compte à cet établissement.
 *
 * Écritures : l'administrateur crée / modifie / révoque ; l'utilisateur ACTIVE une clé disponible pour SON compte (un seul lot :
 * clé « activée », licence créée, profil rattaché). Les règles Firestore vérifient la cohérence de ce lot côté serveur.
 */
import {
  db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where, serverTimestamp, Timestamp
} from "./firebase.js";

const fail = (code) => Object.assign(new Error(code), { code });
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

/* ------------------------------------------------------------------ clés */
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";            // sans I, O, 0, 1 (confusions à la saisie)
export const normalizeKey = (raw) => String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const formatKey = (n) => (n.match(/.{1,4}/g) || []).join("-");
export const keyOk = (raw) => { const n = normalizeKey(raw); return n.length >= 12 && n.length <= 40; };
export async function keyHash(raw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeKey(raw)));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
/* Clé aléatoire : préfixe produit (4 lettres) + 12 caractères (32^12 ≈ 10^18 combinaisons) */
export function generateKey(prefix) {
  const p = normalizeKey(prefix || "SP").slice(0, 4).padEnd(4, "X");
  const r = crypto.getRandomValues(new Uint8Array(12));
  return formatKey(p + Array.from(r, (x) => ALPHA[x % 32]).join(""));
}

/* ------------------------------------------------------------------ packs (une clé pour plusieurs applications)
 * Clé pack : PACK-XXXX-XXXX-XXXX. Sa fiche est la clé de la PREMIÈRE application ; son libellé commence par
 * « Pack app1+app2+… » (liste des applications). La clé de chaque autre application est DÉRIVÉE de la clé pack
 * (SHA-256 de « CLÉPACK|identifiant ») : seul le porteur de la clé pack peut la recalculer. Chaque fiche reste une
 * clé ordinaire (un produit), donc les règles Firestore ne changent pas. Même calcul dans les applications. */
export const isPackKey = (raw) => normalizeKey(raw).startsWith("PACK");
export const packApps = (label) => { const m = /^Pack ([a-z0-9_+-]+)/.exec(String(label || "")); return m ? m[1].split("+").filter(Boolean) : []; };
export async function derivePackKey(packRaw, productId) {
  const buf = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeKey(packRaw) + "|" + productId)));
  return formatKey("PACK" + Array.from(buf.slice(0, 12), (x) => ALPHA[x % 32]).join(""));
}
/* n packs ; apps : [{id, name}] (2 au moins) ; spec : comme adminCreateKeys (sans produit) → [{key, apps:[{productName, key}]}] */
export async function adminCreatePacks(n, apps, spec) {
  const out = [], ids = apps.map((a) => a.id).join("+"), label = (`Pack ${ids}` + (spec.label ? " · " + spec.label : "")).slice(0, 120);
  for (let i = 0; i < n; i++) {
    const K = generateKey("PACK"), row = { key: K, apps: [] };
    for (const [j, a] of apps.entries()) {
      const k = j === 0 ? K : await derivePackKey(K, a.id);
      await adminCreateKeys([k], { ...spec, productId: a.id, productName: a.name, label: j === 0 ? label : (`Pack ${K}` + (spec.label ? " · " + spec.label : "")).slice(0, 120) });
      row.apps.push({ productId: a.id, productName: a.name, key: k });
    }
    out.push(row);
  }
  return out;
}

/* ------------------------------------------------------------------ administration : établissements */
export const ORG_KINDS = { entreprise: "Entreprise", etablissement: "Établissement scolaire", ecole: "École / formation", collectivite: "Collectivité", association: "Association", autre: "Autre" };

export async function adminListOrgs() {
  return rows(await getDocs(collection(db, "organizations"))).sort((a, b) => String(a.name).localeCompare(String(b.name), "fr"));
}
export async function saveOrg(o, id) {
  const ref = id ? doc(db, "organizations", id) : doc(collection(db, "organizations"));
  const data = {
    name: o.name, kind: o.kind, siret: o.siret || "", email: o.email || "", phone: o.phone || "", address: o.address || "",
    contactName: o.contactName || "", seats: o.seats | 0, notes: o.notes || "", status: o.status || "active", updatedAt: serverTimestamp()
  };
  if (!id) data.createdAt = serverTimestamp();
  await (id ? updateDoc(ref, data) : setDoc(ref, data));
  return ref.id;
}
/* Suppression complète : comptes détachés, licences de l'établissement supprimées, clés supprimées, puis la fiche. */
export async function deleteOrg(id) {
  const [keys, users, lics] = await Promise.all([
    getDocs(query(collection(db, "licenseKeys"), where("orgId", "==", id))),
    getDocs(query(collection(db, "users"), where("orgId", "==", id))),
    getDocs(query(collection(db, "licenses"), where("orgId", "==", id)))]);
  const ops = [];
  users.docs.forEach((d) => ops.push((b) => b.update(d.ref, { orgId: "", orgName: "", orgRole: "", orgClass: "", updatedAt: serverTimestamp() })));
  lics.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
  keys.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
  for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
  await deleteDoc(doc(db, "organizations", id));
  return { users: users.size, licenses: lics.size, keys: keys.size };
}
export async function adminOrgMembers(id) { return rows(await getDocs(query(collection(db, "users"), where("orgId", "==", id)))).map((u) => ({ uid: u.id, ...u })); }
/* Comptes Entreprise en attente de validation (inscription sur le site : users/{uid}.status == "pending"). */
export async function adminListPending() {
  return (await getDocs(query(collection(db, "users"), where("status", "==", "pending")))).docs.map((d) => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
}
/* Validation : le compte devient actif et, si une fiche entreprise est donnée, il y est rattaché (même écriture) ; role « responsable »
   pour la personne qui a inscrit l'entreprise (elle voit les clés et les comptes de son entreprise et demande l'ajout de personnes). */
export async function adminApprove(uid, org, role) {
  await updateDoc(doc(db, "users", uid), { status: "active", orgId: org ? org.id : "", orgName: org ? org.name : "", orgRole: org ? role || "" : "", orgClass: "", updatedAt: serverTimestamp() });
}
export async function adminSetResponsable(uid, on) { await updateDoc(doc(db, "users", uid), { orgRole: on ? "responsable" : "", updatedAt: serverTimestamp() }); }

/* ------------------------------------------------------------------ demandes de licences d'entreprise (licenseRequests) */
export async function adminListRequests() {
  return rows(await getDocs(query(collection(db, "licenseRequests"), where("status", "==", "pending"))))
    .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
}
export async function adminCloseRequest(id, status, orgId) {
  await updateDoc(doc(db, "licenseRequests", id), { status, ...(orgId ? { orgId } : {}), updatedAt: serverTimestamp() });
}
/* Responsable d'entreprise : ses clés, ses comptes, ses demandes ; demande d'ajout de personnes. */
export const orgKeys = async (orgId) => rows(await getDocs(query(collection(db, "licenseKeys"), where("orgId", "==", orgId))));
export const orgMembers = async (orgId) => (await getDocs(query(collection(db, "users"), where("orgId", "==", orgId)))).docs.map((d) => ({ uid: d.id, ...d.data() }));
export const myRequests = async (uid) => rows(await getDocs(query(collection(db, "licenseRequests"), where("requesterUid", "==", uid))))
  .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
export async function requestMembers(user, profile, emails, item) {
  await setDoc(doc(collection(db, "licenseRequests")), {
    kind: "member", requesterUid: user.uid, requesterEmail: String(user.email || "").toLowerCase(), requesterName: `${profile.firstName || ""} ${profile.lastName || ""}`.trim().slice(0, 160),
    orgId: profile.orgId, companyName: profile.orgName || profile.companyName || "", items: [item], emails,
    status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
}
/* Particulier → Entreprise : fiche entreprise, profil « en attente » et demande de licences, dans un seul lot. */
export async function requestCompanyConversion(user, profile, c) {
  const b = writeBatch(db), cref = doc(collection(db, "companies"));
  const co = { name: c.name, email: c.email, ownerUid: user.uid, userRange: c.userRange, userLimit: c.userLimit, subscription: "free", createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  if (c.phone) co.phone = c.phone; if (c.website) co.website = c.website; if (c.siret) co.siret = c.siret; if (c.repRole) co.repRole = c.repRole;
  b.set(cref, co);
  const up = { accountKind: "company", status: "pending", companyId: cref.id, companyName: c.name, companyEmail: c.email, companyUserRange: c.userRange, companyUserLimit: c.userLimit, updatedAt: serverTimestamp() };
  if (c.jobTitle) up.jobTitle = c.jobTitle;
  b.update(doc(db, "users", user.uid), up);
  b.set(doc(collection(db, "licenseRequests")), { kind: "signup", requesterUid: user.uid, requesterEmail: String(user.email || "").toLowerCase(), requesterName: `${profile.firstName || ""} ${profile.lastName || ""}`.trim().slice(0, 160),
    companyId: cref.id, companyName: c.name, orgId: "", items: c.items, repRole: c.repRole, siret: c.siret, status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await b.commit();
}
export async function adminFindUserByEmail(email) {
  const raw = String(email).trim(), low = raw.toLowerCase();
  let s = await getDocs(query(collection(db, "users"), where("email", "==", low)));
  if (s.empty && raw !== low) s = await getDocs(query(collection(db, "users"), where("email", "==", raw)));
  if (!s.empty) return { uid: s.docs[0].id, ...s.docs[0].data() };
  // adresse enregistrée avec des majuscules (Firestore ne compare pas sans la casse) : recherche dans la liste des comptes (administrateur)
  const all = await getDocs(collection(db, "users")), d = all.docs.find((x) => String(x.data().email || "").toLowerCase() === low);
  return d ? { uid: d.id, ...d.data() } : null;
}
export async function adminSetUserOrg(uid, org, role, classe) {
  await updateDoc(doc(db, "users", uid), { orgId: org ? org.id : "", orgName: org ? org.name : "", orgRole: org ? role || "" : "", orgClass: org ? classe || "" : "", updatedAt: serverTimestamp() });
}

/* ------------------------------------------------------------------ administration : clés */
export async function adminListKeys(orgId) {
  const q = orgId == null ? collection(db, "licenseKeys") : query(collection(db, "licenseKeys"), where("orgId", "==", orgId));
  return rows(await getDocs(q)).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}
/* keys : liste de clés en clair (générées ou saisies) ; spec : produit, type, durée ou date de fin, établissement, libellé */
export async function adminCreateKeys(keys, spec) {
  const out = [];
  for (let i = 0; i < keys.length; i += 400) {
    const b = writeBatch(db);
    for (const k of keys.slice(i, i + 400)) {
      const id = await keyHash(k), ref = doc(db, "licenseKeys", id);
      if ((await getDoc(ref)).exists()) throw Object.assign(fail("app/key-exists"), { key: k });
      b.set(ref, {
        key: formatKey(normalizeKey(k)), productId: spec.productId, productName: spec.productName, licenseType: spec.licenseType,
        durationDays: spec.durationDays || null, expiresAt: spec.expiresAt ? Timestamp.fromDate(spec.expiresAt) : null,
        orgId: spec.org ? spec.org.id : "", orgName: spec.org ? spec.org.name : "", label: spec.label || "", role: spec.role || "", classe: spec.classe || "", status: "available",
        redeemedBy: "", redeemedEmail: "", redeemedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      out.push({ id, key: formatKey(normalizeKey(k)) });
    }
    await b.commit();
  }
  return out;
}
export async function adminSetKeyStatus(id, status) { await updateDoc(doc(db, "licenseKeys", id), { status, updatedAt: serverTimestamp() }); }
export async function adminSetKeyLabel(id, label, role, classe) { await updateDoc(doc(db, "licenseKeys", id), { label: String(label || "").slice(0, 120), role: role || "", classe: String(classe || "").slice(0, 60), updatedAt: serverTimestamp() }); }
export async function adminDeleteKey(id) { await deleteDoc(doc(db, "licenseKeys", id)); }
export const ROLES = { eleve: "Élève / étudiant", enseignant: "Enseignant" };

/* ------------------------------------------------------------------ utilisateur : activer une clé */
export async function peekKey(raw) {
  if (!keyOk(raw)) throw fail("app/key-format");
  const s = await getDoc(doc(db, "licenseKeys", await keyHash(raw)));
  if (!s.exists()) throw fail("app/key-unknown");
  return { id: s.id, ...s.data() };
}
/* Activation d'une clé, pack compris : → [{productName, licenseType, …, ok, code}] (première ligne : la clé saisie) */
export async function redeemAny(raw, user) {
  const first = await redeemKey(raw, user).then((k) => ({ ...k, ok: true }), (e) => { if (!isPackKey(raw) || e.code === "app/key-unknown" || e.code === "app/key-format") throw e; return null; });
  const head = first || await peekKey(raw);
  const apps = packApps(head.label);
  if (!apps.length) { if (first) return [first]; return redeemKey(raw, user).then((k) => [{ ...k, ok: true }]); }
  const res = [first || { ...head, ok: false, code: head.redeemedBy === user.uid ? "app/key-mine" : "app/key-used" }];
  for (const pid of apps.slice(1)) {
    try { const d = await derivePackKey(raw, pid); res.push({ ...(await redeemKey(d, user)), ok: true }); }
    catch (e) { res.push({ productId: pid, productName: pid, ok: false, code: e.code || "app/unknown" }); }
  }
  if (!res.some((r) => r.ok)) throw Object.assign(new Error("pack"), { code: res[0].code || "app/key-used" });
  return res;
}
export async function redeemKey(raw, user) {
  const k = await peekKey(raw);
  if (k.status === "redeemed") throw fail(k.redeemedBy === user.uid ? "app/key-mine" : "app/key-used");
  if (k.status !== "available") throw fail("app/key-revoked");
  if (k.expiresAt && k.expiresAt.toMillis() < Date.now()) throw fail("app/key-expired");
  const lid = `${user.uid}_${k.productId}`, lref = doc(db, "licenses", lid);
  let prev = null; try { const ls = await getDoc(lref); prev = ls.exists() ? ls.data() : null; } catch (e) { /* aucune licence lisible */ }
  const expiresAt = k.expiresAt ? k.expiresAt : k.durationDays ? Timestamp.fromMillis(Date.now() + k.durationDays * 864e5) : null;
  const b = writeBatch(db);
  b.update(doc(db, "licenseKeys", k.id), { status: "redeemed", redeemedBy: user.uid, redeemedEmail: String(user.email || "").toLowerCase(), redeemedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  b.set(lref, {
    userId: user.uid, productId: k.productId, productName: k.productName, licenseType: k.licenseType, status: "active",
    activatedAt: serverTimestamp(), expiresAt, keyId: k.id, orgId: k.orgId || "",
    createdAt: prev && prev.createdAt ? prev.createdAt : serverTimestamp(), updatedAt: serverTimestamp()
  });
  if (k.orgId) b.update(doc(db, "users", user.uid), { orgId: k.orgId, orgName: k.orgName, orgKeyId: k.id, orgRole: k.role || "", orgClass: k.classe || "", updatedAt: serverTimestamp() });
  await b.commit();
  return k;
}
