const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const readline = require('node:readline');
const {chromium} = require('playwright');
(async () => {
  const server = spawn('python3',['-u','-c',"from http.server import ThreadingHTTPServer\nfrom server import Handler\ns=ThreadingHTTPServer(('127.0.0.1',0),Handler)\nprint(s.server_port,flush=True)\ns.serve_forever()"],{cwd:require('node:path').resolve(__dirname,'..'),stdio:['ignore','pipe','inherit']});
  let browser;
  try {
    const lines=readline.createInterface({input:server.stdout});
    const [port]=await once(lines,'line');
    browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH || ['/usr/bin/chromium-browser','/usr/bin/chromium','/usr/bin/google-chrome','/opt/google/chrome/chrome'].find(path=>require('node:fs').existsSync(path))});
    const page=await browser.newPage();
    const base=`http://127.0.0.1:${port}`;
    for (const width of [1440,390,320]) {
      await page.setViewportSize({width,height:900});
      await page.goto(base+'/jlpt/n5/progress');
      await page.waitForSelector('.progress-topics');
      assert.equal(await page.locator('h1').innerText(),'Подробные результаты');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.locator('.progress-topics a').first().click();
      await page.waitForSelector('.prep-settings[open]');
      assert.equal(await page.locator('[data-topic][aria-pressed=true]').count(),1);
      await page.screenshot({path:`/tmp/n5-progress-${width}.png`,fullPage:true});
    }
    await page.goto(base+'/jlpt/n5/course?lesson=17');
    await page.waitForSelector('#prep-lesson');
    assert.equal(await page.locator('#prep-lesson').inputValue(),'17');
    assert.equal(await page.locator('.prep-lesson-rules').getAttribute('open'),'');
    console.log('PASS progress routes, topic selection, lesson context and responsive layout');
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
