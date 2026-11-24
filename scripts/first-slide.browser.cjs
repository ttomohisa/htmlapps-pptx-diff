'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const {inflateSync}=require('node:zlib');

// Sample actual Chromium pixels. Checking only .pptx-render-frame presence
// does not catch a white structural fallback or a wrongly scaled render.
function screenshotPixel(png,xFraction=.78,yFraction=.76){
  let offset=8,width=0,height=0,colorType=0,bitDepth=0;const compressed=[];
  while(offset+12<=png.length){
    const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);
    const data=png.subarray(offset+8,offset+8+length);offset+=12+length;
    if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);bitDepth=data[8];colorType=data[9];}
    if(type==='IDAT')compressed.push(data);
    if(type==='IEND')break;
  }
  assert.equal(bitDepth,8,'screenshot uses 8-bit PNG');
  assert.ok(colorType===2||colorType===6,'screenshot uses RGB(A) PNG');
  const channels=colorType===6?4:3,stride=width*channels;
  const source=inflateSync(Buffer.concat(compressed));
  const x=Math.floor(width*xFraction),y=Math.floor(height*yFraction);
  let pos=0,previous=Buffer.alloc(stride),current=Buffer.alloc(stride);
  for(let line=0;line<=y;line++){
    const filter=source[pos++];
    for(let i=0;i<stride;i++){
      const raw=source[pos++],left=i>=channels?current[i-channels]:0,up=previous[i],ul=i>=channels?previous[i-channels]:0;
      let predictor=0;
      if(filter===1)predictor=left;
      else if(filter===2)predictor=up;
      else if(filter===3)predictor=Math.floor((left+up)/2);
      else if(filter===4){
        const p=left+up-ul,dl=Math.abs(p-left),du=Math.abs(p-up),dul=Math.abs(p-ul);
        predictor=dl<=du&&dl<=dul?left:du<=dul?up:ul;
      }else assert.equal(filter,0,'supported PNG scanline filter');
      current[i]=(raw+predictor)&255;
    }
    if(line!==y){[current,previous]=[previous,current];}
  }
  return [...current.subarray(x*channels,x*channels+3)];
}


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
 <p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="15595C"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>
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
  const parts={
    '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>',
    '_rels/.rels':'<Relationships xmlns="'+relNamespace+'"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
    'ppt/presentation.xml':'<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>',
    'ppt/_rels/presentation.xml.rels':'<Relationships xmlns="'+relNamespace+'"><Relationship Id="rId1" Type="'+slideType+'" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="'+slideType+'" Target="slides/slide2.xml"/></Relationships>',
    'ppt/slides/slide1.xml':slideXml(firstLabel),
    'ppt/slides/slide2.xml':slideXml(secondLabel)
  };
  if(secondLabel===null){
    delete parts['ppt/slides/slide2.xml'];
    parts['[Content_Types].xml']=parts['[Content_Types].xml'].replace(/<Override PartName="\/ppt\/slides\/slide2\.xml"[^>]*\/>/,'');
    parts['ppt/presentation.xml']=parts['ppt/presentation.xml'].replace('<p:sldId id="257" r:id="rId2"/>','');
    parts['ppt/_rels/presentation.xml.rels']=parts['ppt/_rels/presentation.xml.rels'].replace('<Relationship Id="rId2" Type="'+slideType+'" Target="slides/slide2.xml"/>','');
  }
  return makeZip(parts);
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
        assert.equal(await page.locator('.page-intro').isVisible(),true,'initial intro is visible before selecting files');
        assert.equal(await page.locator('.drop-zone-note,[data-i18n="dropNote"]').count(),0,'redundant file choice hint is removed');
        assert.equal(await page.locator('.drop-empty [data-pick]').count(),2,'both file chooser buttons remain');
        const emptyDrop=await page.locator('#originalDrop').evaluate(el=>getComputedStyle(el).borderTopStyle);
        assert.equal(emptyDrop,'dashed','empty drop area retains a visible drop target');
        const panelStyle=await page.locator('.file-panel').first().evaluate(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.boxShadow,s.backgroundColor];});
        assert.deepEqual(panelStyle,['0px','none','rgba(0, 0, 0, 0)'],'no enclosing card around file picker');
        const preview=async(slot,name,label)=>page.locator('#'+slot+'Input').setInputFiles({
          name,mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:pptx(label)
        });
        await preview('original','first.pptx','FIRST_SLIDE_ALPHA');
        assert.equal(await page.locator('.page-intro').isVisible(),false,'intro and local badge disappear after first PPTX');
        const replaceLink=page.locator('#originalInfo .file-replace-link');
        assert.equal(await replaceLink.count(),1,'replace file stays a button');
        assert.ok((await replaceLink.evaluate(el=>getComputedStyle(el).textDecorationLine)).includes('underline'),'replace button looks like a link');
        await expectThumbnail(page,'original');
        await preview('revised','second.pptx','FIRST_SLIDE_BETA');
        await expectThumbnail(page,'revised');
        for(const slot of ['original','revised']){
          // The drop-zone background transitions for 160ms after selection.
          await page.waitForFunction(slot=>getComputedStyle(document.getElementById(slot+'Drop')).backgroundColor==='rgba(0, 0, 0, 0)',slot,{timeout:5000});
          const style=await page.locator('#'+slot+'Drop').evaluate(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.minHeight,s.backgroundColor];});
          assert.deepEqual(style,['0px','0px','rgba(0, 0, 0, 0)'],'selected file is not framed or forced to empty-drop height');
        }
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
        if(width===1280){
          // Before selecting a row or switching modes, the very first render
          // must already have a measurable frame that contains both slides.
          const first=await page.evaluate(()=>{
            const section=document.querySelector('#visualCompare'),vp=document.querySelector('#visualStageViewport');
            const canvases=[...section.querySelectorAll('#visualCompareStage .slide-canvas')];
            const bounds=vp.getBoundingClientRect();
            return {visible:!section.hidden,width:bounds.width,height:bounds.height,
              clientHeight:vp.clientHeight,scrollHeight:vp.scrollHeight,
              canvasBounds:canvases.map(el=>({top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom})),
              viewportBottom:bounds.bottom};
          });
          assert.ok(first.visible&&first.width>500&&first.height>300,'first preview is laid out after becoming visible: '+JSON.stringify(first));
          assert.ok(first.canvasBounds.length===2&&first.canvasBounds.every(x=>x.top>=0&&x.bottom<=first.viewportBottom+3),'both original and revised slides fit on first render: '+JSON.stringify(first));
          assert.ok(first.scrollHeight<=first.clientHeight+3,'no 100% inner vertical scrolling on first render: '+JSON.stringify(first));
        }
        assert.equal(await page.locator('#matchSummary .match-summary-item').count(),5);
        assert.equal(await page.locator('#semanticSummary .semantic-summary-item').count(),7);
        assert.equal(await page.locator('#changeBreakdownTitle').innerText(),lang==='ja'?'変更内訳':'Change breakdown');
        assert.equal(await page.locator('.change-breakdown').count(),1);
        const structure=page.locator('.structure-details');
        await structure.locator('summary').click();
        const flat=await structure.evaluate(el=>{
          const style=node=>{const s=getComputedStyle(node);return {radius:s.borderRadius,shadow:s.boxShadow,background:s.backgroundColor};};
          return {outer:style(el),cards:[...el.querySelectorAll('.inspection-card')].map(style),stats:[...el.querySelectorAll('.summary-item')].map(style),columns:[...el.querySelectorAll('.summary-grid')].map(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),rows:el.querySelectorAll('.slide-row').length};
        });
        for(const item of [flat.outer,...flat.cards,...flat.stats]){
          assert.deepEqual(item,{radius:'0px',shadow:'none',background:'rgba(0, 0, 0, 0)'},'structure and metrics use plain surfaces rather than nested cards');
        }
        assert.deepEqual(flat.columns,[4,4],'four metrics share one row on both layouts');
        assert.equal(flat.rows,4,'slide structure remains complete');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'expanded structure does not overflow');
        await structure.locator('summary').click();
        assert.equal(await structure.evaluate(el=>el.open),false,'structure can still collapse');
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

        // The list must use the same full renderer as the main slide preview.
        // Structural-only .slide-canvas thumbnails omit slide backgrounds.
        for(const side of ['original','revised']){
          const thumb=page.locator('#matchList .match-thumb[data-thumb-side="'+side+'"]').first();
          assert.ok(await thumb.count(),side+' has a comparison thumbnail');
          // Opening/closing the structure section and using search changes
          // scroll position. A thumbnail may be in the viewport yet covered
          // by the sticky header. Center it before sampling actual pixels.
          await thumb.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
          await page.waitForFunction(side=>{
            const thumb=document.querySelector('#matchList .match-thumb[data-thumb-side="'+side+'"]');
            const frame=thumb?.querySelector('.pptx-render-frame');
            if(!frame)return false;
            const r=thumb.getBoundingClientRect(),f=frame.getBoundingClientRect();
            const hit=document.elementFromPoint(r.left+r.width*.78,r.top+r.height*.76);
            return !!hit&&thumb.contains(hit)&&Math.abs(f.width-thumb.clientWidth)<=3&&Math.abs(f.height-thumb.clientHeight)<=3;
          },side,{timeout:15000});
          assert.equal(await thumb.locator('.slide-canvas').count(),0,side+' uses a rendered slide rather than the white structural fallback');
          assert.ok(await thumb.locator('.pptx-render-frame').evaluate(frame=>frame.getBoundingClientRect().width>0&&frame.getBoundingClientRect().height>0),side+' preview fits inside the slide list thumbnail');
          let rgb=[255,255,255];
          for(let attempt=0;attempt<12;attempt++){
            rgb=screenshotPixel(await thumb.screenshot());
            if(rgb[0]<100&&rgb[1]<160&&rgb[2]<165)break;
            await page.waitForTimeout(90);
          }
          if(!(rgb[0]<100&&rgb[1]<160&&rgb[2]<165)){
            await thumb.screenshot({path:path.resolve('test-results/mobile-layout','failed-thumb-'+lang+'-'+width+'-'+side+'.png')});
            const diagnostic=await thumb.evaluate(el=>{
              const r=el.getBoundingClientRect(),f=el.querySelector('.pptx-render-frame'),hit=document.elementFromPoint(r.left+r.width*.78,r.top+r.height*.76);
              return {thumb:r.toJSON(),frame:f?.getBoundingClientRect().toJSON(),frameStyle:f?.style.cssText,hit:hit?.outerHTML.slice(0,500),renderer:f?.firstElementChild?.outerHTML.slice(0,800),scrollY:window.scrollY};
            });
            assert.fail(side+' thumbnail preserves the slide background, not a white fallback: '+rgb.join(',')+' '+JSON.stringify(diagnostic));
          }
        }
        // Existing thumbnails are drawn at the narrow 94px list size first.
        // Switching to overlay enlarges their hosts without a window resize.
        // Check the already rendered first pair, not newly mounted thumbnails.
        if(width>760){
          const firstPair=page.locator('#matchList .match-row').first().locator('.match-thumb[data-thumb-side]');
          const narrow=await firstPair.first().evaluate(el=>el.clientWidth);
          await page.locator('[data-visual-mode="overlay"]').click();
          await page.waitForFunction(()=>{
            const thumbs=[...document.querySelectorAll('#matchList .match-row:first-child .match-thumb[data-thumb-side]')];
            return thumbs.length===2&&thumbs.every(thumb=>{
              const frame=thumb.querySelector('.pptx-render-frame');
              if(!frame)return false;
              const r=frame.getBoundingClientRect();
              return Math.abs(r.width-thumb.clientWidth)<=3&&Math.abs(r.height-thumb.clientHeight)<=3;
            });
          },null,{timeout:10000});
          assert.ok(await firstPair.first().evaluate(el=>el.clientWidth)>narrow+15,'overlay expands first pair thumbnails');
          for(const thumb of await firstPair.all()){
            const png=await thumb.screenshot();
            for(const [x,y] of [[.08,.87],[.92,.87]]){
              const rgb=screenshotPixel(png,x,y);
              assert.ok(rgb[0]<100&&rgb[1]<160&&rgb[2]<165,'expanded first thumbnail has no white margins: '+rgb.join(','));
            }
          }
          await page.locator('[data-visual-mode="side"]').click();
        }
        const firstDetails=page.locator('#matchList .semantic-details').first();
        assert.ok(await firstDetails.count(),'at least one slide has a change');
        const disclosure=await firstDetails.evaluate(el=>{
          const style=getComputedStyle(el),summary=getComputedStyle(el.querySelector('summary'));
          return {border:style.borderTopWidth,shadow:style.boxShadow,padding:style.paddingTop,summaryPadding:summary.paddingTop,background:style.backgroundColor};
        });
        assert.equal(disclosure.border,'0px','change disclosure has no surrounding border');
        assert.equal(disclosure.shadow,'none','change disclosure has no card shadow');
        assert.equal(disclosure.padding,'0px','change disclosure has no extra top spacing');
        assert.equal(disclosure.background,'rgba(0, 0, 0, 0)','change disclosure inherits row background');
        assert.ok(parseFloat(disclosure.summaryPadding)<=4,'compact disclosure header');
        await firstDetails.evaluate(el=>{el.open=true;});
        const inspect=firstDetails.locator('.change-inspect-button').first();
        assert.ok(await inspect.count(),'changes have a preview action');
        await inspect.click();
        await page.locator('#visualCompare').waitFor({state:'visible'});
        if(width===360){
          assert.equal(await page.locator('#reviewPreviewTab').getAttribute('aria-selected'),'true','inspect opens preview tab');
          await page.locator('#reviewListTab').click();
          assert.equal(await page.locator('#visualCompare').isVisible(),false,'list tab hides preview on phone');
          await page.locator('#reviewPreviewTab').click();
          await page.locator('#visualCompare').waitFor({state:'visible'});
        }else{
          const listBox=await page.locator('#matchList').boundingBox();
          const previewBox=await page.locator('#visualCompare').boundingBox();
          assert.ok(listBox&&previewBox&&previewBox.y+previewBox.height<=listBox.y+3,'side-by-side preview occupies the full top row above the list');
          const layoutBox=await page.locator('#reviewLayout').boundingBox();
          assert.ok(previewBox.width>layoutBox.width*.95,'side-by-side preview spans the result width');
          const thumbWidth=await page.locator('#matchList .match-thumb').first().evaluate(el=>el.getBoundingClientRect().width);
          assert.ok(thumbWidth>35&&thumbWidth<=108,'slide list thumbnails stay compact under the full-width preview: '+thumbWidth);
          assert.equal(await page.locator('#matchList .match-row').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),3,'desktop slide list uses compact three-column rows');
        }
        await page.waitForFunction(()=>document.querySelectorAll('#visualCompare [data-visual-entry-id].is-active').length>0,{timeout:5000});
        assert.equal(await page.locator('#visualHighlightToggle').getAttribute('aria-pressed'),'true');
        assert.equal(await page.locator('#visualCompareNote').count(),0,'renderer detail is not exposed as a preview note');
        const originalSideScroll=await page.evaluate(()=>window.scrollY);
        const originalSidePager=await page.locator('#visualNavPosition').boundingBox();
        const originalSideViewport=await page.locator('#visualStageViewport').boundingBox();
        const originalSideLabelCount=await page.locator('#visualMarkerHost .visual-marker-button').count();
        assert.ok(originalSideLabelCount>0,'changed slide has change markers');
        await page.locator('#visualNextButton').click();
        assert.equal(await page.locator('#visualMarkerHost .visual-marker-button').count(),0,'unchanged slide has no change markers');
        assert.equal(await page.locator('#visualChangeControls').isVisible(),false,'unchanged slide has no change navigation');
        const unchangedPager=await page.locator('#visualNavPosition').boundingBox();
        const unchangedViewport=await page.locator('#visualStageViewport').boundingBox();
        const unchangedScroll=await page.evaluate(()=>window.scrollY);
        const pagerDiagnostic=JSON.stringify({originalSidePager,unchangedPager,originalSideViewport,unchangedViewport,originalSideScroll,unchangedScroll});
        assert.ok(Math.abs(unchangedPager.y+unchangedScroll-originalSidePager.y-originalSideScroll)<=1,'pager stays at same document position after unchanged slide: '+pagerDiagnostic);
        assert.ok(Math.abs((unchangedPager.y-unchangedViewport.y)-(originalSidePager.y-originalSideViewport.y))<=1,'pager stays directly under fixed viewport: '+pagerDiagnostic);
        assert.ok(Math.abs(unchangedViewport.height-originalSideViewport.height)<=1,'preview frame height stays fixed across slides');
        await page.locator('#visualPrevButton').click();

        // Navigation stays beside the slide instead of at the distant section heading.
        const stageBox=await page.locator('#visualStageViewport').boundingBox();
        const overflowAt100=await page.locator('#visualStageViewport').evaluate(el=>({scroll:el.scrollHeight,visible:el.clientHeight}));
        assert.ok(overflowAt100.scroll<=overflowAt100.visible+3,'slide content is not clipped behind an internal scrollbar at 100%: '+JSON.stringify(overflowAt100));
        const navBox=await page.locator('#visualCompare .visual-nav').boundingBox();
        assert.ok(stageBox&&navBox&&navBox.y>=stageBox.y+stageBox.height-1&&navBox.y<=stageBox.y+stageBox.height+48,'slide navigation is immediately below the viewport');

        // Zoom is a single segmented control: minus / clickable percentage / plus.
        // The surrounding viewport and slide navigation must not move at any zoom level.
        const visualFrame=()=>page.evaluate(()=>{
          const viewport=document.querySelector('#visualStageViewport');
          const navigation=document.querySelector('#visualCompare .visual-nav');
          const bounds=viewport.getBoundingClientRect(),nav=navigation.getBoundingClientRect();
          return {width:bounds.width,height:bounds.height,navGap:nav.top-bounds.bottom,
            scrollWidth:viewport.scrollWidth,clientWidth:viewport.clientWidth};
        });
        const baseFrame=await visualFrame();
        const assertFixedFrame=async(label)=>{
          const current=await visualFrame();
          assert.ok(Math.abs(current.width-baseFrame.width)<=1,label+': viewport width stays fixed');
          assert.ok(Math.abs(current.height-baseFrame.height)<=1,label+': viewport height stays fixed');
          assert.ok(Math.abs(current.navGap-baseFrame.navGap)<=1,label+': slide pager does not shift');
        };
        const zoomValue=page.locator('#visualZoomValue');
        assert.equal(await page.locator('.visual-zoom-actions > button').count(),3);
        assert.equal(await zoomValue.getAttribute('aria-label'),lang==='ja'?'100%に戻す':'Reset to 100%');
        assert.equal(await zoomValue.innerText(),'100%');
        assert.equal(await page.locator('.visual-zoom-actions').evaluate(el=>getComputedStyle(el).gap),'0px');
        await page.locator('#visualZoomIn').click();
        assert.equal(await zoomValue.innerText(),'125%');
        assert.equal(await page.locator('#visualCompareStage').evaluate(el=>el.style.width),'125%');
        await assertFixedFrame('125%');
        await page.locator('#visualZoomIn').click();
        await assertFixedFrame('150%');
        await page.locator('#visualZoomIn').click();
        assert.equal(await zoomValue.innerText(),'200%');
        await assertFixedFrame('200%');
        assert.equal(await page.locator('#visualStageViewport').getAttribute('data-draggable'),'true');
        const dragViewport=page.locator('#visualStageViewport');
        await dragViewport.scrollIntoViewIfNeeded();
        const dragRect=await dragViewport.boundingBox();
        const initialX=await dragViewport.evaluate(el=>el.scrollLeft);
        await page.mouse.move(dragRect.x+dragRect.width/2,dragRect.y+Math.min(95,dragRect.height/2));
        await page.mouse.down();
        await page.mouse.move(dragRect.x+dragRect.width/2-55,dragRect.y+Math.min(95,dragRect.height/2),{steps:5});
        await page.mouse.up();
        const afterDragX=await dragViewport.evaluate(el=>el.scrollLeft);
        assert.ok(afterDragX>initialX+10,'dragging pans enlarged slide: '+JSON.stringify({initialX,afterDragX,dragRect}));
        assert.ok((await visualFrame()).scrollWidth>(await visualFrame()).clientWidth,'200% overflows inside fixed frame');
        await zoomValue.click();
        assert.equal(await zoomValue.innerText(),'100%');
        await assertFixedFrame('reset to 100%');
        assert.equal(await page.locator('#visualCompareStage').evaluate(el=>el.style.width),'100%');
        await page.locator('#visualZoomOut').click();
        assert.equal(await zoomValue.innerText(),'75%');
        await assertFixedFrame('75%');
        await page.locator('#visualZoomOut').click();
        assert.equal(await zoomValue.innerText(),'50%');
        await assertFixedFrame('50%');
        await page.locator('#visualZoomIn').click();
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
          assert.equal(await page.locator('#visualModeDescription').count(),0,'redundant mode text is removed');
          assert.equal(await page.locator('[data-visual-mode][aria-pressed="true"]').count(),1,'only one active mode');
          await page.locator('#visualCompareStage .visual-stack[data-mode="'+mode+'"]').waitFor({state:'attached'});
          if(mode==='overlay'){
            const opacity=page.locator('#visualOpacity');
            assert.equal(await page.locator('#visualOpacityControl').isVisible(),true);
            await opacity.focus();
            await opacity.press('End');
            for(let step=0;step<4;step++) await opacity.press('ArrowLeft');
            assert.equal(await page.locator('#visualOpacityValue').innerText(),'80%');
            assert.equal(await page.locator('#visualCompareStage [data-overlay-top-layer="true"]').evaluate(el=>el.style.opacity),'0.8');
          }else assert.equal(await page.locator('#visualOpacityControl').isVisible(),false);
        }
        await page.locator('[data-visual-mode="overlay"]').click();
        assert.equal(await page.locator('#visualOpacity').inputValue(),'80','opacity persists across modes');
        const changeControls=page.locator('#visualChangeControls');
        assert.equal(await changeControls.isVisible(),true,'change navigation is available');
        const changePosition=page.locator('#visualChangePosition'),initialPosition=(await changePosition.innerText()).split(' / ').map(Number);
        assert.ok(initialPosition.length===2&&initialPosition[1]>0,'change counter');
        if(initialPosition[0]<initialPosition[1]){
          await page.locator('#visualChangeNext').click();
          assert.equal(await changePosition.innerText(),(initialPosition[0]+1)+' / '+initialPosition[1]);
          if(initialPosition[0]>0){
            await page.locator('#visualChangePrev').click();
            assert.equal(await changePosition.innerText(),initialPosition.join(' / '));
          }else{
            assert.equal(await page.locator('#visualChangePrev').isDisabled(),true,'first change has no previous item');
            if(initialPosition[1]>1){
              await page.locator('#visualChangeNext').click();
              await page.locator('#visualChangePrev').click();
              assert.equal(await changePosition.innerText(),'1 / '+initialPosition[1]);
            }
          }
        }else assert.equal(await page.locator('#visualChangeNext').isDisabled(),true);
        assert.equal(await page.locator('#visualCompare .visual-toolbar-main > .diff-toolbar-label').count(),0,'no redundant mode heading');
        assert.equal(await page.locator('#visualCompare .visual-zoom-toolbar > .diff-toolbar-label').count(),0,'no redundant zoom heading');
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
        // A single-slide original and two-slide revised presentation force
        // an added slide with a missing counterpart after an unchanged row.
        await page.locator('#originalInput').setInputFiles({
          name:'one-slide.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          buffer:pptx('SHARED_FIRST_SLIDE',null)
        });
        await page.locator('#revisedInput').setInputFiles({
          name:'two-slides.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          buffer:pptx('SHARED_FIRST_SLIDE','ADDED_SECOND_SLIDE')
        });
        await page.locator('#analyzeButton').click();
        await page.locator('#resultSection').waitFor({state:'visible',timeout:30000});
        if(width===360) await page.locator('#reviewPreviewTab').click();
        await page.locator('[data-visual-mode="side"]').click();
        const beforeMissing=await visualFrame();
        const scrollBeforeMissing=await page.evaluate(()=>window.scrollY);
        const frameBeforeMissing=await page.locator('#visualStageViewport').boundingBox();
        const pagerBeforeMissing=await page.locator('#visualNavPosition').boundingBox();
        assert.equal(await page.locator('#visualChangeControls').isVisible(),false,'unchanged first slide has no changes');
        await page.locator('#visualNextButton').click();
        assert.equal(await page.locator('#visualCompareStage .visual-placeholder-canvas').count(),1,'missing slide has full-size visual placeholder');
        const afterMissing=await visualFrame(),pagerAfterMissing=await page.locator('#visualNavPosition').boundingBox();
        const scrollAfterMissing=await page.evaluate(()=>window.scrollY);
        const frameAfterMissing=await page.locator('#visualStageViewport').boundingBox();
        const addedDiagnostic=JSON.stringify({beforeMissing,afterMissing,pagerBeforeMissing,pagerAfterMissing,frameBeforeMissing,frameAfterMissing,scrollBeforeMissing,scrollAfterMissing});
        assert.ok(Math.abs(afterMissing.navGap-beforeMissing.navGap)<=1,'pager gap remains fixed for added slide: '+addedDiagnostic);
        assert.ok(Math.abs((pagerAfterMissing.y+scrollAfterMissing)-(pagerBeforeMissing.y+scrollBeforeMissing))<=1,'pager document position stays fixed for added slide: '+addedDiagnostic);
        assert.ok(Math.abs(afterMissing.height-beforeMissing.height)<=1,'missing slide keeps preview height: '+addedDiagnostic);
        assert.ok(!await page.locator('#visualNextButton').isEnabled(),'last added slide disables next');
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
