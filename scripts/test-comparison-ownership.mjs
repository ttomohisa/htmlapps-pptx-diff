import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import zlib from 'node:zlib';

// Run the real application functions with tiny fictitious slides and explicit
// parser/renderer/DOM boundary doubles. This does not exercise browser rendering.
const path = process.argv[2] || 'src/index.template.html';
let source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
if (path.includes('self-extract')) {
  const payload = source.match(/<script id="self-extract-payload" type="application\/octet-stream">([\s\S]*?)<\/script>/);
  assert.ok(payload, 'standalone gzip payload');
  source = zlib.gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
}
function fn(name) {
  const match = source.match(new RegExp(`^      (?:async )?function ${name}\\(`, 'm'));
  if (!match) return ''; // Helpers introduced by the fix are absent in the red baseline.
  const start = match.index, end = source.indexOf('\n', start), first = source.slice(start, end);
  return first.trimEnd().endsWith('}') ? first : source.slice(start, source.indexOf('\n      }', end) + 8);
}
function listener(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
const stateCode = source.slice(source.indexOf('      const state = {'), source.indexOf('\n      };', source.indexOf('      const state = {')) + 9);
const matchingCode = source.slice(source.indexOf('      function normalizeMatchText('), source.indexOf('      async function analyze('));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise, resolve, reject}; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i=0;i<100;i++) { if (predicate()) return; await tick(); } throw new Error('boundary was not reached'); }
const file = (name, title=name) => ({name:`${name}.pptx`, title, size:1});
function slide(title,index=1) { return {index,id:String(256+index),title,text:[title],notesText:'',objects:[{id:'1',name:'Title',type:'shape',placeholder:'title',text:title,x:0,y:0,width:1000000,height:500000,rotation:0,formatting:{}}]}; }
function setup() {
  const nodes=new Map(), downloads=[], toasts=[], revoked=[], renderCalls=[], parsed=[], parseGates=new Map(), renderGates=new Map(), snapshotGates=new Map(), files=new Map();
  let serial=0;
  function node(selector) { if(!nodes.has(selector)) nodes.set(selector,{hidden:false,disabled:false,textContent:'',dataset:{},attributes:{},style:{},classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},focus(){},scrollIntoView(){},append(){},remove(){this.removed=true;},addEventListener(type,fn){this[type]=fn;}}); return nodes.get(selector); }
  const renderer={
    parseZip:async buffer=>{if(renderGates.has(buffer)) await renderGates.get(buffer).promise;return {name:buffer};},
    buildPresentation:({name})=>({name,slides:(files.get(name)?.slides||[slide(files.get(name)?.title||name)])}),
    renderSlide(presentation,rendererSlide,options){
      const key=`${presentation.name}:${rendererSlide.title}`, gate=snapshotGates.get(key), cache=options.mediaUrlCache;
      cache.set(key,`blob:snapshot-${++serial}`);
      const handle={element:{style:{width:'960px',height:'540px'},cloneNode:()=>({outerHTML:`<span>snapshot:${key}</span>`})},ready:gate?.promise||Promise.resolve(),dispose(){this.disposed=true;}};
      renderCalls.push({presentation,rendererSlide,cache,handle}); return handle;
    }
  };
  const context=vm.createContext({console:{warn(){},error(){}},Map,Set,Intl,Date,TextDecoder,Uint16Array,DOMException,Blob,Response,URL:{revokeObjectURL:url=>revoked.push(url)},setTimeout,clearTimeout,structuredClone,CompressionStream:undefined,
    detectLanguage:()=> 'en', $:node, translations:{en:{reportTitle:'Comparison report'},ja:{reportTitle:'比較レポート'}},
    document:{querySelector:selector=>selector==='link[rel~="icon"]'?{href:'data:image/svg+xml,fake'}:node(selector),querySelectorAll:()=>[],createElement:()=>node(`element-${++serial}`),body:{append(){}}},
    t:key=>key,formatBytes:String,AppToast:{show:value=>toasts.push(value)},matchMedia:()=>({matches:true}),renderResults(){},renderMatching(){},renderVisualCompare(){},
    loadHighFidelityRenderer:async()=>renderer,
    parsePresentation:async(f,progress)=>{files.set(f.name,f); if(parseGates.has(f.name)) await parseGates.get(f.name).promise; const model={filename:f.name,sourceBuffer:f.name,slides:f.slides||[slide(f.title)],slideCount:1,previewUrls:[`blob:model-${f.name}-${++serial}`]};parsed.push(model);progress(1,1);return model;},
    showAppConfirmDialog:async()=>true,downloadBlobFile:(blob,name)=>downloads.push({blob,name}),waitForReportCharts:async()=>{},reportInlineComputedStyles(){},reportInlineBlobReferences:async()=>{},
    PptxError:class PptxError extends Error{}
  });
  const names=['t','setStatus','setPhase','updateReadyState','renderFileSlot','acceptFile','releaseModelUrls','disposeVisualRenderHandles','clearRendererCache','releaseRendererCache','resetComparison','updateReportState','invalidateReport','captureReportContext','guardReport','prepareHighFidelityPresentation','analyze','rowMatchesFilter','selectedVisualRow','visibleVisualRows','visualRowIndex','syncMatchSelection','selectVisualPair','navigateVisual','statusDescriptor','reportEscape','reportDiffText','reportStatus','reportFaviconHref','renderedSize','reportHighFidelitySnapshot','buildReportPreviewSnapshots','reportPreviewMarkup','reportPropertyLabel','reportPropertyValue','mixedValue','displayPropertyValue','reportChangeBlocks','createReportHtml','gzipReportHtml','bytesToBase64','createSelfExtractingReportHtml','buildDownloadableReportHtml'];
  vm.runInContext(stateCode+'\n'+matchingCode+'\n'+names.map(fn).join('\n')+'\n'+listener("      $('#saveReportButton').addEventListener('click',async()=>{", "      document.querySelectorAll('[data-diff-filter]')")+'\n'+listener("      $('#swapButton').addEventListener('click',()=>{", '      class PptxError')+'\n'+listener("      $('#layoutTolerance').addEventListener('change'", "      $('#languageButton')"),context);
  const state=vm.runInContext('state',context); state.rendererModule=renderer;
  return {context,state,node,downloads,toasts,revoked,renderCalls,parsed,parseGates,renderGates,snapshotGates};
}
async function initial(h) { h.context.acceptFile('original',file('Original-A','Alpha'));h.context.acceptFile('revised',file('Revised-R','Beta'));await h.context.analyze();assert.equal(h.state.phase,'result'); }
function assertReady(h) { assert.equal(h.state.reportBusy,false);assert.equal(h.node('#saveReportSpinner').hidden,true);assert.equal(h.node('#saveReportButton').attributes['aria-busy'],undefined);assert.equal(h.node('#saveReportButton').disabled,false); }

test('late renderer success cannot overwrite the replacement comparison or caches',async()=>{
  const h=setup(),gate=deferred();h.renderGates.set('Original-A.pptx',gate);
  h.context.acceptFile('original',file('Original-A'));h.context.acceptFile('revised',file('Revised-R'));
  const old=h.context.analyze();await tick();h.context.acceptFile('original',file('Original-B'));await h.context.analyze();
  h.state.rendererMediaCaches.original.set('new','blob:current');gate.resolve();await old;
  assert.equal(h.state.models.original.filename,'Original-B.pptx');assert.equal(h.state.rendererPresentations.original.name,'Original-B.pptx');assert.equal(h.state.rendererMediaCaches.original.get('new'),'blob:current');
  assert.ok(h.parsed.filter(m=>m.filename==='Original-A.pptx').every(m=>h.revoked.includes(m.previewUrls[0])));
});
for(const failure of [false,true]) test(`stale renderer ${failure?'failure':'success'} cannot clear a successor busy indicator`,async()=>{
  const h=setup(),a=deferred(),b=deferred();h.renderGates.set('Original-A.pptx',a);h.renderGates.set('Original-B.pptx',b);
  h.context.acceptFile('original',file('Original-A'));h.context.acceptFile('revised',file('Revised-R'));const old=h.context.analyze();await tick();
  h.context.acceptFile('original',file('Original-B'));const current=h.context.analyze();await tick();failure?a.reject(new Error('old renderer failed')):a.resolve();await old;
  assert.equal(h.state.phase,'processing');assert.equal(h.node('#analyzeSpinner').hidden,false);assert.equal(h.node('#workspace').attributes['aria-busy'],'true');b.resolve();await current;assert.equal(h.state.phase,'result');
});
test('late parser failure and progress cannot replace a newer result',async()=>{
  const h=setup(),gate=deferred();h.parseGates.set('Original-A.pptx',gate);h.context.acceptFile('original',file('Original-A'));h.context.acceptFile('revised',file('Revised-R'));const old=h.context.analyze();await tick();h.context.acceptFile('original',file('Original-B'));await h.context.analyze();gate.reject(new Error('old parser failed'));await old;
  assert.equal(h.state.phase,'result');assert.equal(h.state.models.original.filename,'Original-B.pptx');assert.equal(h.node('#analysisStatus').textContent,'statusDone');
});
test('replacement clears old busy UI even without starting another analysis',async()=>{
  const h=setup(),gate=deferred();h.renderGates.set('Original-A.pptx',gate);h.context.acceptFile('original',file('Original-A'));h.context.acceptFile('revised',file('Revised-R'));const old=h.context.analyze();await tick();h.context.acceptFile('original',file('Original-B'));
  assert.equal(h.node('#analyzeSpinner').hidden,true);assert.equal(h.node('#workspace').attributes['aria-busy'],undefined);assert.equal(h.node('#saveReportButton').disabled,true);gate.resolve();await old;assert.equal(h.state.phase,'ready');
});
test('current analysis failure releases earlier parsed models and permits retry',async()=>{
  const h=setup(),gate=deferred();h.parseGates.set('Revised-R.pptx',gate);h.context.acceptFile('original',file('Original-A'));h.context.acceptFile('revised',file('Revised-R'));const run=h.context.analyze();await tick();gate.reject(new Error('parser failed'));await run;
  assert.equal(h.state.phase,'error');assert.ok(h.revoked.includes(h.parsed[0].previewUrls[0]));assert.equal(h.node('#saveReportButton').disabled,true);h.parseGates.clear();await h.context.analyze();assert.equal(h.state.phase,'result');assert.equal(h.node('#analyzeSpinner').hidden,true);
});
test('renderer failure retains current structural comparison fallback',async()=>{
  const h=setup();h.context.loadHighFidelityRenderer=async()=>({parseZip:async()=>{throw new Error('renderer unavailable');}});await initial(h);assert.equal(h.state.rendererPresentations.original,null);assert.equal(h.state.matching.rows.length,2);
});
for(const mutation of ['replace','swap','reanalyze','tolerance']) test(`report snapshot interrupted by ${mutation} produces no download`,async()=>{
  const h=setup();await initial(h);const gate=deferred();h.snapshotGates.set('Original-A.pptx:Alpha',gate);const saving=h.node('#saveReportButton').click();await until(()=>h.renderCalls.length===1);
  if(mutation==='replace') h.context.acceptFile('original',file('Original-B','Gamma'));
  if(mutation==='swap') h.node('#swapButton').click();
  if(mutation==='reanalyze') await h.context.analyze();
  if(mutation==='tolerance') h.node('#layoutTolerance').change({target:{value:'strict'}});
  gate.resolve();await saving;assert.equal(h.downloads.length,0);assert.equal(h.renderCalls.length,1);assert.equal(h.renderCalls[0].handle.disposed,true);assert.equal(h.toasts.some(t=>t.message==='reportSaved'||t.message==='reportFailed'),false);
});
test('replacement while confirmation is pending cancels the captured report',async()=>{
  const h=setup();await initial(h);const gate=deferred();h.context.showAppConfirmDialog=()=>gate.promise;const saving=h.node('#saveReportButton').click();h.context.acceptFile('original',file('Original-B'));await h.context.analyze();gate.resolve(true);await saving;assert.equal(h.downloads.length,0);assert.equal(h.renderCalls.length,0);assertReady(h);
});
test('cancelling confirmation and repeated save clicks do not start report work',async()=>{
  const h=setup();await initial(h);const gate=deferred();let confirmations=0;h.context.showAppConfirmDialog=()=>{confirmations++;return gate.promise;};const a=h.node('#saveReportButton').click(),b=h.node('#saveReportButton').click();assert.equal(confirmations,1);gate.resolve(false);await Promise.all([a,b]);assert.equal(h.downloads.length,0);assert.equal(h.renderCalls.length,0);assertReady(h);
});
test('replacement during report compression is checked before download',async()=>{
  const h=setup();await initial(h);const gate=deferred();h.context.gzipReportHtml=()=>gate.promise;const saving=h.node('#saveReportButton').click();await until(()=>h.renderCalls.length===2);await tick();h.context.acceptFile('original',file('Original-B'));await h.context.analyze();gate.resolve(null);await saving;assert.equal(h.downloads.length,0);assertReady(h);
});
test('old report cleanup cannot clear a newer report busy state or media cache',async()=>{
  const h=setup();await initial(h);const a=deferred(),b=deferred();h.snapshotGates.set('Original-A.pptx:Alpha',a);const old=h.node('#saveReportButton').click();await until(()=>h.renderCalls.length===1);h.context.acceptFile('original',file('Original-B','Gamma'));await h.context.analyze();assert.equal(h.state.reportBusy,false,'replacement must release the old report owner');h.snapshotGates.set('Original-B.pptx:Gamma',b);const current=h.node('#saveReportButton').click();await until(()=>h.renderCalls.length===2);const currentCache=h.renderCalls[1].cache;a.resolve();await old;
  assert.equal(h.state.reportBusy,true);assert.equal(h.node('#saveReportSpinner').hidden,false);assert.equal(h.node('#saveReportButton').attributes['aria-busy'],'true');assert.equal(currentCache.size,1);assert.notEqual(h.renderCalls[0].cache,currentCache);b.resolve();await current;assert.equal(h.downloads.length,1);assertReady(h);
});
test('current report failure resets busy controls and permits retry',async()=>{
  const h=setup();await initial(h);h.context.gzipReportHtml=async()=>{throw new Error('compression failed');};await h.node('#saveReportButton').click();assert.equal(h.downloads.length,0);assertReady(h);h.context.gzipReportHtml=async()=>null;await h.node('#saveReportButton').click();assert.equal(h.downloads.length,1);assertReady(h);assert.ok(h.renderCalls.every(c=>c.handle.disposed));
});
test('normal report freezes language, filenames and all rows despite view filters',async()=>{
  const h=setup();await initial(h);h.state.matching=h.context.attachSemanticDiff(h.context.matchSlides({slides:[slide('First',1),slide('Count 10',2)]},{slides:[slide('First',1),slide('Count 20',2)]}));h.state.rendererPresentations.original.slides=[slide('First',1),slide('Count 10',2)];h.state.rendererPresentations.revised.slides=[slide('First',1),slide('Count 20',2)];h.state.changedOnly=true;h.state.diffFilter='number';const gate=deferred();h.context.gzipReportHtml=()=>gate.promise;const saving=h.node('#saveReportButton').click();await until(()=>h.renderCalls.length===4);h.state.language='ja';gate.resolve(null);await saving;
  const html=await h.downloads[0].blob.text();assert.ok(html.includes('Original-A.pptx'));assert.ok(html.includes('Revised-R.pptx'));assert.equal((html.match(/<details class="slide" open>/g)||[]).length,2);assert.ok(html.includes('<html lang="en">'));assert.equal(h.downloads[0].name,'pptx-diff-report.html');assertReady(h);
});
test('matching, number filter, changed-only and bounded navigation remain unchanged',()=>{
  const h=setup();const a={slides:[slide('Opening',1),slide('Budget 10',2),slide('Closing',3)]},b={slides:[slide('Opening',1),slide('Budget 20',2),slide('Closing',3)]};const matching=h.context.attachSemanticDiff(h.context.matchSlides(a,b));h.state.matching=matching;h.context.navigateVisual(1);assert.equal(h.context.selectedVisualRow(matching).revised.index,2);h.state.diffFilter='number';assert.equal(h.context.visibleVisualRows(matching).length,1);h.context.navigateVisual(1);assert.equal(h.context.selectedVisualRow(matching).revised.index,2);h.state.changedOnly=true;h.state.diffFilter='all';assert.equal(h.context.visibleVisualRows(matching).length,1);
});

test('visual pane retains its existing current-renderer lookup',async()=>{
  const h=setup();await initial(h);vm.runInContext(fn('hydrateHighFidelityPane'),h.context);
  await h.context.hydrateHighFidelityPane({isConnected:false},'original',slide('Alpha'),[],h.state.visualRenderGeneration);
});
test('cancelled current analysis clears processing and permits retry',async()=>{
  const h=setup();h.context.acceptFile('original',file('Original-A'));h.context.acceptFile('revised',file('Revised-R'));const parser=h.context.parsePresentation;h.context.parsePresentation=async()=>{throw new DOMException('cancelled','AbortError');};await h.context.analyze();assert.equal(h.state.phase,'ready');assert.equal(h.node('#analyzeSpinner').hidden,true);assert.equal(h.node('#analyzeButton').disabled,false);h.context.parsePresentation=parser;await h.context.analyze();assert.equal(h.state.phase,'result');
});
test('report context owns semantic data and filenames after global mutation',async()=>{
  const h=setup();await initial(h);const captured=h.context.captureReportContext();h.state.models.original.filename='changed.pptx';h.state.matching.rows.length=0;h.state.language='ja';const html=h.context.createReportHtml(new Map(),captured);assert.ok(html.includes('Original-A.pptx'));assert.ok(html.includes('<title>Comparison report</title>'));assert.ok(html.includes('<details class="slide" open>'));assert.ok(html.includes('<html lang="en">'));
});
test('image preview failure releases URLs created before the failed read',async()=>{
  const h=setup(),created=[];let count=0;h.context.URL.createObjectURL=()=>{const url=`blob:image-${++count}`;created.push(url);return url;};h.context.readZipEntry=async(zip,path)=>{if(path==='second.png')throw new Error('read failed');return new Uint8Array([1]);};vm.runInContext(fn('imageMimeType')+'\n'+fn('hydrateImagePreviews'),h.context);
  await assert.rejects(h.context.hydrateImagePreviews([{objects:[{type:'image',resource:{path:'first.png'}},{type:'image',resource:{path:'second.png'}}]}],{},()=>{}),/read failed/);assert.equal(created.length,1);assert.ok(h.revoked.includes(created[0]));
});

test('compressed report wrapper and payload retain the captured language',async()=>{
  const h=setup();await initial(h);h.context.CompressionStream=CompressionStream;h.context.btoa=btoa;const gzip=h.context.gzipReportHtml,gate=deferred();let compressing=false;h.context.gzipReportHtml=async html=>{compressing=true;await gate.promise;return gzip(html);};const saving=h.node('#saveReportButton').click();await until(()=>compressing);h.state.language='ja';gate.resolve();await saving;
  assert.equal(h.downloads.length,1);const wrapper=await h.downloads[0].blob.text();assert.ok(wrapper.includes('<html lang="en">'));const payload=wrapper.match(/<script id="payload" type="application\/octet-stream">([\s\S]*?)<\/script>/);assert.ok(payload);const report=zlib.gunzipSync(Buffer.from(payload[1],'base64')).toString();assert.ok(report.includes('<html lang="en">'));assert.ok(report.includes('<title>Comparison report</title>'));assert.ok(report.includes('snapshot:Original-A.pptx:Alpha'));assertReady(h);
});
test('replacement during media embedding retires report and releases its own cache',async()=>{
  const h=setup();await initial(h);const gate=deferred();let embedding=false;h.context.reportInlineBlobReferences=async()=>{embedding=true;await gate.promise;};const saving=h.node('#saveReportButton').click();await until(()=>embedding);const cache=h.renderCalls[0].cache,urls=[...cache.values()];h.context.acceptFile('original',file('Original-B'));gate.resolve();await saving;assert.equal(h.downloads.length,0);assert.equal(cache.size,0);assert.ok(urls.every(url=>h.revoked.includes(url)));assert.ok(h.renderCalls[0].handle.disposed);
});
test('late snapshot failure does not report an error for the replacement',async()=>{
  const h=setup();await initial(h);const gate=deferred();h.snapshotGates.set('Original-A.pptx:Alpha',gate);const saving=h.node('#saveReportButton').click();await until(()=>h.renderCalls.length);h.context.acceptFile('original',file('Original-B'));await h.context.analyze();gate.reject(new Error('old snapshot failed'));await saving;assert.equal(h.downloads.length,0);assert.equal(h.toasts.some(t=>t.message==='reportFailed'),false);assertReady(h);
});
test('empty selection and invalid extension preserve the current comparison',async()=>{
  const h=setup();await initial(h);const models=h.state.models,generation=h.state.runGeneration;h.context.acceptFile('original',null);h.context.acceptFile('original',{name:'notes.txt',size:1});assert.equal(h.state.models,models);assert.equal(h.state.runGeneration,generation);assert.equal(h.state.phase,'result');assert.equal(h.toasts.at(-1).message,'invalidType');
});
test('source invalidation during image hydration releases earlier image URLs',async()=>{
  const h=setup(),gate=deferred();let stale=false,count=0;h.context.URL.createObjectURL=()=>`blob:image-${++count}`;h.context.readZipEntry=async(zip,path)=>path==='second.png'?gate.promise:new Uint8Array([1]);vm.runInContext(fn('imageMimeType')+'\n'+fn('hydrateImagePreviews'),h.context);
  const hydrating=h.context.hydrateImagePreviews([{objects:[{type:'image',resource:{path:'first.png'}},{type:'image',resource:{path:'second.png'}}]}],{},()=>{if(stale)throw new DOMException('stale','AbortError');});await until(()=>count===1);stale=true;gate.resolve(new Uint8Array([2]));await assert.rejects(hydrating,{name:'AbortError'});assert.ok(h.revoked.includes('blob:image-1'));assert.equal(count,1);
});

for(const replacement of [true,false]) test(`late visual media cleanup ${replacement?'releases retired cache':'preserves current-source cache'}`,async()=>{
  const h=setup();await initial(h);const gate=deferred();h.snapshotGates.set('Original-A.pptx:Alpha',gate);h.context.createHighlightOverlay=()=>({});h.context.requestAnimationFrame=()=>1;vm.runInContext(fn('hydrateHighFidelityPane'),h.context);
  const rendering=h.context.hydrateHighFidelityPane({isConnected:true,replaceChildren(){}},'original',slide('Alpha'),[],h.state.visualRenderGeneration);await until(()=>h.renderCalls.length===1);const cache=h.renderCalls[0].cache;
  if(replacement)h.context.acceptFile('original',file('Original-B'));else h.state.visualRenderGeneration++;
  // Mirrors the pinned renderer's non-abortable EMF toBlob callback.
  cache.set('late','blob:late-visual');gate.resolve();await rendering;
  assert.equal(cache.has('late'),!replacement);assert.equal(h.revoked.includes('blob:late-visual'),replacement);assert.equal(h.renderCalls[0].handle.disposed,true);
});
