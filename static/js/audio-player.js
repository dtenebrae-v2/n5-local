import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';
import { AUDIO_KEY, RATES, restoreAudio, nextIndex } from './audio-state.js';
const GROUPS = {all:'Все записи',exams:'Экзамены',workbooks:'Учебные наборы',books:'Книги Tadoku'};
let tracks = [], loading, audio, native, mini, nativeReady = false, started = false, storageError = '', error = '', saving = 0;
let sessionOwned = false, sessionEligible = false;
const MEDIA_ACTIONS = ['play','pause','previoustrack','nexttrack','stop','seekbackward','seekforward','seekto'];
let state = restoreAudio(null, []), playing = false, position = 0, duration = 0, generation = 0;
const listeners = new Set();
const track = () => tracks.find(t => t.id === state.queue[state.index]);
const clock = n => { n = Math.max(0,Math.floor(n || 0)); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };
function read() { try { return JSON.parse(localStorage.getItem(AUDIO_KEY)); } catch { return null; } }
function save() {
  if (track()) state.positions[track().id] = position;
  try { localStorage.setItem(AUDIO_KEY,JSON.stringify(state)); storageError = ''; }
  catch { storageError = 'Позиция не сохраняется: хранилище браузера недоступно.'; }
}
function notify() {
  if (mini) {
    mini.hidden = !track(); document.body.classList.toggle('has-audio-player',!!track());
    mini.querySelector('.audio-mini-title').textContent = track()?.title || '';
    mini.querySelector('[data-audio-command="toggle"]').textContent = playing ? 'Пауза' : 'Слушать';
  }
  for (const listener of listeners) listener();
}
function mediaSession() {
  if (native || !sessionEligible || !navigator.mediaSession || !track()) return;
  if (!sessionOwned) {
    const actions = {play, pause, previoustrack:()=>command('previous'),nexttrack:()=>command('next'),stop:()=>command('stop'),seekbackward:d=>seek(position-(d.seekOffset||15)),seekforward:d=>seek(position+(d.seekOffset||15)),seekto:d=>seek(d.seekTime)};
    for (const [name,fn] of Object.entries(actions)) { try { navigator.mediaSession.setActionHandler(name,fn); } catch {} }
    sessionOwned = true;
  }
  const t = track();
  if (typeof MediaMetadata !== 'undefined') navigator.mediaSession.metadata = new MediaMetadata({title:t.title,artist:'N5 Local',album:t.album});
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  if (Number.isFinite(duration) && duration > 0) {
    try { navigator.mediaSession.setPositionState({duration,playbackRate:state.rate,position:Math.min(position,duration)}); } catch {}
  }
}
function releaseSession() {
  if (!sessionOwned || !navigator.mediaSession) return;
  for (const name of MEDIA_ACTIONS) { try { navigator.mediaSession.setActionHandler(name,null); } catch {} }
  navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; sessionOwned = false;
}
function pauseOthers() { document.querySelectorAll('audio,video').forEach(el => { if (el !== audio) el.pause(); }); }
function nativeCommand(action, extra = {}) {
  try { native.command(JSON.stringify({action,...extra})); }
  catch { error = 'Не удалось связаться с плеером. Повторите попытку.'; notify(); }
}
function syncNative() {
  try {
    const snapshot = JSON.parse(native.getState());
    if (!Array.isArray(snapshot.queue)) return;
    if (!snapshot.queue.length) { if (snapshot.updated) { nativeReady = false; state = restoreAudio(null,tracks); playing = false; position = duration = 0; save(); notify(); } return; }
    const restored = restoreAudio({...snapshot, queue:snapshot.queue.map(t => t.id)},tracks);
    if (!restored.queue.length) return;
    nativeReady = true; state = restored; position = Math.max(0,Number(snapshot.position) || 0);
    duration = Math.max(0,Number(snapshot.duration) || 0); playing = snapshot.playing === true;
    error = snapshot.error || ''; save(); notify();
  } catch { /* A service which has not started has no snapshot yet. */ }
}
async function load() {
  if (!loading) loading = getJSON('/api/audio').then(data => {
    tracks = data.tracks; state = restoreAudio(read(), tracks);
    if (state.queue.length && !native && !audio.isConnected) document.body.append(audio);
    position = state.positions[track()?.id] || 0;
    if (native) syncNative();
    notify(); return tracks;
  }).catch(e => { loading = null; throw e; });
  return loading;
}
function select(index, autoplay = true, reset = false) {
  if (index < 0 || index >= state.queue.length) { playing = false; save(); notify(); return; }
  generation++; state.index = index; error = ''; sessionEligible = true;
  position = reset ? 0 : state.positions[track().id] || 0;
  duration = track().duration || 0; playing = false; save();
  if (native) {
    nativeReady = true;
    nativeCommand('queue',{tracks:state.queue.map(id => tracks.find(t => t.id === id)),index,position,rate:state.rate,repeat:state.repeat,play:autoplay});
  } else {
    if (!audio.isConnected) document.body.append(audio);
    audio.src = track().url; audio.playbackRate = state.rate;
    const version = generation;
    audio.onloadedmetadata = () => {
      if (version !== generation) return;
      duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      audio.currentTime = Math.min(position,Math.max(0,duration - .1));
      notify(); mediaSession();
    };
    // Start inside the user gesture; metadata arrival restores the saved position.
    if (autoplay) play();
  }
  notify(); mediaSession();
}
function play() {
  if (!track()) return;
  error = ''; sessionEligible = true; pauseOthers();
  if (native) { if (nativeReady) nativeCommand('play'); else select(state.index); }
  else {
    if (!audio.getAttribute('src') || audio.error) { select(state.index); return; }
    const version = generation;
    audio.play().catch(() => { if (version === generation) { error = 'Не удалось начать воспроизведение. Нажмите «Слушать», чтобы повторить.'; playing = false; notify(); } });
  }
}
function pause() { if (native) nativeCommand('pause'); else audio?.pause(); playing = false; save(); notify(); mediaSession(); }
function seek(seconds) {
  position = Math.max(0,Math.min(Number.isFinite(duration) && duration > 0 ? duration : Infinity,seconds));
  if (native) nativeCommand('seek',{position}); else if (audio?.readyState) audio.currentTime = position;
  save(); notify(); mediaSession();
}
function advance(delta, ended = false) {
  save(); const index = nextIndex(state,delta);
  if (index < 0) { pause(); return; }
  select(index,true,ended);
}
function command(action) {
  if (action === 'toggle') playing ? pause() : play();
  if (action === 'previous') position > 3 ? seek(0) : advance(-1);
  if (action === 'next') advance(1);
  if (action === 'back') seek(position - 15);
  if (action === 'forward') seek(position + 15);
  if (action === 'stop') {
    pause(); sessionEligible = false; releaseSession(); state.queue = []; position = duration = 0; generation++;
    if (native) { nativeReady = false; nativeCommand('stop'); } else { audio.removeAttribute('src'); audio.load(); audio.remove(); }
    save(); notify();
  }
}
export function initAudio() {
  if (started) return; started = true;
  native = window.N5Audio?.command && window.N5Audio?.getState ? window.N5Audio : null;
  audio = document.createElement('audio'); audio.id = 'continuous-audio'; audio.preload = 'metadata';
  mini = document.createElement('aside'); mini.className = 'audio-mini'; mini.setAttribute('aria-label','Аудиоплеер'); mini.hidden = true;
  mini.innerHTML = `<a href="/jlpt/n5/audio" class="audio-mini-title"></a><button class="secondary" data-audio-command="toggle">Слушать</button><button class="secondary" data-audio-command="next" aria-label="Следующая запись">Дальше</button><button class="secondary" data-audio-command="stop" aria-label="Закрыть плеер">×</button>`;
  mini.addEventListener('click',e => { const b = e.target.closest('[data-audio-command]'); if (b) command(b.dataset.audioCommand); });
  document.body.append(mini);
  if (!native) {
    audio.addEventListener('play',() => { pauseOthers(); playing = true; error = ''; notify(); mediaSession(); });
    audio.addEventListener('pause',() => { playing = false; save(); notify(); mediaSession(); });
    audio.addEventListener('timeupdate',() => { position = audio.currentTime; duration = Number.isFinite(audio.duration) ? audio.duration : 0; if (Date.now() - saving > 2000) { save(); saving = Date.now(); } notify(); mediaSession(); });
    audio.addEventListener('ended',() => { if (track()) state.positions[track().id] = 0; position = 0; advance(1,true); });
    audio.addEventListener('error',() => { if (!audio.getAttribute('src')) return; error = 'Не удалось открыть запись. Проверьте соединение и нажмите «Слушать» для повтора.'; playing = false; notify(); });

  } else {
    setInterval(() => { if (!document.hidden) syncNative(); },1000);
    document.addEventListener('visibilitychange',() => { if (!document.hidden) syncNative(); });
  }
  document.addEventListener('play',e => {
    if (e.target === audio) return;
    sessionEligible = false;
    if (playing || native) pause();
    releaseSession();
  },true);
  window.addEventListener('pagehide',save);
  if (native || read()?.queue?.length) load().catch(() => {});
}
export async function mountAudio(root, signal) {
  initAudio(); root.innerHTML = '<p class="loading">Загружаем записи…</p>';
  await load(); if (signal.aborted) return;
  let group = 'all';
  root.innerHTML = `<div class="audio-screen"><h1>Аудио</h1><p>Полные записи без заданий и таймера. Следующая запись включится автоматически.</p>
    <section class="audio-now" aria-label="Текущая запись"><p class="audio-album"></p><h2 class="audio-current-title">Выберите запись</h2><p class="audio-note"></p>
    <div class="audio-transport"><button class="secondary" data-audio-command="previous">Предыдущая</button><button class="primary" data-audio-command="toggle">Слушать</button><button class="secondary" data-audio-command="next">Следующая</button></div>
    <div class="audio-seek"><button class="secondary" data-audio-command="back" aria-label="Назад на 15 секунд">−15 с</button><label>Позиция<input class="audio-position" type="range" min="0" max="0" step="1" value="0"></label><button class="secondary" data-audio-command="forward" aria-label="Вперёд на 15 секунд">+15 с</button></div><p class="audio-time"></p>
    <div class="audio-options"><label>Скорость <select class="audio-rate">${RATES.map(n=>`<option value="${n}">${n}×</option>`).join('')}</select></label><label><input class="audio-repeat" type="checkbox"> Повторять очередь</label></div><p class="audio-error" role="status"></p></section>
    <section class="audio-catalog"><h2>Записи</h2><div class="library-filters" role="group" aria-label="Источник записей">${Object.entries(GROUPS).map(([id,label])=>`<button class="chip" data-audio-group="${id}" aria-pressed="${id === group}">${label}</button>`).join('')}</div><div class="audio-list-heading"><p class="audio-list-count"></p><button class="primary" id="audio-play-all">Слушать подряд</button></div><ol class="audio-track-list"></ol></section></div>`;
  const visible = () => tracks.filter(t => group === 'all' || t.group === group);
  function paintList() {
    const list = visible();
    root.querySelector('.audio-list-count').textContent = `Записей: ${list.length}`;
    root.querySelector('#audio-play-all').disabled = !list.length;
    root.querySelector('.audio-track-list').innerHTML = list.map(t=>`<li data-track="${esc(t.id)}"><div><small>${esc(t.album)}</small><p>${esc(t.title)}</p>${t.note ? `<small>${esc(t.note)}</small>` : ''}</div><button class="secondary" data-listen="${esc(t.id)}" aria-label="Слушать: ${esc(t.title)}">Слушать</button></li>`).join('') || '<li>В этом разделе пока нет доступных записей.</li>';
    update();
  }
  function update() {
    const t = track();
    root.querySelector('.audio-now').hidden = !t;
    root.querySelector('.audio-album').textContent = t ? `${t.album} · ${state.index+1} из ${state.queue.length}` : '';
    root.querySelector('.audio-current-title').textContent = t?.title || 'Выберите запись';
    root.querySelector('.audio-note').textContent = t?.note || '';
    root.querySelector('.audio-time').textContent = t ? `${clock(position)} / ${duration ? clock(duration) : '—'}` : '';
    root.querySelector('.audio-error').textContent = error || storageError;
    const range = root.querySelector('.audio-position'); range.disabled = !t || !duration; range.max = duration || 0;
    if (document.activeElement !== range) range.value = position;
    range.setAttribute('aria-valuetext',`${clock(position)} из ${clock(duration)}`);
    root.querySelector('.audio-rate').value = state.rate;
    root.querySelector('.audio-repeat').checked = state.repeat;
    root.querySelectorAll('[data-audio-command]').forEach(b => { b.disabled = !t; if (b.dataset.audioCommand === 'toggle') b.textContent = playing ? 'Пауза' : 'Слушать'; });
    root.querySelectorAll('[data-track]').forEach(row => {
      if (row.dataset.track === t?.id) row.setAttribute('aria-current','true'); else row.removeAttribute('aria-current');
    });
  }
  function startQueue(id) { save(); state.queue = visible().map(t=>t.id); select(Math.max(0,state.queue.indexOf(id))); }
  root.addEventListener('click',e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.audioGroup) { group = b.dataset.audioGroup; root.querySelectorAll('[data-audio-group]').forEach(el=>el.setAttribute('aria-pressed',String(el === b))); paintList(); }
    if (b.dataset.listen) startQueue(b.dataset.listen);
    if (b.id === 'audio-play-all') startQueue(visible()[0]?.id);
    if (b.dataset.audioCommand) command(b.dataset.audioCommand);
  },{signal});
  root.addEventListener('change',e => {
    if (e.target.matches('.audio-position')) seek(Number(e.target.value));
    if (e.target.matches('.audio-rate')) { state.rate = Number(e.target.value); if (native) nativeCommand('rate',{rate:state.rate}); else audio.playbackRate = state.rate; save(); mediaSession(); }
    if (e.target.matches('.audio-repeat')) { state.repeat = e.target.checked; if (native) nativeCommand('repeat',{repeat:state.repeat}); save(); }
  },{signal});
  listeners.add(update); signal.addEventListener('abort',()=>listeners.delete(update),{once:true});
  paintList();
}
