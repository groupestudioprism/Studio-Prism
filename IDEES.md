# Idées d'amélioration Studio Prism : réponds OUI / NON à chaque numéro

## Tous les sites
1. Mode sombre / clair synchronisé entre toutes les apps (réglage lié au compte).
2. Recherche globale (Ctrl+K) identique partout pour retrouver projets, fichiers, réglages.
3. Fichiers du compte dans le cloud, accessibles depuis toutes les apps (un projet ArchiPlan ouvrable dans ArchiVision en un clic).
4. Historique des versions et bouton « restaurer » pour chaque document / projet.
5. Partage par lien (lecture seule ou édition) avec expiration.
6. Commentaires et mentions @ sur les projets partagés.
7. Notifications dans l'app (licence qui expire, demande acceptée, devis prêt).
8. Support intégré : bouton « signaler un bug » qui joint capture + console.
9. Page « Nouveautés » (changelog visuel) après chaque mise à jour.
10. Visite guidée au premier lancement de chaque app.
11. Raccourcis clavier personnalisables.
12. Accessibilité : contrastes, navigation clavier, lecteur d'écran.
13. Mode hors-ligne complet (PWA) avec synchro au retour du réseau.
14. Statistiques d'usage anonymes (opt-in) pour savoir quelles fonctions servent.

## Studio-prism.com (site + admin)
15. Présence en direct réelle : chaque app envoie un « je suis connecté » pour que le tableau de bord compte vraiment les connectés.
16. Export CSV / Excel de tous les tableaux admin (comptes, devis, licences).
17. Journal d'audit admin (qui a validé / supprimé / modifié quoi, et quand).
18. Rôles admin (lecture seule, support, super-admin).
19. Relances automatiques par e-mail avant expiration (30 / 7 / 1 jours).
20. Paiement par carte pour les particuliers (Stripe), factures PDF automatiques.
21. Codes promo et offre étudiant avec vérification d'e-mail scolaire.
22. Espace entreprise : le responsable gère ses licences et ses membres sans passer par l'admin.
23. Tableau de bord client : usage par logiciel et par personne.
24. Page « Statut des services » publique (remplace le bouton retiré côté admin).

## ArchiPlan
25. Calques (murs, électricité, plomberie…) affichables / masquables.
26. Import DXF / DWG / PDF en fond de plan avec calage d'échelle.
27. Export DXF pour AutoCAD.
28. Coupes et façades automatiques.
29. Calcul automatique des surfaces (SHAB, SDP) et tableau des surfaces.
30. Métrés et DQE liés au modèle (mise à jour automatique).
31. Détection de collisions (poutre contre mur, porte contre escalier).
32. Annuler / rétablir illimité avec historique visuel.
33. Bibliothèque de composants favoris et composants personnalisés enregistrables.
34. Étude solaire (ombres selon la date et l'heure).
35. Mode collaboratif temps réel sur un même projet.
36. Contrôle d'accessibilité PMR (largeurs, pentes, rotation) dans les vérifications.

## ArchiVision
37. Mesure dans la maquette (distances, surfaces) en AR et en visite.
38. Annotations / photos géolocalisées dans la maquette pour le suivi de chantier.
39. Comparaison avant / après (curseur) entre deux versions.
40. Visite virtuelle partageable par lien (sans installer l'app).
41. Mode casque VR.

## SpectraWriter / Calc / Slide
42. Modèles de documents prêts à l'emploi par métier (devis, CCTP, compte rendu de chantier).
43. Import / export fidèles .docx / .xlsx / .pptx avec contrôle de mise en page.
44. Co-édition en temps réel avec curseurs des autres personnes.
45. Assistant IA intégré (via la clé personnelle de l'utilisateur, comme Nexus) : reformuler, résumer, générer une formule, créer un diaporama.
46. Liens entre apps : un graphique Calc collé dans Writer / Slide reste synchronisé.
47. Publipostage et suivi des modifications dans Writer (restent à faire).
48. Mode présentateur avec 2 écrans et minuteur dans Slide.

## Nexus / AXION
49. Mémoire de projet pour AXION (il connaît le contexte de chaque projet).
50. Journal visible de toutes les actions d'AXION, avec bouton « annuler ».
51. Mode « lecture seule » où AXION conseille sans rien modifier.
52. Quotas par utilisateur configurables par l'admin.

## Sécurité et qualité
53. Authentification à deux facteurs (en plus du code PIN).
54. Tests automatiques sur chaque push (GitHub Actions) pour tous les dépôts.
55. Sauvegarde automatique quotidienne de Firestore.
56. Un seul module partagé pour tous les sites (auth, réglages, licences) afin d'éviter les copies qui divergent (`sync_shared.py` écrase déjà des changements).
