const KEY = 'n5.library.v1';
export function loadReading(storage = localStorage) {
  try {
    const data = JSON.parse(storage.getItem(KEY));
    if (data?.version === 1 && data.books && !Array.isArray(data.books)) return data;
  } catch { /* Reading remains available without browser storage. */ }
  return { version:1, books:{} };
}
export function saveReading(data, storage = localStorage) {
  try { storage.setItem(KEY,JSON.stringify(data)); return true; } catch { return false; }
}
export function readingState(data,id) {
  const saved = data.books[id] || {};
  return {
    page:Number.isInteger(saved.page) && saved.page > 0 ? saved.page : 1,
    audioTime:Number.isFinite(saved.audioTime) && saved.audioTime >= 0 ? saved.audioTime : 0,
    rate:[.75,1,1.25,1.5].includes(saved.rate) ? saved.rate : 1,
    zoom:Number.isFinite(saved.zoom) ? Math.min(2,Math.max(.5,saved.zoom)) : 1,
    completed:saved.completed === true, updated:saved.updated || null,
  };
}
