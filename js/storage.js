/* Studio Prism — Firebase Storage (médiathèque du CMS). Chargé À LA DEMANDE uniquement (js/cmsdata.js), jamais pour un simple visiteur.
 *
 * Seul un administrateur actif peut envoyer ou supprimer un fichier : c'est storage.rules qui l'impose, côté serveurs Google
 * (jamais ce fichier). Dossier unique : media/{identifiant du média}/{fichier}. Un fichier envoyé n'est jamais écrasé.
 * Prérequis : Storage activé dans la console Firebase et storage.rules publiées (voir README_INSTALLATION.md). */
import app from "./firebase.js";
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const storage = getStorage(app);

/* Envoie `file` vers `path` ; onProgress(0..1) facultatif. Renvoie { url, path }. */
export function upload(path, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), file, { contentType, cacheControl: "public,max-age=31536000,immutable" });
    task.on(
      "state_changed",
      (s) => { if (onProgress && s.totalBytes) onProgress(s.bytesTransferred / s.totalBytes); },
      (e) => reject(e),
      async () => {
        try { resolve({ url: await getDownloadURL(task.snapshot.ref), path }); } catch (e) { reject(e); }
      }
    );
  });
}

/* Supprime un fichier ; « déjà absent » n'est pas une erreur. */
export async function remove(path) {
  try { await deleteObject(ref(storage, path)); } catch (e) { if (!e || e.code !== "storage/object-not-found") throw e; }
}
