# Produits : les images des pages produits du site

Un dossier par produit du site Studio Prism, nommé avec l'identifiant du produit (`archiplan`, `spectrawriter`…).
Chaque image déposée dans un dossier s'affiche dans la galerie « En images » de la page du produit
(`https://studio-prism.com/#/produits/<identifiant>`), quelques minutes après l'enregistrement (commit).

## Ce qui se fait tout seul

L'action GitHub **Dossiers produits** (`.github/workflows/produits.yml`, script `tools/sync_produits.py`) tourne
à chaque dépôt d'images et toutes les 10 minutes :

- **produit créé** dans l'administration du site → son dossier `Produits/<identifiant>/` est créé ;
- **produit supprimé** dans l'administration → son dossier **et toutes ses images** sont supprimés
  (ils restent récupérables dans l'historique Git) ;
- **images ajoutées, renommées ou retirées** → `manifest.json` est mis à jour et le site suit.

La création et la suppression automatiques s'appuient sur la collection Firestore `productFolders`
(règles dans `firebase/rules/15-dossiers-produits.rules`, à publier). Tant que ces règles ne sont pas publiées,
seuls les dossiers des produits publiés sont créés, et rien n'est jamais supprimé.

Un dossier créé à la main (par exemple pour un produit intégré au site) n'est jamais supprimé automatiquement.

## Règles pour les images

- Formats : JPG, PNG, WebP, GIF, AVIF, SVG. Une largeur de 1600 pixels suffit (le site les affiche en miniatures,
  et en grand au clic).
- **Ordre** : celui des noms de fichier. Commencez-les par un numéro : `01-vue-3d.webp`, `02-plan.webp`…
- **Légendes** (facultatif) : fichier `legendes.txt` dans le dossier, une ligne par image :
  `01-vue-3d.webp : Vue 3D de la maison d'exemple`.
- Ne modifiez pas `manifest.json` à la main : il est régénéré.
