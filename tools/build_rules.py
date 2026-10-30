#!/usr/bin/env python3
"""Règles Firestore de Studio Prism — SOURCE UNIQUE pour tout le projet Firebase « archivision-studioprism »
(site, ARCHIPLAN, ARCHITRAFIC, ArchiVision, SPECTRA Writer / Calc / Slide, NEXUS).

Un projet Firebase n'a qu'UN fichier de règles en ligne : chaque publication remplace tout. Les règles sont donc
rangées ici en morceaux (firebase/rules/NN-nom.rules, assemblés dans l'ordre des noms) et ce script :
  1. assemble firebase/firestore.rules à partir des morceaux ;
  2. vérifie que les collections de CHAQUE app sont présentes (une app oubliée = son cloud refusé en production) ;
  3. vérifie la structure (rules_version, accolades équilibrées, règle finale « tout refusé »).

Usage :
  python3 tools/build_rules.py            # assemble + contrôle (écrit firebase/firestore.rules)
  python3 tools/build_rules.py --check    # contrôle seulement que firebase/firestore.rules est à jour
Publication : firebase deploy --only firestore:rules   (depuis CE dépôt uniquement)
"""
import pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
PARTS = sorted((ROOT / 'firebase' / 'rules').glob('*.rules'))
OUT = ROOT / 'firebase' / 'firestore.rules'
REQUIRED = {
    'site':            ['users', 'companies', 'products', 'subscriptions', 'prices', 'licenses', 'licenseKeys', 'licenseRequests', 'organizations', 'settings', 'pages', 'pageDrafts', 'projects', 'media', 'deletedAccounts'],
    'ARCHIPLAN':       ['clientProfiles', 'apProjects', 'apUsage', 'apFolders', 'apShares', 'apGrants', 'apLibrary'],
    'ARCHITRAFIC':     ['atProjects', 'atUsage', 'atFolders', 'atShares', 'atGrants', 'atLibrary'],
    'code PIN':        ['userSecrets'],
    'SPECTRA Writer':  ['swDocs', 'swUsage', 'swFolders', 'swShares', 'swGrants', 'swLibrary', 'swPublic'],
    'SPECTRA Calc':    ['scDocs', 'scUsage', 'scFolders', 'scShares', 'scGrants', 'scLibrary', 'scPublic'],
    'SPECTRA Slide':   ['ssDocs', 'ssUsage', 'ssFolders', 'ssShares', 'ssGrants', 'ssLibrary', 'ssPublic'],
    'SPECTRA Motion':  ['smDocs', 'smUsage', 'smFolders', 'smShares', 'smGrants', 'smLibrary'],
    'NEXUS':           ['nxUsers', 'nxConfig'],
    'devis':           ['quotes', 'counters'],
}
def build():
    return ''.join(p.read_text(encoding='utf-8') for p in PARTS)
def check(src):
    errs = []
    if "rules_version = '2';" not in src: errs.append("rules_version = '2' absent")
    code = re.sub(r'//[^\n]*', '', src)
    code = re.sub(r"'(?:\\.|[^'\\])*'", "''", code)
    if code.count('{') != code.count('}'): errs.append(f"accolades déséquilibrées ({code.count('{')} ouvrantes / {code.count('}')} fermantes)")
    tail = code.rstrip()
    if 'match /{document=**}' not in tail[-400:] or 'if false' not in tail[-400:]: errs.append('la règle finale « tout refusé » doit rester en dernier')
    for app, cols in REQUIRED.items():
        miss = [c for c in cols if not re.search(r'match /' + c + r'/', src)]
        if miss: errs.append(f'{app} : collections absentes {miss}')
    return errs
if __name__ == '__main__':
    src = build()
    if '--check' in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding='utf-8') != src: sys.exit('firebase/firestore.rules n\'est pas à jour : lancer python3 tools/build_rules.py')
    errs = check(src)
    if errs: sys.exit('Règles REFUSÉES :\n  - ' + '\n  - '.join(errs))
    if '--check' not in sys.argv: OUT.write_text(src, encoding='utf-8')
    print(f'OK : {len(PARTS)} morceaux, {src.count(chr(10))} lignes, toutes les apps présentes -> {OUT.relative_to(ROOT)}')
