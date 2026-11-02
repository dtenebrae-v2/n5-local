import { escapeHTML as esc } from './ui.js';

export function passageHTML(question, review = false) {
  const text = question.passageText || '';
  if (!review) return esc(text);
  const evidence = question.evidence || [];
  const ranges = evidence.flatMap(quote => {
    const start = text.indexOf(quote);
    return start < 0 ? [] : [{ start, end: start + quote.length }];
  });
  const words = new Map((question.wordRefs || []).map(word => [word.text, word]));
  // Match whole authored tokens, not guessed substrings of Japanese words.
  const tokens = text.matchAll(/[一-鿿々ぁ-ゖァ-ヺー]+|[^一-鿿々ぁ-ゖァ-ヺー]+/gu);
  let html = '';
  for (const token of tokens) {
    const start = token.index, end = start + token[0].length;
    const word = words.get(token[0]);
    const body = word ? `<button class="reading-word" data-reading-word="${word.id}" data-reading-question="${esc(question.id)}" data-reading-offset="${start}">${esc(token[0])}</button>` : esc(token[0]);
    html += ranges.some(range => start < range.end && end > range.start) ? `<mark class="reading-evidence">${body}</mark>` : body;
  }
  return html;
}
export function choiceExplanation(question, selected) {
  if (selected === question.correct || !Number.isInteger(selected)) return '';
  const note = question.choiceNotes?.[question.choices[selected]];
  return note ? `<p class="reading-contradiction"><strong>Почему ваш вариант не подходит:</strong> ${esc(note)}</p>` : '';
}
export function bindReading(root, signal, getQuestions, progress, save) {
  root.addEventListener('click', event => {
    const trigger = event.target.closest('[data-reading-word]');
    if (!trigger || document.querySelector('dialog[open]')) return;
    const question = getQuestions().find(q => q.id === trigger.dataset.readingQuestion);
    const reference = question?.wordRefs?.find(w => String(w.id) === trigger.dataset.readingWord);
    if (!reference) return;
    const text = question.passageText, offset = Number(trigger.dataset.readingOffset);
    const start = Math.max(text.lastIndexOf('。',offset-1),text.lastIndexOf('\n',offset-1))+1;
    const ends = [text.indexOf('。',offset),text.indexOf('\n',offset)].filter(i=>i>=0);
    const end = ends.length ? Math.min(...ends) : text.length;
    const word = { ...reference,context:text.slice(start,end+(text[end]==='。'?1:0)).trim() };
    const dialog = document.createElement('dialog');
    dialog.className = 'practice-dialog';
    dialog.setAttribute('aria-labelledby', 'reading-word-title');
    const key = `${word.id}:${word.context}`;
    const saved = () => (progress.bookmarks || []).some(item => item.key === key);
    dialog.innerHTML = `<div class="practice-header"><h2 id="reading-word-title" lang="ja">${esc(word.written)}</h2><button class="practice-close" aria-label="Закрыть">×</button></div>
      <p lang="ja">${esc(word.reading)}</p><p lang="en">${esc(word.meaning)}</p><p class="mock-passage" lang="ja">${esc(word.context)}</p>
      <div class="practice-actions"><button class="primary" data-bookmark ${saved() ? 'disabled' : ''}>${saved() ? 'Пример сохранён' : 'Сохранить пример'}</button>
      <a class="secondary" href="/jlpt/n5/vocabulary/${encodeURIComponent(word.collection)}?q=${encodeURIComponent(word.written)}">В словарь →</a></div>`;
    dialog.querySelector('.practice-close').onclick = () => dialog.close();
    dialog.querySelector('[data-bookmark]').onclick = () => {
      progress.bookmarks ||= [];
      if (!saved()) progress.bookmarks.push({ ...word, key, at: Date.now() });
      const success = save() !== false;
      dialog.querySelector('[data-bookmark]').textContent = success ? 'Пример сохранён' : 'Повторить сохранение';
      dialog.querySelector('[data-bookmark]').disabled = success;
    };
    const abort = () => dialog.close();
    signal.addEventListener('abort', abort, { once: true });
    dialog.addEventListener('close', () => {
      signal.removeEventListener('abort', abort); dialog.remove();
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    }, { once: true });
    root.append(dialog); dialog.showModal();
  }, { signal });
}
export function readingBookmarks(progress) {
  const words = progress.bookmarks || [];
  return `<details class="prep-stats"><summary>Примеры из чтения (${words.length})</summary>${words.map(word => `<article class="reading-bookmark"><a href="/jlpt/n5/vocabulary/${encodeURIComponent(word.collection)}?q=${encodeURIComponent(word.written)}" lang="ja">${esc(word.written)}（${esc(word.reading)}）</a><p lang="en">${esc(word.meaning)}</p><p lang="ja">${esc(word.context)}</p></article>`).join('')}</details>`;
}
