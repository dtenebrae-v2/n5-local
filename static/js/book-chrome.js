// Reader scrolling happens inside PDF.js, not in window. React to user scrolls only.
export function bindReaderChrome(shell, stage, signal) {
  const chrome=shell.querySelector('.book-chrome'), restore=shell.querySelector('#book-show-controls');
  const mobile=matchMedia('(max-width: 800px), (pointer: coarse)');
  let last=stage.scrollTop, distance=0, direction=0, intent=0, settling=0, moved=0, touch=null;
  function show(hidden) {
    if (hidden && (!mobile.matches || document.querySelector('dialog[open]'))) return;
    if (shell.classList.contains('book-chrome-hidden')===hidden) return;
    shell.classList.toggle('book-chrome-hidden',hidden);chrome.inert=hidden;restore.hidden=!hidden;
    distance=0;settling=performance.now()+350;
  }
  restore.addEventListener('click',()=>show(false),{signal});
  shell.querySelector('#book-hide-controls').addEventListener('click',()=>{stage.focus({preventScroll:true});show(true);},{signal});
  chrome.addEventListener('focusin',()=>show(false),{signal});
  mobile.addEventListener('change',()=>{if(!mobile.matches)show(false);},{signal});
  stage.addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey)intent=performance.now()+1000;},{signal,passive:true});
  stage.addEventListener('touchstart',event=>{
    if(event.touches.length!==1){touch=null;intent=0;return;}
    if(chrome.contains(document.activeElement))document.activeElement.blur();
    touch={x:event.touches[0].clientX,y:event.touches[0].clientY};intent=performance.now()+1500;
  },{signal,passive:true});
  stage.addEventListener('touchmove',event=>{
    if(event.touches.length!==1){intent=0;touch=null;return;}
    if(touch&&Math.hypot(event.touches[0].clientX-touch.x,event.touches[0].clientY-touch.y)>8){moved=performance.now();intent=moved+1500;}
  },{signal,passive:true});
  stage.addEventListener('keydown',event=>{
    if(['ArrowDown','ArrowUp','PageDown','PageUp',' '].includes(event.key))intent=performance.now()+1000;
  },{signal});
  stage.addEventListener('scroll',()=>{
    const top=stage.scrollTop, delta=top-last;last=top;
    const now=performance.now();
    if(!mobile.matches||now>intent||now<settling||Math.abs(delta)<1)return;
    moved=now;intent=now+700;
    const sign=Math.sign(delta);distance=sign===direction?distance+Math.abs(delta):Math.abs(delta);direction=sign;
    if(top<8||sign<0&&distance>24)show(false);
    else if(sign>0&&distance>48&&!chrome.contains(document.activeElement))show(true);
  },{signal,passive:true});
  stage.addEventListener('click',event=>{
    if(!mobile.matches||performance.now()-moved<400||event.target.closest('a,button,input,select'))return;
    show(!shell.classList.contains('book-chrome-hidden'));
  },{signal});
}
