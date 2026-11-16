const assert = require('node:assert/strict');
module.exports = async function courseWorkbookChecks(page, base) {
  const imported = await (await page.request.get(base+'/api/course-workbook')).json();
  if (imported.available) {
    assert.equal(imported.units.length,31);
    assert.equal(imported.items.filter(i=>i.kind==='translation').length,630);
    await page.goto(base+'/jlpt/n5/course');
    await page.locator('#prep-lesson').selectOption('17');
    const link=page.locator('.prep-lessons a[href*="course/workbook"]');
    assert.match(await link.getAttribute('href'),/lesson=17/);
    await link.click();
    await page.locator('.cw-card').waitFor();
    assert.equal(await page.locator('#cw-unit').inputValue(),'17');
    assert.match(await page.locator('.cw-card h2').innerText(),/путешествие/);
    await page.locator('#cw-kind').selectOption('worksheet');
    await page.waitForFunction(()=>[...document.querySelectorAll('.cw-image img')].every(i=>i.complete&&i.naturalWidth>0));
    await page.locator('[data-cw=reveal]').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.cw-image img')].every(i=>i.complete&&i.naturalWidth>0));
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/course-workbook.png',fullPage:true});
    for(const width of [320,390]) {
      await page.setViewportSize({width,height:850});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(process.env.SCREENSHOT_DIR&&width===390)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/course-workbook-mobile.png',fullPage:true});
    }
    await page.setViewportSize({width:1440,height:1000});
  }
  const fixture={available:true,title:'Тетрадь',units:[{id:'0',title:'Вводный урок'},{id:'17',title:'Урок 17'}],assets:{},items:[
    {id:'0-kana-1',unit:'0',kind:'kana',script:'hiragana',prompt:'Запишите хираганой: kawaii',answer:'かわいい',answers:['かわいい'],source:{page:7,answer_page:109}},
    {id:'0-kana-2',unit:'0',kind:'kana',script:'katakana',prompt:'Запишите катаканой: kamera',answer:'カメラ',answers:['カメラ'],source:{page:7,answer_page:109}},
    {id:'17-translation-1',unit:'17',kind:'translation',prompt:'Переведите: хочу путешествовать.',answer:'りょこうにいきたいです。',source:{page:68,answer_page:143}},
    {id:'17-translation-2',unit:'17',kind:'translation',prompt:'Переведите: времени нет.',answer:'じかんがありません。',source:{page:68,answer_page:143}},
  ]};
  await page.evaluate(()=>localStorage.removeItem('n5-course-workbook-v1'));
  await page.route('**/api/course-workbook',route=>route.fulfill({json:fixture}));
  await page.goto(base+'/jlpt/n5/course/workbook?lesson=17');
  await page.locator('.cw-card').waitFor();
  assert.equal(await page.locator('.cw-model').count(),0);
  await page.locator('#cw-answer').pressSequentially('watashi');
  assert.equal(await page.locator('#cw-answer').inputValue(),'わたし');
  assert.equal(await page.locator('#cw-answer').evaluate(el=>getComputedStyle(el).fontSize),'20px');
  await page.locator('#cw-answer').fill('自分のこたえ');
  await page.reload();await page.locator('.cw-card').waitFor();
  assert.equal(await page.locator('#cw-answer').inputValue(),'自分のこたえ');
  await page.locator('[data-cw=reveal]').click();
  await page.locator('[data-cw=self-review]').click();
  assert.equal(await page.locator('[data-cw=self-review]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-cw=next]').click();
  await page.reload();await page.locator('.cw-card').waitFor();
  assert.match(await page.locator('.cw-card h2').innerText(),/времени нет/);
  await page.locator('#cw-unit').selectOption('0');
  assert.equal(await page.locator('#cw-answer').evaluate(el=>el.tagName),'INPUT');
  await page.locator('#cw-answer').pressSequentially('n');
  await page.locator('[data-cw=check]').click();
  assert.match(await page.locator('#cw-feedback').innerText(),/Завершите ввод/);
  assert.equal(await page.locator('.cw-model').count(),0);
  await page.locator('#cw-answer').dispatchEvent('compositionstart');
  await page.locator('#cw-answer').fill('かわいい');
  await page.locator('[data-cw=check]').click();
  assert.equal(await page.locator('.cw-model').count(),0);
  await page.locator('#cw-answer').dispatchEvent('compositionend');
  await page.locator('#cw-answer').fill('');
  await page.locator('#cw-answer').pressSequentially('kawaii');
  assert.equal(await page.locator('#cw-answer').inputValue(),'かわいい');
  await page.locator('#cw-answer').press('Enter');
  assert.match(await page.locator('#cw-feedback').innerText(),/Верно/);
  await page.reload();await page.locator('.cw-card').waitFor();
  assert.match(await page.locator('#cw-feedback').innerText(),/Верно/);
  await page.locator('[data-cw=next]').click();
  await page.locator('#cw-answer').pressSequentially('kamera');
  assert.equal(await page.locator('#cw-answer').inputValue(),'カメラ');
  await page.locator('[data-cw=check]').click();
  assert.match(await page.locator('#cw-feedback').innerText(),/Верно/);
  for(const width of [320,390]) {
    await page.setViewportSize({width,height:850});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.unroute('**/api/course-workbook');
  await page.evaluate(()=>localStorage.removeItem('n5-course-workbook-v1'));
  await page.setViewportSize({width:1440,height:1000});
  console.log('PASS course workbook: standalone assets, drafts, self-check, kana grading, resume and mobile');
};
