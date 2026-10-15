'use strict';
/**
 * Lecture et correction de l'en-tête YAML (« front matter ») d'un fichier Markdown.
 *
 *   ---
 *   title: Mon titre
 *   ---
 *
 * Erreur fréquente, surtout dans les en-têtes générés automatiquement : une valeur qui contient
 * elle-même « : », par exemple « title: mentor: Déposer un document ». Le YAML devient illisible.
 * MkDocs ne s'arrête pas pour autant : il ignore tout l'en-tête et le laisse dans le texte de la page.
 * Sur le site, la page commence alors par une ligne horizontale suivie d'un titre « title: mentor: … »,
 * et les métadonnées (titre, fil d'Ariane, bandeau…) sont perdues.
 *
 * La correction consiste à mettre la valeur entre guillemets simples : title: 'mentor: Déposer un document'.
 *
 * Module pur (aucune dépendance à VS Code), utilisé par l'aperçu (page-meta.js) et par
 * l'extension (diagnostics, correction rapide, commande de correction du dossier).
 */
const yaml = require('./vendor/js-yaml.min.js');

// Même expression que MkDocs (mkdocs/utils/meta.py) : « --- » en première ligne, fermé par « --- » ou « ... ».
const FRONT_MATTER_RE = /^-{3}[ \t]*\r?\n([\s\S]*?\r?\n)?(?:-{3}|\.{3})[ \t]*(?:\r?\n|$)/;

// Ligne « clé: valeur » (éventuellement indentée), valeur non vide.
const KEY_VALUE_RE = /^([ \t]*)([A-Za-z0-9_][\w-]*)([ \t]*:[ \t]+)(.*?)[ \t]*$/;

/**
 * Valeur à mettre entre guillemets : elle contient « : » suivi d'un espace (ou finit par « : »),
 * et n'est pas déjà une valeur YAML structurée (guillemets, liste, dictionnaire, bloc…).
 */
function needsQuotes(value) {
  if (!value || /^["'[{|>&*!%@`#]/.test(value)) return false;
  return /:[ \t]/.test(value) || /:$/.test(value);
}

/** Valeur entre guillemets simples (seule l'apostrophe doit être doublée en YAML). */
function quote(value) {
  return "'" + value.replace(/'/g, "''") + "'";
}

/**
 * Analyse l'en-tête d'un texte Markdown.
 * @returns {null | {
 *   source: string,          // l'en-tête complet, délimiteurs compris
 *   meta: object|null,       // métadonnées lues, ou null si illisibles
 *   error: string|null,      // message de js-yaml
 *   errorLine: number|null,  // ligne de l'erreur dans le fichier (0 = première ligne)
 *   fixes: Array<{line: number, before: string, after: string, key: string}>
 * }}
 *   `fixes` liste les lignes à mettre entre guillemets ; elle n'est remplie que si
 *   l'en-tête est illisible ET devient lisible une fois ces lignes corrigées.
 */
function analyzeFrontMatter(text) {
  const m = FRONT_MATTER_RE.exec(text);
  if (!m) return null;
  const body = m[1] || '';
  const result = { source: m[0].trimEnd(), meta: null, error: null, errorLine: null, fixes: [] };

  const parsed = tryLoad(body);
  if (!parsed.error) {
    // MkDocs ne garde l'en-tête que si c'est un dictionnaire
    if (parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)) result.meta = parsed.value;
    else if (parsed.value != null) result.error = 'l\'en-tête doit être une liste de clés « nom: valeur ».';
    else result.meta = {};
    return result;
  }

  result.error = parsed.error.reason || parsed.error.message;
  // +1 : la ligne « --- » d'ouverture précède le contenu
  result.errorLine = parsed.error.mark ? parsed.error.mark.line + 1 : 1;

  // Correction automatique : guillemets sur chaque ligne « clé: valeur » dont la valeur contient « : ».
  const lines = body.split('\n');
  const candidates = [];
  lines.forEach((line, i) => {
    const kv = KEY_VALUE_RE.exec(line.replace(/\r$/, ''));
    if (kv && needsQuotes(kv[4])) {
      const after = kv[1] + kv[2] + kv[3] + quote(kv[4]);
      candidates.push({ line: i + 1, before: line.replace(/\r$/, ''), after, key: kv[2] });
    }
  });
  if (candidates.length) {
    const fixedLines = lines.slice();
    for (const c of candidates) fixedLines[c.line - 1] = c.after + (lines[c.line - 1].endsWith('\r') ? '\r' : '');
    const fixed = tryLoad(fixedLines.join('\n'));
    if (!fixed.error && fixed.value && typeof fixed.value === 'object' && !Array.isArray(fixed.value)) {
      result.fixes = candidates;
    }
  }
  return result;
}

function tryLoad(body) {
  try {
    return { value: yaml.load(body) };
  } catch (e) {
    return { error: e };
  }
}

/**
 * Corrige l'en-tête d'un texte Markdown.
 * @returns {{text: string, fixes: Array}|null} null si rien à corriger (ou correction impossible)
 */
function fixFrontMatter(text) {
  const info = analyzeFrontMatter(text);
  if (!info || !info.fixes.length) return null;
  const lines = text.split('\n');
  for (const f of info.fixes) lines[f.line] = f.after + (lines[f.line].endsWith('\r') ? '\r' : '');
  return { text: lines.join('\n'), fixes: info.fixes };
}

/** Message d'explication commun à l'aperçu et aux diagnostics de l'éditeur. */
function describeError(info) {
  if (info.fixes.length) {
    const f = info.fixes[0];
    return 'La valeur de « ' + f.key + ' » contient « : » : l\'en-tête YAML est illisible. ' +
      'Sur le site, MkDocs ignore alors tout l\'en-tête et l\'affiche comme du texte en haut de la page ' +
      '(une ligne horizontale puis « ' + f.before.trim() + ' » en titre). ' +
      'Mettez la valeur entre guillemets : ' + f.after.trim() +
      (info.fixes.length > 1 ? ' (' + info.fixes.length + ' lignes à corriger)' : '') + '.';
  }
  return 'En-tête YAML illisible : ' + info.error + ' (ligne ' + (info.errorLine + 1) + '). ' +
    'Sur le site, MkDocs ignore alors tout l\'en-tête et l\'affiche comme du texte en haut de la page. ' +
    'Pensez aux guillemets autour des textes qui contiennent « : ».';
}

module.exports = { analyzeFrontMatter, fixFrontMatter, describeError, needsQuotes, quote };
