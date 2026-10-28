#!/usr/bin/env python3
"""Veille : versions du thème et du DSFR plus récentes que celles reproduites par l'extension.

L'aperçu reproduit une version précise de mkdocs-dsfr, de dsfr_structure et du DSFR (voir README,
« Limites connues »). Ce script compare ces versions de référence aux dernières publiées sur PyPI
et npm, et émet un avertissement GitHub Actions (::warning::) pour chacune qui a changé : il faut
alors relancer les tests de parité avec la nouvelle version et mettre l'aperçu à jour si besoin.

Il ne fait jamais échouer la CI : un registre injoignable donne une simple note.
Lancé chaque semaine par .github/workflows/ci.yml, ou à la main : python scripts/check-upstream.py
"""
import json
import os
import sys
import urllib.request

# Versions reproduites par l'aperçu : à mettre à jour avec README (Limites connues) et requirements-dev.txt
REFERENCES = [
    ('mkdocs-dsfr', 'pypi', 'mkdocs-dsfr', '0.26.1'),
    ('dsfr_structure', 'pypi', 'dsfr-structure', '0.12.0'),
    ('DSFR', 'npm', '@gouvfr/dsfr', '1.15.2'),
]


def latest(registry, name):
    url = ('https://pypi.org/pypi/%s/json' % name) if registry == 'pypi' else ('https://registry.npmjs.org/%s/latest' % name)
    with urllib.request.urlopen(url, timeout=20) as r:
        data = json.load(r)
    return data['info']['version'] if registry == 'pypi' else data['version']


def as_tuple(v):
    parts = []
    for p in v.split('.'):
        digits = ''.join(c for c in p if c.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts)


def main():
    lines = []
    outdated = 0
    for label, registry, name, ref in REFERENCES:
        try:
            current = latest(registry, name)
        except Exception as e:  # registre injoignable : on n'échoue pas
            print('::notice::Veille : %s non vérifié (%s)' % (label, e))
            lines.append('| %s | %s | ? | non vérifié |' % (label, ref))
            continue
        if as_tuple(current) > as_tuple(ref):
            outdated += 1
            print('::warning title=Nouvelle version de %s::%s %s est publié (l\'aperçu reproduit %s). '
                  'Relancer les tests de parité avec cette version et mettre l\'aperçu à jour si besoin.' % (label, label, current, ref))
            lines.append('| %s | %s | **%s** | à vérifier |' % (label, ref, current))
        else:
            lines.append('| %s | %s | %s | à jour |' % (label, ref, current))
    summary = '### Veille des versions\n\n| Composant | Reproduit | Dernière | État |\n|---|---|---|---|\n' + '\n'.join(lines) + '\n'
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write(summary)
    return 0 if '--strict' not in sys.argv or not outdated else 1


if __name__ == '__main__':
    sys.exit(main())
