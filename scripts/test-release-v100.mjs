import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const bytes = (path) => fs.readFileSync(new URL(path, root));
const source = read('src/index.template.html');
const dist = read('dist/index.html');
const selfExtract = read('dist/index.self-extract.html');
const config = JSON.parse(read('app.config.json'));
const depManifest = JSON.parse(read('dist/dependency-manifest.json'));
const readme = read('README.md');
const readmeJa = read('README.ja.md');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}
function indexAfter(text, earlier, later, label) {
  const a = text.indexOf(earlier);
  const b = text.indexOf(later, Math.max(0, a));
  expect(a >= 0 && b > a, label);
}

expect(config.version === '1.0.1', 'app.config.json must be v1.0.1');
expect(source.includes('id="versionBadge">v1.0.1</span>'), 'source version badge is not v1.0.1');
expect(dist.includes('\"version\":\"1.0.1\"'), 'dist/index.html does not embed v1.0.1 config');
expect(depManifest.app?.version === '1.0.1', 'dependency manifest version is not v1.0.1');
expect(!/__([A-Z0-9_]+)__/.test(dist), 'dist/index.html contains unresolved build placeholders');
expect(dist.includes("connect-src 'none'"), 'runtime network blocking CSP is missing');
expect(!/https?:\/\//i.test(dist.match(/<script[^>]*src=["'][^"']+/gi)?.join('\n') || ''), 'external runtime script reference found');

// v0.8.0 UI/UX invariants retained for the stable release.
expect(source.includes('scroll-margin-top:76px'), 'sticky-header result/visual offset is missing');
expect(source.includes('id="resultFilePair"'), 'result file-pair summary is missing');
expect(source.includes('id="analyzeSpinner"') && source.includes('id="saveReportSpinner"'), 'busy indicators are missing');
expect(source.includes("event.target.closest('.semantic-details,button,a,input,select,textarea,label,summary')"), 'nested Semantic Diff click guard is missing');
expect(source.includes('function selectVisualPair(pairId)'), 'Visual Compare selection helper is missing');
expect(source.includes('syncMatchSelection(); renderVisualCompare(state.matching);'), 'Visual Compare selection should not rebuild the result list');
expect(source.includes("btn.disabled=key!=='all'&&count===0&&key!==state.diffFilter"), 'zero-result filter disabling is missing');
expect(!source.includes('id="originalDrop" role="button"'), 'drop zone must not contain nested button semantics');

// Chart regression: renderer DOM must be connected before awaiting readiness.
indexAfter(source,
  "frame.append(handle.element);\n          mount.replaceChildren(frame,createHighlightOverlay",
  'await handle.ready;',
  'Visual Compare must mount the renderer DOM before awaiting handle.ready');
indexAfter(source,
  'host.append(handle.element); document.body.append(host);',
  'await handle.ready;',
  'Report snapshots must connect the renderer DOM before awaiting handle.ready');
expect(source.includes('await waitForReportCharts(chartInstances);'), 'report export must wait for chart rendering to settle');

// Report privacy, fidelity, local self-extraction, and user-facing geometry.
expect(source.includes('showAppConfirmDialog({title:t(\'reportConfirmTitle\')'), 'report save confirmation dialog is missing');
expect(source.includes("new DecompressionStream('gzip')") || source.includes('new DecompressionStream("gzip")'), 'report self-extract decompressor is missing');
expect(source.includes("new CompressionStream('gzip')") || source.includes('new CompressionStream("gzip")'), 'report gzip compression path is missing');
expect(source.includes('<details class="slide" open>'), 'collapsible report slide sections are missing');
expect(source.includes("if(kind==='emu') return `${(Number(value)/360000).toFixed(2)} cm`;"), 'layout report values are not converted from EMU to centimeters');
expect(source.includes('<link rel="icon" href="${reportEscape(reportFaviconHref())}">'), 'report favicon embedding is missing');

// Embedded dependency contract.
expect(depManifest.dependencies?.length === 1, 'unexpected release dependency count');
expect(depManifest.dependencies[0].package === '@aiden0z/pptx-renderer', 'pptx renderer dependency is missing');
expect(depManifest.dependencies[0].version === '1.2.4', 'pptx renderer must remain pinned at 1.2.4 for v1.0.1');

// README structure follows the established PDF Organizer repository style.
for (const [name, text] of [['README.md', readme], ['README.ja.md', readmeJa]]) {
  expect(text.includes('[![GitHub Pages]'), `${name} is missing the GitHub Pages badge`);
  expect(text.includes('[![License: MIT]'), `${name} is missing the MIT badge`);
  expect(text.includes('[![Single HTML]'), `${name} is missing the single-HTML badge`);
  expect(text.includes('## Privacy and runtime network protection') || text.includes('## プライバシーと通信防止'), `${name} is missing privacy/runtime-network documentation`);
  expect(text.includes('## Limitations') || text.includes('## 制限事項'), `${name} is missing limitations`);
  expect(text.includes('## Dependencies') || text.includes('## 使用ライブラリ'), `${name} is missing dependencies`);
}
expect(readme.includes('assets/screenshot-en.png'), 'English README must reference screenshot-en.png');
expect(readmeJa.includes('assets/screenshot.png'), 'Japanese README must reference screenshot.png');

expect(readme.includes('**v1.0.1 is the stable release.**'), 'English README stable-release status is missing');
expect(readmeJa.includes('**v1.0.1 は正式版です。**'), 'Japanese README stable-release status is missing');
expect(read('APP_SPEC.md').includes('**Version:** v1.0.1'), 'APP_SPEC version is not v1.0.1');
expect(read('CHANGELOG.md').includes('## 1.0.1'), 'CHANGELOG 1.0.1 entry is missing');
expect(bytes('assets/screenshot.png').length > 10000, 'Japanese release screenshot is missing or unexpectedly small');
expect(bytes('assets/screenshot-en.png').length > 10000, 'English release screenshot is missing or unexpectedly small');

// Self-extract artifact metadata and payload integrity.
const payloadMatch = selfExtract.match(/<script id="self-extract-payload" type="application\/octet-stream">([A-Za-z0-9+/=\s]+)<\/script>/);
expect(payloadMatch, 'self-extract payload was not found');
const restored = zlib.gunzipSync(Buffer.from(payloadMatch[1].replace(/\s+/g, ''), 'base64'));
const distBytes = bytes('dist/index.html');
expect(restored.equals(distBytes), 'self-extract payload does not restore dist/index.html byte-for-byte');
const sourceHash = crypto.createHash('sha256').update(distBytes).digest('hex');
expect(selfExtract.includes(`name="self-extract-source-sha256" content="${sourceHash}"`), 'self-extract source hash metadata does not match dist/index.html');

console.log('[OK] v1.0.1 stable-release guards passed.');
