'use strict';
/**
 * Compatibilité avec le Markdown du site.
 *
 * Le site est généré par MkDocs avec Python-Markdown, alors que l'aperçu de VS Code utilise
 * markdown-it (CommonMark). Les deux moteurs ne lisent pas toujours un texte de la même façon :
 * ce module corrige les écarts qui changent vraiment le rendu des pages, pour que l'aperçu
 * montre ce que le site affichera — y compris ses défauts.
 *
 *   a) une liste collée à un paragraphe (sans ligne vide) reste du texte ;
 *   b) « \ » en fin de ligne n'est pas un retour à la ligne ;
 *   c) le contenu d'une puce doit être indenté de 4 espaces (sinon : avertissement) ;
 *   c2) une sous-liste indentée de moins de 4 espaces n'est pas imbriquée : ses puces rejoignent la liste parente ;
 *   d) les « \ » des textes alternatifs d'images sont conservés ;
 *   b2) « **texte **suite » (espace avant les « ** » fermantes) : rendu qui dépend de la version du site, signalé ;
 *   e) extensions recommandées par la documentation du thème : attr_list et def_list.
 *
 * Toutes ces règles s'appliquent seulement si `enabled(env)` est vrai.
 */
const deflistModule = require('./vendor/markdown-it-deflist.js');

const deflist = deflistModule.default || deflistModule;

/**
 * @param {import('markdown-it')} md
 * @param {{enabled: (env: object) => boolean}} options
 */
module.exports = function installMkdocsCompat(md, { enabled, report }) {
  const note = report || (() => {});
  /* --- a) Listes collées à un paragraphe ------------------------------------------------
   * Python-Markdown ne démarre pas de liste au milieu d'un paragraphe. C'est vrai hors liste,
   * et aussi dans une puce pour un paragraphe qui commence après une ligne vide : tout le bloc
   * jusqu'à la ligne vide suivante est alors un seul paragraphe.
   * markdown-it demande à la règle `list` si elle peut interrompre le paragraphe en cours
   * (appel « silencieux ») : on répond non dans ces cas. Pour savoir où commence le paragraphe
   * en cours, la règle `paragraph` est enveloppée et mémorise sa ligne de départ.
   */
  const MARKER_RE = /^\s*(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
  const rawLine = (state, line) => state.src.slice(line === 0 ? 0 : state.eMarks[line - 1] + 1, state.eMarks[line]);

  const paraDef = md.block.ruler.__rules__.find((r) => r.name === 'paragraph');
  if (paraDef) {
    const originalParagraph = paraDef.fn;
    md.block.ruler.at('paragraph', function (state, startLine, endLine, silent) {
      const previous = state.__mkdocsParaStart;
      state.__mkdocsParaStart = startLine;
      try {
        return originalParagraph(state, startLine, endLine, silent);
      } finally {
        state.__mkdocsParaStart = previous;
      }
    }, { alt: (paraDef.alt || []).slice() });
  }

  const listDef = md.block.ruler.__rules__.find((r) => r.name === 'list');
  if (listDef) {
    const originalList = listDef.fn;
    md.block.ruler.at('list', function (state, startLine, endLine, silent) {
      if (silent && state.parentType === 'paragraph' && enabled(state.env)) {
        if (state.listIndent < 0) return false; // hors liste
        const p = state.__mkdocsParaStart;
        if (p !== undefined && p > 0 && state.isEmpty(p - 1) && !MARKER_RE.test(rawLine(state, p))) return false;
      }
      return originalList(state, startLine, endLine, silent);
    }, { alt: listDef.alt.slice() });
  }

  /* --- b) « \ » en fin de ligne : la barre reste affichée, pas de retour à la ligne ----- */
  md.inline.ruler.before('escape', 'mkdocs_backslash', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x5C /* \ */ || state.src.charCodeAt(state.pos + 1) !== 0x0A /* \n */) return false;
    if (!enabled(state.env)) return false;
    if (!silent) state.pending += '\\';
    state.pos++;
    return true;
  });

  /* --- b2) Gras dont le texte finit par une espace : « des **limites **à garder » ------------
   * Python-Markdown jusqu'à 3.11.0 le met en gras ; à partir de 3.11.1, comme markdown-it, il
   * affiche les « ** ». Le rendu du site dépend donc de sa version : l'aperçu montre celui des
   * versions récentes, et un avertissement propose d'écrire « **limites** à », lu pareil partout.
   */
  // « ** » seuls (pas « *** »). Ils sont appariés dans l'ordre, comme Python-Markdown : 1er avec 2e,
  // 3e avec 4e… Ainsi « **G**estion de l'**A**rchivage » n'est pas pris pour un gras mal fermé.
  const DOUBLE_STAR_RE = /(?<!\*)\*\*(?!\*)/g;
  function lintLooseStrong(state) {
    if (!enabled(state.env)) return;
    const lines = state.src.split('\n');
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== 'paragraph_open' || !t.map) continue;
      // Texte du paragraphe, code en ligne masqué ; chaque position garde sa ligne et sa colonne.
      const where = [];
      let text = '';
      for (let l = t.map[0]; l < t.map[1]; l++) {
        const line = (lines[l] || '').replace(/\r$/, '');
        for (let c = 0; c < line.length; c++) where.push([l, c]);
        where.push([l, line.length]);
        text += line + '\n';
      }
      const masked = text.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
      const marks = [];
      let m;
      DOUBLE_STAR_RE.lastIndex = 0;
      while ((m = DOUBLE_STAR_RE.exec(masked))) marks.push(m.index);
      const found = [];
      for (let k = 0; k + 1 < marks.length; k += 2) {
        const open = marks[k];
        const close = marks[k + 1];
        const inner = masked.slice(open + 2, close);
        const after = masked[close + 2];
        if (!inner || /^\s/.test(inner) || !/\s$/.test(inner) || inner.includes('\n')) continue;
        if (after === undefined || /\s/.test(after)) continue;
        const [line, start] = where[open];
        const word = inner.replace(/\s+$/, '');
        const space = inner.slice(word.length);
        found.push({ line, start, end: start + inner.length + 4, word, space });
      }
      if (!found.length) continue;
      const boxes = found.map((f) => {
        const message = 'Gras mal fermé : « **' + f.word + f.space + '** » (espace avant les « ** » fermantes). Selon la version de Python-Markdown du site, ' +
          'ce texte sera en gras ou affiché avec les « ** ». Écrivez « **' + f.word + '**' + f.space + '» : le rendu sera le même partout.';
        note(state.env, { code: 'dsfr-loose-strong', level: 'site', line: f.line, start: f.start, end: f.end, word: f.word, space: f.space, message });
        const w = new state.Token('dsfr_lint', '', 0);
        w.block = true;
        w.level = t.level;
        w.meta = { line: f.line, source: (lines[f.line] || '').replace(/\r$/, ''), message, level: 'site' };
        return w;
      });
      tokens.splice(i, 0, ...boxes);
      i += boxes.length;
    }
  }

  // Indentation d'une ligne (tabulation = jusqu'au multiple de 4 suivant), ligne citée « > »
  const indentAt = (lines, l) => {
    let n = 0;
    for (const ch of lines[l] || '') {
      if (ch === ' ') n++;
      else if (ch === '\t') n += 4 - (n % 4);
      else break;
    }
    return n;
  };
  const quotedAt = (lines, l) => /^\s*>/.test(lines[l] || '');
  // Colonne d'une puce pour Python-Markdown : celle de sa ligne, ou celle de la puce parente si
  // la puce a été remontée dans la liste parente par flattenSublists.
  const itemCol = (lines, t) => (t.meta && t.meta.mkdocsCol !== undefined ? t.meta.mkdocsCol : indentAt(lines, t.map[0]));

  /* --- c2) Sous-liste indentée de moins de 4 espaces --------------------------------------
   *   - **D :** droit annuel
   *     - **D = 20** si semaine de 4 jours      ← 2 espaces
   * markdown-it imbrique la sous-liste (2 espaces suffisent, alignés sur le texte de la puce) ;
   * Python-Markdown exige 4 espaces : ses puces deviennent des puces de la liste parente (cas réel
   * d'un mode opératoire Doc SIRH). L'aperçu fait de même : les puces de la sous-liste sont remontées
   * après la puce parente, avec un avertissement et une correction (indenter de 4 espaces).
   */
  function flattenSublists(state) {
    if (!enabled(state.env)) return;
    const lines = state.src.split('\n');
    const tokens = state.tokens;
    const items = []; // pile des puces ouvertes : { line, col, level, quoted }
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'list_item_close') { items.pop(); continue; }
      const top = items[items.length - 1];
      const isList = t.type === 'bullet_list_open' || t.type === 'ordered_list_open';
      if (top && isList && !top.quoted && t.level === top.level + 1 && t.map && t.map[0] > top.line &&
          !quotedAt(lines, t.map[0]) && indentAt(lines, t.map[0]) < top.col + 4) {
        const closeType = t.type.replace('_open', '_close');
        let j = i + 1;
        while (j < tokens.length && !(tokens[j].type === closeType && tokens[j].level === t.level)) j++;
        let k = j + 1;
        while (k < tokens.length && !(tokens[k].type === 'list_item_close' && tokens[k].level === top.level)) k++;
        if (j >= tokens.length || k >= tokens.length) continue;
        const inner = tokens.slice(i + 1, j);
        const after = tokens.slice(j + 1, k); // contenu de la puce parente après la sous-liste
        // Liste aérée ou serrée : les puces remontées suivent la liste parente (<p> ou non)
        let parentPara = null;
        for (let q = i - 1; q >= 0 && !parentPara; q--) {
          if (tokens[q].type === 'paragraph_open' && tokens[q].level === top.level + 1) parentPara = tokens[q];
          if (tokens[q].type === 'list_item_open' && tokens[q].level === top.level) break;
        }
        for (const x of inner) {
          x.level -= 2;
          if (parentPara && (x.type === 'paragraph_open' || x.type === 'paragraph_close') && x.level === top.level + 1) x.hidden = parentPara.hidden;
          if (x.type === 'list_item_open' && x.level === top.level) x.meta = Object.assign({}, x.meta, { mkdocsCol: top.col });
        }
        // Ce qui suivait la sous-liste dans la puce parente rejoint la dernière puce remontée
        let last = inner.length - 1;
        while (last >= 0 && !(inner[last].type === 'list_item_close' && inner[last].level === top.level)) last--;
        if (last >= 0) inner.splice(last, 0, ...after);
        const first = t.map[0];
        const indent = indentAt(lines, first);
        const message = 'Sur le site (MkDocs), comme dans l\'aperçu, cette sous-liste n\'est pas imbriquée : ses puces s\'ajoutent à la liste ' +
          'principale. Pour l\'imbriquer, indentez-la de 4 espaces par rapport à la puce parente.';
        const w = new state.Token('dsfr_lint', '', 0);
        w.block = true;
        w.level = top.level + 1;
        w.meta = { line: first, source: (lines[first] || '').replace(/\r$/, ''), message, level: 'site' };
        note(state.env, { code: 'dsfr-list-indent', level: 'site', line: first, message, sublist: { end: t.map[1], from: indent, to: top.col + 4 } });
        tokens.splice(i, k - i + 1, w, tokens[k], ...inner);
        continue; // tour suivant : fermeture de la puce parente, puis les puces remontées
      }
      if (t.type === 'list_item_open' && t.map) {
        items.push({ line: t.map[0], col: itemCol(lines, t), level: t.level, quoted: quotedAt(lines, t.map[0]) });
      }
    }
  }

  /* --- c) Indentation du contenu des puces -----------------------------------------------
   * markdown-it accepte un contenu de puce aligné sur le texte de la puce (2 espaces après
   * « - »), Python-Markdown exige 4 espaces. Plutôt que de deviner le rendu du site, on insère
   * un avertissement (jeton `dsfr_lint`, rendu dans dsfr-markdown-it.js) avant l'élément mal placé.
   */
  function lintLists(state) {
    if (!enabled(state.env)) return;
    const lines = state.src.split('\n');
    const indentOf = (l) => {
      let n = 0;
      for (const ch of lines[l] || '') {
        if (ch === ' ') n++;
        else if (ch === '\t') n += 4 - (n % 4);
        else break;
      }
      return n;
    };
    const isQuoted = (l) => /^\s*>/.test(lines[l] || '');
    const tokens = state.tokens;
    const items = []; // pile des puces ouvertes : { line, col, level, quoted }
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'list_item_close') { items.pop(); continue; }
      const top = items[items.length - 1];
      // Premier jeton de bloc d'une puce, sur une ligne suivante : vérifier son indentation
      if (top && t.block && t.nesting >= 0 && t.level === top.level + 1 && t.map && t.map[0] > top.line && !top.quoted) {
        const line = t.map[0];
        if (!isQuoted(line) && indentOf(line) < top.col + 4) {
          const isList = t.type === 'bullet_list_open' || t.type === 'ordered_list_open';
          const w = new state.Token('dsfr_lint', '', 0);
          w.block = true;
          w.level = t.level;
          w.meta = {
            line,
            source: lines[line].replace(/\r$/, ''),
            message: isList
              ? 'Sur le site (MkDocs), cette sous-liste ne sera pas imbriquée : indentez-la de 4 espaces par rapport à la puce parente.'
              : 'Sur le site (MkDocs), ce texte sortira de la liste : indentez-le de 4 espaces par rapport à la puce, et laissez une ligne vide avant la puce suivante.',
          };
          tokens.splice(i, 0, w);
          i++;
          note(state.env, { code: 'dsfr-list-indent', level: 'site', line, message: w.meta.message });
        }
      }
      if (t.type === 'list_item_open' && t.map) {
        items.push({ line: t.map[0], col: itemCol(lines, t), level: t.level, quoted: isQuoted(t.map[0]) });
      }
    }
  }

  /* --- d) Textes alternatifs : markdown-it retire les « \ » suivis d'une lettre (C:\Users…) */
  function fixAltText(state) {
    for (const t of state.tokens) {
      if (t.type !== 'inline' || !t.children) continue;
      for (const c of t.children) {
        if (c.type === 'image' && c.children) {
          for (const g of c.children) if (g.type === 'text_special') g.type = 'text';
        }
      }
    }
  }

  /* --- e1) Listes de définitions (extension def_list) ------------------------------------ */
  md.use(deflist);

  /* --- e2) attr_list : « {: #id .classe cle=valeur } » -----------------------------------
   * Trois emplacements, comme dans l'extension Python :
   *   - juste après un élément en ligne :  ![](image.png){: .fr-responsive-img }
   *   - en fin de titre :                  ## Titre {: #ancre }
   *   - seul sur la dernière ligne d'un paragraphe.
   */
  const ATTR_INLINE_RE = /^\{:?[ ]*([^}\n ][^}\n]*?)[ ]*\}/;
  const ATTR_HEADER_RE = /[ ]+\{:?[ ]*([^}\n ][^}\n]*?)[ ]*\}[ ]*$/;
  const ATTR_BLOCK_RE = /^\{:?[ ]*([^}\n ][^}\n]*?)[ ]*\}[ ]*$/;

  function parseAttrList(text) {
    const out = [];
    const re = /#([^\s#.]+)|\.([^\s#.]+)|([^\s=#.][^\s=]*)=("[^"]*"|'[^']*'|\S+)/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[1]) out.push(['id', m[1]]);
      else if (m[2]) out.push(['class', m[2]]);
      else out.push([m[3], m[4].replace(/^["']|["']$/g, '')]);
    }
    return out;
  }

  // Nom d'attribut HTML valide ; les gestionnaires d'événements (onclick…) sont ignorés dans l'aperçu.
  const ATTR_NAME_RE = /^[A-Za-z_:][-A-Za-z0-9_:.]*$/;
  function applyAttrs(token, list) {
    for (const [k, v] of list) {
      if (k === 'class') token.attrJoin('class', v);
      else if (ATTR_NAME_RE.test(k) && !/^on/i.test(k)) token.attrSet(k, v);
    }
  }

  // Jeton ouvrant correspondant à un jeton fermant (ex. strong_open pour strong_close).
  function openingToken(children, closeIndex) {
    const closeType = children[closeIndex].type;
    const openType = closeType.replace(/_close$/, '_open');
    let depth = 0;
    for (let k = closeIndex; k >= 0; k--) {
      if (children[k].type === closeType) depth++;
      if (children[k].type === openType && --depth === 0) return children[k];
    }
    return null;
  }

  function attrList(state) {
    if (!enabled(state.env)) return;
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== 'inline' || !t.children) continue;
      const ch = t.children;

      for (let j = 1; j < ch.length; j++) {
        const c = ch[j];
        if (c.type !== 'text') continue;
        const m = ATTR_INLINE_RE.exec(c.content);
        if (!m) continue;
        const prev = ch[j - 1];
        let target = null;
        if (prev.type === 'image' || prev.type === 'code_inline') target = prev;
        else if (/_close$/.test(prev.type)) target = openingToken(ch, j - 1);
        if (!target) continue;
        applyAttrs(target, parseAttrList(m[1]));
        c.content = c.content.slice(m[0].length);
      }

      const parent = tokens[i - 1];
      const last = ch[ch.length - 1];
      if (!parent || !last || last.type !== 'text') continue;

      if (parent.type === 'heading_open') {
        const m = ATTR_HEADER_RE.exec(last.content);
        if (m) {
          applyAttrs(parent, parseAttrList(m[1]));
          last.content = last.content.slice(0, m.index);
          t.content = t.content.replace(ATTR_HEADER_RE, '');
        }
      } else if (parent.type === 'paragraph_open') {
        const m = ATTR_BLOCK_RE.exec(last.content);
        const before = ch[ch.length - 2];
        if (m && (ch.length === 1 || (before && before.type === 'softbreak'))) {
          applyAttrs(parent, parseAttrList(m[1]));
          ch.splice(before && before.type === 'softbreak' ? ch.length - 2 : ch.length - 1, 2);
        }
      }
    }
  }

  // Les règles « core » s'exécutent après l'analyse des blocs : l'ordre entre elles est
  // fixé dans dsfr-markdown-it.js, qui les enregistre.
  return { flattenSublists, lintLists, lintLooseStrong, fixAltText, attrList };
};
