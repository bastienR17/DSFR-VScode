'use strict';
/**
 * Fautes de frappe : distance entre deux mots et valeur la plus proche dans une liste.
 * Partagé par le plugin (noms de blocs inconnus) et lint.js (options, valeurs).
 */

/** Distance d'édition (Levenshtein) entre deux textes. */
function distance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Valeur la plus proche parmi `choices`, si elle l'est assez pour être une faute de frappe. */
function closest(value, choices) {
  const v = String(value).toLowerCase().replace(/^['"]|['"]$/g, '');
  let best = null;
  let bestD = Infinity;
  for (const c of choices || []) {
    const d = distance(v, c.toLowerCase());
    if (d < bestD) { best = c; bestD = d; }
  }
  if (best === null) return null;
  return bestD <= Math.max(2, Math.floor(best.length / 3)) ? best : null;
}

module.exports = { distance, closest };
