# Règles Firestore et Storage — source unique de Studio Prism

Toutes les apps (site, ARCHIPLAN, ARCHITRAFIC, ARCHIVISION, SPECTRA Writer / Calc / Slide / Motion, NEXUS, PRISM ARCADE)
utilisent le **même projet Firebase** : `archivision-studioprism` (nom historique ; l'identifiant d'un projet Firebase ne peut pas être changé).
Un projet Firebase n'a **qu'un seul fichier de règles Firestore et qu'un seul fichier de règles Storage en ligne** : chaque publication remplace tout.
Les règles vivent donc **uniquement ici**, dans le dépôt Studio-Prism. Les dépôts des apps n'en gardent plus de copie
(les dernières copies, dans SpectraMotion et ArchiVision, ont été retirées le 05/11/2026).

## Firestore : `firebase/firestore.rules`, assemblé à partir de ce dossier

| Fichier | Contenu |
|---|---|
| `00-communes.rules` | en-tête, utilitaires, comptes, entreprises, catalogue, licences, CMS |
| `05-devis.rules` | devis (`quotes`) et numérotation (`counters`) ; les informations légales (`settings/company`) sont dans `00-communes.rules` |
| `10-archiplan.rules` | ARCHIPLAN : fiche client, cloud (`ap*`) |
| `11-architrafic.rules` | ARCHITRAFIC : cloud (`at*`) |
| `12-archivision.rules` | ARCHIVISION : synchronisation (`avModels`, `avPhotos`) et « Voir en AR sur le PC » (`arLive`, `arLive/{code}/moves`) |
| `13-codes-pin.rules` | code PIN des comptes (`userSecrets`) |
| `14-offres.rules` | catalogue de fonctionnalités et modèles de fiches produit de l'administration (`settings/offerKit`) |
| `15-dossiers-produits.rules` | dossiers d'images des produits (`productFolders`), lus par l'action GitHub « Dossiers produits » |
| `20-spectra-writer.rules` · `21-spectra-calc.rules` · `22-spectra-slide.rules` · `23-spectra-motion.rules` | SPECTRA (`sw*`, `sc*`, `ss*`, `sm*`) |
| `30-nexus.rules` | NEXUS (`nx*`) |
| `31-prism-arcade.rules` | PRISM ARCADE : progression (`paPlayers`) et classements (`paBoards`, `paPeriods`) |
| `40-presence.rules` | présence en direct dans les apps (`appPresence`, `appSessions`) |
| `99-fin.rules` | règle finale « tout refusé » et fermetures |

## Storage : `firebase/storage.rules` (un seul fichier)

| Dossier du bucket | App | Qui |
|---|---|---|
| `media/{id}/{fichier}` | médiathèque du site (CMS) | administrateurs actifs ; images 8 Mo, vidéos 50 Mo ; jamais d'écrasement |
| `archivision/{uid}/…` | ARCHIVISION (maquettes et photos synchronisées) | le titulaire du compte seul ; 500 Mo par fichier |
| `spectramotion/{propriétaire}/{projet}/{fichier}` | SPECTRA Motion (médias des projets) | le propriétaire et les invités du projet ; jamais d'écrasement |
| tout le reste | | refusé |

## Modifier les règles

1. Modifier le morceau de l'app concernée (une nouvelle app = un nouveau fichier `NN-nom.rules`, placé avant `99-fin`),
   ou `firebase/storage.rules` pour les fichiers (un nouveau dossier = un nouveau bloc `match`, placé avant la règle finale).
2. `python3 tools/build_rules.py` : assemble `firebase/firestore.rules` et **refuse** le résultat si une app a perdu ses
   collections Firestore ou son dossier Storage. L'action GitHub « Règles Firestore et Storage » refait ce contrôle à chaque envoi.
3. Tester sur les émulateurs (Java 11 ou plus, Node 18 ou plus) :
   ```bash
   cd tests/emulateurs && npm install && npm test
   ```
   Les suites des apps restent dans leurs dépôts : `npm run test:rules` dans SpectraMotion (Firestore + Storage) et dans Nexus.
4. Publier depuis ce dépôt : `firebase deploy --only firestore:rules,storage`, ou dans la console Firebase, coller **le fichier complet**
   `firebase/firestore.rules` (Firestore Database → Règles → Publier) puis **le fichier complet** `firebase/storage.rules`
   (Storage → Règles → Publier).

Le 22/10/2026, les morceaux Firestore ont été découpés à l'identique (octet pour octet) dans les règles alors en ligne.
