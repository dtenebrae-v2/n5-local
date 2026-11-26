const assert = require('node:assert/strict');
module.exports = async function controlStyleChecks(page, base) {
  async function inspect(label) {
    const failures = await page.evaluate(() => {
      const selector='input:not([type=radio],[type=checkbox],[type=range],[type=hidden],[type=button],[type=submit],[type=reset],[type=image],[type=file],[type=color]),select,textarea';
      return [...document.querySelectorAll(selector)].flatMap(field => {
        if (!field.getClientRects().length || getComputedStyle(field).visibility==='hidden') return [];
        const frame=field.closest('.search-box') || field;
        const style=getComputedStyle(frame), text=getComputedStyle(field), rect=frame.getBoundingClientRect();
        const issues=[];
        if (rect.height<43.5) issues.push('small touch target');
        if (parseFloat(text.fontSize)<16) issues.push('small field text');
        if (style.borderRadius!=='6px') issues.push('inconsistent corners');
        if (style.backgroundColor!=='rgb(255, 255, 255)') issues.push('inconsistent background');
        if (!['rgb(197, 208, 189)','rgb(40, 83, 69)'].includes(style.borderTopColor)) issues.push('inconsistent border');
        return issues.length?[`${field.id || field.name || field.tagName}: ${issues.join(', ')}`]:[];
      });
    });
    assert.deepEqual(failures,[],label);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,label+' overflow');
  }
  for (const width of [1440,390,320]) {
    await page.setViewportSize({width,height:1000});
    for (const [path,ready] of [
      ['/jlpt/n5/vocabulary/complete','#results[aria-busy="false"]'],
      ['/jlpt/n5/library','.library-search'],
      ['/jlpt/n5/preparation','.prep-home'],
      ['/jlpt/n5/course','#prep-lesson'],
    ]) {
      await page.goto(base+path);await page.locator(ready).waitFor();
      if(path.endsWith('/preparation'))await page.locator('.prep-settings summary').click();
      await inspect(path+' '+width);
    }
    await page.goto(base+'/jlpt/n5/vocabulary/complete');await page.locator('#add-word').click();
    await page.locator('.add-word-dialog[open]').waitFor();await inspect('add-word '+width);
    await page.locator('#cancel-add-word').click();
    const book = await (await page.request.get(base+'/api/course-workbook')).json();
    if(book.available) {
      await page.goto(base+'/jlpt/n5/course/workbook?lesson=17');await page.locator('#cw-position').waitFor();
      await inspect('course workbook '+width);
      await page.locator('#cw-position').fill('2');await page.locator('#cw-position').press('Tab');
      assert.match(await page.locator('.cw-progress').innerText(),/Карточка 2/);
      if(process.env.SCREENSHOT_DIR&&width===390)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/unified-controls-mobile.png',fullPage:true});
    }
  }
  // Native buttons and link-buttons must place their labels identically.
  for (const width of [1440,1200,1000,800,663,390,320]) {
    await page.setViewportSize({width,height:900});
    await page.goto(base+'/jlpt/n5/vocabulary/verbs');
    await page.locator('#results[aria-busy="false"]').waitFor();
    const failures=await page.locator('.word-actions').evaluateAll(groups=>groups.flatMap(group=>{
      const buttons=[...group.children];
      const positions=buttons.map(button=>{
        const box=button.getBoundingClientRect(), range=document.createRange();range.selectNodeContents(button);
        const label=range.getBoundingClientRect(), style=getComputedStyle(button);
        return {offset:label.top+label.height/2-box.top-box.height/2,height:box.height,lineHeight:style.lineHeight,font:style.font,display:style.display};
      });
      const sameRow=innerWidth<=560 || buttons.every(button=>Math.abs(button.getBoundingClientRect().top-buttons[0].getBoundingClientRect().top)<1);
      return !sameRow || positions.some(p=>Math.abs(p.offset-positions[0].offset)>1 || p.height<(innerWidth<=760?44:32) || p.lineHeight!==positions[0].lineHeight || p.font!==positions[0].font || !['flex','inline-flex'].includes(p.display)) ? [positions] : [];
    }));
    assert.deepEqual(failures,[],'Aligned button/link labels '+width);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.SCREENSHOT_DIR && [663,390].includes(width))await page.screenshot({path:process.env.SCREENSHOT_DIR+'/word-actions-'+width+'.png'});
  }
  // Reader fields use the same controls, including page number and audio rate.
  const library=await (await page.request.get(base+'/api/library')).json();
  const readable=library.books.find(book=>book.assets?.pdf?.available);
  if(readable) {
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:1000});
      await page.goto(base+'/jlpt/n5/library/'+readable.id);await page.locator('#book-page').waitFor();
      await inspect('book reader '+width);
      if(width<700) {
        await page.locator('#book-tools-toggle').click();
        assert.ok((await page.locator('#book-fit').boundingBox()).width>=200,'Readable reader fit selector '+width);
        await inspect('expanded reader '+width);
      }
    }
  }
  await page.evaluate(()=>localStorage.removeItem('n5-course-workbook-v1'));
  await page.setViewportSize({width:1440,height:1000});
  console.log('PASS shared controls: vocabulary, add-word, preparation, lessons, workbook and reader at desktop/390/320px');
};
