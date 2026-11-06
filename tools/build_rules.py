#!/usr/bin/env python3
"""Règles Firestore de Studio Prism — SOURCE UNIQUE pour tout le projet Firebase « archivision-studioprism »
(site, ARCHIPLAN, ARCHITRAFIC, ArchiVision, SPECTRA Writer / Calc / Slide, NEXUS, PRISM ARCADE).

Un projet Firebase n'a qu'UN fichier de règles en ligne : chaque publication remplace tout. Les règles sont donc
rangées ici en morceaux (firebase/rules/NN-nom.rules, assemblés dans l'ordre des noms) et ce script :
  1. assemble firebase/firestore.rules à partir des morceaux ;
  2. vérifie que les collections de CHAQUE app sont présentes (une app oubliée = son cloud refusé en production) ;
  3. vérifie la structure (rules_version, accolades équilibrées, règle finale « tout refusé ») ;
  4. vérifie de la même façon les règles Storage (firebase/storage.rules, source unique elle aussi).

Usage :
  python3 tools/build_rules.py            # assemble + contrôle (écrit firebase/firestore.rules)
  python3 tools/build_rules.py --check    # contrôle seulement que firebase/firestore.rules est à jour
Publication : firebase deploy --only firestore:rules,storage   (depuis CE dépôt uniquement)
"""
import pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
PARTS = sorted((ROOT / 'firebase' / 'rules').glob('*.rules'))
OUT = ROOT / 'firebase' / 'firestore.rules'
PUB = ROOT / 'firebase' / 'firestore.publier.rules'   # même contenu sans commentaires ni lignes vides : c'est CE fichier qu'on publie
STORAGE = ROOT / 'firebase' / 'storage.rules'
STORAGE_REQUIRED = {'médiathèque du site': 'media', 'ARCHIVISION': 'archivision', 'SPECTRA Motion': 'spectramotion'}
REQUIRED = {
    'site':            ['users', 'companies', 'products', 'productFolders', 'subscriptions', 'prices', 'licenses', 'licenseKeys', 'licenseRequests', 'organizations', 'settings', 'pages', 'pageDrafts', 'projects', 'media', 'deletedAccounts'],
    'ARCHIPLAN':       ['clientProfiles', 'apProjects', 'apUsage', 'apFolders', 'apShares', 'apGrants', 'apLibrary'],
    'ARCHIVISION':     ['avModels', 'avPhotos', 'arLive'],
    'ARCHITRAFIC':     ['atProjects', 'atUsage', 'atFolders', 'atShares', 'atGrants', 'atLibrary'],
    'code PIN':        ['userSecrets'],
    'SPECTRA Writer':  ['swDocs', 'swUsage', 'swFolders', 'swShares', 'swGrants', 'swLibrary', 'swPublic'],
    'SPECTRA Calc':    ['scDocs', 'scUsage', 'scFolders', 'scShares', 'scGrants', 'scLibrary', 'scPublic', 'scScripts'],
    'SPECTRA Slide':   ['ssDocs', 'ssUsage', 'ssFolders', 'ssShares', 'ssGrants', 'ssLibrary', 'ssPublic'],
    'SPECTRA Motion':  ['smDocs', 'smUsage', 'smFolders', 'smShares', 'smGrants', 'smLibrary'],
    'NEXUS':           ['nxUsers', 'nxConfig'],
    'PRISM ARCADE':    ['paPlayers', 'paBoards', 'paPeriods'],
    'devis':           ['quotes', 'counters'],
    'présence':        ['appPresence', 'appSessions'],
}
def build():
    return ''.join(p.read_text(encoding='utf-8') for p in PARTS)
def compact(src):
    """Retire les commentaires // et les lignes vides, sans toucher aux chaînes ('…' ou "…") ni aux chemins /a/b."""
    out, i, n, q = [], 0, len(src), None
    while i < n:
        c = src[i]
        if q:
            out.append(c)
            if c == '\\' and i + 1 < n: out.append(src[i + 1]); i += 2; continue
            if c == q: q = None
            i += 1; continue
        if c in ('"', "'"): q = c; out.append(c); i += 1; continue
        if c == '/' and src.startswith('//', i):
            while i < n and src[i] != '\n': i += 1
            continue
        out.append(c); i += 1
    lits = re.findall(r"'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"", src)
    if any('  ' in l or '\t' in l for l in lits): sys.exit('Une chaîne contient des espaces multiples : la version compacte la modifierait')
    lines = [l.rstrip() for l in ''.join(out).split('\n')]
    head = '// Studio Prism · règles Firestore À PUBLIER (générées par tools/build_rules.py depuis firebase/rules/ ; source commentée : firebase/firestore.rules)\n'
    return head + '\n'.join(' '.join(l.split()) for l in lines if l.strip()) + '\n'
def structure(src, final):
    errs = []
    if "rules_version = '2';" not in src: errs.append("rules_version = '2' absent")
    code = re.sub(r'//[^\n]*', '', src)
    code = re.sub(r"'(?:\\.|[^'\\])*'", "''", code)
    if code.count('{') != code.count('}'): errs.append(f"accolades déséquilibrées ({code.count('{')} ouvrantes / {code.count('}')} fermantes)")
    tail = code.rstrip()
    if final not in tail[-400:] or 'if false' not in tail[-400:]: errs.append('la règle finale « tout refusé » doit rester en dernier')
    return errs
def check_storage():
    if not STORAGE.exists(): return ['firebase/storage.rules absent']
    src = STORAGE.read_text(encoding='utf-8')
    errs = ['Storage : ' + e for e in structure(src, 'match /{allPaths=**}')]
    for app, path in STORAGE_REQUIRED.items():
        if not re.search(r'match /' + path + r'/', src): errs.append(f'Storage : {app} absent (match /{path}/…)')
    return errs
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
        if not PUB.exists() or PUB.read_text(encoding='utf-8') != compact(src): sys.exit('firebase/firestore.publier.rules n\'est pas à jour : lancer python3 tools/build_rules.py')
    errs = check(src) + check_storage()
    if errs: sys.exit('Règles REFUSÉES :\n  - ' + '\n  - '.join(errs))
    pub = compact(src)
    if '--check' not in sys.argv: OUT.write_text(src, encoding='utf-8'); PUB.write_text(pub, encoding='utf-8')
    print(f'OK : {len(PARTS)} morceaux, {src.count(chr(10))} lignes, toutes les apps présentes -> {OUT.relative_to(ROOT)} ; Storage OK ({', '.join(STORAGE_REQUIRED.values())})')
    print(f'À PUBLIER : {PUB.relative_to(ROOT)} ({len(pub.encode()) // 1024} Ko sans commentaires, limite Firebase 256 Ko)')
