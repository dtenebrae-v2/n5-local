import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';
import { groupLabels } from './group-labels.js';

export function openAddWord(catalog, pageSignal) {
  if (pageSignal.aborted || document.querySelector('.add-word-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'practice-dialog add-word-dialog';
  dialog.setAttribute('aria-labelledby', 'add-word-title');
  dialog.innerHTML = `<div class="practice-header"><h2 id="add-word-title">Добавить слово</h2>
    <button type="button" class="practice-close" aria-label="Закрыть добавление">×</button></div>
    <form id="add-word-form">
      <label>Написание *<input name="kanji" required maxlength="200" autocomplete="off" lang="ja"></label>
      <fieldset class="word-readings"><legend>Чтения *</legend><div id="new-readings"></div>
        <button type="button" class="secondary" id="add-reading">Ещё чтение</button></fieldset>
      <label>Перевод на английский *<textarea name="meaning" required maxlength="4000" rows="2"></textarea></label>
      <fieldset id="new-collection" class="practice-target"><legend>Раздел *</legend><div class="game-modes">
        ${catalog.collections.map(c => `<label class="form-choice"><input type="radio" name="collection" value="${esc(c.id)}" required><span>${c.id === 'complete' ? 'Только общий словарь' : esc(c.label)}</span></label>`).join('')}
      </div></fieldset>
      <fieldset id="new-group-label" class="practice-target" disabled><legend id="new-group-title">Группа *</legend>
        <div id="new-groups" class="game-modes">Сначала выберите раздел</div></fieldset>
      <details class="word-optional"><summary>Необязательные поля</summary>
        <label>Пример / пояснение<textarea name="context" maxlength="2000" rows="2"></textarea></label>
        <label>Задание на английском<input name="vocabulary_prompt" maxlength="500" placeholder="to wear — upper-body clothing"></label>
        <label>Другие допустимые ответы (кана | написание, по одному на строку)<textarea name="vocabulary_answers" rows="2" maxlength="4000"></textarea></label>
        <label>Источник<input name="source" type="url" maxlength="1000" placeholder="https://…"></label>
      </details>
      <p id="add-word-error" role="alert"></p>
      <div class="practice-actions"><button type="submit" class="primary">Добавить</button>
        <button type="button" class="secondary" id="cancel-add-word">Отмена</button></div>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const error = dialog.querySelector('#add-word-error');
  const readings = dialog.querySelector('#new-readings');
  const collection = dialog.querySelector('#new-collection');
  const selectedCollection = () => collection.querySelector('input:checked')?.value || '';
  const selectedGroup = () => group.querySelector('input:checked')?.value || '';
  const group = dialog.querySelector('#new-group-label');
  const groupOptions = dialog.querySelector('#new-groups');
  const submit = form.querySelector('[type=submit]');
  let allGroups;
  let saving = false;
  const controller = new AbortController();
  const close = () => { if (!saving) dialog.close(); };
  const abort = () => dialog.close();

  function addReading() {
    if (readings.children.length >= 10) return;
    const row = document.createElement('div');
    row.className = 'new-reading';
    row.innerHTML = `<label>Кана *<input name="kana" required maxlength="200" autocomplete="off" lang="ja"></label>
      <label>Ромадзи *<input name="romaji" required maxlength="200" autocomplete="off" pattern=".*[A-Za-z].*" title="Используйте латиницу"></label>
      <button type="button" class="remove-reading" aria-label="Удалить чтение">×</button>`;
    row.querySelector('button').addEventListener('click', () => {
      if (readings.children.length <= 1) return;
      row.remove(); updateReadingButtons();
    });
    readings.append(row);
    updateReadingButtons();
  }
  function updateReadingButtons() {
    readings.querySelectorAll('button').forEach(button => { button.hidden = readings.children.length === 1; });
    dialog.querySelector('#add-reading').disabled = readings.children.length >= 10;
  }
  async function updateGroups() {
    const selected = selectedCollection();
    const needsGroup = !!selected && selected !== 'complete';
    dialog.querySelector('#new-group-label').hidden = selected === 'complete';
    dialog.querySelector('#new-group-title').textContent = selected === 'verbs' ? 'Тип спряжения *' : 'Группа *';
    group.disabled = true;
    groupOptions.textContent = needsGroup ? 'Загрузка…' : 'Сначала выберите раздел';
    error.textContent = '';
    if (!needsGroup) return;
    try {
      allGroups ||= await getJSON('/api/groups', controller.signal);
      if (selectedCollection() !== selected || controller.signal.aborted) return;
      groupOptions.innerHTML = allGroups.filter(g => g.collection === selected)
        .map(g => `<label class="form-choice"><input type="radio" name="group" value="${esc(g.id)}" required><span>${esc(groupLabels[g.name] || g.name)}</span></label>`).join('');
      group.disabled = false;
    } catch (failure) {
      if (failure.name !== 'AbortError') error.textContent = 'Не удалось загрузить группы. Выберите раздел ещё раз.';
    }
  }
  addReading();
  dialog.querySelector('#add-reading').addEventListener('click', addReading);
  collection.addEventListener('change', updateGroups);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    if (selectedCollection() !== 'complete' && (group.disabled || !selectedGroup())) {
      error.textContent = 'Выберите группу.'; return;
    }
    const payload = {
      kanji: form.elements.kanji.value.trim(),
      readings: [...readings.children].map(row => ({ kana: row.querySelector('[name=kana]').value.trim(), romaji: row.querySelector('[name=romaji]').value.trim() })),
      meanings: form.elements.meaning.value.split('\n').map(value => value.trim()).filter(Boolean),
      collection: selectedCollection(), group: selectedCollection() === 'complete' ? null : selectedGroup(),
      vocabulary_prompt: form.elements.vocabulary_prompt.value.trim(),
      vocabulary_answers: form.elements.vocabulary_answers.value.split('\n').map(s => s.trim()).filter(Boolean).map(line => { const [kana, written] = line.split('|').map(s => s.trim()); return { kana, kanji: written || kana }; }),
      context: form.elements.context.value.trim(), source: form.elements.source.value.trim(),
    };
    saving = true;
    error.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Сохранение…';
    dialog.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = true; });
    try {
      const response = await fetch('/api/words', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось добавить слово.');
      dialog.close();
      document.dispatchEvent(new CustomEvent('vocabulary-updated', { detail: result }));
    } catch (failure) {
      if (!controller.signal.aborted) error.textContent = failure.message === 'Failed to fetch' ? 'Нет соединения с сервером. Проверьте словарь перед повторной отправкой.' : failure.message;
    } finally {
      saving = false;
      dialog.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = false; });
      group.disabled = !selectedCollection() || selectedCollection() === 'complete' || !allGroups;
      updateReadingButtons();
      submit.textContent = 'Добавить';
    }
  });
  dialog.querySelector('.practice-close').addEventListener('click', close);
  dialog.querySelector('#cancel-add-word').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  pageSignal.addEventListener('abort', abort, { once: true });
  dialog.addEventListener('close', () => {
    controller.abort();
    pageSignal.removeEventListener('abort', abort);
    dialog.remove();
  }, { once: true });
  dialog.showModal();
  form.elements.kanji.focus();
}
