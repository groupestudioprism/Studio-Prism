# Code commun Studio Prism

Une seule source pour le code partagé par les apps. On modifie **ici**, jamais dans les apps.

| Fichier | Rôle | Apps |
|---|---|---|
| `device-lock.js` | Verrouillage de l'appareil : code PIN chiffré, Face ID / Touch ID / empreinte (clé d'accès commune à `*.studio-prism.com`) | ARCHIPLAN, ARCHITRAFIC, ArchiVision, SPECTRA Writer, Calc, Slide |
| `prism-settings.js` | Panneau Réglages commun | ARCHIPLAN, ARCHITRAFIC |

Après une modification :

```
python3 tools/sync_shared.py ..            # recopie dans les dépôts voisins
# puis, dans chaque app : python3 tools/build.py, commit, push
```

Chaque app vérifie à chaque publication qu'elle est identique à cette source (workflow « Code commun »).
