import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

// Source/CSS contracts and real confirmation logic with DOM boundary doubles.
// These checks do not measure layout, wheel/key scrolling, focus, or native dialogs.
// The coordinator's native-browser pass must establish those independently.
const root = new URL('../', import.meta.url);
const target = process.argv[2] || 'src/index.template.html';
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
let html = path.isAbsolute(target) ? fs.readFileSync(target, 'utf8') : read(target);
if (target.includes('self-extract')) {
  const payload = html.match(/<script id="self-extract-payload" type="application\/octet-stream">([\s\S]*?)<\/script>/);
  assert.ok(payload, 'self-extract payload exists');
  html = gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
}
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function rule(text, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^{}]*)\\}`));
  assert.ok(match, `CSS rule exists: ${selector}`);
  return match[1];
}
function declaration(body, property, expected) {
  const values = [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'g'))].map(m => m[1].trim());
  assert.ok(values.includes(expected), `${property}: ${expected}`);
}

test(`${target}: html and body lock only while a native modal is open`, () => {
  const lock = rule(css, 'html:has(dialog:modal), body:has(dialog:modal)');
  declaration(lock, 'overflow', 'hidden');
  declaration(lock, 'overscroll-behavior', 'none');
  assert.ok(!/\b(?:position|height)\s*:/.test(lock), 'lock does not reposition or resize the document');
});

for (const [name, text] of [[target, css], ['reusable confirmation snippet', read('components/confirm-dialog.html')]]) {
  test(`${name}: only the open confirmation becomes a viewport-bounded column`, () => {
    const open = rule(text, '.app-confirm-dialog[open]');
    declaration(open, 'display', 'flex');
    declaration(open, 'flex-direction', 'column');
    declaration(open, 'max-height', 'calc(100vh - 28px - env(safe-area-inset-top) - env(safe-area-inset-bottom))');
    declaration(open, 'max-height', 'calc(100dvh - 28px - env(safe-area-inset-top) - env(safe-area-inset-bottom))');
    assert.ok(!/\bdisplay\s*:\s*flex/.test(rule(text, '.app-confirm-dialog')), 'closed dialog keeps native display behavior');
  });
  test(`${name}: confirmation header cannot shrink and body owns internal scrolling`, () => {
    declaration(rule(text, '.app-confirm-header'), 'flex', '0 0 auto');
    const body = rule(text, '.app-confirm-body');
    declaration(body, 'min-height', '0');
    declaration(body, 'flex', '1 1 auto');
    declaration(body, 'overflow', 'auto');
    declaration(body, 'overscroll-behavior', 'contain');
    declaration(body, '-webkit-overflow-scrolling', 'touch');
    assert.match(text, /\.app-confirm-body\s*\{\s*padding:\s*12px 18px calc\(env\(safe-area-inset-bottom\) \+ 18px\);\s*\}/, 'mobile safe-area body padding is retained');
  });
}

test(`${target}: confirmation actions remain inside its scroll body`, () => {
  const dialog = html.match(/<dialog class="app-confirm-dialog"[\s\S]*?<\/dialog>/)[0];
  assert.match(dialog, /<div class="app-confirm-body">[\s\S]*id="appConfirmMessage"[\s\S]*<div class="app-confirm-actions">[\s\S]*id="appConfirmCancel"[\s\S]*id="appConfirmOk"/);
  assert.match(dialog, /aria-labelledby="appConfirmTitle" aria-describedby="appConfirmMessage"/);
});

test(`${target}: existing Help layout and shield/check badge stay byte-identical`, () => {
  const help = html.slice(html.indexOf('    #helpDialog[open] {'), html.indexOf('    .dialog-body h3'));
  assert.equal(hash(help), '9d46afac93d7e0008bbe8160e73e7acbab1a5f293106a71f95d651b55736ccca');
  const badge = html.match(/<div class="local-badge">[\s\S]*?<\/div>/)[0];
  assert.equal(hash(badge), '379a65902ddd049c6d59431f50cfcd1de82ab45de04605d2666e559e21f68fab');
});

test(`${target}: application execution stays byte-identical except the scoped Help descendant guard`, () => {
  const runtime = html.slice(html.indexOf('      // Template repository contract'));
  const guard = "helpDialog.addEventListener('click',event=>{ if(event.target!==event.currentTarget)return; const r=";
  assert.equal(runtime.split(guard).length - 1, 1, 'exactly one scoped Help descendant guard');
  const originalRuntime = runtime.replace(guard, "helpDialog.addEventListener('click',event=>{ const r=");
  assert.equal(hash(originalRuntime), '2e0bca3ac359550f865001d37cae158c3b1df303d22ec367d5df0e6206ae3011', 'parser, engine, report, navigation, and modal handlers are untouched');
});

test(`${target}: Help omits layout implementation commentary`, () => {
  assert.doesNotMatch(html, /<p data-i18n="helpDialogs">[^<]+<\/p>/);
  assert.doesNotMatch(html, /helpDialogs:'[^']*背景[^']*スクロール[^']*'/);
  assert.doesNotMatch(html, /helpDialogs:'[^']*background page[^']*scroll[^']*'/);
});

test('canonical checker runs the modal contracts for all existing release targets', () => {
  const checker = read('scripts/check-repository.ps1');
  const loop = checker.slice(checker.indexOf('foreach ($target in @("src/index.template.html"'), checker.indexOf('Write-Host "[OK] Repository check passed."'));
  for (const file of ['src/index.template.html', 'dist/index.html', 'pptx-diff.html', 'dist/index.self-extract.html']) assert.ok(loop.includes(`"${file}"`), file);
  assert.match(loop, /& node \(Join-Path \$Root "scripts\/test-dialog-layout\.mjs"\) \$target\s+if \(\$LASTEXITCODE -ne 0\)/);
});

// Exercise unchanged production handlers, including cleanup and reopen. This
// proves promise/handler ownership only; browser modal/focus behavior is separate.
function confirmationHarness() {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { open: false, listeners: new Map(),
      addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); },
      removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); },
      dispatch(type, event = {}) { for (const callback of [...(this.listeners.get(type) || [])]) callback(event); },
      showModal() { this.open = true; }, close() { this.open = false; },
      getBoundingClientRect() { return { left: 10, right: 200, top: 10, bottom: 200 }; }
    });
    return nodes.get(id);
  };
  const start = html.indexOf('      function showAppConfirmDialog(');
  const end = html.indexOf('\n      function downloadBlobFile(', start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({ $: get });
  vm.runInContext(html.slice(start, end), context);
  return { get, ask: () => context.showAppConfirmDialog({ title: 'Synthetic report', message: 'Synthetic warning', okText: 'Save', cancelText: 'Cancel' }), nodes };
}
for (const mode of ['cancel', 'close', 'escape', 'backdrop', 'save']) test(`${target}: ${mode} resolves once and leaves no handlers before reopen`, async () => {
  const h = confirmationHarness();
  for (let repeat = 0; repeat < 2; repeat++) {
    const promise = h.ask();
    assert.equal(h.get('#appConfirmDialog').open, true);
    if (mode === 'escape') {
      let prevented = false;
      h.get('#appConfirmDialog').dispatch('cancel', { preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
    } else if (mode === 'backdrop') {
      h.get('#appConfirmDialog').dispatch('click', { clientX: 50, clientY: 50 });
      assert.equal(h.get('#appConfirmDialog').open, true, 'interior click does not cancel');
      h.get('#appConfirmDialog').dispatch('click', { clientX: 0, clientY: 0 });
    } else h.get({ cancel: '#appConfirmCancel', close: '#appConfirmClose', save: '#appConfirmOk' }[mode]).dispatch('click');
    assert.equal(await promise, mode === 'save');
    assert.equal(h.get('#appConfirmDialog').open, false);
    for (const node of h.nodes.values()) for (const listeners of node.listeners.values()) assert.equal(listeners.size, 0);
  }
});
