const KEY = 'n5.library.v1';
export function loadReading(storage = localStorage) {
  try {
    const data = JSON.parse(storage.getItem(KEY));
    if (data?.version === 1 && data.books && typeof data.books === 'object' && !Array.isArray(data.books)) return data;
  } catch { /* Reading remains available without browser storage. */ }
  return { version:1, books:{} };
}
export function saveReading(data, storage = localStorage) {
  try { storage.setItem(KEY,JSON.stringify(data)); return true; } catch { return false; }
}
export function readingState(data,id) {
  const saved = data.books[id] || {};
  const position = saved.position;
  return {
    page:Number.isInteger(saved.page) && saved.page > 0 ? saved.page : 1,
    audioTime:Number.isFinite(saved.audioTime) && saved.audioTime >= 0 ? saved.audioTime : 0,
    rate:[.75,1,1.25,1.5].includes(saved.rate) ? saved.rate : 1,
    zoom:Number.isFinite(saved.zoom) ? Math.min(2,Math.max(.5,saved.zoom)) : 1,
    scale:Number.isFinite(saved.scale) ? Math.min(4,Math.max(.1,saved.scale)) : null,
    fit:['page-width','page-fit'].includes(saved.fit) ? saved.fit : saved.scale ? null : 'page-width',
    position:position && Number.isInteger(position.page) && position.page > 0
      && Number.isFinite(position.left) && Number.isFinite(position.top)
      && Math.abs(position.left) <= 100000 && Math.abs(position.top) <= 100000
      ? {page:position.page,left:position.left,top:position.top} : null,
    totalPages:Number.isInteger(saved.totalPages) && saved.totalPages > 0 ? saved.totalPages : null,
    completed:saved.completed === true, updated:saved.updated || null,
  };
}
