import { escapeHTML as esc } from './ui.js';
import { highlightedRule } from './form-highlight.js';
import { bind, unbind } from '../vendor/wanakana-5.3.1.js';
import { checkAnswer, closestAnswer, normalizeAnswer } from './conjugation.js';

export function answerFields() {
  return `<label class="practice-label" for="practice-answer">Форма целиком</label>
    <div class="practice-answer-line"><input id="practice-answer" type="text" lang="ja" maxlength="160"
      aria-describedby="practice-input-help" autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="Ромадзи или хирагана"></div>
    <p class="practice-help" id="practice-input-help">Ромадзи превращается в хирагану при вводе. Для では набирайте deha, для じゃ — ja.</p>
    <div class="practice-actions"><button class="primary" type="submit">Проверить</button>
      <button class="secondary" type="button" id="practice-reveal">Показать ответ</button>
      <button class="secondary" type="button" id="practice-rules">Правила</button></div>
    <div id="practice-feedback" tabindex="0" role="status" aria-live="polite" aria-atomic="true"></div>
    <details id="practice-alternatives" hidden><summary>Другие допустимые ответы</summary><ul></ul></details>`;
}

export function bindAnswer(root, getExercise, onResult = () => {}) {
  const input = root.querySelector('#practice-answer');
  const feedback = root.querySelector('#practice-feedback');
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let composing = false;
  let resultState = null;
  const alternatives = root.querySelector('#practice-alternatives');
  function render(status, userAnswer) {
    clear();
    const exercise = getExercise();
    resultState = { status, answer: userAnswer };
    feedback.dataset.status = input.dataset.status = status;
    input.setAttribute('aria-invalid', String(status === 'incorrect' || status === 'incomplete'));
    if (status === 'incomplete') { feedback.textContent = 'Завершите ввод ромадзи или введите хирагану.'; return; }
    const expected = closestAnswer(exercise, userAnswer);
    feedback.innerHTML = `<strong>${status === 'correct' ? 'Верно' : status === 'incorrect' ? 'Неверно' : status === 'unknown' ? 'Не знаю' : 'Ответ'}</strong>
      <div class="feedback-user"><span>Ваш ответ:</span> <span lang="ja">${esc(userAnswer || '—')}</span></div>
      <div class="feedback-expected"><span>Правильный ответ:</span> <span lang="ja">${esc(expected)}</span></div>
      ${status !== 'correct' && exercise.hint ? `<p class="feedback-rule">${highlightedRule(exercise.hint)}</p>` : ''}`;
    const other = (exercise.displayAnswers || exercise.answers).filter(a => a !== expected);
    alternatives.hidden = !other.length;
    alternatives.querySelector('ul').innerHTML = other.map(a => `<li lang="ja">${esc(a)}</li>`).join('');
  }
  bind(input, { IMEMode: 'toHiragana' });
  function clear() {
    resultState = null;
    alternatives.hidden = true; alternatives.open = false;
    feedback.textContent = '';
    feedback.scrollTop = 0;
    delete feedback.dataset.status;
    delete input.dataset.status;
    input.removeAttribute('aria-invalid');
  }
  input.addEventListener('compositionstart', () => { composing = true; }, options);
  input.addEventListener('compositionend', () => { composing = false; }, options);
  input.addEventListener('input', clear, options);
  root.querySelector('#practice-form').addEventListener('submit', event => {
    event.preventDefault();
    if (composing) return;
    input.value = normalizeAnswer(input.value);
    const exercise = getExercise();
    const result = checkAnswer(exercise, input.value);
    render(result.status, result.answer);
    onResult(result.status);
  }, options);
  function reveal(status = 'answer') {
    render(status, normalizeAnswer(input.value));
    onResult(status);
  }
  root.querySelector('#practice-reveal').addEventListener('click', () => reveal(), options);
  return {
    reveal,
    render,
    get result() { return resultState; },
    get composing() { return composing; },
    reset() { input.value = ''; clear(); },
    focus() { input.focus(); },
    destroy() { controller.abort(); unbind(input); },
  };
}
