import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

// Real application functions with fictitious comparison rows and explicit DOM /
// visual-rendering doubles. No browser, file upload, or real PPTX is involved.
const path = process.argv[2] || 'src/index.template.html';
let source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
if (path.includes('self-extract')) {
  const payload = source.match(/<script id="self-extract-payload" type="application\/octet-stream">([\s\S]*?)<\/script>/);
  assert.ok(payload, 'standalone gzip payload');
  source = zlib.gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
}
function fn(name) {
  const match = source.match(new RegExp(`^      (?:async )?function ${name}\\(`, 'm'));
  if (!match) return '';
  const start = match.index, end = source.indexOf('\n', start), first = source.slice(start, end);
  return first.trimEnd().endsWith('}') ? first : source.slice(start, source.indexOf('\n      }', end) + 8);
}
const translationCode = source.slice(source.indexOf('      const translations ='), source.indexOf('      // Template repository contract marker:'));
const navMarkup = source.slice(source.indexOf('<div class="visual-nav"'), source.indexOf('<div class="visual-selection"'));
const buttonIds = ['visualFirstButton', 'visualPrevButton', 'visualNextButton', 'visualLastButton'];
function row(pairId, overrides = {}) {
  const slide = index => ({index, title:`Fictitious slide ${index}`});
  return {pairId, original:slide(pairId), revised:slide(pairId), confidence:'high', semanticChanged:false, moved:false, reviewRequired:false,
    semantic:{textChanges:[], numberChanges:[], objectChanges:[], imageChanges:[], layoutChanges:[], formattingChanges:[], notesChanges:[]}, ...overrides};
}
function setup(rows = [row(10), row(30), row(70)]) {
  const nodes = new Map();
  let previewRenders = 0;
  const document = {activeElement:null, documentElement:{lang:'en'}, title:'', createElement:makeNode,
    querySelectorAll(selector) {
      if (selector === '#matchList .match-row[data-pair-id]') return get('#matchList').children;
      if (selector === '[data-i18n-title]') return buttonIds.map(id=>get(`#${id}`)).filter(n=>n.dataset.i18nTitle);
      if (selector === '[data-i18n-aria-label]') return buttonIds.map(id=>get(`#${id}`)).filter(n=>n.dataset.i18nAriaLabel);
      return [];
    }};
  function makeNode(tag='div') {
    const attributes = {}, classes = new Set(), events = {};
    return {tag, attributes, events, dataset:{}, style:{}, children:[], hidden:false, disabled:false, textContent:'', scrollTop:0,
      get className() { return [...classes].join(' '); },
      set className(value) { classes.clear();value.split(/\s+/).filter(Boolean).forEach(v=>classes.add(v)); },
      classList:{add(...cs) {cs.forEach(c=>classes.add(c));}, contains(c) {return classes.has(c);}, toggle(c,on) {on?classes.add(c):classes.delete(c);}},
      setAttribute(k,v) {attributes[k]=String(v);}, getAttribute(k) {return attributes[k]??null;}, removeAttribute(k) {delete attributes[k];},
      append(...children) {this.children.push(...children);}, replaceChildren(...children) {this.children=children;},
      addEventListener(type,handler) {events[type]=handler;}, focus() {document.activeElement=this;}
    };
  }
  function get(id) { if(!nodes.has(id)) nodes.set(id,makeNode()); return nodes.get(id); }
  for (const match of navMarkup.matchAll(/<button\b[^>]*id="([^"]+)"[^>]*>/g)) {
    const node=get(`#${match[1]}`);
    node.dataset.i18nTitle=match[0].match(/data-i18n-title="([^"]+)"/)?.[1];
    node.dataset.i18nAriaLabel=match[0].match(/data-i18n-aria-label="([^"]+)"/)?.[1];
  }
  const state = {language:'en', phase:'result', selectedPairId:null, diffFilter:'all', changedOnly:false, visualMode:'side', visualHighlights:true,
    rendererPresentations:{original:null,revised:null}, visualRenderGeneration:0,
    matching:{rows,summary:{unchanged:rows.length,changed:0,added:0,removed:0,moved:0,review:0}}};
  const context=vm.createContext({state, $:get, document, APP_CONFIG:{name:'PPTX Diff',nameJa:'PPTX Diff'}, formatNumber:String,
    renderFileSlot(){}, updateReadyState(){}, setStatus(){}, renderSemanticSummary(){}, renderFilterCounts(){}, statusDescriptor:()=>({key:'unchanged',status:'unchanged'}),
    statusIcon:()=>makeNode(), reasonFor:()=>'', slideCell:()=>makeNode(), formatPreviewSlideTitle:slide=>slide.title,
    semanticDetails(){const n=makeNode('details');n.open=true;return n;},
    disposeVisualRenderHandles(){state.visualRenderGeneration++;previewRenders++;}, changedObjectsForRow:()=>({original:[],revised:[]}),
    createVisualMarkerBar:()=>makeNode(), createVisualPane:()=>makeNode(), renderVisualDiffPanel(){}, requestAnimationFrame(){},
  });
  const names=['t','applyLanguage','rowMatchesFilter','selectedVisualRow','visibleVisualRows','visualRowIndex','syncMatchSelection','selectVisualPair','navigateVisual','navigateVisualBoundary','renderMatching','renderVisualCompare','compareModeNote'];
  const navigationListeners=source.split('\n').filter(line=>/^      \$\('#visual(?:First|Prev|Next|Last)Button'\)\.addEventListener\('click'/.test(line)).join('\n');
  vm.runInContext(translationCode+'\n'+names.map(fn).join('\n')+'\n'+navigationListeners,context);
  const render=()=>context.renderMatching(state.matching), renderedRows=()=>get('#matchList').children;
  function click(id) { const handler=get(`#${id}`).events.click;assert.equal(typeof handler,'function',`${id} has a production click handler`);handler(); }
  return {state, context, get, render, renderedRows, document, click, get previewRenders(){return previewRenders;}};
}
function assertCurrent(h, id) {
  const rows=h.renderedRows(), current=rows.filter(n=>n.getAttribute('aria-current')==='true');
  assert.deepEqual(current.map(n=>n.dataset.pairId), id===null?[]:[String(id)]);
  for (const n of rows) {
    const selected=n.dataset.pairId===String(id);
    assert.equal(n.classList.contains('is-selected'),selected);
    assert.equal(n.getAttribute('aria-current'),selected?'true':null,'remove stale current attributes entirely');
    assert.equal(n.getAttribute('aria-selected'),null,'role=button does not support aria-selected');
  }
}
function assertButtons(h, firstDisabled, lastDisabled) {
  for (const id of ['visualFirstButton','visualPrevButton']) assert.equal(h.get(`#${id}`).disabled,firstDisabled,id);
  for (const id of ['visualLastButton','visualNextButton']) assert.equal(h.get(`#${id}`).disabled,lastDisabled,id);
}

test('initial selected row exposes aria-current, without unsupported selected semantics',()=>{
  const h=setup();h.render();assert.equal(h.state.selectedPairId,10);assertCurrent(h,10);
});
test('direct selection and previous/next keep exactly one current row',()=>{
  const h=setup();h.render();h.context.selectVisualPair(30);assertCurrent(h,30);
  h.click('visualNextButton');assertCurrent(h,70);h.click('visualPrevButton');assertCurrent(h,30);
});
test('row click, Enter and Space preserve selection access and current state',()=>{
  const h=setup();h.render();const n=h.renderedRows()[1];
  n.events.click({target:{closest:()=>null}});assertCurrent(h,30);
  for (const key of ['Enter',' ']) {h.context.selectVisualPair(10);let prevented=false;n.events.keydown({target:n,key,preventDefault(){prevented=true;}});assertCurrent(h,30);assert.ok(prevented);}
});
test('nested semantic controls do not change current selection',()=>{
  const h=setup();h.render();const n=h.renderedRows()[1];
  n.events.click({target:{closest:()=>({})}});n.events.keydown({target:{},key:'Enter',preventDefault(){assert.fail('nested key prevented');}});assertCurrent(h,10);
});
test('first and last jump to the comparison-row boundaries rather than slide numbers',()=>{
  const h=setup([row(42),row(7),row(99)]);h.render();h.context.selectVisualPair(7);
  h.click('visualLastButton');assert.equal(h.state.selectedPairId,99);assertCurrent(h,99);assertButtons(h,false,true);assert.equal(h.get('#visualNavPosition').textContent,'3 / 3');
  h.click('visualFirstButton');assert.equal(h.state.selectedPairId,42);assertCurrent(h,42);assertButtons(h,true,false);assert.equal(h.get('#visualNavPosition').textContent,'1 / 3');
});
test('boundary buttons are disabled at the active edge and their handlers are no-ops there',()=>{
  const h=setup();h.render();assertButtons(h,true,false);let count=h.previewRenders;
  h.click('visualFirstButton');assert.equal(h.previewRenders,count);h.click('visualLastButton');count=h.previewRenders;
  h.click('visualLastButton');assert.equal(h.previewRenders,count);assertButtons(h,false,true);
});
test('single-result navigation disables all buttons and repeated boundary clicks do nothing',()=>{
  const h=setup([row(42)]);h.render();assertButtons(h,true,true);const count=h.previewRenders;
  h.click('visualFirstButton');h.click('visualLastButton');assert.equal(h.previewRenders,count);assertCurrent(h,42);
});
test('empty matching and missing matching have no boundary target',()=>{
  const h=setup([]);h.render();assertButtons(h,true,true);assertCurrent(h,null);const count=h.previewRenders;
  h.click('visualFirstButton');h.click('visualLastButton');assert.equal(h.previewRenders,count);
  h.state.matching=null;h.click('visualFirstButton');h.click('visualLastButton');assert.equal(h.previewRenders,count);assert.equal(h.state.selectedPairId,null);
});
test('changed-only boundaries retain added, removed, moved, and review rows in visible order',()=>{
  const h=setup([row(1),row(20,{original:null}),row(3),row(40,{revised:null}),row(50,{moved:true}),row(60,{reviewRequired:true}),row(7)]);
  h.state.changedOnly=true;h.render();assertCurrent(h,20);assert.equal(h.get('#visualNavPosition').textContent,'1 / 4');
  h.click('visualLastButton');assertCurrent(h,60);assert.equal(h.get('#visualNavPosition').textContent,'4 / 4');h.click('visualFirstButton');assertCurrent(h,20);
});
for (const category of ['text','number','object','image','layout','formatting','notes']) test(`${category} category boundaries skip hidden rows`,()=>{
  const changed=id=>{const r=row(id,{semanticChanged:true});r.semantic[`${category}Changes`]=[{}];return r;};
  const h=setup([row(1),changed(11),row(2),changed(22),row(3)]);h.state.diffFilter=category;h.state.changedOnly=true;h.render();
  assertCurrent(h,11);h.click('visualLastButton');assertCurrent(h,22);assert.equal(h.get('#visualNavPosition').textContent,'2 / 2');h.click('visualFirstButton');assertCurrent(h,11);
});
test('filter fallback replaces the current marker; clearing the filter restores valid boundaries',()=>{
  const changed=row(30,{semanticChanged:true});changed.semantic.numberChanges=[{}];const h=setup([row(10),changed,row(70)]);h.render();h.context.selectVisualPair(70);
  h.state.diffFilter='number';h.render();assertCurrent(h,30);assertButtons(h,true,true);
  h.state.diffFilter='all';h.render();assertCurrent(h,30);assertButtons(h,false,false);h.click('visualFirstButton');assertCurrent(h,10);
});
test('empty filtered results remove all current markers and disable every navigation button',()=>{
  const h=setup();h.render();h.state.diffFilter='notes';h.render();assertCurrent(h,null);assertButtons(h,true,true);assert.equal(h.get('#diffEmpty').hidden,false);
  assert.equal(h.get('#visualNavPosition').textContent,'—');const count=h.previewRenders;
  h.click('visualFirstButton');h.click('visualLastButton');assert.equal(h.previewRenders,count);assert.equal(h.context.selectedVisualRow(h.state.matching),null);
});
test('boundary navigation retains result DOM, open details, focus, and scroll state',()=>{
  const h=setup();h.render();const rows=h.renderedRows(), detail=rows[1].children.at(-1);h.get('#matchList').scrollTop=217;detail.focus();
  h.click('visualLastButton');h.click('visualFirstButton');
  assert.equal(h.renderedRows(),rows);assert.equal(rows[1].children.at(-1),detail);assert.equal(detail.open,true);assert.equal(h.document.activeElement,detail);assert.equal(h.get('#matchList').scrollTop,217);
});
test('boundary navigation leaves matching, report ownership, generation, and mode unchanged',()=>{
  const h=setup();h.state.runGeneration=23;h.state.reportJob={id:'fictitious report'};const job=h.state.reportJob, matching=JSON.stringify(h.state.matching);h.render();
  h.click('visualLastButton');h.click('visualFirstButton');
  assert.equal(JSON.stringify(h.state.matching),matching);assert.equal(h.state.reportJob,job);assert.equal(h.state.runGeneration,23);assert.equal(h.state.visualMode,'side');
});
test('native boundary buttons are ordered first/previous/position/next/last and localized',()=>{
  assert.deepEqual([...navMarkup.matchAll(/id="([^"]+)"/g)].map(m=>m[1]),['visualFirstButton','visualPrevButton','visualNavPosition','visualNextButton','visualLastButton']);
  for (const id of ['visualFirstButton','visualLastButton']) {
    const tag=navMarkup.match(new RegExp(`<button[^>]+id="${id}"[^>]*>`))?.[0];assert.ok(tag);assert.match(tag,/type="button"/);assert.match(tag,/aria-label="[^"]+"/);
  }
  const h=setup();
  for (const [language,first,last] of [['en','First visible result','Last visible result'],['ja','表示中の最初の比較結果','表示中の最後の比較結果']]) {
    h.state.language=language;h.context.applyLanguage();
    assert.equal(h.get('#visualFirstButton').title,first);assert.equal(h.get('#visualFirstButton').getAttribute('aria-label'),first);
    assert.equal(h.get('#visualLastButton').title,last);assert.equal(h.get('#visualLastButton').getAttribute('aria-label'),last);
  }
});
test('responsive navigation owns a separate narrow-screen row with nonshrinking 44px buttons',()=>{
  const css=source.slice(source.indexOf('<style>'),source.indexOf('</style>'));
  const mobile=css.slice(css.indexOf('@media (max-width:760px)',css.indexOf('.visual-nav')));
  assert.match(mobile,/\.visual-nav\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(mobile,/\.visual-compare-head\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)\s*;/);
  assert.match(mobile,/\.visual-nav \.icon-button\s*\{[^}]*width:44px;[^}]*height:44px;/);
  assert.match(css,/\.visual-nav \.icon-button\s*\{[^}]*flex:\s*0 0 auto;/);
});
test('the report implementation stays byte-identical to the approved ownership base',()=>{
  const start=source.indexOf('      function captureReportContext()');
  const end=source.indexOf("      document.querySelectorAll('[data-diff-filter]').forEach(button");
  assert.ok(start>=0&&end>start);
  assert.equal(crypto.createHash('sha256').update(source.slice(start,end)).digest('hex'),'c01d5fdfb39aaeecdf915ccc55184235e59c542f919b08dd8a37997f1ffd57af');
});
