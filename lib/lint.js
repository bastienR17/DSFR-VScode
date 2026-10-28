'use strict';
/**
 * Problèmes d'une page Markdown DSFR, pour l'éditeur : soulignements (panneau « Problèmes »)
 * et corrections rapides (ampoule).
 *
 * Les problèmes viennent du plugin d'aperçu lui-même (dsfr-markdown-it.js) : la page est rendue
 * avec un markdown-it privé, et le plugin note chaque problème qu'il affiche dans l'aperçu
 * (`env.dsfrIssues`). L'éditeur et l'aperçu signalent donc exactement les mêmes choses.
 * Ce module y ajoute la position précise (ligne, colonnes) et les corrections possibles.
 *
 * Les en-têtes YAML illisibles sont traités à part, par frontmatter.js (déjà soulignés depuis la 0.8).
 *
 * Module pur : aucune dépendance à VS Code, testé avec Node (test/lint.js).
 */
const MarkdownIt = require('./vendor/markdown-it.min.js');
const dsfrPlugin = require('./dsfr-markdown-it');
const { distance, closest } = require('./similar');

// En-tête YAML en haut du fichier : sauté par l'analyse (l'aperçu de VS Code fait de même),
// mais lu par le plugin pour le bandeau, le fil d'Ariane, etc.
function frontMatterRule(state, startLine, endLine, silent) {
  if (startLine !== 0 || state.blkIndent !== 0) return false;
  if (!/^---[ \t]*$/.test(state.src.slice(state.bMarks[0], state.eMarks[0]))) return false;
  for (let l = 1; l < endLine; l++) {
    const t = state.src.slice(state.bMarks[l], state.eMarks[l]);
    if (/^(---|\.\.\.)[ \t]*$/.test(t)) {
      if (silent) return true;
      const tok = state.push('dsfr_front_matter', '', 0);
      tok.map = [0, l + 1];
      tok.hidden = true;
      state.line = l + 1;
      return true;
    }
  }
  return false;
}

/**
 * @param {object} [options]
 * @param {() => boolean} [options.mkdocsCompat]  signaler les écarts avec Python-Markdown (listes)
 */
function createLinter(options) {
  const mkdocsCompat = (options && options.mkdocsCompat) || (() => true);
  // Mêmes réglages que l'aperçu de VS Code (HTML autorisé).
  const md = new MarkdownIt({ html: true });
  md.block.ruler.before('table', 'dsfr_front_matter', frontMatterRule);
  md.renderer.rules.dsfr_front_matter = () => '';
  dsfrPlugin(md, {
    isEnabled: () => true,
    features: () => ({ mkdocs: mkdocsCompat() }),
    showErrors: () => true,
  });

  /**
   * @param {string} text  contenu du fichier
   * @returns {Issue[]}
   */
  return function lint(text) {
    const env = { dsfrIssues: [] };
    try {
      md.render(text, env);
    } catch (e) {
      return []; // une page que le plugin ne sait pas lire ne doit pas bloquer l'éditeur
    }
    const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
    const seen = new Set();
    const out = [];
    for (const raw of env.dsfrIssues) {
      const issue = locate(raw, lines);
      if (!issue) continue;
      const key = issue.code + '|' + issue.range.line + '|' + issue.range.start + '|' + issue.message;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(issue);
    }
    return out.sort((a, b) => a.range.line - b.range.line || a.range.start - b.range.start);
  };
}

/**
 * @typedef {{line: number, character: number}} Position
 * @typedef {{start: Position, end: Position, text: string}} Edit
 * @typedef {{title: string, edits: Edit[], preferred?: boolean}} Fix
 *   Corrections proposées dans l'ampoule : rien n'est appliqué sans un clic de l'utilisateur.
 * @typedef {{code: string, severity: 'error'|'warning', message: string,
 *            range: {line: number, start: number, end: number}, fixes: Fix[]}} Issue
 */

const lineRange = (lines, line) => {
  const t = lines[line] || '';
  const start = t.length - t.trimStart().length;
  return { line, start, end: Math.max(t.length, start) };
};

// Ligne « clé: valeur » dans les lignes [from, to) ; renvoie la ligne et les colonnes de la clé et de la valeur.
function findKey(lines, from, to, key, indentPattern) {
  const re = new RegExp('^(' + (indentPattern === undefined ? '\\s*' : indentPattern) + ')(' + escapeRe(key) + ')(\\s*:\\s*)(.*?)\\s*$');
  for (let l = from; l < Math.min(to, lines.length); l++) {
    const m = re.exec(lines[l]);
    if (!m) continue;
    const keyStart = m[1].length;
    const valueStart = keyStart + m[2].length + m[3].length;
    return { line: l, keyStart, keyEnd: keyStart + m[2].length, valueStart, valueEnd: valueStart + m[4].length, value: m[4] };
  }
  return null;
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Lignes de l'en-tête YAML (entre les deux « --- »), ou null.
function frontMatterLines(lines) {
  if (!/^---[ \t]*$/.test(lines[0] || '')) return null;
  for (let l = 1; l < lines.length; l++) if (/^(---|\.\.\.)[ \t]*$/.test(lines[l])) return { from: 1, to: l };
  return null;
}

// Mots français courants à la place du nom anglais d'une option ou d'une valeur.
const FRENCH_KEYS = { ouvert: 'open', couleur: 'color', taille: 'size', icone: 'icon', 'icône': 'icon', alignement: 'align', titre: 'title', lien: 'link' };
const FRENCH_VALUES = {
  erreur: 'error', 'succès': 'success', succes: 'success', 'réussite': 'success', avertissement: 'warning',
  attention: 'warning', information: 'info', gauche: 'left', droite: 'right', centre: 'center', 'centré': 'center',
  haut: 'top', bas: 'bottom', milieu: 'middle', secondaire: 'secondary', 'tertiaire': 'tertiary',
};
const french = (map, word, choices) => {
  const w = map[String(word).toLowerCase().replace(/^['"]|['"]$/g, '')];
  return w && (choices || []).includes(w) ? w : null;
};

const BOOL_WORDS = { true: 'true', vrai: 'true', oui: 'true', yes: 'true', on: 'true', false: 'false', faux: 'false', non: 'false', no: 'false', off: 'false' };

const replaceAt = (line, start, end, text) => ({ start: { line, character: start }, end: { line, character: end }, text });
const insertAt = (line, character, text) => replaceAt(line, character, character, text);

/** Ajoute la position précise et les corrections à un problème noté par le plugin. */
function locate(raw, lines) {
  const severity = raw.level === 'error' ? 'error' : 'warning';
  const issue = { code: raw.code, severity, message: raw.message, range: null, fixes: [] };

  switch (raw.code) {
    case 'dsfr-invalid-block': {
      const d = raw.detail || {};
      const header = lines[raw.line] || '';
      issue.range = lineRange(lines, raw.line);
      if (d.kind === 'missing-title') {
        const end = header.replace(/[\s|]+$/, '').length;
        issue.fixes.push({ title: 'Ajouter un titre au bloc', preferred: true, edits: [replaceAt(raw.line, end, header.length, ' | Titre')] });
      } else if (d.kind === 'unexpected-title') {
        const bar = header.indexOf('|');
        if (bar > 0) {
          issue.range = { line: raw.line, start: bar, end: header.length };
          issue.fixes.push({ title: 'Retirer le titre (ce bloc n\'en accepte pas)', preferred: true, edits: [replaceAt(raw.line, header.slice(0, bar).trimEnd().length, header.length, '')] });
        }
      } else if (d.key) {
        const k = findKey(lines, raw.line + 1, raw.optEnd, d.key);
        if (!k) break;
        if (d.kind === 'unknown-option') {
          issue.range = { line: k.line, start: k.keyStart, end: k.keyEnd };
          const near = french(FRENCH_KEYS, d.key, d.choices) || closest(d.key, d.choices);
          if (near) issue.fixes.push({ title: 'Remplacer « ' + d.key + ' » par « ' + near + ' »', preferred: true, edits: [replaceAt(k.line, k.keyStart, k.keyEnd, near)] });
          if (k.value) {
            // Option écrite sur une seule ligne : on peut retirer la ligne entière.
            const edit = k.line + 1 < lines.length
              ? { start: { line: k.line, character: 0 }, end: { line: k.line + 1, character: 0 }, text: '' }
              : replaceAt(k.line, 0, lines[k.line].length, '');
            issue.fixes.push({ title: 'Supprimer l\'option « ' + d.key + ' »', edits: [edit] });
          }
        } else if (d.kind === 'invalid-value' && k.value) {
          issue.range = { line: k.line, start: k.valueStart, end: k.valueEnd };
          let near = null;
          if (d.bool) near = BOOL_WORDS[k.value.replace(/^['"]|['"]$/g, '').toLowerCase()] || null;
          else near = french(FRENCH_VALUES, k.value, d.choices) || closest(k.value, d.choices);
          if (near && near !== k.value) {
            issue.fixes.push({ title: 'Remplacer « ' + k.value + ' » par « ' + near + ' »', preferred: true, edits: [replaceAt(k.line, k.valueStart, k.valueEnd, near)] });
          } else if (d.choices && d.choices.length <= 8) {
            // Pas de valeur évidente : on propose toutes les valeurs possibles (liste courte).
            for (const c of d.choices) issue.fixes.push({ title: 'Remplacer par « ' + c + ' »', edits: [replaceAt(k.line, k.valueStart, k.valueEnd, c)] });
          }
        } else {
          issue.range = { line: k.line, start: k.keyStart, end: k.valueEnd };
        }
      }
      break;
    }

    case 'dsfr-unclosed': {
      issue.range = lineRange(lines, raw.line);
      // Cause probable : un « ``` » non refermé. Fermer le bloc ailleurs ne réglerait rien.
      if (raw.fenceHint) break;
      const fence = '/'.repeat(raw.fence || 3);
      const indent = (lines[raw.line] || '').match(/^\s*/)[0];
      // Bloc du même nom placé dedans : fermer juste avant lui (seule correction juste)
      if (raw.sibling !== null && raw.sibling !== undefined) {
        // Juste après la dernière ligne du bloc (avant les lignes vides qui le séparent du suivant)
        let at = raw.sibling;
        while (at - 1 > raw.line && !(lines[at - 1] || '').trim()) at--;
        issue.fixes.push({ title: 'Fermer le bloc par « ' + fence + ' » juste avant la ligne ' + (raw.sibling + 1), preferred: true, edits: [insertAt(at, 0, indent + fence + '\n')] });
        break;
      }
      const last = lines.length - 1;
      const atEnd = lines[last]
        ? insertAt(last, lines[last].length, '\n' + indent + fence + '\n')
        : insertAt(last, 0, indent + fence + '\n');
      // Fermeture après le premier paragraphe du contenu (le plus souvent, l'oubli est là), sauf si
      // ce paragraphe contient d'autres blocs « /// » (onglets, grille…) : fermeture en fin de page.
      let l = raw.optEnd;
      while (l < lines.length && !lines[l].trim()) l++;
      const from = l;
      while (l < lines.length && lines[l].trim()) l++;
      const nested = lines.slice(from, l).some((t) => /^\s{0,3}\/{3,}/.test(t));
      const nothingAfter = lines.slice(l).every((t) => !t.trim()); // les deux fermetures reviendraient au même
      if (!nested && !nothingAfter) {
        issue.fixes.push({ title: 'Fermer le bloc par « ' + fence + ' » après son premier paragraphe', preferred: true, edits: [insertAt(l, 0, indent + fence + '\n')] });
      }
      issue.fixes.push({ title: 'Fermer le bloc par « ' + fence + ' » à la fin de la page', preferred: !issue.fixes.length, edits: [atEnd] });
      break;
    }

    case 'dsfr-list-indent': {
      issue.range = lineRange(lines, raw.line);
      const sub = raw.sublist;
      if (sub && sub.to > sub.from) {
        // Indenter la sous-liste : sa première ligne passe à 4 espaces de la puce parente ; les lignes
        // plus profondes gardent leur rang, avec 4 espaces par niveau au lieu de 2 (règle du site).
        const edits = [];
        for (let l = raw.line; l < Math.min(sub.end, lines.length); l++) {
          const t = lines[l];
          if (!t.trim()) continue;
          const cur = t.length - t.trimStart().length;
          if (/\t/.test(t.slice(0, cur))) return issue; // tabulations : pas de correction automatique
          const target = sub.to + Math.max(0, cur - sub.from) * 2;
          if (target !== cur) edits.push(replaceAt(l, 0, cur, ' '.repeat(target)));
        }
        if (edits.length) issue.fixes.push({ title: 'Indenter la sous-liste de 4 espaces (pour l\'imbriquer)', preferred: true, edits });
      }
      break;
    }

    case 'dsfr-icon-in-group': {
      issue.range = lineRange(lines, raw.line);
      const g = raw.group;
      if (g && !g.hasAttrs) {
        const indent = (lines[g.line] || '').match(/^\s*/)[0] + '    ';
        const cls = 'fr-btns-group--icon-' + raw.place;
        issue.fixes.push({
          title: 'Ajouter « attrs: {class: ' + cls + '} » au groupe de boutons',
          preferred: true,
          edits: [insertAt(g.optEnd, 0, indent + 'attrs: {class: ' + cls + '}\n')],
        });
      }
      break;
    }

    case 'dsfr-unknown-block': {
      const t = lines[raw.line] || '';
      const at = t.indexOf(raw.name);
      issue.range = at >= 0 ? { line: raw.line, start: at, end: at + raw.name.length } : lineRange(lines, raw.line);
      if (raw.suggestion && at >= 0) {
        issue.fixes.push({ title: 'Remplacer « ' + raw.name + ' » par « ' + raw.suggestion + ' »', preferred: true, edits: [replaceAt(raw.line, at, at + raw.name.length, raw.suggestion)] });
      }
      break;
    }

    case 'dsfr-orphan-close': {
      issue.range = lineRange(lines, raw.line);
      const edit = raw.line + 1 < lines.length
        ? { start: { line: raw.line, character: 0 }, end: { line: raw.line + 1, character: 0 }, text: '' }
        : replaceAt(raw.line, 0, (lines[raw.line] || '').length, '');
      issue.fixes.push({ title: 'Supprimer ce « /// » en trop', edits: [edit] });
      break;
    }

    case 'dsfr-loose-strong': {
      issue.range = { line: raw.line, start: raw.start, end: raw.end };
      // « **limites **à » → « **limites** à » : l'espace passe après les « ** ».
      issue.fixes.push({
        title: 'Coller les « ** » au mot : « **' + raw.word + '** »',
        preferred: true,
        edits: [replaceAt(raw.line, raw.start, raw.end, '**' + raw.word + '**' + raw.space)],
      });
      break;
    }

    case 'dsfr-picto': {
      const k = findKey(lines, raw.line + 1, raw.optEnd, 'picto');
      issue.range = k ? { line: k.line, start: k.valueStart, end: k.valueEnd } : lineRange(lines, raw.line);
      break;
    }

    case 'dsfr-notice-title':
    case 'dsfr-notice-type':
    case 'dsfr-breadcrumb': {
      const fm = frontMatterLines(lines);
      if (!fm) return null;
      const top = findKey(lines, fm.from, fm.to, raw.key, '');
      if (!top) return null;
      issue.range = { line: top.line, start: top.keyStart, end: top.keyEnd };
      if (raw.subkey) {
        let end = top.line + 1;
        while (end < fm.to && (/^\s/.test(lines[end]) || !lines[end].trim())) end++;
        const sub = findKey(lines, top.line + 1, end, raw.subkey, '\\s+');
        if (sub) {
          issue.range = raw.subkey === 'type'
            ? { line: sub.line, start: sub.valueStart, end: sub.valueEnd }
            : { line: sub.line, start: sub.keyStart, end: sub.valueEnd };
          if (raw.subkey === 'type') {
            const near = closest(sub.value, raw.choices);
            if (near && near !== sub.value) issue.fixes.push({ title: 'Remplacer « ' + sub.value + ' » par « ' + near + ' »', preferred: true, edits: [replaceAt(sub.line, sub.valueStart, sub.valueEnd, near)] });
          }
        }
      }
      break;
    }

    default:
      issue.range = lineRange(lines, raw.line || 0);
  }
  if (!issue.range) issue.range = lineRange(lines, raw.line || 0);
  return issue;
}

module.exports = { createLinter, frontMatterRule, closest, distance };
