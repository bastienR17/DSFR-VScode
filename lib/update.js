'use strict';
/**
 * Mise à jour depuis GitHub : l'extension n'est pas sur la Marketplace (VS Code ne la met donc pas à jour
 * lui-même). À chaque ouverture de VS Code, puis toutes les 4 heures tant qu'il reste ouvert, elle regarde la
 * dernière Release du dépôt ; si son .vsix est plus récent, elle propose de l'installer.
 *
 * Le numéro est lu dans le nom du .vsix joint à la Release (dsfr-markdown-preview-0.13.0.vsix), plus sûr que
 * l'étiquette (« v0.13 », « v.0.9.6 »…).
 *
 * Module pur, testé par test/update.js ; extension.js fait les appels réseau et l'installation.
 */

const REPO = 'bastienR17/DSFR-VScode';
const LATEST_URL = 'https://api.github.com/repos/' + REPO + '/releases/latest';
const ASSET_RE = /^dsfr-markdown-preview-(\d+\.\d+\.\d+)\.vsix$/;
// Écart minimal entre deux vérifications : évite de vérifier une fois par fenêtre quand plusieurs fenêtres
// de VS Code s'ouvrent ensemble
const MIN_GAP = 60 * 1000;
// Tant que VS Code reste ouvert
const PERIOD = 4 * 60 * 60 * 1000;

/** « 0.13.2 » → [0, 13, 2] ; null si illisible */
function parseVersion(v) {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(v || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
}

/** a est-elle plus récente que b ? */
function isNewer(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/**
 * Release GitHub (réponse de l'API) → ce qu'il faut pour proposer la mise à jour, ou null.
 * Seul un .vsix de l'extension, téléchargé depuis github.com, est retenu.
 * @returns {{version: string, url: string, name: string, page: string}|null}
 */
function releaseInfo(release) {
  if (!release || release.draft || release.prerelease || !Array.isArray(release.assets)) return null;
  for (const a of release.assets) {
    const m = ASSET_RE.exec(a && a.name);
    if (!m || typeof a.browser_download_url !== 'string') continue;
    if (!/^https:\/\/github\.com\//.test(a.browser_download_url)) continue;
    return { version: m[1], url: a.browser_download_url, name: a.name, page: typeof release.html_url === 'string' ? release.html_url : 'https://github.com/' + REPO + '/releases' };
  }
  return null;
}

/** Faut-il vérifier maintenant ? (oui, sauf si une vérification vient d'avoir lieu, il y a moins d'une minute) */
const shouldCheck = (last, now) => !Number.isFinite(last) || now - last >= MIN_GAP || now < last;

// Adresses autorisées pour le téléchargement (GitHub et ses serveurs de fichiers, après redirection)
const allowedHost = (url) => /^https:\/\/([\w-]+\.)*(github\.com|githubusercontent\.com)(\/|$)/i.test(String(url || ''));

module.exports = { REPO, LATEST_URL, PERIOD, parseVersion, isNewer, releaseInfo, shouldCheck, allowedHost };
