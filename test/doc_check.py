"""Vérifie chaque exemple de la documentation officielle : même rendu que le site, et aucune erreur dans l'aperçu."""
import json, subprocess, sys
from compare import py_render, canon, pretty
from doc_examples import EXAMPLES

names = list(EXAMPLES)
srcs = [EXAMPLES[n] for n in names]
js = json.loads(subprocess.run(['node', 'render.js'], input=json.dumps(srcs), capture_output=True, text=True, check=True).stdout)
# Rendu avec signalement des erreurs, pour vérifier que l'aperçu ne signale rien
errs = [('dsfr-preview-error' in h) for h in json.loads(subprocess.run(['node', 'render.js', '--errors'], input=json.dumps(srcs), capture_output=True, text=True, check=True).stdout)]
bad = 0
for n, s, j, e in zip(names, srcs, js, errs):
    same = canon(py_render(s)) == canon(j)
    if not same or e:
        bad += 1
        print('✗', n, '' if same else '(rendu différent du site)', '(erreur signalée)' if e else '')
        if '-v' in sys.argv and not same:
            print('--- site'); print(pretty(py_render(s))); print('--- aperçu'); print(pretty(j))
print(f'{len(names) - bad}/{len(names)} exemples de la documentation identiques au site, sans erreur')
sys.exit(1 if bad else 0)
