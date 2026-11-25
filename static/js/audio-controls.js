const paths = {
  play:'<path d="m8 5 11 7-11 7Z"/>',
  pause:'<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>',
  stop:'<path d="M5 5h14v14H5z"/>',
  previous:'<path d="M4 5h3v14H4zm15 0L8 12l11 7Z"/>',
  next:'<path d="M17 5h3v14h-3zM5 5l11 7-11 7Z"/>',
};
const labels = {play:'Слушать',pause:'Пауза',stop:'Остановить',previous:'Предыдущая запись',next:'Следующая запись'};
export function audioIcon(name) {
  return `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="currentColor">${paths[name]}</svg>`;
}
export function setAudioIcon(button, name) {
  if (button.dataset.audioIcon === name) return;
  button.dataset.audioIcon = name;
  button.innerHTML = audioIcon(name);
  button.setAttribute('aria-label',labels[name]);
  button.title = labels[name];
}
export function audioButton(action, icon = action, primary = false) {
  return `<button class="${primary ? 'primary' : 'secondary'} audio-icon-button" data-audio-command="${action}" data-audio-icon="${icon}" aria-label="${labels[icon]}" title="${labels[icon]}">${audioIcon(icon)}</button>`;
}
