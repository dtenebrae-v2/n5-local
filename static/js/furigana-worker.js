// Classic worker: dictionary loading and tokenization stay off the UI thread.
importScripts('/vendor/kuromoji-0.1.2/kuromoji.js');
let tokenizer;
const waiting = [];
function analyze(request) {
  try {
    postMessage({id:request.id, tokens:tokenizer.tokenize(request.text).map(t => ({surface_form:t.surface_form, reading:t.reading}))});
  } catch { postMessage({id:request.id, error:true}); }
}
onmessage = ({data}) => tokenizer ? analyze(data) : waiting.push(data);
kuromoji.builder({dicPath:'/vendor/kuromoji-0.1.2/dict/'}).build((error, value) => {
  if (error) { postMessage({error:true}); return; }
  tokenizer = value;
  for (const request of waiting.splice(0)) analyze(request);
});
