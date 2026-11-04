#!/usr/bin/env python3
"""Génère telechargements/manifest.json : liste de tous les .apk du dossier (nom, taille, date de dernière modification Git)."""
import json, pathlib, subprocess, datetime
d = pathlib.Path(__file__).resolve().parents[1] / 'telechargements'
out = []
for f in sorted(d.glob('*.apk')):
    try:
        ts = subprocess.check_output(['git', 'log', '-1', '--format=%cI', '--', str(f)], text=True, cwd=d).strip()
    except Exception:
        ts = ''
    out.append({'name': f.name, 'size': f.stat().st_size, 'date': ts or datetime.datetime.fromtimestamp(f.stat().st_mtime).isoformat()})
(d / 'manifest.json').write_text(json.dumps({'files': out}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(len(out), 'apk')
