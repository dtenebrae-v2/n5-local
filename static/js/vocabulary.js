import { openAddWord } from './add-word.js';
import { openVerbReference } from './verb-reference.js';
import { openPractice } from './practice.js';
import { getJSON, latestRequest } from './api.js';
import { PAGE_SIZE, pagination, vocabularyPage, wordGroups } from './vocabulary-view.js';

function initialState(params, groups) {
  const requestedOffset = Number(params.get('offset'));
  return {
    group: groups.some((group) => group.id === params.get('group')) ? params.get('group') : '',
    query: (params.get('q') || '').trim().slice(0, 200),
    offset: Number.isSafeInteger(requestedOffset) && requestedOffset > 0
      ? Math.floor(requestedOffset / PAGE_SIZE) * PAGE_SIZE : 0,
  };
}

export async function mountVocabulary(content, catalog, collection, signal) {
  const groups = collection.grouping === 'none'
    ? [] : await getJSON('/api/groups?collection=' + collection.id, signal);
  if (signal.aborted) return;
  const params = new URLSearchParams(location.search);
  const state = initialState(params, groups);
  content.innerHTML = vocabularyPage(catalog.base, collection, groups, state.query);
  const input = content.querySelector('#word-search');
  const results = content.querySelector('#results');
  const pages = content.querySelector('#pagination');
  const resultCount = content.querySelector('#result-count');
  const download = content.querySelector('#download');
  const chips = [...content.querySelectorAll('[data-group]')];
  const { get: request, cancel } = latestRequest(signal);
  let timer;
  let revision = 0;
  let visibleEntries = [];
  signal.addEventListener('abort', () => clearTimeout(timer), { once: true });

  function updateAddress() {
    const address = new URLSearchParams();
    if (state.group) address.set('group', state.group);
    if (state.query) address.set('q', state.query);
    if (state.offset) address.set('offset', state.offset);
    history.replaceState({}, '', location.pathname + (address.size ? '?' + address : ''));
  }

  async function update() {
    if (signal.aborted) return;
    const ownRevision = ++revision;
    const query = new URLSearchParams({ collection: collection.id, limit: PAGE_SIZE, offset: state.offset });
    if (state.group) query.set('group', state.group);
    if (state.query) query.set('q', state.query);
    updateAddress();
    chips.forEach((chip) => {
      const selected = chip.dataset.group === state.group;
      chip.classList.toggle('selected', selected);
      chip.setAttribute('aria-pressed', String(selected));
    });
    download.href = '/api/export.csv?' + query;
    results.setAttribute('aria-busy', 'true');
    pages.innerHTML = '';
    try {
      const data = await request('/api/words?' + query);
      if (signal.aborted || ownRevision !== revision) return;
      // Old bookmarks may point beyond the last page after data or filters change.
      const lastOffset = Math.max(0, Math.ceil(data.total / PAGE_SIZE) - 1) * PAGE_SIZE;
      if (state.offset > lastOffset) {
        state.offset = lastOffset;
        return update();
      }
      resultCount.textContent = data.total
        ? `Найдено ${data.total} · показаны ${state.offset + 1}–${state.offset + data.entries.length}`
        : 'Ничего не найдено';
      visibleEntries = data.entries;
      results.innerHTML = wordGroups(data.entries, collection, groups);
      pages.innerHTML = pagination(data.total, state.offset);
    } catch (error) {
      if (error.name === 'AbortError' || signal.aborted || ownRevision !== revision) return;
      resultCount.textContent = '';
      results.innerHTML = '<p class="error">Не удалось загрузить слова. Проверьте, запущен ли сервис, и обновите страницу.</p>';
    } finally {
      if (!signal.aborted && ownRevision === revision) results.setAttribute('aria-busy', 'false');
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    // Invalidate an earlier response immediately, before the debounce expires.
    revision++;
    cancel();
    pages.innerHTML = '';
    state.query = input.value.trim();
    state.offset = 0;
    timer = setTimeout(update, 160);
  }, { signal });

  content.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.id === 'add-word') {
      openAddWord(catalog, signal);
      return;
    }
    if (button.hasAttribute('data-conjugation')) {
      const entry = visibleEntries.find(item => String(item.id) === button.dataset.conjugation);
      if (entry) openVerbReference(entry, signal);
      return;
    }
    if (button.hasAttribute('data-practice')) {
      const entry = visibleEntries.find((item) => String(item.id) === button.dataset.practice);
      if (entry) openPractice(entry, collection.practice_kind, signal);
      return;
    }
    if (button.hasAttribute('data-group')) {
      state.group = button.dataset.group;
      state.offset = 0;
    } else if (button.id === 'reset-search') {
      state.group = '';
      state.query = '';
      state.offset = 0;
      input.value = '';
    } else if (button.id === 'previous') {
      state.offset = Math.max(0, state.offset - PAGE_SIZE);
    } else if (button.id === 'next') {
      state.offset += PAGE_SIZE;
    } else {
      return;
    }
    clearTimeout(timer);
    update();
  }, { signal });

  await update();
  if (!signal.aborted && params.has('search')) input.focus();
}
