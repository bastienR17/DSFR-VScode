// Composants déclarés dans l'en-tête YAML (bandeau, fil d'Ariane, sommaire, lettre d'information)
const assert = require('assert');
const createMd = require('./vscode-like.js');
const render = (src) => createMd({ showErrors: () => true }).render(src, {});

const page = `---
notice:
  type: warning
  title: Attention
  description: "Voici l'exemple : un bandeau d'information importante"
  link_label: Lien si besoin
  link_url: https://example.com
  link_newtab: true
breadcrumb:
  - Accueil: /
  - "Composants DSFR : détails": /composants/
  - Fil d'Ariane
summary: True
newsletter:
  title: Restez informé
  description: Recevez les nouveautés
  button: S'abonner
  button_url: https://example.com
  rss: true
  social:
    - nom: linkedin
      url: https://linkedin.com
---

# Titre de la page

## Partie 1

### Sous-partie 1.1

## Partie 2
`;
const html = render(page);
assert(html.indexOf('fr-notice--warning') < html.indexOf('fr-breadcrumb'), 'bandeau avant le fil d\'Ariane');
assert(html.includes('<span class="fr-notice__desc">Voici l\'exemple : un bandeau d\'information importante</span>'), html);
assert(html.includes('target="_blank" rel="noopener external" class="fr-notice__link">Lien si besoin</a>'), html);
assert(html.includes('le titre (title) du bandeau n\'apparaît pas sur le site'), 'avertissement sur le titre du bandeau');
assert(html.includes('href="/composants/">Composants DSFR : détails</a>'), html);
assert(html.includes('aria-current="page">Fil d&#39;Ariane</a>') || html.includes('aria-current="page">Fil d\'Ariane</a>'), html);
assert(/fr-summary[\s\S]*Partie 1[\s\S]*Sous-partie 1\.1[\s\S]*Partie 2/.test(html), 'sommaire h2/h3');
assert(!/fr-summary__link[^>]*>Titre de la page/.test(html), 'le h1 n\'est pas dans le sommaire');
assert(html.includes('data-dsfr-goto="1"') && html.includes('data-dsfr-heading="1"'), 'liens du sommaire');
assert(html.indexOf('fr-follow') > html.indexOf('Partie 2'), 'lettre d\'information en bas de page');
assert(html.includes('fr-btn--linkedin') && html.includes('fr-icon-rss-fill'), html);
assert(!html.includes('<hr>'), 'en-tête masqué');

// Erreurs fréquentes
const bad = render('---\nbreadcrumb:\n  - Composants DSFR : détails: /composants/\n  - Page\n---\n\n# T\n');
assert(bad.includes('En-tête YAML illisible'), bad);
const noLink = render('---\nbreadcrumb:\n  - Accueil\n  - Page\n---\n\n# T\n');
assert(noLink.includes('la génération de la page échouera'), noLink);
const lastLink = render('---\nbreadcrumb:\n  - Accueil: /\n  - Page: /page/\n---\n\n# T\n');
assert(lastLink.includes('ne doit pas avoir de lien'), lastLink);
const typo = render('---\nnotice:\n  type: important\n  description: x\n---\n\n# T\n');
assert(typo.includes('Type de bandeau inconnu'), typo);
// Sans en-tête : rien d'ajouté
const plain = render('# T\n\nTexte\n');
assert(!plain.includes('fr-notice') && !plain.includes('fr-breadcrumb') && !plain.includes('dsfr-preview-error'), plain);
console.log('En-tête de page (bandeau, fil d\'Ariane, sommaire, lettre d\'info, erreurs) : OK');
