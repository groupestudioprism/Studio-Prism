# Code commun Studio Prism

Une seule source pour le code partagé par les apps. On modifie **ici**, jamais dans les apps.

| Fichier | Rôle | Apps |
|---|---|---|
| `device-lock.js` | Verrouillage de l'appareil : code PIN chiffré, Face ID / Touch ID / empreinte (clé d'accès commune à `*.studio-prism.com`) | ARCHIPLAN, ARCHITRAFIC, ArchiVision, SPECTRA Writer, Calc, Slide |
| `prism-settings.js` | Panneau Réglages commun | ARCHIPLAN, ARCHITRAFIC |
| `prism-presence.js` | Présence et temps d'utilisation (tableau de bord d'administration) | NEXUS, PRISM ARCADE |
| `license-countdown.js` | Compteur de jours restants (≤ 30 j) en haut à droite, sans déplacer l'interface — à brancher sur la date `expiresAt` de la licence (pas encore dans `manifest.json`) | toutes les apps |

Après une modification :

```
python3 tools/sync_shared.py ..            # recopie dans les dépôts voisins
# puis, dans chaque app : python3 tools/build.py, commit, push
```

Chaque app vérifie à chaque publication qu'elle est identique à cette source (workflow « Code commun »).
