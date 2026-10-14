import { openPracticeRules } from './practice-rules.js';
import { VERB_FORM_LABELS } from './verb-forms.js';
import { answerFields, bindAnswer } from './practice-answer.js';
import { exerciseFor, FORM_LABELS } from './conjugation.js';
import { escapeHTML as esc } from './ui.js';

function choices(labels, selected) {
  return Object.entries(labels).map(([id, label]) => `<label class="form-choice">
    <input type="radio" name="practice-target" value="${id}" ${id === selected ? 'checked' : ''}>
    <span>${esc(label)}</span></label>`).join('');
}

export function openPractice(entry, kind, pageSignal, initialForm = 'past') {
  let exercise = exerciseFor(entry, kind, initialForm);
  if (!exercise || pageSignal.aborted) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'practice-dialog';
  dialog.setAttribute('aria-labelledby', 'practice-title');
  dialog.innerHTML = `
    <div class="practice-header">
      <div><p class="eyebrow">${kind === 'verb' ? 'ФОРМЫ ГЛАГОЛА' : 'ВЕЖЛИВЫЕ ФОРМЫ · です / ます'}</p><h2 id="practice-title">Проверка форм</h2></div>
      <button type="button" class="practice-close" aria-label="Закрыть проверку">×</button>
    </div>
    <p class="practice-word"><span lang="ja">${esc(entry.kanji)}</span>
      <span class="practice-reading" lang="ja">${esc(exercise.reading)}</span></p>
    <p class="practice-meaning">${esc(entry.meaning)}</p>
    <form id="practice-form">
      <fieldset id="practice-target" class="practice-target">
        <legend>Требуемая форма</legend>
        <div class="form-choices">${choices(FORM_LABELS, initialForm)}</div>
        ${kind === 'verb' ? `<details class="extra-forms" ${Object.hasOwn(VERB_FORM_LABELS, initialForm) ? 'open' : ''}>
          <summary>Обычные и дополнительные формы</summary>
          <div class="form-choices">${choices(VERB_FORM_LABELS, initialForm)}</div>
        </details>` : ''}
      </fieldset>
      ${answerFields()}
    </form>
    <details class="practice-rules">
      <summary>Правило и источники</summary>
      <p id="practice-rule"></p>
      <p>У глаголов доступны вежливые и обычные формы.
        У существительных и な-прилагательных принимаются варианты с では и じゃ.</p>
      ${kind === 'verb' ? '<a href="/jlpt/n5/grammar/verbs/forms">Справка по основам и формам →</a>' : ''}
      <a href="https://a2.marugotoweb.jp/en/grammar/description/004.html" target="_blank" rel="noreferrer">Japan Foundation: время и отрицание ↗</a>
      <a href="https://a2.marugotoweb.jp/en/grammar/reference/003.html" target="_blank" rel="noreferrer">Japan Foundation: прилагательные и いい ↗</a>
      <a href="https://www.coelang.tufs.ac.jp/mt/ja/gmod/courses/c02/" target="_blank" rel="noreferrer">TUFS: варианты вежливого отрицания ↗</a>
    </details>
  `;
  document.body.append(dialog);
  const target = dialog.querySelector('#practice-target');
  const rules = dialog.querySelector('#practice-rule');
  const answer = bindAnswer(dialog, () => exercise);
  const close = () => dialog.close();
  dialog.querySelector('#practice-rules').addEventListener('click', () => openPracticeRules(kind, exercise.form, pageSignal, () => answer.focus()));
  function showExercise() {
    exercise = exerciseFor(entry, kind, target.querySelector('input:checked').value);
    rules.textContent = exercise.rule;
    answer.reset();
  }
  target.addEventListener('change', showExercise);
  dialog.querySelector('.practice-close').addEventListener('click', close);
  pageSignal.addEventListener('abort', close, { once: true });
  dialog.addEventListener('close', () => {
    pageSignal.removeEventListener('abort', close);
    answer.destroy();
    dialog.remove();
  }, { once: true });
  showExercise();
  dialog.showModal();
  answer.focus();
}
