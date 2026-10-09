const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {gunzipSync} = require('node:zlib');
const root = path.resolve(__dirname, '..');
const asset = fs.readFileSync(path.join(root, 'assets/favicon.svg'));
assert.equal(require('node:crypto').createHash('sha256').update(asset).digest('hex'), 'a0d0a1cb5eb2bde3f96a19a0f3e984578c36a862a7b85e28cf4efc69fb8d7f38', 'Preserve the normalized canonical artwork');
const svg = asset.toString();
const contour = "M275.5 0H826.5A275.5 272.25 0 0 1 1102 272.25V816.75A275.5 272.25 0 0 1 826.5 1089H275.5A275.5 272.25 0 0 1 0 816.75V272.25A275.5 272.25 0 0 1 275.5 0Z";
const firstPath = svg.match(/<path\b[^>]*d="([^"]*)"/)[1];
assert.ok(firstPath.startsWith(contour), 'Exact 25% rounded rectangle contour with preserved bounds');
assert.equal(require('node:crypto').createHash('sha256').update(firstPath.slice(contour.length)).digest('hex'), 'fcf42006aeb960318f08992036fdcaf6a80b59941310f0ed2f8f9268582ad552', 'Preserve every interior cutout byte');
assert.ok(svg.includes('fill="#16624f"'), 'Shared brand green');
assert.ok(!svg.includes('#0b6450'), 'Matching strokes and cutouts share brand green');
const decode = uri => uri.startsWith('data:image/svg+xml;base64,') ? Buffer.from(uri.split(',')[1], 'base64') : Buffer.from(decodeURIComponent(uri.slice(uri.indexOf(',')+1)));
const favicon = html => {
  const tag = html.match(/<link\b[^>]*rel=["']icon["'][^>]*>/)[0];
  assert.deepEqual(decode(tag.match(/href=(["'])(.*?)\1/s)[2]), asset, 'Canonical favicon byte parity');
};
const header = html => {
  const img = html.match(/<img\b[^>]*id="appBrandIcon"[^>]*>/);
  if (img) assert.deepEqual(decode(img[0].match(/src="([^"]*)"/)[1]), asset, 'Canonical header byte parity');
  else assert.ok(html.includes(svg.trim()), 'Inline header has canonical SVG');
};
const readable = fs.readFileSync(path.join(root, 'dist/index.html'));
for(const file of ['dist/index.html', 'pptx-diff.html']) {const html=fs.readFileSync(path.join(root,file),'utf8');favicon(html);header(html);}
const source = fs.readFileSync(path.join(root,'src/index.template.html'),'utf8');
if(!source.includes('__APP_ICON_DATA_URI__')) {favicon(source);header(source);}
const wrapper=fs.readFileSync(path.join(root,'dist/index.self-extract.html'),'utf8');
favicon(wrapper);
const payload=wrapper.match(/<script id="self-extract-payload"[^>]*>([A-Za-z0-9+/=\s]+)<\/script>/);
assert.ok(payload,'Self-extract payload exists');
assert.deepEqual(gunzipSync(Buffer.from(payload[1],'base64')), readable, 'Self-extract restores exact readable bytes');
console.log('Icon color, exact quarter-radii, header/favicon/alias/loader parity passed.');
