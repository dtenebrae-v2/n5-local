const assert = require('node:assert/strict');
module.exports = async function nativeAudioChecks(page,base) {
  const context=await page.context().browser().newContext();
  try {
    await context.addInitScript(()=>{
      let state=JSON.parse(sessionStorage.getItem('fake-native-audio')||'{}');
      window.N5Audio={getState:()=>JSON.stringify(state),command:value=>{
        const command=JSON.parse(value);
        if(command.action==='queue')state={queue:command.tracks,index:command.index,position:command.position,duration:1200,rate:command.rate,repeat:command.repeat,playing:command.play,positions:{}};
        if(command.action==='play')state.playing=true;
        if(command.action==='pause')state.playing=false;
        if(command.action==='seek')state.position=command.position;
        if(command.action==='rate')state.rate=command.rate;
        if(command.action==='repeat')state.repeat=command.repeat;
        if(command.action==='stop')state={queue:[]};
        state.updated=Date.now();sessionStorage.setItem('fake-native-audio',JSON.stringify(state));
      }};
    });
    const nativePage=await context.newPage();await nativePage.goto(base+'/jlpt/n5/audio');
    await nativePage.locator('[data-audio-group=workbooks]').click();
    await nativePage.locator('#audio-play-all').click();
    await nativePage.waitForFunction(()=>document.querySelector('.audio-transport [data-audio-command=toggle]').textContent==='Пауза');
    const initial=await nativePage.evaluate(()=>JSON.parse(window.N5Audio.getState()));
    assert.equal(initial.queue.length,25);
    assert.ok(initial.queue.every(track=>track.url.startsWith('/material-files/')));
    assert.equal(await nativePage.locator('#continuous-audio').count(),0,'Native service owns the audio, not WebView');
    await nativePage.locator('.audio-position').evaluate(el=>{el.value='125';el.dispatchEvent(new Event('change',{bubbles:true}));});
    await nativePage.locator('.audio-transport [data-audio-command=toggle]').click();
    await nativePage.waitForFunction(()=>!JSON.parse(window.N5Audio.getState()).playing);
    await nativePage.reload();await nativePage.locator('.audio-current-title').waitFor();
    await nativePage.waitForFunction(()=>document.querySelector('.audio-position').value==='125');
    assert.match(await nativePage.locator('.audio-current-title').innerText(),/Дорожка/);
    assert.equal(await nativePage.locator('.audio-transport [data-audio-command=toggle]').innerText(),'Слушать');
    console.log('PASS Android bridge: native queue, seek/pause, service restoration and no WebView playback');
  } finally {await context.close();}
};
