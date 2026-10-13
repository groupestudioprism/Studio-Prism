# Fonctions serveur (Cloud Functions) — configuration, déploiement, vérification

> **Mode actuel : forfait gratuit Spark, sans Cloud Functions.** Le site fonctionne **sans** aucune fonction serveur et **sans** forfait Blaze : la gestion des comptes passe par la **désactivation réversible** (appliquée par les règles Firestore) et par la suppression de **son propre** compte. Tout est décrit au [§0](#0-fonctionner-sans-cloud-functions-forfait-spark-gratuit). Les fonctions du dossier `functions/` sont **conservées** mais **non utilisées** : le réglage `ACCOUNT_SERVER` de `js/data.js` vaut `false`.
>
> Le reste de ce document (§1 à §10) ne concerne que le jour où vous choisirez volontairement le forfait Blaze et déploierez les fonctions. **Rien dans ce document ne doit être exécuté pour utiliser le site au quotidien.**
>
> Envoyer les fichiers du ZIP sur GitHub **ne déploie pas** les fonctions serveur. GitHub Pages ne sert que des fichiers statiques ; les fonctions tournent chez Google (Firebase) et se déploient avec la ligne de commande Firebase (`firebase deploy --only functions`) ou depuis Cloud Shell, **et exigent le forfait Blaze**.
>
> Ce que j'ai pu vérifier et ce que je n'ai **pas** pu vérifier est détaillé en [fin de document](#ce-qui-a-été-testé-et-ce-qui-ne-lest-pas).

## 0. Fonctionner sans Cloud Functions (forfait Spark gratuit)

### Pourquoi `app/functions-unreachable`

Le diagnostic « fonctions injoignables » n'était **pas** un défaut du code : `adminCreateUser`, `adminDeleteUser`, `deleteMyAccount` et `accountsHealth` n'ont jamais pu être déployées, car Google réserve Cloud Functions au forfait Blaze. Tant qu'elles ne sont pas déployées, tout appel reçoit « fonction introuvable ». Le site ne les appelle donc plus (aucune requête vers `cloudfunctions.net`), et l'écran **« Gestion des comptes : état du service »** l'explique en clair.

### Ce qui nécessite un accès serveur privilégié (impossible sur Spark)

| Opération | Pourquoi un navigateur ne peut pas la faire |
| --- | --- |
| Supprimer le compte de connexion **d'un autre** utilisateur | l'API cliente ne permet de supprimer que l'utilisateur connecté ; supprimer un tiers exige l'Admin SDK (clé de compte de service), qui ne doit **jamais** être dans un navigateur |
| Créer un compte de connexion **pour un tiers** | l'API cliente de création connecte immédiatement le nouveau compte, ce qui déconnecterait l'administrateur ; le faire proprement exige l'Admin SDK |
| Désactiver un compte au niveau **Authentication** (`disabled`) | réservé à l'Admin SDK ou à la Console Firebase |

### Ce qui reste disponible, gratuitement

| Fonction | Comment | Où c'est appliqué |
| --- | --- | --- |
| Voir la liste des utilisateurs, leur statut, leurs licences | lecture Firestore | règles : administrateur actif uniquement |
| **Désactiver / réactiver un compte** | `users/{uid}.status` passe à `suspended` / `active` | règles Firestore (voir ci-dessous) |
| Empêcher la désactivation du **dernier administrateur actif** | garde de l'interface + règles (on ne peut jamais modifier son propre statut ni son propre rôle) | interface **et** règles |
| **Supprimer son propre compte** (utilisateur individuel) | mot de passe redemandé, puis suppression des licences + du profil + du compte de connexion, par le SDK | règles + SDK |
| Inviter quelqu'un | l'administrateur envoie le lien d'inscription du site ; la personne crée elle-même son compte | inchangé |

### Comment la désactivation est réellement appliquée

Un compte désactivé conserve techniquement son compte de connexion, mais **les règles Firestore relisent son profil à chaque requête** (`isActiveUser()`, `isAdmin()` : `get(users/{uid}).status == 'active'`). Dès que `status` n'est plus `active`, ce compte ne peut plus : lire ses licences ni son entreprise, modifier son profil, supprimer son profil ou ses licences, ni — s'il était administrateur — lire ou modifier quoi que ce soit dans l'administration. Il garde seulement la lecture de **son propre** profil (nécessaire pour afficher « compte désactivé ») et l'accès aux contenus déjà publics du site. L'effet est **immédiat**, même avec une session encore ouverte. À la prochaine connexion, le site affiche en plus « Votre compte est désactivé ».

Ce qu'une désactivation **n'est pas** : ce n'est **pas** une suppression, et le compte reste présent dans Firebase Authentication ; ses données sont **conservées** et le compte peut être **réactivé**. Le site l'écrit à chaque étape (fiche, confirmation, « Modifier »).

### Limites qui subsistent (honnêtement)

- La suppression **définitive** du compte d'un autre utilisateur n'est **pas** possible sans serveur. Le bouton est remplacé par l'explication « Suppression définitive : indisponible sans serveur ». Remède gratuit : Console Firebase → *Authentication → Utilisateurs* → ⋮ → *Supprimer le compte* (ou *Désactiver le compte*, qui bloque aussi la connexion), puis supprimer à la main `users/{uid}` et ses `licenses/{uid}_…` dans Firestore.
- Un utilisateur désactivé peut encore **se connecter** à Authentication (il ne peut juste plus rien faire ni lire). Pour bloquer aussi la connexion, désactiver le compte dans la Console (gratuit).
- Un utilisateur désactivé peut supprimer **son propre** compte de connexion en dehors du site (API publique de Firebase) puis se réinscrire avec la même adresse : il obtient alors un profil neuf sans rien d'ancien. Il ne récupère aucun droit, mais l'historique n'est pas « banni ». Un bannissement d'adresse exige un serveur.
- Deux administrateurs qui se désactivent **exactement au même instant** pourraient laisser zéro administrateur actif (le contrôle de « dernier administrateur » est fait par l'interface avant l'écriture, pas de façon atomique par les règles). Remède : un compte peut toujours être remis `active` dans la Console Firestore.
- La suppression de son propre compte est limitée aux comptes **individuels** de rôle utilisateur, actifs, ayant **6 licences au plus** ; les comptes d'entreprise et d'administration doivent contacter Studio Prism (la logique de partage d'entreprise et de transfert de responsabilité exige le serveur).
- Aucune de ces vérifications n'a été faite sur le vrai projet Firebase (voir la fin du document).

### Revenir à l'ancien mode (seulement si vous passez volontairement en Blaze)

1. Passer le projet sur Blaze (**payant à l'usage** ; vérifier vous-même la facturation et poser un budget d'alerte avant).
2. Déployer les fonctions (§5) et lancer le diagnostic (§9).
3. Dans `js/data.js`, remplacer `export const ACCOUNT_SERVER = false;` par `true`. Les boutons « Ajouter un utilisateur » (serveur) et « Supprimer le compte » reviennent ; la désactivation reste disponible.

Tant que ces trois étapes ne sont pas faites, **aucune de ces opérations ne peut engendrer de frais**.

## 1. Pourquoi le message « Suppression impossible… » s'affichait

Message d'origine : *« Suppression impossible. Le service de gestion des comptes (fonctions serveur) est indisponible ou n'est pas encore déployé. »*

Un navigateur ne peut **pas** supprimer le compte de connexion d'un autre utilisateur (c'est volontaire : ce serait une faille). La suppression réelle est donc faite par une Cloud Function (`adminDeleteUser`, dossier `functions/`) qui utilise l'Admin SDK côté serveur. Le code de cette fonction était correct dans le dépôt, mais :

1. **Cause la plus probable (non vérifiable depuis mon environnement) : la fonction n'était pas déployée sur le projet Firebase `archivision-studioprism`**, ou l'était dans une autre région. Le déploiement d'un site GitHub Pages n'envoie jamais de fonctions. Dans ce cas Google répond « fonction introuvable » à chaque appel.
2. **Cause aggravante (corrigée dans cette version) :** l'ancien code de `js/data.js` rangeait **tous** les échecs possibles (fonction absente, blocage réseau, droits, panne) sous un seul message, de sorte que la vraie cause n'était jamais visible. Impossible de savoir s'il fallait déployer, corriger des droits ou réessayer.

Autres causes possibles, désormais **distinguées à l'écran** : droit d'appel public retiré par une politique de l'organisation Google Cloud (le navigateur reçoit un refus), compte de service des fonctions sans les droits Authentication / Firestore, fonction déployée dans une autre région, SDK Functions bloqué par une extension du navigateur.

## 2. Ce que cette version change

| Élément | Avant | Maintenant |
| --- | --- | --- |
| Message d'erreur | un seul message pour toutes les causes | 5 causes distinguées : SDK non chargé · fonction **non déployée** · aucune réponse (réseau, CORS, droits d'appel) · appel refusé · réponse du serveur (message français de la fonction) |
| Diagnostic | aucun | fonction `accountsHealth` + bouton **« Vérifier le service de comptes »** (Administration → Utilisateurs) et **« Lancer le diagnostic du service »** sous chaque erreur de suppression / création : dit si le service est déployé, sa version, sa région, et si son compte de service a les droits sur Authentication et Firestore |
| Ordre des opérations | profil et licences supprimés **avant** le compte de connexion : si l'étape Authentication échouait, il restait un compte sans profil | on lit tout, on supprime **d'abord** le compte de connexion (s'il échoue, rien d'autre n'est modifié), puis le profil, les licences, l'entreprise éventuelle |
| Erreur partielle | non gérée | `reason: "partial"` : le message dit que la connexion est supprimée mais que le nettoyage a échoué ; **relancer** la suppression termine le travail (idempotent) |
| Compte introuvable | message vague | `reason: "not-found"` : « il a peut-être déjà été supprimé » |
| Liste périmée | pas de garde | l'administration envoie l'adresse e-mail affichée ; si elle ne correspond plus à l'UID, le serveur refuse (`reason: "stale"`) |
| Dernier administrateur | contrôlé seulement pour « Supprimer mon compte » | contrôlé aussi pour la suppression par un administrateur (`reason: "last-admin"`) |
| Entreprise | supprimée si aucun autre rattaché ; sinon laissée avec un responsable supprimé | idem, **et** si le responsable (`ownerUid`) part alors que d'autres comptes restent, la responsabilité passe au plus ancien compte restant |
| Résultat renvoyé à l'interface | `{ ok: true }` | résumé explicite : `authDeleted`, `profileDeleted`, `licensesDeleted`, `companyDeleted`, `companyOwnerTransferred` — l'écran affiche ce qui a réellement été supprimé |
| Liste d'administration | rafraîchie sans condition | retire la ligne **seulement après** la confirmation du serveur |
| Solution d'attente | aucune | si le service est indisponible : lien « suspendre ce compte » (modifie `users/{uid}.status`, le compte perd l'accès à son espace sans être supprimé) |

Le code serveur est dans `functions/handlers.js` (logique) et `functions/index.js` (déclaration des 4 fonctions).

## 3. Les quatre fonctions

| Fonction | Qui peut l'appeler | Effet |
| --- | --- | --- |
| `adminCreateUser` | administrateur actif (vérifié **dans Firestore** par le serveur) | crée le compte Authentication + `users/{uid}` (+ entreprise) ; mot de passe aléatoire jetable connu de personne ; le navigateur envoie ensuite l'e-mail de choix du mot de passe |
| `adminDeleteUser` | administrateur actif | suppression complète d'un compte, voir §6. Refuse : se supprimer soi-même, supprimer le dernier administrateur actif, un UID dont l'adresse ne correspond plus |
| `deleteMyAccount` | l'utilisateur connecté, pour **son** compte | même suppression ; exige une connexion de moins de 5 minutes (le navigateur redemande le mot de passe) ; refuse si c'est le dernier administrateur actif |
| `accountsHealth` | tout le monde pour « le service répond ? » ; un administrateur actif obtient en plus la vérification des droits | diagnostic ; ne modifie rien ; ne révèle aucune donnée |

Toutes sont des fonctions « callable » v2, Node 22, région **`europe-west1`**. La région est répétée dans `js/functions.js` (`FUNCTIONS_REGION`) : les deux doivent rester identiques.

**Aucune clé privée, aucun fichier de compte de service, aucun secret n'est dans le dépôt ni nécessaire** : l'Admin SDK utilise les identifiants du compte de service que Google attache à la fonction.

## 4. Prérequis (côté Google, à faire une fois)

1. Le projet Firebase `archivision-studioprism` doit être sur le forfait **Blaze** (paiement à l'usage ; le quota gratuit mensuel couvre largement un usage de gestion de comptes). Les fonctions v2 sont refusées sur le forfait Spark. *Paramètres du projet → Utilisation et facturation.*
2. Un compte Google **propriétaire ou éditeur** du projet.
3. Les API Cloud Functions, Cloud Build, Artifact Registry et Cloud Run : la commande de déploiement propose de les activer — répondre **oui**.

## 5. Déployer

### Option A — sans rien installer sur votre ordinateur (Cloud Shell, recommandé)

1. Ouvrir <https://console.cloud.google.com/> avec le compte propriétaire, choisir le projet `archivision-studioprism` (sélecteur en haut).
2. Cliquer sur **Activer Cloud Shell** (icône `>_` en haut à droite). Un terminal s'ouvre en bas de la page.
3. Récupérer le code. **Deux façons :**
   - si vous avez déjà envoyé les fichiers du ZIP sur GitHub :
     ```bash
     git clone https://github.com/Kmauger18/Studio-Prism.git
     cd Studio-Prism
     ```
   - sinon, dans Cloud Shell : menu **⋮ → Importer** (Upload), envoyer `studio-prism.zip`, puis :
     ```bash
     unzip -o studio-prism.zip -d Studio-Prism
     cd Studio-Prism
     ```
   Vérifier que `functions/handlers.js` contient bien `accountsHealth` : `grep -c accountsHealth functions/handlers.js` doit afficher un nombre supérieur à 0.
4. Installer la CLI Firebase et se connecter :
   ```bash
   npm install -g firebase-tools
   firebase login --no-localhost
   ```
   Ouvrir le lien affiché, accepter, coller le code de validation dans le terminal.
5. Installer les dépendances et déployer :
   ```bash
   (cd functions && npm install)
   firebase deploy --only functions --project archivision-studioprism
   ```
   Répondre **Y** aux questions d'activation d'API. Durée : 3 à 6 minutes. À la fin, quatre lignes `✔ functions[adminCreateUser(europe-west1)] Successful create/update operation` (idem pour `adminDeleteUser`, `deleteMyAccount`, `accountsHealth`).
6. **Droits du compte de service** — voir §7 (une seule fois ; souvent déjà en place).

### Option B — depuis votre ordinateur

Prérequis : Node.js 22 (ou 20), `npm`, un terminal.

```bash
npm install -g firebase-tools
firebase login
cd chemin/vers/studio-prism
(cd functions && npm install)
firebase deploy --only functions --project archivision-studioprism
```

### Déployer tout d'un coup (règles + fonctions)

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage,functions --project archivision-studioprism
```

La partie `storage` exige que Firebase Storage soit déjà activé (voir `README_INSTALLATION.md`, étape B).

### En cas d'erreur au déploiement

| Message | Cause | Remède |
| --- | --- | --- |
| `Your project … must be on the Blaze (pay-as-you-go) plan` | forfait Spark | passer sur Blaze |
| `Failed to create function … Build failed` | dépendances / Node | relancer `npm install` dans `functions/` ; vérifier `node --version` (20 ou 22) |
| `Unable to set the invoker for the IAM policy` / `Failed to set the IAM Policy` | politique d'organisation Google Cloud interdisant l'accès public (*Domain Restricted Sharing*) | §8 |
| `HTTP Error: 403, The caller does not have permission` | compte Google non propriétaire / éditeur | utiliser le compte propriétaire |
| `Error: Failed to get Firebase project` | mauvais projet | ajouter `--project archivision-studioprism` |

## 6. Ce que fait la suppression d'un compte (`adminDeleteUser`, `deleteMyAccount`)

Dans cet ordre :

1. **Contrôles** : l'appelant est un administrateur actif (lu dans Firestore) ; l'UID est valide ; ce n'est pas l'appelant lui-même (pour l'administration) ; si la cible est un administrateur actif, au moins un **autre** administrateur actif existe.
2. **Lecture, sans écriture** : le profil `users/{uid}`, le compte Authentication, les licences `licenses` (champ `userId == uid`), l'entreprise et ses autres membres. Si rien n'existe → « Compte introuvable ». Si l'adresse e-mail confirmée par l'administrateur n'est plus celle du compte → refus (liste périmée).
3. **Suppression du compte de connexion** (Authentication). Si cette étape échoue, **rien d'autre n'est modifié** et le message le dit : on peut réessayer sans risque.
4. **Nettoyage Firestore** : licences du compte, puis, selon l'entreprise :
   - plus aucun autre utilisateur rattaché → l'entreprise est supprimée ;
   - d'autres utilisateurs rattachés → l'entreprise est **conservée** (données partagées) ; si le compte supprimé en était le responsable, la responsabilité passe au plus ancien compte restant ;
   puis le profil `users/{uid}`.
5. **Résultat** renvoyé à l'interface : ce qui a réellement été supprimé. L'interface retire la ligne de la liste **seulement** à ce moment-là.

Ce qui n'est **pas** supprimé, volontairement : les contenus du site (pages, projets, produits, médias) même si l'administrateur supprimé les avait créés — ils ne sont pas des données personnelles du compte ; ils gardent seulement un identifiant `updatedBy` / `createdBy` désormais orphelin, sans conséquence. Les licences des **autres** comptes, les produits, les formules et les prix ne sont jamais touchés.

Erreur en cours de route : si l'étape 4 échoue après l'étape 3, la fonction répond `reason: "partial"` avec le message « Le compte de connexion est supprimé, mais le nettoyage de ses données a échoué. Relancez la suppression pour le terminer. » — relancer termine le nettoyage (la fonction accepte un compte déjà absent d'Authentication si son profil existe encore).

Journaux (identifiants uniquement, jamais d'e-mail ni de mot de passe) : Console Firebase → *Fonctions → Journaux*, ou `firebase functions:log --project archivision-studioprism`.

## 7. Droits

Les fonctions v2 s'exécutent avec le **compte de service Compute Engine par défaut** du projet : `NUMERO_DU_PROJET-compute@developer.gserviceaccount.com`. Il lui faut :

| Rôle | Pourquoi |
| --- | --- |
| `roles/firebaseauth.admin` (Administrateur Firebase Authentication) | créer et supprimer des comptes de connexion |
| `roles/datastore.user` (Utilisateur Cloud Datastore) | lire / écrire Firestore (profils, licences, entreprises) |

Dans beaucoup de projets, ce compte a déjà le rôle **Éditeur**, qui couvre les deux : il n'y a alors rien à faire. Les projets récents, ou soumis à la politique « ne pas donner le rôle Éditeur aux comptes par défaut », ne l'ont pas. **Le diagnostic le dit** : « Droits sur Firebase Authentication : INSUFFISANTS (…) ». Pour les accorder, dans Cloud Shell :

```bash
PROJECT_ID=archivision-studioprism
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="roles/firebaseauth.admin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="roles/datastore.user"
```

Ou dans la console : *IAM et administration → IAM → compte `…-compute@developer.gserviceaccount.com` → crayon → Ajouter un rôle*.

Si votre projet utilise un compte de service d'exécution **personnalisé** pour les fonctions, accordez les mêmes rôles à celui-là. Les modifications de droits prennent quelques minutes.

## 8. Appel public de la fonction (politique d'organisation)

Une fonction « callable » doit pouvoir être **appelée** par le navigateur (rôle Cloud Run Invoker accordé à `allUsers`) : c'est ce que `firebase deploy` configure par défaut. **Cela n'ouvre aucune donnée** : chaque fonction vérifie elle-même la connexion et le rôle administrateur dans Firestore avant d'agir (`accountsHealth` ne renvoie rien de sensible). Si une politique d'organisation interdit cet accès public, le déploiement affiche *« Unable to set the invoker »* et le navigateur reçoit un refus. Remède : un administrateur de l'organisation autorise l'exception pour ce projet, puis, pour chacune des 4 fonctions : console Google Cloud → *Cloud Run* → service du même nom (`admindeleteuser`…) → onglet *Sécurité* → **Autoriser les appels non authentifiés**. Sans compte Google d'organisation, rien à faire.

## 9. Vérifier que ça marche

1. **Bouton de diagnostic.** Se connecter en administrateur → *Administration → Utilisateurs* → **Vérifier le service de comptes** → **Lancer le diagnostic**. Résultat attendu :
   - ✓ Le service répond (version 2.0.0, région europe-west1)
   - ✓ Droits sur Firebase Authentication : suffisants
   - ✓ Droits sur Cloud Firestore : suffisants
2. **Contrôle en ligne de commande** (facultatif) :
   ```bash
   curl -s -X POST "https://europe-west1-archivision-studioprism.cloudfunctions.net/accountsHealth" \
        -H "Content-Type: application/json" -d '{"data":{}}'
   ```
   Attendu : `{"result":{"ok":true,"service":"studio-prism-accounts","version":"2.0.0","region":"europe-west1"}}`. Une réponse `NOT_FOUND` / `Page not found` = fonction non déployée (ou autre région).
3. **Test de suppression sans toucher à la production.** Ne supprimez **aucun** compte réel pour tester. À la place :
   1. *Administration → Utilisateurs → + Ajouter un utilisateur* : créer un compte d'essai avec une adresse que vous contrôlez (par exemple `votreadresse+test@gmail.com`) ;
   2. ouvrir sa fiche → **Supprimer le compte** → **Supprimer définitivement** (pour un administrateur, il faut en plus taper SUPPRIMER) ;
   3. contrôler : la ligne disparaît ; Console Firebase → *Authentication* : le compte a disparu ; *Firestore → users* : le profil a disparu.
4. Garde-fou à constater sans risque : la fiche de **votre propre** compte, dans l'administration, ne propose pas de bouton « Supprimer le compte ». (N'essayez pas de provoquer le refus « dernier administrateur » sur un vrai compte : il est vérifié par les tests de simulation.)

## 10. Plan B si les fonctions ne peuvent pas être déployées

C'est désormais le mode **normal** du site : voir le [§0](#0-fonctionner-sans-cloud-functions-forfait-spark-gratuit).

- **Désactiver** : fiche utilisateur → **Désactiver le compte** (réversible, données conservées, effet immédiat par les règles Firestore). Ce n'est pas une suppression du compte de connexion.
- **Supprimer à la main** : Console Firebase → *Authentication → Utilisateurs* (menu ⋮ → Supprimer le compte), puis supprimer `users/{uid}` et ses `licenses/{uid}_…` dans Firestore.

## Ce qui a été testé, et ce qui ne l'est pas

**Testé (simulation)** : `functions/handlers.js` exécuté contre un faux Admin SDK (Auth et Firestore en mémoire) : 35 cas (accès refusé à un non-administrateur / à un compte suspendu, suppression complète, entreprise partagée conservée, transfert de responsabilité, dernier administrateur, auto-suppression, compte introuvable, liste périmée, échec Authentication = rien d'autre modifié, échec du nettoyage = erreur « partial » puis reprise, idempotence, diagnostic). Côté interface : 5 messages d'erreur distincts, diagnostic, rafraîchissement de la liste après confirmation seulement, solution d'attente (suspension). Voir `TESTS.md`.

**Non testé** : l'exécution **sur le vrai projet Firebase**. Je n'ai pas accès à `cloudfunctions.net` depuis mon environnement, je n'ai pas pu déployer ni appeler la fonction, et je n'ai supprimé aucun compte de production. Je ne peux donc pas **confirmer** que la cause sur votre projet est bien « fonctions non déployées » : c'est la plus probable, et le bouton de diagnostic vous dira précisément ce qu'il en est (non déployée / droits manquants / politique d'organisation).
