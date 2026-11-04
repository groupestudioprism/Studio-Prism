# Règles Firestore nécessaires (branche maj-novembre-2026)

Un premier jet est déjà écrit dans `firebase/rules/00-communes.rules` et `firebase/rules/14-presence.rules` (assemblé dans
`firebase/firestore.rules`) ; **à relire et finaliser avant publication**. Rien n'est publié.

| Collection / champ | Qui lit | Qui écrit | Détail |
|---|---|---|---|
| `presence/{uid}_{app}` `{uid, app, lastSeen}` | administrateur (liste) ; l'utilisateur son propre document | l'utilisateur actif, pour lui-même (`lastSeen == request.time`, `app` = `[a-z0-9-]{2,30}`) ; suppression par lui-même ou l'admin | heartbeat 60 s de `shared/prism-status.js` |
| `users/{uid}` champs `commercialStatus` (`''`/`pending`/`approved`/`refused`), `commercialInfo` `{legalStatus, siret, activity, phone?, website?, address?}`, `commercialRequestedAt` | idem users | particulier : à l'inscription (`pending` + infos) ou depuis Mon compte (si `''`/`refused`) ; admin : `commercialStatus`, `commercialReviewedAt`, `commercialNote` | demande de compte commercial |
| `users/{uid}.subscription` → `free` | — | le titulaire lui-même (baisse vers `free` uniquement) | retour au gratuit 7 jours après l'expiration |
| `licenses/{id}.status` → `expired` | — | le titulaire, si `expiresAt < now`, seul champ `status` (+ `updatedAt`) | marquage d'expiration côté client |
| `licenseKeys/{kid}.packApps` (map `productId → productName`, 2 à 8) | idem licenseKeys | admin à la création | **pack = une seule clé** ; l'activation crée une licence par produit de `packApps` avec la même clé (`keyLicenseOk` accepte `d.productId` ∈ `packApps`) |
| `licenses` (activation de pack) | — | utilisateur : plusieurs licences dans le même lot que la clé passée à `redeemed` | `keyLicenseOk` vérifie `packApps[productId] == productName` ; la règle d'update de `licenseKeys` exige aujourd'hui que la licence du **productId principal** porte `keyId` : OK car le lot crée aussi celle-là |
