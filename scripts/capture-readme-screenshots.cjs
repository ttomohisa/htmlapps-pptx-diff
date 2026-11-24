'use strict';
// Generate the README images from the verified standalone app and local synthetic PPTX files.
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const {pptx}=require('./first-slide.browser.cjs');
(async()=>{
  const browser=await chromium.launch();
  try{
    for(const lang of ['ja','en']){
      const context=await browser.newContext({viewport:{width:1440,height:1000},locale:lang,reducedMotion:'reduce'});
      const page=await context.newPage(),errors=[],requests=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
      try{
        await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
        await page.locator('#languageButton').waitFor();
        if(await page.locator('html').getAttribute('lang')!==lang)await page.locator('#languageButton').click();
        const labels=lang==='ja'?['売上目標 120 万円','売上目標 150 万円','次のステップ']:['Sales target: 120','Sales target: 150','Next steps'];
        const names=lang==='ja'?['計画.pptx','計画_改訂.pptx']:['plan.pptx','plan-revised.pptx'];
        for(const [i,slot] of ['original','revised'].entries()){
          await page.locator('#'+slot+'Input').setInputFiles({name:names[i],mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:pptx(labels[i],labels[2])});
          await page.locator('#'+slot+'Thumbnail .pptx-render-frame').waitFor({timeout:15000});
        }
        await page.locator('#analyzeButton').click();
        await page.locator('#resultSection').waitFor({state:'visible',timeout:30000});
        await page.locator('#visualCompareStage .pptx-render-frame').first().waitFor({timeout:30000});
        await page.waitForFunction(()=>document.querySelectorAll('#visualCompareStage .pptx-render-frame').length===2);
        await page.locator('#resultSection').evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+scrollY-72,behavior:'instant'}));
        await page.evaluate(()=>document.fonts.ready);
        await page.waitForTimeout(500);
        assert.ok(await page.locator('#visualCompare').isVisible());
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        assert.deepEqual(errors,[]);
        assert.deepEqual(requests,[]);
        await page.screenshot({path:lang==='ja'?'assets/screenshot.png':'assets/screenshot-en.png',animations:'disabled'});
      }finally{await context.close();}
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
