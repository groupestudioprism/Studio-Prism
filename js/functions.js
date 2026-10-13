/* Studio Prism — appel des Cloud Functions (création / suppression réelle de comptes).
 * Chargé à la demande uniquement (js/data.js). Région : doit être identique à celle de functions/index.js. */
import app from "./firebase.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

export const FUNCTIONS_REGION = "europe-west1";
const fns = getFunctions(app, FUNCTIONS_REGION);

export const callable = (name) => httpsCallable(fns, name);
