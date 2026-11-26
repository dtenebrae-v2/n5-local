// Keep the beginning of a result in the usable viewport, including mobile keyboards.
export function revealFeedback(element) {
  if (!element || !element.textContent.trim()) return;
  requestAnimationFrame(() => {
    if (!element.isConnected) return;
    const viewport = window.visualViewport;
    const top = (viewport?.offsetTop || 0) + 16;
    let bottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight) - 16;
    const mini = document.querySelector('.audio-mini');
    if (mini && !mini.hidden && getComputedStyle(mini).display !== 'none') bottom = Math.min(bottom,mini.getBoundingClientRect().top - 12);
    const dialog = element.closest('dialog');
    if (dialog) bottom = Math.min(bottom,dialog.getBoundingClientRect().bottom - 16);
    const rect = element.getBoundingClientRect();
    if (rect.top < top || rect.top + Math.min(rect.height,160) > bottom) element.scrollIntoView({block:'start',behavior:'instant'});
  });
}

export function ruleExample(text, escape) {
  const parts = text.split(/\s+—\s+/);
  return `<div class="lesson-example"><span class="material-label">Пример</span><p lang="ja">${escape(parts.shift())}</p>${parts.length ? `<p class="example-translation">${escape(parts.join(' — '))}</p>` : ''}</div>`;
}

export function prepareStudyPage(root, signal) {
  const filters = root.querySelector('.phrase-filters');
  if (filters) {
    const panel = document.createElement('details'); panel.className = 'study-options'; panel.open = matchMedia('(min-width: 900px)').matches;
    panel.innerHTML = '<summary>Поиск и фильтры</summary>';
    filters.before(panel); panel.append(filters);
  }
  const intro = root.querySelector('.page-heading + p');
  const sources = root.querySelector('.phrase-sources');
  if (intro && sources) sources.append(intro);
  signal.addEventListener('abort',()=>root.classList.remove('study-session-active'),{once:true});
}
export function studySession(root, active) { root.classList.toggle('study-session-active',active); }

export function bindInlineAudio(audio, container, signal, {start=0,end=Infinity}={}) {
  const seek = container.querySelector('[data-inline-seek]');
  const time = container.querySelector('[data-inline-time]');
  if (!seek || !time) return;
  const clock = seconds => { const n=Math.max(0,Math.floor(seconds||0)); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };
  const update = () => {
    const limit = Math.min(end, Number.isFinite(audio.duration) ? audio.duration : start);
    seek.min = start; seek.max = Math.max(start,limit); seek.disabled = limit <= start;
    if (document.activeElement !== seek) seek.value = Math.max(start,audio.currentTime);
    time.textContent = `${clock(audio.currentTime-start)} / ${clock(limit-start)}`;
    const toggle=container.querySelector('[data-audio="toggle"]');
    if (toggle) toggle.textContent = audio.paused ? 'Слушать' : 'Пауза';
  };
  seek.addEventListener('input',()=>{ audio.currentTime=Math.max(start,Math.min(Number(seek.max),Number(seek.value))); update(); },{signal});
  for (const event of ['loadedmetadata','timeupdate','play','pause','ended']) audio.addEventListener(event,update,{signal});
  container.classList.add('custom-inline-audio'); update();
}
export function inlineTimeline() {
  return '<label class="inline-audio-seek">Позиция записи<input type="range" data-inline-seek min="0" max="0" step=".1" value="0" disabled></label><span data-inline-time class="inline-audio-time"></span>';
}
