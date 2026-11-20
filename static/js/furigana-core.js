import { escapeHTML as esc } from './ui.js';

const han = /[\p{Script=Han}々〆ヶヵ]/u;
const compound = /[\p{Script=Han}々〆ヶヵ\d]/u;
const kana = text => text.normalize('NFKC').replace(/[~～〜]/gu, '〜').replace(/[ァ-ヶ]/gu, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const ruby = (base, reading) => `<ruby>${esc(base)}<rp>（</rp><rt>${esc(reading)}</rt><rp>）</rp></ruby>`;

// Align kana anchors and retain okurigana outside ruby. Reject ambiguous or mismatched alignment.
export function rubyText(written, reading) {
  const text = String(written ?? '');
  let yomi = kana(String(reading ?? '').trim());
  if (!/^[~～〜]/u.test(text)) yomi = yomi.replace(/^〜/u,'');
  if (!han.test(text) || !yomi || /[^ぁ-ゖー〜\s\p{P}\p{N}＿_]/u.test(yomi)) return esc(text);
  const parts = text.match(/[\p{Script=Han}々〆ヶヵ\d]+|[^\p{Script=Han}々〆ヶヵ\d]+/gu) || [];
  const memo = new Map();
  function align(index, offset) {
    const key = `${index}:${offset}`;
    if (memo.has(key)) return memo.get(key);
    if (index === parts.length) return offset === yomi.length ? [[]] : [];
    const part = parts[index], results = [];
    if (!han.test(part)) {
      const literal = kana(part);
      if (yomi.startsWith(literal, offset)) {
        for (const rest of align(index + 1, offset + literal.length)) results.push([{text:part}, ...rest]);
      }
    } else {
      for (let end = offset + 1; end <= yomi.length; end++) {
        const sound = yomi.slice(offset,end);
        if (!/^[ぁ-ゖー]+$/u.test(sound)) break;
        for (const rest of align(index + 1,end)) {
          results.push([{text:part,reading:sound},...rest]);
          if (results.length > 1) break;
        }
        if (results.length > 1) break;
      }
    }
    memo.set(key, results.slice(0,2));
    return memo.get(key);
  }
  const matches = align(0,0);
  if (matches.length !== 1) return esc(text);
  return matches[0].map(p => p.reading ? ruby(p.text,p.reading) : esc(p.text)).join('');
}

export function makeReadingIndex(pairs) {
  const values = new Map();
  for (const [written,reading] of pairs) {
    if (!written || !reading || !han.test(written)) continue;
    const yomi = kana(reading);
    if (!/^[ぁ-ゖー]+$/u.test(yomi)) continue;
    if (!values.has(written)) values.set(written,new Set());
    values.get(written).add(yomi);
  }
  const index = new Map();
  for (const [written,readings] of values) {
    if (readings.size !== 1) continue; // 入る / 生 etc. need an authored, context-specific reading.
    const reading = [...readings][0], html = rubyText(written,reading);
    if (!html.includes('<ruby>')) continue;
    if (!index.has(written[0])) index.set(written[0],[]);
    index.get(written[0]).push({written,html});
  }
  for (const bucket of index.values()) bucket.sort((a,b) => b.written.length - a.written.length);
  return index;
}

export function annotateText(text, index) {
  let result = '', start = 0;
  while (start < text.length) {
    const entry = (index.get(text[start]) || []).find(item => text.startsWith(item.written,start)
      && !(start > 0 && compound.test(text[start-1])) && !compound.test(text[start + item.written.length] || ''));
    if (entry) { result += entry.html; start += entry.written.length; }
    else { result += esc(text[start]); start++; }
  }
  return result;
}

// Existing answer models store their verified reading as written（kana）.
export function rubyDisplay(value) {
  const text = String(value ?? '');
  const match = text.match(/^(.*?)（([ぁ-ゖァ-ヶー]+)）$/u);
  if (!match) return esc(text);
  const html = rubyText(match[1],match[2]);
  return html.includes('<ruby>') ? `${html}<span class="answer-reading">（${esc(match[2])}）</span>` : esc(text);
}
