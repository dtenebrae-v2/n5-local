import { grammarWords, grammarQuestion, openGrammarRules } from './grammar-exercise.js';
import { mountShortcuts } from './training-shortcuts.js';
import { loadProgress, saveProgress, recordAttempt, TE_GROUPS, teGroup } from './training-progress.js';
import { groupLabels } from './group-labels.js';
import { vocabularyExercise } from './vocabulary-exercise.js';
import { openPracticeRules } from './practice-rules.js';
import { getJSON } from './api.js';
import { exerciseFor, FORM_LABELS } from './conjugation.js';
import { VERB_FORM_LABELS } from './verb-forms.js';
import { answerFields, bindAnswer } from './practice-answer.js';
import { escapeHTML as esc } from './ui.js';

export function shuffled(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function loadCollection(collection, signal) {
  const entries = [];
  let total;
  do {
    const data = await getJSON(`/api/words?collection=${encodeURIComponent(collection.id)}&limit=200&offset=${entries.length}`, signal);
    entries.push(...data.entries);
    total = data.total;
    if (!data.entries.length) break;
  } while (entries.length < total);
  return entries.map(entry => ({ entry, kind: collection.practice_kind, collection: collection.id }));
}

export async function mountGame(root, catalog, signal) {
  root.innerHTML = '<p class="loading">Загружаем слова…</p>';
  const collections = catalog.collections;
  const practiceCollections = collections.filter(item => item.practice_kind);
  const words = (await Promise.all(collections.map(item => loadCollection(item, signal)))).flat();
  const [groups, grammar] = await Promise.all([getJSON('/api/groups', signal), getJSON('/api/grammar-practice', signal)]);
  const grammarPool = grammarWords(grammar);
  const grammarLabels = Object.fromEntries(grammar.rules.map(rule => [rule.id, rule.label]));
  if (signal.aborted) return;
  const progress = loadProgress();
  root.innerHTML = `<h1>Тренировка</h1>
    <div class="game-filters"><fieldset id="game-task" class="practice-target"><legend>Режим</legend><div class="game-modes">
      <label class="form-choice"><input type="radio" name="game-task" value="forms" checked><span>Формы</span></label>
      <label class="form-choice"><input type="radio" name="game-task" value="vocabulary"><span>Значение → слово</span></label>
      <label class="form-choice"><input type="radio" name="game-task" value="grammar"><span>Грамматика</span></label>
      </div></fieldset><fieldset id="game-kind" class="practice-target"><legend>Часть речи</legend><div class="game-modes">
      <label class="form-choice"><input type="radio" name="game-kind" value="" checked><span>Все</span></label>
      ${collections.filter(item => item.id !== 'complete').map(item => `<label class="form-choice" ${item.practice_kind ? '' : 'data-vocabulary-only hidden'}><input type="radio" name="game-kind" value="${esc(item.id)}"><span>${esc(item.label)}</span></label>`).join('')}</div></fieldset>
      <fieldset id="game-mode" class="practice-target"><legend>Формы</legend><div class="game-modes">
      <label class="form-choice"><input type="radio" name="game-mode" value="polite" checked><span>Вежливые · です / ます</span></label>
      <label class="form-choice"><input type="radio" name="game-mode" value="all"><span>Все формы</span></label>
      <label class="form-choice"><input type="radio" name="game-mode" value="te"><span>Соединительная · て</span></label>
      </div></fieldset>
      <details id="game-options"><summary>Материал и длительность</summary>
        <fieldset id="game-length" class="practice-target"><legend>Заданий</legend><div class="game-modes">
        ${[10,20,50,0].map(n => `<label class="form-choice"><input type="radio" name="game-length" value="${n}" ${n === 0 ? 'checked' : ''}><span>${n || 'Без ограничения'}</span></label>`).join('')}</div></fieldset>
        <fieldset id="game-source" class="practice-target"><legend>Материал</legend><div class="game-modes">
          <label class="form-choice"><input type="radio" name="game-source" value="all" checked><span>Все задания</span></label>
          <label class="form-choice"><input type="radio" name="game-source" value="mistakes"><span>Мои ошибки</span></label>
        </div></fieldset>
        <fieldset id="game-form" class="practice-target"><legend>Конкретная форма</legend><div class="game-modes"></div></fieldset>
        <fieldset id="game-topic" class="practice-target"><legend>Тема / группа</legend><div class="game-modes"></div></fieldset>
        <fieldset id="game-te-group" class="practice-target"><legend>Правило て-формы</legend><div class="game-modes">
          ${Object.entries(TE_GROUPS).map(([value,label]) => `<label class="form-choice"><input type="radio" name="game-te-group" value="${value}" ${value === 'all' ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}
        </div></fieldset>
      </details></div>
    <p id="game-progress" aria-live="polite"></p>
    <p id="game-storage" class="practice-help" role="status"></p>
    <p id="game-score" aria-live="polite"></p>
    <section id="game-summary" hidden></section>
    <section class="game-card" aria-label="Задание">
      <div id="game-question"></div><form id="practice-form">${answerFields()}</form>
      <button type="button" class="secondary" id="game-next" aria-keyshortcuts="Shift+Enter">Следующее слово → · Shift + Enter</button>
    <button type="button" class="secondary" id="game-unknown">Не знаю</button>
    <button type="button" class="secondary" id="game-finish">Завершить занятие</button>
    <p class="practice-help" id="game-shortcuts">Enter — проверить · Shift + Enter — дальше · F1 — правила</p></section>`;
  const task = root.querySelector('#game-task');
  const isGrammar = () => task.querySelector('input:checked').value === 'grammar';
  const isVocabulary = () => task.querySelector('input:checked').value === 'vocabulary';
  const allEntries = [...new Map(words.map(word => [word.entry.id, word.entry])).values()];
  const vocabularyExercises = new Map(allEntries.map(entry => [entry.id, vocabularyExercise(entry)]));
  const kind = root.querySelector('#game-kind');
  const mode = root.querySelector('#game-mode');
  const question = root.querySelector('#game-question');
  const score = root.querySelector('#game-score');
  const referenceButton = root.querySelector('#practice-rules');
  referenceButton.classList.add('game-reference-launch');
  referenceButton.setAttribute('aria-keyshortcuts', 'F1');
  root.querySelector('.game-card').prepend(referenceButton);
  let deck = [], pool = [], exercise, previous, counted = false, correct = 0, answered = 0;
  let current = null, attempts = [], retry = [], finished = false;
  const input = root.querySelector('#practice-answer');
  const feedback = root.querySelector('#practice-feedback');
  const settingIds = ['game-task','game-kind','game-mode','game-length','game-source','game-topic','game-te-group','game-form'];
  const value = id => root.querySelector(`#${id} input:checked`)?.value || '';
  const settings = () => Object.fromEntries(settingIds.map(id => [id, value(id)]));
  const limit = () => Number(value('game-length'));
  const mistakesOnly = () => value('game-source') === 'mistakes';
  const formsFor = word => {
    if (isGrammar()) return [word.exercise.form];
    if (isVocabulary()) return ['vocabulary'];
    const forms = value('game-mode') === 'te' ? ['te'] : [...Object.keys(FORM_LABELS),
      ...(word.kind === 'verb' && value('game-mode') === 'all' ? Object.keys(VERB_FORM_LABELS) : [])];
    const selected = value('game-form');
    return selected ? forms.filter(form => form === selected) : forms;
  };
  const getExercise = (word, form) => isGrammar() ? (word.exercise.form === form ? word.exercise : null) : isVocabulary() ? vocabularyExercises.get(word.entry.id) : exerciseFor(word.entry, word.kind, form);
  const hasMistake = word => Object.values(progress.mistakes).some(a => a.id === word.entry.id && formsFor(word).includes(a.form));
  function save() {
    progress.settings = settings();
    progress.session = current || finished ? {
      settings: settings(), current: current ? { id: current.word.entry.id, collection: current.word.collection, form: current.form } : null,
      deck: deck.map(w => ({ id: w.entry.id, collection: w.collection })),
      retry, attempts, correct, answered, counted, finished,
      result: answer.result, input: input.value, feedback: feedback.textContent, status: feedback.dataset.status || '',
    } : null;
    root.querySelector('#game-storage').textContent = saveProgress(progress) ? '' : 'Не удалось сохранить прогресс в браузере.';
  }
  function updateOptions() {
    const selected = value('game-kind');
    const previousForm = value('game-form');
    const labels = { ...FORM_LABELS, ...(value('game-mode') === 'all' && (!selected || selected === 'verbs') ? VERB_FORM_LABELS : {}) };
    root.querySelector('#game-form .game-modes').innerHTML = [['', 'Случайная'], ...Object.entries(labels)]
      .map(([id,label]) => `<label class="form-choice"><input type="radio" name="game-form" value="${esc(id)}"><span>${esc(label)}</span></label>`).join('');
    const formChoices = [...root.querySelectorAll('#game-form input')];
    (formChoices.find(el => el.value === previousForm) || formChoices[0]).checked = true;
    root.querySelector('#game-form').hidden = isGrammar() || isVocabulary() || value('game-mode') === 'te';
    if (isVocabulary() || value('game-mode') === 'te') formChoices[0].checked = true;
    const previousTopic = value('game-topic');
    const available = isGrammar() ? grammar.topics.map(t => ({ id: t.id, name: t.label })) : groups.filter(g => (!selected || g.collection === selected)
      && (isVocabulary() || practiceCollections.some(c => c.id === g.collection)));
    root.querySelector('#game-topic .game-modes').innerHTML = [['', 'Все темы'], ...available.map(g => [g.id, groupLabels[g.name] || g.name])]
      .map(([id,label]) => `<label class="form-choice"><input type="radio" name="game-topic" value="${esc(id)}"><span>${esc(label)}</span></label>`).join('');
    const choice = [...root.querySelectorAll('#game-topic input')].find(el => el.value === previousTopic) || root.querySelector('#game-topic input');
    choice.checked = true;
    root.querySelector('#game-te-group').hidden = isGrammar() || isVocabulary() || value('game-mode') !== 'te';
  }
  function finish() {
    finished = true;
    score.hidden = true;
    root.querySelector('.game-card').hidden = true;
    const summary = root.querySelector('#game-summary');
    summary.hidden = false;
    const names = { correct: 'Верно', incorrect: 'Ошибка', answer: 'Подсмотрено', skip: 'Пропущено', unknown: 'Не знаю' };
    summary.innerHTML = `<h2>Занятие завершено</h2><p>С первой попытки: ${correct} из ${answered}</p>
      <div class="practice-actions"><button class="primary" id="game-repeat">Повторить ошибки</button><button class="secondary" id="game-new">Новое занятие</button></div>
      <div class="table-scroll"><table class="training-results"><thead><tr><th>Задание / форма</th><th>Результат</th><th>Ваш ответ</th><th>Правильный ответ</th></tr></thead><tbody>
      ${attempts.map(a => `<tr data-result="${esc(a.status)}"><td>${esc(a.word)}<br>${esc(FORM_LABELS[a.form] || VERB_FORM_LABELS[a.form] || grammarLabels[a.form] || 'Значение → слово')}</td><td class="result-status">${names[a.status] || esc(a.status)}</td><td class="result-answer">${esc(a.answer || '—')}</td><td class="result-expected">${esc(a.expected)}</td></tr>`).join('')}</tbody></table></div>`;
    summary.querySelector('#game-new').addEventListener('click', () => restart());
    summary.querySelector('#game-repeat').disabled = !pool.some(hasMistake);
    summary.querySelector('#game-repeat').addEventListener('click', () => {
      root.querySelector('#game-source input[value="mistakes"]').checked = true;
      restart();
    });
    save();
  }
  const updateScore = () => {
    score.textContent = `С первой попытки: ${correct} из ${answered}`;
    root.querySelector('#game-progress').textContent = limit() ? `Задание ${Math.min(answered + (counted ? 0 : 1), limit())} из ${limit()}` : '';
    root.querySelector('#game-next').textContent = limit() && answered >= limit() ? `Итоги → · ${progress.shortcuts?.next || 'Shift+Enter'}` : `Следующее задание → · ${progress.shortcuts?.next || 'Shift+Enter'}`;
  };
  const record = status => {
    if (counted || status === 'incomplete') { save(); return; }
    counted = true;
    answered++;
    if (status === 'correct') correct++;
    const attempt = recordAttempt(progress, current, status, input.value, (exercise.displayAnswers || exercise.answers).join(' / '));
    attempts.push(attempt);
    if (status !== 'correct') retry.push({ id: current.word.entry.id, collection: current.word.collection, form: current.form, due: answered + 3 });
    updateScore(); save();
  };
  const answer = bindAnswer(root, () => exercise, record);
  function next(restored = null) {
    retry = retry.filter(item => progress.mistakes[`${item.id}:${item.form}`]);
    if (mistakesOnly() && !restored) {
      const remaining = pool.filter(hasMistake);
      deck = deck.filter(word => remaining.includes(word));
      if (pool.length && !remaining.length && attempts.length) { finish(); return; }
      pool = remaining;
    }
    if (!pool.length) {
      exercise = null;
      delete question.dataset.word;
      delete question.dataset.form;
      current = null;
      referenceButton.hidden = true;
      question.textContent = mistakesOnly() ? 'Нет ошибок для выбранных настроек.' : 'Нет заданий для тренировки.';
      save();
      root.querySelector('#practice-form').hidden = true;
      root.querySelector('#game-next').disabled = true;
      return;
    }
    referenceButton.hidden = false;
    root.querySelector('#practice-form').hidden = false;
    root.querySelector('#game-next').disabled = false;
    if (!deck.length) {
      deck = shuffled(pool);
      if (deck.length > 1 && deck.at(-1).entry.id === previous) [deck[0], deck[deck.length - 1]] = [deck.at(-1), deck[0]];
    }
    let repeat;
    const due = retry.findIndex(item => item.due <= answered && pool.some(w => w.entry.id === item.id));
    if (!restored && due >= 0) repeat = retry.splice(due, 1)[0];
    const prescribed = restored || repeat;
    const word = prescribed ? pool.find(w => w.entry.id === prescribed.id && w.collection === prescribed.collection) : deck.pop();
    if (!word) return next();
    previous = word.entry.id;
    const forms = formsFor(word);
    const mistakes = Object.values(progress.mistakes).filter(a => a.id === word.entry.id && (isVocabulary() ? a.form === 'vocabulary' : forms.includes(a.form)));
    const form = prescribed?.form || (mistakesOnly() && mistakes.length ? mistakes[Math.floor(Math.random() * mistakes.length)].form : isVocabulary() ? 'vocabulary' : forms[Math.floor(Math.random() * forms.length)]);
    current = { word, form };
    exercise = getExercise(word, form);
    counted = false;
    question.innerHTML = isGrammar() ? grammarQuestion(exercise) : isVocabulary() ? `<h2 class="game-target" lang="en">${esc(exercise.prompt)}</h2>` : `<p class="practice-word" lang="ja">${esc(word.entry.kanji)}
      <span class="practice-reading">${esc(exercise.reading)}</span></p>
      <p class="practice-meaning">${esc(word.entry.meaning)}</p>
      <h2 class="game-target">${esc(FORM_LABELS[form] || VERB_FORM_LABELS[form])}</h2>
      <p>${Object.hasOwn(FORM_LABELS, form) ? 'Вежливая форма · です / ます' : 'Обычная форма'}</p>`;
    question.dataset.word = word.entry.id;
    question.dataset.form = form;
    answer.reset();
    updateScore(); save();
  }
  function restart(resume = null) {
    finished = false;
    score.hidden = false;
    root.querySelector('.game-card').hidden = false;
    root.querySelector('#game-summary').hidden = true;
    const vocabulary = isVocabulary();
    mode.hidden = vocabulary || isGrammar();
    kind.hidden = isGrammar();
    root.querySelector('#practice-input-help').textContent = 'Ромадзи превращается в хирагану при вводе.' + (vocabulary ? '' : isGrammar() ? ' Частицы: は — ha, へ — he, を — wo.' : ' Для では набирайте deha, для じゃ — ja.');
    referenceButton.textContent = vocabulary ? 'Освежить слово' : 'Таблица правил';
    root.querySelector('label[for="practice-answer"]').textContent = isGrammar() ? 'Ответ на задание' : vocabulary ? 'Слово по-японски' : 'Форма целиком';
    updateShortcutLabels(progress.shortcuts);
    root.querySelectorAll('[data-vocabulary-only]').forEach(label => { label.hidden = !vocabulary; });
    let selected = kind.querySelector('input:checked');
    if (!vocabulary && selected.value && !practiceCollections.some(item => item.id === selected.value)) {
      selected.checked = false;
      selected = kind.querySelector('input[value=""]');
      selected.checked = true;
    }
    updateOptions();
    const candidates = (isGrammar() ? grammarPool : words).filter(word => (isGrammar() || !selected.value || word.collection === selected.value)
      && (!value('game-topic') || word.entry.group_id === value('game-topic'))
      && (isGrammar() || vocabulary || value('game-mode') !== 'te' || value('game-te-group') === 'all' || teGroup(word) === value('game-te-group'))
      && formsFor(word).length
      && (!mistakesOnly() || (resume?.counted && resume.current?.id === word.entry.id && resume.current?.collection === word.collection) || hasMistake(word))
      && (isGrammar() || (vocabulary ? vocabularyExercises.get(word.entry.id) : exerciseFor(word.entry, word.kind, 'past'))));
    pool = [...new Map(candidates.map(word => [word.entry.id, word])).values()];
    deck = []; correct = answered = 0; attempts = []; retry = []; counted = false;
    if (resume?.finished) {
      attempts = resume.attempts || []; correct = resume.correct || 0; answered = resume.answered || 0;
      updateScore(); finish(); return;
    }
    if (resume && resume.current && pool.some(w => w.entry.id === resume.current.id && w.collection === resume.current.collection)
        && getExercise(pool.find(w => w.entry.id === resume.current.id), resume.current.form)) {
      next(resume.current);
      deck = (resume.deck || []).map(item => pool.find(w => w.entry.id === item.id && w.collection === item.collection)).filter(Boolean);
      attempts = resume.attempts || []; retry = resume.retry || [];
      correct = resume.correct || 0; answered = resume.answered || 0; counted = !!resume.counted;
      input.value = resume.input || '';
      if (resume.result) answer.render(resume.result.status, resume.result.answer);
      else feedback.textContent = resume.feedback || '';
      if (resume.status) { feedback.dataset.status = input.dataset.status = resume.status; input.setAttribute('aria-invalid', String(resume.status !== 'correct' && resume.status !== 'answer')); }
      updateScore();
      if (resume.finished) finish(); else save();
    } else { updateScore(); next(); }
  }
  task.addEventListener('change', () => restart(), { signal });
  kind.addEventListener('change', () => {
    if (mode.querySelector('input:checked').value === 'te' && kind.querySelector('input:checked').value !== 'verbs') {
      mode.querySelector('input[value="polite"]').checked = true;
    }
    restart();
  }, { signal });
  mode.addEventListener('change', () => {
    if (mode.querySelector('input:checked').value === 'te') kind.querySelector('input[value="verbs"]').checked = true;
    restart();
  }, { signal });
  for (const id of ['game-length','game-source','game-topic','game-te-group','game-form']) root.querySelector('#' + id).addEventListener('change', () => restart(), { signal });
  input.addEventListener('input', save, { signal });
  root.querySelector('#game-unknown').addEventListener('click', () => { if (exercise && !finished) answer.reveal('unknown'); }, { signal });
  root.querySelector('#game-finish').addEventListener('click', finish, { signal });
  const advance = () => { if (!pool.length || finished) return; record('skip'); if (limit() && answered >= limit()) finish(); else { next(); answer.focus(); } };
  const rules = () => {
    if (!exercise || finished) return;
    record('answer');
    if (isGrammar()) { openGrammarRules(exercise, grammar, signal, () => answer.focus()); return; }
    openPracticeRules(exercise.kind, exercise.form, signal, () => answer.focus(), isVocabulary()
      ? { meaning: question.textContent, answers: exercise.displayAnswers || exercise.answers } : null);
  };
  root.querySelector('#game-next').addEventListener('click', advance, { signal });
  root.querySelector('#practice-rules').addEventListener('click', rules, { signal });
  function updateShortcutLabels(keys) {
    if (!keys) return;
    root.querySelector('#game-shortcuts').textContent = `Enter — проверить · ${keys.next} — дальше · ${keys.rules} — справка · ${keys.unknown} — не знаю`;
    for (const [id, action] of [['game-next','next'], ['practice-rules','rules'], ['game-unknown','unknown']]) {
      root.querySelector('#' + id).setAttribute('aria-keyshortcuts', keys[action].replace('Ctrl', 'Control'));
    }
    updateScore();
  }
  const shortcuts = mountShortcuts(root, progress, save, signal, updateShortcutLabels);
  document.addEventListener('keydown', event => {
    if (event.repeat || event.isComposing || answer.composing || document.querySelector('dialog[open]')) return;
    if (shortcuts.handleCapture(event)) return;
    if (shortcuts.matches('next', event)) { event.preventDefault(); advance(); }
    else if (shortcuts.matches('rules', event)) { event.preventDefault(); rules(); }
    else if (shortcuts.matches('unknown', event)) { event.preventDefault(); if (exercise && !finished) answer.reveal('unknown'); }
  }, { signal });
  signal.addEventListener('abort', () => answer.destroy(), { once: true });
  const saved = progress.session;
  const restoreSettings = saved?.settings || progress.settings || {};
  for (const id of settingIds) {
    if (id === 'game-topic') updateOptions();
    const radio = [...root.querySelectorAll(`#${id} input`)].find(el => el.value === restoreSettings[id]);
    if (radio) radio.checked = true;
  }
  restart(saved);
  if (matchMedia("(pointer: fine)").matches && pool.length) answer.focus();
}
