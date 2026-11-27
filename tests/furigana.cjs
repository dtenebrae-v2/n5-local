const assert = require('node:assert/strict');
const baseText = require('./base-text.cjs');
module.exports = async function furiganaChecks(page, base) {
  await page.goto(base+'/jlpt/n5/vocabulary/verbs?q='+encodeURIComponent('開ける'));
  const saved = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  const word = page.locator('.japanese-word').first();
  await word.locator('ruby rt').waitFor();
  assert.equal(await baseText(word),'開ける');
  assert.equal(await word.locator('rt').innerText(),'あ');
  await require('./open-word-action.cjs')(page.locator('[data-practice="8"]'));
  await page.locator('dialog .practice-word ruby').waitFor();
  await page.locator('#practice-reveal').click();
  await page.locator('.feedback-expected ruby').waitFor();
  await page.keyboard.press('Escape');
  await page.goto(base+'/jlpt/n5/verb-phrases?word=8');
  await page.locator('#phrase-study ruby').first().waitFor();
  assert.equal(await page.locator('#phrase-study h2 rt').allTextContents().then(a=>a.join('/')),'まど/あ');
  assert.equal(await baseText(page.locator('#phrase-study h2')),'窓を開ける');
  await page.locator('#phrase-learning').click();
  assert.equal(await page.locator('ruby ruby').count(),0);
  await page.evaluate(() => {
    const p=document.createElement('p');p.id='furigana-context';
    p.textContent='日本語能力試験の聴解を始めます。3日目の復習です。国際交流の説明を聞いて図書館の受付に行きました。';
    document.querySelector('#content').append(p);
  });
  await page.waitForFunction(() => {
    const root=document.querySelector('#furigana-context');
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()) if(!node.parentElement.closest('ruby') && /[\p{Script=Han}]/u.test(node.textContent)) return false;
    return root.querySelectorAll('rt').length>10;
  });
  assert.ok((await page.locator('#furigana-context rt').allTextContents()).includes('ちょうかい'));
  assert.ok((await page.locator('#furigana-context rt').allTextContents()).includes('みっか'));
  await page.goto(base+'/jlpt/n5/word-relations');
  await page.locator('#relation-kind').selectOption('paraphrase');
  await page.locator('#relation-study ruby').first().waitFor();
  assert.ok(await page.locator('#relation-study .relation-side rt').count() >= 2);
  await page.goto(base+'/jlpt/n5/counters');
  await page.locator('[data-counter-mode="reference"]').click();
  await page.locator('[data-counter-reference="books"]').click();
  await page.locator('#counter-table ruby rt').first().waitFor();
  assert.ok((await page.locator('#counter-table rt').allTextContents()).includes('いっさつ'));
  await page.goto(base+'/jlpt/n5/grammar/verbs/forms');
  await page.locator('.lesson ruby').first().waitFor();
  // The observer also covers prose, late-created dialogs and sentences without explicit markup.
  await page.evaluate(() => {
    const test = document.createElement('div'); test.id='furigana-probe';
    test.innerHTML='<p>学校で本を読む。</p><p data-furigana="off">学校</p><input value="学校"><p>入る</p>';
    document.querySelector('#content').append(test);
  });
  await page.locator('#furigana-probe p').first().locator('ruby').first().waitFor();
  assert.equal(await page.locator('#furigana-probe [data-furigana=off] ruby').count(),0);
  assert.equal(await page.locator('#furigana-probe input').inputValue(),'学校');
  assert.equal(await page.locator('#furigana-probe p').last().locator('ruby').count(),0);
  assert.equal(await page.locator('ruby ruby').count(),0);
  const bank=await (await page.request.get(base+'/api/mock-exam')).json();
  const item=bank.items.find(q=>q.type==='reading-kanji' && q.prompt.includes('学校'));
  const mock=route=>route.fulfill({json:{...bank,items:[item]}});
  await page.route('**/api/mock-exam',mock);
  try {
    await page.evaluate(()=>localStorage.removeItem('n5.preparation.v1'));
    await page.goto(base+'/jlpt/n5/preparation?topic=kanji');
    await page.locator('[data-action=launch]').click();
    await page.locator('#prep-heading').waitFor();
    assert.equal(await page.locator('.mock-question ruby').count(),0);
    assert.equal(await page.locator('.mock-question').getAttribute('data-furigana'),'off');
    await page.locator('[data-action=unknown]').click();
    await page.locator('#prep-heading ruby').waitFor();
    assert.equal(await page.locator('.mock-question').getAttribute('data-furigana'),null);
  } finally { await page.unroute('**/api/mock-exam',mock); }
  await page.goto(base+'/jlpt/n5/verb-phrases?word=8');
  await page.locator('#phrase-study ruby').first().waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/n5-furigana-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(saved => { localStorage.clear(); for (const [key,value] of Object.entries(saved)) localStorage.setItem(key,value); }, saved);
  console.log('PASS furigana: offline dictionary, compounds, inflections, dates, hidden answers and mobile layout');
};
