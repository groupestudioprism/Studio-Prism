#!/usr/bin/env python3
"""Dossiers d'images des produits : Produits/{id}/ dans le dépôt, Produits/manifest.json pour le site.

Lancé par l'action GitHub « Dossiers produits » (.github/workflows/produits.yml) :
  1. lit la liste des produits dans Firestore, sans compte :
       - productFolders (un document par produit, brouillons compris, tenu à jour par l'administration du site) ;
       - à défaut (règles pas encore publiées), les produits publics de la collection products ;
  2. crée Produits/{id}/ pour chaque produit qui n'en a pas encore ;
  3. supprime Produits/{id}/ et ses images quand le produit a disparu de productFolders (seulement s'il y figurait
     au passage précédent : un dossier créé à la main pour un produit intégré au site n'est jamais supprimé) ;
  4. écrit Produits/manifest.json : les images de chaque dossier, dans l'ordre des noms de fichier, avec leur légende.

Aucune suppression si Firestore ne répond pas ou renvoie une liste vide. Usage : python3 tools/sync_produits.py [--hors-ligne]
"""
import json, pathlib, re, shutil, sys, urllib.request, urllib.error, datetime

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIR = ROOT / 'Produits'
MANIFEST = DIR / 'manifest.json'
IMG = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg'}
ID_RE = re.compile(r'^[a-z0-9][a-z0-9_-]{1,59}$')
LISEZMOI = """# Images du produit « {id} »

Déposez ici les images à afficher sur la page du produit (https://studio-prism.com/#/produits/{id}).
Formats : JPG, PNG, WebP, GIF, AVIF ou SVG. Elles apparaissent sur le site quelques minutes après l'enregistrement (commit).

- **Ordre** : celui des noms de fichier. Commencez-les par un numéro : `01-vue-3d.webp`, `02-plan.webp`…
- **Légendes** (facultatif) : un fichier `legendes.txt`, une ligne par image : `01-vue-3d.webp : Vue 3D de la maison d'exemple`.
  Sans légende, le nom du fichier sert de texte de remplacement.
- Ce dossier est créé et supprimé automatiquement avec le produit dans l'administration du site.
  **Supprimer le produit supprime aussi ce dossier et ses images** (elles restent récupérables dans l'historique Git).
"""


def config():
    src = (ROOT / 'js' / 'firebase.js').read_text(encoding='utf-8')
    key = re.search(r'apiKey:\s*"([^"]+)"', src).group(1)
    pid = re.search(r'projectId:\s*"([^"]+)"', src).group(1)
    return key, pid


def http(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json'}, method='POST' if body is not None else 'GET')
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def folder_ids(key, pid):
    """Liste complète de productFolders, ou None si la collection n'est pas lisible."""
    base = f'https://firestore.googleapis.com/v1/projects/{pid}/databases/(default)/documents/productFolders'
    ids, token = [], ''
    try:
        while True:
            d = http(f'{base}?key={key}&pageSize=300&mask.fieldPaths=updatedAt' + (f'&pageToken={token}' if token else ''))
            ids += [x['name'].rsplit('/', 1)[1] for x in d.get('documents', [])]
            token = d.get('nextPageToken')
            if not token:
                return ids
    except urllib.error.HTTPError as e:
        print('productFolders illisible :', e.code)
        return None


def public_ids(key, pid):
    url = f'https://firestore.googleapis.com/v1/projects/{pid}/databases/(default)/documents:runQuery?key={key}'
    ids = []
    for st in ('published', 'unavailable', 'active'):
        q = {'structuredQuery': {'from': [{'collectionId': 'products'}], 'select': {'fields': [{'fieldPath': 'status'}]},
                                 'where': {'fieldFilter': {'field': {'fieldPath': 'status'}, 'op': 'EQUAL', 'value': {'stringValue': st}}}}}
        ids += [x['document']['name'].rsplit('/', 1)[1] for x in http(url, q) if 'document' in x]
    return ids


def captions(folder):
    out, f = {}, folder / 'legendes.txt'
    if f.exists():
        for line in f.read_text(encoding='utf-8').splitlines():
            if ':' in line:
                name, text = line.split(':', 1)
                if name.strip() and text.strip():
                    out[name.strip()] = text.strip()[:200]
    return out


def main():
    DIR.mkdir(exist_ok=True)
    old = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}
    known = set(old.get('suivis', []))          # produits vus dans productFolders au passage précédent
    authoritative, ids = False, None
    if '--hors-ligne' not in sys.argv:
        key, pid = config()
        ids = folder_ids(key, pid)
        if ids:
            authoritative = True
        else:
            try:
                ids = public_ids(key, pid)
            except Exception as e:
                print('Firestore injoignable :', e)
                ids = None
    ids = sorted({i for i in (ids or []) if ID_RE.match(i)})

    created, removed = [], []
    for i in ids:
        f = DIR / i
        if not f.is_dir():
            f.mkdir()
            created.append(i)
        if not (f / 'LISEZMOI.md').exists():
            (f / 'LISEZMOI.md').write_text(LISEZMOI.format(id=i), encoding='utf-8')
    if authoritative:
        for i in sorted(known - set(ids)):
            f = DIR / i
            if f.is_dir() and ID_RE.match(i):
                shutil.rmtree(f)
                removed.append(i)
        suivis = ids
    else:
        suivis = sorted(known)

    products = {}
    for f in sorted(p for p in DIR.iterdir() if p.is_dir() and ID_RE.match(p.name)):
        cap = captions(f)
        imgs = [{'file': x.name, 'caption': cap.get(x.name, '')}
                for x in sorted(f.iterdir(), key=lambda p: p.name.lower()) if x.is_file() and x.suffix.lower() in IMG]
        if imgs:
            products[f.name] = imgs
    data = {'suivis': suivis, 'products': products}
    if {k: old.get(k) for k in data} != data:
        data['generated'] = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()
        MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f"source : {'productFolders' if authoritative else 'produits publics (aucune suppression)'} · "
          f"{len(ids)} produits · créés : {created or '-'} · supprimés : {removed or '-'} · "
          f"{sum(len(v) for v in products.values())} images")


if __name__ == '__main__':
    main()
