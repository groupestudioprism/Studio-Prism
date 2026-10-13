# Changelog

## Évolution « Gestion des comptes sans Cloud Functions (forfait Spark gratuit) » — 2026-10-10

Objectif : **zéro dépense**, aucune dépendance à un déploiement de Cloud Functions (qui exige le forfait Blaze), sécurité conservée. Aucun design, menu, rôle, compte ni autre fonction du site n'est modifié. Les Cloud Functions du dossier `functions/` sont **conservées telles quelles** (version `2.0.0`), simplement non utilisées tant que `ACCOUNT_SERVER` vaut `false`. **Rien n'est déployé, aucune règle n'est publiée, aucun forfait n'est changé** par cette évolution.

- **Diagnostic** : `app/functions-unreachable` n'était pas un défaut du code : les 4 fonctions n'ont jamais pu être déployées sur Spark. Le site ne les appelle plus (`js/data.js` : `ACCOUNT_SERVER = false` ⇒ `app/server-disabled`, aucune requête `cloudfunctions.net`).
- **Désactivation / réactivation réversible** d'un compte depuis l'administration (`js/platform.js`, `js/account.js`) : statut **Désactivé** affiché dans la liste et la fiche, confirmation avec conséquences, message explicite « ce n'est pas une suppression du compte de connexion », données conservées.
- **Appliquée par les règles Firestore** (`firebase/firestore.rules`, **non publiées**) : nouvelle fonction `isActiveUser()` ; un compte désactivé ne lit plus ses licences ni son entreprise, ne modifie plus son profil, ne supprime plus son profil ni ses licences ; un administrateur désactivé perd tous ses droits (déjà le cas via `isAdmin()`).
- **Dernier administrateur actif protégé** : garde de l'interface (`guardAdminChange`, `countActiveAdmins()` dans `js/admin.js`) **et** règles (nul ne peut modifier son propre rôle ni son propre statut).
- **Suppression de son propre compte** rétablie sans serveur pour les comptes **individuels actifs** : mot de passe redemandé, suppression des licences + profil dans un seul lot, puis `deleteUser` du SDK ; règle `users` `delete` strictement limitée (propriétaire, rôle `user`, statut `active`, compte individuel) ; plafond de 6 licences (limite de 20 accès par lot des règles). Échec de la dernière étape : message honnête (`app/self-delete-partial`).
- **Suppression définitive du compte d'un autre utilisateur** : **indisponible** sans serveur privilégié, bouton remplacé par une explication (« Pourquoi ? ») ; jamais remplacée par la seule suppression du document Firestore.
- **Ajouter un utilisateur** : affiche le lien d'inscription à envoyer (pas de création côté serveur).
- **Diagnostic** réécrit (« Gestion des comptes : état du service ») : distingue disponible / indisponible sans serveur / fonctions non déployées / désactivation / suppression définitive ; test facultatif des fonctions ; l'absence de Cloud Functions n'est plus présentée comme une panne.
- **Documentation** : `FONCTIONS_SERVEUR.md` §0, `README_ADMIN.md` §19, `README_INSTALLATION.md` (étape C facultative et payante), `TESTS.md`.
- **Pour repasser en mode « avec serveur »** (Blaze, payant, volontaire) : déployer les fonctions puis mettre `ACCOUNT_SERVER = true` (`FONCTIONS_SERVEUR.md`, §0).

## Évolution « CMS complet et correction de la suppression des comptes » — 2026-10-10

Évolution du site existant, **sans refonte** : design, navigation, pages, rubriques, comptes, rôles, licences, catalogue, formules et prix, configuration Firebase sont conservés. Base de départ : commit `674b35c` (livraison « catalogue central »). Documents nouveaux : `README_ADMIN.md`, `FONCTIONS_SERVEUR.md`.

> **À faire hors du ZIP** (un ZIP ou GitHub ne les déploient pas) : republier les règles Firestore, activer Storage et publier `storage.rules`, **déployer les fonctions serveur**. Pas à pas : `README_INSTALLATION.md`, `FONCTIONS_SERVEUR.md`.

### Suppression des comptes — réparée et diagnostiquée

- **Cause** : la suppression réelle d'un compte passe par une Cloud Function (`adminDeleteUser`) qui n'est pas déployée par GitHub Pages ; le code client rangeait en plus **toutes** les causes d'échec sous un seul message (« Le service de gestion des comptes… est indisponible ou n'est pas encore déployé »). Cause la plus probable : fonctions non déployées sur le projet. **Non confirmable depuis l'environnement de développement** (pas d'accès à `cloudfunctions.net`) : le diagnostic intégré la révèle sur votre projet.
- **Messages précis** (`js/data.js`, `js/account.js`) : SDK non chargé · fonction non déployée · aucune réponse (réseau, CORS, droits d'appel) · appel refusé · réponse du serveur (message français de la fonction).
- **Nouvelle fonction `accountsHealth`** et boutons **Vérifier le service de comptes** (Administration → Utilisateurs) / **Lancer le diagnostic du service** (sous chaque erreur) : service déployé ? version, région, droits sur Authentication et Firestore.
- **Suppression complète et sûre** (`functions/handlers.js`, version `2.0.0`) : contrôle administrateur côté serveur (rôle lu dans Firestore) · suppression par **UID** · lecture de tout avant d'écrire · **compte de connexion supprimé en premier** (s'il échoue, rien d'autre n'est modifié) · puis licences, profil, entreprise (supprimée seulement si plus aucun autre membre ; sinon conservée et responsabilité transférée au plus ancien membre) · jamais de donnée d'un autre utilisateur touchée · reprise possible après échec partiel (`reason: "partial"`) · compte introuvable explicite · liste périmée refusée (e-mail confirmé) · auto-suppression refusée · **dernier administrateur actif protégé** (aussi pour la suppression par un administrateur).
- **Interface** : résumé réel de ce qui a été supprimé ; la ligne n'est retirée de la liste **qu'après confirmation du serveur** ; jamais de succès sans `ok: true` ; bouton « Relancer la suppression » après échec partiel ; solution d'attente « suspendre ce compte ».

### Administration du contenu (CMS)

- **Pages** (`#/admin/pages`, `js/cmsadmin.js`) : liste de 28 pages ou familles de pages (Accueil, À propos et Équipe, Prism App / Game / 3D, Réalisations, ArchiVision, Services + 4 sous-pages, Produits, Abonnements, Contact, Rendez-vous, Devis, Support, FAQ, pages légales, fiches produit / offre / jeu / 3D, pied de page et réglages) + pages créées (`#/p/<adresse>`). Éditeur à trois onglets (**Sections**, **Textes et liens**, **Page et référencement**), aperçu en direct ordinateur / mobile, brouillon enregistré automatiquement, **publier / dépublier / abandonner le brouillon / supprimer** avec confirmation, détection de conflit de révision.
- **Sections** : ordre, masquer / afficher, **sections typées ajoutées** (bannière, texte, texte + image, galerie, cartes, équipe, fonctionnalités, appel à l'action, contact), dupliquer, supprimer. Validation de chaque champ (obligatoire, longueur, adresse, e-mail, téléphone) avant publication ; avertissements (texte alternatif manquant, média non public, élément non publié référencé).
- **Textes, liens, boutons, images, textes alternatifs, SEO** (titre, description, image de partage, non-indexation) modifiables sur les pages existantes, sans toucher au code. **Contenu d'origine conservé** : une page non modifiée est inchangée ; en cas de panne ou de contenu absent, le site retombe sur l'original (aucune page ne disparaît, aucune rubrique n'est supprimée ni renommée).
- **Rendu public** (`js/cms.js`) : applique les pages publiées par-dessus le contenu d'origine ; rien n'est jamais pris comme HTML ou JavaScript ; liens limités à `https:`, `#/`, `assets/`, `mailto:`, `tel:` ; cache 2 minutes (24 h en secours).
- **Projets** (`#/admin/projets`, `js/cmsprojects.js`) : brouillon / publié / archivé, fiche `#/projets/<adresse>`, apparition dans Réalisations ; stockés une fois, réutilisés par référence.
- **Statuts uniformes** Brouillon · Publié · Archivé (dépublié) pour pages, projets, réalisations et produits. **Produits** : « Dépublier » demande maintenant une confirmation et place le produit en **Archivé** (au lieu de Brouillon) ; « Republier » le remet en ligne ; `active` / `hidden` restent lus comme Publié / Brouillon. Un contenu non publié n'est **jamais** lisible du public (imposé par les règles Firestore).
- **Médiathèque** (`#/admin/medias`, `js/cmsmedia.js`, `js/storage.js`) : envoi par glisser-déposer ou sélecteur (ordinateur, téléphone), dossiers, recherche, filtres (type, sans texte alternatif), métadonnées (nom, titre, texte alternatif, public), médias par lien, **utilisation affichée**, **remplacement d'un fichier sans casser les références**, **suppression refusée tant que le média est utilisé**. Sélecteur de média dans l'éditeur de pages, les projets et les produits (logo, image). Références `media:<id>`, jamais de copies.
- **Réutilisation** : un produit / projet est enregistré une fois et affiché sur autant de pages que voulu (sections « Cartes ») ; un élément dépublié disparaît des cartes.
- Onglets d'administration : Utilisateurs, Catalogue, Offres et prix, **Pages**, **Projets**, **Médiathèque**.
- `index.html` : métadonnées `description` et Open Graph de base ; nouveaux scripts et feuille de style du CMS.

### Sécurité

- `firebase/firestore.rules` : nouvelles collections `pages` (lecture publique des seules pages `published`), `pageDrafts` (administrateur seul), `projects` (lecture publique des seuls `published`), `media` (lecture d'un média public par son identifiant, liste administrateur) ; écriture réservée à l'administrateur actif avec validation complète des champs ; statut produit `archived` ; tout le reste refusé. Pas de règle `if true`.
- **Nouveau `storage.rules`** : écriture / suppression administrateur actif uniquement, images JPEG / PNG / WebP / GIF ≤ 8 Mo, vidéos MP4 / WebM ≤ 50 Mo, pas d'écrasement, nom de fichier restreint, tout le reste refusé. `firebase.json` : entrée `storage`.
- Aucun secret côté client, aucune clé privée dans le dépôt ni dans l'archive ; personne ne devient administrateur automatiquement.

### Fichiers

- **Nouveaux** : `js/cms.js`, `js/cmsdata.js`, `js/cmsadmin.js`, `js/cmsprojects.js`, `js/cmsmedia.js`, `js/storage.js`, `css/cms.css`, `storage.rules`, `README_ADMIN.md`, `FONCTIONS_SERVEUR.md`.
- **Modifiés** : `firebase/firestore.rules`, `firebase.json`, `functions/handlers.js`, `functions/index.js`, `index.html`, `js/account.js`, `js/app.js`, `js/catalog.js`, `js/data.js`, `js/platform.js`, `css/account.css`, `README.md`, `README_INSTALLATION.md`, `CHANGELOG.md`, `TESTS.md`.
- Aucun fichier supprimé ni renommé.

### Migrations

Aucune migration de données obligatoire ni script d'import (`README_INSTALLATION.md`, §F) : les collections du CMS se créent au premier enregistrement, les pages sans version publiée gardent leur contenu d'origine, les anciens statuts produit restent lus.

### Limites connues de cette version

- Testé en **simulation** (faux SDK Firebase, interpréteur de règles maison, faux Admin SDK), **pas** sur le vrai projet Firebase : voir `TESTS.md`.
- Sections d'origine : modifiables, déplaçables, masquables, mais non supprimables. Pas de mise en forme libre, de planification, d'historique complet, de multilingue.
- SEO appliqué par le navigateur (pas de rendu serveur).
- Fichiers de la médiathèque publics.

---

## Évolution « catalogue central, Produits, formules et prix » — 2026-10-09

Évolution du site existant, **sans refonte** : structure, design, Firebase, authentification, rôles, données et permissions sont conservés. Base de départ : version locale (commit `5be1f68`), qui ne diffère du dépôt GitHub (`4234a86`) que par la réécriture des règles Firestore.

### Navigation

- **Nouvel onglet principal « Produits »** (`#/produits`), entre Contact et Abonnements, aussi dans le pied de page et le menu mobile.
- **« Abonnements »** conservé (`#/abonnements`).
- **« Projets → Réalisations »** : la page met en avant les projets majeurs (ArchiVision) puis, si un administrateur les a « mis en avant », une sélection de produits du catalogue. Les concepts Prism Game / Prism 3D restent présentés comme des concepts.
- Toutes les sections et sous-sections existantes sont conservées (Studio : À propos, Équipe ; Univers : Prism App, Prism Game, Prism 3D ; Projets : Réalisations, ArchiVision ; Services : Applications, BIM / XR, Expériences interactives, Prototypage & impression 3D ; Contact : Contact, Rendez-vous).
- « Passer à Pro » : déjà absent de la version de départ, aucune trace réintroduite.
- « Rendez-vous » : accès conservé tel quel (aucun lien ajouté ou retiré).

### Catalogue central (un produit = un seul enregistrement)

- Chaque produit est enregistré **une seule fois** (`products/{id}`) et apparaît **automatiquement** : dans **Produits**, sur la page de **son pôle** (Prism App / Prism Game / Prism 3D) et, s'il est mis en avant, dans **Réalisations**. Aucun doublon.
- Les 21 produits déjà présents dans le site (ArchiVision, 10 concepts Prism Game, 10 créations Prism 3D) forment un **catalogue intégré**, affiché sans doublon avec les produits Firestore. Le bouton **Importer le catalogue du site** (Administration → Catalogue) les copie dans Firestore sans rien écraser.
- Page **Produits** : produits publiés par pôle, recherche, filtres (pôle, type, mode d'accès). **Fiche produit** (`#/produits/<produit>`).
- Formulaire d'administration : nom, accroche, description, visuels (logo, image, par lien), **statut brouillon / publié / indisponible**, informations utiles, **pôle**, **type indépendant du pôle**, avancement, disponibilité, plateformes, page dédiée, ordre, mise en avant. Création en brouillon par défaut. Publier, dépublier, rendre indisponible, supprimer (refusé tant que des licences ou formules y sont rattachées).
- Les anciens statuts `active` (= publié) et `hidden` (= brouillon) sont toujours lus.

### Système commercial flexible (aucun produit n'exige un abonnement)

- **Aucun champ de prix ni d'abonnement dans un produit.** Créer, modifier ou publier un produit n'exige jamais de formule.
- Nouveau modèle séparé : **produit** (`products`) / **formule** (`subscriptions`, mode `free` gratuit, `one_time` achat unique, `subscription` abonnement, `quote` sur devis, avec droits = `licenseType` et `features`) / **prix par période** (`prices/{formule}_{période}` : `once`, `monthly`, `quarterly`, `yearly`) / **licences** (`licenses`, inchangées).
- Un produit peut avoir 0, 1 ou plusieurs formules ; une formule d'abonnement peut n'avoir qu'une période. Gratuit + payant, achat unique + abonnement, ou devis seul sont possibles.
- **Une seule page commerciale par produit** (fiche produit et `#/abonnements/<produit>`) avec **sélecteur Mensuel / Trimestriel / Annuel** : le prix affiché suit la période choisie ; une formule non disponible dans la période choisie l'indique.
- Administration → **Offres et prix** : formules et prix par période, filtres produit / statut, formules d'exemple d'ArchiVision (facultatives).
- **Compatibilité** : les anciennes offres (« une offre = un prix », `price` / `billingPeriod`) sont lues, regroupées par produit et type de licence, et affichées ; conservées si elles ne sont pas modifiées ; converties en formule + prix à l'enregistrement, leurs anciens documents étant conservés (désactivés). Identifiants existants (`archivision-free`, `archivision-pro`…) conservés.
- Colonne « Applications / Licences » de la liste des utilisateurs : seuls les produits publiés ayant une formule active (ou pour lesquels l'utilisateur a une licence) y figurent.
- **Aucun paiement** : ni Stripe, ni PayPal, ni paiement simulé. Une licence est ajoutée à la main par un administrateur.

### Règles Firestore (`firebase/firestore.rules`, fichier complet)

- Nouvelles collections : `prices`, `settings/catalogue` (lecture publique d'un seul document, écriture administrateur, suppression interdite).
- `products` : validation des champs (listes fermées, liens `https://`, `#/` ou `assets/`), lecture publique des produits publiés / indisponibles (et anciens `active`), brouillons réservés à l'administrateur ; aucune règle n'exige de formule ou de prix.
- `subscriptions` : formules au nouveau format (création + modification validées), anciennes offres modifiables mais non créables, `createdAt` et `productId` figés.
- `prices` : cohérence prix ↔ formule contrôlée dans le même lot (`getAfter`), période compatible avec le mode, montant > 0.
- Moindre privilège conservé : `users`, `companies`, `licenses` inchangés ; pas de `if true`, pas de « connecté = tout » ; tout le reste est refusé ; au plus 10 `get`/`exists` par opération, lots limités à 10 documents.

### Interface et compatibilité

- Styles ajoutés à `css/account.css` seulement (identité visuelle conservée : #071B55, #0877B9, #1F89C5, #169999, #F2F7FA) ; `css/style.css` inchangé.
- Responsive : cartes, filtres, bloc commercial et tableaux d'administration vérifiés sur mobile (aucun défilement horizontal) et ordinateur.
- Si Firestore est injoignable ou si les anciennes règles sont encore publiées, le catalogue intégré et les anciennes offres restent affichés, sans message d'erreur technique brut.
- Cache du catalogue : 2 minutes dans le navigateur.

### Fichiers

- **Nouveaux** : `js/catalog.js`, `README_INSTALLATION.md`, `CHANGELOG.md`, `TESTS.md`.
- **Modifiés** : `firebase/firestore.rules`, `index.html`, `js/app.js`, `js/account.js`, `js/data.js`, `js/platform.js`, `js/seed.js`, `css/account.css`, `README.md`.
- **Inchangés** : `css/style.css`, `js/boot.js`, `js/auth.js`, `js/admin.js`, `js/firebase.js`, `js/functions.js`, `functions/`, `firebase.json`, `firebase/firestore.indexes.json`, `.firebaserc`, `.nojekyll`, `.gitignore`, `assets/`.

### Actions manuelles requises

1. **Republier `firebase/firestore.rules`** dans Firebase (avant d'envoyer les fichiers du site).
2. Remplacer les fichiers sur GitHub.
3. En administrateur : **Importer le catalogue du site** (une fois) ; éventuellement ajouter les formules d'exemple d'ArchiVision.

Détail pas à pas : `README_INSTALLATION.md`.
