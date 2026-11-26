import { revealFeedback } from './learning-ui.js';
import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';
import { toKana, bind, unbind } from '../vendor/wanakana-5.3.1.js';

const KEY = 'n5-course-workbook-v1';
const LABELS = { translation:'Перевод', kana:'Кана', form:'Формы', number:'Числа', clock:'Время', 'written-number':'Числа кандзи', 'written-clock':'Время кандзи', worksheet:'Кандзи и письменные задания' };
const STATUSES = ['correct', 'review', 'self-correct', 'self-review'];
const normalized = text => text.normalize('NFKC').replace(/[\s。、.!?！？]/gu, '');

export function checkWorkbookAnswer(item, value) {
  if (!item.answers) return null;
  const actual = normalized(value);
  // Roman input is converted to the script requested by the exercise.
  const kana = normalized(toKana(value.replace(/[A-Z]/g, ch => ch.toLowerCase())));
  const converted = item.script === 'katakana' && /[a-z]/i.test(value)
    ? kana.replace(/[ぁ-ゖ]/gu, ch => String.fromCharCode(ch.charCodeAt(0) + 96)) : kana;
  return item.answers.some(answer => normalized(answer) === actual || normalized(answer) === converted);
}

export function restoreWorkbookState(raw, items) {
  const state = { units:{}, filters:{}, answers:{} };
  if (!raw || typeof raw !== 'object') return state;
  for (const item of items) {
    const answer = raw.answers?.[item.id];
    if (answer && typeof answer === 'object') state.answers[item.id] = {
      value: typeof answer.value === 'string' ? answer.value.slice(0, 6000) : '',
      status: STATUSES.includes(answer.status) ? answer.status : null,
      revealed: answer.revealed === true,
      first: ['correct','review','answer'].includes(answer.first) ? answer.first : null,
    };
    const position = raw.units?.[item.unit];
    if (Number.isInteger(position) && position >= 0) state.units[item.unit] = position;
    const filter = raw.filters?.[item.unit];
    if (filter === 'all' || items.some(i => i.unit === item.unit && i.kind === filter)) state.filters[item.unit] = filter;
  }
  return state;
}

export async function mountCourseWorkbook(root, signal) {
  root.innerHTML = '<p class="loading">Открываем задания тетради…</p>';
  const book = await getJSON('/api/course-workbook', signal);
  if (signal.aborted) return;
  if (!book.available) {
    root.innerHTML = '<h1>Практика по тетради</h1><p>Тетрадь ещё не добавлена на этом устройстве.</p><a href="/jlpt/n5/course">К урокам</a>';
    return;
  }
  let raw;
  try { raw = JSON.parse(localStorage.getItem(KEY)); } catch { /* Storage may be blocked. */ }
  const state = restoreWorkbookState(raw, book.items);
  let unit = new URLSearchParams(location.search).get('lesson') || '0';
  if (!book.units.some(u => u.id === unit)) unit = '0';
  let filter = state.filters[unit] || 'all', storageError = false;
  let boundInput = null, composing = false;
  const releaseInput = () => {
    if (boundInput) unbind(boundInput);
    boundInput = null; composing = false;
  };
  signal.addEventListener('abort', releaseInput, { once:true });
  const answerFor = id => state.answers[id] ||= { value:'', status:null, revealed:false, first:null };
  const allItems = () => book.items.filter(item => item.unit === unit);
  const items = () => allItems().filter(item => filter === 'all' || item.kind === filter);
  const current = () => items()[Math.min(state.units[unit] || 0, items().length - 1)];
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageError = false; }
    catch { storageError = true; }
    const status = root.querySelector('#cw-storage');
    if (status) status.textContent = storageError ? 'Не удалось сохранить прогресс на устройстве.' : '';
  };
  const pictures = (keys, answer = false) => (keys || []).map((key, i) => `<a class="cw-image" href="${esc(book.assets[key].url)}" target="_blank" rel="noopener" aria-label="${answer?'Образец':'Задание'} · увеличить изображение ${i+1}"><img src="${esc(book.assets[key].url)}" alt="${answer?'Образец выполнения':'Условие письменного задания'} ${i+1}" loading="lazy"></a>`).join('');
  function render(focus = false) {
    releaseInput();
    const list = items(), item = current(), record = item ? answerFor(item.id) : null;
    const position = Math.min(state.units[unit] || 0, list.length - 1);
    const done = allItems().filter(i => answerFor(i.id).status).length;
    const kinds = [...new Set(allItems().map(i => i.kind))];
    const checked = record?.status === 'correct' || record?.status === 'review';
    root.innerHTML = `<div class="cw-page"><p><a href="/jlpt/n5/course${unit.startsWith('review')?'/reviews':''}?lesson=${encodeURIComponent(unit)}">← К правилам урока</a></p><h1>Практика по тетради</h1>
      <p id="cw-storage" role="status">${storageError?'Не удалось сохранить прогресс на устройстве.':''}</p>
      <div class="cw-selectors"><label>Урок<select id="cw-unit">${book.units.map(u=>`<option value="${esc(u.id)}" ${u.id===unit?'selected':''}>${esc(u.title)}</option>`).join('')}</select></label>
      <label>Задания<select id="cw-kind"><option value="all">Все задания</option>${kinds.map(k=>`<option value="${esc(k)}" ${filter===k?'selected':''}>${esc(LABELS[k] || k)}</option>`).join('')}</select></label></div>
      <p class="cw-progress">В этом уроке отмечено ${done} из ${allItems().length}. ${item?`Карточка ${position+1} из ${list.length}.`:''}</p>
      ${item ? `<article class="cw-card" data-item="${esc(item.id)}"><p class="cw-kind">${esc(LABELS[item.kind] || item.kind)} · № ${item.source.number || position+1}</p>
      <h2 ${['kana','number','clock','written-number','written-clock'].includes(item.kind) && !record.revealed ? 'data-furigana="off"' : ''}>${esc(item.prompt)}</h2>${pictures(item.images)}
      ${item.kind==='worksheet'&&item.note?`<p class="cw-note">${esc(item.note)}</p>`:''}
      <label class="practice-label" for="cw-answer">Ваш ответ${item.kind==='worksheet'?' или заметки (можно выполнить в тетради)':''}</label>
      <div class="practice-answer-line">${item.answers
        ? `<input id="cw-answer" class="practice-answer-input" type="text" lang="ja" maxlength="6000" spellcheck="false" autocapitalize="off" autocomplete="off" enterkeyhint="done" aria-describedby="cw-input-help" placeholder="Ромадзи или ${item.script==='katakana'?'катакана':'хирагана'}" value="${esc(record.value)}">`
        : `<textarea id="cw-answer" class="practice-answer-input" lang="ja" rows="${item.kind==='worksheet'?5:3}" maxlength="6000" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="cw-input-help" placeholder="Ромадзи или японский текст">${esc(record.value)}</textarea>`}</div>
      <p class="practice-help" id="cw-input-help">Ромадзи превращается в ${item.script==='katakana'?'катакану':'хирагану'} при вводе. Для では набирайте deha, для じゃ — ja.</p>
      <p class="practice-help">${item.answers?'Введите ответ каной или ромадзи. Проверка учитывает указанные варианты.':item.kind==='translation'?'Самопроверка: сравните свой ответ с образцом. В переводе возможны другие правильные формулировки.':'Выполните упражнение письменно и сравните каждую строку с образцом.'}</p>
      <div class="practice-actions">${item.answers?`<button class="primary" data-cw="check" ${record.revealed||checked?'disabled':''}>Проверить</button>`:''}<button class="secondary" data-cw="reveal" ${record.revealed?'disabled':''}>Показать ${item.answers?'ответ':'образец'}</button></div>
      <div id="cw-feedback" role="status">${checked?`<p>${record.status==='correct'?'Верно.':'Пока не совпадает с допустимыми ответами. Сравните с образцом.'}</p>`:''}</div>
      ${record.revealed?`<section class="cw-model" aria-label="Образец ответа"><h3>${item.answers?'Ответ':'Образец для самопроверки'}</h3><p lang="ja">${esc(item.answer)}</p>${pictures(item.answer_images,true)}${item.note&&item.kind!=='worksheet'?`<p class="cw-note">${esc(item.note)}</p>`:''}
      ${!item.answers?`<p>Как получилось у вас?</p><div class="cw-actions"><button class="secondary" data-cw="self-correct" aria-pressed="${record.status==='self-correct'}">Получилось</button><button class="secondary" data-cw="self-review" aria-pressed="${record.status==='self-review'}">Нужно повторить</button></div>`:''}</section>`:''}
      <nav class="cw-pager" aria-label="Карточки тетради"><button class="secondary" data-cw="previous" ${position<=0?'disabled':''}>← Назад</button><label>Карточка <input id="cw-position" type="number" inputmode="numeric" min="1" max="${list.length}" value="${position+1}"></label><button class="primary" data-cw="next" ${position>=list.length-1?'disabled':''}>Далее →</button></nav>
      </article>`:'<p>В этом разделе нет заданий.</p>'}</div>`;
    boundInput = root.querySelector('#cw-answer');
    if (boundInput) {
      bind(boundInput, { IMEMode:item.script==='katakana'?'toKatakana':'toHiragana' });
      if (checked) {
        boundInput.dataset.status = record.status==='correct'?'correct':'incorrect';
        boundInput.setAttribute('aria-invalid', String(record.status!=='correct'));
      }
    }
    if (focus) root.querySelector('#cw-answer')?.focus({ preventScroll:true });
  }
  root.addEventListener('compositionstart', event => {
    if (event.target.id==='cw-answer') composing = true;
  }, { signal });
  root.addEventListener('compositionend', event => {
    if (event.target.id==='cw-answer') composing = false;
  }, { signal });
  root.addEventListener('keydown', event => {
    if (event.target.id!=='cw-answer' || event.key!=='Enter' || event.shiftKey
        || event.isComposing || composing || event.target.tagName!=='INPUT') return;
    event.preventDefault();
    root.querySelector('[data-cw="check"]')?.click();
  }, { signal });
  root.addEventListener('input', event => {
    if (event.target.id !== 'cw-answer' || !current()) return;
    const record = answerFor(current().id);
    record.value = event.target.value;
    // Keep the first attempt; editing a draft does not erase a completed result.
    save();
  }, { signal });
  root.addEventListener('change', event => {
    if (event.target.id === 'cw-unit') {
      unit = event.target.value; filter = state.filters[unit] || 'all';
      history.replaceState({}, '', '/jlpt/n5/course/workbook?lesson=' + encodeURIComponent(unit));
      save(); render();
    } else if (event.target.id === 'cw-kind') {
      filter = event.target.value; state.filters[unit] = filter; state.units[unit] = 0; save(); render();
    } else if (event.target.id === 'cw-position') {
      state.units[unit] = Math.max(0, Math.min(items().length-1, Number(event.target.value)-1 || 0)); save(); render(true);
    }
  }, { signal });
  root.addEventListener('click', event => {
    const action = event.target.closest('[data-cw]')?.dataset.cw;
    const item = current(); if (!action || !item) return;
    if (composing) return;
    const record = answerFor(item.id);
    if (action === 'check') {
      if (!record.value.trim()) {
        root.querySelector('#cw-feedback').textContent = 'Сначала введите ответ или откройте образец.';
        root.querySelector('#cw-answer').focus(); revealFeedback(root.querySelector('#cw-feedback')); return;
      }
      if (!item.answers || record.revealed || record.status) return;
      if (/[a-z]/i.test(record.value)) {
        root.querySelector('#cw-feedback').textContent = 'Завершите ввод ромадзи или введите кану.';
        root.querySelector('#cw-answer').focus(); revealFeedback(root.querySelector('#cw-feedback')); return;
      }
      const correct = checkWorkbookAnswer(item, record.value);
      record.status = correct ? 'correct' : 'review'; record.first ||= record.status;
      record.revealed = true;
    } else if (action === 'reveal') {
      record.revealed = true; record.first ||= 'answer';
      if (item.answers) record.status ||= 'review';
    } else if (['self-correct','self-review'].includes(action)) {
      if (!record.revealed || item.answers) return;
      record.status = action;
    } else if (action === 'previous' || action === 'next') {
      state.units[unit] = Math.max(0, Math.min(items().length-1, (state.units[unit] || 0) + (action === 'next' ? 1 : -1)));
    }
    save(); render();
    const target = action === 'check' || action === 'reveal' ? '.cw-model' : '#cw-answer';
    if (action === 'check' || action === 'reveal') {
      const feedback = root.querySelector('#cw-feedback');
      revealFeedback(feedback?.textContent.trim() ? feedback : root.querySelector('.cw-model'));
    }
    else root.querySelector(target)?.scrollIntoView({block:'nearest'});
  }, { signal });
  render();
}
