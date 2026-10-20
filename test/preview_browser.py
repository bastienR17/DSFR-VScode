"""Test navigateur de media/dsfr-preview.js dans des conditions proches de VS Code.

VS Code charge les scripts d'aperçu en « async » et insère le contenu de la page après coup :
ce test reproduit ce fonctionnement et vérifie que les styles DSFR restent actifs, que l'accordéon
s'ouvre au clic et qu'il reste ouvert après une mise à jour de l'aperçu, puis que les styles
sont bien coupés quand le rendu DSFR est désactivé.
Il vérifie aussi le passage d'un fichier à l'autre : VS Code recharge alors tout l'aperçu, et chaque
page doit retrouver ses propres accordéons (ouverts sur une page, fermés sur une autre).
L'extension est servie sous un nom de dossier quelconque (« un-clone ») : la détection des
feuilles de style ne doit pas dépendre du nom du dossier d'installation.
Prérequis : pip install playwright && playwright install chromium
"""
import functools, http.server, json, os, subprocess, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "/// alert | Titre\n    type: warning\nTexte\n///\n\n/// accordion | Mon accordéon\nContenu caché\n///\n"

body = json.loads(subprocess.run(['node', os.path.join(ROOT, 'test', 'render.js')], input=json.dumps([SRC]),
                                 capture_output=True, text=True, check=True).stdout)[0]
body = '<div id="dsfr-preview-state" data-enabled="true" data-theme="auto" hidden></div><div class="markdown-body">' + body + '</div>'
attr = body.replace('&', '&amp;').replace('"', '&quot;')
links = ''.join(f'<link rel="stylesheet" href="/un-clone/media/{p}">' for p in
                ['dsfr/dsfr.min.css', 'dsfr/utility/utility.min.css', 'dsfr/css/theme.css', 'dsfr-preview.css'])
def page(source):
    settings = json.dumps({'source': source}).replace('"', '&quot;')
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">{links}<meta id="data" data-c="{attr}">
<meta id="vscode-markdown-preview-data" data-settings="{settings}" data-state="{{}}"></head>
<body class="vscode-body vscode-light"><script async src="/un-clone/media/dsfr-preview.js"></script>
<script>
document.addEventListener('DOMContentLoaded', () => setTimeout(() => {{
  const d = new DOMParser().parseFromString(document.getElementById('data').dataset.c, 'text/html');
  document.body.append(...d.body.children);
}}, 150));
window.disableDsfr = () => {{
  document.getElementById('dsfr-preview-state').setAttribute('data-enabled', 'false');
  window.dispatchEvent(new CustomEvent('vscode.markdown.updateContent'));
}};
window.simulateUpdate = () => {{
  document.querySelectorAll('[aria-expanded]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  document.querySelectorAll('.fr-collapse--expanded').forEach(c => c.classList.remove('fr-collapse--expanded'));
  window.dispatchEvent(new CustomEvent('vscode.markdown.updateContent'));
}};
</script></body></html>"""

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.startswith('/un-clone/'):
            return os.path.join(ROOT, path[len('/un-clone/'):].split('?')[0])
        return super().translate_path(path)
    def do_GET(self):
        if self.path.startswith('/page/'):
            data = page('file:///docs/' + self.path[len('/page/'):]).encode('utf8')
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
        else:
            super().do_GET()
    def log_message(self, *a):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_address[1]}/page/'
url = base + 'a.md'
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(url); pg.wait_for_timeout(600)
    assert pg.evaluate("document.body.classList.contains('dsfr-preview')"), 'script de l\'aperçu non chargé'
    assert pg.evaluate("[...document.querySelectorAll('link')].every(l => !l.disabled)"), 'styles DSFR désactivés'
    assert pg.evaluate("getComputedStyle(document.querySelector('.fr-alert')).backgroundImage") != 'none', 'alerte sans style DSFR'
    pg.click('.fr-accordion__btn'); pg.wait_for_timeout(200)
    assert pg.evaluate("document.querySelector('.fr-collapse').classList.contains('fr-collapse--expanded')"), 'accordéon fermé après clic'
    pg.evaluate('simulateUpdate()'); pg.wait_for_timeout(200)
    assert pg.evaluate("document.querySelector('.fr-collapse').classList.contains('fr-collapse--expanded')"), 'accordéon refermé après mise à jour'
    expanded = "document.querySelector('.fr-collapse').classList.contains('fr-collapse--expanded')"
    # Changement de fichier : VS Code recharge l'aperçu sur l'autre page
    pg.goto(base + 'b.md'); pg.wait_for_timeout(600)
    assert not pg.evaluate(expanded), "l'accordéon ouvert sur a.md est ouvert sur b.md"
    pg.goto(base + 'a.md'); pg.wait_for_timeout(600)
    assert pg.evaluate(expanded), "a.md n'a pas retrouvé son accordéon ouvert"
    pg.click('.fr-accordion__btn'); pg.wait_for_timeout(200)
    pg.goto(base + 'b.md'); pg.wait_for_timeout(600)
    pg.goto(base + 'a.md'); pg.wait_for_timeout(600)
    assert not pg.evaluate(expanded), "l'accordéon refermé sur a.md s'est rouvert"
    pg.evaluate('disableDsfr()'); pg.wait_for_timeout(200)
    assert pg.evaluate("[...document.querySelectorAll('link')].every(l => l.disabled)"), 'styles DSFR toujours actifs une fois le rendu coupé'
    assert not pg.evaluate("document.documentElement.hasAttribute('data-fr-theme')"), 'thème DSFR toujours appliqué'
    b.close()
server.shutdown()
print('Aperçu (navigateur, comportement VS Code) : styles actifs puis coupés, accordéon cliquable, conservé et propre à chaque page OK')
