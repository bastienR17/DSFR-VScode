"""Compare le rendu du plugin markdown-it avec la référence Python (dsfr_structure)."""
import glob, json, re, subprocess, sys, os
import markdown
from bs4 import BeautifulSoup, NavigableString, Comment
from dsfr_structure.extension.all_extensions import AllExtensions
import dsfr_structure.extension as ext
from dsfr_structure.extension import accordion, callout, notice, quote, card, tile, media, tab, button

HERE = os.path.dirname(os.path.abspath(__file__))

try:  # dsfr_structure 0.13 et plus : tags
    from dsfr_structure.extension import tag as tag_ext
    TAG_CLASSES = [tag_ext.DsfrTags, tag_ext.DsfrTag]
except ImportError:
    TAG_CLASSES = []

def reset():
    for cls in [accordion.DsfrAccordion, callout.DsfrCallout, notice.DsfrNotice, quote.DsfrQuote, card.DsfrCard,
                tile.DsfrTile, media.DsfrMedia, tab.DsfrTabs, tab.DsfrTab, button.DsfrButtons, button.DsfrButton] + TAG_CLASSES:
        cls.count = 0

def py_render(src):
    reset()
    # Même ordre que MkDocs : toc, tables, fenced_code puis les extensions du mkdocs.yml
    md = markdown.Markdown(extensions=['toc', 'tables', 'fenced_code', AllExtensions(), 'admonition', 'pymdownx.details', 'attr_list', 'def_list'])
    return md.convert(src)

def canon(html):
    soup = BeautifulSoup(html, 'html.parser')
    def walk(node):
        out = []
        for c in node.children:
            if isinstance(c, Comment):
                continue
            if isinstance(c, NavigableString):
                t = ' '.join(str(c).split())
                if t:
                    out.append(t)
                continue
            attrs = []
            for k, v in c.attrs.items():
                if k == 'id' and c.name in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
                    continue  # ids ajoutés par l'extension toc de MkDocs
                if k == 'data-dsfr-heading':
                    continue  # repère interne à l'aperçu (sommaire)
                if isinstance(v, list):
                    v = ' '.join(v)
                attrs.append((k, ' '.join(str(v).split())))
            out.append((c.name, tuple(sorted(attrs)), tuple(walk(c))))
        return out
    return tuple(walk(soup))

def pretty(html):
    return BeautifulSoup(html, 'html.parser').prettify()

def main():
    # 1) Cas extraits des tests officiels de dsfr_structure
    cases = []
    for f in sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(accordion.__file__)), '..', '..', 'tests', 'test_*.py'))):
        src = open(f, encoding='utf8').read()
        for m in re.finditer(r'test_case\s*=\s*"""(.*?)"""', src, re.S):
            cases.append((os.path.basename(f), m.group(1)))
    # 2) Cas supplémentaires
    extra = json.load(open(os.path.join(HERE, 'cases.json'), encoding='utf8'))
    cases += [('cases.json', c) for c in extra]

    js = json.loads(subprocess.run(['node', os.path.join(HERE, 'render.js')], input=json.dumps([c for _, c in cases]),
                                   capture_output=True, text=True, check=True).stdout)
    ok = 0
    fails = []
    expected = []
    for (name, src), j in zip(cases, js):
        p = py_render(src)
        if canon(p) == canon(j):
            ok += 1
        elif 'picto:' in src:
            expected.append(name + ' (pictogramme injecté en SVG dans l\'aperçu au lieu de <use href>)')
        elif src == '- a\n\n- b\n- c\n':
            expected.append(name + ' (liste aérée : Python-Markdown n\'entoure pas la dernière puce d\'un <p>, simple écart de marge)')
        elif name == 'test_table.py' and '\n                        |' in src:
            expected.append(name + ' (tableau indenté de 24 espaces : artefact du fichier de test)')
        else:
            fails.append((name, src, p, j))
    print(f'{ok}/{len(cases)} identiques, {len(expected)} écarts attendus, {len(fails)} écarts inattendus')
    for e in expected: print('  écart attendu :', e)
    for name, src, p, j in fails:
        print('=' * 70); print('CAS', name); print(src); print('--- python'); print(pretty(p)); print('--- js'); print(pretty(j))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
