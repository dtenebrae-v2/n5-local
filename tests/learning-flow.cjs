const assert=require('node:assert/strict');
module.exports=async(browser,base)=>{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 try {
  await page.goto(base+'/jlpt/n5/course?lesson=1');await page.locator('#prep-lesson').waitFor();
  assert.equal(await page.locator('.prep-lesson-rules').evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('.prep-lesson-controls'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'Read rules before launching');
  await page.locator('[data-action=launch]').click();await page.locator('#prep-heading').waitFor();
  assert.equal(await page.locator('#prep-feedback').isVisible(),false,'No empty result panel');
  assert.equal(await page.locator('[data-action=next]').isVisible(),false);
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('n5.preparation.v1')));
  const q=state.session.questions[state.session.index],wrong=(q.correct+1)%q.choices.length;
  await page.locator(`input[name=prep-choice][value="${wrong}"]`).check();await page.locator('[data-action=check]').click();
  assert.equal(await page.locator('.mock-choices .form-choice').nth(wrong).getAttribute('data-answer'),'incorrect');
  assert.equal(await page.locator('.mock-choices .form-choice').nth(q.correct).getAttribute('data-answer'),'correct');
  assert.equal(await page.locator('[data-action=check]').isVisible(),false);
  assert.equal(await page.locator('.prep-actions .primary:visible').count(),1);
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/lesson-feedback-new.png'});
  await page.goto(base+'/jlpt/n5/library');await page.locator('.book-cover').first().waitFor();
  assert.ok((await page.locator('.book-cover').first().boundingBox()).y<400,'Books appear early');
  assert.equal(await page.locator('.catalogue-filters').getAttribute('open'),null);
  await page.goto(base+'/jlpt/n5/vocabulary/verbs');await page.locator('#results[aria-busy=false]').waitFor();
  assert.equal(await page.locator('.catalogue-filters').getAttribute('open'),null);
  assert.equal(await page.locator('.word-actions').first().isVisible(),true,'Frequent study actions need no disclosure');
  assert.equal(await page.getByText('Учить и справка',{exact:true}).count(),0);
  assert.ok((await page.locator('.japanese-word').first().boundingBox()).y<450,'Words appear early');
  await page.goto(base+'/jlpt/n5/verb-phrases');await page.locator('#phrase-start').waitFor();
  assert.equal(await page.locator('#phrase-start').isEnabled(),true,'New learners can practise immediately');
  assert.equal(await page.locator('#phrase-reset').isVisible(),false,'No reset before marking');
  console.log('PASS learning flow: rules before launch, semantic answer states, one next action, compact catalogues and immediate phrase practice');
 }finally{await context.close();}
};
