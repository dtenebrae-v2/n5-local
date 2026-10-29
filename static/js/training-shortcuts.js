export const DEFAULT_SHORTCUTS = { next: 'Shift+Enter', rules: 'F1', unknown: 'F2' };
const labels = { next: 'Следующее задание', rules: 'Справка', unknown: 'Не знаю' };
export function keyCombo(event) {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null;
  return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta', event.key.length === 1 ? event.key.toUpperCase() : event.key].filter(Boolean).join('+');
}
export function shortcutConflict(event) {
  const key = event.key.toUpperCase();
  if (key === '/' || key === 'ESCAPE' || ['TAB', 'F5', 'F11', 'F12'].includes(key)) return true;
  if ((event.ctrlKey || event.metaKey) && ['R','L','W','T','N','P','F','S','Q','A','C','V','X','Z','Y','+','-','0'].includes(key)) return true;
  if (event.altKey && ['ENTER', 'F4', 'ARROWLEFT', 'ARROWRIGHT'].includes(key)) return true;
  return false;
}

export function validShortcut(combo) {
  if (typeof combo !== 'string') return false;
  const parts = combo.split('+');
  const key = parts.pop();
  if (!key || parts.some(part => !['Ctrl','Alt','Shift','Meta'].includes(part)) || new Set(parts).size !== parts.length) return false;
  const event = { key, ctrlKey: parts.includes('Ctrl'), altKey: parts.includes('Alt'), shiftKey: parts.includes('Shift'), metaKey: parts.includes('Meta') };
  return (parts.length > 0 || /^F\d{1,2}$/.test(key)) && !shortcutConflict(event);
}

export function mountShortcuts(root, progress, save, signal, onChange) {
  const shortcuts = { ...DEFAULT_SHORTCUTS };
  const used = new Set();
  for (const action of Object.keys(DEFAULT_SHORTCUTS)) {
    const candidate = progress.shortcuts?.[action];
    const fallback = DEFAULT_SHORTCUTS[action];
    shortcuts[action] = validShortcut(candidate) && !used.has(candidate) ? candidate : fallback;
    if (used.has(shortcuts[action])) shortcuts[action] = ['F3', 'F4', 'F6'].find(key => !used.has(key));
    used.add(shortcuts[action]);
  }
  const box = document.createElement('details');
  box.id = 'game-keyboard';
  box.innerHTML = `<summary>Клавиши</summary><div class="practice-actions">${Object.keys(labels).map(key => `<button type="button" class="secondary" data-shortcut="${key}"></button>`).join('')}<button type="button" class="secondary" id="shortcut-reset">Сбросить</button></div><p role="status" id="shortcut-status"></p>`;
  root.querySelector('#game-options').append(box);
  let capture = null;
  function refresh() {
    for (const button of box.querySelectorAll('[data-shortcut]')) button.textContent = `${labels[button.dataset.shortcut]}: ${shortcuts[button.dataset.shortcut]}`;
    progress.shortcuts = { ...shortcuts };
    onChange(shortcuts);
  }
  box.addEventListener('click', event => {
    const key = event.target.closest('[data-shortcut]')?.dataset.shortcut;
    if (key) { capture = key; box.querySelector('#shortcut-status').textContent = 'Нажмите сочетание с Ctrl / Shift / Alt или F-клавишу. Esc — отменить.'; }
  }, { signal });
  box.querySelector('#shortcut-reset').addEventListener('click', () => {
    Object.assign(shortcuts, DEFAULT_SHORTCUTS); capture = null; refresh(); save(); box.querySelector('#shortcut-status').textContent = '';
  }, { signal });
  refresh();
  return {
    restore(values) { Object.assign(shortcuts, DEFAULT_SHORTCUTS, values); capture = null; box.querySelector('#shortcut-status').textContent = ''; refresh(); },
    get capturing() { return !!capture; },
    matches: (action, event) => keyCombo(event) === shortcuts[action],
    handleCapture(event) {
      if (!capture) return false;
      event.preventDefault();
      if (event.key === 'Escape') { capture = null; box.querySelector('#shortcut-status').textContent = ''; return true; }
      const combo = keyCombo(event);
      if (!combo) return true;
      if (shortcutConflict(event)) { box.querySelector('#shortcut-status').textContent = 'Это сочетание занято браузером, вводом текста или поиском. Выберите другое.'; return true; }
      if (event.isComposing || (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && !/^F\d{1,2}$/.test(event.key)) || combo === 'Enter' || Object.entries(shortcuts).some(([key, value]) => key !== capture && value === combo)) {
        box.querySelector('#shortcut-status').textContent = 'Выберите свободное сочетание; Enter оставлен для проверки.'; return true;
      }
      shortcuts[capture] = combo; capture = null; refresh(); save(); box.querySelector('#shortcut-status').textContent = ''; return true;
    },
  };
}
