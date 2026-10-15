"""Compare le rendu d'une vraie page (front matter retiré, comme MkDocs) : Python dsfr_structure vs extension."""
import json, re, subprocess, sys, os
from compare import py_render, canon, pretty
path = sys.argv[1]
src = open(path, encoding='utf8').read()
src = re.sub(r'\A---\n.*?\n---\n', '', src, flags=re.S)  # MkDocs retire le front matter
js = json.loads(subprocess.run(['node', 'render.js'], input=json.dumps([src]), capture_output=True, text=True, check=True).stdout)[0]
py = py_render(src)
open('/tmp/page_py.html', 'w').write(pretty(py)); open('/tmp/page_js.html', 'w').write(pretty(js))
cp, cj = canon(py), canon(js)
print('Identique' if cp == cj else 'Différences (voir diff)')
