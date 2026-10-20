'use strict';
/**
 * Plugin markdown-it qui reproduit le rendu du thème MkDocs DSFR.
 *
 * Il ajoute à markdown-it :
 *   - les blocs de dsfr_structure, écrits avec la syntaxe de pymdownx.blocks :
 *
 *       /// alert | Titre          ← nom du bloc et titre facultatif
 *           type: success          ← options : YAML indenté de 4 espaces
 *       Contenu **Markdown**
 *       ///                        ← fermeture (autant de « / » qu'à l'ouverture)
 *
 *   - les transformations automatiques du thème : citations « > » en mise en exergue,
 *     tableaux DSFR avec légende « [texte] » ;
 *   - les encadrés « !!! » (admonition) et « ??? » (pymdownx.details) ;
 *   - les composants déclarés dans l'en-tête YAML (voir page-meta.js) ;
 *   - les corrections de compatibilité avec Python-Markdown (voir mkdocs-compat.js) ;
 *   - le signalement, dans l'aperçu, des blocs mal écrits ;
 *   - la remontée des mêmes problèmes à l'éditeur : si `env.dsfrIssues` est un tableau, chaque
 *     problème y est ajouté avec sa ligne (voir lint.js, qui en fait des soulignements).
 *
 * Organisation :
 *   options.js        blocs connus, options autorisées, lecture du YAML des options
 *   components.js     HTML de chaque bloc
 *   page-meta.js      en-tête YAML : bandeau, fil d'Ariane, sommaire, lettre d'information
 *   mkdocs-compat.js  écarts entre markdown-it et Python-Markdown
 *   html.js           fonctions d'échappement et encadrés d'erreur
 *
 * Le plugin ne dépend pas de VS Code : il se teste avec Node seul (voir test/).
 *
 * Aperçu DSFR pour Markdown — créé par Bastien (bastienR17), licence MIT.
 */
const path = require('path');
const { BLOCKS, parseYamlLite, dedent, validate } = require('./options');
const { esc, errorBox } = require('./html');
const { closest } = require('./similar');
const createComponents = require('./components');
const createPageMeta = require('./page-meta');
const installMkdocsCompat = require('./mkdocs-compat');

// Début et fin de bloc : « /// nom | titre » et « /// » (3 barres ou plus)
const START_RE = /^(\/{3,})[ ]*([\w-]+)[ ]*(?:\|[ ]*(.*?)[ ]*)?$/;
const END_RE = /^(\/{3,})[ ]*$/;
// Ouverture d'un bloc de code clôturé : son contenu ne doit pas être interprété
const FENCE_OPEN_RE = /^(`{3,}|~{3,})/;
// !!! note "Titre"   et   ???+ note "Titre"
const ADMONITION_RE = /^!!![ ]?([\w-]+(?: +[\w-]+)*)(?: +"(.*?)")? *$/;
const DETAILS_RE = /^\?\?\?(\+)?[ ]?([\w-]+(?: +[\w-]+)*)(?: +"(.*?)")? *$/;
// Pour expliquer un bloc non fermé : lignes de structure (« /// … ») et délimiteurs de code
const STRUCTURE_RE = /^\s{0,3}\/{3,}/;
const ANY_FENCE_RE = /^\s*(`{3,}|~{3,})/;

/**
 * Cause la plus fréquente d'un bloc « non fermé » : un bloc de code « ``` » ouvert sans être
 * refermé (ou un « ``` » en trop). Tout ce qui suit est alors lu comme du code, y compris les
 * « /// » de fermeture. On découpe la suite de la page aux lignes « /// » et on cherche la
 * première portion qui contient un nombre impair de « ``` ».
 * @returns {{start: number, end: number}|null}  lignes (comptées à partir de 0) de cette portion
 */
function fenceHint(src, fromLine) {
  const lines = src.split('\n');
  let start = fromLine;
  let count = 0;
  for (let l = fromLine + 1; l <= lines.length; l++) {
    if (l === lines.length || STRUCTURE_RE.test(lines[l])) {
      if (count % 2 === 1) {
        const end = Math.min(l, lines.length - 1);
        return { start, end, suspect: suspectFence(lines, start, end) };
      }
      start = l;
      count = 0;
    } else if (ANY_FENCE_RE.test(lines[l])) {
      count++;
    }
  }
  return null;
}

// Lignes qui ressemblent à du Markdown de page (puce en gras, « **Note** : », titre, « /// ») :
// on ne s'attend pas à les trouver dans un bloc de code.
const PAGE_LIKE_RE = /^\s*(?:[-*+] \*\*|\*\*[^*]+\*\*\s*:|#{1,6} |\/{3,}|\d+[.)] \*\*)/;

/**
 * Dans une portion où le nombre de « ``` » est impair, désigne celui qui est probablement en
 * trop : en l'ignorant, les blocs de code restants contiennent le moins de lignes qui
 * ressemblent à du Markdown de page. Renvoie null si aucun ne se distingue nettement.
 */
function suspectFence(lines, start, end) {
  const fences = [];
  for (let l = start + 1; l < end; l++) if (ANY_FENCE_RE.test(lines[l])) fences.push(l);
  const score = (skip) => {
    let n = 0;
    let open = null;
    const count = (from, to) => { for (let k = from + 1; k < to; k++) if (PAGE_LIKE_RE.test(lines[k])) n++; };
    for (const f of fences) {
      if (f === skip) continue;
      if (open === null) open = f;
      else { count(open, f); open = null; }
    }
    if (open !== null) count(open, end);
    return n;
  };
  const ranked = fences.map((f) => ({ f, s: score(f) })).sort((a, b) => a.s - b.s);
  if (!ranked.length || (ranked[1] && ranked[1].s === ranked[0].s)) return null;
  return ranked[0].f;
}

function unclosedMessage(fence, hint) {
  let msg = 'Ce bloc n\'est jamais fermé par « ' + '/'.repeat(fence) + ' » : il englobe tout le reste de la page.';
  if (hint) {
    msg += ' Cause probable : ' + (hint.suspect !== null && hint.suspect !== undefined
      ? 'le « ``` » de la ligne ' + (hint.suspect + 1) + ' semble en trop (ou sa fermeture manque). '
      : 'un « ``` » en trop ou non refermé. ') +
      'Entre les lignes ' + (hint.start + 1) + ' et ' + (hint.end + 1) + ', le nombre de « ``` » est impair : ' +
      'tout ce qui suit, « /// » compris, est lu comme du code. Corriger ce « ``` » ferme aussi ce bloc.';
  }
  return msg;
}

// Règles de bloc que nos règles peuvent interrompre
const ALT = { alt: ['paragraph', 'reference', 'blockquote', 'list'] };

// Texte d'une ligne, sans son indentation.
function lineText(state, line) {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

/**
 * @param {import('markdown-it')} md
 * @param {object} [userOptions]
 * @param {(env: object) => boolean} [userOptions.isEnabled]
 *        Rendu DSFR actif ? Évalué au rendu. Si faux, les blocs sont affichés en texte brut.
 * @param {(env: object) => {dsfr?: boolean, admonition?: boolean, details?: boolean, mkdocs?: boolean}} [userOptions.features]
 *        Fonctions actives, évaluées à l'analyse (une valeur absente vaut true).
 * @param {() => boolean} [userOptions.showErrors]  afficher les encadrés d'erreur
 * @param {() => 'auto'|'light'|'dark'} [userOptions.theme]  thème transmis au script de l'aperçu
 * @param {string} [userOptions.artworkDir]  dossier des pictogrammes DSFR
 */
module.exports = function dsfrPlugin(md, userOptions) {
  const opts = Object.assign({
    isEnabled: () => true,
    features: () => ({}),
    showErrors: () => true,
    theme: () => 'auto',
    artworkDir: path.join(__dirname, '..', 'media', 'dsfr', 'artwork', 'pictograms'),
  }, userOptions || {});

  const featureOf = (env, key) => {
    const f = opts.features(env || {}) || {};
    return f[key] === undefined ? true : !!f[key];
  };
  const on = (env) => !!opts.isEnabled(env || {});

  /**
   * Note un problème pour l'éditeur, si l'appelant le demande (env.dsfrIssues). Les lignes
   * sont celles du fichier source. Rien n'est noté pendant une analyse dont les lignes ne
   * correspondent pas au fichier (contenu d'une mise en exergue, réanalysé à part).
   * @param {object} env
   * @param {{code: string, level: string, line: number, message: string}} issue
   */
  function report(env, issue) {
    if (!env || !Array.isArray(env.dsfrIssues) || env.__dsfrNoReport) return;
    env.dsfrIssues.push(issue);
  }

  // Rend un texte Markdown en ligne (titre de bloc, description…).
  function renderInline(text, env) {
    if (text == null || text === '') return '';
    const tokens = md.parseInline(String(text), env || {});
    const inline = tokens.find((t) => t.type === 'inline');
    return inline ? md.renderer.renderInline(inline.children || [], md.options, env || {}) : '';
  }

  // Adresses fournies dans les options (target, link_url, image…) : on applique la même
  // vérification que markdown-it pour les liens Markdown (refus de javascript:, vbscript:…).
  const url = (u) => (md.validateLink(String(u)) ? String(u) : '#');

  const renderComponent = createComponents({ renderInline, url, showErrors: opts.showErrors, artworkDir: opts.artworkDir, report });
  const pageMeta = createPageMeta({ url, showErrors: opts.showErrors, report });
  const compat = installMkdocsCompat(md, { enabled: (env) => featureOf(env, 'mkdocs'), report });

  /* ================================================================== */
  /* Analyse                                                            */
  /* ================================================================== */

  /**
   * Lit l'en-tête d'un bloc à la ligne `line` : « /// nom | titre » puis les lignes
   * d'options indentées. Renvoie null si la ligne n'ouvre pas un bloc connu.
   */
  function readHeader(state, line, endLine) {
    if (state.sCount[line] - state.blkIndent >= 4) return null; // bloc de code indenté
    const m = START_RE.exec(lineText(state, line));
    if (!m) return null;
    const name = m[2].toLowerCase();
    if (!BLOCKS[name]) return null;

    let next = line + 1;
    const optLines = [];
    while (next < endLine && !state.isEmpty(next) && state.sCount[next] - state.blkIndent >= 4) {
      optLines.push(state.getLines(next, next + 1, state.blkIndent, false).replace(/\n$/, ''));
      next++;
    }
    const arg = m[3] === undefined || m[3] === '' ? null : m[3];
    let result;
    try {
      result = validate(name, arg, optLines.length ? parseYamlLite(dedent(optLines)) : {});
    } catch (e) {
      result = { error: 'Options illisibles : ' + e.message, detail: { kind: 'yaml' } };
    }
    return {
      name,
      arg,
      fence: m[1].length,
      optEnd: next, // première ligne du contenu
      source: [lineText(state, line)].concat(optLines).join('\n'),
      options: result.options,
      error: result.error,
      detail: result.detail,
    };
  }

  /**
   * Cherche la ligne qui ferme le bloc, en tenant compte des blocs imbriqués (pile, comme
   * pymdownx) et en ignorant le contenu des blocs de code. Renvoie -1 si le bloc n'est pas fermé.
   * Une fermeture doit avoir autant de « / » que l'ouverture correspondante.
   */
  function findEnd(state, from, endLine, fence) {
    const stack = [fence];
    let code = null;
    for (let l = from; l < endLine; l++) {
      const indent = state.sCount[l] - state.blkIndent;
      const t = lineText(state, l);
      if (code) {
        const c = FENCE_OPEN_RE.exec(t);
        if (indent < 4 && c && c[1][0] === code.ch && c[1].length >= code.len && !t.slice(c[1].length).trim()) code = null;
        continue;
      }
      if (indent >= 4) continue;
      const f = FENCE_OPEN_RE.exec(t);
      if (f && !(f[1][0] === '`' && t.slice(f[1].length).includes('`'))) {
        code = { ch: f[1][0], len: f[1].length };
        continue;
      }
      const h = readHeader(state, l, endLine);
      if (h && !h.error) {
        stack.push(h.fence);
        l = h.optEnd - 1;
        continue;
      }
      const e = END_RE.exec(t);
      if (e && e[1].length === stack[stack.length - 1]) {
        stack.pop();
        if (!stack.length) return l;
      }
    }
    return -1;
  }

  /**
   * Règle de bloc « /// nom | titre ».
   * Produit dsfr_open, le contenu, puis dsfr_close ; ou dsfr_error si le bloc est invalide
   * (sur le site, il s'affiche alors en texte brut).
   */
  function blockRule(state, startLine, endLine, silent) {
    const h = readHeader(state, startLine, endLine);
    if (!h) return false;
    if (silent) return true;

    if (h.error) {
      const t = state.push('dsfr_error', '', 0);
      t.map = [startLine, h.optEnd];
      t.meta = { source: h.source, message: h.error + ' Sur le site, ce bloc s\'affichera en texte brut.' };
      // Ligne de l'option fautive si elle est connue (sinon, l'en-tête du bloc)
      const keyLine = h.detail && h.detail.key ? h.source.split('\n').findIndex((l, i) => i > 0 && new RegExp('^\\s*' + h.detail.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:').test(l)) : -1;
      t.meta.line = state.env.__dsfrNoReport ? startLine : startLine + Math.max(keyLine, 0);
      report(state.env, { code: 'dsfr-invalid-block', level: 'error', line: startLine, optEnd: h.optEnd, name: h.name, message: t.meta.message, detail: h.detail || {} });
      // Le « /// » qui fermait ce bloc restera en texte : il est expliqué par cette erreur, inutile de le signaler aussi.
      const ctxErr = state.env.__dsfr || (state.env.__dsfr = { count: {}, stack: [] });
      const close = findEnd(state, h.optEnd, endLine, h.fence);
      if (close >= 0) (ctxErr.explained || (ctxErr.explained = new Set())).add(close);
      state.line = h.optEnd;
      return true;
    }

    // Contexte du document : compteurs d'identifiants et pile des blocs ouverts.
    const ctx = state.env.__dsfr || (state.env.__dsfr = { count: {}, stack: [] });
    const parent = ctx.stack[ctx.stack.length - 1] || null;
    const closeLine = findEnd(state, h.optEnd, endLine, h.fence);
    const contentEnd = closeLine >= 0 ? closeLine : endLine;
    const meta = {
      name: h.name,
      arg: h.arg,
      o: h.options,
      source: h.source,
      fence: h.fence,
      closed: closeLine >= 0,
      endText: closeLine >= 0 ? lineText(state, closeLine) : '',
      // Lignes du fichier : en-tête du bloc et début du contenu (encadrés d'erreur, éditeur).
      // Inconnues dans une mise en exergue, dont le contenu est réanalysé à part.
      line: state.env.__dsfrNoReport ? null : startLine,
      optEnd: h.optEnd,
    };
    if (closeLine < 0) {
      meta.fenceHint = fenceHint(state.src, startLine);
      report(state.env, {
        code: 'dsfr-unclosed', level: 'warning', line: startLine, optEnd: h.optEnd, fence: h.fence, name: h.name,
        fenceHint: meta.fenceHint, message: unclosedMessage(h.fence, meta.fenceHint),
      });
      if (meta.fenceHint && meta.fenceHint.suspect !== null) {
        report(state.env, {
          code: 'dsfr-fence-suspect', level: 'warning', line: meta.fenceHint.suspect,
          message: 'Ce « ``` » semble en trop (ou sa fermeture manque) : les blocs de code suivants sont décalés, et les « /// » qui ferment les blocs DSFR sont lus comme du code.',
        });
      }
    }
    const nextId = (k) => {
      const n = ctx.count[k] || 0;
      ctx.count[k] = n + 1;
      return n;
    };

    // Identifiants numérotés dans l'ordre du document, comme dsfr_structure.
    switch (h.name) {
      case 'accordion': meta.id = 'accordion-' + nextId('accordion'); break;
      case 'callout': meta.id = String(nextId('callout')); break;
      case 'notice': meta.id = String(nextId('notice')); break;
      case 'quote': meta.id = 'blockquote-' + nextId('quote'); break;
      case 'card': meta.id = 'card-' + nextId('card'); break;
      case 'tile': meta.id = 'tile-' + nextId('tile'); break;
      case 'media': meta.id = 'figure-' + nextId('media'); break;
      case 'buttons': meta.id = 'buttons-' + nextId('buttons'); break;
      case 'tabs': meta.id = 'tabs-' + nextId('tabs'); meta.children = []; break;
      case 'tab': {
        // Un onglet s'inscrit auprès de son conteneur, qui construit la liste des onglets.
        // Le premier onglet est sélectionné si aucun ne l'est explicitement.
        meta.id = 'tab-' + nextId('tab');
        if (parent && parent.name === 'tabs') {
          meta.selected = h.options.selected || parent.children.length === 0;
          parent.children.push({ id: meta.id, label: h.arg, icon: h.options.icon, selected: meta.selected });
        } else {
          meta.selected = h.options.selected;
        }
        break;
      }
      case 'button':
        meta.inGroup = !!(parent && parent.name === 'buttons');
        meta.group = meta.inGroup ? parent : null;
        break;
      default: break;
    }

    const open = state.push('dsfr_open', '', 1);
    open.map = [startLine, closeLine >= 0 ? closeLine + 1 : endLine];
    open.meta = meta;
    open.block = true;

    if (BLOCKS[h.name].mode === 'inline') {
      // Contenu en ligne : un seul jeton `inline`, analysé ensuite par markdown-it.
      const text = h.optEnd < contentEnd ? state.getLines(h.optEnd, contentEnd, state.blkIndent, false).trim() : '';
      if (text) {
        const t = state.push('inline', '', 0);
        t.content = text;
        t.map = [h.optEnd, contentEnd];
        t.children = [];
      }
    } else {
      // Contenu Markdown complet : analyse récursive des lignes du bloc.
      ctx.stack.push(meta);
      const oldParent = state.parentType;
      const oldMax = state.lineMax;
      state.parentType = 'dsfr';
      state.lineMax = contentEnd;
      state.md.block.tokenize(state, h.optEnd, contentEnd);
      state.parentType = oldParent;
      state.lineMax = oldMax;
      ctx.stack.pop();
    }

    const close = state.push('dsfr_close', '', -1);
    close.meta = meta;
    close.block = true;
    state.line = closeLine >= 0 ? closeLine + 1 : endLine;
    return true;
  }

  /**
   * Citation « > » : le thème la transforme en mise en exergue (fr-highlight), et les
   * lignes consécutives restent séparées par des retours à la ligne.
   */
  function highlightRule(state, startLine, endLine, silent) {
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    if (state.src.charCodeAt(state.bMarks[startLine] + state.tShift[startLine]) !== 0x3E /* > */) return false;
    if (!featureOf(state.env, 'dsfr')) return false;
    if (silent) return true;

    let next = startLine;
    while (next < endLine && !state.isEmpty(next)) next++;
    const lines = state.getLines(startLine, next, state.blkIndent, false).replace(/\n$/, '').split('\n')
      .map((l) => l.replace(/^\s*>[ ]?/, ''));
    const joined = lines.join(md.options.html ? '<br />' : '  \n');

    const open = state.push('dsfr_hl_open', 'div', 1);
    open.map = [startLine, next];
    open.block = true;
    const inner = [];
    // Le contenu est réanalysé à part (lignes regroupées) : ses numéros de ligne ne sont pas ceux du fichier.
    const noReport = state.env.__dsfrNoReport;
    state.env.__dsfrNoReport = true;
    state.md.block.parse(joined, state.md, state.env, inner);
    state.env.__dsfrNoReport = noReport;
    for (const t of inner) {
      if (t.map) t.map = [startLine, next];
      t.level += state.level;
      state.tokens.push(t);
    }
    const close = state.push('dsfr_hl_close', 'div', -1);
    close.block = true;
    state.line = next;
    return true;
  }

  /* --- Encadrés « !!! » (admonition) et « ??? » (pymdownx.details) --------------------- */

  // Dernière ligne (exclue) d'un contenu indenté de 4 espaces sous la ligne `startLine`.
  function indentedBlockEnd(state, startLine, endLine) {
    let next = startLine + 1;
    let last = startLine + 1;
    while (next < endLine) {
      if (state.isEmpty(next)) { next++; continue; }
      if (state.sCount[next] - state.blkIndent >= 4) { next++; last = next; continue; }
      break;
    }
    return last;
  }

  const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

  function admonitionRule(kind) {
    const re = kind === 'admonition' ? ADMONITION_RE : DETAILS_RE;
    return function (state, startLine, endLine, silent) {
      if (state.sCount[startLine] - state.blkIndent >= 4) return false;
      if (!featureOf(state.env, kind)) return false;
      const m = re.exec(lineText(state, startLine));
      if (!m) return false;
      if (silent) return true;

      const classes = (kind === 'admonition' ? m[1] : m[2]).split(/ +/);
      const rawTitle = kind === 'admonition' ? m[2] : m[3];
      const end = indentedBlockEnd(state, startLine, endLine);
      const meta = {
        kind,
        classes,
        // Sans titre entre guillemets, le titre est le type capitalisé ; "" donne un encadré sans titre.
        title: rawTitle === undefined ? capitalize(classes[0]) : rawTitle,
        open: kind === 'details' && !!m[1], // « ???+ » : ouvert au départ
      };

      const open = state.push('dsfr_adm_open', '', 1);
      open.map = [startLine, end];
      open.block = true;
      open.meta = meta;
      const oldIndent = state.blkIndent;
      const oldMax = state.lineMax;
      const oldParent = state.parentType;
      state.blkIndent += 4;
      state.lineMax = end;
      state.parentType = 'dsfr';
      state.md.block.tokenize(state, startLine + 1, end);
      state.blkIndent = oldIndent;
      state.lineMax = oldMax;
      state.parentType = oldParent;
      const close = state.push('dsfr_adm_close', '', -1);
      close.meta = meta;
      close.block = true;
      state.line = end;
      return true;
    };
  }

  /**
   * Tableaux : enveloppe <div class="fr-table"> et légende.
   * La légende s'écrit « [Texte] » sur une ligne du tableau (en général la dernière) :
   * markdown-it la lit comme une ligne dont la première cellule vaut « [Texte] ».
   */
  function tableRule(state) {
    if (!featureOf(state.env, 'dsfr')) return;
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'table_open') continue;
      let j = i;
      let depth = 0;
      for (; j < tokens.length; j++) {
        if (tokens[j].type === 'table_open') depth++;
        if (tokens[j].type === 'table_close' && --depth === 0) break;
      }
      let caption = null;
      let inBody = false;
      for (let k = i; k < j; k++) {
        if (tokens[k].type === 'tbody_open') inBody = true;
        if (!inBody || tokens[k].type !== 'tr_open') continue;
        const cell = tokens[k + 2];
        if (!cell || cell.type !== 'inline' || tokens[k + 1].type !== 'td_open') continue;
        const txt = cell.content.trim();
        if (txt.length >= 2 && txt[0] === '[' && txt[txt.length - 1] === ']') {
          caption = txt.slice(1, -1).trim();
          let e = k;
          while (tokens[e].type !== 'tr_close') e++;
          tokens.splice(k, e - k + 1);
          j -= e - k + 1;
          break;
        }
      }
      if (caption !== null) {
        const c = new state.Token('dsfr_table_caption', 'caption', 0);
        c.content = caption;
        tokens.splice(i + 1, 0, c);
        j++;
      }
      const wrapOpen = new state.Token('dsfr_table_wrap_open', 'div', 1);
      wrapOpen.block = true;
      const wrapClose = new state.Token('dsfr_table_wrap_close', 'div', -1);
      wrapClose.block = true;
      tokens.splice(j + 1, 0, wrapClose);
      tokens.splice(i, 0, wrapOpen);
      i = j + 2;
    }
  }

  /**
   * Lignes « /// » restées en texte : nom de bloc inconnu (« /// alrt »), ou « /// » qui ne ferme
   * aucun bloc. Sur le site, elles s'affichent telles quelles. Un encadré est inséré avant le
   * paragraphe concerné, et le problème est noté pour l'éditeur.
   */
  function structureRule(state) {
    if (!featureOf(state.env, 'dsfr') || state.inlineMode) return;
    const ctx = state.env.__dsfr || {};
    const explained = ctx.explained || (ctx.explained = new Set());
    const lines = state.src.split('\n');
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== 'paragraph_open' || !t.map) continue;
      const boxes = [];
      for (let l = t.map[0]; l < t.map[1]; l++) {
        const text = (lines[l] || '').replace(/\r$/, '');
        const head = START_RE.exec(text.trim());
        if (head && !BLOCKS[head[2].toLowerCase()]) {
          const near = closest(head[2], Object.keys(BLOCKS));
          const message = 'Bloc « ' + head[2] + ' » inconnu' + (near ? ' : vouliez-vous écrire « ' + near + ' » ?' : '.') +
            ' Blocs possibles : ' + Object.keys(BLOCKS).join(', ') + '. Sur le site, cette ligne s\'affichera telle quelle.';
          boxes.push({ line: l, source: text, message, level: 'error' });
          report(state.env, { code: 'dsfr-unknown-block', level: 'error', line: l, name: head[2], suggestion: near, message });
          // Sa fermeture « /// » restera aussi en texte : expliquée par ce problème.
          for (let k = l + 1; k < lines.length; k++) {
            const tk = (lines[k] || '').trim();
            if (START_RE.test(tk)) break;
            if (END_RE.test(tk) && tk.length === head[1].length) { explained.add(k); break; }
          }
        } else if (END_RE.test(text.trim()) && !explained.has(l)) {
          const message = 'Ce « ' + text.trim() + ' » ne ferme aucun bloc (fermeture en trop, ou ouverture « /// nom » manquante) : sur le site, il s\'affichera tel quel.';
          boxes.push({ line: l, source: text, message, level: 'warning' });
          report(state.env, { code: 'dsfr-orphan-close', level: 'warning', line: l, message });
        }
      }
      if (!boxes.length) continue;
      const added = boxes.map((b) => {
        const w = new state.Token('dsfr_lint', '', 0);
        w.block = true;
        w.level = t.level;
        w.meta = b;
        return w;
      });
      tokens.splice(i, 0, ...added);
      i += added.length;
    }
  }

  /* --- Enregistrement des règles --------------------------------------------------------
   * Règles de bloc : placées avant `fence`/`blockquote` pour être essayées en premier.
   * Règles « core », exécutées dans cet ordre après l'analyse des blocs :
   *   block → dsfr_page_meta → dsfr_table → mkdocs_list_lint → inline → … → mkdocs_alt_text → mkdocs_attr_list
   * (les deux dernières ont besoin des jetons en ligne, analysés par la règle `inline`).
   */
  md.core.ruler.before('block', 'dsfr_reset', (state) => { state.env.__dsfr = { count: {}, stack: [] }; });
  md.block.ruler.before('fence', 'dsfr_block', blockRule, ALT);
  md.block.ruler.before('blockquote', 'dsfr_highlight', highlightRule, ALT);
  md.block.ruler.before('fence', 'dsfr_admonition', admonitionRule('admonition'), ALT);
  md.block.ruler.before('fence', 'dsfr_details', admonitionRule('details'), ALT);
  md.core.ruler.after('block', 'dsfr_page_meta', pageMeta.pageMetaRule);
  md.core.ruler.after('dsfr_page_meta', 'dsfr_table', tableRule);
  md.core.ruler.after('dsfr_table', 'mkdocs_list_lint', compat.lintLists);
  md.core.ruler.after('mkdocs_list_lint', 'dsfr_structure_lint', structureRule);
  md.core.ruler.push('mkdocs_alt_text', compat.fixAltText);
  md.core.ruler.push('mkdocs_attr_list', compat.attrList);

  /* ================================================================== */
  /* Rendu                                                              */
  /*                                                                    */
  /* Si le rendu DSFR est désactivé (isEnabled faux), chaque élément    */
  /* retombe sur un rendu Markdown neutre : en-têtes de blocs en texte, */
  /* citations en <blockquote>, tableaux sans enveloppe.                */
  /* ================================================================== */
  const r = md.renderer.rules;
  const isInline = (m) => BLOCKS[m.name].mode === 'inline';

  r.dsfr_open = (tokens, idx, options, env) => {
    const m = tokens[idx].meta;
    if (!on(env)) return '<p>' + esc(m.source) + '</p>\n' + (isInline(m) ? '<p>' : '');
    // Ouverture et fermeture sont calculées ensemble ; la fermeture est gardée pour dsfr_close.
    m.rendered = renderComponent(m, env);
    // Bloc non fermé : signalé là où il commence (il englobe tout le reste de la page).
    const unclosed = !m.closed && opts.showErrors() ? errorBox(m.source.split('\n')[0], unclosedMessage(m.fence, m.fenceHint), 'warning', m.line) : '';
    return unclosed + m.rendered[0];
  };

  r.dsfr_close = (tokens, idx, options, env) => {
    const m = tokens[idx].meta;
    if (!on(env)) return (isInline(m) ? '</p>\n' : '') + (m.closed ? '<p>' + esc(m.endText) + '</p>\n' : '');
    let out = m.rendered ? m.rendered[1] : '';
    if (opts.showErrors()) {
      const firstLine = m.source.split('\n')[0];
      if (m.name === 'notice') {
        const message = 'Le composant « /// notice » est déprécié et sera supprimé dans une prochaine version du thème. Déclarez plutôt le bandeau dans l\'en-tête de la page (métadonnée « notice: »), voir le snippet dsfr-bandeau.';
        out += errorBox(firstLine, message, 'warning', m.line);
        report(env, { code: 'dsfr-notice-deprecated', level: 'warning', line: m.line, message });
      }
      if (m.name === 'button' && iconHiddenInGroup(m)) {
        const place = m.o.icon_place === 'right' ? 'right' : 'left';
        const message = 'Dans un groupe de boutons, le DSFR n\'affiche que l\'icône des boutons qui en ont une : le libellé sera coupé sur le site. Ajoutez au bloc « /// buttons » l\'option « attrs: {class: fr-btns-group--icon-' + place + '} ».';
        out += errorBox(firstLine, message, 'site', m.line);
        report(env, {
          code: 'dsfr-icon-in-group', level: 'site', line: m.line, message, place,
          group: { line: m.group.line, optEnd: m.group.optEnd, hasAttrs: /(^|\n)\s*attrs\s*:/.test(m.group.source) },
        });
      }
    }
    return out;
  };

  // Bouton avec icône et libellé dans un groupe `buttons` sans classe fr-btns-group--icon-* :
  // la CSS du DSFR le réduit à son icône (largeur 2,5 rem, libellé masqué).
  function iconHiddenInGroup(m) {
    if (!m.group || !m.o.icon || m.o.icon_place === 'icon-only') return false;
    return !/(^|\s)fr-btns-group--icon-(left|right)(\s|$)/.test(m.group.o.attrs.class || '');
  }

  r.dsfr_error = (tokens, idx, options, env) => {
    const m = tokens[idx].meta;
    if (!on(env) || !opts.showErrors()) return '<p>' + esc(m.source) + '</p>\n';
    return errorBox(m.source, m.message, 'error', m.line);
  };

  r.dsfr_lint = (tokens, idx, options, env) => {
    if (!on(env) || !opts.showErrors()) return '';
    const m = tokens[idx].meta;
    return errorBox(m.source, m.message, m.level || 'site', m.line);
  };

  r.dsfr_page_top = (tokens, idx, options, env) => (on(env) ? pageMeta.renderTop(tokens[idx].meta, tokens, env) : '');
  r.dsfr_page_bottom = (tokens, idx, options, env) => (on(env) ? pageMeta.renderBottom(tokens[idx].meta) : '');

  r.dsfr_hl_open = (tokens, idx, options, env) => (on(env) ? '<div class="fr-highlight">\n' : '<blockquote>\n');
  r.dsfr_hl_close = (tokens, idx, options, env) => (on(env) ? '</div>\n' : '</blockquote>\n');

  r.dsfr_table_wrap_open = (tokens, idx, options, env) => (on(env) ? '<div class="fr-table">\n' : '');
  r.dsfr_table_wrap_close = (tokens, idx, options, env) => (on(env) ? '</div>\n' : '');
  r.dsfr_table_caption = (tokens, idx, options, env) => '<caption>' + renderInline(tokens[idx].content, env) + '</caption>\n';

  r.dsfr_adm_open = (tokens, idx, options, env) => {
    const m = tokens[idx].meta;
    if (m.kind === 'details') {
      return '<details class="' + esc(m.classes.join(' ')) + '"' + (m.open ? ' open="open"' : '') + '>\n<summary>' + renderInline(m.title, env) + '</summary>\n';
    }
    return '<div class="admonition ' + esc(m.classes.join(' ')) + '">\n' + (m.title ? '<p class="admonition-title">' + renderInline(m.title, env) + '</p>\n' : '');
  };
  r.dsfr_adm_close = (tokens, idx) => (tokens[idx].meta.kind === 'details' ? '</details>\n' : '</div>\n');

  /*
   * Marqueur d'état lu par media/dsfr-preview.js : il indique si le rendu DSFR est actif
   * (le script active ou coupe alors les feuilles de style DSFR) et quel thème appliquer.
   * Il n'est pas ajouté aux rendus en ligne (titres de blocs, descriptions…).
   */
  const originalRender = md.renderer.render.bind(md.renderer);
  md.renderer.render = function (tokens, options, env) {
    const html = originalRender(tokens, options, env);
    if (tokens.length === 1 && tokens[0].type === 'inline') return html;
    return '<div id="dsfr-preview-state" data-enabled="' + (on(env) ? 'true' : 'false') + '" data-theme="' + esc(opts.theme()) + '" hidden></div>\n' + html;
  };

  return md;
};

module.exports.BLOCKS = BLOCKS;
module.exports.parseYamlLite = parseYamlLite;
