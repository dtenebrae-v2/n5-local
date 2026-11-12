import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';
import { mountShortcuts } from './training-shortcuts.js';
import { questionFragments, imageZoomDialog } from './exam-fragments.js';
import { examItems, practiceItems, newExamSession, restoreExamSession, answerRecord,
  checkPractice, beginExamSection, finishExamSection, expireExamSection, examSummary } from './exam-session.js';

const STORAGE = 'n5.exam-sets.v1';
const STATES = {correct:'Верно', incorrect:'Неверно', unknown:'Не знаю', revealed:'Ответ открыт', skip:'Пропущено', ungraded:'Без оценки'};
const HELP = {
  vocabulary:'В блоке 1 выберите чтение подчёркнутого слова, в блоке 2 — его написание. В блоке 3 заполните пропуск, в блоке 4 найдите близкое значение.',
  'grammar-reading':'В заданиях с ★ расположите все четыре фрагмента и выберите тот, который попадает под звёздочку. В заданиях на чтение используйте весь текст и таблицы на соседних страницах.',
  listening:'В блоках 1 и 2 выберите один из четырёх вариантов. В блоке 3 выберите реплику человека, указанного стрелкой. В блоке 4 вопрос и три варианта звучат только в записи.',
};
function readProgress() {
  try { const p = JSON.parse(localStorage.getItem(STORAGE)); if (p && typeof p === 'object' && !Array.isArray(p)) return p; } catch {}
  return {};
}
function duration(seconds) {
  const n = Math.max(0,Math.ceil(seconds)); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
}

export async function mountExamSets(root, signal, examId) {
  root.innerHTML = '<p class="loading">Загружаем варианты…</p>';
  if (!examId) {
    const catalog = await getJSON('/api/exams', signal); if (signal.aborted) return;
    root.innerHTML = `<h1>Экзаменационные варианты N5</h1><div class="practice-actions"><button class="primary" id="exam-mixed" ${catalog.sets.some(s => s.available && s.graded) ? '' : 'disabled'}>Смешанная тренировка</button></div><p id="exam-loading" role="status"></p><div class="library-grid">${catalog.sets.map(set => `<article class="library-card"><h2>${esc(set.title)}</h2>${set.available ? `<p>${set.questions} заданий · ${set.audioSeconds ? 'аудио ' + duration(set.audioSeconds) : 'аудио не связано'}</p><p>${set.graded === set.questions ? 'С ключами' : 'Без автоматической оценки'}${set.incomplete ? ' · Неполный набор' : ''}</p><a class="primary" href="/jlpt/n5/exams/${esc(set.id)}">Открыть</a>` : '<p>Материалы не подключены.</p>'}</article>`).join('')}</div>`;
    root.querySelector('#exam-mixed').addEventListener('click', async event => {
      event.target.disabled = true;
      root.querySelector('#exam-loading').textContent = 'Загружаем задания…';
      try {
        const sets = await Promise.all(catalog.sets.filter(s => s.available && s.graded).map(s => getJSON('/api/exam?id=' + s.id,signal)));
        if (signal.aborted) return;
        const mixed = {id:'mixed',title:'Смешанная тренировка N5',revision:sets.map(s => s.revision).join('|'),notes:[],sections:[{id:'mixed',title:'Все разделы',groups:[],seconds:0}]};
        mountPlayer(root,signal,mixed,sets,true);
      } catch (error) {
        if (!signal.aborted) { root.querySelector('#exam-loading').textContent = 'Не удалось загрузить задания. Повторите попытку.'; event.target.disabled = false; }
      }
    },{signal});
    return;
  }
  const exam = await getJSON('/api/exam?id=' + encodeURIComponent(examId),signal);
  if (!signal.aborted) mountPlayer(root,signal,exam,[exam],false);
}

function mountPlayer(root,signal,exam,sets,mixed) {
  const sources = new Map(sets.map(s => [s.id,s]));
  const items = sets.flatMap(examItems), byId = new Map(items.map(q => [q.id,q]));
  const progress = readProgress();
  for (const key of ['sessions','records','settings']) if (!progress[key] || typeof progress[key] !== 'object' || Array.isArray(progress[key])) progress[key] = {};
  let session = restoreExamSession(progress.sessions[exam.id],exam,byId);
  const requested=new URLSearchParams(location.search).get('section');
  let filter = ['vocabulary','grammar-reading','listening'].includes(requested) ? requested : ['all','vocabulary','grammar-reading','listening'].includes(progress.settings.filter) ? progress.settings.filter : 'all';
  let limit = [10,20,50].includes(progress.settings.limit) ? progress.settings.limit : 10;
  let player = null, playerEvents = null, dialog = null, lastAudioSave = 0, reviewId = null;
  root.innerHTML = `<a class="library-back" href="/jlpt/n5/exams">← Варианты N5</a><h1>${esc(exam.title)}</h1>
    ${exam.notes.map(note => `<p class="exam-note">${esc(note)}</p>`).join('')}
    ${mixed ? '' : `<details class="workbook-credits"><summary>Источник и состав</summary><p>${esc(exam.sourceNote)}</p>${exam.sections.map(s => `<p>${esc(s.title)}: ${s.groups.reduce((n,g) => n+g.items.length,0)} заданий · ${duration(s.seconds)}${s.missing.length ? ` · отсутствует: ${s.missing.length}` : ''}</p>`).join('')}${(exam.unavailableSections || []).map((s,i) => `<p>${esc(s.title)}: ${esc(s.reason)}</p><button class="secondary" data-exam-unavailable="${i}">Просмотреть страницы</button>`).join('')}<p>Материалы хранятся локально. Процент правильных ответов не является баллом JLPT.</p></details>`}
    <p id="exam-storage" role="status"></p><div class="practice-actions exam-toolbar"><button class="secondary" id="exam-contents">Настройки</button><button class="secondary" id="exam-resume" ${session ? '' : 'hidden'}>Продолжить</button></div>
    <details id="game-options"><summary>Клавиатура</summary></details><section id="exam-picker">
    <div class="library-filters" role="group" aria-label="Раздел тренировки">${[['all','Все'],['vocabulary','Лексика'],['grammar-reading','Грамматика и чтение'],['listening','Аудирование']].map(([id,label]) => `<button class="chip" data-exam-filter="${id}">${label}</button>`).join('')}</div>
    <div class="library-filters" role="group" aria-label="Количество заданий">${[10,20,50].map(n => `<button class="chip" data-exam-limit="${n}">${n}</button>`).join('')}</div>
    <p id="exam-pool"></p><div class="practice-actions"><button class="primary" id="exam-practice">Начать тренировку</button><button class="secondary" id="exam-errors">Повторить ошибки</button>${mixed ? '' : `<button class="secondary" id="exam-start">${exam.unavailableSections?.length || exam.sections.some(s => s.missing.length) ? 'Пройти доступные задания с таймером' : 'Пройти вариант с таймером'}</button>`}</div><p id="exam-picker-status" role="status"></p></section>
    <section id="exam-study" hidden></section>`;
  function save() {
    progress.sessions[exam.id] = session;
    progress.settings.filter = filter; progress.settings.limit = limit;
    try { localStorage.setItem(STORAGE,JSON.stringify(progress)); root.querySelector('#exam-storage').textContent = ''; }
    catch { root.querySelector('#exam-storage').textContent = 'Не удалось сохранить занятие в браузере.'; }
    root.querySelector('#exam-resume').hidden = !session;
  }
  const shortcuts = mountShortcuts(root,progress.settings,save,signal,() => {});
  function asset(q,key) {
    const a = sources.get(q.examId).assets[key]; return a?.available ? a : null;
  }
  function stopAudio() {
    if (!player) return;
    const old = player; playerEvents?.abort();
    if (session && Number.isFinite(old.currentTime)) session.audio[old.dataset.position] = old.currentTime;
    old.pause(); old.removeAttribute('src'); old.load(); player = null; save();
  }
  function picker() {
    stopAudio(); reviewId = null;
    root.querySelector('#exam-picker').hidden = false; root.querySelector('#exam-study').hidden = true;
    root.querySelectorAll('[data-exam-filter]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.examFilter === filter)));
    root.querySelectorAll('[data-exam-limit]').forEach(b => b.setAttribute('aria-pressed',String(Number(b.dataset.examLimit) === limit)));
    const pool = practiceItems(items.filter(q => filter === 'all' || q.sectionId === filter),items.length);
    root.querySelector('#exam-pool').textContent = `Доступно уникальных заданий с проверкой: ${pool.length}`;
    root.querySelector('#exam-practice').disabled = !pool.length;
    save();
  }
  function current() { return byId.get(reviewId || session?.keys[session.index]); }
  function isReview() { return !!reviewId; }
  function isPractice() { return session?.mode === 'practice' && !isReview(); }
  function start(mode, errors = false) {
    const pool = items.filter(q => (filter === 'all' || q.sectionId === filter) && (!errors || ['incorrect','unknown','revealed'].includes(progress.records[q.id]?.status)));
    const chosen = mode === 'exam' ? items : practiceItems(pool,limit);
    if (!chosen.length) { root.querySelector('#exam-picker-status').textContent = errors ? 'Ошибок для повторения нет.' : 'Нет заданий с проверенным ключом и аудиофрагментом.'; return; }
    const begin = () => { stopAudio(); session = newExamSession(exam,mode,chosen); reviewId = null; save(); render(); };
    if (session && !session.finished) confirmDialog('Начать новое занятие?', 'Текущее незавершённое занятие будет заменено.',begin); else begin();
  }
  function confirmDialog(title,text,callback) {
    if (dialog?.open) return;
    const back = document.activeElement;
    dialog = document.createElement('dialog'); dialog.className = 'practice-dialog';
    dialog.setAttribute('aria-labelledby','exam-dialog-title');
    dialog.innerHTML = `<h2 id="exam-dialog-title">${esc(title)}</h2><p>${esc(text)}</p><div class="practice-actions"><button class="secondary" data-cancel>Отмена</button><button class="primary" data-confirm>Подтвердить</button></div>`;
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.querySelector('[data-confirm]').onclick = () => { dialog.close(); callback(); };
    dialog.addEventListener('close',() => { dialog.remove(); if (back?.isConnected) back.focus({preventScroll:true}); },{once:true});
    document.body.append(dialog); dialog.showModal();
  }
  function audioHTML(q) {
    if (!q.audio) return '';
    const a = asset(q,q.audio);
    if (!a) return '<p role="status">Аудиофайл недоступен.</p>';
    const continuous = session.mode === 'exam' && !isReview();
    return `<div class="exam-audio"><audio id="exam-audio" ${continuous ? '' : 'controls'} preload="metadata" src="${esc(a.url)}" data-position="${esc(continuous ? q.examId : q.id)}"></audio><div class="practice-actions"><button class="secondary" id="exam-play">${continuous ? 'Включить запись' : 'Слушать / пауза · F3'}</button>${continuous ? '' : '<button class="secondary" id="exam-replay">Повторить фрагмент</button>'}</div>${continuous ? '<p>Запись проигрывается подряд. Таймер продолжает идти при выходе со страницы.</p>' : '<div class="library-filters" role="group" aria-label="Скорость записи">' + [.75,1,1.25].map(rate => `<button class="chip" data-exam-rate="${rate}" aria-pressed="${(progress.settings.rate || 1) === rate}">${rate}×</button>`).join('') + '</div>'}<p id="exam-audio-status" role="status"></p></div>`;
  }
  function bindAudio(q,position = null,wasPlaying = false) {
    player = root.querySelector('#exam-audio'); if (!player) return;
    const audio = player, continuous = session.mode === 'exam' && !isReview();
    const clip = continuous ? null : q.clip;
    const initial = position ?? session.audio[audio.dataset.position] ?? clip?.[0] ?? 0;
    playerEvents = new AbortController(); const options = {signal:playerEvents.signal};
    audio.playbackRate = continuous ? 1 : [.75,1,1.25].includes(progress.settings.rate) ? progress.settings.rate : 1;
    const persist = () => { if (Number.isFinite(audio.currentTime)) { session.audio[audio.dataset.position] = audio.currentTime; save(); } };
    audio.addEventListener('loadedmetadata',() => {
      audio.currentTime = clip ? (initial >= clip[0] && initial < clip[1] ? initial : clip[0]) : Math.min(initial,Math.max(0,audio.duration-.1));
      if (wasPlaying) playAudio();
    },options);
    audio.addEventListener('play',() => {
      if (clip && (audio.currentTime < clip[0] || audio.currentTime >= clip[1]-.1)) audio.currentTime = clip[0];
      root.querySelector('#exam-play').textContent = continuous ? 'Запись включена' : 'Слушать / пауза · F3';
    },options);
    audio.addEventListener('timeupdate',() => {
      if (clip && audio.currentTime >= clip[1]) audio.pause();
      if (Date.now()-lastAudioSave > 1000) { lastAudioSave=Date.now(); persist(); }
    },options);
    for (const event of ['pause','seeked','ended']) audio.addEventListener(event,persist,options);
    audio.addEventListener('error',() => { root.querySelector('#exam-audio-status').textContent = 'Не удалось воспроизвести запись.'; },options);
    window.addEventListener('pagehide',persist,options);
  }
  async function playAudio() {
    if (!player) return;
    const audio=player;
    try { await audio.play(); } catch {
      const status=root.querySelector('#exam-audio-status');
      if (!signal.aborted && player===audio && status) status.textContent = 'Нажмите «Включить запись» или кнопку плеера.';
    }
  }
  function pageHTML(q,key) {
    const a = asset(q,key);
    return a ? `<img class="exam-source-page" src="${esc(a.url)}" width="${a.width}" height="${a.height}" alt="${esc(q.sectionTitle)}, исходная страница ${esc(key.slice(1))}" loading="lazy">` : '<p role="status">Страница недоступна.</p>';
  }
  function feedback() {
    const q = current(), a = answerRecord(session,q.id), box = root.querySelector('#exam-feedback');
    if (!box) return;
    const choice = isReview() && session.mode === 'practice' ? a.firstChoice : a.choice;
    const status = isReview() ? q.correct === null ? 'ungraded' : session.mode === 'practice' ? a.first || 'skip' : choice === q.correct ? 'correct' : choice === null ? 'skip' : 'incorrect' : a.status;
    box.dataset.status = status || '';
    box.innerHTML = status ? `<strong>${STATES[status] || ''}</strong><p class="exam-user">Ваш ответ: ${choice === null ? '—' : choice+1}</p>${q.correct === null ? '<p>Проверенного ключа нет. Ответ сохранён без оценки.</p>' : `<p class="exam-correct">Правильный ответ: ${q.correct+1}</p>`}${isPractice() && a.first === 'incorrect' && a.status === 'correct' ? '<p>Первая попытка: неверно.</p>' : ''}` : '';
    root.querySelectorAll('[data-exam-choice]').forEach(b => {
      const n = Number(b.dataset.examChoice);
      b.setAttribute('aria-pressed',String(n === choice));
      b.classList.toggle('exam-choice-wrong',!!status && q.correct !== null && n === choice && n !== q.correct);
      b.classList.toggle('exam-choice-correct',!!status && n === q.correct);
    });
    const ref = root.querySelector('#exam-reference'); if (ref) ref.hidden = !status;
  }
  function reference() {
    const q = current(); if (dialog?.open) return;
    const back = document.activeElement;
    dialog = document.createElement('dialog'); dialog.className = 'practice-dialog'; dialog.setAttribute('aria-labelledby','exam-rules-title');
    dialog.innerHTML = `<div class="practice-header"><h2 id="exam-rules-title">${esc(q.sectionTitle)}</h2><button class="practice-close" aria-label="Закрыть справку">×</button></div><p>${esc(HELP[q.sectionId])}</p><p>Цифры 1–4 — выбор ответа. Enter — проверить в тренировке. ${esc(progress.settings.shortcuts?.next || 'Shift+Enter')} — следующее задание. F3 — запись.</p>`;
    dialog.querySelector('button').onclick = () => dialog.close();
    dialog.addEventListener('close',() => { dialog.remove(); if (back?.isConnected) back.focus({preventScroll:true}); },{once:true});
    document.body.append(dialog); dialog.showModal();
  }
  function render() {
    expireExamSection(session,exam);
    // Keep the continuous recording mounted while navigating the listening booklet.
    const carry = player && session.mode === 'exam' && !session.finished && !session.ready
      && !isReview() && player.dataset.position === current()?.examId
      ? player.closest('.exam-audio') : null;
    if (carry) carry.remove(); else stopAudio();
    root.querySelector('#exam-picker').hidden = true;
    const study = root.querySelector('#exam-study'); study.hidden = false;
    if (session.finished && !isReview()) { recordExam(); summary(); save(); return; }
    if (session.mode === 'exam' && session.ready && !isReview()) {
      const section = exam.sections[session.section];
      study.innerHTML = `<article class="game-card"><h2>${esc(section.title)}</h2><p>${duration(section.seconds)} · ${section.groups.reduce((n,g) => n+g.items.length,0)} заданий</p><p>Ответы появятся после завершения варианта. После сдачи раздела вернуться к нему нельзя.</p>${section.missing.length ? `<p>Отсутствующие в PDF задания исключены: ${section.missing.length}.</p>` : ''}<button class="primary" id="exam-begin-section">Начать раздел</button></article>`;
      save(); return;
    }
    const q = current(); if (!q) return;
    const a = answerRecord(session,q.id);
    const section = sets.flatMap(s => s.sections).find(s => s.id === q.sectionId && s.groups.some(g => g.items.some(item => item.id === q.id)));
    study.innerHTML = `<div class="exam-statusbar"><p>${esc(sources.get(q.examId).title)} · ${esc(q.sectionTitle)}</p>${session.mode === 'exam' && !isReview() ? '<strong id="exam-clock" role="timer"></strong>' : `<span>${session.index+1} / ${session.keys.length}</span>`}</div>
      <h2 class="exam-question-title" tabindex="-1">Блок ${q.group}: ${esc(q.groupTitle)} · № ${q.number}</h2>
      <div class="exam-layout exam-individual"><div class="exam-paper">${questionFragments(q,sources.get(q.examId).assets)}<div class="exam-page-tools"><button class="secondary" id="exam-source-pages">Исходные страницы</button></div></div>
      <div class="exam-answer-panel">${audioHTML(q)}<h3 class="exam-answer-label">Ответ на вопрос № ${q.number}</h3><div class="exam-answer-choices" role="group" aria-label="Ответ на задание ${q.number}">${Array.from({length:q.choices},(_,i) => `<button class="secondary" data-exam-choice="${i}" aria-pressed="${a.choice === i}" ${isReview() ? 'disabled' : ''}>${i+1}</button>`).join('')}</div>
      <p id="exam-selection" role="status"></p><div class="exam-command-grid">${isReview() ? '<button class="primary" id="exam-results">К результатам</button>' : `${isPractice() ? '<button class="primary" id="exam-check">Проверить</button><button class="secondary" id="exam-unknown">Не знаю</button>' : ''}<button class="secondary" id="exam-next">Дальше</button>${isPractice() ? '<button class="secondary" id="exam-reveal">Показать ответ</button>' : '<button class="secondary" id="exam-finish-section">Сдать раздел</button>'}`}<button class="secondary" id="exam-rules">Справка</button></div>
      <div id="exam-feedback" role="status" aria-live="polite"></div>
      <div class="exam-reference-slot">${(q.reference?.length || q.answer_source?.pages?.length) ? '<button class="secondary" id="exam-reference" hidden>Ключ и расшифровка</button>' : ''}</div>
      ${session.mode === 'exam' && !isReview() ? `<details class="exam-answer-sheet"><summary>Ответы раздела</summary><div class="exam-question-grid">${section.groups.map(g => `<h3>Блок ${g.number}</h3>${g.items.map(item => `<button class="chip" data-exam-jump="${esc(item.id)}" aria-current="${item.id === q.id ? 'step' : 'false'}">${item.number}${session.answers[item.id]?.choice != null ? ' ✓' : ''}</button>`).join('')}`).join('')}</div></details>` : ''}</div></div>`;
    if (carry) root.querySelector('.exam-audio').replaceWith(carry);
    else bindAudio(q);
    if (isPractice() || isReview()) feedback();
    clock(); save();
  }
  function summary() {
    const study = root.querySelector('#exam-study'), result = examSummary(session,byId);
    const graded = result.total-result.ungraded;
    study.innerHTML = `<h2 id="exam-summary" tabindex="-1">${graded ? `Верно: ${result.correct} из ${graded}` : 'Занятие завершено'}</h2><p>${graded ? `Ошибки: ${result.incorrect} · без верного ответа: ${result.skipped}` : ''}${result.ungraded ? ` · без проверенного ключа: ${result.ungraded}` : ''}</p>${session.mode === 'practice' ? '<p>Результат первой попытки. Исправления не увеличивают число заданий.</p>' : '<p>Это доля правильных ответов, а не шкалированный балл JLPT.</p>'}<div class="exam-result-list">${session.keys.map(id => {
      const q = byId.get(id), a = session.answers[id], choice = session.mode === 'practice' ? a?.firstChoice : a?.choice;
      const status = q.correct === null ? 'ungraded' : session.mode === 'practice' ? a?.first || 'skip' : choice == null ? 'skip' : choice === q.correct ? 'correct' : 'incorrect';
      return `<article class="counter-result" data-result="${status}"><h3>${esc(q.sectionTitle)} · блок ${q.group} · № ${q.number}</h3><p>${STATES[status]}</p><p class="exam-user">Ваш ответ: ${choice == null ? '—' : choice+1}</p>${q.correct !== null ? `<p class="exam-correct">Правильный ответ: ${q.correct+1}</p>` : ''}<button class="secondary" data-exam-review="${esc(id)}">Открыть задание</button></article>`;
    }).join('')}</div>`;
    study.querySelector('h2').focus({preventScroll:true});
  }
  function storeRecord(q) {
    const a = session.answers[q.id]; progress.records[q.id] = {status:a.first,choice:a.firstChoice}; save();
  }
  function submit(action = 'check') {
    if (!isPractice() || session.finished) return;
    const q = current(), first = answerRecord(session,q.id).first;
    if (!checkPractice(session,q,action)) { root.querySelector('#exam-selection').textContent = 'Выберите ответ.'; return; }
    if (first === null) storeRecord(q);
    feedback(); save();
  }
  function next() {
    if (!session || session.finished || isReview() || session.ready) return;
    const q = current();
    if (isPractice()) {
      if (answerRecord(session,q.id).first === null) { checkPractice(session,q,'skip'); storeRecord(q); }
      session.index++; if (session.index >= session.keys.length) session.finished = true;
    } else {
      const nextIndex = session.index+1;
      if (byId.get(session.keys[nextIndex])?.sectionId !== q.sectionId) { requestFinish(); return; }
      session.index = nextIndex;
    }
    render();
  }
  function finishSection() {
    stopAudio(); finishExamSection(session,exam);
    render();
  }
  function recordExam() {
    if (session.mode !== 'exam' || !session.finished || session.recorded) return;
    for (const id of session.keys) {
      const q = byId.get(id), choice = session.answers[id]?.choice;
      if (q.correct !== null && choice != null) progress.records[id] = {status:choice === q.correct ? 'correct' : 'incorrect',choice};
    }
    session.recorded = true;
  }
  function requestFinish() {
    const section = exam.sections[session.section];
    const missing = section.groups.flatMap(g => g.items).filter(q => session.answers[q.id]?.choice == null).length;
    confirmDialog('Сдать раздел?',`Без ответа: ${missing}. Вернуться к разделу после сдачи нельзя.`,finishSection);
  }
  function clock() {
    if (!session || session.mode !== 'exam' || session.finished || session.ready) return;
    if (expireExamSection(session,exam)) { dialog?.close(); stopAudio(); render(); return; }
    const clock = root.querySelector('#exam-clock'); if (clock) clock.textContent = duration((session.deadline-Date.now())/1000);
  }
  root.addEventListener('click',event => {
    const b = event.target.closest('button'); if (!b || b.disabled) return;
    if (session && expireExamSection(session,exam)) { dialog?.close(); stopAudio(); render(); return; }
    if (b.hasAttribute('data-exam-unavailable')) {
      const section = exam.unavailableSections[Number(b.dataset.examUnavailable)];
      if (!section || dialog?.open) return;
      dialog = document.createElement('dialog'); dialog.className='practice-dialog';
      dialog.setAttribute('aria-labelledby','exam-unavailable-title');
      dialog.innerHTML=`<div class="practice-header"><h2 id="exam-unavailable-title">${esc(section.title)}</h2><button class="practice-close" aria-label="Закрыть страницы">×</button></div><p>${esc(section.reason)}</p>${section.pages.map(key => pageHTML({examId:exam.id,sectionTitle:section.title},key)).join('')}`;
      dialog.querySelector('button').onclick=()=>dialog.close();
      dialog.addEventListener('close',()=>{dialog.remove();if(b.isConnected)b.focus();},{once:true});
      document.body.append(dialog);dialog.showModal();
    }
    if (b.dataset.examFilter) { filter=b.dataset.examFilter; picker(); }
    if (b.dataset.examLimit) { limit=Number(b.dataset.examLimit); picker(); }
    if (b.id === 'exam-contents') picker();
    if (b.id === 'exam-resume' && session) { reviewId=null; render(); }
    if (b.id === 'exam-practice') start('practice');
    if (b.id === 'exam-errors') start('practice',true);
    if (b.id === 'exam-start') start('exam');
    if (b.id === 'exam-begin-section') { beginExamSection(session,exam); render(); if (player) playAudio(); }
    if (b.hasAttribute('data-exam-choice') && !isReview() && !session.finished && !session.ready) {
      answerRecord(session,current().id).choice=Number(b.dataset.examChoice);
      if (isPractice()) { answerRecord(session,current().id).status=null; feedback(); }
      else root.querySelectorAll('[data-exam-choice]').forEach(el => el.setAttribute('aria-pressed',String(el===b)));
      root.querySelector('#exam-selection').textContent=''; save();
    }
    if (b.id === 'exam-check') submit();
    if (b.id === 'exam-unknown') submit('unknown');
    if (b.id === 'exam-reveal') submit('revealed');
    if (b.id === 'exam-next') next();
    if (b.id === 'exam-rules') reference();
    if (b.id === 'exam-reference' && !dialog?.open) {
      const q=current();
      dialog=document.createElement('dialog');dialog.className='practice-dialog exam-reference-dialog';
      dialog.setAttribute('aria-labelledby','exam-reference-title');
      dialog.innerHTML=`<div class="practice-header"><h2 id="exam-reference-title">Ключ и расшифровка</h2><button class="practice-close" aria-label="Закрыть материалы">×</button></div>${[...new Set([...(q.answer_source?.pages || []),...(q.reference || [])])].map(key=>pageHTML(q,key)).join('')}`;
      dialog.querySelector('button').onclick=()=>dialog.close();
      dialog.addEventListener('close',()=>{dialog.remove();if(b.isConnected)b.focus({preventScroll:true});},{once:true});
      document.body.append(dialog);dialog.showModal();
    }
    if (b.id === 'exam-finish-section') requestFinish();
    if (b.dataset.examJump) { session.index=session.keys.indexOf(b.dataset.examJump); render(); }
    if (b.dataset.examReview) { reviewId=b.dataset.examReview; render(); }
    if (b.id === 'exam-results') { reviewId=null; render(); }
    if (b.dataset.examImage && !dialog?.open) {
      const a=asset(current(),b.dataset.examImage);
      if(a) dialog=imageZoomDialog(a,`Задание № ${current().number}`,signal,()=>{if(b.isConnected)b.focus({preventScroll:true});});
    }
    if (b.id==='exam-source-pages' && !dialog?.open) {
      const q=current();dialog=document.createElement('dialog');dialog.className='practice-dialog exam-reference-dialog';
      dialog.setAttribute('aria-labelledby','exam-source-title');
      dialog.innerHTML=`<div class="practice-header"><h2 id="exam-source-title">Исходные страницы</h2><button class="practice-close" aria-label="Закрыть исходные страницы">×</button></div>${q.pages.map(k=>pageHTML(q,k)).join('')}`;
      dialog.querySelector('button').onclick=()=>dialog.close();
      dialog.addEventListener('close',()=>{dialog.remove();if(b.isConnected)b.focus({preventScroll:true});},{once:true});document.body.append(dialog);dialog.showModal();
    }
    if (b.id === 'exam-play' && player) {
      if (player.paused) playAudio(); else if (isPractice() || isReview()) player.pause();
    }
    if (b.id === 'exam-replay' && player) { player.currentTime=current().clip?.[0] || 0; playAudio(); }
    if (b.dataset.examRate && player) {
      progress.settings.rate=Number(b.dataset.examRate); player.playbackRate=progress.settings.rate;
      root.querySelectorAll('[data-exam-rate]').forEach(el => el.setAttribute('aria-pressed',String(el===b))); save();
    }
  },{signal});
  document.addEventListener('keydown',event => {
    if (event.repeat || event.isComposing || signal.aborted || shortcuts.handleCapture(event) || dialog?.open
        || root.querySelector('#exam-study').hidden || !current() || session.ready || session.finished || event.target.closest('#game-options')) return;
    if (shortcuts.matches('next',event)) { event.preventDefault(); next(); }
    else if (shortcuts.matches('rules',event)) { event.preventDefault(); reference(); }
    else if (shortcuts.matches('unknown',event) && isPractice()) { event.preventDefault(); submit('unknown'); }
    else if (event.key === 'F3' && player) { event.preventDefault(); root.querySelector('#exam-play').click(); }
    else if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && /^[1-4]$/.test(event.key)) {
      const b = root.querySelector(`[data-exam-choice="${Number(event.key)-1}"]`); if (b) { event.preventDefault(); b.click(); b.focus({preventScroll:true}); }
    } else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && isPractice() && (!event.target.closest('button,summary,a,audio') || event.target.closest('[data-exam-choice]'))) { event.preventDefault(); submit(); }
  },{signal});
  const timer = setInterval(clock,1000);
  signal.addEventListener('abort',() => { clearInterval(timer); stopAudio(); dialog?.close(); },{once:true});
  window.addEventListener('pagehide',save,{signal});
  picker();
}
