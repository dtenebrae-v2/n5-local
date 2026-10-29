import { breadcrumbs, escapeHTML as esc, heading } from './ui.js';
import { exerciseFor } from './conjugation.js';
import { groupLabels } from './group-labels.js';

export const PAGE_SIZE = 60;

export function vocabularyPage(base, collection, groups, query) {
  const grammar = collection.grammar ? `
    <a class="lesson-link noun-grammar-link" href="${base}/${collection.grammar}">
      Грамматика существительных и частицы →
    </a>
  ` : '';
  const thematic = collection.grouping !== 'none';
  const chips = groups.map((group) => `
    <button class="group-tile" data-group="${esc(group.id)}">
      <span>${esc(groupLabels[group.name] || group.name)}</span> <small>${group.count} записей</small>
    </button>
  `).join('');
  return breadcrumbs(base, [['Словарь', `${base}/vocabulary`], [collection.label]])
    + heading(`СЛОВАРЬ · ${collection.count} ЗАПИСЕЙ`, collection.label, collection.description)
    + grammar + `
    <section class="vocabulary-panel">
      <div class="search-toolbar">
        <label class="search-box">
          <span aria-hidden="true">⌕</span>
          <input id="word-search" type="search" maxlength="200" value="${esc(query)}"
            placeholder="Слово, чтение или значение на английском…" aria-label="Поиск слов">
          <kbd>/</kbd>
        </label>
        <button id="add-word" type="button" class="primary">Добавить слово</button>
        <a id="download" class="download" href="/api/export.csv?collection=${collection.id}">Скачать CSV ↓</a>
      </div>
${thematic ? '<div class="filter-heading">ГРУППЫ</div>' : ''}
      ${thematic ? `<div class="group-tiles" role="group" aria-label="Фильтр по группам">
        <button data-group="" class="group-tile"><span>Все</span> <small>${collection.count} записей</small></button>${chips}
      </div>` : ''}
      <div class="results-heading">
        <span id="result-count" role="status" aria-live="polite"></span>
      </div>
      <div id="results" aria-busy="true"></div>
      <div id="pagination" class="pagination"></div>
    </section>
  `;
}

function wordRow(entry, kind, showGroup = true) {
  kind = entry.practice_kind || kind;
  const practice = exerciseFor(entry, kind, 'past');
  const names = entry.related_groups?.map(group => groupLabels[group.name] || group.name);
  const groupText = names ? (names.join(' · ') || '—') : (groupLabels[entry.group_name] || entry.group_name);
  return `
    <tr>
      <td><span class="japanese-word" lang="ja">${esc(entry.kanji)}</span>
        ${practice || kind === 'verb' ? '<div class="word-actions">' : ''}
        ${kind === 'verb' ? `<button type="button" class="practice-launch" data-conjugation="${entry.id}">Таблица спряжения</button>` : ''}
        ${practice ? `<button type="button" class="practice-launch" data-practice="${entry.id}"
          aria-label="Формы: ${esc(entry.kanji)}">Практика форм</button>` : ''}
        ${practice || kind === 'verb' ? '</div>' : ''}
      </td>
      <td class="reading-col">
        <span class="kana" lang="ja">${esc(entry.furigana || entry.kanji)}</span>
        <span class="romaji">${esc(entry.romaji)}</span>
      </td>
      <td class="word-meaning">${esc(entry.meaning)}
        ${entry.context ? `<small class="usage">${esc(entry.context)}</small>` : ''}
      </td>
      ${showGroup ? `<td><span class="word-group">${esc(groupText)}</span></td>` : ''}
    </tr>
  `;
}

export function wordTable(entries, kind, showGroup = true) {
  if (!entries.length) return `
    <div class="empty">
      <span lang="ja">探</span><h2>Пока ничего не нашлось</h2>
      <p>Попробуйте другое чтение или английское значение.</p>
      <button class="secondary" id="reset-search">Сбросить фильтры</button>
    </div>
  `;
  return `
    <div class="table-scroll">
      <table class="word-table">
        <thead><tr><th>Слово</th><th class="reading-col">Чтение</th><th>Значение</th>${showGroup ? '<th>Группа</th>' : ''}</tr></thead>
        <tbody>${entries.map((entry) => wordRow(entry, kind, showGroup)).join('')}</tbody>
      </table>
    </div>
  `;
}

export function wordGroups(entries, collection, groups) {
  if (!entries.length || collection.grouping === 'none') {
    return wordTable(entries, collection.practice_kind, collection.grouping === 'none');
  }
  const byGroup = new Map();
  for (const entry of entries) {
    if (!byGroup.has(entry.group_id)) byGroup.set(entry.group_id, []);
    byGroup.get(entry.group_id).push(entry);
  }
  const cards = [...byGroup].map(([id, words]) => {
    const group = groups.find((item) => item.id === id);
    const name = groupLabels[words[0].group_name] || words[0].group_name;
    const count = words.length === group?.count
      ? `${words.length} записей` : `${words.length} на этой странице · всего в группе ${group?.count ?? words.length}`;
    return `
      <section class="word-group-card" data-word-group="${esc(id)}">
        <header class="word-group-header"><h2>${esc(name)}</h2><span>${count}</span></header>
        ${group?.description ? `<p class="word-group-description">${esc(group.description)}</p>` : ''}
        ${wordTable(words, collection.practice_kind, false)}
      </section>
    `;
  });
  return `<div class="word-group-grid">${cards.join('')}</div>`;
}

export function pagination(total, offset) {
  if (total <= PAGE_SIZE) return '';
  return `
    <button class="secondary" id="previous" ${offset === 0 ? 'disabled' : ''}>← Назад</button>
    <span>${Math.floor(offset / PAGE_SIZE) + 1} / ${Math.ceil(total / PAGE_SIZE)}</span>
    <button class="secondary" id="next" ${offset + PAGE_SIZE >= total ? 'disabled' : ''}>Далее →</button>
  `;
}
