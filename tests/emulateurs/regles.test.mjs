// npm test (dans ce dossier) : tests sur émulateurs des règles Firestore + Storage de Studio Prism (source unique), pour les parties sans autre suite :
// ARCHIVISION (avModels, avPhotos, arLive + Storage archivision/), dossiers produits (productFolders),
// médiathèque du site (Storage media/), PRISM ARCADE (classements), règle finale « tout refusé ».
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app'; import 'firebase/compat/firestore';
import {readFileSync} from 'fs';
const R = new URL('../../firebase/', import.meta.url).pathname;
const env = await initializeTestEnvironment({projectId: 'demo-studioprism',
  firestore: {rules: readFileSync(R + '/firestore.publier.rules', 'utf8')},  // le fichier réellement publié
  storage: {rules: readFileSync(R + '/storage.rules', 'utf8')}});
const TS = () => firebase.firestore.FieldValue.serverTimestamp();
let ok = 0; const fails = [];
async function t(name, p, allow = true) {
  try { await (allow ? assertSucceeds(p) : assertFails(p)); ok++; console.log('  ✓', name); }
  catch (e) { fails.push(name); console.log('  ✗', name, '→', (e && e.message || e).toString().slice(0, 160)); }
}
await env.withSecurityRulesDisabled(async (a) => {
  const db = a.firestore();
  await db.doc('users/alice').set({status: 'active', role: 'user', email: 'alice@x.fr'});
  await db.doc('users/bob').set({status: 'active', role: 'user', email: 'bob@x.fr'});
  await db.doc('users/admin').set({status: 'active', role: 'admin', email: 'admin@x.fr'});
  await db.doc('users/zed').set({status: 'disabled', role: 'user', email: 'zed@x.fr'});
});
const ctx = (u) => env.authenticatedContext(u, {email: u + '@x.fr', email_verified: true});
const A = ctx('alice'), B = ctx('bob'), ADM = ctx('admin'), Z = ctx('zed'), V = env.unauthenticatedContext();
const fa = A.firestore(), fb = B.firestore(), fadm = ADM.firestore(), fz = Z.firestore(), fv = V.firestore();
const sa = A.storage(), sb = B.storage(), sadm = ADM.storage(), sv = V.storage();
const now = Date.now();

console.log('ARCHIVISION · Firestore');
const model = {ownerUid: 'alice', name: 'Maison', kind: 'glb', size: 1000, unitScale: 1, thumb: '', stats: null, createdAt: now, updatedAt: now, glbSize: 1000, hasSource: false};
await t('alice enregistre sa maquette', fa.doc('avModels/m1').set(model));
await t('alice relit sa maquette', fa.doc('avModels/m1').get());
await t('alice liste ses maquettes', fa.collection('avModels').where('ownerUid', '==', 'alice').get());
await t('bob ne lit pas la maquette d\'alice', fb.doc('avModels/m1').get(), false);
await t('bob ne liste pas les maquettes d\'alice', fb.collection('avModels').where('ownerUid', '==', 'alice').get(), false);
await t('bob ne crée pas une maquette au nom d\'alice', fb.doc('avModels/m2').set(model), false);
await t('champ inconnu refusé', fa.doc('avModels/m3').set({...model, pirate: 1}), false);
await t('compte désactivé : refusé', fz.doc('avModels/m4').set({...model, ownerUid: 'zed'}), false);
await t('visiteur : refusé', fv.doc('avModels/m1').get(), false);
await t('bob ne supprime pas la maquette d\'alice', fb.doc('avModels/m1').delete(), false);
const photo = {ownerUid: 'alice', modelId: 'm1', modelName: 'Maison', size: 10, w: 10, h: 10, thumb: '', note: 'Façade', mode: 'ar', createdAt: now, updatedAt: now};
await t('alice enregistre une photo', fa.doc('avPhotos/p1').set(photo));
await t('bob ne lit pas la photo', fb.doc('avPhotos/p1').get(), false);
await t('alice supprime sa photo', fa.doc('avPhotos/p1').delete());
const exp = firebase.firestore.Timestamp.fromMillis(now + 3600e3);
const live = {v: 1, code: 'ABC234', owner: 'alice', expires: now + 3600e3, expiresAt: exp, createdAt: now, state: 'open', model: 'm1', objects: []};
await t('alice ouvre une session AR', fa.doc('arLive/ABC234').set(live));
await t('code invalide refusé', fa.doc('arLive/abc123').set({...live, code: 'abc123'}), false);
await t('session de plus de 3 h refusée', fa.doc('arLive/XYZ234').set({...live, code: 'XYZ234', expiresAt: firebase.firestore.Timestamp.fromMillis(now + 5 * 3600e3)}), false);
await t('bob lit la session avec le code', fb.doc('arLive/ABC234').get());
await t('lister les sessions : refusé', fb.collection('arLive').get(), false);
await t('bob déplace un objet', fb.doc('arLive/ABC234/moves/3').set({i: 3, p: [1, 0, 2], seq: 1, c: 'tel', t: now}));
await t('bob ne tourne pas un objet (champ en trop)', fb.doc('arLive/ABC234/moves/4').set({i: 4, p: [1, 0, 2], seq: 1, c: 'tel', r: 90}), false);
await t('bob ne ferme pas la session d\'alice', fb.doc('arLive/ABC234').update({state: 'closed'}), false);
await t('alice ferme la session', fa.doc('arLive/ABC234').update({state: 'closed'}));
await t('session fermée : plus de déplacement', fb.doc('arLive/ABC234/moves/5').set({i: 5, p: [1, 0, 2], seq: 2, c: 'tel', t: now}), false);

console.log('ARCHIVISION · Storage');
const glb = new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]);
await t('alice envoie sa maquette', sa.ref('archivision/alice/models/m1/model.glb').put(glb, {contentType: 'model/gltf-binary'}));
await t('alice relit sa maquette', sa.ref('archivision/alice/models/m1/model.glb').getMetadata());
await t('bob ne lit pas la maquette d\'alice', sb.ref('archivision/alice/models/m1/model.glb').getMetadata(), false);
await t('bob n\'écrit pas chez alice', sb.ref('archivision/alice/photos/p9').put(glb, {contentType: 'image/jpeg'}), false);
await t('fichier vide refusé', sa.ref('archivision/alice/photos/p0').put(new Uint8Array(0), {contentType: 'image/jpeg'}), false);
await t('visiteur : refusé', sv.ref('archivision/alice/models/m1/model.glb').getMetadata(), false);
await t('alice supprime sa maquette', sa.ref('archivision/alice/models/m1/model.glb').delete());

console.log('Dossiers produits (productFolders)');
await t('l\'administrateur crée le dossier d\'un produit', fadm.doc('productFolders/archiplan').set({updatedAt: TS()}));
await t('lecture publique (action GitHub, sans compte)', fv.doc('productFolders/archiplan').get());
await t('liste publique (action GitHub, sans compte)', fv.collection('productFolders').get());
await t('un utilisateur ne crée pas de dossier', fa.doc('productFolders/pirate').set({updatedAt: TS()}), false);
await t('un utilisateur ne supprime pas de dossier', fa.doc('productFolders/archiplan').delete(), false);
await t('identifiant invalide refusé', fadm.doc('productFolders/Pas Bon').set({updatedAt: TS()}), false);
await t('champ en trop refusé', fadm.doc('productFolders/spectrawriter').set({updatedAt: TS(), x: 1}), false);
await t('l\'administrateur supprime le dossier', fadm.doc('productFolders/archiplan').delete());

console.log('Médiathèque du site (Storage media/)');
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
await t('l\'administrateur envoie une image', sadm.ref('media/abcdefghij12/photo.png').put(png, {contentType: 'image/png'}));
await t('un utilisateur n\'envoie pas', sa.ref('media/abcdefghij13/photo.png').put(png, {contentType: 'image/png'}), false);
await t('SVG refusé', sadm.ref('media/abcdefghij14/logo.svg').put(png, {contentType: 'image/svg+xml'}), false);
await t('pas d\'écrasement', sadm.ref('media/abcdefghij12/photo.png').put(png, {contentType: 'image/png'}), false);
await t('l\'administrateur supprime', sadm.ref('media/abcdefghij12/photo.png').delete());

console.log('PRISM ARCADE');
await t('classement lisible par tous', fv.collection('paBoards/stack/scores').get());
await t('alice publie son score', fa.doc('paBoards/stack/scores/alice').set({uid: 'alice', name: 'Kéli', score: 120, updatedAt: TS()}));
await t('un record ne baisse jamais', fa.doc('paBoards/stack/scores/alice').set({uid: 'alice', name: 'Kéli', score: 50, updatedAt: TS()}), false);
await t('bob n\'écrit pas le score d\'alice', fb.doc('paBoards/stack/scores/alice').set({uid: 'alice', name: 'Kéli', score: 9999, updatedAt: TS()}), false);
await t('jeu inconnu refusé', fa.doc('paBoards/inconnu/scores/alice').set({uid: 'alice', name: 'Kéli', score: 1, updatedAt: TS()}), false);
await t('l\'administrateur supprime une entrée', fadm.doc('paBoards/stack/scores/alice').delete());
// progression (avec une partie complète de Lumen : drapeaux, sauvegarde de l'île, meilleur temps)
const lumenExtra = {}; for (let i = 1; i <= 12; i++) lumenExtra['g:aube:g' + i] = 1; for (let i = 1; i <= 10; i++) lumenExtra['s:aube:' + i] = 1; lumenExtra['done:aube'] = 1;
const player = {name: 'Kéli', xp: 5400, coins: 820, coinsEarned: 1500, theme: 'prisme', themes: ['prisme'], muted: false,
  games: {stack: {best: 120, plays: 4, total: 300, last: 80}, lumen: {best: 12, plays: 3, total: 0, last: 0, extra: lumenExtra,
    data: {runs: {aube: {dev: Array.from({length: 73}, (_, i) => i % 4), gates: ['g1', 'g2'], shards: ['1'], time: 3120}}, 'best:aube': 3120}}},
  ach: {first: 1}, boards: {stack: 120}, daily: null, dailyStreak: 0, lastDailyDone: '', totals: {plays: 7, time: 4000}, created: now,
  inv: {}, equip: {}, boost: {}, periods: {}, claims: {}, trophies: {}, giftDay: '', giftStreak: 0, updatedAt: TS()};
await t('alice enregistre sa progression (avec Lumen)', fa.doc('paPlayers/alice').set(player));
await t('alice relit sa progression', fa.doc('paPlayers/alice').get());
await t('bob ne lit pas la progression d\'alice', fb.doc('paPlayers/alice').get(), false);
await t('bob n\'écrit pas la progression d\'alice', fb.doc('paPlayers/alice').set(player), false);
await t('progression : champ inconnu refusé', fa.doc('paPlayers/alice').set({...player, pirate: 1}), false);
await t('progression : XP négative refusée', fa.doc('paPlayers/alice').set({...player, xp: -5}), false);
await t('compte désactivé : progression refusée', fz.doc('paPlayers/zed').set(player), false);
// classements de la semaine et du mois (seule la période en cours accepte des scores)
const d = new Date(), week = Math.floor((Date.now() + 3 * 864e5) / (7 * 864e5)), month = d.getUTCFullYear() * 12 + d.getUTCMonth();
const sc = {uid: 'alice', name: 'Kéli', score: 120, updatedAt: TS()};
await t('score de la semaine en cours accepté', fa.doc(`paPeriods/stack__w${week}/scores/alice`).set(sc));
await t('score du mois en cours accepté', fa.doc(`paPeriods/stack__m${month}/scores/alice`).set(sc));
await t('semaine terminée : score refusé', fa.doc(`paPeriods/stack__w${week - 1}/scores/alice`).set(sc), false);
await t('mois terminé : score refusé', fa.doc(`paPeriods/stack__m${month - 1}/scores/alice`).set(sc), false);
await t('classement de la semaine lisible par tous', fv.collection(`paPeriods/stack__w${week}/scores`).get());
await t('période d\'un jeu inconnu refusée', fa.doc(`paPeriods/inconnu__w${week}/scores/alice`).set(sc), false);

console.log('Clés de licence (date de fin calculée par les règles)');
const kidOf = (c) => c.repeat(64);
async function seedKey(kid, extra) {
  await env.withSecurityRulesDisabled(async (a) => a.firestore().doc('licenseKeys/' + kid).set({
    key: 'SP-TEST-' + kid.slice(0, 8), productId: 'archiplan', productName: 'ARCHIPLAN', licenseType: 'standard', status: 'available',
    createdAt: firebase.firestore.Timestamp.now(), updatedAt: firebase.firestore.Timestamp.now(), ...extra}));
}
function redeem(db, uid, kid, expiresAt) {
  const b = db.batch();
  b.update(db.doc('licenseKeys/' + kid), {status: 'redeemed', redeemedBy: uid, redeemedEmail: uid + '@x.fr', redeemedAt: TS(), updatedAt: TS()});
  b.set(db.doc(`licenses/${uid}_archiplan`), {userId: uid, productId: 'archiplan', productName: 'ARCHIPLAN', licenseType: 'standard', status: 'active',
    activatedAt: TS(), expiresAt, keyId: kid, orgId: '', createdAt: TS(), updatedAt: TS()});
  return b.commit();
}
const inDays = (n) => firebase.firestore.Timestamp.fromMillis(Date.now() + n * 864e5);
await seedKey(kidOf('a'), {durationDays: 30});
await t('clé de 30 jours : fin à J+60 refusée', redeem(fb, 'bob', kidOf('a'), inDays(60)), false);
await t('clé de 30 jours : fin à J+30 acceptée', redeem(fb, 'bob', kidOf('a'), inDays(30)));
await seedKey(kidOf('b'), {});
await t('clé sans durée : une date de fin est refusée', redeem(fa, 'alice', kidOf('b'), inDays(30)), false);
await t('clé sans durée : licence sans fin acceptée', redeem(fa, 'alice', kidOf('b'), null));
await seedKey(kidOf('c'), {expiresAt: inDays(90)});
await env.withSecurityRulesDisabled(async (a) => a.firestore().doc('licenses/bob_archiplan').delete());
await t('clé à date fixe : autre date refusée', redeem(fb, 'bob', kidOf('c'), inDays(30)), false);

console.log('Règle finale');
await t('collection inconnue : lecture refusée', fa.doc('pirate/x').get(), false);
await t('collection inconnue : écriture refusée', fadm.doc('pirate/x').set({a: 1}), false);
await t('Storage : chemin inconnu refusé', sadm.ref('autre/x.png').put(png, {contentType: 'image/png'}), false);

await env.cleanup();
console.log(`${ok} réussis, ${fails.length} en échec`);
if (fails.length) { console.log('Échecs : ' + fails.join(' | ')); process.exit(1); }
