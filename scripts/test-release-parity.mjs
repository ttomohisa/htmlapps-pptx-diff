import fs from 'node:fs';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const source=read('src/index.template.html'),dist=read('dist/index.html'),alias=read('pptx-diff.html'),loader=read('dist/index.self-extract.html');
const payload=loader.match(/<script id="self-extract-payload" type="application\/octet-stream">([\s\S]*?)<\/script>/);
assert.ok(payload,'self-extract payload exists');
const restored=zlib.gunzipSync(Buffer.from(payload[1],'base64')).toString('utf8');
assert.equal(restored,dist,'self-extract payload restores readable release');
function appCode(html) { const start=html.indexOf('      const translations ='); assert.ok(start>=0,'application translations boundary'); return html.slice(start,html.lastIndexOf('</script>')); }
for(const [name,html] of [['readable',dist],['root alias',alias],['self-extract',restored]]) {
  assert.equal(appCode(html),appCode(source),`${name} application code must match source`);
  assert.ok(html.includes("connect-src 'none'"),`${name} retains runtime network block`);
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  for(const [,script] of scripts) new vm.Script(script);
}
console.log('[OK] Source, root alias, readable and self-extract application code and JavaScript syntax agree.');
