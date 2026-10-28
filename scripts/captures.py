"""Régénère les captures d'écran du README (docs/images/) à partir des pages d'exemple.

Le rendu est celui du plugin, affiché dans une page qui imite l'aperçu de VS Code.
Prérequis : npm install, pip install playwright, python -m playwright install chromium.
Utilisation : python3 scripts/captures.py
"""
import functools
import http.server
import json
import os
import subprocess
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'images')

RENDER = """
const createMd = require('./test/vscode-like.js');
const fs = require('fs');
const file = process.argv[1];
// Mise en page « comme le site » (réglage par défaut de l'extension)
const { DOC_SIRH } = require('./lib/site-frame');
const site = () => Object.assign({}, DOC_SIRH, { path: 'docs/Prise-en-main-du-SIRH/demo.md' });
process.stdout.write(createMd({ showErrors: () => true, site }).render(fs.readFileSync(file, 'utf8'), {}));
"""

# Styles de base approximatifs de l'aperçu Markdown de VS Code
VSCODE_CSS = """
body { font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 14px; padding: 0 26px; line-height: 22px; }
body.vscode-light { background: #ffffff; color: #1f1f1f; }
body.vscode-dark { background: #1f1f1f; color: #cccccc; }
"""


def render(sample):
    return subprocess.run(['node', '-e', RENDER, os.path.join(ROOT, 'samples', sample)],
                          cwd=ROOT, capture_output=True, text=True, check=True).stdout


def page(body, theme):
    sheets = ['dsfr/dsfr.min.css', 'dsfr/utility/utility.min.css', 'dsfr/css/theme.css', 'dsfr-preview.css']
    links = ''.join(f'<link rel="stylesheet" href="/media/{s}">' for s in sheets)
    return (f'<!DOCTYPE html><html><head><meta charset="utf-8"><base href="/samples/"><style>{VSCODE_CSS}</style>{links}</head>'
            f'<body class="vscode-body vscode-{theme}"><div class="markdown-body">{body}</div>'
            f'<script src="/media/dsfr-preview.js"></script></body></html>')


def main():
    # nom de la page → (HTML, hauteur de la capture en pixels)
    pages = {
        'apercu-clair.html': (page(render('demo.md'), 'light'), 1300),
        'apercu-sombre.html': (page(render('demo.md'), 'dark'), 1300),
        'erreurs.html': (page(render('erreurs.md'), 'light'), 1100),
    }

    class Handler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            name = self.path.lstrip('/')
            if name in pages:
                data = pages[name][0].encode('utf8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(data)
            else:
                super().do_GET()

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=ROOT))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_address[1]}/'
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name in pages:
            pg = browser.new_page(viewport={'width': 1100, 'height': pages[name][1]}, device_scale_factor=1)
            pg.goto(base + name)
            pg.wait_for_timeout(800)
            target = os.path.join(OUT, name.replace('.html', '.png'))
            pg.screenshot(path=target)
            print('→', os.path.relpath(target, ROOT))
        browser.close()
    server.shutdown()


if __name__ == '__main__':
    main()
