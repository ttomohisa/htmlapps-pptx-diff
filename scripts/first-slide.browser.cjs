'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');

function crc32(data) {
  let value=0xffffffff;
  for(const b of data) {
    value^=b;
    for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);
  }
  return (value^0xffffffff)>>>0;
}
function makeZip(parts) {
  const local=[],central=[];let offset=0,centralSize=0;
  for(const [name,xml] of Object.entries(parts)) {
    const fileName=Buffer.from(name),body=Buffer.from(xml),crc=crc32(body);
    const head=Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);
    head.writeUInt32LE(crc,14);head.writeUInt32LE(body.length,18);head.writeUInt32LE(body.length,22);
    head.writeUInt16LE(fileName.length,26);
    local.push(head,fileName,body);
    const dir=Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);
    dir.writeUInt32LE(crc,16);dir.writeUInt32LE(body.length,20);dir.writeUInt32LE(body.length,24);
    dir.writeUInt16LE(fileName.length,28);dir.writeUInt32LE(offset,42);
    central.push(dir,fileName);
    offset+=head.length+fileName.length+body.length;
    centralSize+=dir.length+fileName.length;
  }
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(Object.keys(parts).length,8);end.writeUInt16LE(Object.keys(parts).length,10);
  end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,...central,end]);
}
function slideXml(text) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
 <p:cSld><p:spTree>
  <p:nvGrpSpPr><p:cNvPr id="1" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
  <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
   <p:spPr><a:xfrm><a:off x="600000" y="600000"/><a:ext cx="7900000" cy="1100000"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
   <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3000"/>
    <a:t>${text}</a:t></a:r></a:p></p:txBody>
  </p:sp>
 </p:spTree></p:cSld>
</p:sld>`;
}
function pptx(firstLabel,secondLabel='NOT_THE_FIRST_SLIDE') {
  const relNamespace='http://schemas.openxmlformats.org/package/2006/relationships';
  const slideType='http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
  return makeZip({
    '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>',
    '_rels/.rels':'<Relationships xmlns="'+relNamespace+'"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
    'ppt/presentation.xml':'<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>',
    'ppt/_rels/presentation.xml.rels':'<Relationships xmlns="'+relNamespace+'"><Relationship Id="rId1" Type="'+slideType+'" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="'+slideType+'" Target="slides/slide2.xml"/></Relationships>',
    'ppt/slides/slide1.xml':slideXml(firstLabel),
    'ppt/slides/slide2.xml':slideXml(secondLabel)
  });
}
async function expectThumbnail(page,slot) {
  const host=page.locator('#'+slot+'Thumbnail');
  await page.waitForFunction(side=>{
    const element=document.querySelector('#'+side+'Thumbnail');
    return element?.querySelector('.slide-canvas,.pptx-render-frame');
  },slot,{timeout:15000});
  const rect=await host.boundingBox();
  assert.ok(rect&&rect.width>=95&&rect.height>=55,slot+' preview dimensions');
  assert.equal(await host.locator('.file-thumbnail-message').count(),0,slot+' left loading state');
  assert.ok(!((await host.innerText()).includes('NOT_THE_FIRST_SLIDE')),slot+' uses the first slide');
}
async function main(){
  const browser=await chromium.launch();
  try{
    for(const [width,lang]of [[360,'ja'],[1280,'en']]){
      const context=await browser.newContext({viewport:{width,height:820},locale:lang});
      const page=await context.newPage(),issues=[],requests=[];
      page.on('pageerror',e=>issues.push(e.message));
      page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
      try{
        await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
        await page.locator('#languageButton').waitFor();
        if(await page.locator('html').getAttribute('lang')!==lang)await page.locator('#languageButton').click();
        const preview=async(slot,name,label)=>page.locator('#'+slot+'Input').setInputFiles({
          name,mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:pptx(label)
        });
        await preview('original','first.pptx','FIRST_SLIDE_ALPHA');
        await expectThumbnail(page,'original');
        await preview('revised','second.pptx','FIRST_SLIDE_BETA');
        await expectThumbnail(page,'revised');
        assert.equal(await page.locator('#analyzeButton').isEnabled(),true);
        await page.locator('#swapButton').click();
        assert.equal(await page.locator('#originalName').innerText(),'second.pptx');
        assert.equal(await page.locator('#revisedName').innerText(),'first.pptx');
        await expectThumbnail(page,'original');await expectThumbnail(page,'revised');
        await preview('original','third.pptx','FIRST_SLIDE_GAMMA');
        await expectThumbnail(page,'original');
        assert.equal(await page.locator('#originalName').innerText(),'third.pptx');
        // Compare actual local fixture PPTX files, then exercise the result UI.
        await page.locator('#analyzeButton').click();
        await page.locator('#resultSection').waitFor({state:'visible',timeout:30000});
        assert.equal(await page.locator('#matchSummary .match-summary-item').count(),5);
        assert.equal(await page.locator('#semanticSummary .semantic-summary-item').count(),7);
        assert.equal(await page.locator('#changeBreakdownTitle').innerText(),lang==='ja'?'変更内訳':'Change breakdown');
        assert.equal(await page.locator('.change-breakdown').count(),1);
        assert.equal(await page.locator('#semanticSummary [role="listitem"]').count(),7);
        assert.equal(await page.locator('#matchSummary').getAttribute('aria-label'),lang==='ja'?'スライドの集計':'Slide summary');
        // Search combines with the current slide filters, without sending data to a server.
        const search=page.locator('#slideSearch');
        await search.fill('NEVER_PRESENT_IN_SLIDES');
        await page.waitForFunction(()=>document.querySelector('#diffEmpty')&&!document.querySelector('#diffEmpty').hidden);
        assert.equal(await page.locator('#searchResultCount').innerText(),lang==='ja'?'0枚のスライド':'0 slides');
        await search.fill('FIRST_SLIDE_GAMMA');
        await page.waitForFunction(()=>document.querySelector('#matchList .match-row')&&!document.querySelector('#matchList').hidden);
        assert.equal(await page.locator('#matchList .match-row').count(),1);
        await search.fill('');
        await page.waitForFunction(()=>document.querySelector('#searchResultCount')?.textContent==='' &&
          document.querySelector('#matchList .match-row')&&!document.querySelector('#matchList').hidden);
        const filterCount=await page.locator('[data-filter-count="all"]').innerText();
        assert.match(filterCount,lang==='ja'?/枚/:/slides/,'filter counts represent slides');
        const unit=await page.locator('#semanticSummary .semantic-summary-unit').first().innerText();
        assert.equal(unit,lang==='ja'?'件':'items','semantic counters represent changed elements');

        const firstThumb=page.locator('#matchList .match-thumb[data-thumb-pending]').first();
        if(await firstThumb.count()){
          await firstThumb.scrollIntoViewIfNeeded();
          await page.waitForFunction(()=>document.querySelectorAll('#matchList .match-thumb .slide-canvas').length>0,{timeout:15000});
        }
        const firstDetails=page.locator('#matchList .semantic-details').first();
        assert.ok(await firstDetails.count(),'at least one slide has a change');
        await firstDetails.evaluate(el=>{el.open=true;});
        const inspect=firstDetails.locator('.change-inspect-button').first();
        assert.ok(await inspect.count(),'changes have a preview action');
        await inspect.click();
        await page.locator('#visualCompare').waitFor({state:'visible'});
        await page.waitForFunction(()=>document.querySelectorAll('#visualCompare [data-visual-entry-id].is-active').length>0,{timeout:5000});
        assert.equal(await page.locator('#visualHighlightToggle').getAttribute('aria-pressed'),'true');

        // Navigation stays beside the slide instead of at the distant section heading.
        const stageBox=await page.locator('#visualStageViewport').boundingBox();
        const navBox=await page.locator('#visualCompare .visual-nav').boundingBox();
        assert.ok(stageBox&&navBox&&navBox.y>=stageBox.y+stageBox.height-1&&navBox.y<=stageBox.y+stageBox.height+48,'slide navigation is immediately below the viewport');

        // Zoom is a single segmented control: minus / clickable percentage / plus.
        const zoomValue=page.locator('#visualZoomValue');
        assert.equal(await page.locator('.visual-zoom-actions > button').count(),3);
        assert.equal(await zoomValue.getAttribute('aria-label'),lang==='ja'?'100%に戻す':'Reset to 100%');
        assert.equal(await zoomValue.innerText(),'100%');
        assert.equal(await page.locator('.visual-zoom-actions').evaluate(el=>getComputedStyle(el).gap),'0px');
        await page.locator('#visualZoomIn').click();
        assert.equal(await zoomValue.innerText(),'125%');
        assert.equal(await page.locator('#visualCompareStage').evaluate(el=>el.style.width),'125%');
        await zoomValue.click();
        assert.equal(await zoomValue.innerText(),'100%');
        assert.equal(await page.locator('#visualCompareStage').evaluate(el=>el.style.width),'100%');
        await page.locator('#visualZoomOut').click();
        assert.equal(await zoomValue.innerText(),'75%');
        await page.locator('#visualZoomIn').click();
        assert.equal(await zoomValue.innerText(),'100%');
        assert.equal(await page.locator('#visualZoomReset').count(),0);

        const modeControls=page.locator('[data-visual-mode]');
        assert.equal(await modeControls.count(),4);
        assert.equal(await modeControls.locator('svg').count(),4);
        for(const mode of ['side','overlay','split','blink']){
          const button=page.locator('[data-visual-mode="'+mode+'"]');
          await button.click();
          assert.equal(await button.getAttribute('aria-pressed'),'true',mode+' selected');
          assert.ok((await page.locator('#visualModeDescription').innerText()).length>15,'mode explains its behavior');
          assert.equal(await page.locator('[data-visual-mode][aria-pressed="true"]').count(),1,'only one active mode');
          await page.locator('#visualCompareStage .visual-stack[data-mode="'+mode+'"]').waitFor({state:'attached'});
        }
        const toggle=page.locator('#visualHighlightToggle');
        const label=lang==='ja'?'差分を表示':'Show differences';
        assert.equal(await page.locator('#visualHighlightToggleLabel').innerText(),label);
        assert.equal(await toggle.getAttribute('aria-pressed'),'true');
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-pressed'),'false');
        assert.equal(await page.locator('#visualHighlightToggleLabel').innerText(),label);
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-pressed'),'true');
        if(width===360){
          assert.equal(await page.locator('.visual-modes').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
        }
        await page.screenshot({path:path.resolve('test-results/mobile-layout','comparison-'+lang+'-'+width+'.png')});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll');
        await page.locator('#originalInput').setInputFiles({name:'broken.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:Buffer.from('bad pptx')});
        await page.waitForFunction(side=>document.querySelector('#'+side+'Thumbnail')?.textContent?.includes(
          document.documentElement.lang==='ja'?'プレビューを表示できません':'Preview unavailable'),'original',{timeout:15000});
        assert.deepEqual(issues,[],lang+': runtime errors');
        assert.deepEqual(requests,[],lang+': runtime HTTP requests');
        console.log('PASS first-slide previews: '+lang+' '+width+'px');
      }finally{await context.close();}
    }
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
