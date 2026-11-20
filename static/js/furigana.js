import { makeReadingIndex, annotateText } from './furigana-core.js';
import { exerciseFor, FORM_LABELS } from './conjugation.js';
import { VERB_FORM_LABELS } from './verb-forms.js';

let index = new Map();
let activeObserver;
const excluded = 'ruby,rt,rp,.brand-mark,script,style,textarea,input,select,option,code,pre,svg,[data-furigana="off"],.pdfViewer,.textLayer,.kana,.romaji,.practice-reading';

export function updateFuriganaWords(entries) {
  const pairs = [['形容詞','けいようし'],['動詞','どうし'],['名詞','めいし'],['助詞','じょし'],['自動詞','じどうし'],['他動詞','たどうし'],['五段','ごだん'],['一段','いちだん'],['敬語','けいご'],['丁寧語','ていねいご'],['普通形','ふつうけい'],['辞書形','じしょけい'],['過去','かこ'],['否定','ひてい'],['現在','げんざい'],['未来','みらい']];
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
    const html = annotateText(node.textContent,index);
    if (!html.includes('<ruby>')) continue;
    const template = document.createElement('template');
    template.innerHTML = html;
    node.replaceWith(template.content);
  }
}

export function installFurigana(root, entries) {
  activeObserver?.disconnect();
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
