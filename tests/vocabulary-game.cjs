const assert = require('node:assert/strict');

module.exports = async function vocabularyGameChecks(page, base) {
  const words = [
    { id: 9001, kanji: '日本', meaning: 'Japan', readings: [{ kana: 'にほん' }, { kana: 'にっぽん' }] },
    { id: 9002, kanji: 'コーヒー', meaning: 'coffee', readings: [{ kana: 'コーヒー' }] },
    { id: 9003, kanji: '試験語', meaning: 'user-added test word', readings: [{ kana: 'しけんご' }] },
  ];
  const mock = route => {
    const collection = new URL(route.request().url()).searchParams.get('collection');
    const entries = collection === 'complete' ? words : collection === 'nouns' ? words.slice(0, 2) : [];
    return route.fulfill({ json: { entries, total: entries.length } });
  };
  await page.route('**/api/words?*', mock);
  try {
    await page.goto(base + '/jlpt/n5/practice');
    await page.waitForSelector('#game-question[data-word]');
    await page.locator('#game-task input[value=vocabulary]').check();
    assert.equal(await page.locator('#game-mode').isVisible(), false);
    assert.equal(await page.locator('#practice-rules').isVisible(), false);
    const input = page.locator('#practice-answer');
    const question = page.locator('#game-question');
    const seen = new Set();
    for (let i = 0; i < 3; i++) {
      const id = Number(await question.getAttribute('data-word'));
      assert.ok(!seen.has(id)); seen.add(id);
      const word = words.find(w => w.id === id);
      assert.equal(await question.innerText(), word.meaning);
      assert.equal(await question.locator('[lang=ja], .practice-reading').count(), 0);
      await input.fill('');
      await input.pressSequentially({ 9001: 'nippon', 9002: 'koohii', 9003: 'shikengo' }[id]);
      await input.press('Enter');
      assert.match(await input.inputValue(), /^[ぁ-ゖー]+$/);
      assert.equal(await page.locator('#practice-feedback').getAttribute('data-status'), 'correct');
      assert.ok((await page.locator('#practice-feedback').innerText()).includes(word.kanji));
      assert.equal(await page.locator('#game-score').innerText(), `С первой попытки: ${i + 1} из ${i + 1}`);
      await input.press('Shift+Enter');
    }
    assert.deepEqual([...seen].sort(), [9001, 9002, 9003]);
    const currentId = await question.getAttribute('data-word');
    const current = words.find(word => String(word.id) === currentId);
    await input.fill('あ'); await input.press('Enter');
    assert.equal(await page.locator('#practice-feedback').getAttribute('data-status'), 'incorrect');
    assert.ok((await page.locator('#practice-feedback').innerText()).includes(current.kanji));
    assert.match(await page.locator('#practice-feedback').innerText(), /Ближайший ответ:.*[ぁ-ゖ]/);
    await page.locator('#practice-reveal').click();
    assert.match(await page.locator('#practice-feedback').innerText(), /Ответ:/);
    await page.keyboard.press('F1');
    assert.equal(await page.locator('.practice-rules-dialog').count(), 0);
    await page.locator('#game-task input[value=forms]').check();
    assert.equal(await page.locator('#game-mode').isVisible(), true);
    assert.equal(await page.locator('#practice-rules').isVisible(), true);
    assert.equal(await page.locator('#game-score').innerText(), 'С первой попытки: 0 из 0');
    assert.equal(await question.locator('.practice-reading').count(), 1);
  } finally {
    await page.unroute('**/api/words?*', mock);
  }
  console.log('PASS vocabulary game: hidden reading, all words, romaji, alternatives, score and mode switching');
};
