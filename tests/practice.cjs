const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

module.exports = async function practiceChecks(page, base) {
  async function open(collection, query, id) {
    await page.goto(base + '/jlpt/n5/vocabulary/' + collection + '?q=' + encodeURIComponent(query));
    await page.waitForSelector('#results[aria-busy="false"]');
    await page.locator(`[data-practice="${id}"]`).click();
    await page.waitForSelector('.practice-dialog[open]');
  }
  const input = page.locator('#practice-answer');
  const feedback = page.locator('#practice-feedback');
  async function answer(value, status, full) {
    await input.fill(value);
    await page.locator('#practice-form button[type="submit"]').click();
    assert.equal(await feedback.getAttribute('data-status'), status, value);
    if (full) assert.match(await feedback.innerText(), new RegExp(full));
  }

  await open('verbs', '行く', 44);
  assert.equal(await page.locator('#practice-target select').count(), 0);
  assert.equal(await page.locator('#practice-target input[type=radio]').count(), 9);
  await page.locator('#practice-target input[value=past]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#practice-target input[value=negative]').isChecked(), true);
  await page.keyboard.press('ArrowLeft');
  await input.focus();
  assert.equal(await input.evaluate((element) => element === document.activeElement), true);
  await input.pressSequentially('ikimashita');
  assert.equal(await input.inputValue(), 'いきました');
  const beforeAnswer = await page.locator('.practice-dialog').boundingBox();
  const beforeInput = await input.boundingBox();
  await input.press('Enter');
  assert.deepEqual(await page.locator('.practice-dialog').boundingBox(), beforeAnswer);
  assert.deepEqual(await input.boundingBox(), beforeInput);
  assert.equal(await feedback.innerText(), 'Верно: 行きました（いきました）');
  await answer('ました', 'incorrect');
  assert.equal(await feedback.innerText(), 'Неверно: ました · Ближайший ответ: 行きました（いきました）');
  assert.deepEqual(await page.locator('.practice-dialog').boundingBox(), beforeAnswer);
  assert.deepEqual(await input.boundingBox(), beforeInput);
  assert.equal(await input.getAttribute('aria-invalid'), 'true');
  assert.equal(await feedback.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 235, 231)');
  await answer('', 'empty');
  await answer('sh', 'incomplete');
  await answer('ＩＫＩＭＡＳＨＩＴＡ', 'correct', 'いきました');
  await input.evaluate((element) => { element.focus(); element.setSelectionRange(2, 3); });
  await input.pressSequentially('ma');
  assert.equal(await input.inputValue(), 'いきました');
  await page.locator('#practice-target input[value=\"negative\"]').check();
  assert.equal(await input.inputValue(), '');
  assert.equal(await feedback.innerText(), '');
  await input.pressSequentially('ikimasen');
  await input.press('Enter');
  assert.equal(await input.inputValue(), 'いきません');
  assert.equal(await feedback.innerText(), 'Верно: 行きません（いきません）');
  await page.locator('#practice-target input[value=\"past_negative\"]').check();
  await answer('ikimasendeshita', 'correct', 'いきませんでした');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.practice-dialog', { state: 'detached' });
  assert.equal(await page.locator('[data-practice="44"]').evaluate((element) => element === document.activeElement), true);
  console.log('PASS practice romaji, cursor edits, pending n, feedback and focus restoration');

  await open('nouns', '学生', 145);
  await answer('gakuseideshita', 'correct', 'がくせいでした');
  await page.locator('#practice-target input[value=\"past_negative\"]').check();
  for (const ending of ['dehaarimasendeshita', 'jaarimasendeshita', 'dehanakattadesu', 'janakattadesu']) {
    await answer('gakusei' + ending, 'correct');
  }
  await answer('gakuseijanadeshita', 'incorrect', 'Ближайший ответ: 学生じゃなかったです');
  await page.locator('#practice-reveal').click();
  assert.match(await feedback.innerText(), /がくせいじゃなかったです/);
  assert.match(await feedback.innerText(), /がくせいではありませんでした/);
  assert.equal(await feedback.evaluate(el => el.scrollHeight <= el.clientHeight), true);
  console.log('PASS noun endings and accepted negative alternatives');

  await open('i-adjectives', '大きい', 91);
  await answer('ookikattadesu', 'correct', 'おおきかったです');
  await page.locator('#practice-target input[value=\"past_negative\"]').check();
  await answer('ookikunakattadesu', 'correct', 'おおきくなかったです');
  await answer('ookikuarimasendeshita', 'correct', 'おおきくありませんでした');
  await answer('deshita', 'incorrect');
  await open('i-adjectives', '良い', 40);
  await answer('yokattadesu', 'correct', 'よかったです');
  await open('na-adjectives', 'きれい', 764);
  await answer('kireideshita', 'correct', 'きれいでした');
  await answer('kattadesu', 'incorrect');
  await page.locator('#practice-target input[value=\"past_negative\"]').check();
  await answer('kireijanakattadesu', 'correct', 'きれいじゃなかったです');
  console.log('PASS i-adjectives, ii exception and na-adjectives ending in i');

  await open('verbs', '来る', 208);
  await answer('kimashita', 'correct', 'きました');
  await answer('kurimashita', 'incorrect');
  await open('verbs', 'する', 328);
  await answer('shimashita', 'correct', 'しました');
  await open('verbs', 'いる', 65);
  await answer('irimashita', 'correct', 'いりました');
  await open('verbs', 'いる', 66);
  await answer('imashita', 'correct', 'いました');
  await page.evaluate(() => history.back());
  await page.waitForSelector('.practice-dialog', { state: 'detached' });
  console.log('PASS irregular verbs, corrected iru and dialog cleanup on navigation');

  await page.goto(base + '/jlpt/n5/vocabulary/verbs?q=食べる');
  await page.waitForSelector('#results[aria-busy="false"]');
  await page.locator('[data-conjugation="376"]').click();
  await page.waitForSelector('.verb-reference[open]');
  assert.match(await page.locator('.verb-form-list').innerText(), /たべれば/);
  if (process.env.SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'n5-verb-reference.png') });
  }
  await page.locator('[data-train-form="imperative"]').click();
  await page.waitForSelector('.practice-dialog:not(.verb-reference)[open]');
  assert.equal(await page.locator('#practice-target input[value=imperative]').isChecked(), true);
  await answer('tabere', 'incorrect');
  await answer('tabero', 'correct', 'たべろ');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('.practice-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await page.locator('.practice-close').click();
  await page.waitForSelector('.practice-dialog', { state: 'detached' });
  await page.locator('[data-conjugation="376"]').click();
  assert.equal(await page.locator('.verb-reference').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await page.locator('.verb-reference .lesson-link').click();
  await page.waitForSelector('#ichidan');
  await page.waitForSelector('.practice-dialog', { state: 'detached' });
  assert.match(await page.locator('.lesson').innerText(), /Основ/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log('PASS verb reference, practice transition, mobile layout and grammar navigation');

  await open('verbs', '食べる', 376);
  // Native IME composition must not accidentally submit a half-written answer.
  await input.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.value = 'たべました';
    element.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'たべました', bubbles: true }));
    element.form.requestSubmit();
  });
  assert.equal(await feedback.innerText(), '');
  await input.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionend', { data: 'たべました', bubbles: true }));
  });
  await input.press('Enter');
  assert.equal(await feedback.innerText(), 'Верно: 食べました（たべました）');
  console.log('PASS native kana composition guard');

  if (process.env.SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'n5-practice-desktop.png') });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('.practice-dialog').evaluate((element) => element.scrollWidth <= element.clientWidth), true);
  await answer('tabemashita', 'correct', 'たべました');
  assert.equal(await feedback.evaluate(el => el.scrollHeight <= el.clientHeight), true);
  if (process.env.SCREENSHOT_DIR) {
    await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'n5-practice-mobile.png') });
  }
  await page.locator('.practice-close').click();
  await page.waitForSelector('.practice-dialog', { state: 'detached' });
  await open('nouns', '学生', 145);
  await page.locator('#practice-target input[value=past_negative]').check();
  await page.locator('#practice-reveal').click();
  assert.equal(await feedback.evaluate(el => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth), true);
  await page.locator('.practice-close').click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log('PASS mobile practice dialog');
};
