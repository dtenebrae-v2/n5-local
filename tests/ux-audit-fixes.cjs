const assert = require('node:assert/strict');
module.exports = async function auditFixChecks(browser, base) {
  const context=await browser.newContext();const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  async function feedbackVisible(selector) {
    await page.waitForFunction(selector=>{
      const el=document.querySelector(selector); if(!el?.textContent.trim())return false;
      const first=el.querySelector('strong') || el;const rect=first.getBoundingClientRect();
      return rect.top>=0 && rect.top+Math.min(rect.height,24)<=innerHeight;
    },selector);
  }
  async function hitTarget(selector) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    assert.equal(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,selector+' actual pointer target');
  }
  try {
    for(const width of [390,320]) {
      await page.setViewportSize({width,height:width===320?568:844});
      if(page.url().startsWith(base))await page.evaluate(()=>localStorage.removeItem('n5.counters.v1'));
      await page.goto(base+'/jlpt/n5/counters');await page.locator('#practice-answer').waitFor();
      const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('n5.counters.v1')));
      const before=await read();const position=before.session.position;
      await hitTarget('#practice-form [type=submit]');
      await page.locator('#practice-form [type=submit]').click();
      assert.match(await page.locator('#practice-feedback').innerText(),/Введите ответ/);
      assert.deepEqual((await read()).session.answers,before.session.answers,'Empty input never changes first attempt');
      await page.locator('#practice-answer').fill('ねこ');
      await page.locator('#practice-form [type=submit]').click();await feedbackVisible('#practice-feedback');
      assert.equal((await read()).session.position,position,'Check never advances a question');
      assert.equal(await page.locator('#practice-feedback').getAttribute('data-status'),'incorrect');
      await hitTarget('#counter-next');
      await page.goto(base+'/jlpt/n5/workbooks/somatome-n5-2017');await page.locator('[data-unit=w1d1]').click();
      await page.locator('[data-workbook-choice="1"]').click();await page.locator('#workbook-check').click();
      await feedbackVisible('#workbook-feedback');
      assert.match(await page.locator('#workbook-feedback').innerText(),/Неверно/);
      await page.goto(base+'/jlpt/n5/course?lesson=1');await page.locator('.prep-lesson-controls [data-action=launch]').click();
      await page.locator('[name=prep-choice]').first().check();await page.locator('[data-action=check]').click();
      await feedbackVisible('#prep-feedback');
      await page.goto(base+'/jlpt/n5/vocabulary/verbs?q='+encodeURIComponent('会う'));
      await page.locator('#results[aria-busy=false]').waitFor();
      const actions=page.locator('.word-actions').first();
      assert.equal(await actions.evaluate(el=>Array.from(el.children).every(child=>{const r=child.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})),true,'Every word action fits mobile');
    }
    await page.setViewportSize({width:390,height:844});
    const pdfRequests=[];const record=request=>{if(/\/library-files\/\d+\/pdf/.test(request.url()))pdfRequests.push(request.url());};page.on('request',record);
    await page.goto(base+'/jlpt/n5/library');await page.locator('.book-cover img').first().waitFor();
    await page.waitForFunction(()=>document.querySelector('.book-cover img').naturalWidth>0);
    assert.equal(await page.locator('.book-cover img').count(),44);
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/library-covers-mobile.png'});
    assert.equal(pdfRequests.length,0,'Catalogue loads thumbnails, not full PDFs');page.off('request',record);
    await page.goto(base+'/jlpt/n5/audio');await page.locator('[data-audio-group=books]').click();await page.locator('#audio-play-all').click();
    await page.waitForFunction(()=>!document.querySelector('#continuous-audio').paused);
    await page.locator('.audio-transport [data-audio-command=toggle]').click();
    await page.locator('.menu-toggle').click();await page.locator('#nav-materials').click();await page.locator('#navigation a[href$="/library"]').click();
    await page.locator('.book-cover[href$="/61371"]').click();await page.locator('#book-audio-play:not([disabled])').waitFor();
    assert.equal(await page.locator('.audio-mini').isVisible(),false,'The book owns one visible audio player');
    assert.equal(await page.locator('.book-audio .media-controls').isVisible(),true);
    assert.equal(await page.locator('#book-zoom-in').isVisible(),false,'Rare reader tools are collapsed');
    await page.locator('#book-tools-toggle').click();assert.equal(await page.locator('#book-zoom-in').isVisible(),true);
    await page.locator('#book-stage[aria-busy=false]').waitFor();
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/reader-panels-mobile.png'});
    for(const path of ['/course?lesson=1','/grammar/nouns','/grammar/adjectives/forms','/grammar/verbs/forms']) {
      await page.goto(base+'/jlpt/n5'+path);await page.locator('.rule-block').first().waitFor();
      if(process.env.SCREENSHOT_DIR && path==='/grammar/nouns')await page.screenshot({path:process.env.SCREENSHOT_DIR+'/grammar-rules-mobile.png'});
      assert.equal(await page.locator('#content h1').count(),1,'One page title: '+path);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No overflow: '+path);
    }
    await page.goto(base+'/jlpt/n5/workbooks/intensive-n5');await page.locator('[data-unit=listening-task]').click();
    assert.equal(await page.locator('#workbook-check').innerText(),'Сохранить ответ');
    assert.equal(await page.locator('#workbook-reveal').isVisible(),false);
    await page.locator('[data-workbook-choice="0"]').click();await page.locator('#workbook-check').click();await feedbackVisible('#workbook-feedback');
    assert.equal(await page.locator('#workbook-feedback').getAttribute('data-status'),'ungraded');
    assert.deepEqual(errors,[]);
    console.log('PASS audit fixes: pointer targets, empty input, mobile feedback, cover loading, independent audio panels, rule hierarchy and ungraded mode');
  } finally {await context.close();}
};
