const assert=require('node:assert/strict');
module.exports=async function designConsistency(page,base) {
  const routes=['','/progress','/vocabulary/verbs','/vocabulary/nouns','/grammar/nouns','/grammar/verbs/forms','/course','/course/workbook','/preparation','/practice','/word-relations','/verb-phrases','/counters','/mock','/workbooks','/exams','/library','/audio'];
  for(const width of [1440,1200,1000,800,390,320]) {
    await page.setViewportSize({width,height:900});
    for(const route of routes) {
      await page.goto(base+'/jlpt/n5'+route);
      await page.locator('#content h1').first().waitFor();
      await page.locator('#content .loading').waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' horizontal overflow '+width);
      const failures=await page.locator('#content .primary, #content .secondary, #content .practice-launch, #content .chip').evaluateAll(elements=>elements.flatMap(el=>{
        if(!el.getClientRects().length)return [];
        const r=el.getBoundingClientRect();
        if(r.width===0||r.height===0)return [];
        return r.left<-.5 || r.right>innerWidth+.5 || el.scrollWidth>el.clientWidth+2 ? [el.id||el.textContent.trim().slice(0,60)] : [];
      }));
      assert.deepEqual(failures,[],route+' clipped actions '+width);
      if(['/verb-phrases','/word-relations'].includes(route)) {
        const gaps=await page.locator('.phrase-card').evaluate(card=>{
          const groups=[...card.querySelectorAll(':scope > .practice-actions')];
          const related=card.querySelector('.phrase-related');
          return {rows:groups.length>1?groups[1].getBoundingClientRect().top-groups[0].getBoundingClientRect().bottom:16,related:related?groups[0].getBoundingClientRect().top-related.getBoundingClientRect().bottom:16};
        });
        const pager=page.locator('.phrase-card .practice-actions').nth(1);
        assert.equal(await pager.locator('button').evaluateAll(buttons=>buttons.every(button=>Math.abs(button.getBoundingClientRect().top-buttons[0].getBoundingClientRect().top)<1)),true,'Pager remains one row '+width);
        assert.ok(gaps.rows>=15 && gaps.related>=15,route+' action groups need visible separation '+JSON.stringify(gaps));
      }
      if(route==='/course/workbook') {
        const gap=await page.evaluate(()=>document.querySelector('.cw-progress').getBoundingClientRect().top-document.querySelector('.cw-selectors').getBoundingClientRect().bottom);
        assert.ok(gap>=15,'Workbook selector/status separation '+width+': '+gap);
      }
      if(process.env.SCREENSHOT_DIR && width===390)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/survey-'+(route.replaceAll('/','-')||'home')+'.png'});
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  console.log('PASS design consistency: 18 routes at 1440/1200/1000/800/390/320, no clipped actions or horizontal overflow');
};
