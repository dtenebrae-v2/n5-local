export function resolveRoute(pathname, catalog) {
  const path = pathname.replace(/\/$/, '') || '/';
  if (['/', '/jlpt', catalog.base, `${catalog.base}/vocabulary`].includes(path)) {
    const item = catalog.collections.find((entry) => entry.id === 'complete');
    return { type: 'words', title: item.label, item, canonical: item.path };
  }
  if (path === `${catalog.base}/practice`) return { type: 'game', title: 'Тренировка' };
  for (const [key, type] of [['collections', 'words'], ['sections', 'section'], ['lessons', 'grammar']]) {
    const item = catalog[key].find((entry) => entry.path === path);
    if (item) return { type, title: item.label, item };
  }
  return { type: 'missing', title: 'Страница не найдена' };
}
