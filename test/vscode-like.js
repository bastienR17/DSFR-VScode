// Crée un moteur markdown-it configuré comme celui de l'aperçu VS Code :
// html activé, plugin DSFR, puis masquage de l'en-tête YAML (règle ajoutée par VS Code après les extensions).
const MarkdownIt = require('markdown-it');
const dsfr = require('../lib/dsfr-markdown-it.js');

function frontMatter(state, startLine, endLine, silent) {
  if (startLine !== 0 || state.src.slice(state.bMarks[0], state.eMarks[0]).trim() !== '---') return false;
  let line = 1;
  while (line < endLine && state.src.slice(state.bMarks[line], state.eMarks[line]).trim() !== '---') line++;
  if (line >= endLine) return false;
  if (silent) return true;
  const t = state.push('front_matter', '', 0);
  t.hidden = true;
  t.map = [0, line + 1];
  state.line = line + 1;
  return true;
}

module.exports = function createMd(options) {
  const md = new MarkdownIt({ html: true });
  dsfr(md, Object.assign({ isEnabled: () => true, showErrors: () => false }, options || {}));
  md.block.ruler.before('fence', 'front_matter', frontMatter, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.front_matter = () => '';
  return md;
};
