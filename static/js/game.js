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
  const collections = catalog.collections.filter(item => item.practice_kind);
  const words = (await Promise.all(collections.map(item => loadCollection(item, signal)))).flat();
  if (signal.aborted) return;
  root.innerHTML = `<h1>Тренировка</h1>
    <div class="game-filters"><fieldset id="game-kind" class="practice-target"><legend>Часть речи</legend><div class="game-modes">
      <label class="form-choice"><input type="radio" name="game-kind" value="" checked><span>Все</span></label>
      ${collections.map(item => `<label class="form-choice"><input type="radio" name="game-kind" value="${esc(item.id)}"><span>${esc(item.label)}</span></label>`).join('')}</div></fieldset>
      <fieldset id="game-mode" class="practice-target"><legend>Формы</legend><div class="game-modes">
      <label class="form-choice"><input type="radio" name="game-mode" value="polite" checked><span>Вежливые · です / ます</span></label>
      <label class="form-choice"><input type="radio" name="game-mode" value="all"><span>Все формы</span></label>
      </div></fieldset></div>
    <p id="game-score" aria-live="polite"></p>
    <section class="game-card" aria-label="Задание">
      <div id="game-question"></div><form id="practice-form">${answerFields()}</form>
      <button type="button" class="secondary" id="game-next" aria-keyshortcuts="Shift+Enter">Следующее слово → · Shift + Enter</button>
    <p class="practice-help">Enter — проверить · Shift + Enter — дальше · F1 — правила</p></section>`;
  const kind = root.querySelector('#game-kind');
  const mode = root.querySelector('#game-mode');
  const question = root.querySelector('#game-question');
  const score = root.querySelector('#game-score');
  let deck = [], pool = [], exercise, previous, counted = false, correct = 0, answered = 0;
  const updateScore = () => { score.textContent = `С первой попытки: ${correct} из ${answered}`; };
  const record = status => {
    if (counted || ['empty', 'incomplete'].includes(status)) return;
    counted = true;
    answered++;
    if (status === 'correct') correct++;
    updateScore();
  };
  const answer = bindAnswer(root, () => exercise, record);
  function next() {
    if (!pool.length) {
      question.textContent = 'Нет слов для тренировки.';
      root.querySelector('#practice-form').hidden = true;
      root.querySelector('#game-next').disabled = true;
      return;
    }
    root.querySelector('#practice-form').hidden = false;
    root.querySelector('#game-next').disabled = false;
    if (!deck.length) {
      deck = shuffled(pool);
      if (deck.length > 1 && deck.at(-1).entry.id === previous) [deck[0], deck[deck.length - 1]] = [deck.at(-1), deck[0]];
    }
    const word = deck.pop();
    previous = word.entry.id;
    const forms = [...Object.keys(FORM_LABELS), ...(word.kind === 'verb' && mode.querySelector('input:checked').value === 'all' ? Object.keys(VERB_FORM_LABELS) : [])];
    const form = forms[Math.floor(Math.random() * forms.length)];
    exercise = exerciseFor(word.entry, word.kind, form);
    counted = false;
    question.innerHTML = `<p class="practice-word" lang="ja">${esc(word.entry.kanji)}
      <span class="practice-reading">${esc(exercise.reading)}</span></p>
      <p class="practice-meaning">${esc(word.entry.meaning)}</p>
      <h2 class="game-target">${esc(FORM_LABELS[form] || VERB_FORM_LABELS[form])}</h2>
      <p>${Object.hasOwn(FORM_LABELS, form) ? 'Вежливая форма · です / ます' : 'Обычная форма'}</p>`;
    question.dataset.word = word.entry.id;
    question.dataset.form = form;
    answer.reset();
  }
  function restart() {
    pool = words.filter(word => (!kind.querySelector('input:checked').value || word.collection === kind.querySelector('input:checked').value) && exerciseFor(word.entry, word.kind, 'past'));
    deck = []; correct = answered = 0;
    updateScore(); next();
  }
  kind.addEventListener('change', restart, { signal });
  mode.addEventListener('change', restart, { signal });
  const advance = () => { if (!pool.length) return; record('skip'); next(); answer.focus(); };
  const rules = () => { if (exercise) openPracticeRules(exercise.kind, exercise.form, signal, () => answer.focus()); };
  root.querySelector('#game-next').addEventListener('click', advance, { signal });
  root.querySelector('#practice-rules').addEventListener('click', rules, { signal });
  document.addEventListener('keydown', event => {
    if (event.repeat || event.isComposing || answer.composing || document.querySelector('dialog[open]')) return;
    if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); advance();
    } else if (event.key === 'F1' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault(); rules();
    }
  }, { signal });
  signal.addEventListener('abort', () => answer.destroy(), { once: true });
  restart();
  if (matchMedia("(pointer: fine)").matches && pool.length) answer.focus();
}
