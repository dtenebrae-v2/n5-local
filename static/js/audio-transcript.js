import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';

const clock = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2,'0')}`;

export function mountAudioTranscript(root, signal, seek) {
  let current = null, loaded = null, request = null;
  const details = root.querySelector('.audio-transcript');
  const content = details.querySelector('.audio-transcript-content');
  async function load() {
    if (!details.open || !current?.transcript?.available || loaded === current.id) return;
    request?.abort(); request = new AbortController();
    const id = current.id, controller = request;
    content.innerHTML = '<p role="status">Загружаем расшифровку…</p>';
    try {
      const value = await getJSON(current.transcript.url, controller.signal);
      if (signal.aborted || controller.signal.aborted || current?.id !== id) return;
      loaded = id;
      content.innerHTML = `${value.status === 'automatic' ? '<p class="audio-transcript-note">Автоматическая расшифровка: возможны ошибки распознавания.</p>' : '<p class="audio-transcript-note">Проверенная расшифровка.</p>'}
        <ol class="audio-script-lines">${value.segments.map(s => `<li><button class="secondary" data-transcript-at="${s.start}" aria-label="Перейти к ${clock(s.start)}">${clock(s.start)}</button><p lang="ja">${esc(s.text)}</p></li>`).join('')}</ol>`;
    } catch (error) {
      if (!signal.aborted && !controller.signal.aborted && current?.id === id) content.innerHTML = '<p role="status">Не удалось загрузить расшифровку.</p><button class="secondary" data-transcript-retry>Повторить</button>';
    }
  }
  details.addEventListener('toggle', load, {signal});
  content.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button?.hasAttribute('data-transcript-at')) seek(Number(button.dataset.transcriptAt));
    if (button?.hasAttribute('data-transcript-retry')) load();
  }, {signal});
  signal.addEventListener('abort', () => request?.abort(), {once:true});
  return track => {
    if (track?.id === current?.id) return;
    current = track; loaded = null; request?.abort(); content.innerHTML = '';
    details.hidden = !track?.transcript?.available;
    if (details.hidden) details.open = false;
    else load();
  };
}
