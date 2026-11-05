// Mise à jour depuis GitHub (lib/update.js) : numéros, Release retenue, fréquence, adresses autorisées
const assert = require('assert');
const { parseVersion, isNewer, releaseInfo, shouldCheck, allowedHost, LATEST_URL } = require('../lib/update');

assert.deepStrictEqual(parseVersion('0.13'), [0, 13, 0]);
assert.deepStrictEqual(parseVersion('v.0.9.6'), [0, 9, 6]);
assert.strictEqual(parseVersion('x'), null);
assert(isNewer('0.14.0', '0.13.3') && isNewer('1.0.0', '0.99.9') && isNewer('0.13.10', '0.13.9'));
assert(!isNewer('0.13.0', '0.13.0') && !isNewer('0.12.9', '0.13.0') && !isNewer('x', '0.1.0'));

// Le numéro vient du nom du .vsix (l'étiquette peut être « v0.13 »)
const release = { tag_name: 'v0.13', html_url: 'https://github.com/bastienR17/DSFR-VScode/releases/tag/v0.13', draft: false, prerelease: false,
  assets: [{ name: 'notes.txt', browser_download_url: 'https://github.com/x/notes.txt' },
    { name: 'dsfr-markdown-preview-0.13.0.vsix', browser_download_url: 'https://github.com/bastienR17/DSFR-VScode/releases/download/v0.13/dsfr-markdown-preview-0.13.0.vsix' }] };
assert.deepStrictEqual(releaseInfo(release), { version: '0.13.0', name: 'dsfr-markdown-preview-0.13.0.vsix', url: release.assets[1].browser_download_url, page: release.html_url });
assert.strictEqual(releaseInfo({ ...release, draft: true }), null, 'brouillon');
assert.strictEqual(releaseInfo({ ...release, prerelease: true }), null, 'préversion');
assert.strictEqual(releaseInfo({ ...release, assets: [{ name: 'dsfr-markdown-preview-0.13.0.vsix', browser_download_url: 'https://exemple.fr/x.vsix' }] }), null, 'hors de GitHub');
assert.strictEqual(releaseInfo({ ...release, assets: [] }), null, 'sans .vsix');
assert.strictEqual(releaseInfo(null), null);

// Au plus une vérification par jour
const now = Date.UTC(2026, 10, 5, 9);
assert(shouldCheck(undefined, now) && shouldCheck(now - 21 * 3600e3, now) && !shouldCheck(now - 3600e3, now) && shouldCheck(now + 3600e3, now));

// Téléchargements : GitHub et ses serveurs de fichiers seulement
assert(allowedHost(LATEST_URL) && allowedHost('https://objects.githubusercontent.com/a') && allowedHost('https://release-assets.githubusercontent.com/b'));
assert(!allowedHost('http://github.com/a') && !allowedHost('https://github.com.evil.fr/a') && !allowedHost('https://evilgithub.com/a'));
console.log('Mise à jour depuis GitHub : numéros, Release retenue, fréquence et adresses autorisées OK');
