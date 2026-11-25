import { makeReadingIndex, annotateText, annotateTokens } from './furigana-core.js';
import { exerciseFor, FORM_LABELS } from './conjugation.js';
import { VERB_FORM_LABELS } from './verb-forms.js';

let index = new Map();
let activeObserver;
let worker, sequence = 0, failed = false;
const pending = new Map(), cache = new Map();
let ambiguous = new Set();
let counterPairs = [];
const excluded = 'ruby,rt,rp,.brand-mark,script,style,textarea,input,select,option,code,pre,svg,[data-furigana="off"],[data-auto-furigana],.pdfViewer,.textLayer,.kana,.romaji,.practice-reading';

function analyze(span, text) {
  if (ambiguous.has(text.trim()) || failed || typeof Worker === 'undefined') return;
  if (cache.has(text)) { span.innerHTML = cache.get(text); return; }
  if (!worker) {
    worker = new Worker('/js/furigana-worker.js');
    worker.onmessage = ({data}) => {
      if (data.error && !data.id) { failed = true; pending.clear(); worker.terminate(); return; }
      const request = pending.get(data.id); pending.delete(data.id);
      if (!request || data.error) return;
      const html = annotateTokens(request.text,data.tokens,index);
      if (cache.size > 4000) cache.delete(cache.keys().next().value);
      cache.set(request.text,html);
      if (request.span.isConnected && !request.span.closest('[data-furigana="off"]')) request.span.innerHTML = html;
    };
    worker.onerror = () => { failed = true; pending.clear(); worker.terminate(); };
  }
  for (const [id,request] of pending) if (!request.span.isConnected) pending.delete(id);
  const id = ++sequence; pending.set(id,{span,text}); worker.postMessage({id,text});
}

export function updateFuriganaWords(entries) {
  const pairs = [...counterPairs,['聴解','ちょうかい'],['形容詞','けいようし'],['動詞','どうし'],['名詞','めいし'],['助詞','じょし'],['自動詞','じどうし'],['他動詞','たどうし'],['五段','ごだん'],['一段','いちだん'],['敬語','けいご'],['丁寧語','ていねいご'],['普通形','ふつうけい'],['辞書形','じしょけい'],['過去','かこ'],['否定','ひてい'],['現在','げんざい'],['未来','みらい']];
  for (const entry of entries) {
    // Multiple readings of a single word also need explicit context: do not guess.
    for (const reading of entry.readings || []) pairs.push([entry.kanji,reading.kana]);
    const kind = entry.practice_kind;
    if (!kind) continue;
    const forms = kind === 'verb' ? {...FORM_LABELS,...VERB_FORM_LABELS} : FORM_LABELS;
    for (const form of Object.keys(forms)) {
      const exercise = exerciseFor(entry,kind,form);
      for (const display of exercise?.displayAnswers || []) {
        const match = display.match(/^(.*?)（([ぁ-ゖー]+)）$/u);
        if (match) {
          pairs.push([match[1],match[2]]);
          if (match[1].endsWith('です') && match[2].endsWith('です')) pairs.push([match[1].slice(0,-2),match[2].slice(0,-2)]);
        }
      }
    }
  }
  index = makeReadingIndex(pairs);
  cache.clear();
  const readings = new Map();
  for (const [written,reading] of pairs) {
    if (!readings.has(written)) readings.set(written,new Set());
    readings.get(written).add(reading);
  }
  ambiguous = new Set([...readings].filter(([,values]) => values.size > 1).map(([written]) => written));
}

export function annotateFurigana(root) {
  if (!root || (root.nodeType === 1 && root.closest(excluded))) return;
  const nodes = [];
  if (root.nodeType === 3) nodes.push(root);
  else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) nodes.push(walker.currentNode);
  }
  for (const node of nodes) {
    if (!node.parentElement || node.parentElement.closest(excluded) || !/[\p{Script=Han}々]/u.test(node.textContent)) continue;
    const text = node.textContent;
    const span = document.createElement('span'); span.dataset.autoFurigana = '';
    span.innerHTML = annotateText(text,index);
    node.replaceWith(span); analyze(span,text);
  }
}

export function installFurigana(root, entries, counters = []) {
  activeObserver?.disconnect();
  counterPairs = counters.flatMap(counter => counter.forms.flatMap(form => {
    if (counter.id === 'dates' && form.number === 1) return []; // ついたち / いちにち requires context.
    const digits = String(form.number), wide = digits.replace(/\d/g,c => String.fromCharCode(c.charCodeAt(0)+0xfee0));
    return [form.written,digits+counter.symbol,wide+counter.symbol].map(written => [written,form.readings[0]]);
  }));
  updateFuriganaWords(entries);
  annotateFurigana(root);
  const observer = new MutationObserver(records => {
    const pending = new Set();
    for (const record of records) {
      if (record.type === 'characterData') pending.add(record.target);
      else for (const node of record.addedNodes) pending.add(node);
    }
    for (const node of pending) if (node.isConnected) annotateFurigana(node);
  });
  activeObserver = observer;
  observer.observe(root,{childList:true,subtree:true,characterData:true});
  return () => observer.disconnect();
}
