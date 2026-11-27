let sequence=0;
// A local exercise/book owns audio while its player is mounted. Returning to the
// catalogue restores the saved queue without autoplaying it.
export function claimAudioContext(signal) {
 const token=++sequence;
 document.dispatchEvent(new CustomEvent('learning-audio-context',{detail:{token,active:true}}));
 signal.addEventListener('abort',()=>document.dispatchEvent(new CustomEvent('learning-audio-context',{detail:{token,active:false}})),{once:true});
}
