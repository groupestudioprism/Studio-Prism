#!/usr/bin/env python3
"""Pages pré-rendues du site (référencement) : une vraie page HTML par adresse publique, + sitemap.xml, robots.txt et 404.html.

Pourquoi : Google ignore ce qui suit « # » ; avec des adresses #/produits il ne voyait qu'une page. Le site utilise maintenant de
vraies adresses (/produits/archiphase, voir js/spr.js) et ce script écrit pour chacune un fichier <adresse>/index.html qui contient
déjà le texte de la page, son titre, sa description et son adresse canonique : Google le lit sans exécuter le JavaScript, le
visiteur retrouve l'application normale (qui reprend la main au chargement).

Lancé par l'action « Publication du site » (.github/workflows/pages.yml) à chaque modification et chaque nuit : il copie le dépôt
dans _site/, ouvre chaque page dans Chrome sans écran (Playwright), parcourt les liens et écrit les fichiers. Rien n'est ajouté au
dépôt lui-même. En cas d'échec du rendu, _site/ reste publiable (l'application s'ouvre via 404.html, comme avant).

Usage : python3 tools/build_pages.py [--out _site] [--max 400]
"""
import argparse, datetime, html, http.server, json, pathlib, re, shutil, socketserver, sys, threading, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
SITE = 'https://studio-prism.com'
SKIP_COPY = {'.git', '.github', 'tests', 'node_modules', '_site', 'functions'}
PRIVATE = re.compile(r'^(compte|admin|panier|commande|confirmation|confirmation-commande|activer|paiement|merci-|mon-abonnement|p/brouillon)')
NOINDEX_ROUTES = {'compte/connexion', 'compte/inscription'}
ALIASES = {'a-propos/equipe'}
ALIAS_RE = re.compile(r'^(abonnements/.+|archivision/(connexion|inscription))$')   # vues filtrées ou pages de compte   # même page qu'une autre adresse (ancre) : pas de fichier séparé
DESC = {
  '': 'Studio Prism, studio créatif et technologique normand : applications métier (ArchiPlan, ArchiTraffic, ArchiPhase, ArchiVision), suite bureautique gratuite SPECTRA, BIM / XR, jeux et impression 3D.',
  'produits': 'Toutes les applications Studio Prism : gamme Archi pour la construction et les VRD, suite bureautique SPECTRA gratuite, Nexus, Prism Arcade.',
  'abonnements': 'Formules et prix des applications Studio Prism : formule gratuite, Pro et Pro Entreprise. La gamme SPECTRA est 100 % gratuite.',
  'contact': 'Contacter Studio Prism : une question, un projet d’application, de BIM / XR ou d’impression 3D ? Écrivez-nous.',
  'rendez-vous': 'Réserver un échange avec Studio Prism pour présenter votre projet.',
  'mentions-legales': 'Mentions légales du site Studio Prism : éditeur, directeur de la publication, hébergeurs, médiation, propriété intellectuelle.',
  'confidentialite': 'Politique de confidentialité de Studio Prism : données traitées, finalités, durées de conservation, sous-traitants et vos droits (RGPD).',
  'conditions-utilisation': 'Conditions d’utilisation du site, des comptes et des applications Studio Prism.',
  'cgv': 'Conditions générales de vente des licences et abonnements Studio Prism : commande par devis, paiement, droit de rétractation, médiation.',
  'cookies': 'Cookies et données : le site Studio Prism ne dépose aucun cookie publicitaire ni de mesure d’audience.',
  'accessibilite': 'Déclaration d’accessibilité du site et des applications Studio Prism.',
}


class Handler(http.server.SimpleHTTPRequestHandler):
    """Serveur local qui imite GitHub Pages + application : fichier s'il existe, sinon index.html."""
    def log_message(self, *a): pass
    def translate_path(self, path):
        p = pathlib.Path(super().translate_path(path))
        if p.is_dir() and (p / 'index.html').exists(): return str(p / 'index.html')
        if p.exists(): return str(p)
        return str(pathlib.Path(self.directory) / 'index.html')


def serve(directory):
    h = lambda *a, **k: Handler(*a, directory=str(directory), **k)
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def norm(route):
    r = urllib.parse.unquote(route or '').split('#')[0].strip('/')
    return r


def to_path_links(s):
    """href="#/x" -> href="/x" data-spr (lien lisible par Google ; app.js l'intercepte comme avant)."""
    return re.sub(r'href="#/([^"]*)"', lambda m: f'href="/{m.group(1)}" data-spr', s)


def esc(s): return html.escape(s or '', quote=True)


def page_html(tpl, r, info):
    title = info['title']; desc = info['desc']; url = SITE + '/' + (r + '/' if r else '')
    img = info.get('image') or SITE + '/assets/img/studio-prism.png'
    head = [f'<link rel="canonical" href="{esc(url)}">', f'<meta property="og:url" content="{esc(url)}">', f'<meta property="og:image" content="{esc(img)}">',
            '<meta property="og:locale" content="fr_FR">', '<meta name="twitter:card" content="summary_large_image">']
    if r in NOINDEX_ROUTES: head.append('<meta name="robots" content="noindex">')
    ld = info.get('ld')
    if ld: head.append('<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace('</', '<\\/') + '</script>')
    s = tpl
    s = re.sub(r'<title>.*?</title>', f'<title>{esc(title)}</title>', s, count=1, flags=re.S)
    s = re.sub(r'(<meta name="description" content=")[^"]*', lambda m: m.group(1) + esc(desc), s, count=1)
    s = re.sub(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + esc(title), s, count=1)
    s = re.sub(r'(<meta property="og:description" content=")[^"]*', lambda m: m.group(1) + esc(desc), s, count=1)
    s = s.replace('</head>', '\n'.join(head) + '\n</head>', 1)
    s = s.replace('<main id="v" tabindex="-1"></main>', f'<main id="v" tabindex="-1">{info["main"]}</main>', 1)
    return to_path_links(s)


def org_ld():
    return {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Organization', '@id': SITE + '/#org', 'name': 'Studio Prism', 'url': SITE + '/', 'logo': SITE + '/assets/img/studio-prism.png',
         'description': DESC['']},
        {'@type': 'WebSite', '@id': SITE + '/#site', 'name': 'Studio Prism', 'url': SITE + '/', 'inLanguage': 'fr-FR', 'publisher': {'@id': SITE + '/#org'}}]}


def render(out, max_pages):
    from playwright.sync_api import sync_playwright
    srv, port = serve(out); base = f'http://127.0.0.1:{port}'
    tpl = (out / 'index.html').read_text(encoding='utf-8')
    done, queue, pages = set(), [''], {}
    with sync_playwright() as p:
        b = p.chromium.launch(**({'executable_path': '/usr/bin/google-chrome'} if pathlib.Path('/usr/bin/google-chrome').exists() and '--system-chrome' in sys.argv else {}))
        pg = b.new_page(viewport={'width': 1280, 'height': 900})
        pg.add_init_script("window.__SP_PRERENDER=true;try{matchMedia=(q=>({matches:/reduce/.test(q),media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}))}catch(e){}")
        while queue and len(done) < max_pages:
            r = queue.pop(0)
            if r in done: continue
            done.add(r)
            try:
                pg.goto(base + '/' + r, wait_until='load', timeout=30000)
                pg.wait_for_function("document.body.dataset.r && document.getElementById('v').children.length", timeout=15000)
                try: pg.wait_for_load_state('networkidle', timeout=6000)
                except Exception: pass   # requêtes Firestore longues : on garde ce qui est affiché
                pg.wait_for_timeout(500)
                d = pg.evaluate("""() => {
                  const v = document.getElementById('v'); if (!v) return null;
                  v.querySelectorAll('.rv').forEach(e => e.classList.add('in'));
                  const h1 = v.querySelector('h1'), p = [...v.querySelectorAll('p')].map(x => x.textContent.trim()).find(t => t.length > 60) || '';
                  const md = document.querySelector('meta[name="description"]');
                  const links = [...document.querySelectorAll('a[href^="#/"],a[data-spr]')].map(a => a.getAttribute('href').replace(/^#?\\//, ''));
                  const img = v.querySelector('img[src^="http"],img[src^="assets/"],img[src^="/"]');
                  return { route: document.body.dataset.r || '', title: document.title, h1: h1 ? h1.textContent.trim() : '', p, desc: md ? md.content : '',
                    cmsDesc: md && md.hasAttribute('data-cms-meta') ? md.content : '', nf: !!v.querySelector('.nf,[data-nf]') || /introuvable/i.test(h1 ? h1.textContent : ''),
                    main: v.innerHTML, links, img: img ? img.getAttribute('src') : '' };
                }""")
            except Exception as e:
                print('  !', r or '/', e.__class__.__name__, str(e)[:120]); continue
            if not d or d['nf'] or (d['route'] != (r or 'home') and r): continue
            for l in d['links']:
                l = norm(l)
                if '?' in l or PRIVATE.match(l) or l in done or l in queue: continue
                queue.append(l)
            if PRIVATE.match(r) or r in ALIASES or ALIAS_RE.match(r): continue
            if d['h1'] and d['title'].startswith('Studio Prism — Creative') and r:
                d['title'] = d['h1'] + (' — présentation' if r.endswith('/presentation') else '') + ' — Studio Prism'
            desc = d['cmsDesc'] or DESC.get(r) or (d['p'][:157].rsplit(' ', 1)[0] + '…' if len(d['p']) > 160 else d['p']) or DESC['']
            img = d['img']; img = img if img.startswith('http') else (SITE + '/' + img.lstrip('/')) if img else ''
            info = {'title': d['title'], 'desc': desc, 'main': d['main'], 'image': img}
            if r == '': info['ld'] = org_ld()
            elif r.startswith('produits/') and d['h1']:
                info['ld'] = {'@context': 'https://schema.org', '@type': 'SoftwareApplication', 'name': d['h1'], 'description': desc,
                              'url': SITE + '/' + r + '/', 'applicationCategory': 'BusinessApplication', 'operatingSystem': 'Web',
                              'publisher': {'@type': 'Organization', 'name': 'Studio Prism', 'url': SITE + '/'}, **({'image': img} if img else {})}
            pages[r] = info
            print('  ✓', '/' + r, '—', d['title'][:70])
        b.close()
    srv.shutdown()
    return tpl, pages


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', default='_site'); ap.add_argument('--max', type=int, default=400)
    ap.add_argument('--system-chrome', action='store_true'); a = ap.parse_args()
    out = (ROOT / a.out).resolve()
    if out.exists(): shutil.rmtree(out)
    shutil.copytree(ROOT, out, ignore=lambda d, names: [n for n in names if n in SKIP_COPY or (pathlib.Path(d) == ROOT and n.endswith('.md'))])
    tpl = (out / 'index.html').read_text(encoding='utf-8')
    # 404.html : l'application elle-même (adresses de compte, d'administration…), jamais indexée
    (out / '404.html').write_text(tpl.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex">', 1), encoding='utf-8')
    pages = {}
    try:
        tpl, pages = render(out, a.max)
    except Exception as e:
        print('Rendu impossible, site publié sans pages pré-rendues :', e)
    today = datetime.date.today().isoformat()
    for r, info in pages.items():
        dst = out / r / 'index.html' if r else out / 'index.html'
        if r and (out / r).is_file(): continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(page_html(tpl, r, info), encoding='utf-8')
    urls = [r for r in pages if r not in NOINDEX_ROUTES] or ['']
    pri = lambda r: '1.0' if r == '' else '0.9' if r.startswith('produits') else '0.3' if r in DESC and r not in ('produits', 'abonnements', 'contact', 'rendez-vous') else '0.6'
    (out / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        ''.join(f'  <url><loc>{SITE}/{r + "/" if r else ""}</loc><lastmod>{today}</lastmod><priority>{pri(r)}</priority></url>\n' for r in sorted(urls)) + '</urlset>\n', encoding='utf-8')
    (out / 'robots.txt').write_text('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /compte\nDisallow: /panier\nDisallow: /commande\n\n'
        f'Sitemap: {SITE}/sitemap.xml\n', encoding='utf-8')
    print(f'{len(pages)} pages pré-rendues, sitemap : {len(urls)} adresses -> {out}')


if __name__ == '__main__':
    main()
