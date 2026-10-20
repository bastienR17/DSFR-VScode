'use strict';
/**
 * Composants « uniques par page », déclarés dans l'en-tête YAML du fichier Markdown :
 *
 *   ---
 *   notice: { type: warning, description: "…" }   → bandeau d'information importante
 *   breadcrumb: [ {Accueil: /}, "Page courante" ] → fil d'Ariane
 *   summary: true                                 → sommaire des titres h2/h3
 *   newsletter: { title: …, button_url: … }       → lettre d'information, en bas de page
 *   ---
 *
 * Le HTML reprend les gabarits du thème mkdocs-dsfr 0.26.1 (notice.html, breadcrumb.html,
 * summary.html, newsletter.html), y compris leurs particularités : par exemple, le thème
 * n'affiche pas le titre du bandeau. L'aperçu fait de même et le signale.
 *
 * VS Code masque lui-même l'en-tête YAML dans l'aperçu : ce module ne fait que le lire.
 */
const { esc, cls, errorBox } = require('./html');
const { MARKUPS, NOTICE_TYPES } = require('./options');
const { analyzeFrontMatter, describeError } = require('./frontmatter');

const str = (v) => (v === null || v === undefined ? '' : String(v));
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {object} ctx
 * @param {() => boolean} ctx.showErrors
 * @param {(url: string) => string} ctx.url  neutralise les adresses dangereuses
 * @param {(env: object, issue: object) => void} [ctx.report]  remonte un problème à l'éditeur
 *        (la clé d'en-tête concernée est indiquée par `key` : lint.js en retrouve la ligne)
 */
module.exports = function createPageMeta(ctx) {
  const { showErrors, url } = ctx;
  const report = ctx.report || (() => {});

  /**
   * Règle « core » : lit l'en-tête et entoure le document de deux jetons,
   * `dsfr_page_top` (bandeau, fil d'Ariane, sommaire) et `dsfr_page_bottom` (lettre d'information).
   * Les titres reçoivent un repère `data-dsfr-heading` pour les liens du sommaire.
   */
  function pageMetaRule(state) {
    if (state.inlineMode) return; // rendu d'un texte en ligne (titre de bloc…) : pas de page
    const fm = analyzeFrontMatter(state.src);
    // Ligne de chaque clé de premier niveau de l'en-tête (« notice: », « breadcrumb: »…), pour les encadrés.
    const keyLines = {};
    if (fm) {
      const lines = state.src.split('\n');
      for (let l = 1; l < lines.length && !/^(---|\.\.\.)\s*$/.test(lines[l]); l++) {
        const k = /^([\w-]+)\s*:/.exec(lines[l]);
        if (k && keyLines[k[1]] === undefined) keyLines[k[1]] = l;
      }
    }
    const info = fm
      ? {
        keyLines,
        errorLine: fm.error ? (fm.fixes.length ? fm.fixes[0].line : fm.errorLine) : null,
        meta: fm.meta || {},
        error: fm.error
          ? describeError(fm) + (fm.fixes.length ? ' Correction en un clic : ampoule sur la ligne soulignée dans l\'éditeur, ou commande « DSFR : Corriger les en-têtes YAML des fichiers Markdown ».' : '')
          : null,
        source: fm.source,
      }
      : { meta: {}, error: null, source: '', keyLines: {}, errorLine: null };

    const top = new state.Token('dsfr_page_top', '', 0);
    top.block = true;
    top.meta = info;
    const bottom = new state.Token('dsfr_page_bottom', '', 0);
    bottom.block = true;
    bottom.meta = info;
    state.tokens.unshift(top);
    state.tokens.push(bottom);

    let n = 0;
    for (const t of state.tokens) if (t.type === 'heading_open') t.attrSet('data-dsfr-heading', String(n++));
  }

  /* --- Bandeau d'information importante (notice.html) ----------------- */
  function noticeHtml(n, env, line) {
    if (!isPlainObject(n)) return '';
    const markup = MARKUPS.includes(str(n.markup)) ? str(n.markup) : 'p';
    const type = str(n.type) || 'info';
    let out = '<div id="mkdocs-dsfr-notice" class="fr-notice fr-notice--' + esc(type) + '">\n<div class="fr-container">\n<div class="fr-notice__body">\n<' + markup + '>';
    // Le gabarit du thème 0.26.1 lit « notice.e » au lieu de « notice.title » : le titre reste vide.
    out += '<span class="' + cls('fr-notice__title', n.icon ? 'fr-icon-' + esc(str(n.icon)) : '') + '"></span>';
    if (n.description) out += '<span class="fr-notice__desc">' + esc(str(n.description)) + '</span>';
    if (n.link_label) {
      out += '<a href="' + esc(url(str(n.link_url) || '#')) + '"' + (n.link_newtab ? ' target="_blank" rel="noopener external"' : '') +
        ' class="fr-notice__link">' + esc(str(n.link_label)) + '</a>';
    }
    out += '</' + markup + '>\n</div>\n</div>\n</div>\n';
    if (showErrors()) {
      if (n.title) {
        const message = 'Avec le thème mkdocs-dsfr 0.26.1, le titre (title) du bandeau n\'apparaît pas sur le site : seule la description (description) est affichée.';
        out += errorBox('notice:\n  title: ' + str(n.title), message, 'site', line);
        report(env, { code: 'dsfr-notice-title', level: 'site', key: 'notice', subkey: 'title', message });
      }
      if (!NOTICE_TYPES.includes(type)) {
        const message = 'Type de bandeau inconnu. Valeurs possibles : ' + NOTICE_TYPES.join(', ') + '.';
        out += errorBox('notice:\n  type: ' + type, message, 'warning', line);
        report(env, { code: 'dsfr-notice-type', level: 'warning', key: 'notice', subkey: 'type', value: type, choices: NOTICE_TYPES, message });
      }
    }
    return out;
  }

  /* --- Fil d'Ariane (breadcrumb.html) ---------------------------------
   * Format attendu : « - Titre: /adresse/ » pour chaque lien, puis le titre de la page courante.
   */
  function breadcrumbHtml(items, env, line) {
    if (!Array.isArray(items) || !items.length) {
      if (!showErrors()) return '';
      const message = 'Le fil d\'Ariane doit être une liste : « - Accueil: / » pour chaque lien, puis le titre de la page courante sans lien.';
      report(env, { code: 'dsfr-breadcrumb', level: 'error', key: 'breadcrumb', message });
      return errorBox('breadcrumb: …', message, 'error', line);
    }
    let out = '<nav role="navigation" class="fr-breadcrumb" aria-label="vous êtes ici :">\n' +
      '<button class="fr-breadcrumb__button" aria-expanded="false" aria-controls="breadcrumb-1">Voir le fil d’Ariane</button>\n' +
      '<div class="fr-collapse" id="breadcrumb-1">\n<ol class="fr-breadcrumb__list">\n';
    const problems = [];
    let fatal = false;
    items.forEach((item, i) => {
      if (i < items.length - 1) {
        if (!isPlainObject(item)) {
          // Le gabarit appelle item.items() : MkDocs s'arrête sur une erreur.
          problems.push('l\'élément « ' + str(item) + ' » n\'a pas de lien : sur le site, la génération de la page échouera (format attendu « - Titre: /adresse/ »).');
          fatal = true;
          return;
        }
        for (const label of Object.keys(item)) {
          const href = str(item[label]);
          out += '<li><a class="fr-breadcrumb__link" href="' + esc(url((href.startsWith('/') ? '' : '/') + href)) + '">' + esc(label) + '</a></li>\n';
        }
      } else {
        if (item && typeof item === 'object') {
          problems.push('le dernier élément (page courante) ne doit pas avoir de lien : sur le site, il s\'affichera tel quel, accolades comprises.');
        }
        const label = item && typeof item === 'object' ? JSON.stringify(item) : str(item);
        out += '<li><a class="fr-breadcrumb__link" aria-current="page">' + esc(label) + '</a></li>\n';
      }
    });
    out += '</ol>\n</div>\n</nav>\n';
    if (problems.length && showErrors()) {
      const message = 'Fil d\'Ariane : ' + problems.join(' ');
      out += errorBox('breadcrumb:', message, fatal ? 'error' : 'warning', line);
      report(env, { code: 'dsfr-breadcrumb', level: fatal ? 'error' : 'warning', key: 'breadcrumb', message });
    }
    return out;
  }

  /* --- Sommaire (summary.html) : titres de niveau 2 et leurs sous-titres de niveau 3 --- */
  function headingText(tokens, i) {
    const inline = tokens[i + 1];
    if (!inline || !inline.children) return '';
    return inline.children.filter((c) => c.type === 'text' || c.type === 'code_inline').map((c) => c.content).join('');
  }

  function summaryHtml(tokens) {
    // Arbre des titres, comme la table des matières de MkDocs
    const root = { level: 0, children: [] };
    const stack = [root];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'heading_open') continue;
      const node = { level: Number(tokens[i].tag.slice(1)), title: headingText(tokens, i), ref: tokens[i].attrGet('data-dsfr-heading'), children: [] };
      while (stack.length > 1 && stack[stack.length - 1].level >= node.level) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
    // Le gabarit parcourt les enfants des titres de premier niveau (h1) : on fait de même.
    // Les liens portent data-dsfr-goto : le clic est géré par media/dsfr-preview.js.
    const link = (n) => '<a class="fr-summary__link" href="#" data-dsfr-goto="' + esc(n.ref) + '">' + esc(n.title) + '</a>';
    let items = '';
    for (const top of root.children) {
      for (const item of top.children) {
        items += '<li>\n' + link(item) + '\n';
        if (item.children.length) items += '<ol>\n' + item.children.map((c) => '<li>' + link(c) + '</li>\n').join('') + '</ol>\n';
        items += '</li>\n';
      }
    }
    if (!items) return '';
    return '<nav class="fr-summary" role="navigation" aria-labelledby="fr-summary-title">\n' +
      '<p class="fr-summary__title" id="fr-summary-title">Sommaire</p>\n<ol>\n' + items + '</ol>\n</nav>\n';
  }

  /* --- Lettre d'information et réseaux sociaux (newsletter.html) ------- */
  function newsletterHtml(n) {
    if (!isPlainObject(n)) return '';
    const title = str(n.title);
    const social = Array.isArray(n.social) ? n.social : [];
    const hasSocial = !!n.rss || social.length > 0;
    if (!title && !hasSocial) return '';
    let out = '<div class="fr-follow" id="follow">\n<div class="fr-container">\n<div class="fr-grid-row">\n';
    if (title) {
      out += '<div class="fr-col-12' + (hasSocial ? ' fr-col-md-8' : '') + '">\n<div class="fr-follow__newsletter">\n<div>\n<h2 class="fr-h5">' + esc(title) + '</h2>\n';
      out += '<p class="fr-text--sm">' + esc(str(n.description)) + '</p>\n</div>\n';
      if (n.button_url) {
        out += '<div>\n<ul class="fr-btns-group fr-btns-group--inline-md">\n<li><a href="' + esc(url(str(n.button_url))) + '" id="newsletter-button" class="fr-btn">' +
          esc(str(n.button || 'S’abonner')) + '</a></li>\n</ul>\n</div>\n';
      }
      out += '</div>\n</div>\n';
    }
    if (hasSocial) {
      out += '<div class="fr-col-12' + (title ? ' fr-col-md-4' : '') + '">\n<div class="fr-follow__social">\n<h2 class="fr-h5">' + esc(str(n.social_title || 'Suivez-nous')) + ' </h2>\n<ul class="fr-btns-group">\n';
      if (n.rss) {
        // Les flux RSS sont générés par un plugin MkDocs : pas de cible dans l'aperçu.
        out += '<li><a title="RSS nouveau contenu" id="rss-new" href="#" class="fr-icon-rss-fill fr-btn">RSS nouveau contenu</a></li>\n';
        out += '<li><a title="RSS mises à jour" id="rss-update" href="#" class="fr-icon-rss-line fr-btn">RSS mises à jour</a></li>\n';
      }
      for (const network of social) {
        const nom = esc(str(network && network.nom));
        out += '<li><a title="Suivez-nous sur ' + nom + '" id="rs-' + nom + '" href="' + esc(url(str(network && network.url))) +
          '" target="_blank" rel="noopener external" class="fr-btn--' + nom + ' fr-btn">' + nom + '</a></li>\n';
      }
      out += '</ul>\n</div>\n</div>\n';
    }
    return out + '</div>\n</div>\n</div>\n';
  }

  /** HTML placé avant le contenu : bandeau, fil d'Ariane puis sommaire (ordre du thème). */
  function renderTop(info, tokens, env) {
    const { meta, error, source } = info;
    if (error) return showErrors() ? errorBox(source, error, 'header', info.errorLine) : '';
    let out = '';
    if (meta.notice) out += noticeHtml(meta.notice, env, info.keyLines.notice);
    if (meta.breadcrumb !== undefined) out += breadcrumbHtml(meta.breadcrumb, env, info.keyLines.breadcrumb);
    if (meta.summary === true || String(meta.summary).toLowerCase() === 'true') out += summaryHtml(tokens);
    return out;
  }

  /** HTML placé après le contenu : lettre d'information. */
  function renderBottom(info) {
    return info.meta.newsletter ? newsletterHtml(info.meta.newsletter) : '';
  }

  return { pageMetaRule, renderTop, renderBottom };
};
