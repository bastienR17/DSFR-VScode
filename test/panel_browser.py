"""Panneau « Composants » (lib/component-panel.js) dans Chromium, avec les couleurs d'un thème VS Code
clair puis sombre : vignettes chargées, recherche (sans tenir compte des accents), clic qui envoie le
message d'insertion à l'extension.

Utilisation : python3 panel_browser.py [dossier des captures]
"""
import json
import pathlib
import subprocess
import sys
import tempfile

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
THEMES = {
    'light': {'--vscode-foreground': '#3b3b3b', '--vscode-sideBar-background': '#f8f8f8', '--vscode-input-background': '#ffffff',
              '--vscode-input-foreground': '#3b3b3b', '--vscode-input-border': '#cecece', '--vscode-editorWidget-background': '#ffffff',
              '--vscode-focusBorder': '#005fb8', '--vscode-font-family': 'system-ui, sans-serif'},
    'dark': {'--vscode-foreground': '#cccccc', '--vscode-sideBar-background': '#181818', '--vscode-input-background': '#313131',
             '--vscode-input-foreground': '#cccccc', '--vscode-input-border': '#3c3c3c', '--vscode-editorWidget-background': '#202020',
             '--vscode-focusBorder': '#0078d4', '--vscode-font-family': 'system-ui, sans-serif'},
}
# Le HTML du panneau, tel que l'extension le fabrique (vignettes servies depuis media/thumbnails)
JS = """
const path = require('path');
const { panelHtml } = require('./lib/component-panel');
process.stdout.write(panelHtml({ snippets: require('./snippets/dsfr.json'), cspSource: 'file:', nonce: 'n0nce',
  thumb: (p) => 'file://' + path.resolve('media/thumbnails', p + '.jpg') }));
"""
FAKE_API = ('<script nonce="n0nce">window.sent = []; '
            'window.acquireVsCodeApi = () => ({ postMessage: (m) => window.sent.push(m) });</script>')


def main(out=None):
    html = subprocess.run(['node', '-e', JS], cwd=ROOT, check=True, capture_output=True, text=True).stdout
    html = html.replace('<head>', '<head>' + FAKE_API, 1)
    tmp = pathlib.Path(tempfile.mkdtemp())
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, variables in THEMES.items():
            css = ':root{' + ';'.join(k + ':' + v for k, v in variables.items()) + '} body{background:var(--vscode-sideBar-background)}'
            page_file = tmp / ('panneau-' + name + '.html')
            page_file.write_text(html.replace('</style>', css + '</style>', 1).replace('<body>', '<body class="vscode-' + name + '">', 1))
            tab = browser.new_page(viewport={'width': 340, 'height': 900})
            tab.goto(page_file.as_uri())
            assert tab.locator('.card').count() >= 40
            # Vignettes chargées à la demande dans VS Code : on les charge toutes ici
            broken = tab.evaluate("""async () => {
              for (const i of document.images) i.loading = 'eager';
              await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
              return [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src);
            }""")
            assert not broken, 'vignettes non chargées : %s' % broken
            # Couleur de la famille adaptée au thème (bleu France clair, ou plus lumineux en sombre)
            color = tab.evaluate("getComputedStyle(document.querySelector('.family .prefix')).color")
            assert color == ('rgb(0, 0, 145)' if name == 'light' else 'rgb(139, 139, 255)'), color
            if out:
                tab.screenshot(path=str(pathlib.Path(out) / ('panneau-' + name + '.png')))
            tab.fill('#search', 'ACCORDEON')
            visible = tab.locator('.card:visible').count()
            assert 1 <= visible < 5, 'recherche « accordéon » : %d' % visible
            tab.fill('#search', 'zzz')
            assert tab.locator('#empty').is_visible()
            assert tab.locator('.family:visible').count() == 0
            tab.fill('#search', 'capture')
            tab.locator('.card:visible').first.click()
            assert tab.evaluate('window.sent') == [{'type': 'insert', 'prefix': 'dsfr-sirh-capture'}]
            tab.fill('#search', '')
            assert tab.locator('.card:visible').count() == tab.locator('.card').count()
            tab.close()
        browser.close()
    print('Panneau des composants dans Chromium (thèmes clair et sombre) : vignettes, couleurs, recherche et clic OK')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else None)
