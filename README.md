# Studio Prism

Site de **Studio Prism — Creative & Technical Solutions** (Prism App, Prism Game, Prism 3D, ArchiVision), avec les **comptes Studio Prism**, un **catalogue de produits**, des **licences par produit**, des **abonnements** et une **administration de contenu (CMS)** : pages, sections, projets, produits et médiathèque modifiables sans toucher au code (Firebase Authentication + Cloud Firestore + Cloud Storage + Cloud Functions).

> **Documents** : installation / mise à jour → [`README_INSTALLATION.md`](README_INSTALLATION.md) · gérer le contenu du site → [`README_ADMIN.md`](README_ADMIN.md) · gestion des comptes sans Cloud Functions, et fonctions serveur facultatives (forfait payant) → [`FONCTIONS_SERVEUR.md`](FONCTIONS_SERVEUR.md) · historique → [`CHANGELOG.md`](CHANGELOG.md) · tests réalisés et limites → [`TESTS.md`](TESTS.md).

Site statique : HTML, CSS et JavaScript, sans outil de build, publié avec **GitHub Pages**. Les données et les fichiers sont dans Firebase. **Le site fonctionne avec le forfait gratuit Firebase Spark, sans Cloud Functions** : les comptes se gèrent par **désactivation réversible** (appliquée par les règles Firestore) et chaque utilisateur peut supprimer **son propre** compte. Deux opérations restent impossibles depuis un navigateur — **créer** un compte à la place d'un utilisateur et **supprimer réellement le compte d'un autre** — et exigeraient des Cloud Functions (dossier `functions/`, conservées mais **non déployées**, forfait Blaze payant requis : voir `FONCTIONS_SERVEUR.md`).

> **Pas de paiement en ligne.** Aucun Stripe, aucun PayPal, aucun paiement automatique : une licence est ajoutée à la main par un administrateur après accord avec Studio Prism.

## Sommaire

1. [Structure du projet](#structure-du-projet)
2. [Comptes, produits, licences, abonnements](#comptes-produits-licences-abonnements)
3. [Administration du contenu (CMS)](#administration-du-contenu-cms)
4. [Installer Firebase (une seule fois)](#installer-firebase-une-seule-fois)
5. [Règles de sécurité Firestore et Storage](#règles-de-sécurité-firestore-et-storage)
6. [Fonctions serveur (Cloud Functions)](#fonctions-serveur-cloud-functions)
7. [Créer le premier administrateur](#créer-le-premier-administrateur)
8. [Lancer le site en local](#lancer-le-site-en-local)
9. [Publier sur GitHub Pages](#publier-sur-github-pages)
10. [Sécurité : ce qui est public, ce qui ne l'est pas](#sécurité--ce-qui-est-public-ce-qui-ne-lest-pas)
11. [Limites actuelles](#limites-actuelles)
12. [Vérification après installation](#vérification-après-installation)
13. [Diagnostic de la connexion](#diagnostic-de-la-connexion)
14. [À compléter avant la mise en ligne](#à-compléter-avant-la-mise-en-ligne)

## Structure du projet

```
.
├── index.html               page unique (en-tête, pied de page, conteneur des pages)
├── css/
│   ├── style.css            styles du site
│   ├── account.css          styles des comptes, de l'administration, des abonnements
│   └── cms.css              styles du CMS : sections ajoutées, éditeur de pages, médiathèque
├── js/
│   ├── app.js               routeur, pages, démonstration BIM 3D, panier, formulaires (démo)
│   ├── firebase.js          configuration Firebase + SDK (seul fichier qui importe le SDK)
│   ├── auth.js              inscription, connexion, déconnexion, mot de passe oublié, session
│   ├── admin.js             lecture et modification des comptes (réservé aux administrateurs)
│   ├── data.js              produits, formules, prix, licences, réglage du catalogue, appels aux Cloud Functions
│   ├── functions.js         client des Cloud Functions (chargé à la demande)
│   ├── seed.js              formules d'EXEMPLE d'ArchiVision (Free / Pro / Pro Entreprise), ajoutées à la demande par un admin
│   ├── account.js           en-tête / pied de page connectés, page Administration (utilisateurs)
│   ├── catalog.js           catalogue central : produits intégrés, cartes, page Produits, fiche produit, bloc commercial (formules, sélecteur de période)
│   ├── platform.js          Abonnements, Mon compte, sécurité, fiche admin, Catalogue (admin), Offres et prix (admin), diagnostic du service de comptes
│   ├── cms.js               CMS côté public : applique les pages publiées (textes, liens, images, sections, SEO), pages personnalisées, projets
│   ├── cmsdata.js           CMS : accès Firestore (pages, brouillons, projets, médias) — chargé à la demande
│   ├── storage.js           CMS : Firebase Storage (envoi / suppression de fichiers) — chargé à la demande, jamais pour un visiteur
│   ├── cmsmedia.js          administration : médiathèque et sélecteur de médias
│   ├── cmsadmin.js          administration : liste des pages et éditeur de page (sections, textes, SEO, aperçu, publication)
│   ├── cmsprojects.js       administration : projets / réalisations
│   └── boot.js              lance le routage une fois tous les scripts chargés
├── functions/               Cloud Functions (Admin SDK, côté serveur uniquement) — à DÉPLOYER chez Google
├── firebase/
│   ├── firestore.rules      règles de sécurité Firestore
│   └── firestore.indexes.json
├── storage.rules            règles de sécurité Firebase Storage (médiathèque)
├── firebase.json            configuration de la CLI Firebase (règles Firestore et Storage, index, functions)
├── .firebaserc              projet Firebase par défaut
├── assets/img/              logos et visuels
├── .nojekyll
├── README.md                ce fichier
├── README_INSTALLATION.md   mise en ligne et mise à jour pas à pas
├── README_ADMIN.md          guide d'administration : pages, sections, projets, médias
├── FONCTIONS_SERVEUR.md     configurer, déployer et vérifier les fonctions serveur
├── CHANGELOG.md             changements de cette version
└── TESTS.md                 tests réalisés, résultats, vérifications restantes
```

Navigation par adresses `#/…`. Tous les chemins sont relatifs : le site fonctionne à la racine d'un domaine comme dans le sous-dossier d'un dépôt GitHub Pages.

## Comptes, produits, licences, abonnements

Un compte Studio Prism sert pour tous les produits, **ArchiVision compris** (pas de compte séparé). Hiérarchie : **compte → produits → licences**.

### Écrans

| Adresse | Rôle |
| --- | --- |
| `#/compte/inscription`, `#/compte/connexion` | Créer un compte, se connecter, mot de passe oublié |
| `#/compte` | **Mon compte** : profil, abonnement Studio Prism (lecture seule), Mes applications (ArchiVision…), Mes licences, sécurité (changer le mot de passe, e-mail de réinitialisation, déconnexion, **supprimer mon compte**) |
| `#/produits` | **Catalogue central** : tous les produits publiés, regroupés par pôle (Prism App, Prism Game, Prism 3D), recherche et filtres (pôle, type, mode d'accès) |
| `#/produits/<produit>` | **Fiche produit** : informations, et — s'il en a — ses formules avec le sélecteur Mensuel / Trimestriel / Annuel (une seule page commerciale, pas une page par période) |
| `#/abonnements`, `#/abonnements/<produit>` | Page **publique** des abonnements : les produits qui ont au moins une formule, avec le même bloc commercial et un tableau comparatif construit depuis Firestore |
| `#/prism-app`, `#/prism-game`, `#/prism-3d` | Pages des pôles : leurs produits publiés viennent automatiquement du catalogue |
| `#/projets` | **Réalisations** : projets majeurs (ArchiVision) puis, si l'administrateur les a mis en avant, d'autres produits du catalogue |
| `#/admin` | Administration : **Utilisateurs** (liste, recherche, filtres, fiche, licences, ajout / suppression) |
| `#/admin/catalogue` | Administration : **Catalogue** (produits : création, publication, pôle, type, mise en avant) |
| `#/admin/abonnements` | Administration : **Offres et prix** (formules d'un produit et leurs prix par période) |
| `#/admin/pages`, `#/admin/pages/<page>` | Administration : **Pages** — liste de toutes les pages et éditeur de contenu (voir [CMS](#administration-du-contenu-cms)) |
| `#/admin/projets` | Administration : **Projets** (réalisations : brouillon / publié / archivé) |
| `#/admin/medias` | Administration : **Médiathèque** (images et vidéos) |
| `#/p/<adresse>` | Page **créée dans le CMS** (publiée) |
| `#/projets/<adresse>` | Fiche d'un projet **publié** dans le CMS |

Les anciennes adresses `#/abonnement`, `#/paiement` et `#/mon-abonnement` (tarifs codés en dur) sont supprimées et redirigent vers `#/abonnements` / `#/compte`. **Aucun prix n'est écrit dans le code** : tous viennent de Firestore.

Boutons d'une formule : visiteur → « Créer un compte » ; connecté sans licence du produit → « Découvrir l'offre » ; avec licence → « Gérer mon abonnement » (« Voir ma licence » pour un achat unique) ; formule sur devis, ou compte Entreprise sans licence → « Nous contacter » ; produit **indisponible** → bouton désactivé. **Aucun paiement en ligne** n'est ouvert : le détail d'une offre renvoie vers le contact, et un administrateur ajoute la licence.

### Modèle de données

| Collection | Contenu principal |
| --- | --- |
| `users/{uid}` | `firstName`, `lastName`, `email`, `accountKind` (`individual` / `company`), `subscription` (`free` / `pro` / `pro_entreprise`), `role` (`user` / `admin`), `status` (`active` / `suspended`), dates, et pour une entreprise `companyId`, `companyName`, `companyEmail`, `companyUserRange`, `companyUserLimit`, `jobTitle` |
| `companies/{id}` | `name`, `email`, `ownerUid`, `userRange`, `userLimit`, `subscription`, dates, `phone`, `website` |
| `products/{productId}` | **le produit, enregistré une seule fois** : `name`, `slug`, `category` (type : `application` / `game` / `3d` / `service` / `other`, indépendant du pôle), `pole` (`app` / `game` / `p3d`), `stage` (`concept` / `conception` / `prototype` / `beta` / `released`), `tagline`, `description`, `availability`, `info`, `platforms[]`, `logo`, `image`, `url`, `status` (`published` / `draft` / `unavailable` / `archived` = dépublié ; anciennes valeurs `active` = publié et `hidden` = brouillon toujours lues), `featured`, `displayOrder`, dates. **Aucun champ de prix ni d'abonnement : un produit n'en a pas besoin.** |
| `licenses/{userId}_{productId}` | `userId`, `productId`, `productName`, `licenseType` (`free`, `pro`, `pro_entreprise`, extensible), `status` (`active` / `suspended` / `expired`), `activatedAt`, `expiresAt` (ou `null`), `createdAt`, `updatedAt` — **une licence par utilisateur et par produit** |
| `subscriptions/{planId}` | **formule** d'un produit (0, 1 ou plusieurs par produit) : `productId`, `productName`, `name`, `slug`, `description`, `mode` (`free` gratuit / `one_time` achat unique / `subscription` abonnement / `quote` sur devis), `features[]`, `licenseType` (droit accordé), `status` (`active` / `inactive`), `featured`, `displayOrder`, dates. **Pas de prix dans ce document.** Les anciens documents « une offre = un prix » (`price`, `billingPeriod`) sont toujours lus (regroupés par produit et type de licence) et jamais détruits |
| `prices/{planId}_{période}` | **prix** d'une formule pour une période : `planId`, `productId`, `period` (`once` / `monthly` / `quarterly` / `yearly`), `amount` (> 0), `currency`, `status`, `legacyId` (identifiant de l'ancienne offre reprise), dates. Aucun prix pour une formule gratuite ou sur devis ; un abonnement peut n'avoir qu'une période |
| `settings/catalogue` | `builtinImported` (booléen) : le catalogue intégré au site a-t-il été importé dans Firestore ? (lecture publique, écriture administrateur) |
| `pages/{idPage}` | **version publiée** d'une page : `kind` (`builtin` / `custom`), `title`, `slug`, `status` (`published` / `archived`), `footer`, `content`, `mediaIds`, `revision`, dates. L'identifiant est celui de la page du site (`home`, `apropos`, `contact`…) ou `c-<adresse>` pour une page créée. Lecture publique **seulement si `published`** |
| `pageDrafts/{idPage}` | **brouillon** de la même page (`baseRevision` = révision publiée sur laquelle il repose). **Administrateur seul**, y compris en lecture |
| `projects/{idProjet}` | projet / réalisation : `title`, `slug`, `summary`, `description`, `image`, `link`, `productId`, `tags[]`, `year`, `status` (`published` / `draft` / `archived`), `featured`, `displayOrder`, dates. Lecture publique **seulement si `published`** |
| `media/{idMedia}` | **métadonnées** d'un média : `name`, `folder`, `alt`, `title`, `kind` (`image` / `video`), `mime`, `size`, `source` (`upload` / `link`), `url`, `path`, `public`, dates. Le fichier est dans Firebase Storage (`media/{idMedia}/{fichier}`). Lecture publique **d'un seul média par son identifiant** s'il est `public` ; pas de liste publique |

Le champ `content` d'une page est une structure **fermée et validée** (version `v`, `seo`, `texts`, `attrs`, `layout`, `hidden`, `extra`) : textes remplacés, liens et images remplacés, ordre et blocs masqués, sections typées ajoutées. Les clés des textes sont des **empreintes stables** (balise + rang + hachage du texte d'origine) : un texte retouché dans le code d'origine redevient « non modifié » plutôt que d'écraser la nouvelle version. Le contenu n'est **jamais** interprété comme du HTML ou du JavaScript. Les images sont des **références** `media:<identifiant>`, jamais des copies.

**Le mot de passe n'est jamais stocké** (ni dans Firestore ni ailleurs) : il est envoyé uniquement à Firebase Authentication. Un administrateur ne connaît ni ne choisit jamais le mot de passe d'un utilisateur.

### Administration

- **Utilisateurs** : liste par pages de 50, recherche (nom, e-mail, entreprise), filtres (type, abonnement, rôle, statut, application, licence), colonne **Applications / Licences** (« ArchiVision — Pro », « Prism 3D — Aucun »). Fiche : modifier abonnement / rôle / statut, **+ Ajouter une licence** (« Activer la licence »), modifier / suspendre / réactiver / supprimer une licence, **Désactiver / Réactiver le compte** (réversible, données conservées, appliqué par les règles Firestore ; le dernier administrateur actif est protégé ; ce n'est **pas** une suppression du compte de connexion). **Suppression définitive du compte d'un autre** : indisponible sans serveur (explication affichée). **+ Ajouter un utilisateur** : affiche le lien d'inscription à envoyer. **Gestion des comptes : état du service** : ce qui est disponible, indisponible ou facultatif (voir `README_ADMIN.md`, §19).
- **Catalogue** : ajouter, modifier, publier / dépublier (statut « Archivé », avec confirmation), rendre indisponible, supprimer un produit ; choisir son **pôle** et son **type** (indépendants), son avancement, sa disponibilité, ses informations utiles, ses plateformes, son logo et son image (médiathèque ou lien), sa page, son ordre, sa mise en avant dans **Réalisations**. Création en **brouillon** par défaut ; **aucune offre n'est obligatoire** (offre initiale facultative : gratuit, achat unique, abonnement, sur devis). Suppression refusée tant que des licences ou formules y sont rattachées : on le dépublie. Le bandeau **Importer le catalogue du site** copie dans Firestore les 21 produits intégrés (ArchiVision, concepts Prism Game, créations Prism 3D) sans jamais écraser un produit existant ; tant que ce n'est pas fait, ils s'affichent depuis le code, jamais en double.
- **Offres et prix** : ajouter, modifier, activer / désactiver, supprimer une **formule** (mode, droits = type de licence, fonctionnalités, ordre, recommandée) et ses **prix par période** (achat unique ; mensuel / trimestriel / annuel au choix) ; filtres par produit et statut ; bouton « Ajouter les formules d'exemple d'ArchiVision » (Free / Pro mensuel + annuel / Pro Entreprise sur devis) ; une formule à l'ancien format est convertie à l'enregistrement, ses anciens documents sont conservés (désactivés).
- Un administrateur ne peut modifier ni son propre rôle ni son propre statut, ni supprimer son propre compte, ni supprimer le dernier administrateur actif.

## Administration du contenu (CMS)

Détail pas à pas : [`README_ADMIN.md`](README_ADMIN.md). En résumé :

- **Pages** (`#/admin/pages`) : 28 pages ou familles de pages du site (Accueil, À propos et Équipe, Prism App / Game / 3D, Réalisations, ArchiVision, Services et ses 4 sous-pages, Produits, Abonnements, Contact, Rendez-vous, Devis, Support, FAQ, pages légales, fiches produit / offre / concept / création 3D, pied de page et réglages du site), plus les pages créées par l'administrateur (`#/p/<adresse>`). Pour chacune : **sections** (ordre, masquer / afficher, ajouter des sections typées : bannière, texte, texte + image, galerie, cartes, équipe, fonctionnalités, appel à l'action, contact), **textes, liens, boutons, images et textes alternatifs**, **titre et SEO**, **aperçu en direct** (ordinateur / mobile) du brouillon, **publication** et **dépublication** avec confirmation.
- **Contenu d'origine toujours présent** : une page jamais modifiée garde son contenu d'origine (celui du code). Le CMS se **superpose** à ce contenu : si Firestore est injoignable ou si rien n'est publié, le site affiche l'original — **aucune page ne peut disparaître**, aucune rubrique n'est supprimée ni renommée.
- **Statuts uniformes** : Brouillon · Publié · Archivé (dépublié, rien d'effacé). Un brouillon ou un contenu archivé n'est **jamais** lisible du public : c'est imposé par `firebase/firestore.rules`, pas par un simple masquage à l'écran.
- **Projets** (`#/admin/projets`) et **produits** (`#/admin/catalogue`) : une fiche **stockée une seule fois**, **référencée** (jamais copiée) par les sections « Cartes » de n'importe quelle page.
- **Médiathèque** (`#/admin/medias`) : envoi depuis ordinateur ou téléphone, dossiers, recherche, texte alternatif, réutilisation sur plusieurs pages, **remplacement d'un fichier sans casser les références**, suppression **refusée tant que le média est utilisé**. Fichiers dans Firebase Storage, métadonnées dans Firestore.
- **Sécurité** : seuls les administrateurs actifs écrivent (règles Firestore et Storage) ; les visiteurs lisent uniquement le publié ; aucun HTML ni script n'est jamais pris dans les données ; les liens sont limités à `https:`, `#/`, `assets/`, `mailto:`, `tel:`.
- **Aperçu** : une copie du site (même origine, `?cmsembed=1`) reçoit le brouillon par `postMessage` ; elle ne lit ni n'écrit aucune donnée.
- **Cache** : le contenu public est mémorisé 2 minutes dans le navigateur (jusqu'à 24 h en secours si Firestore est injoignable).

## Installer Firebase (une seule fois)

Projet Firebase par défaut : `archivision-studioprism` (voir `js/firebase.js` et `.firebaserc`). Pour un autre projet, remplacer `firebaseConfig` dans `js/firebase.js` et le projet dans `.firebaserc`.

1. **Authentication** : *Build → Authentication → Sign-in method* → activer **Adresse e-mail / Mot de passe**.
2. **Domaines autorisés** : *Authentication → Settings → Authorized domains* → ajouter `UTILISATEUR.github.io` (et le domaine personnalisé éventuel).
3. **E-mail de réinitialisation** : *Authentication → Templates → Réinitialisation du mot de passe* → langue Français. Cet e-mail sert aussi à un utilisateur créé par un administrateur pour choisir son mot de passe.
4. **Firestore** : *Build → Firestore Database → Créer une base de données* (mode production).
5. **Règles Firestore** : voir ci-dessous (indispensable).
6. **Storage** (médiathèque) : *Build → Storage → Commencer*, puis publier `storage.rules` (voir ci-dessous). Sans Storage, le site fonctionne, mais l'envoi de fichiers dans la médiathèque est impossible (les médias « par lien » restent utilisables).
7. **Cloud Functions** (**facultatif, payant**) : exigent le forfait **Blaze** ; **inutile** pour utiliser le site (`ACCOUNT_SERVER = false` dans `js/data.js`). Voir [Fonctions serveur](#fonctions-serveur-cloud-functions) et [`FONCTIONS_SERVEUR.md`](FONCTIONS_SERVEUR.md), §0.
8. *(Recommandé)* Restreindre la clé API Web (Google Cloud → *Credentials* → *Websites* : `https://UTILISATEUR.github.io/*`, `http://localhost:*/*`).

Firebase Analytics n'est **pas** activé.

## Règles de sécurité Firestore et Storage

Fichier : `firebase/firestore.rules` (collections utilisées par le site : `users`, `companies`, `products`, `subscriptions`, `prices`, `settings/catalogue`, `licenses`, `pages`, `pageDrafts`, `projects`, `media` — tout le reste est refusé). Aucune règle `if true`, aucune règle « connecté = tout ».

- **Administrateur** = `role == "admin"` **et** `status == "active"` dans `users/{uid}` (lu dans Firestore à chaque requête, un seul accès par requête).
- **Utilisateur** : lit son profil ; peut modifier seulement son prénom, son nom, sa fonction (compte Entreprise) et ses dates (`lastLogin`, `updatedAt`). Il ne peut ni devenir administrateur, ni modifier son rôle, son statut ou son abonnement, ni créer ou modifier une licence, ni toucher au catalogue ou aux offres, ni lire, modifier ou supprimer le compte d'un autre.
- **Administrateur actif** : liste les comptes, modifie `role`, `subscription`, `status` d'un autre compte (jamais son propre rôle ni son propre statut), gère produits, offres, licences et les coordonnées des entreprises.
- **Produits** : lecture publique des produits `published`, `unavailable` et (anciens documents) `active` ; les brouillons ne sont lisibles que par un administrateur actif ; écriture réservée à l'administrateur, valeurs validées (listes fermées, liens `https://`, `#/` ou `assets/`). **Aucune règle n'exige de formule, de prix ou d'abonnement pour créer ou publier un produit.**
- **Formules et prix** : lecture publique des seules formules et des seuls prix `active` ; écriture réservée à l'administrateur. Un prix a pour identifiant `{formule}_{période}`, appartient au même produit que sa formule et à une période compatible avec son mode (achat unique → `once` ; abonnement → mensuel, trimestriel, annuel ; aucun prix pour gratuit / sur devis) — la formule étant créée dans le même lot (`getAfter`). Les anciennes offres restent modifiables (activer / désactiver, conversion) mais ne sont plus créées.
- **CMS** : `pages` — lecture publique des seules pages `published` (une page archivée n'est lisible que d'un administrateur) ; `pageDrafts` — administrateur seul, lecture comprise ; `projects` — lecture publique des seuls projets `published` ; `media` — lecture publique d'**un** média par son identifiant s'il est `public`, liste réservée à l'administrateur. Écriture réservée à l'administrateur actif, avec **validation complète des champs** (listes fermées, longueurs, formats d'adresses, limites : 800 textes, 400 liens / images, 40 sections ajoutées par page).
- **Réglage du catalogue** : `settings/catalogue` lisible par tous (un seul document, jamais de liste), modifiable par l'administrateur, non supprimable.
- **Licences** : un utilisateur lit uniquement les siennes (`where userId == uid`) ; création, modification, suspension et suppression réservées à l'administrateur.
- **Entreprise** : lisible par son responsable, par les comptes rattachés (`users/{uid}.companyId`) et par un administrateur. Aucune liste pour un utilisateur.
- Suppression de compte depuis le navigateur : **uniquement par un particulier actif, pour son propre compte** (mot de passe redemandé, licences + profil supprimés dans un lot, puis `deleteUser`). Jamais celui d'un autre, d'un administrateur ni d'une entreprise (Cloud Functions uniquement). Un compte **désactivé** ne peut ni lire ses licences, ni modifier ou supprimer son profil, ni accéder à son entreprise.
- Les écritures par lots du site sont limitées à 10 documents : Firestore plafonne à 20 les accès `get()` / `exists()` des règles pour un lot entier.

Déploiement :

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

ou copier-coller **tout** le fichier dans *Console Firebase → Firestore Database → Règles*, puis **Publier**. Vérifier ensuite que la date de publication affichée est récente et que le texte publié contient `match /products/{pid}`.

**Storage** — fichier `storage.rules`, dossier unique `media/{identifiant}/{fichier}` : **écriture et suppression réservées à l'administrateur actif** (reconnu par une lecture de `users/{uid}` dans Firestore), images JPEG / PNG / WebP / GIF ≤ 8 Mo, vidéos MP4 / WebM ≤ 50 Mo, nom de fichier restreint, **aucun écrasement** ; lecture par le SDK réservée aux administrateurs (les visiteurs voient les images grâce à l'adresse de téléchargement, secrète et non devinable, enregistrée dans les métadonnées d'un média public) ; tout le reste du bucket est refusé. Déploiement : `firebase deploy --only storage`, ou console → *Storage → Règles*. Au premier déploiement, accepter l'autorisation inter-services proposée (`README_INSTALLATION.md`, étape B).

> **Symptôme « Accès refusé par les règles de sécurité… »** sur la page Abonnements, dans Mon compte ou dans Administration (alors que la connexion fonctionne) : les règles publiées dans Firebase ne contiennent pas toutes les collections (`products`, `subscriptions`, `licenses`, `pages`, `pageDrafts`, `projects`, `media`) : ancienne version, ou publication échouée. Publier le fichier ci-dessus.

> Les règles n'ont pas pu être exécutées contre un vrai projet Firebase pendant leur préparation : elles ont été vérifiées avec un interpréteur de règles maison (Firestore : 546 cas et 208 mutations dont 6 équivalentes ; Storage : 45 cas et 25 mutations dont 1 équivalente — voir `TESTS.md`). Après déploiement, suivre la [vérification](#vérification-après-installation) ; le **Simulateur de règles** de la console permet de tester chaque cas.

## Fonctions serveur (Cloud Functions)

Dossier `functions/` (Node 22, région `europe-west1`, fonctions « callable » v2). Elles utilisent l'**Admin SDK avec les identifiants du projet fournis par Google** : **aucune clé privée n'est dans le dépôt, ni nécessaire**.

| Fonction | Qui | Effet |
| --- | --- | --- |
| `adminCreateUser` | administrateur actif | crée le compte Authentication + `users/{uid}` (+ entreprise) ; mot de passe aléatoire jetable que **personne ne connaît** ; le navigateur envoie ensuite l'e-mail de choix du mot de passe |
| `adminDeleteUser` | administrateur actif | supprime le compte de connexion **puis** le profil, les licences et — seulement si plus aucun autre utilisateur n'y est rattaché — l'entreprise ; refuse de se supprimer soi-même, le dernier administrateur actif, ou un compte qui ne correspond plus à celui affiché ; renvoie un résumé explicite |
| `deleteMyAccount` | l'utilisateur connecté | même suppression pour son propre compte ; exige une connexion de moins de 5 minutes (mot de passe redemandé) |
| `accountsHealth` | tout le monde (« le service répond ? ») ; administrateur actif (droits du service) | diagnostic, sans effet de bord : alimente le bouton **Vérifier le service de comptes** |

> **Un ZIP ou un envoi sur GitHub ne déploie pas ces fonctions**, et elles exigent le forfait payant Blaze : **ne les déployez pas si vous restez sur le forfait gratuit** (le site n'en a plus besoin). Si vous passez volontairement sur Blaze : `firebase deploy --only functions`, droits `roles/firebaseauth.admin` et `roles/datastore.user` si besoin, `ACCOUNT_SERVER = true` dans `js/data.js`, puis diagnostic. Procédure complète : **[`FONCTIONS_SERVEUR.md`](FONCTIONS_SERVEUR.md)**.

Déploiement résumé :

```bash
cd functions && npm install && cd ..
firebase deploy --only functions --project archivision-studioprism
```

Si la région change, la modifier aussi dans `js/functions.js` (`FUNCTIONS_REGION`). Journaux : `firebase functions:log` (identifiants uniquement, pas d'e-mail ni de mot de passe).

> Les fonctions n'ont **pas** été exécutées sur un vrai projet Firebase (simulation de l'Admin SDK, 35 cas). À tester après déploiement (`FONCTIONS_SERVEUR.md`, §9).

## Créer le premier administrateur

Personne ne peut se déclarer administrateur depuis le site. Le premier se définit **à la main** :

1. Se connecter au site avec le compte concerné : le profil `users/{uid}` est créé automatiquement (`role: user`, `subscription: free`, `status: active`).
2. *Console Firebase → Firestore Database → Données → `users` → document portant l'UID du compte* → champ `role` : `admin` (string).
3. Se déconnecter puis se reconnecter : l'entrée **Administration** apparaît.
4. Dans **Administration → Catalogue**, cliquer sur **Importer le catalogue du site** (les 21 produits intégrés), puis, si besoin, dans **Offres et prix**, « Ajouter les formules d'exemple d'ArchiVision » ; ajuster ensuite produits, formules et prix. Ajouter les licences des utilisateurs depuis leur fiche.

Les administrateurs suivants se nomment depuis la fiche d'un utilisateur (Modifier → Rôle).

## Lancer le site en local

Les comptes utilisent des modules JavaScript (`import`) : ils **ne fonctionnent pas** en ouvrant `index.html` directement (`file://`). Utiliser un petit serveur local :

```bash
python3 -m http.server 8000
```

Puis ouvrir <http://localhost:8000>. (Le reste du site s'affiche aussi sans serveur, mais pas les comptes.)


## Publier sur GitHub Pages

1. Créer un dépôt sur GitHub (par exemple `studio-prism`) et y envoyer le contenu de ce dossier :
   ```bash
   git init -b main
   git add .
   git commit -m "Site Studio Prism"
   git remote add origin https://github.com/UTILISATEUR/studio-prism.git
   git push -u origin main
   ```
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`, **Save**.
3. Après une minute environ, le site est disponible sur `https://UTILISATEUR.github.io/studio-prism/`.
4. Vérifier que ce domaine figure dans les **domaines autorisés** Firebase (étape 2 de l'installation).

Domaine personnalisé : **Settings → Pages → Custom domain**, puis l'ajouter aussi aux domaines autorisés Firebase.


## Sécurité : ce qui est public, ce qui ne l'est pas

- La configuration Web Firebase (`apiKey`, `projectId`…) de `js/firebase.js` est **publique par conception** : elle ne donne aucun droit. La sécurité repose sur Authentication, les règles Firestore et les Cloud Functions.
- **Ne jamais** mettre une clé privée Firebase Admin SDK, un fichier de compte de service ou un secret dans le HTML, le CSS, le JavaScript client ni le dépôt GitHub public. Les Cloud Functions n'en ont pas besoin.
- Les droits ne reposent jamais sur le JavaScript du navigateur : masquer un bouton n'empêche rien ; ce sont les règles et les fonctions serveur qui décident.
- Les données Firestore sont **échappées** avant affichage ; les liens d'un produit (logo, image, URL) ne sont acceptés qu'en `https://`, `#/` ou `assets/`.
- **CMS** : le contenu des pages est une structure validée (types, longueurs, adresses `https:` / `#/` / `assets/` / `mailto:` / `tel:`) ; il n'est jamais interprété comme du HTML ou du JavaScript ; l'aperçu n'a aucun accès aux données ; les écritures exigent un administrateur actif, vérifié dans Firestore à chaque requête.
- Les messages d'erreur Firebase bruts ne sont jamais affichés : ils sont remplacés par des messages en français.
- « Mot de passe oublié » répond de la même façon que l'adresse existe ou non.

## Limites actuelles

- **Aucun paiement** : les licences sont ajoutées à la main par un administrateur. Un paiement en ligne serait un chantier distinct (backend + webhook). Les prix affichés sont informatifs.
- **Médiathèque** : images JPEG / PNG / WebP / GIF ≤ 8 Mo, vidéos MP4 / WebM ≤ 50 Mo ; fichiers **publics** (adresse de téléchargement non devinable mais non protégée) : rien de confidentiel. Les visuels des produits restent utilisables par lien (`assets/…`, `https://…`).
- **Cache** : le catalogue et le contenu des pages sont relus au plus tard 2 minutes après une modification faite en administration (ou au rechargement de la page).
- **CMS** : les sections d'origine d'une page se modifient, se déplacent et se masquent mais ne se suppriment pas ; pas de mise en forme libre (gras, couleurs) ; pas de planification de publication ni d'historique complet des versions ; pas de multilingue. Le **SEO** modifiable est appliqué par le navigateur (titre, description, partage) ; les robots qui ne lisent que le HTML de base voient les balises d'origine de `index.html`.
- **Édition à plusieurs** : un conflit (page publiée entre-temps par un autre administrateur) est détecté à la publication et refusé, pas en temps réel.
- **Désactivation** : un compte `suspended` (affiché « Désactivé ») est refusé par le site et perd ses droits dans les règles (relues à chaque requête) ; ses données sont conservées ; il peut être réactivé. Son compte de connexion reste dans Authentication : seule la Console Firebase (gratuit, à la main) ou une Cloud Function le supprime.
- **Inscription interrompue** : si l'annulation d'une inscription échoue, un profil Particulier est recréé à la connexion suivante (les informations Entreprise ne sont alors pas reprises).
- **Licences expirées** : `expiresAt` dépassée est affichée « Expirée » côté site ; le statut stocké n'est pas modifié automatiquement (pas de tâche planifiée).
- **Recherche** : filtrage sur les comptes déjà chargés ; au-delà de quelques milliers de comptes, prévoir un index de recherche dédié.
- **Version du SDK** : `10.14.1`, indiquée dans `js/firebase.js` et `js/functions.js`.
- **Durcissement possible** : App Check, vérification de l'e-mail, double authentification des administrateurs, tests des règles avec l'émulateur Firebase.

## Vérification après installation

Sur le site publié (ou en local), avec le vrai projet Firebase :

1. Créer un compte **Particulier** → arrivée sur **Mon compte** ; la console montre `users/{uid}` (`role: user`, `subscription: free`). Se déconnecter, se reconnecter, recharger (session conservée).
2. Passer ce compte en `admin` (console) → **Administration** : utilisateurs, catalogue, offres et prix. Importer le catalogue du site.
3. Créer un produit de test **sans aucune offre**, le publier : il apparaît dans **Produits**, sur la page de son pôle, et (mis en avant) dans **Réalisations**, une seule fois chacun. Lui ajouter une formule d'abonnement mensuel + annuel : la fiche produit montre le sélecteur Mensuel / Annuel.
4. Page publique **Abonnements** (déconnecté) : les produits qui ont des formules, boutons « Créer un compte ».
5. Fiche d'un autre utilisateur → **+ Ajouter une licence** (ArchiVision, Pro) ; se connecter avec ce compte : la carte ArchiVision et « Mes licences » s'affichent.
6. **+ Ajouter un utilisateur** : l'e-mail de choix du mot de passe arrive ; l'utilisateur se connecte avec **son** mot de passe.
7. Avec un compte non administrateur : aucune liste d'utilisateurs ; dans la console du navigateur, lire `users`, écrire `licenses` ou `products` → `permission-denied`.
8. **Administration → Utilisateurs → Vérifier le service de comptes → Lancer le diagnostic** : service déployé, droits Authentication et Firestore suffisants.
9. **Supprimer mon compte** (compte de test créé pour l'occasion) : le compte disparaît d'Authentication, de `users`, de `licenses`.
10. Supprimer un **compte d'essai** depuis l'administration ; vérifier qu'il n'est plus dans Authentication ni Firestore, et qu'une entreprise partagée est conservée. Ne jamais tester sur un compte réel.
11. **CMS** : envoyer une image dans la médiathèque ; modifier un texte de l'Accueil, **Publier…**, vérifier en navigation privée (et après rechargement) ; **Dépublier…** : le texte d'origine revient ; un projet en brouillon n'apparaît pas dans Réalisations pour un visiteur, publié il apparaît (`README_ADMIN.md`).

## Diagnostic de la connexion

`js/auth.js` écrit chaque étape de la connexion dans la console du navigateur (F12 → Console), préfixée par `[AUTH]`, avec le temps écoulé :

```
[AUTH] signIn start
[AUTH] persistence configured
[AUTH] signInWithEmailAndPassword start
[AUTH] Firebase Authentication success        ← l'authentification est terminée
[AUTH] Firestore profile read start           ← lecture de users/{uid}
[AUTH] Firestore UID: …
[AUTH] Firestore exists: true | false
[AUTH] Firestore error: <code> / <message>    ← seulement en cas d'erreur
[AUTH] Firestore profile read success — status=… role=… subscription=…
[AUTH] profile state emitted
[AUTH] signIn complete
```

La **dernière ligne affichée** indique où ça bloque : après `signInWithEmailAndPassword start` → Authentication ; après `Firestore profile read start` → Firestore (base non créée, règles, réseau ou bloqueur de contenus). Chaque cause a son propre message à l'écran :

| Cause | Message affiché |
| --- | --- |
| E-mail / mot de passe incorrects | « E-mail ou mot de passe incorrect. » |
| Authentication injoignable | « Connexion impossible : vérifiez votre connexion internet… » (`auth/network-request-failed`) ou « Firebase Authentication ne répond pas… » (`app/auth-timeout`, 35 s) |
| Règles Firestore refusent la lecture / non déployées | « Authentification réussie, mais la lecture de votre profil a échoué. Accès refusé… » (`permission-denied`) |
| Firestore sans réponse | « Authentification réussie, mais la lecture de votre profil (Firestore) ne répond pas… » (`app/firestore-timeout`, 15 s) |
| Document `users/{uid}` absent | **créé automatiquement** (Particulier / free / user / active). Si la création est refusée : « Authentification réussie, mais la lecture de votre profil a échoué. Accès refusé… » (`permission-denied`, règles non déployées) |
| Document sans `status` valide | « Votre profil Studio Prism est incomplet… » (`app/profile-invalid`) |
| `status = suspended` | « Ce compte est désactivé… » (`app/suspended`) |

Le message générique « Le service met trop de temps à répondre » (`app/timeout`) n'existe plus que pour l'inscription. Une fois le diagnostic terminé, mettre `const DEBUG = false` en haut de `js/auth.js`.


## À compléter avant la mise en ligne

- Les pages légales (mentions légales, confidentialité, conditions d'utilisation, cookies) contiennent encore des champs **`[À COMPLÉTER]`** (objet `LT` de `js/app.js`) : identité de l'éditeur, hébergeur, contact, durées de conservation, etc. Les textes ont été adaptés aux comptes (données collectées, finalités, services tiers Google/Firebase, stockage technique de session) mais doivent être relus et validés par vos soins.
- Contact, devis, rendez-vous, support et panier restent des **interfaces de démonstration** : GitHub Pages n'héberge que des fichiers statiques et aucun service d'envoi ou de paiement n'est branché.


## Ressources externes

- Police **Inter** (Google Fonts).
- **three.js r128** (cdnjs), chargé uniquement sur les pages qui affichent de la 3D.
- **SDK Firebase** (`www.gstatic.com`), chargé pour les comptes.

© 2026 Studio Prism. Tous droits réservés.
