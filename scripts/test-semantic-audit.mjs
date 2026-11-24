import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';

// Exercise the production matcher/differ, not a reimplementation.
for (const target of ['src/index.template.html','dist/index.html','pptx-diff.html','dist/index.self-extract.html']) {
  let html=fs.readFileSync(target,'utf8');
  if(target.includes('self-extract')){
    const payload=html.match(/<script id="self-extract-payload" type="application\/octet-stream">([\s\S]*?)<\/script>/);
    assert.ok(payload,'self-extract payload');
    html=zlib.gunzipSync(Buffer.from(payload[1],'base64')).toString('utf8');
  }
  const from=html.indexOf('      function normalizeMatchText(');
  const until=html.indexOf('      async function analyze(',from);
  assert.ok(from>=0&&until>from, 'matcher source extraction');
  const ctx=vm.createContext({state:{layoutTolerance:'auto'},Map,Set,Intl});
  vm.runInContext(html.slice(from,until),ctx);

  const shape=(id,text='Example',props={})=>({
    id:String(id),name:'Object '+id,type:'shape',placeholder:'',text,
    x:100000,y:100000,width:600000,height:400000,rotation:0,shapePreset:'rect',
    formatting:{},detailSignature:'shape',resource:null,...props
  });
  const slide=(objects=[],props={})=>({
    id:'256',index:1,title:objects.find(o=>o.text)?.text||'',text:objects.filter(o=>o.text).map(o=>o.text),
    objects,notesText:'',backgroundSignature:'',slideWidth:12192000,slideHeight:6858000,...props
  });
  const compare=(a,b)=>ctx.attachSemanticDiff(ctx.matchSlides({slides:[a]},{slides:[b]}));
  const paired=(a,b)=>{const result=compare(a,b);assert.equal(result.rows.length,1);assert.equal(result.summary.added,0);assert.equal(result.summary.removed,0);return result.rows[0];};

  test(target+': identical blank slides are matched',()=>{
    const row=paired(slide(),slide());
    assert.equal(row.semanticChanged,false);
    assert.equal(row.reviewRequired,false);
  });
  test(target+': rewritten one-slide deck is conservatively paired for review',()=>{
    const row=paired(slide([shape(1,'Alpha Alpha Alpha')]),slide([shape(1,'Zulu Zulu Zulu')]));
    assert.equal(row.confidence,'low');
    assert.equal(row.reviewRequired,true);
    assert.equal(row.semantic.textChanges.length,1);
  });
  test(target+': shape kind change is not silently unchanged',()=>{
    const row=paired(slide([shape(1)]),slide([shape(1,'Example',{shapePreset:'ellipse'})]));
    assert.equal(row.reviewRequired,true);
    assert.ok(row.semantic.objectChanges.some(c=>c.review));
  });
  test(target+': same image bytes with new crop require review',()=>{
    const picture=detail=>shape(5,'',{type:'image',resource:{signature:'same:300',path:'ppt/media/image1.png'},detailSignature:detail});
    const row=paired(slide([picture('crop-a')]),slide([picture('crop-b')]));
    assert.equal(row.reviewRequired,true);
    assert.equal(row.semantic.imageChanges.length,1);
  });
  test(target+': identical image repositioning is layout-only',()=>{
    const picture=x=>shape(5,'',{type:'image',x,resource:{signature:'same:300',path:'ppt/media/image1.png'},detailSignature:'unchanged'});
    const row=paired(slide([picture(100000)]),slide([picture(200000)]));
    assert.equal(row.semantic.imageChanges.length,0);
    assert.equal(row.semantic.layoutChanges.length,1);
  });
  test(target+': reversing overlapping shape paint order requests review',()=>{
    const a=shape(1,'A'),b=shape(2,'B',{x:200000,y:200000});
    const row=paired(slide([a,b]),slide([b,a]));
    assert.equal(row.reviewRequired,true);
    assert.ok(row.semantic.objectChanges.length>=1);
  });
  test(target+': case and whitespace edits are meaningful',()=>{
    const row=paired(slide([shape(1,'API')]),slide([shape(1,'api')]));
    assert.equal(row.semantic.textChanges.length,1);
    assert.equal(row.semanticChanged,true);
  });
  test(target+': speaker note case changes are meaningful',()=>{
    const row=paired(slide([shape(1)],{notesText:'Important'}),slide([shape(1)],{notesText:'important'}));
    assert.equal(row.semantic.notesChanges.length,1);
  });
  test(target+': background edit requires review',()=>{
    const row=paired(slide([shape(1)],{backgroundSignature:'bg-red'}),slide([shape(1)],{backgroundSignature:'bg-blue'}));
    assert.equal(row.reviewRequired,true);
    assert.ok(row.semantic.objectChanges.length>=1);
  });
  test(target+': slide dimension edit produces layout diff',()=>{
    const row=paired(slide([shape(1)]),slide([shape(1)],{slideWidth:10000000}));
    assert.equal(row.semantic.layoutChanges.length,1);
    assert.equal(row.semantic.layoutChanges[0].changes[0].key,'slideWidth');
  });
  test(target+': report includes object changes in its summary',()=>{
    assert.match(html,/\['semanticObject',matching\.semanticSummary\.object\]/);
  });
  test(target+': reject oversized ZIP directory claims before extraction',()=>{
    const zipSource=html.slice(html.indexOf('      class PptxError extends Error'),html.indexOf('      async function readZipEntry('));
    const zipCtx=vm.createContext({TextDecoder,DataView,Uint8Array,Map});
    vm.runInContext(zipSource,zipCtx);
    const zip=new Uint8Array(22),view=new DataView(zip.buffer);
    view.setUint32(0,0x06054b50,true);
    view.setUint16(10,10001,true);
    assert.throws(()=>zipCtx.readZipDirectory(zip.buffer),e=>e.code==='pptxTooLarge');
  });
}
