# Tests — CMS complet et correction de la suppression des comptes

Date : 2026-10-10. Ce document dit ce qui a été **réellement exécuté**, avec quel résultat, et ce qui **n'a pas pu l'être** (donc reste à vérifier sur votre installation réelle). Aucun test n'a été fait sur le vrai projet Firebase `archivision-studioprism`, et **aucun compte de production n'a été supprimé ou modifié**.

## Lot « Gestion des comptes sans Cloud Functions (forfait Spark) » — 2026-10-10

**Ce qui a été réellement exécuté** (simulation locale : faux SDK Firebase + interpréteur de règles maison évaluant le **vrai** fichier `firebase/firestore.rules`) :

| Lot | Résultat |
| --- | --- |
| Nouvelle suite navigateur `t20` (mode sans serveur, règles réelles évaluées à chaque requête) | **65 / 65** |
| Régression : les 21 suites existantes en mode sans serveur (`t1`, `t3`, `t5`, `av`, `t6a`, `t6b`, `t7`–`t13`, `t15`–`t18`) | **tout passe** (attente `t1` mise à jour : libellé « désactivé ») |
| Régression : les 4 suites de comptes en mode **« avec serveur »** (`t2`, `t6c`, `t6d`, `t14`, avec `ACCOUNT_SERVER = true` simulé) | **217 / 217** : l'ancien comportement (Cloud Functions) reste intact |
| `rules_test` (règles Firestore, cas de base) | **591 / 591** (546 précédents + 45 sur la désactivation et la suppression de son compte) |
| `rules_query` (requêtes de liste évaluées pour **tous** les documents possibles) | **187 / 187** |
| `mut_comptes` + `mut_query` (mutations ciblées : affaiblir chaque règle ajoutée ou modifiée) | **16 / 16** + **16 / 16** détectées |
| `mut2` (208 mutations de tout le fichier) | **202 détectées, 6 survivantes équivalentes** (identiques à la livraison précédente) |
| `storage_test` | **45 / 45** (fichier `storage.rules` inchangé) |
| Syntaxe de tous les fichiers JavaScript (`node --check`, modules ES compris) | OK |
| Total vérifications navigateur du dépôt | 839 existantes + 65 nouvelles = **904** |

`t19` (section « Vidéo » de l'éditeur de pages) n'est **pas** concernée : elle teste un travail distinct, **mis de côté et non livré** (stash Git), absent de ce dépôt.

### Les 10 tests demandés

| # | Test demandé | Preuve | Résultat |
| --- | --- | --- | --- |
| 1 | Un administrateur autorisé consulte la liste des utilisateurs | `t20` (liste complète, statuts affichés) ; `rules_query` | OK (simulation) |
| 2 | Un administrateur désactive un utilisateur, de façon sûre | `t20` (confirmation, statut `suspended`, **données conservées** : profil et licences intacts) ; `rules_test` (la désactivation passe par une règle réelle, jamais par l'interface seule) | OK (simulation) |
| 3 | Un compte désactivé ne peut plus utiliser les fonctions protégées | `t20` : lecture de ses licences, de son entreprise, mise à jour et suppression de son profil, suppression d'une licence → **permission-denied** avec une session encore valide ; connexion refusée « Ce compte est désactivé » ; `rules_test` ; `mut_comptes` | OK (simulation) |
| 4 | Un compte peut être réactivé | `t20` (fiche → Réactiver : accès rétabli, données identiques) | OK (simulation) |
| 5 | Un utilisateur normal ne désactive personne et ne devient pas administrateur | `t20` (SDK direct, en contournant l'interface : refus pour désactiver autrui, se promouvoir, promouvoir un autre) ; `rules_test` ; `rules_query` §5 | OK (simulation) |
| 6 | Le dernier administrateur actif ne peut pas être désactivé | `t20` : bouton absent, formulaire forcé (garde du site), écriture directe (règles), rétrogradation, scénario à deux administrateurs ; `mut_comptes` | OK (simulation) |
| 7 | Les données des autres utilisateurs restent protégées | `t20` (profils, liste, licences, entreprise, suppression d'un autre : refusés, rien de modifié) ; `rules_test` ; `rules_query` | OK (simulation) |
| 8 | Connexion, navigation et autres fonctions | `t1`, `t3`, `t5`, `t9`, `t15`–`t18` (CMS, projets, médias, catalogue, pages) ; `t20` §8 (navigation + administration Catalogue, Offres, Pages, Projets, Médias) | OK (simulation) |
| 9 | Le site fonctionne sans déploiement de Cloud Functions | `t20` : **aucune** requête `cloudfunctions.net` sur toute la session d'administration ; `ACCOUNT_SERVER = false` | OK (simulation) |
| 10 | Aucune clé secrète ni permission administrateur côté navigateur | `t20` : recherche de `private_key`, `BEGIN PRIVATE KEY`, `client_email`, `firebase-admin`, `serviceAccount`, `service_account`, `GOOGLE_APPLICATION_CREDENTIALS` dans `js/`, `*.html`, `css/` : aucune occurrence | OK |

### Ce qui n'a PAS été vérifié (nécessite un environnement Firebase réel)

- Le **vrai moteur de règles Firestore** (l'émulateur n'a pas pu être téléchargé) : tout repose sur un interpréteur maison, qui peut différer d'un détail du vrai moteur. **Les règles proposées doivent donc être relues et éprouvées dans le *Rules Playground* de la Console avant publication.**
- Le **comportement réel** de `reauthenticateWithCredential` / `deleteUser` (suppression de son propre compte) et de la connexion d'un compte désactivé sur le vrai Firebase Authentication.
- L'**état réel** des règles publiées dans votre Console (voir la réponse précédente sur les règles).
- Rien n'a été fait **en production** : aucun déploiement, aucune règle publiée, aucun forfait modifié, aucun compte réel touché.

### Tester la gestion des comptes sur le vrai projet (après publication **volontaire** des règles)

Utiliser **uniquement des comptes d'essai** (créés via la page d'inscription avec des adresses à vous, par exemple `vous+essai1@gmail.com`). Aucune de ces étapes n'engendre de frais.

1. Dans la Console → *Firestore → Règles* → **Rules Playground** : vérifier, avec un profil `users/<uid>` d'essai `status: suspended`, qu'une lecture `licenses` (`userId == uid`) et une mise à jour de profil sont **refusées**, et **autorisées** avec `status: active`.
2. Créer un compte d'essai « Utilisateur A ». Se connecter en administrateur → *Administration → Utilisateurs* → fiche de A → **Désactiver le compte** → confirmer. Le statut passe à **Désactivé**.
3. Se connecter en tant que A (autre navigateur) : refus « Ce compte est désactivé ». Si A était déjà connecté : son espace *Mon compte* ne se charge plus (accès refusé), sans déconnexion nécessaire.
4. Réactiver A depuis la fiche : A retrouve son accès et ses licences.
5. Garde-fou : avec **un seul** administrateur actif, ouvrir *Modifier* sur son propre compte : rôle et statut sont verrouillés ; aucun bouton « Désactiver ». (N'essayez pas de contourner pour de vrai.)
6. *Gestion des comptes : état du service* : message « sans serveur », liste « Disponible / Indisponible », aucune erreur rouge.
7. Suppression de son propre compte : avec un compte d'essai individuel B, *Mon compte → Supprimer mon compte* → mot de passe → confirmer. Vérifier dans la Console que B a disparu d'*Authentication* et de *Firestore → users*.

---

## Résumé

| Lot | Résultat |
| --- | --- |
| Tests navigateur (Chromium piloté par Playwright, 21 suites, faux SDK Firebase) | **839 / 839 vérifications réussies** (dont 329 nouvelles : suppression de comptes 36, CMS public 50, éditeur de pages 97, projets / pages / accès / mobile 88, médiathèque 58) |
| Mêmes 21 suites exécutées sur le contenu **extrait du ZIP livré** | **839 / 839** (les 21 suites ont été rejouées sur une copie extraite d'une archive ZIP provisoire, identique au ZIP livré hors documents) |
| Règles Firestore (interpréteur maison évaluant le vrai fichier `firebase/firestore.rules`) | **546 / 546 cas réussis** à la livraison CMS ; **591 / 591** depuis le lot « comptes sans Cloud Functions » (voir plus haut) |
| Mutation des règles Firestore (208 variantes volontairement dégradées) | **202 détectées, 6 survivantes — toutes équivalentes** (voir plus bas) |
| Règles Storage (même interpréteur, vrai fichier `storage.rules`) | **45 / 45 cas réussis** |
| Mutation des règles Storage (25 variantes) | **24 détectées, 1 survivante — équivalente** |
| Cloud Functions (`functions/handlers.js`, Admin SDK simulé) | **35 / 35** |
| Syntaxe JavaScript de tous les fichiers du site et des fonctions | OK (`node --check`) |

Après la dernière modification du code, **toutes** les suites ont été relancées en entier. Les suites t1 à t13 (existant) passent sans changement de comportement, sauf **deux attentes volontairement mises à jour** dans `t6d` : les onglets d'administration sont maintenant six (au lieu de trois), et « Dépublier » un produit demande une confirmation et place le produit en « Archivé » (au lieu de « Brouillon ») ; une vérification a été ajoutée (94 au lieu de 93).

## Comment les tests ont été faits — et leurs limites

- Le site est servi en local et ouvert dans **Chromium** (bureau et mobile émulé). Le SDK Firebase est **remplacé par un faux SDK** (Authentication, Firestore, Functions, Storage) qui envoie chaque appel à un simulateur Python ; **les règles de sécurité réelles** (`firestore.rules`, `storage.rules`) sont évaluées par un interpréteur maison pour chaque lecture / écriture / envoi de fichier.
- **Ce n'est pas un vrai projet Firebase.** Ni l'émulateur Firebase ni un projet réel n'étaient accessibles. L'interpréteur de règles est un outil maison : il peut différer d'un détail du vrai moteur (en particulier `firestore.get()` depuis les règles Storage, limites de requêtes, comportement des erreurs).
- Les **Cloud Functions** sont exécutées contre un **faux Admin SDK** (Authentication et Firestore en mémoire). L'accès à `cloudfunctions.net` est impossible depuis l'environnement de travail : **la fonction réelle n'a jamais été appelée**.
- Appareils : Chromium aux largeurs 1440, 1280, 1024, 768, 390, 375 et 320 px. **Aucun test sur un vrai téléphone ni sur Safari, Firefox, Edge.**
- La **démonstration 3D d'ArchiVision** charge three.js depuis un CDN injoignable dans l'environnement de test : elle **n'a pas pu être exécutée**. Son code (`bimApp`) est **identique** à la version précédente (vérifié).

## Correspondance avec les tests demandés

| Test demandé | Suite(s) | Résultat |
| --- | --- | --- |
| Modifier un texte et le retrouver après actualisation | `t15` (texte et lien modifiés affichés, **persistance après rechargement**), `t16` (modification → brouillon → publication → page publique) | OK (simulation) |
| Importer une image et l'utiliser sur une page | `t18` (envoi JPEG / PNG / vidéo, validation, nettoyage du nom, métadonnées), `t16` (« Choisir dans la médiathèque » dans une section et un texte), `t18` (le visiteur voit l'image) | OK (simulation) |
| Modifier une page sans toucher au code | `t16` : liste des pages, éditeur, sections (ordre, masquer, ajouter, dupliquer, supprimer), textes, liens, SEO, aperçu, publication, dépublication, abandon, conflit | OK |
| Un brouillon n'est pas visible publiquement | `t15` (le visiteur n'a **jamais lu** `pageDrafts` ; page archivée = 404 ; projet brouillon = 404 ; lectures directes de brouillons / listes de médias refusées), `t16` (la version publiée ne bouge pas pendant l'édition), `rules_test` | OK |
| Publier et dépublier un projet / un produit | `t17` (projet : brouillon → publié → archivé → republié → supprimé ; absent de Réalisations pour le visiteur quand non publié), `t6d` (produit : confirmation, « Archivé », « Republier ») | OK |
| Réutiliser un produit / un média sur plusieurs pages | `t16` (section « Cartes » : projets et produits existants par référence, non publiés signalés), `t18` (un média utilisé par plusieurs contenus ; **remplacement du fichier visible partout sans republier** ; suppression refusée tant qu'il est utilisé), `t8` | OK |
| Mobile et ordinateur | `t17` (390, 768, 1024 px : pages, projets, éditeur ; l'aperçu passe sous les champs), `t18` (768 px), `t15` (320 px : sections ajoutées), `t9`, `t11` | OK (émulation Chromium) |
| Droits d'accès administrateur | `t17` / `t18` (utilisateur non administrateur : « Accès refusé » sur `#/admin/medias`, `#/admin/pages`…), `rules_test` (546), `storage_test` (45) | OK |
| Erreurs de connexion Firebase | `t15` (Firestore injoignable : le site affiche son contenu d'origine, aucune erreur non gérée), `t18` (Storage non activé : message explicite, aucun objet parasite), `t1` (SDK injoignable), `t14` (fonctions injoignables) | OK |
| Suppression d'un compte en environnement de test | `t14` (parcours complet depuis l'administration : succès, fonctions absentes, injoignables, refusées, échec Authentication, échec partiel + relance, entreprise partagée / seule, administrateur, soi-même, compte déjà supprimé, diagnostic), `fn_test` (35 cas sur le code serveur) | OK **en simulation** — jamais sur le vrai service |
| Pages, menus, authentification, démonstrations existants | `t1`–`t13` (509 → 510 vérifications) : inscription / connexion, rôles, catalogue, abonnements, navigation de 59 adresses, 7 largeurs, ArchiVision, compatibilité d'anciennes données, anciennes règles | OK |

## Détail par suite

| Suite | Vérifications | Objet |
| --- | --- | --- |
| `t1` | 76 | Comptes : inscription (Particulier / Entreprise), validations, connexion, déconnexion, session, SDK injoignable |
| `t2` | 60 | Administration des utilisateurs : liste, tri, recherche, filtres, modification, erreurs, XSS, mobile |
| `t3` | 1 | 33 routes sans erreur JS (visiteur) |
| `t5` | 7 | Chaîne de connexion (Authentication simulé) + lecture du profil |
| `av` | 4 | Page ArchiVision |
| `t6a` | 24 | Page Abonnements publique |
| `t6b` | 25 | Mon compte, licences, sécurité, catalogue lu par un visiteur |
| `t6c` | 27 | Suppression de son propre compte, accès administrateur / utilisateur |
| `t6d` | 94 | Administration : Catalogue (confirmation de dépublication), Offres et prix, licences, import, formulaires |
| `t7` | 10 | Import du catalogue du site, garde « importer d'abord » |
| `t8` | 60 | Catalogue public, formules, périodes, prix, sécurité d'affichage, repli Firestore |
| `t9` | 68 | Navigation complète, transitions, 7 largeurs, mobile |
| `t10` | 15 | ArchiVision, pôles, catalogue intégré (base vide) |
| `t11` | 10 | Administration : pas de débordement, captures bureau / mobile |
| `t12` | 25 | Compatibilité avec d'anciennes offres / produits, conversion, licences |
| `t13` | 4 | Anciennes règles Firestore encore publiées |
| `t14` | 36 | **Suppression de comptes** depuis l'administration, messages de cause, diagnostic, échecs partiels, garde-fous |
| `t15` | 50 | **CMS public** : surcharges réversibles, sections typées, brouillons invisibles, publication, pages personnalisées, projets, SEO, liens `javascript:` neutralisés, repli, 320 px |
| `t16` | 97 | **Éditeur de pages** : liste, éditeur, brouillon, publication, dépublication, sections, textes, liens, SEO, conflits, erreurs |
| `t17` | 88 | **Projets**, pages personnalisées, modèles de fiches, pied de page, accès, mobile |
| `t18` | 58 | **Médiathèque** : envoi, validation, métadonnées, recherche, réutilisation, remplacement, suppression contrôlée, liens, droits, Storage non activé |
| **Total** | **839** | |

## Règles Firestore

- `rules_test` : **546 cas** évalués contre le **vrai fichier** `firebase/firestore.rules` : visiteur, utilisateur, administrateur actif / suspendu, propriétaire d'entreprise ; lectures publiques (produits publiés, formules et prix actifs, `settings/catalogue`, **pages `published`, projets `published`, un média public par identifiant**) ; refus des brouillons, pages archivées, projets non publiés, listes de médias pour le public ; écritures administrateur avec validation des champs (types de sections, limites, adresses, statuts, identifiants, `revision`, `baseRevision`) ; limites d'accès `get()` des lots d'import (≤ 20) ; collections inconnues refusées.
- **Mutation** (`mut2`) : 208 variantes du fichier, chacune affaiblissant une règle ; **202 détectées**. Les **6 survivantes sont équivalentes** (la condition retirée est redondante avec une autre) :
  1. `isAdmin` sans `isSignedIn()` : sans connexion `request.auth.uid` est nul et la lecture du profil échoue → refus identique ;
  2. `prices` : liste des périodes retirée : la création est déjà limitée par `priceFitsPlan`, la modification par l'identifiant du document ;
  3. et 4. `prices` : `planId` / `period` non figés à la modification : déjà fixés par l'identifiant (`prid == planId_period`) ;
  5. `licenses` : lecture sans `isSignedIn()` : sans connexion, ni `isAdmin()` ni `userId == uid` ne peuvent être vrais ;
  6. `pages` : changement de `kind` autorisé : déjà impossible, car `kind` est lié au motif de l'identifiant (`c-…` pour une page personnalisée) qui ne change pas à la mise à jour.
- Aucune règle `allow read, write: if true;` ni « tout utilisateur connecté » ; le dernier bloc refuse tout le reste.

## Règles Storage

- `storage_test` : **45 cas** contre le vrai fichier `storage.rules` : administrateur actif / suspendu / simple utilisateur / visiteur, types et tailles (8 Mo images, 50 Mo vidéos, 0 octet), SVG / PDF / HTML / exécutables refusés, noms de fichier, dossier hors `media/`, écrasement refusé, suppression, lecture.
- `mut_storage` : 25 variantes, 24 détectées ; la survivante (`isAdmin` sans connexion) est équivalente (sans connexion, la lecture du profil échoue).
- **Non fait** : exécution par le vrai moteur Storage, et vérification de l'autorisation inter-services réelle (`firestore.get()` depuis Storage).

## Cloud Functions

`fn_test` (35 cas) : accès refusé à un non-administrateur / à un compte suspendu / sans connexion ; création sans mot de passe stocké ni journalisé ; suppression complète (Authentication, profil, licences) sans toucher aux autres comptes ; entreprise partagée conservée + transfert de responsabilité ; entreprise sans autre membre supprimée ; auto-suppression refusée ; dernier administrateur actif refusé pour « Supprimer mon compte » (`deleteMyAccount`) ; compte introuvable ; liste périmée (e-mail différent) ; échec Authentication → rien d'autre modifié ; échec du nettoyage → erreur « partial » puis reprise ; profil absent mais compte de connexion présent ; licences orphelines ; connexion trop ancienne (`deleteMyAccount`) ; UID de la requête ignoré pour `deleteMyAccount` ; journaux sans e-mail.

## Ce qui n'a PAS été testé (à contrôler après installation)

1. **Cause réelle de l'échec de suppression sur votre projet** : hypothèse la plus probable = fonctions non déployées ; **non vérifiée** (pas d'accès au projet). Le bouton « Vérifier le service de comptes » le dira.
2. **Cloud Functions déployées** : déploiement, droits du compte de service (`roles/firebaseauth.admin`, `roles/datastore.user`), politique d'organisation sur l'appel public, suppression **réelle** d'un compte d'essai (`FONCTIONS_SERVEUR.md`, §9).
3. **Publication des règles Firestore** et comportement du vrai moteur ; **Firebase Storage** réel : activation, publication de `storage.rules`, autorisation inter-services, envois réels (images de téléphone, vidéo de 50 Mo sur connexion lente), URL de téléchargement, suppression de fichiers.
4. **Connexion, inscription, e-mails** (mot de passe oublié, e-mail de choix du mot de passe) contre le vrai Firebase Authentication.
5. **Édition simultanée** par deux administrateurs sur le vrai Firestore (la détection de conflit est testée en simulation).
6. **Latence et cache réels** : le contenu public est mis en cache 2 minutes (testé avec un cache expiré simulé).
7. **Appareils et navigateurs réels** : iPhone / Android (envoi depuis la galerie ou l'appareil photo ; les photos HEIC ne sont pas acceptées, la conversion par le système au moment du choix n'a pas été vérifiée), Safari, Firefox, Edge.
8. **Accessibilité** : libellés, rôles, navigation au clavier et messages d'erreur ont été écrits pour l'être, mais aucun audit outillé (axe, lecteur d'écran) n'a été réalisé.
9. **SEO réel** : l'indexation par les moteurs n'est pas testée ; les réglages sont appliqués par le navigateur (voir `README_ADMIN.md`, §7).
10. **Démonstration 3D d'ArchiVision** avec accès au CDN three.js (code inchangé).

La liste de contrôle pas à pas est dans `README_INSTALLATION.md` (section E).

## Choix retenus pendant les tests

- Le dépôt GitHub (`6a45bfe` côté GitHub) a été vérifié identique à la livraison précédente (`674b35c`) pour les fichiers visibles ; aucun fichier GitHub n'est absent de la livraison.
- « Dépublier » un produit = statut **Archivé** (uniformité Brouillon / Publié / Archivé) ; les statuts `active` / `hidden` restent lus comme Publié / Brouillon.
- Les sections **d'origine** d'une page se modifient, se déplacent et se masquent mais ne se suppriment pas : garantie qu'aucune page ne perd son contenu de base.
- **Aucun paiement** n'existe ni n'est simulé.
