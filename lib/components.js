'use strict';
/**
 * Rendu HTML des blocs DSFR « /// nom | titre ».
 *
 * Chaque fonction reçoit les informations du bloc (`m`) et renvoie deux morceaux de HTML :
 * l'ouverture et la fermeture. Le contenu du bloc (Markdown ou texte en ligne) est rendu
 * entre les deux par markdown-it.
 *
 * Le HTML produit reprend à l'identique celui de dsfr_structure 0.13 ; la seule différence
 * voulue concerne les pictogrammes des tuiles, intégrés directement en SVG (voir pictogram()).
 *
 * Champs de `m` utilisés ici :
 *   arg       texte après « | » (titre), ou null
 *   o         options validées (voir options.js), dont `attrs`
 *   id        identifiant généré dans l'ordre du document (accordion-0, tab-1…)
 *   children  pour `tabs` : onglets contenus { id, label, icon, selected }
 *   selected  pour `tab` : onglet affiché au départ
 *   inGroup   pour `button` / `tag` : élément placé dans un groupe `buttons` / `tags`
 */
const fs = require('fs');
const path = require('path');
const { esc, cls, attrs, errorBox } = require('./html');

/**
 * @param {object} ctx
 * @param {(text: string, env: object) => string} ctx.renderInline  rend du Markdown en ligne
 * @param {(url: string) => string} ctx.url  neutralise les adresses dangereuses (javascript:…)
 * @param {() => boolean} ctx.showErrors
 * @param {string} ctx.artworkDir  dossier des pictogrammes DSFR (artwork/pictograms)
 * @param {(env: object, issue: object) => void} [ctx.report]  remonte un problème à l'éditeur
 */
module.exports = function createComponents(ctx) {
  const { renderInline, url, showErrors } = ctx;
  const report = ctx.report || (() => {});

  /* --- Pictogrammes ----------------------------------------------------
   * Sur le site, une tuile référence le pictogramme par <use href="…svg#…">. Dans l'aperçu,
   * ces références externes ne s'affichent pas : on lit le fichier SVG et on l'intègre.
   * Le nom est filtré (lettres, chiffres, tirets, « / ») : impossible de sortir du dossier.
   */
  const pictoCache = new Map();
  function pictogram(name) {
    if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(name)) return null;
    if (pictoCache.has(name)) return pictoCache.get(name);
    let svg = null;
    try {
      const src = fs.readFileSync(path.join(ctx.artworkDir, name + '.svg'), 'utf8');
      const layers = ['decorative', 'minor', 'major'].map((kind) => {
        const m = new RegExp('<symbol id="artwork-' + kind + '"[^>]*>([\\s\\S]*?)</symbol>').exec(src);
        return '<g class="fr-artwork-' + kind + '">' + (m ? m[1] : '') + '</g>';
      });
      svg = '<svg aria-hidden="true" class="fr-artwork" viewBox="0 0 80 80" width="80px" height="80px">' + layers.join('') + '</svg>';
    } catch (e) {
      svg = null; // pictogramme introuvable : signalé par l'appelant
    }
    pictoCache.set(name, svg);
    return svg;
  }

  // « Libellé | couleur, Autre » → [{ text, color }, …]. Les tuiles n'acceptent qu'un élément.
  function parseBadges(spec, multiple) {
    return (multiple ? spec.split(',') : [spec]).map((s) => {
      const p = s.split('|');
      return { text: p[0].trim(), color: p.length > 1 ? p[1].trim() : '' };
    });
  }

  function badgeOrTag(item, isBadge, env) {
    const base = isBadge ? 'fr-badge' : 'fr-tag';
    return '<p class="' + (item.color ? base + ' ' + base + '--' + esc(item.color) : base) + '">' + renderInline(item.text, env) + '</p>';
  }

  // Titre d'une carte ou d'une tuile, avec lien si `target` est renseigné.
  function titleLink(o, arg, env) {
    if (!o.target) return renderInline(arg, env);
    return '<a' + attrs([
      ['data-fr-assess-file', o.assess ? true : null],
      ['hreflang', o.lang || null],
      ['download', o.download ? true : null],
      ['href', url(o.target)],
      ['target', o.target_new ? '_blank' : null],
      ['rel', o.target_new ? 'noopener external' : null],
      ['title', o.target_new ? (arg || '') + ' - nouvelle fenêtre' : null],
    ]) + '>' + renderInline(arg, env) + '</a>';
  }

  const RENDER = {
    // Avec titre : alerte normale ; sans titre : petite alerte (fr-alert--small).
    alert(m, env) {
      const o = m.o;
      if (m.arg) {
        return [
          '<div' + attrs([['class', 'fr-alert fr-alert--' + o.type]], o.attrs) + '>\n' +
          '<' + o.markup + ' class="fr-alert__title">' + renderInline(m.arg, env) + '</' + o.markup + '>\n',
          '</div>\n',
        ];
      }
      return ['<div' + attrs([['class', 'fr-alert fr-alert--' + o.type + ' fr-alert--small']], o.attrs) + '>\n', '</div>\n'];
    },

    // L'ouverture au clic est gérée par media/dsfr-preview.js (le JS officiel du DSFR n'est pas chargé).
    accordion(m, env) {
      const o = m.o;
      return [
        '<section class="fr-accordion">\n' +
        '<' + o.markup + ' class="fr-accordion__title"><button class="fr-accordion__btn" aria-expanded="' + (o.open ? 'true' : 'false') + '" aria-controls="' + m.id + '">' +
        renderInline(m.arg, env) + '</button></' + o.markup + '>\n' +
        '<div' + attrs([['class', o.open ? 'fr-collapse fr-collapse--open' : 'fr-collapse'], ['id', m.id]], o.attrs) + '>\n',
        '</div>\n</section>\n',
      ];
    },

    // Un type (success, info…) l'emporte sur la couleur illustrative.
    badge(m) {
      const o = m.o;
      let c = 'fr-badge';
      if (o.type) c += ' fr-badge--' + o.type + (o.icon ? '' : ' fr-badge--no-icon');
      else if (o.color) c += ' fr-badge--' + o.color;
      return ['<p' + attrs([['class', c]], o.attrs) + '>', '</p>\n'];
    },

    callout(m, env) {
      const o = m.o;
      let start = '<div' + attrs([['class', cls('fr-callout', o.icon ? 'fr-icon-' + o.icon : '', o.color ? 'fr-callout--' + o.color : '')], ['id', m.id]]) + '>\n';
      if (m.arg) start += '<' + o.markup + ' class="fr-callout__title">' + renderInline(m.arg, env) + '</' + o.markup + '>\n';
      start += '<p' + attrs([['class', 'fr-callout__text']], o.attrs) + '>';
      let end = '</p>\n';
      if (o.link_label) {
        end += '<a' + attrs([
          ['class', 'fr-btn'], ['href', url(o.link_url || '#')],
          ['target', o.link_newtab ? '_blank' : null], ['rel', o.link_newtab ? 'noopener external' : null],
          ['title', o.link_label + (o.link_newtab ? ' - nouvelle fenêtre' : '')],
        ]) + '>' + renderInline(o.link_label, env) + '</a>\n';
      }
      return [start, end + '</div>\n'];
    },

    // Le contenu du bloc devient le « détail » en bas de carte.
    card(m, env) {
      const o = m.o;
      const horizontal = o.horizontal ? (o.horizontal_pos ? 'fr-card--horizontal-' + o.horizontal_pos : 'fr-card--horizontal') : '';
      let s = '<div' + attrs([['class', cls('fr-card', horizontal, o.variations ? 'fr-card--' + o.variations : '', o.download ? 'fr-card--download' : '', o.enlarge ? 'fr-enlarge-link' : '')], ['id', m.id]]) + '>\n';
      s += '<div class="fr-card__body">\n<div class="fr-card__content">\n';
      s += '<' + o.markup + ' class="fr-card__title">' + titleLink(o, m.arg, env) + '</' + o.markup + '>\n';
      if (o.description) s += '<p class="fr-card__desc">' + renderInline(o.description, env) + '</p>\n';
      const spec = o.badge || o.tag; // badge et tag sont exclusifs ; badge prioritaire
      if (spec) {
        const isBadge = !!o.badge;
        s += '<div class="fr-card__start">\n<ul class="' + (isBadge ? 'fr-badges-group' : 'fr-tags-group') + '">\n';
        for (const item of parseBadges(spec, true)) s += '<li>\n' + badgeOrTag(item, isBadge, env) + '\n</li>\n';
        s += '</ul>\n</div>\n';
      }
      s += '<div class="fr-card__end">\n<p' + attrs([['class', 'fr-card__detail']], o.attrs) + '>';
      let e = '</p>\n</div>\n</div>\n</div>\n';
      if (o.image) {
        e += '<div class="fr-card__header">\n<div class="fr-card__img"><img class="fr-responsive-img" src="' + esc(url(o.image)) + '" alt="' + esc(o.image_alt) + '" /></div>\n</div>\n';
      }
      return [s, e + '</div>\n'];
    },

    tile(m, env) {
      const o = m.o;
      let s = '<div' + attrs([['class', cls('fr-tile', o.small ? 'fr-tile--sm' : '', o.horizontal ? 'fr-tile--horizontal' : '', o.vertical_breakpoint ? 'fr-tile--vertical@' + o.vertical_breakpoint : '', o.variations ? 'fr-tile--' + o.variations : '', o.download ? 'fr-tile--download' : '', o.enlarge ? 'fr-enlarge-link' : '')], ['id', m.id]]) + '>\n';
      s += '<div class="fr-tile__body">\n<div class="fr-tile__content">\n';
      s += '<' + o.markup + ' class="fr-tile__title">' + titleLink(o, m.arg, env) + '</' + o.markup + '>\n';
      if (o.description) s += '<p class="fr-tile__desc">' + renderInline(o.description, env) + '</p>\n';
      s += '<p' + attrs([['class', 'fr-tile__detail']], o.attrs) + '>';
      let e = '</p>\n';
      const spec = o.badge || o.tag;
      if (spec) e += '<div class="fr-tile__start">\n' + badgeOrTag(parseBadges(spec, false)[0], !!o.badge, env) + '\n</div>\n';
      e += '</div>\n</div>\n<div class="fr-tile__header">\n';
      if (o.picto) {
        const svg = pictogram(o.picto);
        e += '<div class="fr-tile__pictogram">' + (svg || '') + '</div>\n';
        if (!svg && showErrors()) {
          const message = 'Pictogramme « ' + o.picto + ' » introuvable dans le DSFR. Effacez la valeur après « picto: » et tapez un espace : la liste des pictogrammes s\'ouvre (ex. buildings/city-hall).';
          e += errorBox('picto: ' + o.picto, message, 'warning', m.line);
          report(env, { code: 'dsfr-picto', level: 'warning', line: m.line, optEnd: m.optEnd, key: 'picto', value: o.picto, message });
        }
      }
      return [s, e + '</div>\n</div>\n'];
    },

    // « /// row | classes » : le titre contient des classes DSFR supplémentaires.
    row(m) {
      const o = m.o;
      return ['<div' + attrs([['class', cls('fr-grid-row', m.arg || '', o.halign ? 'fr-grid-row--' + o.halign : '', o.valign ? 'fr-grid-row--' + o.valign : '')]], o.attrs) + '>\n', '</div>\n'];
    },

    // « /// col | 12 md-6 » → fr-col-12 fr-col-md-6 ; sans titre → fr-col.
    col(m) {
      const o = m.o;
      const widths = m.arg ? m.arg.split(' ').filter(Boolean).map((a) => 'fr-col-' + a).join(' ') : 'fr-col';
      return ['<div' + attrs([['class', cls(widths, o.class)]], o.attrs) + '>\n', '</div>\n'];
    },

    // Composant déprécié par le thème : l'aperçu l'affiche mais le signale (voir dsfr-markdown-it.js).
    notice(m, env) {
      const o = m.o;
      let s = '<div' + attrs([['class', 'fr-notice fr-notice--' + o.type], ['id', m.id]]) + '>\n<div class="fr-container">\n<div class="fr-notice__body">\n<' + o.markup + '>';
      s += '<span class="' + esc(cls('fr-notice__title', o.icon ? 'fr-icon-' + o.icon : '')) + '">' + renderInline(m.arg, env) + '</span>';
      s += '<span' + attrs([['class', 'fr-notice__desc']], o.attrs) + '>';
      let e = '</span>';
      if (o.link_label) {
        e += '<a' + attrs([
          ['class', 'fr-notice__link'], ['href', o.link_url ? url(o.link_url) : null],
          ['target', o.link_newtab ? '_blank' : null], ['rel', o.link_newtab ? 'noopener external' : null],
          ['title', o.link_newtab && o.link_title ? o.link_title : null],
        ]) + '>' + renderInline(o.link_label, env) + '</a>';
      }
      return [s, e + '</' + o.markup + '>\n</div>\n</div>\n</div>\n'];
    },

    // Citation DSFR ; le titre du bloc est l'auteur.
    quote(m, env) {
      const o = m.o;
      const s = '<figure' + attrs([['class', cls('fr-quote fr-quote--column', o.color ? 'fr-quote--' + o.color : '')], ['id', m.id]]) + '>\n' +
        '<blockquote>\n<p' + attrs([['class', 'fr-text--' + o.size]], o.attrs) + '>';
      let e = '</p>\n</blockquote>\n<figcaption>\n<p class="fr-quote__author">' + renderInline(m.arg, env) + '</p>\n';
      if (o.image) e += '<div class="fr-quote__image"><img class="fr-responsive-img" src="' + esc(url(o.image)) + '" alt="" /></div>\n';
      return [s, e + '</figcaption>\n</figure>\n'];
    },

    // Vidéo, vidéo externe (iframe), audio ou image ; le titre du bloc est la légende.
    media(m, env) {
      const o = m.o;
      const title = o.title || m.arg || '';
      const src = o.url ? url(o.url) : null;
      let s = '<figure' + attrs([['role', 'group'], ['id', m.id], ['class', 'fr-content-media'], ['aria-label', m.arg]], o.attrs) + '>\n';
      const ratio = 'fr-responsive-vid fr-ratio-' + o.ratio;
      if (o.type === 'video') {
        s += '<video' + attrs([['class', ratio], ['controls', true], ['poster', o.poster ? url(o.poster) : null], ['src', src]]) + '>';
        if (o.captions) s += '<track kind="captions" label="Français" src="' + esc(url(o.captions)) + '" srclang="fr" default />';
        s += '</video>\n';
      } else if (o.type === 'video_external') {
        s += '<iframe' + attrs([['class', ratio], ['src', src], ['allow', 'accelerometer; encrypted-media; gyroscope; picture-in-picture'], ['allowfullscreen', true], ['title', title]]) + '></iframe>\n';
      } else if (o.type === 'audio') {
        s += '<audio' + attrs([['class', ratio], ['controls', true], ['src', src]]) + '></audio>\n';
      } else if (o.type === 'image') {
        s += '<div class="fr-content-media__img"><img' + attrs([['class', 'fr-responsive-img fr-ratio-' + o.ratio], ['src', src], ['alt', o.url ? title : null]]) + ' /></div>\n';
      }
      if (m.arg) {
        s += '<figcaption class="fr-content-media__caption">' + renderInline(m.arg, env);
        if (o.link) s += '<a class="fr-link" href="' + esc(url(o.link)) + '" id="' + m.id + '-link">' + renderInline(o.link_label || o.link, env) + '</a>';
        s += '</figcaption>\n';
      }
      return [s, '</figure>\n'];
    },

    // La liste des onglets est construite à partir des blocs `tab` trouvés à l'analyse.
    tabs(m, env) {
      const o = m.o;
      let s = '<div' + attrs([['class', cls('fr-tabs', o.viewport_width ? 'fr-tabs--viewport-width' : '')], ['id', m.id]], o.attrs) + '>\n';
      s += '<ul class="fr-tabs__list" role="tablist" aria-label="' + esc(o.label) + '">\n';
      for (const t of m.children) {
        s += '<li role="presentation"><button' + attrs([
          ['type', 'button'], ['id', t.id], ['class', cls('fr-tabs__tab', t.icon ? 'fr-icon-' + t.icon + ' fr-tabs__tab--icon-left' : '')],
          ['tabindex', t.selected ? '0' : '-1'], ['role', 'tab'], ['aria-selected', t.selected ? 'true' : 'false'], ['aria-controls', t.id + '-panel'],
        ]) + '>' + renderInline(t.label, env) + '</button></li>\n';
      }
      return [s + '</ul>\n', '</div>\n'];
    },

    tab(m) {
      return ['<div' + attrs([['id', m.id + '-panel'], ['class', cls('fr-tabs__panel', m.selected ? 'fr-tabs__panel--selected' : '')], ['role', 'tabpanel'], ['aria-labelledby', m.id], ['tabindex', '0']], m.o.attrs) + '>\n', '</div>\n'];
    },

    // `md` est la taille par défaut : elle n'ajoute pas de classe.
    buttons(m) {
      const o = m.o;
      const c = ['fr-btns-group'];
      if (o.size && o.size !== 'md') c.push('fr-btns-group--' + o.size);
      if (o.inline && o.inline !== 'vertical') c.push('fr-btns-group--' + o.inline);
      if (o.equisized) c.push('fr-btns-group--equisized');
      if (o.align) c.push('fr-btns-group--' + o.align);
      return ['<ul' + attrs([['class', c.join(' ')], ['id', m.id]], o.attrs) + '>\n', '</ul>\n'];
    },

    // Un bouton dans un groupe `buttons` est placé dans un <li>.
    button(m, env) {
      const o = m.o;
      const c = ['fr-btn'];
      if (o.kind) c.push('fr-btn--' + o.kind);
      if (o.size && o.size !== 'md') c.push('fr-btn--' + o.size);
      if (o.icon) {
        c.push('fr-icon-' + o.icon);
        if (o.icon_place === 'left') c.push('fr-btn--icon-left');
        else if (o.icon_place === 'right') c.push('fr-btn--icon-right');
      }
      const a = '<a' + attrs([
        ['class', c.join(' ')], ['href', url(o.target || '#')],
        ['aria-disabled', o.disabled ? 'true' : null], ['role', o.disabled ? 'link' : null],
        ['target', o.target_new ? '_blank' : null], ['rel', o.target_new ? 'noopener external' : null],
        ['title', o.target_new ? m.arg + ' - nouvelle fenêtre' : null],
      ], o.attrs) + '>' + renderInline(m.arg, env) + (m.hasContent ? '\n' : '');
      return m.inGroup ? ['<li>' + a, '</a></li>\n'] : [a, '</a>\n'];
    },

    // Groupe de tags (dsfr_structure 0.13)
    tags(m) {
      return ['<ul' + attrs([['class', cls('fr-tags-group', m.o.size ? 'fr-tags-group--sm' : '')], ['id', m.id]], m.o.attrs) + '>\n', '</ul>\n'];
    },

    // Tag : <button>, ou lien <a> s'il a une cible ; dans un groupe `tags`, placé dans un <li>.
    tag(m, env) {
      const o = m.o;
      const c = ['fr-tag'];
      if (o.size) c.push('fr-tag--sm');
      if (o.icon) c.push('fr-icon-' + o.icon, 'fr-tag--icon-left');
      if (o.color) c.push('fr-tag--' + o.color);
      const tagName = o.target ? 'a' : 'button';
      const el = '<' + tagName + attrs(o.target ? [
        ['href', url(o.target)], ['target', o.target_new ? '_blank' : null], ['rel', o.target_new ? 'noopener external' : null],
        ['title', o.target_new ? m.arg + ' - nouvelle fenêtre' : null], ['class', c.join(' ')],
      ] : [['class', c.join(' ')]], o.attrs) + '>' + renderInline(m.arg, env) + (m.hasContent ? '\n' : '');
      return m.inGroup ? ['<li>' + el, '</' + tagName + '></li>\n'] : [el, '</' + tagName + '>\n'];
    },
  };

  /** @returns {[string, string]} HTML d'ouverture et de fermeture du bloc */
  return function renderComponent(m, env) {
    return RENDER[m.name](m, env);
  };
};
