/* Studio Prism — accès aux données du CMS : pages, projets / réalisations et médiathèque (module ES chargé à la demande).
 *
 * MODÈLE (voir firebase/firestore.rules et storage.rules, qui IMPOSENT les droits côté serveurs Google) :
 *   pages        version PUBLIÉE d'une page : { kind, title, slug, status published|archived, footer, content, mediaIds, revision, … }.
 *                Lecture publique si status == 'published' ; sinon administrateur seul. Une page sans document = contenu d'origine du site.
 *   pageDrafts   copie de travail d'une page (jamais lisible du public).
 *   projects     projets / réalisations : status published | draft | archived (lecture publique des seuls publiés).
 *   media        métadonnées des médias ; les fichiers sont dans Firebase Storage (media/{id}/{fichier}) ou, pour un média « lien »,
 *                sur un site externe. Une page, un projet ou un produit référence un média par « media:{id} » (jamais par copie) :
 *                remplacer le fichier d'un média met donc à jour tous les endroits où il est utilisé.
 *
 * Aucune donnée ici n'est du HTML ou du JavaScript : l'affichage (js/cms.js) insère toujours du TEXTE et vérifie chaque adresse.
 */
import {
  auth, db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, limit, serverTimestamp
} from "./firebase.js";

const fail = (code, extra) => Object.assign(new Error(code), { code }, extra || {});
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const uidNow = () => {
  const u = auth.currentUser;
  if (!u) throw fail("app/not-signed-in");
  return u.uid;
};

/* ------------------------------------------------------------------ références de médias */

export const MEDIA_RE = /^media:([A-Za-z0-9]{10,40})$/;

/* Identifiants des médias cités (« media:{id} ») dans une valeur quelconque (texte, liste, objet imbriqué). */
export function collectMediaIds(value, set) {
  const out = set || new Set();
  if (typeof value === "string") { const m = MEDIA_RE.exec(value); if (m) out.add(m[1]); }
  else if (Array.isArray(value)) value.forEach((v) => collectMediaIds(v, out));
  else if (value && typeof value === "object") Object.keys(value).forEach((k) => collectMediaIds(value[k], out));
  return out;
}

/* ------------------------------------------------------------------ lecture publique (visiteurs compris) */

/* Pages publiées. (Filtre d'égalité obligatoire : les règles refusent une requête qui pourrait renvoyer une page non publiée.) */
export async function listPublishedPages() {
  return rows(await getDocs(query(collection(db, "pages"), where("status", "==", "published"))));
}

export async function listPublishedProjects() {
  return rows(await getDocs(query(collection(db, "projects"), where("status", "==", "published"))))
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || String(a.title || "").localeCompare(String(b.title || ""), "fr"));
}

/* Un média public, par son identifiant (la médiathèque ne peut pas être listée par le public). null si absent ou non public. */
export async function getPublicMedia(id) {
  const snap = await getDoc(doc(db, "media", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* ------------------------------------------------------------------ lecture administrateur */

export async function adminListPages() { return rows(await getDocs(collection(db, "pages"))); }
export async function adminListDrafts() { return rows(await getDocs(collection(db, "pageDrafts"))); }
export async function adminGetPage(id) { const s = await getDoc(doc(db, "pages", id)); return s.exists() ? { id: s.id, ...s.data() } : null; }
export async function adminGetDraft(id) { const s = await getDoc(doc(db, "pageDrafts", id)); return s.exists() ? { id: s.id, ...s.data() } : null; }
export async function adminListProjects() {
  return rows(await getDocs(collection(db, "projects"))).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || String(a.title || "").localeCompare(String(b.title || ""), "fr"));
}
export async function adminListMedia() {
  return rows(await getDocs(query(collection(db, "media"), orderBy("createdAt", "desc"), limit(500))));
}
export async function adminListProducts() { return rows(await getDocs(collection(db, "products"))); }

/* ------------------------------------------------------------------ pages : brouillon, publication, dépublication */

/* w : { kind, title, slug, footer, content } — la copie de travail de l'éditeur. */
function pageFields(w) {
  return {
    kind: w.kind, title: w.title || "", slug: w.slug, footer: !!w.footer, content: w.content,
    mediaIds: Array.from(collectMediaIds(w.content)).slice(0, 80), updatedAt: serverTimestamp(), updatedBy: uidNow()
  };
}

export async function savePageDraft(id, w, baseRevision) {
  await setDoc(doc(db, "pageDrafts", id), { ...pageFields(w), baseRevision: baseRevision || 0 });
}

export async function deletePageDraft(id) { await deleteDoc(doc(db, "pageDrafts", id)); }

/* Publie : écrit la version publiée ET supprime le brouillon dans UN lot. Refuse (app/page-conflict) si quelqu'un d'autre a publié
   cette page depuis l'ouverture de l'éditeur, sauf `force`. Renvoie le numéro de révision publié. */
export async function publishPage(id, w, opts) {
  const o = opts || {};
  const cur = await adminGetPage(id);
  if (cur && !o.force && typeof w.baseRevision === "number" && cur.revision !== w.baseRevision) throw fail("app/page-conflict", { current: cur });
  const revision = cur ? (cur.revision || 0) + 1 : 1;
  const batch = writeBatch(db);
  batch.set(doc(db, "pages", id), { ...pageFields(w), status: "published", revision, publishedAt: serverTimestamp() });
  batch.delete(doc(db, "pageDrafts", id));
  await batch.commit();
  return revision;
}

/* Dépublie sans rien effacer : la page revient au contenu d'origine du site (une page personnalisée devient introuvable). */
export async function unpublishPage(id) {
  await updateDoc(doc(db, "pages", id), { status: "archived", updatedAt: serverTimestamp(), updatedBy: uidNow() });
}

/* Suppression définitive d'une page PERSONNALISÉE (version publiée + brouillon). Les pages du site ne se suppriment pas : on les dépublie. */
export async function deleteCustomPage(id) {
  if (!/^c-/.test(id)) throw fail("app/page-builtin");
  const batch = writeBatch(db);
  batch.delete(doc(db, "pages", id));
  batch.delete(doc(db, "pageDrafts", id));
  await batch.commit();
}

/* ------------------------------------------------------------------ projets / réalisations */

const projectData = (p) => ({
  title: p.title, slug: p.id, summary: p.summary || "", description: p.description || "", image: p.image || "", link: p.link || "",
  productId: p.productId || "", tags: p.tags || [], year: p.year || "", status: p.status, featured: !!p.featured,
  displayOrder: p.displayOrder, updatedAt: serverTimestamp()
});

export async function saveProject(p, isNew) {
  const ref = doc(db, "projects", p.id);
  if (isNew) {
    if ((await getDoc(ref)).exists()) throw fail("app/project-exists");
    await setDoc(ref, { ...projectData(p), createdAt: serverTimestamp() });
  } else {
    await updateDoc(ref, projectData(p));
  }
}

export async function setProjectStatus(id, status) {
  await updateDoc(doc(db, "projects", id), { status, updatedAt: serverTimestamp() });
}

export async function deleteProject(id) { await deleteDoc(doc(db, "projects", id)); }

/* ------------------------------------------------------------------ médiathèque */

export const MEDIA_TYPES = {
  "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"], "image/gif": ["gif"],
  "video/mp4": ["mp4"], "video/webm": ["webm"]
};
export const IMAGE_MAX = 8 * 1024 * 1024;
export const VIDEO_MAX = 50 * 1024 * 1024;

/* Type MIME d'un fichier : celui du navigateur, sinon déduit de l'extension. Hors liste autorisée → "" (refusé). */
export function fileMime(file) {
  const t = String(file.type || "").toLowerCase();
  if (MEDIA_TYPES[t]) return t;
  const ext = String(file.name || "").split(".").pop().toLowerCase();
  return Object.keys(MEDIA_TYPES).find((m) => MEDIA_TYPES[m].includes(ext) && (!t || t === "application/octet-stream")) || "";
}

/* Nom de fichier sûr pour le stockage (lettres, chiffres, point, tiret, tiret bas ; 100 caractères au plus ; extension conforme au type). */
export function safeName(name, mime) {
  let n = String(name || "fichier").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").replace(/\.{2,}/g, ".");
  const exts = MEDIA_TYPES[mime] || [];
  const ext = n.split(".").length > 1 ? n.split(".").pop().toLowerCase() : "";
  if (exts.length && !exts.includes(ext)) n = (n.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "fichier") + "." + exts[0];
  if (n.length > 100) { const e = n.split(".").pop(); n = n.slice(0, 100 - e.length - 1) + "." + e; }
  return n || "fichier." + (exts[0] || "bin");
}

const newId = () => {
  const a = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join("");
};

function imageSize(file) {
  return new Promise((resolve) => {
    if (!/^image\//.test(file.type || "") || !window.URL || !URL.createObjectURL) return resolve(null);
    const u = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(u); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(u); resolve(null); };
    img.src = u;
  });
}

function checkFile(file) {
  const mime = fileMime(file);
  if (!mime) throw fail("app/media-type");
  const kind = mime.indexOf("image/") === 0 ? "image" : "video";
  if (!file.size) throw fail("app/media-empty");
  if (file.size > (kind === "image" ? IMAGE_MAX : VIDEO_MAX)) throw fail("app/media-size", { kind });
  return { mime, kind };
}

let storageMod = null;
const stor = async () => storageMod || (storageMod = await import("./storage.js"));

/* Envoie un fichier depuis l'ordinateur / le téléphone, puis enregistre ses métadonnées. meta : { folder, alt, title }. Renvoie le média. */
export async function uploadMedia(file, meta, onProgress) {
  const { mime, kind } = checkFile(file);
  uidNow();
  const m = meta || {};
  const id = newId(), path = `media/${id}/${safeName(file.name, mime)}`;
  const S = await stor();
  const up = await S.upload(path, file, mime, onProgress);
  const dim = await imageSize(file);
  const data = {
    name: String(file.name || "fichier").slice(0, 120), folder: String(m.folder || "").slice(0, 60), alt: String(m.alt || "").slice(0, 250), title: String(m.title || "").slice(0, 120),
    kind, mime, size: file.size, source: "upload", url: up.url, path, public: true
  };
  if (dim) { data.width = Math.min(dim.width, 20000); data.height = Math.min(dim.height, 20000); }
  try {
    await setDoc(doc(db, "media", id), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: uidNow() });
  } catch (e) {
    try { await S.remove(path); } catch (e2) { /* fichier orphelin : sans conséquence pour le site */ }
    throw e;
  }
  return { id, ...data };
}

/* Média « lien » : fichier hébergé ailleurs (adresse https://). mime : un des types autorisés. */
export async function addMediaLink(input) {
  const url = String(input.url || "").trim();
  if (!/^https:\/\/[!#-:=?-~]+$/.test(url) || url.length > 1500) throw fail("app/media-url");
  if (!MEDIA_TYPES[input.mime]) throw fail("app/media-type");
  const id = newId(), kind = input.mime.indexOf("image/") === 0 ? "image" : "video";
  const data = {
    name: String(input.name || url.split("/").pop().split("?")[0] || "lien").slice(0, 120), folder: String(input.folder || "").slice(0, 60),
    alt: String(input.alt || "").slice(0, 250), title: String(input.title || "").slice(0, 120), kind, mime: input.mime, size: 0,
    source: "link", url, path: "", public: true
  };
  await setDoc(doc(db, "media", id), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: uidNow() });
  return { id, ...data };
}

/* Métadonnées modifiables : nom, dossier, texte alternatif, titre, visibilité publique. */
export async function updateMediaMeta(id, m) {
  await updateDoc(doc(db, "media", id), {
    name: String(m.name || "").slice(0, 120), folder: String(m.folder || "").slice(0, 60), alt: String(m.alt || "").slice(0, 250),
    title: String(m.title || "").slice(0, 120), public: m.public !== false, updatedAt: serverTimestamp()
  });
}

/* Remplace le FICHIER d'un média en gardant son identifiant : toutes les références « media:{id} » (pages, projets, produits) suivent.
   Le nouveau fichier doit être du même genre (image / vidéo). Média « lien » : remplacer l'adresse avec replaceMediaLink. */
export async function replaceMediaFile(current, file, onProgress) {
  if (current.source !== "upload") throw fail("app/media-link");
  const { mime, kind } = checkFile(file);
  if (kind !== current.kind) throw fail("app/media-kind");
  uidNow();
  const path = `media/${current.id}/${Date.now().toString(36)}-${safeName(file.name, mime)}`.slice(0, 200);
  const S = await stor();
  const up = await S.upload(path, file, mime, onProgress);
  const dim = await imageSize(file);
  const patch = { mime, size: file.size, url: up.url, path, replacedAt: serverTimestamp(), updatedAt: serverTimestamp() };
  if (dim) { patch.width = Math.min(dim.width, 20000); patch.height = Math.min(dim.height, 20000); }
  try {
    await updateDoc(doc(db, "media", current.id), patch);
  } catch (e) {
    try { await S.remove(path); } catch (e2) { /* ignoré */ }
    throw e;
  }
  try { if (current.path) await S.remove(current.path); } catch (e) { console.warn("[Studio Prism] Ancien fichier non supprimé :", e && e.code); }
  return { ...current, ...patch, replacedAt: new Date() };
}

export async function replaceMediaLink(current, url, mime) {
  if (current.source !== "link") throw fail("app/media-upload");
  if (!/^https:\/\/[!#-:=?-~]+$/.test(url) || url.length > 1500) throw fail("app/media-url");
  if (!MEDIA_TYPES[mime] || (mime.indexOf("image/") === 0 ? "image" : "video") !== current.kind) throw fail("app/media-kind");
  await updateDoc(doc(db, "media", current.id), { url, mime, replacedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

/* Où un média est utilisé : pages (publiées ou brouillons), projets, produits. Données déjà chargées (adminListPages…). */
export function findMediaUsage(id, d) {
  const tok = "media:" + id, out = [];
  (d.pages || []).forEach((p) => { if (collectMediaIds(p.content).has(id)) out.push({ type: "page", id: p.id, label: p.title || p.id, draft: false }); });
  (d.drafts || []).forEach((p) => { if (collectMediaIds(p.content).has(id)) out.push({ type: "page", id: p.id, label: (p.title || p.id), draft: true }); });
  (d.projects || []).forEach((p) => { if (p.image === tok) out.push({ type: "project", id: p.id, label: p.title || p.id }); });
  (d.products || []).forEach((p) => { if (p.image === tok || p.logo === tok) out.push({ type: "product", id: p.id, label: p.name || p.id }); });
  return out;
}

/* Suppression d'un média NON utilisé (le contrôle d'usage est fait par l'appelant avec findMediaUsage sur des données fraîches). */
export async function deleteMedia(m) {
  if (m.source === "upload" && m.path) await (await stor()).remove(m.path);
  await deleteDoc(doc(db, "media", m.id));
}
