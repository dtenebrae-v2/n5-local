export function escapeHTML(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
}

export function breadcrumbs(base, items = []) {
  const links = items.map(([text, url]) => `
    <span>/</span>
    ${url ? `<a href="${escapeHTML(url)}">${escapeHTML(text)}</a>` : `<span>${escapeHTML(text)}</span>`}
  `).join('');
  return `<div class="breadcrumbs"><a href="${base}">JLPT N5</a>${links}</div>`;
}

export function heading(kicker, title, description) {
  return `
    <div class="page-heading">
      <p class="eyebrow">${escapeHTML(kicker)}</p>
      <h1>${escapeHTML(title)}</h1>
      <p>${escapeHTML(description)}</p>
    </div>
  `;
}

export function collectionCard(collection) {
  return `
    <a class="collection-card" href="${collection.path}">
      <span class="collection-symbol" lang="ja">${escapeHTML(collection.symbol)}</span>
      <span class="card-arrow">↗</span>
      <h3>${escapeHTML(collection.label)}</h3>
      <p>${escapeHTML(collection.detail)}</p>
      <span class="card-meta">${collection.count} записей <span>Открыть →</span></span>
    </a>
  `;
}

export function errorPage(base) {
  return `
    <div class="empty">
      <h1>Не удалось открыть страницу</h1>
      <p>Проверьте соединение с локальным сервисом и обновите страницу.</p>
      <a href="${base}">Открыть словарь →</a>
    </div>
  `;
}
