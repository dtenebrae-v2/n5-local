import { verbForms, GODAN_ROWS, VERB_FORM_LABELS } from './verb-forms.js';
import { readingOf } from './conjugation.js';
import { escapeHTML as esc } from './ui.js';
import { openPractice } from './practice.js';

const LABELS = { dictionary: 'Словарная форма', masu: 'Вежливая · ます',
  past: 'Вежливое прошедшее', negative: 'Вежливое отрицание', past_negative: 'Вежливое прошедшее отрицание',
  ...VERB_FORM_LABELS };
export const verbSources = `<p class="practice-help">Источники:
  <a href="https://www.coelang.tufs.ac.jp/mt/ja/gmod/contents/explanation/039.html" target="_blank" rel="noreferrer">TUFS: группы и основы</a> ·
  <a href="https://www.tofugu.com/japanese-grammar/verb-negative-nai-form/" target="_blank" rel="noreferrer">ない</a> ·
  <a href="https://www.tofugu.com/japanese-grammar/verb-conditional-form-ba/" target="_blank" rel="noreferrer">ば</a> ·
  <a href="https://www.tofugu.com/japanese-grammar/verb-volitional-form-you/" target="_blank" rel="noreferrer">Намерение</a> ·
  <a href="https://www.tofugu.com/japanese-grammar/verb-command-form-ro/" target="_blank" rel="noreferrer">Приказ</a> ·
  <a href="https://www.jpf.go.jp/j/project/japanese/teach/tsushin/grammar/201603.html" target="_blank" rel="noreferrer">Japan Foundation: употребление приказа</a></p>`;

function highlighted(value, reading) {
  let common = 0;
  while (common < value.length && value[common] === reading[common]) common++;
  return esc(value.slice(0, common)) + `<strong>${esc(value.slice(common))}</strong>`;
}
function formRows(data, reading, practice = false) {
  return `<dl class="verb-form-list">${Object.entries(LABELS).map(([id, label]) => `<div>
    <dt>${label}</dt><dd lang="ja">${data.forms[id].map(value => highlighted(value, reading)).join(' / ')}</dd>
    ${practice && !['dictionary', 'masu'].includes(id) ? `<button class="practice-launch" data-train-form="${id}">Практика</button>` : ''}
  </div>`).join('')}</dl>`;
}
export function openVerbReference(entry, signal) {
  const reading = readingOf(entry);
  const data = verbForms(reading, entry.type);
  if (!data || signal.aborted) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'practice-dialog verb-reference';
  dialog.setAttribute('aria-labelledby', 'verb-reference-title');
  dialog.innerHTML = `<div class="practice-header"><div><p class="eyebrow">${esc(data.group)} · СПРАВКА</p>
    <h2 id="verb-reference-title">Спряжение: ${esc(entry.kanji)}</h2></div>
    <button class="practice-close" aria-label="Закрыть справку">×</button></div>
    <p class="practice-meaning">${esc(reading)} · ${esc(entry.meaning)}</p>
    <p>Перед ます: <b lang="ja">${esc(data.masuStem)}</b>. Перед ない: <b lang="ja">${esc(data.naiStem)}</b>${reading === 'ある' ? ' (но отрицание ある — ない)' : ''}.</p>
    <p class="practice-help">Изменённая часть выделена жирным. Приказ — прямая команда, не вежливая просьба. Варианты на よ / せよ — книжные.</p>
    ${formRows(data, reading, true)}
    <a class="lesson-link" href="/jlpt/n5/grammar/verbs/forms#${data.group.toLowerCase()}">Основы и правила ${esc(data.group)} →</a>${verbSources}`;
  document.body.append(dialog);
  const close = () => dialog.close();
  dialog.querySelector('.practice-close').addEventListener('click', close);
  let nextForm;
  dialog.addEventListener('click', event => {
    const button = event.target.closest('[data-train-form]');
    if (button) { nextForm = button.dataset.trainForm; close(); }
  });
  signal.addEventListener('abort', close, { once: true });
  dialog.addEventListener('close', () => {
    signal.removeEventListener('abort', close);
    dialog.remove();
    if (nextForm && !signal.aborted) openPractice(entry, 'verb', signal, nextForm);
  }, { once: true });
  dialog.showModal();
}

export function verbReferenceLesson() {
  const examples = [['かう', 'Godan'], ['たべる', 'Ichidan'], ['する', 'Irregular'], ['くる', 'Irregular']];
  return `<article class="lesson" lang="ru">
    <p>Основа — часть, к которой добавляется окончание: かい ＋ ます → かいます.
    Словарная форма, приказ и намерение — уже готовые формы. Поэтому здесь они показаны отдельно от основ.</p>
    <h2 id="godan">Godan · 五段 · группа 1</h2>
    <p>Меняется последний слог. В таблице — соответствия рядов あ・い・う・え・お; перед ない конечное う переходит в わ.</p>
    <div class="table-scroll"><table><thead><tr><th>Словарное окончание</th><th>Перед ない</th><th>Перед ます</th><th>Перед ば / приказ</th><th>Перед う (намерение)</th></tr></thead>
    <tbody>${Object.entries(GODAN_ROWS).map(([u, [a, i, e, o]]) => `<tr>${[u,a,i,e,o].map(x => `<td lang="ja">${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p>Пример: かう → かわない・かいます・かえば・かえ・かおう. Отрицание ある — ない.</p>
    <h2 id="ichidan">Ichidan · 一段 · группа 2</h2>
    <p>Уберите конечное る: たべる → たべ. Добавьте ない, ます, た, て, れば или よう.
    Приказ: たべろ (книжное たべよ). Исключение: くれる → くれ.</p>
    <p>Окончание いる / える не гарантирует Ichidan: かえる «возвращаться», きる «резать», いる «нуждаться» — Godan. Группа хранится в словаре.</p>
    <h2 id="irregular">Неправильные · группа 3</h2>
    <p>する: しない・します・すれば・しろ / せよ・しよう.
    くる: こない・きます・くれば・こい・こよう. Здесь меняется и чтение основы.</p>
    <h2>て и обычное прошедшее た</h2>
    <p>Godan: う・つ・る → って / った; む・ぶ・ぬ → んで / んだ;
    く → いて / いた; ぐ → いで / いだ; す → して / した.
    Исключение: いく → いって / いった. Ichidan: убрать る, добавить て / た.
    する → して / した; くる → きて / きた.</p>
    <h2>Как читать формы</h2>
    <p>Условие с ば и приказ различаются: たべれば — «если съесть», たべろ — «ешь!». Приказ не заменяет вежливую просьбу.
    Намерение / предложение: たべよう — «давай поедим». Это дополнительные формы, а не только начальный набор N5.</p>
    <div class="verb-examples">${examples.map(([reading, group]) => `<details><summary>${reading} · ${group}</summary>${formRows(verbForms(reading, group), reading)}</details>`).join('')}</div>
    ${verbSources}<a class="lesson-link" href="/jlpt/n5/vocabulary/verbs">Открыть глаголы и практику →</a></article>`;
}
