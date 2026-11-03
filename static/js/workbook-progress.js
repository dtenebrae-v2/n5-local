export const WORKBOOK_KEY = 'n5.workbooks.v1';
const STATUSES = new Set(['correct', 'incorrect', 'unknown', 'answer', 'skip', 'ungraded']);
export function loadWorkbookProgress(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(WORKBOOK_KEY));
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : { books: {} };
  } catch { return { books: {} }; }
}
export function saveWorkbookProgress(progress, storage = globalThis.localStorage) {
  try { storage.setItem(WORKBOOK_KEY, JSON.stringify(progress)); return true; } catch { return false; }
}
export function restoreWorkbookSession(session, items) {
  const ids = new Set(items.map(q => q.id));
  if (!session || !Array.isArray(session.keys) || !session.keys.length || session.keys.length > items.length
    || new Set(session.keys).size !== session.keys.length || session.keys.some(id => !ids.has(id))
    || !Number.isInteger(session.index) || session.index < 0 || session.index > session.keys.length) return null;
  const answers = {};
  for (const id of session.keys) {
    const value = session.answers?.[id], q = items.find(q => q.id === id);
    if (!value || typeof value !== 'object') continue;
    const choice = v => Number.isInteger(v) && v >= 0 && v < q.choices.length ? v : null;
    answers[id] = { choice: choice(value.choice), firstChoice: choice(value.firstChoice),
      status: STATUSES.has(value.status) ? value.status : null, first: STATUSES.has(value.first) ? value.first : null,
      assisted: value.assisted === true };
  }
  return { keys: session.keys, index: session.index, answers, title: typeof session.title === 'string' ? session.title.slice(0,100) : '' };
}
export function workbookSession(items, title, random = false, limit = items.length) {
  const keys = items.map(item => item.id);
  if (random) for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return { keys: keys.slice(0, limit), title, index: 0, answers: {} };
}
export function recordWorkbookAnswer(progress, session, q, status, choice) {
  const result = session.answers[q.id] ||= { choice: null, status: null, first: null, firstChoice: null, assisted: false };
  result.choice = choice; result.status = status;
  if (!result.first) {
    result.first = status; result.firstChoice = choice;
    if (q.correct !== null) {
      progress.records ||= {};
      progress.records[q.id] = { status: result.assisted && status === 'correct' ? 'answer' : status, at: Date.now() };
    }
  }
  return result;
}
