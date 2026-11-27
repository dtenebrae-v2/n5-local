const assert=require('node:assert/strict');
module.exports=async function audioJourney(browser,base){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const shot=async name=>{if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/'+name+'.png'});};
 async function core(selector){
  const root=page.locator(selector);await root.waitFor();
  assert.equal(await root.locator('[data-media-toggle] svg').count(),1);
  assert.equal(await root.locator('select[aria-label="Скорость аудио"]').count(),1);
  assert.equal(await root.locator('input[aria-label="Позиция аудио"]').count(),1);
  for(const width of [1440,1000,390,320]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,selector+' overflow '+width);
   assert.equal(await root.locator('.media-main > button').evaluateAll(buttons=>buttons.every(b=>Math.abs(b.getBoundingClientRect().top-buttons[0].getBoundingClientRect().top)<1)),true,'Shared control row '+width);
  }
 }
 try{
  await page.goto(base+'/jlpt/n5/audio?mode=practice&source=exams');
  const link=page.locator('.audio-training-catalog a[href*="/exams/"]').first();await link.waitFor();
  assert.match(await link.getAttribute('href'),/section=listening/);await shot('audio-hub-exams');await link.click();
  await page.locator('#exam-audio').waitFor({state:'attached'});await core('.exam-audio .media-controls');
  const [media,paper]=await Promise.all([page.locator('.exam-audio').boundingBox(),page.locator('.exam-paper').boundingBox()]);assert.ok(media.y<paper.y,'Audio precedes the scanned task');
  await page.locator('#exam-play').click();await page.waitForFunction(()=>!document.querySelector('#exam-audio').paused && document.querySelector('#exam-play').getAttribute('aria-label')==='Пауза');
  assert.equal(await page.locator('#exam-play').getAttribute('aria-label'),'Пауза');
  await page.locator('#exam-play').click();await page.reload();await page.locator('#exam-play').waitFor();assert.equal(await page.locator('dialog[open]').count(),0,'Reload resumes this audio exercise');await page.locator('[data-exam-rate-select]').selectOption('0.75');
  assert.equal(await page.locator('#exam-audio').evaluate(a=>a.playbackRate),.75);
  const min=Number(await page.locator('[data-inline-seek]').getAttribute('min'));await page.locator('#exam-audio-back').click();
  assert.ok(await page.locator('#exam-audio').evaluate((a,min)=>a.currentTime>=min,min));await shot('audio-exercise-320');
  await page.goto(base+'/jlpt/n5/audio?mode=practice&source=workbooks');
  await page.locator('.audio-training-catalog a[href*="/workbooks/"]').first().click();
  await page.locator('#workbook-audio').waitFor({state:'attached'});await core('.workbook-audio .media-controls');
  await page.locator('[data-workbook-rate]').selectOption('1.25');assert.equal(await page.locator('#workbook-audio').evaluate(a=>a.playbackRate),1.25);await shot('audio-workbook-320');
  await page.goto(base+'/jlpt/n5/audio?mode=listen&source=books');await page.locator('#audio-play-all').click();
  await page.waitForFunction(()=>!document.querySelector('#continuous-audio').paused);await core('.audio-now .media-controls');
  await page.locator('.audio-now [data-media-toggle]').click();
  await page.goto(base+'/jlpt/n5/library/61371');await page.locator('#book-stage[aria-busy=false]').waitFor();await core('.book-audio .media-controls');
  assert.equal(await page.locator('.audio-mini').isVisible(),false,'Only the local player is shown');await shot('audio-book-320');
  await page.goto(base+'/jlpt/n5');await page.locator('.audio-mini').waitFor({state:'visible'});assert.equal(await page.locator('.audio-mini').isVisible(),true,'Saved queue comes back after the local player');
  await page.goto(base+'/jlpt/n5/audio?mode=practice&source=books');await page.getByText('У книг нет тестовых заданий.',{exact:false}).waitFor();
  assert.equal(await page.locator('.audio-training-catalog a[href*="/exams/"]').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS audio journey: one hub, real exercise links, shared controls, clip bounds and one local player with queue restoration');
 }finally{await context.close();}
};
