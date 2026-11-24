import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import test from 'node:test';

const targets=['src/index.template.html','dist/index.html','pptx-diff.html','dist/index.self-extract.html'];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await tick();}throw Error('thumbnail did not settle');}
for(const target of targets){
  let html=fs.readFileSync(target,'utf8');
  if(target.endsWith('self-extract.html')){
    const payload=html.match(/<script id="self-extract-payload" type="application\/octet-stream">([\s\S]*?)<\/script>/);
    assert.ok(payload,target+' payload missing');
    html=zlib.gunzipSync(Buffer.from(payload[1],'base64')).toString('utf8');
  }
  function fn(name){
    const i=html.indexOf('      function '+name+'(');
    assert.ok(i>=0,target+': missing '+name);
    const j=html.indexOf('\n      }',i);
    assert.ok(j>i);
    return html.slice(i,j+8);
  }
  function setup({gate=null,renderer=null,fail=false}={}){
    const state={slots:{original:{file:null,generation:0,thumbnail:null},revised:{file:null,generation:0,thumbnail:null}},rendererModule:null};
    const reads=[],revoked=[],renders=[];
    const modelFor=file=>({filename:file.name,slides:[{slideWidth:12192000,slideHeight:6858000}],
      previewUrls:['blob:'+file.name],sourceBuffer:{source:file.name}});
    const context=vm.createContext({state,Map,DOMException,
      console:{warn(){}},
      renderFileSlot:slot=>renders.push(slot),
      parsePresentation:async(file,progress,guard,firstOnly)=>{
        reads.push({name:file.name,firstOnly});if(gate&&file.name==='older.pptx')await gate.promise;
        if(fail)throw Error('damaged archive');
        return modelFor(file);
      },
      loadHighFidelityRenderer:async()=>renderer,
      releaseModelUrls:models=>revoked.push(...(models.original?.previewUrls||[])),
      releaseRendererCache:cache=>cache?.clear()
    });
    vm.runInContext(['stopSlotThumbnailView','releaseSlotThumbnail','queueSlotThumbnail'].map(fn).join('\n'),context);
    return {state,context,reads,revoked,renders,modelFor};
  }
  const file=name=>({name,size:1024});
  test(target+': compact page and help content contract',()=>{
    assert.doesNotMatch(html,/id="heroTitle"/);
    assert.match(html,/class="page-intro"/);
    assert.match(html,/\.page-intro \.local-badge\s*\{\s*display:none;/);
    assert.match(html,/\.compare-settings\s*\{[^}]*border:0;/);
    const help=html.slice(html.indexOf('<!-- APP:HELP:BEGIN -->'),html.indexOf('<!-- APP:HELP:END -->'));
    assert.doesNotMatch(help,/Browser Kitty/);
    for(const key of ['scope1Title','scope1Body','scope2Title','scope2Body','scope3Title','scope3Body'])
      assert.match(help,new RegExp('data-i18n="'+key+'"'));
    assert.doesNotMatch(html,/<section class="shell section" aria-labelledby="scopeTitle"/);
    for(const slot of ['original','revised']){
      assert.equal((html.match(new RegExp('id="'+slot+'Thumbnail"','g'))||[]).length,1);
      assert.match(html,new RegExp('id="'+slot+'Thumbnail"[^>]*data-i18n-aria-label="thumbnailLabel"'));
    }
  });
  test(target+': selecting a file requests only the first slide',async()=>{
    const h=setup(),data=h.state.slots.original;data.file=file('first.pptx');data.generation++;
    h.context.queueSlotThumbnail('original');
    await until(()=>data.thumbnail?.pending===false);
    assert.deepEqual(h.reads,[{name:'first.pptx',firstOnly:true}]);
    assert.equal(data.thumbnail.model.filename,'first.pptx');
    assert.equal(data.thumbnail.model.sourceBuffer,null);
    assert.equal(data.thumbnail.error,false);
    assert.ok(h.renders.length>=2);
  });
  test(target+': replacement cannot publish an outdated thumbnail',async()=>{
    const gate=deferred(),h=setup({gate}),data=h.state.slots.original;
    data.file=file('older.pptx');data.generation++;
    h.context.queueSlotThumbnail('original');await until(()=>h.reads.length===1);
    h.context.releaseSlotThumbnail(data);
    data.file=file('newer.pptx');data.generation++;
    h.context.queueSlotThumbnail('original');await until(()=>data.thumbnail?.pending===false);
    gate.resolve();await until(()=>h.revoked.includes('blob:older.pptx'));
    assert.equal(data.thumbnail.model.filename,'newer.pptx');
    assert.ok(!h.revoked.includes('blob:newer.pptx'));
  });
  test(target+': swap invalidates pending original-slot work',async()=>{
    const gate=deferred(),h=setup({gate}),old=h.state.slots.original,newer=h.state.slots.revised;
    old.file=file('older.pptx');old.generation++;
    newer.file=file('newer.pptx');newer.generation++;
    h.context.queueSlotThumbnail('original');await until(()=>h.reads.length===1);
    h.context.releaseSlotThumbnail(old);
    h.state.slots.original=newer;h.state.slots.revised=old;
    newer.generation++;old.generation++;
    h.context.queueSlotThumbnail('original');await until(()=>newer.thumbnail?.pending===false);
    gate.resolve();await until(()=>h.revoked.includes('blob:older.pptx'));
    assert.equal(h.state.slots.original.thumbnail.model.filename,'newer.pptx');
  });
  test(target+': invalid PPTX keeps a clear placeholder state',async()=>{
    const h=setup({fail:true}),data=h.state.slots.original;data.file=file('bad.pptx');data.generation++;
    h.context.queueSlotThumbnail('original');await until(()=>data.thumbnail?.pending===false);
    assert.equal(data.thumbnail.error,true);assert.equal(data.thumbnail.model,null);
  });
  test(target+': renderer failure preserves the basic thumbnail',async()=>{
    const renderer={parseZip:async()=>{throw Error('unsupported graphics');},RECOMMENDED_ZIP_LIMITS:{}};
    const h=setup({renderer}),data=h.state.slots.original;data.file=file('simple.pptx');data.generation++;
    h.context.queueSlotThumbnail('original');await until(()=>data.thumbnail?.pending===false);
    assert.equal(data.thumbnail.error,false);
    assert.equal(data.thumbnail.model.filename,'simple.pptx');
    assert.equal(data.thumbnail.presentation,null);
  });
}
