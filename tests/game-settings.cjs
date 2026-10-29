async function openSettings(page) {
  if (!await page.locator('#game-settings').evaluate(el => el.open)) await page.locator('#game-configure').click();
}
async function openOptions(page) {
  await openSettings(page);
  if (!await page.locator('#game-options').evaluate(el => el.open)) await page.locator('#game-options > summary').click();
}
async function choose(page, selector) {
  await openSettings(page);
  if (await page.locator(selector).evaluate(el => !!el.closest('#game-options'))) await openOptions(page);
  await page.locator(selector).check();
  await page.locator('#settings-apply').click();
}
module.exports = { choose, openSettings, openOptions };
