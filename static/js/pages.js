import { verbReferenceLesson } from './verb-reference.js';
import { getJSON } from './api.js';
import { breadcrumbs, collectionCard, escapeHTML, heading } from './ui.js';

export function navigation(catalog) {
  const renderedSections = new Set();
  const vocabulary = catalog.collections.map((collection) => {
    let item = collection;
    if (collection.parent) {
      if (renderedSections.has(collection.parent)) return '';
      renderedSections.add(collection.parent);
      item = catalog.sections.find((section) => section.id === collection.parent);
    }
    return `<a href="${item.path}">${escapeHTML(item.label)} <small>${item.count}</small></a>`;
  }).join('');
  const grammar = catalog.lessons.filter((lesson) => lesson.sidebar).map((lesson) =>
    `<a href="${lesson.path}">${escapeHTML(lesson.label)}</a>`
  ).join('');
  return `
    <p class="nav-caption">СЛОВАРЬ</p>
    ${vocabulary}
    <a href="${catalog.base}/practice">Тренировка</a>
    <p class="nav-caption">ГРАММАТИКА</p>
    ${grammar}
  `;
}

export function sectionPage(catalog, section) {
  const cards = catalog.collections.filter((item) => section.children.includes(item.id));
  return breadcrumbs(catalog.base, [['Словарь', `${catalog.base}/vocabulary`], [section.label]])
    + heading(`СЛОВАРЬ · ${section.count} ЗАПИСЕЙ`, section.label, section.description)
    + `<div class="collection-grid two">${cards.map(collectionCard).join('')}</div>`
    + `<a class="lesson-link" href="${catalog.base}/grammar/${section.id}">Правила использования и формы →</a>`;
}

export async function grammarPage(catalog, lesson, signal) {
  const localVerbs = lesson.id === 'grammar/verbs/forms';
  const page = localVerbs ? null : await getJSON('/api/lesson?path=' + encodeURIComponent(lesson.path), signal);
  const items = lesson.id === 'grammar'
    ? [['Грамматика']]
    : [['Грамматика', `${catalog.base}/grammar`], [lesson.label]];
  const links = catalog.lessons.filter((item) => item.id !== 'grammar').map((item) => `
    <a class="chip ${item.id === lesson.id ? 'selected' : ''}" href="${item.path}">${escapeHTML(item.label)}</a>
  `).join('');
  // Lesson HTML is the bundled, sanitized source snapshot, not user input.
  return breadcrumbs(catalog.base, items)
    + heading('ГРАММАТИКА · N5', lesson.label, localVerbs ? 'Основы, готовые формы и исключения. Правила и примеры на русском.' : 'Правила и примеры из учебного раздела. Объяснения сохранены на английском.')
    + `
      <nav class="lesson-nav" aria-label="Темы грамматики">${links}</nav>
${localVerbs ? verbReferenceLesson() : `<article class="lesson" lang="en">${page.html}</article>`}
    `;
}
