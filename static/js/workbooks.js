import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';
import { highlightedRule } from './form-highlight.js';
import { mountShortcuts } from './training-shortcuts.js';
import { loadWorkbookProgress, saveWorkbookProgress, restoreWorkbookSession, workbookSession, recordWorkbookAnswer } from './workbook-progress.js';

const TOPICS = { kanji:'Кандзи', vocabulary:'Лексика', 'grammar-reading':'Грамматика и чтение', listening:'Аудирование' };
const STATUS = { correct:'Верно', incorrect:'Неверно', unknown:'Не знаю', answer:'Ответ открыт', skip:'Пропущено', ungraded:'Без автопроверки' };
export async function mountWorkbooks(root, signal, bookId) {
  root.innerHTML = '<p class="loading">Загружаем упражнения…</p>';
  if (!bookId) {
    const catalog = await getJSON('/api/workbooks', signal); if (signal.aborted) return;
    root.innerHTML = `<h1>Упражнения по книге</h1><div class="library-grid">${catalog.books.map(book => `<article class="library-card"><h2>${esc(book.title)}</h2><p>${book.year} · ${esc(book.publisher)} · ISBN ${esc(book.isbn)}</p><p>${book.questions} заданий · ${book.audio} аудиодорожек</p>${book.available ? `<a class="primary" href="/jlpt/n5/workbooks/${esc(book.id)}">Открыть</a>` : '<p>Учебные материалы не подключены.</p>'}</article>`).join('')}</div>`;
    return;
  }
  const book = await getJSON('/api/workbook?id=' + encodeURIComponent(bookId), signal); if (signal.aborted) return;
  const byId = new Map(book.items.map(q => [q.id,q]));
  const all = loadWorkbookProgress();
  if (!all.books || typeof all.books !== 'object' || Array.isArray(all.books)) all.books = {};
  const saved = all.books[bookId];
  const progress = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  all.books[bookId] = progress;
  for (const key of ['records','audio']) if (!progress[key] || typeof progress[key] !== 'object' || Array.isArray(progress[key])) progress[key] = {};
  let session = restoreWorkbookSession(progress.session, book.items), player = null, audioController = null, dialog = null, lastSave = 0;
  let week = [1,2,3,4,5,6].includes(progress.week) ? progress.week : 1;
  root.innerHTML = `<a class="library-back" href="/jlpt/n5/workbooks">← Учебники</a><h1>${esc(book.title)}</h1>
    <details class="workbook-credits"><summary>Издание и материалы</summary><p>${book.year} · ISBN ${esc(book.isbn)} · ${book.authors.map(esc).join(', ')} · ${esc(book.publisher)}</p><p>Личный учебный набор. Аудио загружено с сайта издателя для ISBN ${esc(book.audio_source.isbn)}; содержание 25 дорожек сопоставлено с заданиями издания ${book.year}.</p><p><a href="${esc(book.audio_source.url)}" target="_blank" rel="noreferrer">Аудио ASK ↗</a></p></details>
    <p id="workbook-storage" role="status"></p><div class="practice-actions workbook-toolbar"><button class="secondary" id="workbook-contents">Разделы</button><button class="secondary" id="workbook-resume" ${session ? '' : 'hidden'}>Продолжить занятие</button><button class="secondary" id="workbook-random">Случайные 10</button><button class="secondary" id="workbook-mistakes">Ошибки</button></div>
    <details id="game-options"><summary>Клавиатура</summary></details>
    <section id="workbook-picker"><div class="library-filters" role="group" aria-label="Неделя">${[1,2,3,4,5,6].map(n => `<button class="chip" data-week="${n}">Неделя ${n}</button>`).join('')}</div><div class="workbook-units" id="workbook-units"></div></section><section id="workbook-study" hidden></section>`;
  function save() {
    progress.session = session; progress.week = week;
    root.querySelector('#workbook-storage').textContent = saveWorkbookProgress(all) ? '' : 'Не удалось сохранить занятие в этом браузере.';
    root.querySelector('#workbook-resume').hidden = !session;
  }
  const shortcuts = mountShortcuts(root, all, save, signal, () => {});
  function media(key) { return book.assets[key]?.available ? book.assets[key].url : null; }
  function stopAudio() {
    if (!player) return;
    audioController?.abort();
    progress.audio ||= {};
    progress.audio[player.dataset.key] = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    player.pause(); player.removeAttribute('src'); player.load(); player = null; save();
  }
  function audioHTML(key) {
    return media(key) ? `<div class="workbook-audio"><audio id="workbook-audio" controls preload="metadata" data-key="${esc(key)}" src="${esc(media(key))}"></audio><div class="library-filters"><button class="secondary" data-audio="toggle" title="F3">Слушать / пауза · F3</button><button class="secondary" data-audio="restart">Сначала</button>${[.75,1,1.25].map(rate => `<button class="chip" data-audio-rate="${rate}" aria-pressed="false">${rate}×</button>`).join('')}</div><p id="workbook-audio-error" role="status"></p></div>` : '<p role="status">Аудиофайл недоступен.</p>';
  }
  function bindAudio() {
    player = root.querySelector('#workbook-audio'); if (!player) return;
    audioController = new AbortController();
    const audioOptions = { signal: audioController.signal };
    const persistPosition = () => {
      if (!player || !Number.isFinite(player.currentTime)) return;
      progress.audio[player.dataset.key] = player.currentTime; save();
    };
    player.playbackRate = [.75,1,1.25].includes(progress.rate) ? progress.rate : 1;
    root.querySelectorAll('[data-audio-rate]').forEach(b => { const active = Number(b.dataset.audioRate) === player.playbackRate; b.classList.toggle('selected',active); b.setAttribute('aria-pressed',String(active)); });
    player.addEventListener('loadedmetadata', () => {
      const offset = progress.audio?.[player.dataset.key];
      if (Number.isFinite(offset) && offset >= 0 && offset < player.duration) player.currentTime = offset;
    }, audioOptions);
    player.addEventListener('timeupdate', () => {
      if (Date.now() - lastSave < 1000) return;
      lastSave = Date.now(); persistPosition();
    }, audioOptions);
    for (const event of ['seeked','pause','ended']) player.addEventListener(event, persistPosition, audioOptions);
    window.addEventListener('pagehide', persistPosition, audioOptions);
    player.addEventListener('error', () => { if (root.querySelector('#workbook-audio-error')) root.querySelector('#workbook-audio-error').textContent = 'Не удалось воспроизвести файл.'; }, audioOptions);
  }
  function showContents() {
    stopAudio(); root.querySelector('#workbook-picker').hidden = false; root.querySelector('#workbook-study').hidden = true;
    root.querySelectorAll('[data-week]').forEach(b => { const selected = Number(b.dataset.week) === week; b.classList.toggle('selected',selected); b.setAttribute('aria-pressed',String(selected)); });
    root.querySelector('#workbook-units').innerHTML = book.units.filter(u => u.week === week).map(unit => {
      const done = unit.questions.filter(id => progress.records[id]?.status === 'correct').length;
      return `<article class="library-card"><p>${esc(TOPICS[unit.topic])} · день ${unit.day} · стр. ${unit.pages.join(', ')}</p><h2 lang="ja">${esc(unit.title)}</h2><p>${unit.questions.length ? `${unit.questions.length} заданий · верно с первой попытки: ${done}` : 'Справка'}</p><button class="primary" data-unit="${esc(unit.id)}">Открыть</button></article>`;
    }).join(''); save();
  }
  function current() { return byId.get(session?.keys[session.index]); }
  function result(q = current()) { return session.answers[q.id] ||= {choice:null,status:null,first:null,firstChoice:null,assisted:false}; }
  function referenceHTML(unit) {
    return `<h3 lang="ja">${esc(unit.title)}</h3>${(unit.reference || []).map(text => `<p>${highlightedRule(text)}</p>`).join('')}
      ${unit.topic === 'kanji' ? `<table class="counter-table"><thead><tr><th>Слово</th><th>Чтение</th></tr></thead><tbody>${book.items.filter(q => q.unit === unit.id && q.kind === 'reading-kanji').map(q => `<tr><th lang="ja">${esc(q.target)}</th><td lang="ja">${esc(q.choices[q.correct])}</td></tr>`).join('')}</tbody></table>` : ''}`;
  }
  function openReference() {
    const q = current(); if (!q || dialog?.open) return;
    if (!result().first) result().assisted = true;
    save(); const unit = book.units.find(u => u.id === q.unit);
    dialog = document.createElement('dialog'); dialog.className = 'practice-dialog'; dialog.setAttribute('aria-labelledby','workbook-rules-title');
    dialog.innerHTML = `<div class="practice-header"><h2 id="workbook-rules-title">Справка</h2><button class="practice-close" aria-label="Закрыть справку">×</button></div>${referenceHTML(unit)}`;
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { dialog.remove(); if (!signal.aborted) root.querySelector('#workbook-check')?.focus(); }, {once:true});
    document.body.append(dialog); dialog.showModal();
  }
  function start(items, title, random = false, limit = items.length) {
    if (!items.length) { root.querySelector('#workbook-storage').textContent = 'Ошибок для повторения пока нет.'; return; }
    stopAudio(); session = workbookSession(items,title,random,limit); save(); renderStudy();
  }
  function startUnit(id) {
    const unit = book.units.find(u => u.id === id); if (!unit) return;
    if (unit.questions.length) start(unit.questions.map(id => byId.get(id)), `Неделя ${unit.week} · день ${unit.day}`);
    else {
      stopAudio(); root.querySelector('#workbook-picker').hidden = true;
      const study = root.querySelector('#workbook-study'); study.hidden = false;
      study.innerHTML = `<h2>${esc(TOPICS[unit.topic])} · день ${unit.day}</h2>${unit.audio ? audioHTML(unit.audio) : ''}<div class="workbook-reference">${referenceHTML(unit)}</div>`;
      bindAudio();
    }
  }
  function promptHTML(q) {
    if (!q.target) return esc(q.prompt);
    const offset = q.prompt.indexOf(q.target);
    return esc(q.prompt.slice(0,offset)) + `<mark>${esc(q.target)}</mark>` + esc(q.prompt.slice(offset + q.target.length));
  }
  function choiceText(q, choice) { return q.spoken_choices?.[choice] || q.choices[choice] || '—'; }
  function choiceImage(q, choice) {
    const key = q.choice_images?.[choice];
    return key && media(key) ? `<img src="${esc(media(key))}" alt="Вариант ${choice + 1}" loading="lazy">` : '';
  }
  function feedback(q) {
    const record = result(q), box = root.querySelector('#workbook-feedback');
    if (!record.status) { box.innerHTML = ''; delete box.dataset.status; return; }
    const known = q.correct !== null;
    box.dataset.status = record.status;
    box.innerHTML = `<strong>${STATUS[record.status]}</strong>
      <p class="workbook-user">Ваш ответ: <span lang="ja">${record.choice === null ? '—' : esc(choiceText(q,record.choice))}</span>${record.choice === null || record.choice === q.correct ? '' : choiceImage(q,record.choice)}</p>
      ${known ? `<p class="workbook-correct">Правильный ответ: <span lang="ja">${esc(choiceText(q,q.correct))}</span>${choiceImage(q,q.correct)}</p>` : '<p>В PDF нет ключа к этому заданию. Ответ сохранён без оценки.</p>'}
      ${q.order ? `<p lang="ja">${q.order.map(i => esc(q.choices[i-1])).join(' → ')}</p>` : ''}
      ${q.kind === 'listening' ? `<details><summary>Разбор записи</summary><p lang="ja">${esc(q.spoken_prompt)}</p>${q.spoken_choices ? `<ol lang="ja">${q.spoken_choices.map(c => `<li>${esc(c)}</li>`).join('')}</ol>` : ''}<p lang="ja">${esc(q.explanation)}</p></details>` : ''}`;
  }
  function renderStudy() {
    stopAudio(); root.querySelector('#workbook-picker').hidden = true;
    const study = root.querySelector('#workbook-study'); study.hidden = false;
    const q = current();
    if (!q) {
      const checked = session.keys.filter(id => byId.get(id).correct !== null);
      const correct = checked.filter(id => session.answers[id]?.first === 'correct' && !session.answers[id]?.assisted).length;
      study.innerHTML = `<h2 id="workbook-summary" tabindex="-1">Результат: ${correct} из ${checked.length} с первой попытки без подсказок</h2>${checked.length < session.keys.length ? `<p>Без ключа: ${session.keys.length - checked.length}.</p>` : ''}<div class="counter-results">${session.keys.map(id => {
        const item = byId.get(id), r = session.answers[id], status = r?.first || 'skip';
        return `<article class="counter-result" data-result="${status}"><h3>Стр. ${item.page} · № ${esc(item.number)}</h3><p>${STATUS[status]}${r?.assisted ? ' · С подсказкой' : ''}</p><p lang="ja">${esc(item.prompt)}</p><p class="counter-user">Первая попытка: <span lang="ja">${r?.firstChoice === null || r?.firstChoice === undefined ? '—' : esc(choiceText(item,r.firstChoice))}</span></p>${item.correct !== null ? `<p class="counter-correct" lang="ja">${esc(choiceText(item,item.correct))}${choiceImage(item,item.correct)}</p>` : '<p>Ключ отсутствует.</p>'}</article>`;
      }).join('')}</div>`;
      study.querySelector('h2').focus(); save(); return;
    }
    const r = result(q);
    study.innerHTML = `<p class="counter-progress">${esc(session.title)} · задание ${session.index + 1} из ${session.keys.length} · стр. ${q.page} · ${q.example ? 'Пример' : '№ ' + esc(q.number)}</p>
      <article class="game-card workbook-question" tabindex="-1"><p class="practice-help">${esc(q.instruction)}</p>
        ${q.audio ? audioHTML(q.audio) : ''}${q.passage ? `<div class="workbook-passage" lang="ja">${esc(q.passage)}</div>` : ''}
        <h2 class="workbook-prompt" lang="${q.kind === 'listening' ? 'ru' : 'ja'}">${promptHTML(q)}</h2>
        ${q.image && media(q.image) ? `<img class="workbook-illustration" src="${esc(media(q.image))}" alt="Иллюстрация к заданию">` : ''}
        <div class="workbook-choices ${q.choice_images ? 'workbook-visual-choices' : ''}" role="group" aria-label="Варианты ответа">${q.choices.map((choice,i) => `<button type="button" class="secondary" data-workbook-choice="${i}" aria-pressed="${r.choice === i}"><span class="workbook-choice-number">${i+1}</span>${choiceImage(q,i) || `<span lang="ja">${esc(choice)}</span>`}</button>`).join('')}</div>
        <p id="workbook-selection-status" role="status"></p>
        <div class="workbook-actions"><button class="primary" id="workbook-check">Проверить</button><button class="secondary" id="workbook-next">Дальше</button><button class="secondary" id="workbook-reveal">Показать ответ</button><button class="secondary" id="workbook-rules">Правила</button><button class="secondary" id="workbook-unknown">Не знаю</button></div>
        <div id="workbook-feedback" role="status" aria-live="polite"></div></article>`;
    bindAudio(); feedback(q); root.querySelector('.workbook-question').focus({preventScroll:true}); study.scrollIntoView({block:'start',behavior:'instant'}); save();
  }
  function submit(status = null) {
    const q = current(); if (!q || root.querySelector('#workbook-study').hidden) return;
    const r = result(q);
    if (!status && r.choice === null) { root.querySelector('#workbook-selection-status').textContent = 'Выберите ответ.'; return; }
    recordWorkbookAnswer(progress,session,q,q.correct === null ? 'ungraded' : status || (r.choice === q.correct ? 'correct' : 'incorrect'),r.choice);
    feedback(q); save();
  }
  function next() {
    const q = current(); if (!q) return;
    if (!result(q).first) recordWorkbookAnswer(progress,session,q,'skip',result(q).choice);
    session.index++; save(); renderStudy();
  }
  async function toggleAudio() {
    if (!player) return;
    if (!player.paused) player.pause(); else try { await player.play(); }
    catch { root.querySelector('#workbook-audio-error').textContent = 'Не удалось начать воспроизведение. Нажмите кнопку плеера.'; }
  }
  root.addEventListener('click', event => {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.week) { week = Number(b.dataset.week); showContents(); }
    if (b.dataset.unit) startUnit(b.dataset.unit);
    if (b.id === 'workbook-contents') showContents();
    if (b.id === 'workbook-resume' && session) renderStudy();
    if (b.id === 'workbook-random') start(book.items.filter(q => q.correct !== null && !q.example),'Случайные задания',true,10);
    if (b.id === 'workbook-mistakes') start(book.items.filter(q => ['incorrect','unknown','answer'].includes(progress.records[q.id]?.status)), 'Повторение ошибок',true);
    if (b.hasAttribute('data-workbook-choice') && current()) {
      const r = result(); r.choice = Number(b.dataset.workbookChoice); r.status = null;
      root.querySelectorAll('[data-workbook-choice]').forEach(button => button.setAttribute('aria-pressed',String(button === b)));
      root.querySelector('#workbook-selection-status').textContent = ''; feedback(current()); save();
    }
    if (b.id === 'workbook-check') submit();
    if (b.id === 'workbook-reveal') submit('answer');
    if (b.id === 'workbook-unknown') submit('unknown');
    if (b.id === 'workbook-next') next();
    if (b.id === 'workbook-rules') openReference();
    if (b.dataset.audio === 'toggle') toggleAudio();
    if (b.dataset.audio === 'restart' && player) { player.currentTime = 0; progress.audio ||= {}; progress.audio[player.dataset.key] = 0; save(); }
    if (b.dataset.audioRate && player) { progress.rate = Number(b.dataset.audioRate); player.playbackRate = progress.rate; root.querySelectorAll('[data-audio-rate]').forEach(button => { const active = button === b; button.classList.toggle('selected',active); button.setAttribute('aria-pressed',String(active)); }); save(); }
  }, {signal});
  document.addEventListener('keydown', event => {
    if (event.isComposing || signal.aborted || shortcuts.handleCapture(event) || document.querySelector('dialog[open]')) return;
    if (root.querySelector('#workbook-study').hidden || event.target.closest('#game-options')) return;
    if (!root.querySelector('.workbook-question')) { if(event.key === 'F3' && player) { event.preventDefault(); toggleAudio(); } return; }
    if (shortcuts.matches('next',event) && current()) { event.preventDefault(); next(); }
    else if (shortcuts.matches('rules',event) && current()) { event.preventDefault(); openReference(); }
    else if (shortcuts.matches('unknown',event) && current()) { event.preventDefault(); submit('unknown'); }
    else if (event.key === 'F3' && player) { event.preventDefault(); toggleAudio(); }
    else if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && /^[1-4]$/.test(event.key) && current()) {
      event.preventDefault(); root.querySelector(`[data-workbook-choice="${Number(event.key)-1}"]`)?.click();
    } else if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && current() && (event.target.closest('[data-workbook-choice]') || !event.target.closest('button,a,details,audio'))) { event.preventDefault(); submit(); }
  }, {signal});
  signal.addEventListener('abort', () => { stopAudio(); dialog?.close(); }, {once:true});
  showContents();
}
