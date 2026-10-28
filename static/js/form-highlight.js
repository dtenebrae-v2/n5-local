import { escapeHTML as esc } from './ui.js';

export const changed = value => `<strong class="ending-change">${esc(value)}</strong>`;

export function highlightedForm(value, original) {
  let common = 0;
  while (common < value.length && value[common] === original[common]) common++;
  return esc(value.slice(0, common)) + (common < value.length ? changed(value.slice(common)) : '');
}

export function highlightedRule(text) {
  const japanese = '[ぁ-ゖァ-ヺ一-鿿々ー・（）]+';
  const pairs = new RegExp(`(${japanese})\\s*→\\s*(${japanese})`, 'gu');
  let result = '', offset = 0;
  const terms = value => esc(value).replace(/[ぁ-ゖァ-ヺ一-鿿々ー]+/gu, token => /[一-鿿々]/u.test(token) ? token : changed(token));
  const paired = (value, original) => {
    const current = value.match(/^([^（）]+)（([^（）]+)）$/u);
    const before = original.match(/^([^（）]+)（([^（）]+)）$/u);
    return current && before
      ? highlightedForm(current[1], before[1]) + '（' + highlightedForm(current[2], before[2]) + '）'
      : highlightedForm(value, original);
  };
  for (const match of text.matchAll(pairs)) {
    result += terms(text.slice(offset, match.index));
    result += paired(match[1], match[2]) + ' → ' + paired(match[2], match[1]);
    offset = match.index + match[0].length;
  }
  return result + terms(text.slice(offset));
}

// Only explanatory prose: leave already highlighted examples and ordinary word labels alone.
export function highlightRuleParagraphs(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest('p') && !node.parentElement.closest('a, .ending-change')) nodes.push(node);
  }
  for (const node of nodes) {
    const template = document.createElement('template');
    template.innerHTML = highlightedRule(node.textContent);
    node.replaceWith(template.content);
  }
}
