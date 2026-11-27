import { grammarGuide } from './grammar-guides.js';
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
  const group = (id,title,links) => `<details class="nav-group"><summary id="nav-${id}" class="nav-caption">${title}</summary><div class="nav-children">${links}</div></details>`;
  return `
    <a class="nav-home" href="${catalog.base}">Моё обучение</a>
    <hr class="nav-divider">
    ${group('course','Курс N5',`<a href="${catalog.base}/course">Уроки 1–25</a>
    <a href="${catalog.base}/course/workbook">Практика по тетради</a>
    <a href="${catalog.base}/course/reviews">Повторение по урокам</a>
    <a href="${catalog.base}/workbooks">Заниматься по учебнику</a>`)}
    ${group('practice','Тренировки',`<a href="${catalog.base}/preparation">Задания по темам</a>
    <a href="${catalog.base}/practice">Слова и формы</a>
    <a href="${catalog.base}/counters">Счётные суффиксы</a>
    <a href="${catalog.base}/verb-phrases">Глаголы в сочетаниях</a>
    <a href="${catalog.base}/word-relations">Синонимы и антонимы</a>`)}
    ${group('exams','Пробные экзамены',`
    <a href="${catalog.base}/mock">Письменный пробник</a>
    <a href="${catalog.base}/exams">Варианты и аудирование</a>`)}
    ${group('materials','Книги',`<a href="${catalog.base}/library">Книги Tadoku</a>`)}
    ${group('words','Словарь',vocabulary)}
    ${group('grammar','Грамматика',grammar)}
    <hr class="nav-divider">
    <a class="nav-audio" href="${catalog.base}/audio">Аудио</a>
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
  const [page, bank] = localVerbs ? [null,null] : await Promise.all([getJSON('/api/lesson?path=' + encodeURIComponent(lesson.path), signal),getJSON('/api/grammar-practice',signal)]);
  const items = lesson.id === 'grammar'
    ? [['Грамматика']]
    : [['Грамматика', `${catalog.base}/grammar`], [lesson.label]];
  const links = catalog.lessons.filter((item) => item.id !== 'grammar').map((item) => `
    <a class="chip ${item.id === lesson.id ? 'selected' : ''}" href="${item.path}">${escapeHTML(item.label)}</a>
  `).join('');
  // Lesson HTML is the bundled, sanitized source snapshot, not user input.
  return breadcrumbs(catalog.base, items)
    + heading('ГРАММАТИКА · N5', lesson.label, 'Правила, конструкции и примеры с переводом на русский.')
    + `
      <details class="grammar-topics" ${matchMedia('(min-width: 900px)').matches ? 'open' : ''}><summary>Темы грамматики</summary><nav class="lesson-nav" aria-label="Темы грамматики">${links}</nav></details>
${localVerbs ? verbReferenceLesson() : ` ${grammarGuide(lesson.id,bank,catalog)}<details class="source-original"><summary>Оригинальный материал источника · английский</summary><article class="source-text" lang="en">${page.html.replace(/<h1(\s[^>]*)?>/gi,'<h3$1>').replace(/<\/h1>/gi,'</h3>')}</article><a href="${escapeHTML(page.source)}" target="_blank" rel="noreferrer">Открыть источник ↗</a></details>`}
    `;
}
