# Guide d'administration — gérer le contenu de Studio Prism

Ce guide s'adresse aux administrateurs du site. **Aucun code à écrire** : tout se fait dans l'interface, sous **Administration**. Si le déploiement n'est pas encore fait, commencez par [`README_INSTALLATION.md`](README_INSTALLATION.md).

## Sommaire

1. [Accéder à l'administration](#1-accéder-à-ladministration)
2. [Principe : brouillon, publié, archivé](#2-principe--brouillon-publié-archivé)
3. [Pages : modifier une page existante](#3-pages--modifier-une-page-existante)
4. [Sections : ordre, visibilité, ajout](#4-sections--ordre-visibilité-ajout)
5. [Textes, liens, boutons, images](#5-textes-liens-boutons-images)
6. [Les types de sections que l'on peut ajouter](#6-les-types-de-sections-que-lon-peut-ajouter)
7. [Titre de la page et référencement (SEO)](#7-titre-de-la-page-et-référencement-seo)
8. [Aperçu, publication, dépublication](#8-aperçu-publication-dépublication)
9. [Créer une nouvelle page](#9-créer-une-nouvelle-page)
10. [Pages « modèles » (fiches) et pied de page](#10-pages--modèles--fiches-et-pied-de-page)
11. [Projets et réalisations](#11-projets-et-réalisations)
12. [Produits (catalogue)](#12-produits-catalogue)
13. [Médiathèque](#13-médiathèque)
14. [Réutiliser un produit, un projet, un média sur plusieurs pages](#14-réutiliser-un-produit-un-projet-un-média-sur-plusieurs-pages)
15. [Ce que voient les visiteurs, et quand](#15-ce-que-voient-les-visiteurs-et-quand)
16. [Qui peut quoi](#16-qui-peut-quoi)
17. [Problèmes courants](#17-problèmes-courants)
18. [Limites à connaître](#18-limites-à-connaître)
19. [Gérer les comptes utilisateurs (sans Cloud Functions)](#19-gérer-les-comptes-utilisateurs-sans-cloud-functions)

---

## 1. Accéder à l'administration

1. Se connecter avec un compte **administrateur** (rôle `admin` et statut `actif` ; le premier se définit à la main dans la console Firebase, voir `README.md`, « Créer le premier administrateur »). Personne ne peut se donner ce rôle depuis le site.
2. Menu **Administration**. Six onglets :

| Onglet | Adresse | Contenu |
| --- | --- | --- |
| **Utilisateurs** | `#/admin` | comptes, licences, **désactivation / réactivation** (voir §19) |
| **Catalogue** | `#/admin/catalogue` | produits |
| **Offres et prix** | `#/admin/abonnements` | formules et prix |
| **Pages** | `#/admin/pages` | **toutes les pages du site** : éditeur de contenu |
| **Projets** | `#/admin/projets` | réalisations |
| **Médiathèque** | `#/admin/medias` | images et vidéos |

Un compte non administrateur voit « Accès réservé » ; un visiteur déconnecté est invité à se connecter. Aucune page d'administration ne s'ouvre sans cela, et même en forçant l'adresse, **c'est Firebase (règles de sécurité) qui refuse** les lectures et écritures.

## 2. Principe : brouillon, publié, archivé

Tout contenu éditorial suit le **même cycle** :

| Statut | Sens | Visible du public ? |
| --- | --- | --- |
| **Brouillon** | en cours de rédaction | **Non** — jamais, ni par adresse directe, ni par une requête Firestore (c'est imposé côté serveurs Google) |
| **Publié** | en ligne | Oui |
| **Archivé** (= dépublié) | retiré du site, **rien n'est effacé** | **Non** ; on peut le republier à tout moment |

- Pour les **pages**, un brouillon peut exister **à côté** d'une version publiée : le public continue de voir la version publiée tant que vous ne cliquez pas sur « Publier ». Une page jamais modifiée garde son **contenu d'origine** (celui du site), qui s'affiche toujours : **aucune page ne peut disparaître** par accident.
- Les **produits** ont en plus le statut **Indisponible** (visible, mais non commandable).
- **Publier** et **supprimer** demandent toujours une **confirmation**. **Dépublier** ne supprime rien.
- Les enregistrements sont automatiques pour un brouillon de page (2 secondes après la dernière modification), et visibles après rechargement de la page.

## 3. Pages : modifier une page existante

*Administration → Pages.* La liste regroupe les pages du site (Accueil, À propos et Équipe, Prism App / Game / 3D, Réalisations, ArchiVision, Services et ses 4 sous-pages, Produits, Abonnements, Contact, Rendez-vous, Devis, Support, FAQ, pages légales, fiches modèles, pied de page) avec leur statut : **Contenu d'origine**, **Publié**, **Brouillon**, **Archivé**. Un champ de recherche et un filtre par statut aident à s'y retrouver.

Cliquer sur **Modifier**. L'éditeur affiche, à gauche, trois onglets ; à droite, un **aperçu en direct** de la page (boutons **Ordinateur** / **Mobile**, **Recharger**) qui montre votre brouillon, sans rien publier.

| Onglet | Rôle |
| --- | --- |
| **Sections** | ordre, visibilité, sections ajoutées |
| **Textes et liens** | tous les textes, boutons, liens, images de la page, section par section |
| **Page et référencement** | titre, description, image de partage, indexation |

Barre d'actions : **Enregistrer le brouillon** · **Publier…** · **Dépublier…** (si publiée) · **Abandonner le brouillon…** · **Supprimer la page…** (pages créées par vous uniquement).

## 4. Sections : ordre, visibilité, ajout

Onglet **Sections** : chaque section de la page est une ligne.

- **↑ / ↓** : déplacer la section (clavier compris).
- **Masquer / Afficher** : une section masquée n'apparaît plus sur le site (rien n'est supprimé ; on l'affiche de nouveau quand on veut).
- **Modifier / Replier** : ouvre les champs de la section.
- Les sections **ajoutées par vous** ont en plus **Dupliquer** et **Supprimer**. Les sections **d'origine** ne se suppriment pas, elles se masquent.
- **+ Ajouter une section** : choisir un type (§6). Jusqu'à 40 sections ajoutées par page.

## 5. Textes, liens, boutons, images

Onglet **Textes et liens** : chaque texte, adresse de lien, image et son **texte alternatif** de la page est proposé dans un champ, avec son libellé. Un champ de filtre permet de retrouver un texte.

- **Rétablir l'original** remet la valeur d'origine du site pour ce champ.
- **Images** : **Choisir dans la médiathèque** (ou **Changer**) ouvre le sélecteur de médias ; **Rétablir l'image d'origine** / **Retirer** défait le choix. Une image remplacée n'est jamais recopiée : la page garde une **référence** vers le média (§13).
- **Liens et boutons** : adresses acceptées : `https://…`, `#/page-du-site`, `assets/…`, `mailto:`, `tel:`. Tout autre protocole (`javascript:`, `data:`…) est **refusé** à l'enregistrement et ignoré à l'affichage.
- **Texte alternatif** : décrit l'image pour les personnes malvoyantes et les moteurs de recherche. Laissez-le vide **seulement** si l'image est purement décorative. La médiathèque signale les images sans texte alternatif.
- Les textes sont du **texte brut** : le HTML, le JavaScript et les styles saisis sont affichés tels quels, jamais interprétés.

## 6. Les types de sections que l'on peut ajouter

| Type | Champs |
| --- | --- |
| **Bannière (héros)** | sur-titre, titre, texte, image + texte alternatif, bouton principal et secondaire, fond |
| **Texte** | sur-titre, titre, texte (une ligne vide sépare deux paragraphes), fond |
| **Texte + image** | titre, texte, image + alt, position de l'image (gauche / droite), bouton, fond |
| **Galerie d'images** | titre, introduction, jusqu'à 24 images (image, alt, légende), fond |
| **Cartes (projets, produits, libres)** | titre, introduction, jusqu'à 24 cartes : **projet existant**, **produit existant** (références, pas de copie) ou carte libre |
| **Équipe** | titre, introduction, jusqu'à 12 personnes (nom, rôle, présentation, photo + alt) |
| **Liste de fonctionnalités** | titre, introduction, jusqu'à 12 points (titre, texte) |
| **Appel à l'action** | titre, texte, bouton, fond |
| **Bloc contact** | titre, texte, e-mail, téléphone, adresse, bouton |

Chaque champ a une longueur maximale ; un champ obligatoire vide ou une adresse invalide **bloque la publication** avec un message qui nomme la section et le champ. Un bouton demande un libellé **et** une adresse valide.

## 7. Titre de la page et référencement (SEO)

Onglet **Page et référencement** :

- **Titre de l'onglet et du partage**, **Description** (≈ 150 caractères, compteur affiché), **Image de partage** (médiathèque), **ne pas indexer** (demande aux moteurs de ne pas référencer la page).
- Pour une **page créée par vous** : son titre, son adresse (non modifiable après création) et l'option « ajouter un lien dans le pied de page ».
- Pour **Pied de page et réglages du site** : valeurs SEO **par défaut** des pages qui n'ont pas les leurs.

> **Limite honnête.** Le site est une application à adresses `#/…` hébergée sur GitHub Pages. Ces réglages sont appliqués **par le navigateur** (titre de l'onglet, balises `description`, partage) et sont lus par les moteurs de recherche qui exécutent le JavaScript (Google le fait). Les robots qui ne lisent que le HTML de base (certains aperçus de réseaux sociaux) voient les balises de l'`index.html` d'origine. Pour un référencement de premier plan, il faudrait des pages HTML générées côté serveur : ce n'est pas l'objet de cette version.

## 8. Aperçu, publication, dépublication

1. **Aperçu** : l'iframe de droite montre en temps réel votre brouillon, en version **Ordinateur** ou **Mobile**. Réservé aux administrateurs : le public ne voit jamais un brouillon. Si l'aperçu ne répond pas (12 s), un message le dit ; l'édition reste possible et **Recharger** relance l'aperçu.
2. **Publier…** : une fenêtre récapitule **ce qui change** (textes, liens et images modifiés, blocs masqués, sections ajoutées, SEO…) et demande confirmation. Elle distingue deux niveaux :
   - **erreurs bloquantes** (champ obligatoire vide, texte trop long, lien ou image invalide, titre de page manquant, limites de taille dépassées) : la publication est impossible tant qu'elles ne sont pas corrigées ;
   - **avertissements** (texte alternatif manquant, média introuvable ou non public, projet ou produit référencé mais non publié — il ne s'affichera pas) : vous pouvez publier en connaissance de cause.
   Le bouton **Publier…** est grisé s'il n'y a rien à publier.
3. **Conflit** : si quelqu'un d'autre a publié la page pendant que vous la modifiiez, la publication est refusée avec un message ; **Recharger** puis refaites votre modification sur la version à jour. Rien n'est écrasé silencieusement.
4. **Dépublier…** : la page retrouve son **contenu d'origine** pour le public ; votre version est conservée (statut **Archivé**) et peut être republiée.
5. **Abandonner le brouillon…** : supprime seulement le brouillon (la version publiée reste).
6. Si l'enregistrement du brouillon échoue (connexion, droits), un message rouge « Échec de l'enregistrement » s'affiche et le navigateur prévient avant que vous quittiez la page avec des modifications non enregistrées.

## 9. Créer une nouvelle page

*Administration → Pages → **+ Nouvelle page*** : titre + adresse (lettres minuscules, chiffres, tirets). La page est créée en **brouillon** à l'adresse `#/p/<adresse>` ; on l'assemble avec des sections (§6), puis **Publier…**. Option : lien automatique dans le **pied de page**. Une page créée peut être **supprimée** (confirmation). Les pages existantes du site ne se suppriment **jamais** et ne changent pas d'adresse.

## 10. Pages « modèles » (fiches) et pied de page

- **Fiche produit**, **Fiche d'offre**, **Fiche concept Prism Game**, **Fiche création Prism 3D** : les réglages d'une de ces entrées s'appliquent à **toutes** les fiches du même type (ex. : un bandeau d'information sous chaque fiche produit). Le contenu propre à un produit (nom, description, visuels, statut) se modifie dans **Catalogue**, une seule fois.
- **Pied de page et réglages du site** : liens du pied de page, valeurs SEO par défaut. Les liens vers les pages créées s'ajoutent ici automatiquement si l'option est cochée.

## 11. Projets et réalisations

*Administration → Projets.* Un projet est enregistré **une seule fois** puis affiché partout où on le référence (page **Réalisations**, sections « Cartes » de n'importe quelle page).

- Champs : titre, adresse (identifiant stable, non modifiable après création), résumé, description, image (médiathèque ou lien `https://`), lien, produit associé, mots-clés (8 au plus), année, ordre, mise en avant.
- Statuts uniformes : **Brouillon** · **Publié** · **Archivé**. Actions : **Publier** · **Dépublier** (→ Archivé) · **Repasser en brouillon** · **Supprimer** (confirmation ; la fenêtre liste les pages qui utilisent encore le projet).
- Recherche et filtre par statut dans la liste.
- Un projet **publié** s'ajoute à la page **Réalisations** et dispose de sa fiche `#/projets/<adresse>`. Les adresses `archivision`, `prism-game` et `prism-3d` sont réservées (ce sont des pages du site, modifiables sous **Pages**) : les projets déjà présents sur le site (ArchiVision, pôles) ne sont ni supprimés ni dupliqués.

## 12. Produits (catalogue)

*Administration → Catalogue* (fonctionnement inchangé, enrichi) :

- Statuts : **Brouillon**, **Publié**, **Indisponible**, **Archivé** (nouveau : « Dépublier » archive le produit au lieu de le cacher à moitié ; **Republier** le remet en ligne). Les anciens statuts `active` / `hidden` restent lus comme Publié / Brouillon.
- Le **logo** et l'**image** d'un produit se choisissent dans la **médiathèque** (ou restent des liens `https://` / `assets/…`).
- Un produit est enregistré **une fois** et apparaît automatiquement dans **Produits**, sur la page de son pôle et — mis en avant — dans **Réalisations** ; il peut aussi être choisi dans une section « Cartes » (§14).
- Un brouillon ou un archivé n'est lisible que par un administrateur (règles Firestore).

## 13. Médiathèque

*Administration → Médiathèque.*

- **Envoyer** : glisser-déposer, ou **Choisir des fichiers** (ordinateur ou téléphone : le sélecteur de fichiers du mobile propose la galerie ou l'appareil photo). Plusieurs fichiers à la fois, barre de progression par fichier. Dossier facultatif (« Accueil », « Projets »…).
- **Formats et tailles** : images **JPEG, PNG, WebP, GIF jusqu'à 8 Mo** ; vidéos **MP4, WebM jusqu'à 50 Mo**. Tout le reste (SVG, PDF, HTML, exécutables…) est refusé, à l'écran **et** par les règles Storage.
- **Ajouter un média par lien** : référence une image ou une vidéo hébergée ailleurs (`https://…`).
- **Rechercher** (nom, texte alternatif, dossier), **filtrer** par dossier, type, ou « sans texte alternatif ».
- **Fiche d'un média** : nom, dossier, titre, **texte alternatif**, **Visible du public** (obligatoire pour l'afficher sur le site), liste des **endroits où il est utilisé** (pages, brouillons, projets, produits).
- **Remplacer le fichier** : envoie un nouveau fichier et met à jour le média **sans casser aucune référence** : toutes les pages, projets et produits qui l'utilisent affichent la nouvelle version.
- **Supprimer** : **refusé tant que le média est utilisé** (la fenêtre liste où) ; sinon confirmation, puis suppression du fichier dans Firebase Storage et des métadonnées.
- ⚠ **Les fichiers de la médiathèque sont publics** (adresse de téléchargement non devinable, mais non protégée). N'y déposez rien de confidentiel.

## 14. Réutiliser un produit, un projet, un média sur plusieurs pages

- **Média** : on le choisit dans la médiathèque depuis n'importe quel champ image ; la page garde une **référence** (`media:identifiant`), pas une copie. Le remplacer ou changer son texte alternatif dans la médiathèque met à jour tous les usages.
- **Produit / projet** : section **Cartes** → choisir « projet existant » ou « produit existant ». La carte lit toujours la fiche à jour (nom, visuel, statut) ; si l'élément est ensuite dépublié, la carte **disparaît** du site (elle n'affiche jamais un contenu non publié), et la publication d'une page qui référence un élément non publié est signalée avant confirmation.

## 15. Ce que voient les visiteurs, et quand

- Un visiteur ne lit **que** : pages publiées, projets publiés, médias publics (un par un), produits publiés / indisponibles, formules et prix actifs.
- **Délai** : le navigateur d'un visiteur garde le contenu public en cache **2 minutes**. Après publication, un visiteur déjà sur le site peut voir l'ancienne version jusqu'à 2 minutes ; recharger la page suffit.
- **Panne ou contenu manquant** : si Firestore ne répond pas, le site affiche le dernier contenu connu (copie gardée dans le navigateur au plus 24 h) ou, à défaut, le **contenu d'origine** du site — jamais une page vide.

## 16. Qui peut quoi

| | Visiteur | Utilisateur connecté | Administrateur actif |
| --- | --- | --- | --- |
| Lire contenu publié | ✔ | ✔ | ✔ |
| Lire brouillons, archivés, aperçu | ✘ | ✘ | ✔ |
| Écrire pages, projets, médias, produits | ✘ | ✘ | ✔ |
| Envoyer / supprimer un fichier (Storage) | ✘ | ✘ | ✔ |

« Administrateur actif » = `role: admin` **et** `status: active` dans `users/{uid}`, lu par Firebase à **chaque** requête. Désactiver ou rétrograder un administrateur coupe ses droits immédiatement (§19). **Rien ne rend un utilisateur administrateur automatiquement.**

## 17. Problèmes courants

| Symptôme | Cause probable | Que faire |
| --- | --- | --- |
| « Accès refusé par les règles de sécurité » dans Pages / Projets / Médiathèque | règles Firestore non republiées | republier `firebase/firestore.rules` (`README_INSTALLATION.md`, étape A) |
| Envoi d'un fichier : « droits insuffisants » ou « Storage non activé » | Storage non activé ou `storage.rules` non publiées | `README_INSTALLATION.md`, étape B |
| Publication : « la page a été modifiée entre-temps » | un autre administrateur a publié | **Recharger**, reprendre vos modifications |
| L'aperçu reste vide | Firebase lent ou extension qui bloque les cadres | **Recharger** ; la modification reste possible sans aperçu |
| Image publiée mais invisible pour un visiteur | média non coché « Visible du public » | fiche du média → cocher, enregistrer |
| Ma modification n'apparaît pas pour un visiteur | cache de 2 minutes | recharger la page |
| Suppression de média refusée | média encore utilisé | retirer l'usage listé, ou **Remplacer le fichier** |
| « Suppression définitive : indisponible sans serveur » | normal avec le forfait gratuit : la suppression du compte **d'un autre** exige un serveur privilégié | **Désactiver** le compte (§19), ou le supprimer à la main dans la Console Firebase → Authentication |

## 18. Limites à connaître

- Les sections **d'origine** des pages se **masquent, déplacent et modifient** (textes, liens, images) mais ne se suppriment pas ; seules les sections ajoutées se suppriment. C'est voulu : cela garantit qu'aucune page ne perd son contenu de base.
- Le contenu est du **texte** : pas d'éditeur de mise en forme libre (gras, couleurs, HTML). Mise en forme uniquement via les types de sections et leurs options.
- Une page est modifiée par **un administrateur à la fois** de façon fiable ; le conflit est détecté à la publication, pas en temps réel.
- Pas de planification de publication, pas d'historique complet des versions (seulement la version publiée et le brouillon).
- Pas de traduction multilingue.
- Le SEO est appliqué par le navigateur (§7).
- La démonstration 3D d'ArchiVision et les formulaires de contact / devis / rendez-vous restent des **interfaces de démonstration** (aucun service d'envoi n'est branché sur GitHub Pages) ; leurs textes sont modifiables, leur fonctionnement non.

## 19. Gérer les comptes utilisateurs (sans Cloud Functions)

*Administration → Utilisateurs.* Cette page **fonctionne avec le forfait gratuit Firebase (Spark)** : elle n'appelle aucune Cloud Function. Le bouton **« Gestion des comptes : état du service »** résume ce qui est disponible et ce qui ne l'est pas ; un message « fonctions non déployées » n'est **pas** une panne du site.

### Désactiver un compte

1. Ouvrir la fiche de l'utilisateur → **Désactiver le compte** → lire les conséquences → **Désactiver**.
2. Le statut devient **Désactivé** (liste et fiche). L'utilisateur ne peut plus accéder à son espace, à ses licences ni à son entreprise ; s'il est administrateur, il perd **immédiatement** tous ses droits d'administration. Ce blocage est imposé par les **règles de sécurité Firebase**, pas seulement par l'interface.
3. Ses **données sont conservées**. **Une désactivation n'est pas une suppression** : son compte de connexion reste présent dans Firebase Authentication.
4. **Réactiver le compte** (même fiche) lui rend son accès, avec toutes ses données.
5. On peut aussi changer le **Statut** par **Modifier**.

### Garde-fous

- Vous ne pouvez pas désactiver ni supprimer **votre propre** compte depuis l'administration.
- Le **dernier administrateur actif** ne peut pas être désactivé ni rétrogradé (message explicite). Pour désactiver un autre administrateur, il faut qu'il en reste au moins un autre actif ; l'écran prévient que la personne perdra tous ses droits.
- Un utilisateur ordinaire ne peut désactiver personne ni se donner le rôle administrateur (règles Firebase).

### Ajouter un utilisateur

Sans serveur, un administrateur ne peut pas créer le compte de connexion d'une autre personne. Le bouton **+ Ajouter un utilisateur** affiche donc le **lien d'inscription** du site (`#/compte/inscription`) à envoyer à la personne ; elle crée elle-même son compte (mot de passe de son choix), puis vous pouvez ajuster son abonnement, ses licences ou son rôle dans la liste.

### Supprimer un compte

- **Le compte d'un autre utilisateur** : la suppression **définitive** est **indisponible** sans serveur privilégié (explication affichée par **Pourquoi ?**). À la place : **désactiver** le compte. Pour le supprimer réellement : Console Firebase → *Authentication → Utilisateurs* → ⋮ → *Supprimer le compte*, puis supprimer `users/{uid}` et ses `licenses/{uid}_…` dans *Firestore* (gratuit, manuel).
- **Son propre compte** : *Mon compte → Supprimer mon compte* (utilisateur individuel) : mot de passe redemandé, confirmation, puis suppression de ses licences, de son profil et de son compte de connexion. Les comptes **entreprise** et **administrateur** ne se suppriment pas eux-mêmes : « Contactez Studio Prism ».
- Supprimer un profil Firestore **sans** supprimer le compte de connexion ne supprime pas le compte (le site recréerait un profil vierge à la prochaine connexion) : le site ne le propose donc pas.
