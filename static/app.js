import { mountGame } from './js/game.js';
import { getJSON } from './js/api.js';
import { grammarPage, navigation, sectionPage } from './js/pages.js';
import { resolveRoute } from './js/router.js';
import { errorPage } from './js/ui.js';
import { mountVocabulary } from './js/vocabulary.js';

const content = document.querySelector('#content');
const menu = document.querySelector('#navigation');
const menuToggle = document.querySelector('.menu-toggle');
let pageController;
let catalog;

function scrollToAnchor() {
  if (!location.hash) return;
  try {
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  } catch {
    // Ignore malformed fragments in external links.
  }
}

async function render() {
  pageController?.abort();
  pageController = new AbortController();
  const { signal } = pageController;
  const route = resolveRoute(location.pathname, catalog);
  if (route.canonical) history.replaceState({}, '', route.canonical + location.search + location.hash);
  document.title = `${route.title} · N5`;
  menu.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menu.querySelectorAll('a').forEach((link) => {
    const path = location.pathname.replace(/\/$/, '');
    const active = path === link.pathname
      || (link.pathname !== catalog.base && path.startsWith(link.pathname + '/'));
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  try {
    if (route.type === 'game') {
      await mountGame(content, catalog, signal);
    } else if (route.type === 'section') {
      content.innerHTML = sectionPage(catalog, route.item);
    } else if (route.type === 'words') {
      content.innerHTML = '<p class="loading">Открываем словарь…</p>';
      await mountVocabulary(content, catalog, route.item, signal);
    } else if (route.type === 'grammar') {
      content.innerHTML = '<p class="loading">Открываем грамматику…</p>';
      const html = await grammarPage(catalog, route.item, signal);
      if (!signal.aborted) content.innerHTML = html;
    } else {
      content.innerHTML = `<h1>Страница не найдена</h1><a href="${catalog.base}">Открыть словарь →</a>`;
    }
    if (!signal.aborted) scrollToAnchor();
  } catch (error) {
    if (!signal.aborted && error.name !== 'AbortError') content.innerHTML = errorPage(catalog.base);
  }
}

function navigate(url) {
  history.pushState({}, '', url);
  window.scrollTo(0, 0);
  render();
}

function bindNavigation() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
        || event.button !== 0 || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin) return;
    // Keep native in-page anchors, including the accessibility skip link.
    if (link.getAttribute('href').startsWith('#')) return;
    if (url.pathname === catalog.base || url.pathname.startsWith(catalog.base + '/')) {
      event.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    }
  });
  menuToggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('keydown', (event) => {
    if (document.querySelector('dialog[open]')) return;
    const active = document.activeElement;
    if (event.key !== '/' || active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
    event.preventDefault();
    const input = document.querySelector('#word-search');
    if (input) input.focus();
    else navigate(`${catalog.base}/vocabulary/complete?search=1`);
  });
  window.addEventListener('popstate', render);
  document.addEventListener('vocabulary-updated', event => {
    catalog = event.detail.catalog;
    menu.innerHTML = navigation(catalog);
    navigate(`${catalog.base}/vocabulary/${encodeURIComponent(event.detail.collection)}?q=${encodeURIComponent(event.detail.kanji)}`);
  });
}

async function start() {
  try {
    catalog = await getJSON('/api/catalog');
    menu.innerHTML = navigation(catalog);
    bindNavigation();
    await render();
  } catch {
    content.innerHTML = errorPage('/jlpt/n5');
  }
}

start();
