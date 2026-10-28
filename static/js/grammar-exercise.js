import { escapeHTML as esc } from './ui.js';
import { highlightedRule } from './form-highlight.js';

export function grammarWords(data) {
  const rules = new Map(data.rules.map(rule => [rule.id, rule]));
  return data.exercises.map(task => {
    const rule = rules.get(task.rule);
    return { kind: 'grammar', collection: 'grammar', entry: {
      id: task.id, group_id: rule.topic, kanji: task.sentence, meaning: task.translation,
    }, exercise: {
      kind: 'grammar', form: rule.id, answers: task.answers.map(a => a.kana),
      displayAnswers: task.answers.map(a => a.written === a.kana ? a.kana : `${a.written}（${a.kana}）`),
      hint: rule.explanation, rule, task,
    } };
  });
}

export function grammarQuestion(exercise) {
  const { task } = exercise;
  return `<p class="practice-help">${esc(task.instruction)}</p>
    <h2 class="game-target" lang="ja">${esc(task.sentence)}</h2>
    ${task.reading !== task.sentence ? `<p lang="ja">${esc(task.reading)}</p>` : ''}
    <p>${esc(task.translation)}</p>`;
}

export function openGrammarRules(exercise, data, signal, onClose) {
  if (signal.aborted || document.querySelector('.practice-rules-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'practice-dialog practice-rules-dialog';
  dialog.setAttribute('aria-labelledby', 'rules-title');
  const topic = data.topics.find(topic => topic.id === exercise.rule.topic);
  dialog.innerHTML = `<div class="practice-header"><h2 id="rules-title">${esc(topic.label)}</h2><button type="button" class="practice-close" aria-label="Закрыть правила">×</button></div>
    <div class="reference-body grammar-reference">${data.rules.filter(rule => rule.topic === topic.id).map(rule => `<section ${rule.id === exercise.form ? 'class="current-rule" aria-current="true"' : ''}>
    <h3>${esc(rule.label)}</h3><p>${highlightedRule(rule.explanation)}</p>
    ${rule.sources.map((url, i) => `<a href="${esc(url)}" target="_blank" rel="noreferrer">Источник${rule.sources.length > 1 ? ' ' + (i + 1) : ''} ↗</a>`).join(' ')}</section>`).join('')}</div>`;
  const close = () => dialog.close();
  dialog.querySelector('button').addEventListener('click', close);
  signal.addEventListener('abort', close, { once: true });
  dialog.addEventListener('close', () => {
    signal.removeEventListener('abort', close); dialog.remove(); if (!signal.aborted) onClose();
  }, { once: true });
  document.body.append(dialog); dialog.showModal();
  dialog.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' });
}
