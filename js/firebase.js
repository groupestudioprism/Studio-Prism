/* Studio Prism — point d'entrée unique de Firebase.
 *
 * - SDK modulaire chargé depuis le CDN officiel de Google (aucun outil de build n'est nécessaire sur GitHub Pages).
 *   Pour changer de version du SDK, remplacer le numéro dans les URL ci-dessous (et nulle part ailleurs).
 * - La configuration Web Firebase est PUBLIQUE par conception : ce n'est pas un secret. La sécurité des données repose
 *   sur Firebase Authentication et sur les règles Firestore (firebase/firestore.rules).
 * - Ne jamais placer ici (ni ailleurs dans le dépôt) de compte de service, de clé privée ou de credential Admin SDK.
 * - Firebase Analytics n'est volontairement PAS activé : il déposerait des identifiants de suivi sans recueil du
 *   consentement. `measurementId` reste dans la configuration pour pouvoir l'activer plus tard avec un bandeau de choix.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAAD5rrHuVh6_PC2_45L3y9F7zWe5ACW6E",
  authDomain: "archivision-studioprism.firebaseapp.com",
  projectId: "archivision-studioprism",
  storageBucket: "archivision-studioprism.firebasestorage.app",
  messagingSenderId: "226072216517",
  appId: "1:226072216517:web:0aeef645a4f1481fe801ac",
  measurementId: "G-ZTLKNTQ5QP"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;

/* Fonctions du SDK réexportées : les autres modules n'importent que ./firebase.js. */
export {
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence,
  updateProfile, deleteUser, reauthenticateWithCredential, EmailAuthProvider, updatePassword
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

export {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, orderBy, limit, startAfter,
  where, getCountFromServer, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
