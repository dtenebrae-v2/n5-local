export const DEFAULT_SHORTCUTS = { next: 'Shift+Enter', rules: 'F1', unknown: 'F2' };
const labels = { next: 'Следующее задание', rules: 'Справка', unknown: 'Не знаю' };
export function keyCombo(event) {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null;
  return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta', event.key.length === 1 ? event.key.toUpperCase() : event.key].filter(Boolean).join('+');
}
export function mountShortcuts(root, progress, save, signal, onChange) {
  const shortcuts = { ...DEFAULT_SHORTCUTS, ...progress.shortcuts };
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
    get capturing() { return !!capture; },
    matches: (action, event) => keyCombo(event) === shortcuts[action],
    handleCapture(event) {
      if (!capture) return false;
      event.preventDefault();
      if (event.key === 'Escape') { capture = null; box.querySelector('#shortcut-status').textContent = ''; return true; }
      const combo = keyCombo(event);
      if (!combo) return true;
      if (event.isComposing || (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && !/^F\d{1,2}$/.test(event.key)) || combo === 'Enter' || Object.entries(shortcuts).some(([key, value]) => key !== capture && value === combo)) {
        box.querySelector('#shortcut-status').textContent = 'Выберите свободное сочетание; Enter оставлен для проверки.'; return true;
      }
      shortcuts[capture] = combo; capture = null; refresh(); save(); box.querySelector('#shortcut-status').textContent = ''; return true;
    },
  };
}
