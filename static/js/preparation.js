import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';
import { highlightedRule } from './form-highlight.js';
import { loadPreparation, savePreparation, hydrateSkills, practicePlan, noteAnswer, dueSkills, troubleSkills, weakTopics } from './preparation-progress.js';
import { preparationStats, percent } from './preparation-view.js';
import { TOPIC_GROUPS, MODE_LABELS, taskCount, preparationSettings, preparationModes, preparationTopicChoices } from './preparation-setup.js';
import { passageHTML, choiceExplanation, bindReading, readingBookmarks } from './reading-view.js';

export async function mountPreparation(root, signal) {
  root.innerHTML = '<p class="loading">Загружаем задания…</p>';
  const bank = await getJSON('/api/mock-exam', signal);
  if (signal.aborted) return;
  const progress = loadPreparation();
  hydrateSkills(progress, bank);
  const byId = new Map(bank.items.map(q => [q.id,q]));
  const settings = preparationSettings(progress.setup,bank);
  let showingHome = progress.screen === 'home';
  let modeSignature = '';
  let session = progress.session, storageError = false;
  if (!session?.questions?.length || !Number.isInteger(session.index) || session.index < 0
      || session.index > session.questions.length || !Array.isArray(session.results)) session = null;
  if (session) {
    for (const q of session.questions) {
      const item = byId.get(q.id);
      if (item) for (const key of ['skill','hint','evidence','choiceNotes']) q[key] = item[key];
      q.hint = bank.skills.find(s=>s.id===q.skill) || q.hint || {};
      q.wordRefs ||= bank.passages.find(p => p.id === q.passage)?.words || [];
    }
    session.hintLevel ||= session.hinted ? 1 : 0;
    delete session.hinted;
  }
  const requested = new URLSearchParams(location.search).get('mode');
  if (['weak','mistakes'].includes(requested)) {
    session = practicePlan(bank, progress, { mode:requested });
    history.replaceState({}, '', location.pathname);
  }
  let lastTick = Date.now(), ticks = 0;
  function tick() {
    const now = Date.now();
    if (!showingHome && session && session.index < session.questions.length && !session.submitted && !document.hidden) {
      session.elapsed = (session.elapsed || 0) + Math.min(Math.max(now - lastTick,0),5000);
    }
    lastTick = now;
  }
  function save() {
    progress.session = session;
    progress.setup = settings;
    progress.screen = showingHome ? 'home' : 'session';
    storageError = !savePreparation(progress);
    const el = root.querySelector('#prep-storage');
    if (el) el.textContent = storageError ? 'Не удалось сохранить прогресс в браузере.' : '';
    return !storageError;
  }
  function shell(body) {
    root.innerHTML = `<h1>Подготовка N5</h1><p id="prep-storage" role="status">${storageError ? 'Не удалось сохранить прогресс в браузере.' : ''}</p>${body}`;
  }
  function home() {
    showingHome = true;
    save();
    const ongoing=session && session.index<session.questions.length;
    shell(`<div class="prep-home">${ongoing ? `<section class="prep-resume" aria-labelledby="prep-resume-title"><div><h2 id="prep-resume-title">Незавершённое занятие</h2><p>${esc(bank.topics.find(t=>t.id===session.topic)?.label || (session.mode==='all'?'Все темы':MODE_LABELS[session.mode]))} · задание ${session.index+1} из ${session.questions.length}</p></div><button class="primary" data-action="resume">Продолжить</button></section>` : ''}
      <div class="prep-config"><section aria-labelledby="prep-mode-title"><h2 id="prep-mode-title">Режим занятия</h2><div id="prep-mode-options">${preparationModes(progress,settings.mode)}</div></section>
      <section class="prep-topic-picker" aria-labelledby="prep-topics-title" ${settings.mode==='all'?'':'hidden'}><h2 id="prep-topics-title">Темы</h2>
      <button class="secondary prep-all-topics" data-topic="" aria-pressed="${!settings.topic}">Все темы · смешанное занятие</button>
      <div class="library-filters prep-topic-categories" role="group" aria-label="Группа тем">${TOPIC_GROUPS.map(g=>`<button class="chip" data-prep-category="${g.id}" aria-pressed="${settings.category===g.id}">${g.label}</button>`).join('')}</div>
      <div class="prep-topic-search"><label for="prep-topic-query">Найти тему</label><div><input id="prep-topic-query" type="search" value="${esc(settings.query)}" placeholder="Например, частицы" maxlength="100" autocomplete="off"><button class="secondary" data-action="clear-search">Очистить</button></div></div>
      <div id="prep-topic-options">${preparationTopicChoices(bank,progress,settings)}</div></section>
      <fieldset class="prep-count"><legend>Количество заданий</legend><div class="library-filters">${[5,10,20].map(n=>`<button type="button" class="chip" data-prep-count="${n}" aria-pressed="${settings.count===n}">${n}</button>`).join('')}</div></fieldset>
      <div class="prep-launch"><p id="prep-plan-summary" role="status"></p><button class="primary" data-action="launch">${ongoing ? 'Начать новое занятие' : 'Начать тренировку'}</button></div></div>
      <section class="prep-listening"><h2>Аудирование</h2><p>Отдельные вопросы с записью из экзаменационных вариантов.</p><a class="secondary" href="/jlpt/n5/exams?section=listening">Тренировать аудирование</a></section>
      <section class="prep-progress-section" aria-labelledby="prep-progress-title"><h2 id="prep-progress-title">Прогресс</h2>${preparationStats(progress,bank)}${readingBookmarks(progress)}</section></div>`);
    updateSetup();
  }
  function updateSetup() {
    const options=root.querySelector('#prep-topic-options'); if (!options) return;
    const plan=practicePlan(bank,progress,{mode:settings.mode,topic:settings.mode==='all'?settings.topic:'',count:settings.count,seed:0});
    const topic=settings.mode==='all' ? bank.topics.find(t=>t.id===settings.topic)?.label || 'Все темы' : MODE_LABELS[settings.mode];
    root.querySelector('#prep-plan-summary').textContent=`${topic} · ${taskCount(plan.questions.length)}`;
    root.querySelector('[data-action="launch"]').disabled=!plan.questions.length;
    save();
  }
  function refreshModes() {
    const signature=[settings.mode,troubleSkills(progress).length,weakTopics(progress).length,dueSkills(progress).length].join('|');
    if (signature===modeSignature) return;
    modeSignature=signature;
    const focused=document.activeElement.closest('[data-start]')?.dataset.start;
    root.querySelector('#prep-mode-options').innerHTML=preparationModes(progress,settings.mode);
    if (focused) root.querySelector(`[data-start="${focused}"]`).focus({preventScroll:true});
  }
  function render(focus = false) {
    if (!session) return home();
    showingHome = false;
    if (!session.questions.length) {
      shell('<h2 id="prep-heading" tabindex="-1">Нет заданий для этих настроек</h2><button class="primary" data-action="home">К темам</button>');
    } else if (session.index >= session.questions.length) {
      const correct = session.results.filter(r => r.status === 'correct').length;
      shell(`<h2 id="prep-heading" tabindex="-1">Тренировка завершена</h2><p>Без подсказки: ${percent(correct,session.results.length)}</p>
        <p>С подсказкой: ${session.results.filter(r=>r.status==='hinted').length} · Ответ открыт: ${session.results.filter(r=>r.status==='revealed').length} · Не знаю: ${session.results.filter(r=>r.status==='unknown').length}</p>
        <div class="practice-actions"><button class="primary" data-action="home">К темам</button><button class="secondary" data-action="again">Другие задания этой тренировки</button></div>${preparationStats(progress,bank)}${readingBookmarks(progress)}`);
    } else {
      const q = session.questions[session.index], submitted = session.submitted, selected = session.selection;
      const topic = bank.topics.find(t=>t.id===q.topic)?.label || q.topic;
      const hint = q.hint || {};
      const level = session.hintLevel || 0;
      const title = submitted?.status === 'revealed' ? 'Ответ открыт' : submitted?.status === 'unknown' ? 'Не знаю' : submitted?.correct ? 'Верно' : 'Неверно';
      shell(`<p>${esc(topic)} · ${session.index+1} из ${session.questions.length} · ${q.fresh ? 'Новое задание' : 'Повторное задание'}</p>
        <section class="mock-question"><h2 id="prep-heading" tabindex="-1" lang="ja">${esc(q.prompt)}</h2>
        ${q.passageText ? `<p class="mock-passage" lang="ja">${passageHTML(q,!!submitted)}</p>` : ''}
        <fieldset ${submitted ? 'disabled' : ''}><legend class="sr-only">Выберите ответ</legend><div class="mock-choices">${q.choices.map((choice,i)=>`<label class="form-choice"><input type="radio" name="prep-choice" value="${i}" ${selected===i?'checked':''}><span lang="ja">${i+1}. ${esc(choice)}</span></label>`).join('')}</div></fieldset></section>
        <div class="practice-actions prep-actions"><button class="primary" data-action="check" ${submitted || selected===undefined ? 'disabled' : ''}>Проверить · Enter</button>
        <button class="primary" data-action="next" ${submitted?'':'disabled'}>Далее · Shift+Enter</button>
        <button class="secondary" data-action="hint" ${submitted?'disabled':''}>${level===0?'Правило':level===1?'Другой пример':'Показать ответ'}</button>
        <button class="secondary" data-action="unknown" ${submitted?'disabled':''}>Не знаю</button></div>
        <div id="prep-feedback" role="status" aria-live="polite" class="prep-feedback" ${submitted?`data-correct="${submitted.correct}"`:''}>
        ${submitted ? `<strong>${title}${submitted.status==='hinted'?' · С подсказкой':''}</strong>
        <p class="mock-user">Ваш ответ: <span lang="ja">${esc(q.choices[submitted.selected]??'—')}</span></p>
        <p class="mock-correct">Правильный ответ: <span lang="ja">${esc(q.choices[q.correct])}</span></p>
        ${choiceExplanation(q,submitted.selected)}<p>${highlightedRule(q.explanation)}</p>${q.evidence?.length?'<p class="practice-help">В тексте выделено основание ответа. Слова с подчёркиванием открываются в словаре.</p>':''}`
          : level ? `<p>Справка${level===2?' и другой пример':''}. Ответ текущего задания не открыт.</p><p>${highlightedRule(hint.rule || 'Обратите внимание на контекст задания.')}</p>${level===2?`<p>${highlightedRule(hint.example || '')}</p>`:''}` : ''}</div>
        ${q.translation && submitted ? `<details><summary>Перевод</summary><p>${esc(q.translation)}</p></details>` : ''}
        <button class="secondary" data-action="home">Выбор тренировки</button>`);
    }
    if (focus) root.querySelector('#prep-heading')?.focus({ preventScroll:true });
  }
  function submit(unknown = false, revealed = false) {
    if (!session || session.submitted || session.index >= session.questions.length
        || !unknown && !revealed && session.selection===undefined) return;
    tick();
    const q = session.questions[session.index];
    const selected = unknown || revealed ? null : session.selection;
    const correct = selected === q.correct;
    const status = revealed ? 'revealed' : unknown ? 'unknown' : correct ? (session.hintLevel ? 'hinted' : 'correct') : 'incorrect';
    session.submitted = { selected,correct,status };
    const result = noteAnswer(progress,q,status,session.elapsed || 0,Date.now(),revealed ? 3 : session.hintLevel || 0);
    session.results.push({ ...result,id:q.id });
    save(); render();
    root.querySelector('[data-action="next"]').focus({ preventScroll:true });
  }
  function next() {
    if (!session?.submitted) return;
    session.index++; session.selection=undefined; session.submitted=null; session.hintLevel=0; session.elapsed=0;
    lastTick=Date.now(); save(); render(true);
  }
  function hint() {
    if (!session || session.submitted) return;
    tick();
    if ((session.hintLevel || 0) >= 2) return submit(false,true);
    session.hintLevel=(session.hintLevel || 0)+1;
    save(); render(); root.querySelector('[data-action="hint"]').focus({ preventScroll:true });
  }
  function start(mode,topic='',count=settings.count) {
    tick(); showingHome=false;session=practicePlan(bank,progress,{mode,topic,count}); lastTick=Date.now(); save(); render(true);
    root.scrollIntoView({block:'start',behavior:'instant'});
  }
  bindReading(root,signal,()=>session?.questions || [],progress,save);
  root.addEventListener('change',event=>{
    if (!event.target.matches('[name="prep-choice"]') || session?.submitted) return;
    tick(); session.selection=Number(event.target.value); save(); root.querySelector('[data-action="check"]').disabled=false;
  },{signal});
  root.addEventListener('click',event=>{
    const b=event.target.closest('button'); if (!b) return;
    if (b.dataset.start) {
      settings.mode=b.dataset.start;
      modeSignature='';refreshModes();
      root.querySelector('.prep-topic-picker').hidden=settings.mode!=='all';
      root.querySelector(`[data-start="${settings.mode}"]`).focus({preventScroll:true});updateSetup();return;
    }
    if (b.hasAttribute('data-topic')) {
      settings.topic=b.dataset.topic;
      root.querySelectorAll('[data-topic]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.topic===settings.topic)));
      updateSetup();return;
    }
    if (b.dataset.prepCategory) {
      settings.category=b.dataset.prepCategory;settings.query='';root.querySelector('#prep-topic-query').value='';
      root.querySelectorAll('[data-prep-category]').forEach(button=>button.setAttribute('aria-pressed',String(button===b)));
      root.querySelector('#prep-topic-options').innerHTML=preparationTopicChoices(bank,progress,settings);save();return;
    }
    if (b.dataset.prepCount) {
      settings.count=Number(b.dataset.prepCount);root.querySelectorAll('[data-prep-count]').forEach(button=>button.setAttribute('aria-pressed',String(button===b)));updateSetup();return;
    }
    const action=b.dataset.action;
    if (action==='check') submit();
    if (action==='unknown') submit(true);
    if (action==='next') next();
    if (action==='hint') hint();
    if (action==='home') { tick(); home(); }
    if (action==='resume') { showingHome=false;lastTick=Date.now();save();render(true); }
    if (action==='launch') start(settings.mode,settings.mode==='all'?settings.topic:'');
    if (action==='clear-search') {
      settings.query='';root.querySelector('#prep-topic-query').value='';
      root.querySelector('#prep-topic-options').innerHTML=preparationTopicChoices(bank,progress,settings);save();root.querySelector('#prep-topic-query').focus();
    }
    if (action==='again') start(session.mode,session.topic);
  },{signal});
  root.addEventListener('input',event=>{
    if (event.target.id!=='prep-topic-query') return;
    settings.query=event.target.value;
    root.querySelector('#prep-topic-options').innerHTML=preparationTopicChoices(bank,progress,settings);save();
  },{signal});
  document.addEventListener('keydown',event=>{
    if (showingHome || !session || session.index>=session.questions.length || event.repeat || event.isComposing
        || event.ctrlKey || event.altKey || event.metaKey || document.querySelector('dialog[open]')) return;
    if (event.key==='Enter' && event.target.closest('button') && !['check','next'].includes(event.target.dataset.action)) return;
    if (event.key==='Enter') { event.preventDefault(); if (event.shiftKey) next(); else submit(); }
    else if (!event.shiftKey && /^[1-4]$/.test(event.key) && !session.submitted) {
      event.preventDefault();
      const radio=root.querySelector(`[name="prep-choice"][value="${Number(event.key)-1}"]`);
      radio.checked=true; radio.dispatchEvent(new Event('change',{bubbles:true})); radio.focus();
    }
  },{signal});
  document.addEventListener('visibilitychange',()=>{tick();save();},{signal});
  window.addEventListener('pagehide',()=>{tick();save();},{signal});
  const interval=setInterval(()=>{
    tick();
    if (++ticks%5===0) {
      save();
      if (showingHome) {
        refreshModes();
        updateSetup();
      }
    }
  },1000);
  signal.addEventListener('abort',()=>{clearInterval(interval);tick();save();root.querySelectorAll('dialog[open]').forEach(d=>d.close());},{once:true});
  if (showingHome && !requested) home(); else { render();save(); }
}
