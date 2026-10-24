#!/usr/bin/env python3
"""Code commun Studio Prism : une seule source (shared/), recopiée dans les apps.

  shared/device-lock.js     verrouillage de l'appareil : code PIN chiffré, Face ID / Touch ID / empreinte (clé d'accès commune)
  shared/prism-settings.js  panneau Réglages commun (ARCHIPLAN, ARCHITRAFIC)
  shared/manifest.json      où chaque fichier va dans chaque app (fichier entier, ou bloc entre deux repères)

Usage :
  python3 tools/sync_shared.py <dossier des dépôts>            recopie dans les apps (puis build et commit dans chaque app)
  python3 tools/sync_shared.py <dossier des dépôts> --check    vérifie seulement (code de sortie 1 si une app a divergé)
  python3 tools/sync_shared.py --app <nom> <dossier de l'app> --check   (contrôle d'une seule app, utilisé par la CI des apps)
Les noms de dépôts sont comparés sans tenir compte de la casse (archiplan = ArchiPlan)."""
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
MAN = json.loads((ROOT / 'shared' / 'manifest.json').read_text())
args = [a for a in sys.argv[1:] if not a.startswith('--')]; check = '--check' in sys.argv
def find_repo(base, name):
    for d in base.iterdir():
        if d.is_dir() and d.name.lower() == name.lower(): return d
    return None
def apply(text, entry, src):
    if entry['mode'] == 'file': return src
    i = text.find(entry['start']); j = text.find(entry['end'], i + 1)
    if i < 0 or j < 0: raise ValueError('repères introuvables')
    return text[:i] + src + text[j:]
bad = 0; done = 0
if '--app' in sys.argv:
    name = sys.argv[sys.argv.index('--app') + 1]; apps = {name: pathlib.Path(args[-1])}
else:
    base = pathlib.Path(args[0]) if args else ROOT.parent; apps = None
for entry in MAN['files']:
    src = (ROOT / 'shared' / entry['src']).read_text(encoding='utf-8')
    for app, rel in entry['targets'].items():
        if apps is not None:
            if app.lower() != name.lower(): continue
            repo = apps[name]
        else:
            repo = find_repo(base, app)
        if not repo: print(f'·  {app} : dépôt absent, ignoré'); continue
        f = repo / rel
        if not f.exists(): print(f'✗  {app}/{rel} : fichier absent'); bad += 1; continue
        old = f.read_text(encoding='utf-8')
        try: new = apply(old, entry, src)
        except ValueError as e: print(f'✗  {app}/{rel} : {e}'); bad += 1; continue
        if new == old: print(f'✓  {app}/{rel} : à jour ({entry["src"]})'); continue
        if check: print(f'✗  {app}/{rel} : diffère de shared/{entry["src"]}'); bad += 1
        else: f.write_text(new, encoding='utf-8'); print(f'→  {app}/{rel} : mis à jour'); done += 1
print(f'{done} fichier(s) mis à jour' if not check else ('tout est synchronisé' if not bad else f'{bad} écart(s)'))
sys.exit(1 if bad else 0)
