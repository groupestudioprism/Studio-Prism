/* Studio Prism — Cloud Functions (Firebase Functions v2, Admin SDK).
 * Déploiement : voir README.md (« Fonctions serveur »). Région : europe-west1 (proche de la base Firestore eur3).
 * Si vous changez la région ici, changez-la aussi dans js/functions.js (FUNCTIONS_REGION). */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { makeHandlers } = require('./handlers');

admin.initializeApp(); // identifiants du compte de service fournis automatiquement par Firebase : aucune clé dans le code

const h = makeHandlers({ auth: admin.auth(), db: admin.firestore(), FieldValue, HttpsError, logger });
const opts = { region: 'europe-west1', maxInstances: 5, cors: true, timeoutSeconds: 60 };

exports.adminCreateUser = onCall(opts, h.adminCreateUser);
exports.adminDeleteUser = onCall(opts, h.adminDeleteUser);
exports.deleteMyAccount = onCall(opts, h.deleteMyAccount);
exports.accountsHealth = onCall(opts, h.accountsHealth);   // diagnostic : « le service est-il déployé et a-t-il les droits nécessaires ? »
