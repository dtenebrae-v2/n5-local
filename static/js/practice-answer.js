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
    <p id="practice-feedback" role="status" aria-live="polite" aria-atomic="true"></p>`;
}

export function bindAnswer(root, getExercise, onResult = () => {}) {
  const input = root.querySelector('#practice-answer');
  const feedback = root.querySelector('#practice-feedback');
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let composing = false;
  bind(input, { IMEMode: 'toHiragana' });
  function clear() {
    feedback.textContent = '';
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
    feedback.dataset.status = input.dataset.status = result.status;
    input.setAttribute('aria-invalid', String(result.status !== 'correct'));
    feedback.textContent = result.status === 'incomplete' ? 'Завершите ввод ромадзи или введите хирагану.'
      : result.status === 'correct' ? `Верно: ${closestAnswer(exercise, result.answer)}`
      : result.answer ? `Неверно: ${result.answer}` : 'Неверно: ответ не введён.';
    if (result.status === 'incorrect') {
      feedback.textContent += !result.answer || exercise.kind === 'vocabulary'
        ? ' · Ответ: ' + (exercise.displayAnswers || exercise.answers).join(' / ')
        : ' · Ближайший ответ: ' + closestAnswer(exercise, result.answer);
    }
    onResult(result.status);
  }, options);
  root.querySelector('#practice-reveal').addEventListener('click', () => {
    clear();
    feedback.dataset.status = 'answer';
    const exercise = getExercise();
    feedback.textContent = 'Ответ: ' + (exercise.displayAnswers || exercise.answers).join(' / ');
    onResult('answer');
  }, options);
  return {
    get composing() { return composing; },
    reset() { input.value = ''; clear(); },
    focus() { input.focus(); },
    destroy() { controller.abort(); unbind(input); },
  };
}
