import { highlightedForm, highlightRuleParagraphs } from './form-highlight.js';
import { teReference } from './te-reference.js';
import { exerciseFor, FORM_LABELS } from './conjugation.js';
import { VERB_FORM_LABELS } from './verb-forms.js';
import { escapeHTML as esc } from './ui.js';

export function openPracticeRules(kind, form, signal, onClose = () => {}, vocabulary = null) {
  if (signal.aborted || document.querySelector('.practice-rules-dialog')) return;
  const examples = kind === 'verb'
    ? [['かう', 'Godan'], ['たべる', 'Ichidan'], ['する', 'Irregular'], ['くる', 'Irregular']]
    : kind === 'vocabulary' ? [] : [[{ noun: 'がくせい', 'i-adjective': 'おおきい', 'na-adjective': 'きれい' }[kind], null]];
  const labels = { ...FORM_LABELS, ...(kind === 'verb' ? VERB_FORM_LABELS : {}) };
  const entries = examples.map(([kana, type]) => ({ readings: [{ kana }], type }));
  const dialog = document.createElement('dialog');
  dialog.className = 'practice-dialog practice-rules-dialog';
  dialog.setAttribute('aria-labelledby', 'rules-title');
  dialog.innerHTML = `<div class="practice-header"><h2 id="rules-title">${kind === 'vocabulary' ? 'Слово и чтение' : esc(VERB_FORM_LABELS[form] || FORM_LABELS[form])}</h2>
    <button type="button" class="practice-close" aria-label="Закрыть правила">×</button></div>
    <div class="reference-body">${kind === 'vocabulary' ? `<p lang="en">${esc(vocabulary.meaning)}</p>
      <div class="table-scroll"><table class="rules-table"><thead><tr><th>Японское слово и чтение</th></tr></thead><tbody>
      ${vocabulary.answers.map(answer => `<tr><td lang="ja">${esc(answer)}</td></tr>`).join('')}</tbody></table></div>
      <p class="practice-help">Слово подсмотрено — ответ не засчитывается с первой попытки.</p>`
      : kind === 'verb' && form === 'te' ? teReference() : `    ${entries.map((entry, i) => `<p><b>${esc(examples[i][0])}${entry.type ? ' · ' + esc(entry.type) : ''}</b>: ${esc(exerciseFor(entry, kind, form).rule)}</p>`).join('')}
    <div class="table-scroll"><table class="rules-table"><thead><tr><th scope="col">Форма</th>
    ${examples.map(([kana]) => `<th scope="col" lang="ja">${esc(kana)}</th>`).join('')}</tr></thead><tbody>
    ${Object.entries(labels).filter(([id]) => kind !== 'verb' || id === form).map(([id, label]) => `<tr ${id === form ? 'class="current-rule" aria-current="true"' : ''}>
      <th scope="row">${esc(label)}</th>${entries.map(entry => `<td lang="ja">${exerciseFor(entry, kind, id).answers.map(value => highlightedForm(value, entry.readings[0].kana)).join('<br>')}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    ${kind === 'verb' ? '<p>Godan: перед ます последний слог переходит в ряд い. Перед ない — в ряд あ (う → わ). Для ば — ряд え + ば, для намерения — ряд お + う, приказ — ряд え.</p><p>て / た у Godan: う・つ・る → って / った; む・ぶ・ぬ → んで / んだ; く → いて / いた; ぐ → いで / いだ; す → して / した. Исключения: いく → いって / いった, ある → ない, приказ くれる → くれ.</p>' : ''}
    ${kind === 'i-adjective' ? '<p>Исключение いい / よい: よかったです, よくないです / よくありません, よくなかったです / よくありませんでした.</p>' : ''}`}</div>`;
  if (kind !== 'vocabulary') highlightRuleParagraphs(dialog.querySelector('.reference-body'));
  const close = () => dialog.close();
  dialog.querySelector('.practice-close').addEventListener('click', close);
  signal.addEventListener('abort', close, { once: true });
  dialog.addEventListener('close', () => {
    signal.removeEventListener('abort', close);
    dialog.remove();
    if (!signal.aborted) onClose();
  }, { once: true });
  document.body.append(dialog);
  dialog.querySelectorAll('.table-scroll').forEach(table => { table.tabIndex = 0; table.setAttribute('aria-label', 'Таблица справки, прокручивается по горизонтали'); });
  dialog.showModal();
}
