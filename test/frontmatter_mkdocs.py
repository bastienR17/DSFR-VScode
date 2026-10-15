"""Vérifie avec le vrai MkDocs que la correction des en-têtes (lib/frontmatter.js) fonctionne :
avant, MkDocs ignore l'en-tête et le laisse dans la page ; après, il lit les métadonnées et retire l'en-tête."""
import json
import os
import subprocess

from mkdocs.utils import meta

HERE = os.path.dirname(os.path.abspath(__file__))
CASES = [
    "---\ntitle: mentor: Déposer les documents\n---\n\n# Titre\n",
    "---\r\ntitle: mentor: l'agent\r\nsource_url: https://exemple.gouv.fr/page\r\n---\r\n\r\nTexte\r\n",
    "---\ntitle: A: B\ndescription: Étapes :\nbreadcrumb:\n  - Accueil: /\n  - Page\n---\n\nTexte\n",
]
FIX = "const { fixFrontMatter } = require('../lib/frontmatter.js');" \
      "const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));" \
      "process.stdout.write(JSON.stringify(cases.map((c) => { const f = fixFrontMatter(c); return f && f.text; })));"

fixed = json.loads(subprocess.run(['node', '-e', FIX], cwd=HERE, input=json.dumps(CASES),
                                  capture_output=True, text=True, check=True).stdout)
# MkDocs lit les fichiers en mode texte : les fins de ligne Windows deviennent « \n ».
def read_like_mkdocs(text):
    return text.replace('\r\n', '\n')


for before, after in zip(CASES, fixed):
    body, data = meta.get_data(read_like_mkdocs(before))
    assert data == {} and body.startswith('---'), 'MkDocs devrait ignorer l\'en-tête fautif'
    assert after, 'correction attendue'
    body, data = meta.get_data(read_like_mkdocs(after))
    assert data and not body.startswith('---'), 'en-tête corrigé non lu par MkDocs : ' + repr(after)
print(f'En-têtes corrigés lus par MkDocs : {len(CASES)}/{len(CASES)} OK')
