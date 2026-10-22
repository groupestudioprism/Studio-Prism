# Règles Firestore — source unique de Studio Prism

Toutes les apps (site, ARCHIPLAN, ARCHITRAFIC, ArchiVision, SPECTRA Writer / Calc / Slide, Spectra Motion, NEXUS) utilisent
le **même projet Firebase** : `archivision-studioprism` (nom historique ; l'identifiant d'un projet Firebase ne peut pas être changé).
Un projet Firebase n'a **qu'un seul fichier de règles en ligne** : chaque publication remplace tout.
Les règles vivent donc **uniquement ici**, dans le dépôt Studio-Prism. Les dépôts des apps n'en gardent plus de copie.

| Fichier | Contenu |
|---|---|
| `00-communes.rules` | en-tête, utilitaires, comptes, entreprises, catalogue, licences, CMS |
| `10-archiplan.rules` | ARCHIPLAN : fiche client, cloud (`ap*`) |
| `11-architrafic.rules` | ARCHITRAFIC : cloud (`at*`) |
| `13-codes-pin.rules` | code PIN des comptes (`userSecrets`) |
| `20-spectra-writer.rules` · `21-spectra-calc.rules` · `22-spectra-slide.rules` | SPECTRA (`sw*`, `sc*`, `ss*`) |
| `23-spectra-motion.rules` | Spectra Motion (`sm*`) ; les fichiers des médias sont dans Storage (`storage.rules` à la racine) |
| `30-nexus.rules` | NEXUS (`nx*`) |
| `99-fin.rules` | règle finale « tout refusé » et fermetures |

## Modifier les règles
1. Modifier le morceau de l'app concernée (une nouvelle app = un nouveau fichier `NN-nom.rules`, placé avant `99-fin`).
2. `python3 tools/build_rules.py` : assemble `firebase/firestore.rules` et **refuse** le résultat si une app a perdu ses collections.
3. Publier depuis ce dépôt : `firebase deploy --only firestore:rules`, ou coller **le fichier complet** `firebase/firestore.rules`
   dans la console Firebase (Firestore Database → Règles → Publier).

Le 22/10/2026, ces morceaux ont été découpés à l'identique (octet pour octet) dans les règles alors en ligne.
