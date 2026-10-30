/* Studio Prism — devis (données Firestore).
 *
 *   settings/company        informations légales de Studio Prism (émetteur) : recopiées dans chaque devis au moment où il est émis.
 *   counters/quotes-AAAA    compteur de numérotation de l'année ({ n }) : numéros continus, sans trou, DEV-AAAA-0001, 0002…
 *   quotes/{id}             un devis. Le compte du client (forUid) n'est recopié dans clientUid, qui lui donne l'accès, qu'à l'émission :
 *                           un brouillon reste ainsi invisible pour lui.
 *                           Cycle : draft → sent (numéro définitif, contenu figé) → accepted | refused → paid ; cancelled.
 *
 * Un devis émis n'est jamais supprimé ni réécrit (registre conservé) : on l'annule et on en émet un nouveau. Les règles Firestore
 * (firebase/rules/05-devis.rules) l'imposent côté serveur ; ce module ne fait que préparer les écritures.
 */
import {
  db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where, serverTimestamp, Timestamp
} from "./firebase.js";

const fail = (code) => Object.assign(new Error(code), { code });
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const ms = (t) => (t && t.toMillis ? t.toMillis() : t instanceof Date ? t.getTime() : 0);
export const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

/* Périodes de facturation : libellé et durée de validité des clés délivrées (à partir de leur activation). */
export const PERIODS = {
  monthly: { label: "Mensuel", long: "abonnement mensuel (1 mois)", dur: "1 mois", days: 31 },
  quarterly: { label: "Trimestriel", long: "abonnement trimestriel (3 mois)", dur: "3 mois", days: 92 },
  yearly: { label: "Annuel", long: "abonnement annuel (12 mois)", dur: "12 mois", days: 365 }
};
export const STATUS = {
  draft: ["bd-free", "Brouillon"], sent: ["bd-pend", "Envoyé"], accepted: ["bd-pro", "Accepté · à payer"], refused: ["bd-off", "Refusé"],
  paid: ["bd-ok", "Payé"], cancelled: ["bd-off", "Annulé"], expired: ["bd-off", "Expiré"]
};
/* Statut affiché : un devis envoyé dont la date de validité est passée est « expiré » (il ne peut plus être accepté en ligne). */
export const shownStatus = (q) => (q.status === "sent" && ms(q.validUntil) && ms(q.validUntil) < Date.now() ? "expired" : q.status);

/* ------------------------------------------------------------------ émetteur */
export const COMPANY_FIELDS = ["legalName", "tradeName", "legalForm", "capital", "address", "siret", "rcs", "vatMode", "vatNumber", "vatRate", "email",
  "phone", "website", "iban", "bic", "bank", "paymentTerms", "latePenalty", "validDays", "footer"];
export const DEFAULT_TERMS = "Paiement à réception du devis signé, par virement bancaire, en indiquant le numéro du devis en référence. Les clés de licence sont délivrées dès réception du paiement.";
export const DEFAULT_PENALTY = "En cas de retard de paiement : pénalités au taux annuel de 3 fois le taux d’intérêt légal et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce). Pas d’escompte pour paiement anticipé.";
export async function getCompany() {
  const s = await getDoc(doc(db, "settings", "company"));
  return s.exists() ? s.data() : null;
}
export async function saveCompany(c) {
  const data = { updatedAt: serverTimestamp() };
  COMPANY_FIELDS.forEach((k) => { if (c[k] !== undefined) data[k] = c[k]; });
  await setDoc(doc(db, "settings", "company"), data);
}
/* Ce qui manque pour émettre un devis conforme (mentions obligatoires de l'émetteur). Liste vide = prêt. */
export function companyMissing(c) {
  if (!c) return ["la fiche entière"];
  const m = [];
  if (!c.legalName) m.push("la raison sociale ou le nom");
  if (!c.legalForm) m.push("la forme juridique");
  if (!c.address) m.push("l’adresse");
  if (!/^\d{14}$/.test(String(c.siret || ""))) m.push("le SIRET (14 chiffres)");
  if (c.vatMode === "tva" && !c.vatNumber) m.push("le numéro de TVA intracommunautaire");
  if (!c.email) m.push("l’e-mail de contact");
  return m;
}
const issuerOf = (c) => {
  const o = {}; COMPANY_FIELDS.forEach((k) => { if (c[k] !== undefined && c[k] !== "") o[k] = c[k]; }); return o;
};

/* ------------------------------------------------------------------ calculs */
/* lines : [{ designation, productId, licenseType, period, qty, unitHT }] → totaux (TVA à 0 en franchise en base) */
export function totals(lines, vatMode, vatRate) {
  const ht = round2(lines.reduce((t, l) => t + round2((Number(l.qty) || 0) * (Number(l.unitHT) || 0)), 0));
  const vat = vatMode === "franchise" ? 0 : round2(ht * (Number(vatRate) || 0) / 100);
  return { totalHT: ht, totalVAT: vat, totalTTC: round2(ht + vat) };
}
/* Contenu modifiable d'un devis (brouillon) : tout sauf les champs de numérotation et de suivi. */
function body(q) {
  const lines = (q.lines || []).slice(0, 30).map((l) => ({
    designation: String(l.designation || "").slice(0, 300), productId: String(l.productId || "").slice(0, 60), licenseType: String(l.licenseType || "").slice(0, 40),
    period: l.period || "", qty: Math.max(0, Math.min(10000, parseInt(l.qty, 10) || 0)), unitHT: round2(l.unitHT)
  }));
  const vatMode = q.vatMode === "franchise" ? "franchise" : "tva", vatRate = vatMode === "franchise" ? 0 : Number(q.vatRate) || 0;
  const c = q.client || {};
  return {
    clientUid: "", forUid: String(q.clientUid || q.forUid || "").slice(0, 128), clientEmail: String(q.clientEmail || "").toLowerCase().slice(0, 160),
    orgId: String(q.orgId || "").slice(0, 40), orgName: String(q.orgName || "").slice(0, 120), requestId: String(q.requestId || "").slice(0, 40),
    client: { name: String(c.name || "").slice(0, 160), siret: String(c.siret || "").replace(/\s/g, "").slice(0, 14), address: String(c.address || "").slice(0, 400),
      email: String(c.email || "").toLowerCase().slice(0, 160), contact: String(c.contact || "").slice(0, 160), vatNumber: String(c.vatNumber || "").slice(0, 30) },
    lines, period: q.period || "", durationDays: parseInt(q.durationDays, 10) || null, vatMode, vatRate, ...totals(lines, vatMode, vatRate), currency: "EUR",
    validDays: Math.max(1, Math.min(365, parseInt(q.validDays, 10) || 30)),
    paymentTerms: String(q.paymentTerms || "").slice(0, 2000), notes: String(q.notes || "").slice(0, 2000), updatedAt: serverTimestamp()
  };
}

/* ------------------------------------------------------------------ administration */
export async function adminListQuotes() {
  return rows(await getDocs(collection(db, "quotes"))).sort((a, b) => (b.seq && a.seq && b.year === a.year ? b.seq - a.seq : 0) || ms(b.issuedAt || b.createdAt) - ms(a.issuedAt || a.createdAt));
}
export async function getQuote(id) {
  const s = await getDoc(doc(db, "quotes", id));
  if (!s.exists()) throw fail("app/quote-missing");
  return { id: s.id, ...s.data() };
}
/* Brouillon : création ou mise à jour. Renvoie l'identifiant. */
export async function saveDraft(q, id) {
  const data = { ...body(q), status: "draft" };
  if (!data.lines.length) throw fail("app/quote-empty");
  if (id) { await updateDoc(doc(db, "quotes", id), data); return id; }
  const ref = doc(collection(db, "quotes"));
  await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  return ref.id;
}
export async function deleteDraft(id) { await deleteDoc(doc(db, "quotes", id)); }
/* Émission : numéro définitif (compteur de l'année + 1, même lot), émetteur recopié, date de validité. Contenu figé ensuite.
   Si deux émissions se croisent, la seconde est refusée par les règles : on relit le compteur et on recommence (3 essais). */
export async function issueQuote(q, id) {
  const company = await getCompany(), miss = companyMissing(company);
  if (miss.length) throw Object.assign(fail("app/company-incomplete"), { missing: miss });
  const data = body(q);
  if (!data.lines.length || !data.lines.some((l) => l.qty > 0)) throw fail("app/quote-empty");
  if (!data.client.name || !data.client.address) throw fail("app/quote-client");
  const year = new Date().getFullYear(), cref = doc(db, "counters", "quotes-" + year);
  for (let attempt = 0; attempt < 3; attempt++) {
    const cs = await getDoc(cref), n = cs.exists() ? cs.data().n : 0, seq = n + 1;
    const ref = id ? doc(db, "quotes", id) : doc(collection(db, "quotes"));
    const validUntil = Timestamp.fromDate(new Date(Date.now() + data.validDays * 86400000));
    const full = { ...data, clientUid: data.forUid, status: "sent", year, seq, number: `DEV-${year}-${String(seq).padStart(4, "0")}`, issuer: issuerOf(company), validUntil, issuedAt: serverTimestamp() };
    const b = writeBatch(db);
    if (cs.exists()) b.update(cref, { n: seq, updatedAt: serverTimestamp() }); else b.set(cref, { n: 1, updatedAt: serverTimestamp() });
    if (id) b.update(ref, full); else b.set(ref, { ...full, createdAt: serverTimestamp() });
    try { await b.commit(); return { id: ref.id, number: full.number }; }
    catch (e) { if (attempt === 2 || !/permission|aborted/i.test(String(e && (e.code || e.message)))) throw e; }
  }
}
export async function adminMarkAccepted(id, name) {
  await updateDoc(doc(db, "quotes", id), { status: "accepted", acceptedAt: serverTimestamp(), acceptedBy: { uid: "", name: String(name || "").slice(0, 160), via: "admin" }, updatedAt: serverTimestamp() });
}
export async function adminCancel(id, reason) {
  await updateDoc(doc(db, "quotes", id), { status: "cancelled", cancelledAt: serverTimestamp(), cancelReason: String(reason || "").slice(0, 300), updatedAt: serverTimestamp() });
}
export async function adminMarkPaid(id, ref, keyIds) {
  await updateDoc(doc(db, "quotes", id), { status: "paid", paidAt: serverTimestamp(), paymentRef: String(ref || "").slice(0, 120), keyIds: (keyIds || []).slice(0, 500), updatedAt: serverTimestamp() });
}

/* ------------------------------------------------------------------ client */
export async function myQuotes(uid) {
  return rows(await getDocs(query(collection(db, "quotes"), where("clientUid", "==", uid)))).sort((a, b) => ms(b.issuedAt) - ms(a.issuedAt));
}
/* Bon pour accord en ligne : nom de la personne qui accepte, horodatage serveur. */
export async function acceptQuote(id, user, name) {
  await updateDoc(doc(db, "quotes", id), { status: "accepted", acceptedAt: serverTimestamp(),
    acceptedBy: { uid: user.uid, email: String(user.email || "").toLowerCase(), name: String(name || "").trim().slice(0, 160), via: "online" }, updatedAt: serverTimestamp() });
}
export async function refuseQuote(id) {
  await updateDoc(doc(db, "quotes", id), { status: "refused", refusedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

/* ------------------------------------------------------------------ registre (export CSV, séparateur « ; » pour Excel) */
export function registerCsv(list) {
  const f = (t) => (ms(t) ? new Date(ms(t)).toLocaleDateString("fr-FR") : "");
  const n = (x) => String(round2(x)).replace(".", ",");
  const head = ["Numéro", "Date d’émission", "Client", "SIRET client", "Montant HT", "TVA", "Montant TTC", "Statut", "Valide jusqu’au", "Accepté le", "Accepté par", "Payé le", "Référence de paiement", "Annulé le", "Motif d’annulation"];
  const lines = list.filter((q) => q.number).map((q) => [q.number, f(q.issuedAt), q.client?.name, q.client?.siret, n(q.totalHT), n(q.totalVAT), n(q.totalTTC), (STATUS[shownStatus(q)] || [, q.status])[1],
    f(q.validUntil), f(q.acceptedAt), q.acceptedBy?.name, f(q.paidAt), q.paymentRef, f(q.cancelledAt), q.cancelReason]);
  const cell = (v) => { const s = String(v == null ? "" : v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [head, ...lines].map((r) => r.map(cell).join(";")).join("\r\n");
}
