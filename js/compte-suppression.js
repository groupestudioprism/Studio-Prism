/* Studio Prism — suppression de SON compte, commune au site, à ARCHIPLAN et à Archi Vision.
 *
 * Parcours : 1) l'utilisateur connecté demande la suppression ; 2) il confirme avec le MOT DE PASSE de son compte
 * (réauthentification Firebase : connexion récente, exigée pour supprimer un compte ; compte Google : fenêtre Google) ;
 * 3) le code PIN du compte est demandé (userSecrets/{uid}, haché) ;
 * 4) suppression : projets ARCHIPLAN (et leurs partages), dossiers et dossiers partagés, accès par lien, bibliothèque personnelle,
 * fiche client, code PIN, puis profil, licences et compteur de stockage dans un seul lot (exigence des règles), puis le compte de connexion.
 * Sans serveur (forfait Spark) : réservé aux comptes Particulier actifs non administrateurs, comme « Mon compte » du site.
 * Aucune donnée n'est envoyée ailleurs que dans le projet Firebase de Studio Prism. */
import {
  auth, db, doc, getDoc, getDocs, collection, query, where, writeBatch, onAuthStateChanged, deleteUser, signOut
} from "./firebase.js";
import { reauthenticateWithCredential, reauthenticateWithPopup, EmailAuthProvider, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

auth.languageCode = "fr";
const PAGE = location.origin + location.pathname;
const SITE = new URL("./", location.href).href;
const ARCHIPLAN = new URL("../ArchiPlan/", SITE).href;
const FROM = new URLSearchParams(location.search).get("from") === "archiplan" ? "archiplan" : (sessionStorage.getItem("sp.del.from") || "site");
sessionStorage.setItem("sp.del.from", FROM);
const MAX_LICENSES = 6, PIN_TRIES = 5;

const box = document.getElementById("box");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const back = () => FROM === "archiplan" ? `<a class="btn b4" href="${ARCHIPLAN}">Retour à ARCHIPLAN</a>` : `<a class="btn b4" href="${SITE}#/compte">Retour à mon compte</a>`;
const steps = (i) => `<ol class="steps" aria-label="Étape ${i + 1} sur 3">${["Demande", "Mot de passe", "Code PIN"].map((n, k) => `<li class="${k < i ? "done" : k === i ? "cur" : ""}"><i>${k < i ? "✓" : k + 1}</i>${n}</li>`).join("")}</ol>`;
const render = (h) => { box.innerHTML = h; const f = box.querySelector("input"); if (f) setTimeout(() => f.focus(), 50); };
const loading = (t) => render(`<div class="center"><div class="spin" aria-hidden="true"></div><p class="mut">${esc(t)}</p></div>`);
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: "app/timeout" }), ms))]);
const ERR = {
  "auth/wrong-password": "Mot de passe incorrect.",
  "auth/invalid-credential": "Mot de passe incorrect.",
  "auth/invalid-login-credentials": "Mot de passe incorrect.",
  "auth/user-mismatch": "Ce n'est pas le compte connecté. Choisissez le même compte Google.",
  "auth/popup-closed-by-user": "Fenêtre Google fermée avant la fin. Réessayez.",
  "auth/popup-blocked": "Le navigateur a bloqué la fenêtre Google : autorisez les fenêtres pour ce site.",
  "auth/too-many-requests": "Trop de tentatives. Patientez quelques minutes, puis réessayez.",
  "auth/network-request-failed": "Connexion impossible. Vérifiez votre réseau.",
  "permission-denied": "Opération refusée par la sécurité de Studio Prism.",
  "app/timeout": "Le service met trop de temps à répondre. Réessayez.",
};
const errMsg = (e) => ERR[e && e.code] || "Une erreur est survenue. Réessayez dans un instant.";

const enc = new TextEncoder();
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function pbkdf2(secret, saltB64, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(saltB64), iterations: iter }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function waitUser() {
  return withTimeout(new Promise((res) => { const un = onAuthStateChanged(auth, (u) => { un(); res(u); }); }), 12000);
}

/* Le compte peut-il être supprimé sans serveur ? (mêmes conditions que « Mon compte » sur le site) */
async function eligibility(u) {
  const prof = await getDoc(doc(db, "users", u.uid));
  const p = prof.exists() ? prof.data() : null;
  if (p && p.role === "admin") return { ok: false, why: "Un compte administrateur ne peut pas être supprimé depuis le site : un autre administrateur doit d'abord lui retirer ce rôle." };
  if (p && (p.accountKind || "individual") === "company") return { ok: false, why: "Un compte Entreprise ne peut pas être supprimé depuis le site : son entreprise et ses comptes rattachés demandent un traitement par Studio Prism." };
  if (p && p.status !== "active") return { ok: false, why: "Ce compte est désactivé. Contactez Studio Prism pour demander sa suppression." };
  const lics = await getDocs(query(collection(db, "licenses"), where("userId", "==", u.uid)));
  if (lics.size > MAX_LICENSES) return { ok: false, why: "Ce compte a trop de licences pour être supprimé depuis le site. Contactez Studio Prism." };
  let projects = 0;
  try { projects = (await getDocs(query(collection(db, "apProjects"), where("ownerUid", "==", u.uid)))).size; } catch (e) { /* règles ARCHIPLAN absentes : 0 */ }
  return { ok: true, profile: p, licenses: lics.size, projects };
}

/* ---------- 1. Demande ---------- */
async function stepAsk(u) {
  loading("Vérification de votre compte…");
  let el;
  try { el = await withTimeout(eligibility(u), 15000); } catch (e) { return render(`<h1>Supprimer mon compte</h1><div class="note err">${esc(errMsg(e))}</div><div class="row">${back()}</div>`); }
  if (!el.ok) return render(`<h1>Supprimer mon compte</h1><div class="note warn">${esc(el.why)}</div><p class="mut">Écrivez-nous depuis la page Contact du site : nous traiterons votre demande.</p><div class="row"><a class="btn b1" href="${SITE}#/contact">Contacter Studio Prism</a>${back()}</div>`);
  const hasPw = (u.providerData || []).some((p) => p.providerId === "password") || !(u.providerData || []).some((p) => p.providerId === "google.com");
  render(`${steps(0)}<h1>Supprimer mon compte Studio Prism</h1>
    <p>Compte : <b>${esc(u.email)}</b></p>
    <p class="mut">Ce compte sert au site Studio Prism, à ARCHIPLAN et à Archi Vision. Seront supprimés définitivement :</p>
    <ul><li>votre compte de connexion et votre profil ;</li><li>vos licences${el.licenses ? ` (${el.licenses})` : ""} et votre fiche client ;</li>
    <li>votre code PIN ;</li><li>vos projets ARCHIPLAN${el.projects ? ` (${el.projects})` : ""}, vos dossiers et vos partages : les personnes avec qui vous les partagez n'y auront plus accès.</li></ul>
    <div class="row"><button class="btn bd" id="go">Continuer</button>${back()}</div>`);
  document.getElementById("go").onclick = () => stepPw(u, hasPw);
}

/* ---------- 2. Mot de passe (réauthentification) ---------- */
function stepPw(u, hasPw) {
  render(`${steps(1)}<h1>Confirmez qu'il s'agit bien de vous</h1><p>Compte : <b>${esc(u.email)}</b></p>
    ${hasPw ? `<form id="f"><label for="pw">Mot de passe de votre compte Studio Prism</label><input id="pw" type="password" autocomplete="current-password"><p class="fe" id="err" role="alert"></p>
      <div class="row"><button class="btn bd" type="submit">Continuer</button><button class="btn b4" type="button" id="cancel">Annuler</button></div></form>
      <p class="mut" style="margin-top:12px">Mot de passe oublié ? <a href="${SITE}#/compte/connexion">Réinitialisez-le depuis la page de connexion</a>, puis recommencez.</p>`
    : `<p class="mut">Votre compte utilise la connexion Google : confirmez avec votre compte Google ${esc(u.email)}.</p><p class="fe" id="err" role="alert"></p>
      <div class="row"><button class="btn bd" id="g">Confirmer avec Google</button><button class="btn b4" type="button" id="cancel">Annuler</button></div>`}
    <p class="mut" style="margin-top:12px">Le code PIN de votre compte vous sera demandé ensuite.</p>`);
  document.getElementById("cancel").onclick = cancel;
  const fail = (b, label, x) => { b.disabled = false; b.textContent = label; document.getElementById("err").textContent = errMsg(x); };
  if (hasPw) document.getElementById("f").onsubmit = async (e) => {
    e.preventDefault(); const pw = document.getElementById("pw").value, b = box.querySelector("#f .bd");
    if (!pw) { document.getElementById("err").textContent = "Saisissez votre mot de passe."; return; }
    b.disabled = true; b.textContent = "Vérification…";
    try { await withTimeout(reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pw)), 20000); stepPin(u); }
    catch (x) { fail(b, "Continuer", x); document.getElementById("pw").value = ""; }
  };
  else document.getElementById("g").onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = "Connexion Google…";
    try { await reauthenticateWithPopup(u, new GoogleAuthProvider()); stepPin(u); } catch (x) { fail(b, "Confirmer avec Google", x); }
  };
}

/* ---------- 3. Code PIN ---------- */
async function stepPin(u) {
  loading("Chargement…");
  let sec = null;
  try { const s = await withTimeout(getDoc(doc(db, "userSecrets", u.uid)), 15000); sec = s.exists() ? s.data() : null; }
  catch (e) { if (e && e.code !== "permission-denied") return render(`<h1>Code PIN</h1><div class="note err">${esc(errMsg(e))}</div><div class="row"><a class="btn b1" href="${PAGE}">Recommencer</a></div>`); }
  let el; try { el = await eligibility(u); } catch (e) { el = { ok: false, why: errMsg(e) }; }
  if (!el.ok) return render(`<h1>Supprimer mon compte</h1><div class="note warn">${esc(el.why)}</div><div class="row">${back()}</div>`);
  if (!sec) {
    render(`${steps(2)}<h1>Dernière confirmation</h1><p class="mut">Aucun code PIN n'est associé à votre compte. Pour confirmer la suppression définitive de <b>${esc(u.email)}</b>, tapez <b>SUPPRIMER</b>.</p>
      <form id="f"><label for="cf">Confirmation</label><input id="cf" autocomplete="off" autocapitalize="characters"><p class="fe" id="err" role="alert"></p>
      <div class="row"><button class="btn bd" type="submit">Supprimer définitivement</button><button class="btn b4" type="button" id="cancel">Annuler</button></div></form>`);
    document.getElementById("cancel").onclick = cancel;
    document.getElementById("f").onsubmit = (e) => { e.preventDefault(); if (document.getElementById("cf").value.trim().toUpperCase() !== "SUPPRIMER") { document.getElementById("err").textContent = "Tapez SUPPRIMER pour confirmer."; return; } doDelete(u); };
    return;
  }
  let tries = 0;
  render(`${steps(2)}<h1>Saisissez votre code PIN</h1><p class="mut">Le code PIN de votre compte Studio Prism, celui que vous utilisez pour ouvrir ARCHIPLAN.</p>
    <form id="f"><label for="pin">Code PIN</label><input id="pin" class="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" pattern="[0-9]*"><p class="fe" id="err" role="alert"></p>
    <div class="row"><button class="btn bd" type="submit">Supprimer définitivement mon compte</button><button class="btn b4" type="button" id="cancel">Annuler</button></div></form>
    <p class="mut" style="margin-top:14px">Code oublié ? Ouvrez ARCHIPLAN, choisissez « Code PIN oublié », reconnectez-vous puis choisissez un nouveau code, et recommencez la demande.</p>`);
  document.getElementById("cancel").onclick = cancel;
  document.getElementById("f").onsubmit = async (e) => {
    e.preventDefault();
    const pin = document.getElementById("pin").value.trim(), err = document.getElementById("err"), b = box.querySelector(".bd");
    if (!/^\d{6}$/.test(pin)) { err.textContent = "Le code PIN contient 6 chiffres."; return; }
    b.disabled = true; b.textContent = "Vérification…";
    let ok = false;
    try { ok = (await pbkdf2(pin, sec.pinSalt, sec.pinIter)) === sec.pinHash; }
    catch (x) { b.disabled = false; b.textContent = "Supprimer définitivement mon compte"; err.textContent = "Vérification impossible dans ce navigateur. Essayez avec un navigateur à jour."; return; }
    if (!ok) {
      tries++; b.disabled = false; b.textContent = "Supprimer définitivement mon compte"; document.getElementById("pin").value = "";
      if (tries >= PIN_TRIES) { await signOut(auth).catch(() => {}); return render(`<h1>Trop de codes incorrects</h1><div class="note err">Pour votre sécurité, la demande est annulée et vous avez été déconnecté. Rien n'a été supprimé.</div><div class="row"><a class="btn b4" href="${SITE}">Retour au site</a></div>`); }
      err.textContent = `Code incorrect. ${PIN_TRIES - tries} essai${PIN_TRIES - tries > 1 ? "s" : ""} restant${PIN_TRIES - tries > 1 ? "s" : ""}.`; return;
    }
    doDelete(u);
  };
}
function cancel() { render(`<h1>Demande annulée</h1><div class="note ok">Rien n'a été supprimé. Votre compte est conservé.</div><div class="row">${back()}</div>`); }

/* ---------- 4. Suppression ---------- */
async function commitChunks(refs, size) {
  for (let i = 0; i < refs.length; i += size) { const b = writeBatch(db); refs.slice(i, i + size).forEach((r) => b.delete(r)); await b.commit(); }
}
async function doDelete(u) {
  loading("Suppression en cours… ne fermez pas cette page.");
  const uid = u.uid, email = (u.email || "").toLowerCase();
  try {
    const el = await eligibility(u);
    if (!el.ok) return render(`<h1>Suppression impossible</h1><div class="note warn">${esc(el.why)}</div><div class="row">${back()}</div>`);
    // ARCHIPLAN : projets (contenu + fiche, 10 par lot : chaque contenu relit sa fiche dans les règles), partages, dossiers, accès par lien
    const q = (c, ...w) => getDocs(query(collection(db, c), ...w)).then((s) => s.docs.map((d) => d.ref)).catch(() => []);
    const projects = await q("apProjects", where("ownerUid", "==", uid));
    const projRefs = []; projects.forEach((p) => { projRefs.push(doc(db, "apProjects", p.id, "content", "main"), p); });
    await commitChunks(projRefs, 20);
    const others = [
      ...(await q("apShares", where("ownerUid", "==", uid))),
      ...(await q("apShares", where("email", "==", email))),
      ...(await q("apFolders", where("ownerUid", "==", uid))),
      ...(await q("apGrants", where("uid", "==", uid))),
      doc(db, "userSecrets", uid), doc(db, "clientProfiles", uid), doc(db, "apLibrary", uid)];
    // ARCHITRAFIC : mêmes données, collections « at »
    const atProj = await q("atProjects", where("ownerUid", "==", uid)); const atRefs = []; atProj.forEach((p) => { atRefs.push(doc(db, "atProjects", p.id, "content", "main"), p); });
    await commitChunks(atRefs, 20);
    others.push(...(await q("atShares", where("ownerUid", "==", uid))), ...(await q("atShares", where("email", "==", email))), ...(await q("atFolders", where("ownerUid", "==", uid))), ...(await q("atGrants", where("uid", "==", uid))), doc(db, "atLibrary", uid));
    const uniq = [...new Map(others.map((r) => [r.path, r])).values()];
    await commitChunks(uniq, 400);
    // Profil + licences dans un seul lot (les règles n'autorisent la suppression d'une licence que si le profil disparaît avec)
    const lics = await getDocs(query(collection(db, "licenses"), where("userId", "==", uid)));
    // Compteur de stockage ARCHIPLAN : supprimé avec le profil (les règles l'exigent)
    const usage = await getDoc(doc(db, "apUsage", uid)).catch(() => null);
    const atUsage = await getDoc(doc(db, "atUsage", uid)).catch(() => null);
    const b = writeBatch(db); lics.docs.forEach((d) => b.delete(d.ref)); if (usage && usage.exists()) b.delete(doc(db, "apUsage", uid)); if (atUsage && atUsage.exists()) b.delete(doc(db, "atUsage", uid));
    b.delete(doc(db, "users", uid)); await b.commit();
    // Compte de connexion (connexion récente grâce au lien email)
    await deleteUser(u);
  } catch (e) {
    console.error("[Studio Prism] Suppression du compte :", e);
    return render(`<h1>Suppression interrompue</h1><div class="note err">${esc(errMsg(e))} Une partie de vos données a pu être supprimée : recommencez la demande pour terminer, ou contactez Studio Prism.</div><div class="row"><a class="btn b1" href="${PAGE}">Recommencer</a></div>`);
  }
  // Nettoyage de cet appareil (ARCHIPLAN est sur le même domaine)
  try { ["sp.lock.", "sp.prof.", "sp.access.", "ap.localDismissed."].forEach((k) => localStorage.removeItem(k + uid)); localStorage.removeItem("archiplan.v1"); sessionStorage.removeItem("sp.del.from"); } catch (e) { /* stockage indisponible */ }
  render(`<h1>Votre compte a été supprimé</h1><div class="note ok">Votre compte Studio Prism et toutes les données associées (profil, licences, fiche client, code PIN, projets ARCHIPLAN et chantiers ARCHITRAFIC) ont été supprimés.</div>
    <p class="mut">Merci d'avoir utilisé les apps Studio Prism. Vous pouvez créer un nouveau compte à tout moment.</p><div class="row"><a class="btn b1" href="${SITE}">Retour au site</a></div>`);
}

/* ---------- Démarrage ---------- */
(async () => {
  try {
    const u = await waitUser();
    if (!u) {
      return render(`<h1>Supprimer mon compte</h1><p class="mut">Connectez-vous d'abord à votre compte Studio Prism, puis revenez sur cette page (ou utilisez « Supprimer mon compte » dans ARCHIPLAN ou dans Mon compte).</p>
        <div class="row"><a class="btn b1" href="${SITE}#/compte/connexion">Me connecter</a><a class="btn b4" href="${SITE}">Retour au site</a></div>`);
    }
    if (!u.email) return render(`<h1>Supprimer mon compte</h1><div class="note warn">Ce compte n'a pas d'adresse email. Contactez Studio Prism.</div>`);
    stepAsk(u);
  } catch (e) {
    render(`<h1>Supprimer mon compte</h1><div class="note err">${esc(errMsg(e))}</div><div class="row"><a class="btn b1" href="${PAGE}">Réessayer</a></div>`);
  }
})();
