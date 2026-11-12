import { escapeHTML as esc } from './ui.js';
import { saveReading, readingState } from './library-progress.js';
import { bindBookGestures, clampScale, zoomAround } from './book-gestures.js';
import { bindReaderChrome } from './book-chrome.js';

const clock = seconds => {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

export async function mountBookReader(root, book, progress, signal, credits) {
  if (!book) { root.innerHTML = '<h1>Книга не найдена</h1><a href="/jlpt/n5/library">← Библиотека</a>'; return; }
  document.title = `${book.title} · N5`;
  const state = readingState(progress, book.id), pdf = book.assets.pdf, audio = book.assets.audio;
  root.innerHTML = `<section class="book-shell book-viewer" aria-label="Чтение книги">
    <div class="book-chrome"><header class="book-header"><a class="library-back" href="/jlpt/n5/library" aria-label="Вернуться в библиотеку">←</a>
      <h1 lang="ja">${esc(book.title)}</h1><button class="secondary" id="book-info-open">О книге</button></header>
    <div class="book-controls" aria-label="Управление чтением">
      <div class="book-page-controls"><button class="secondary" id="book-thumbnails-open" aria-label="Миниатюры страниц">Страницы</button>
      <button class="secondary" id="book-prev" aria-label="Предыдущая страница">←</button>
      <label class="book-page-label"><span class="sr-only">Страница PDF</span><input id="book-page" type="number" min="1" value="${state.page}" inputmode="numeric" aria-label="Страница PDF"></label>
      <span id="book-total" aria-label="Количество страниц PDF"></span><button class="secondary" id="book-next" aria-label="Следующая страница">→</button></div>
      <div class="book-zoom-controls"><button class="secondary" id="book-zoom-out" aria-label="Уменьшить">−</button>
      <output id="book-scale" aria-label="Масштаб">—</output><button class="secondary" id="book-zoom-in" aria-label="Увеличить">+</button>
      <label><span class="sr-only">Режим масштаба</span><select id="book-fit" aria-label="Режим масштаба"><option value="page-width">По ширине</option><option value="page-fit">Страница целиком</option><option value="custom" hidden>Свой масштаб</option></select></label>
      <button class="secondary" id="book-fullscreen" aria-label="Полноэкранное чтение">⛶</button><button class="secondary" id="book-hide-controls" aria-label="Скрыть панели чтения" title="Скрыть панели чтения">⌃</button></div>
    </div></div>
    <button class="secondary book-show-controls" id="book-show-controls" aria-label="Показать панели чтения" hidden>Панели</button>
    <p id="book-loading" role="status">Загружаем PDF…</p><p id="book-error" role="alert"></p><p id="reading-storage" role="status"></p>
    <div class="book-viewport"><div id="book-stage" class="book-stage" tabindex="0" role="region" aria-label="Страницы книги: прокрутка, увеличение двумя пальцами" aria-busy="true"><div class="pdfViewer" lang="ja"></div></div></div>
    ${audio?.available ? `<footer class="book-audio" aria-label="Аудиокнига"><audio id="book-audio" preload="metadata" src="${esc(audio.local_url)}"></audio>
      <div class="book-audio-buttons"><button class="secondary" id="book-audio-play" aria-label="Воспроизвести аудио" disabled>▶</button>
      <button class="secondary" id="book-audio-back" aria-label="Назад на 10 секунд" disabled>−10 с</button><button class="secondary" id="book-audio-forward" aria-label="Вперёд на 10 секунд" disabled>+10 с</button>
      <label><span class="sr-only">Скорость аудио</span><select id="book-rate" aria-label="Скорость аудио">${[.75,1,1.25,1.5].map(rate => `<option value="${rate}" ${rate === state.rate ? 'selected' : ''}>${rate}×</option>`).join('')}</select></label>
      <span id="book-audio-time" aria-label="Время аудио">0:00</span></div>
      <input id="book-audio-seek" type="range" min="0" max="0" step=".1" value="0" aria-label="Позиция аудио" disabled><p id="book-audio-error" role="status"></p></footer>` : ''}
    <dialog id="book-info" class="practice-dialog book-info-dialog" aria-labelledby="book-info-title"><div class="practice-header"><h2 id="book-info-title">О книге</h2><button class="practice-close" aria-label="Закрыть сведения">×</button></div>
      <h3 lang="ja">${esc(book.title)}</h3><p>Уровень ${book.level}<span id="book-info-pages"></span></p>${credits}
      <p>Нумерация в просмотрщике включает обложку и служебные страницы PDF.</p>
      ${pdf.available ? `<div class="library-filters"><a class="secondary" href="${esc(pdf.local_url)}?download=1">Скачать оригинальный PDF</a>${book.assets.print?.available ? `<a class="secondary" href="${esc(book.assets.print.local_url)}?download=1">PDF для печати</a>` : ''}</div>` : ''}
      ${!audio?.available && (audio || book.audio_source) ? `<p><a href="${esc(audio?.evidence || book.audio_source)}" target="_blank" rel="noreferrer">Аудио на Tadoku ↗</a></p>` : ''}
      <button class="secondary" id="book-completed" aria-pressed="${state.completed}">${state.completed ? 'Прочитано ✓' : 'Отметить прочитанным'}</button></dialog>
    <dialog id="book-thumbnails" class="practice-dialog book-thumbnails-dialog" aria-labelledby="book-thumbnails-title"><div class="practice-header"><h2 id="book-thumbnails-title">Страницы PDF</h2><button class="practice-close" aria-label="Закрыть миниатюры">×</button></div><div class="book-thumbnail-grid"></div></dialog>
    </section>`;
  const shell = root.querySelector('.book-shell'), stage = root.querySelector('#book-stage');
  const pageInput = root.querySelector('#book-page'), fit = root.querySelector('#book-fit');
  const player = root.querySelector('#book-audio'), info = root.querySelector('#book-info'), thumbnails = root.querySelector('#book-thumbnails');
  let loadingTask, documentPDF, viewer, bus, resize, ready = false, restoring = true, audioReady = false;
  let saveTimer, resizeFrame, lastAudioSave = 0, thumbnailObserver, thumbnailTask, thumbnailGeneration = 0;
  const initial = { ...state, position: state.position && { ...state.position } };
  const $ = selector => root.querySelector(selector);
  function save() {
    clearTimeout(saveTimer);
    if (player && audioReady && Number.isFinite(player.currentTime)) state.audioTime = player.currentTime;
    state.updated = Date.now(); progress.books[book.id] = { ...state };
    $('#reading-storage').textContent = saveReading(progress) ? '' : 'Не удалось сохранить место чтения.';
  }
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 200); };
  function updateControls() {
    if (document.activeElement !== pageInput) pageInput.value = state.page;
    $('#book-prev').disabled = !ready || state.page <= 1;
    $('#book-next').disabled = !ready || state.page >= documentPDF.numPages;
    $('#book-thumbnails-open').disabled = !ready;
    $('#book-zoom-out').disabled = !ready || viewer.currentScale <= .1;
    $('#book-zoom-in').disabled = !ready || viewer.currentScale >= 4;
    fit.disabled = !ready;
    if (ready) {
      $('#book-scale').textContent = `${Math.round(viewer.currentScale * 100)}%`;
      fit.value = state.fit || 'custom';
    }
  }
  function capturePosition() {
    if (!ready || restoring) return;
    viewer.update();
  }
  function restore(position, page) {
    if (position) viewer.scrollPageIntoView({ pageNumber: Math.min(documentPDF.numPages, position.page),
      destArray: [null, { name: 'XYZ' }, position.left, position.top, null], allowNegativeOffset: true });
    else viewer.currentPageNumber = Math.min(documentPDF.numPages, page);
  }
  function move(value) {
    if (!ready) return;
    const page = Number(value);
    if (!Number.isInteger(page)) { pageInput.value = state.page; return; }
    viewer.currentPageNumber = Math.max(1, Math.min(documentPDF.numPages, page));
    state.page = viewer.currentPageNumber;
    pageInput.value = state.page; capturePosition(); updateControls(); save();
  }
  const manualZoom = () => { state.fit = null; state.scale = viewer.currentScale; capturePosition(); updateControls(); scheduleSave(); };
  pageInput.addEventListener('change', () => move(pageInput.value), { signal });
  pageInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); move(pageInput.value); stage.focus(); } }, { signal });
  $('#book-prev').addEventListener('click', () => move(state.page - 1), { signal });
  $('#book-next').addEventListener('click', () => move(state.page + 1), { signal });
  for (const [id, factor] of [['book-zoom-out', 1 / 1.25], ['book-zoom-in', 1.25]]) {
    $('#' + id).addEventListener('click', () => { if (ready) { zoomAround(viewer, stage, viewer.currentScale * factor); manualZoom(); } }, { signal });
  }
  fit.addEventListener('change', () => {
    if (!ready || fit.value === 'custom') return;
    state.fit = fit.value; viewer.currentScaleValue = state.fit;
    state.scale = viewer.currentScale; capturePosition(); updateControls(); save();
  }, { signal });
  for (const [dialog, opener] of [[info, '#book-info-open'], [thumbnails, '#book-thumbnails-open']]) {
    $(opener).addEventListener('click', () => dialog.showModal(), { signal });
    dialog.querySelector('.practice-close').addEventListener('click', () => dialog.close(), { signal });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }, { signal });
  }
  $('#book-completed').addEventListener('click', event => {
    state.completed = !state.completed;
    event.target.textContent = state.completed ? 'Прочитано ✓' : 'Отметить прочитанным';
    event.target.setAttribute('aria-pressed', String(state.completed)); save();
  }, { signal });
  const fullscreen = $('#book-fullscreen');
  fullscreen.hidden = !shell.requestFullscreen;
  fullscreen.addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await shell.requestFullscreen(); }
    catch { $('#book-error').textContent = 'Полноэкранный режим недоступен.'; }
  }, { signal });
  function audioUI() {
    const time = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    const duration = Number.isFinite(player.duration) ? player.duration : 0;
    $('#book-audio-time').textContent = `${clock(time)} / ${clock(duration)}`;
    $('#book-audio-seek').max = duration;
    $('#book-audio-seek').value = Math.min(time, duration);
    $('#book-audio-seek').setAttribute('aria-valuetext', `${clock(time)} из ${clock(duration)}`);
    $('#book-audio-play').textContent = player.paused ? '▶' : 'Ⅱ';
    $('#book-audio-play').setAttribute('aria-label', player.paused ? 'Воспроизвести аудио' : 'Приостановить аудио');
  }
  if (player) {
    player.playbackRate = state.rate;
    player.addEventListener('loadedmetadata', () => {
      const end = Number.isFinite(player.duration) ? Math.max(0, player.duration - .1) : state.audioTime;
      player.currentTime = Math.min(state.audioTime, end); audioReady = true;
      shell.querySelectorAll('.book-audio button,.book-audio input').forEach(control => { control.disabled = false; }); audioUI();
    }, { signal });
    $('#book-audio-play').addEventListener('click', async () => {
      try { if (player.paused) await player.play(); else player.pause(); $('#book-audio-error').textContent = ''; }
      catch { $('#book-audio-error').textContent = 'Не удалось начать воспроизведение. Попробуйте ещё раз.'; }
    }, { signal });
    for (const [id, offset] of [['book-audio-back', -10], ['book-audio-forward', 10]]) $('#' + id).addEventListener('click', () => {
      player.currentTime = Math.max(0, Math.min(Number.isFinite(player.duration) ? player.duration : Infinity, player.currentTime + offset)); audioUI(); save();
    }, { signal });
    $('#book-audio-seek').addEventListener('input', event => { player.currentTime = Number(event.target.value); audioUI(); save(); }, { signal });
    $('#book-rate').addEventListener('change', event => { state.rate = Number(event.target.value); player.playbackRate = state.rate; save(); }, { signal });
    player.addEventListener('timeupdate', () => { audioUI(); if (Date.now() - lastAudioSave > 1000) { save(); lastAudioSave = Date.now(); } }, { signal });
    for (const name of ['play','pause','seeked','ended']) player.addEventListener(name, () => { audioUI(); save(); }, { signal });
    player.addEventListener('error', () => { $('#book-audio-error').textContent = 'Не удалось открыть запись. Источник указан в разделе «О книге».'; }, { signal });
  }
  document.addEventListener('keydown', event => {
    if (!ready || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || event.target.closest('input,select,audio,textarea,[contenteditable]') || document.querySelector('dialog[open]')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(state.page + (event.key === 'ArrowRight' ? 1 : -1)); }
  }, { signal });
  window.addEventListener('pagehide', () => { capturePosition(); save(); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { capturePosition(); save(); } }, { signal });
  signal.addEventListener('abort', () => {
    capturePosition(); save(); clearTimeout(saveTimer); cancelAnimationFrame(resizeFrame);
    resize?.disconnect(); thumbnailObserver?.disconnect(); thumbnailGeneration++; thumbnailTask?.cancel();
    info.close(); thumbnails.close();
    if (player) { player.pause(); player.removeAttribute('src'); player.load(); }
    viewer?.setDocument(null);
    if (loadingTask) void loadingTask.destroy().catch(() => {});
  }, { once: true });
  if (!pdf.available) { $('#book-loading').textContent = ''; $('#book-error').textContent = 'Локальная копия пока не загружена.'; updateControls(); return; }
  updateControls();
  try {
    const pdfjs = await import('../vendor/pdfjs-5.6.205/pdf.min.mjs');
    const { PDFViewer, EventBus } = await import('../vendor/pdfjs-5.6.205/web/pdf_viewer.mjs');
    if (signal.aborted) return;
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs-5.6.205/pdf.worker.min.mjs';
    bus = new EventBus();
    viewer = new PDFViewer({ container: stage, viewer: stage.firstElementChild, eventBus: bus,
      textLayerMode: 0, annotationMode: 0, annotationEditorMode: -1, removePageBorders: true,
      enableAutoLinking: false, maxCanvasPixels: 4194304, imageResourcesPath: '/vendor/pdfjs-5.6.205/web/images/', abortSignal: signal });
    bus.on('updateviewarea', ({ location }) => {
      if (restoring || signal.aborted) return;
      state.position = { page: location.pageNumber, left: location.left, top: location.top };
      state.page = location.pageNumber; state.scale = viewer.currentScale;
      updateControls(); scheduleSave();
    });
    bus.on('pagerendered', ({ error }) => {
      if (signal.aborted) return;
      if (error) { $('#book-error').textContent = 'Не удалось показать страницу. Попробуйте открыть её ещё раз.'; return; }
      stage.setAttribute('aria-busy', 'false'); $('#book-loading').textContent = '';
    });
    const initialized = new Promise(resolve => bus.on('pagesinit', resolve, { once: true }));
    loadingTask = pdfjs.getDocument({ url: pdf.local_url, cMapUrl: '/vendor/pdfjs-5.6.205/cmaps/', cMapPacked: true,
      standardFontDataUrl: '/vendor/pdfjs-5.6.205/standard_fonts/', isEvalSupported: false, disableFontFace: true, useWasm: false,
      disableAutoFetch: true, disableStream: true });
    documentPDF = await loadingTask.promise;
    if (signal.aborted) return;
    state.totalPages = documentPDF.numPages; state.page = Math.min(state.page, state.totalPages);
    pageInput.max = state.totalPages; $('#book-total').textContent = `/ ${state.totalPages}`;
    $('#book-info-pages').textContent = ` · ${state.totalPages} страниц PDF`;
    viewer.setDocument(documentPDF); await initialized;
    if (signal.aborted) return;
    viewer.currentScaleValue = state.fit || 'page-width';
    if (initial.scale && !initial.fit) viewer.currentScale = clampScale(initial.scale);
    else if (!initial.scale && initial.zoom !== 1) { viewer.currentScale = clampScale(viewer.currentScale * initial.zoom); state.fit = null; }
    ready = true;
    restore(initial.position, state.page);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (signal.aborted) return;
    restoring = false; capturePosition(); updateControls(); save();
    if (matchMedia('(pointer: fine)').matches && !document.activeElement.closest('input,select,button,dialog')) {
      stage.focus({ preventScroll: true });
    }
    bindBookGestures(stage, viewer, manualZoom, signal);
    bindReaderChrome(shell, stage, signal);
    let width = stage.clientWidth, height = stage.clientHeight;
    resize = new ResizeObserver(() => {
      if (!ready || restoring || (width === stage.clientWidth && height === stage.clientHeight)) return;
      width = stage.clientWidth; height = stage.clientHeight;
      const anchor = state.position && { ...state.position };
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (signal.aborted) return;
        if (state.fit) viewer.currentScaleValue = state.fit;
        restore(anchor, state.page); capturePosition(); updateControls(); scheduleSave();
      });
    });
    resize.observe(stage);
    function clearThumbnails() {
      thumbnailGeneration++; thumbnailObserver?.disconnect(); thumbnailTask?.cancel();
      thumbnails.querySelector('.book-thumbnail-grid').replaceChildren();
    }
    $('#book-thumbnails-open').addEventListener('click', () => {
      clearThumbnails();
      const grid = thumbnails.querySelector('.book-thumbnail-grid'), queue = [];
      const generation = thumbnailGeneration;
      let drawing = false;
      async function draw() {
        if (drawing) return;
        drawing = true;
        while (queue.length && generation === thumbnailGeneration && !signal.aborted) {
          const button = queue.shift();
          try {
            const page = await documentPDF.getPage(Number(button.dataset.page));
            if (generation !== thumbnailGeneration || signal.aborted) break;
            const base = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: 110 / base.width });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width * 1.5); canvas.height = Math.ceil(viewport.height * 1.5);
            canvas.setAttribute('aria-hidden', 'true');
            thumbnailTask = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [1.5,0,0,1.5,0,0] });
            await thumbnailTask.promise;
            if (generation === thumbnailGeneration && !signal.aborted) button.querySelector('.book-thumbnail-image').replaceChildren(canvas);
          } catch (error) { if (error.name !== 'RenderingCancelledException') button.querySelector('.book-thumbnail-image').textContent = 'Нет миниатюры'; }
        }
        drawing = false;
      }
      thumbnailObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) { thumbnailObserver.unobserve(entry.target); queue.push(entry.target); }
        void draw();
      }, { root: grid, rootMargin: '120px' });
      for (let page = 1; page <= documentPDF.numPages; page++) {
        const button = document.createElement('button'); button.className = 'book-thumbnail'; button.dataset.page = page;
        button.setAttribute('aria-label', `Страница PDF ${page}`);
        if (page === state.page) button.setAttribute('aria-current', 'page');
        button.innerHTML = `<span class="book-thumbnail-image"></span><span>${page}</span>`;
        button.addEventListener('click', () => { move(page); thumbnails.close(); stage.focus({ preventScroll: true }); }, { signal });
        grid.append(button); thumbnailObserver.observe(button);
      }
      grid.querySelector('[aria-current]')?.scrollIntoView({ block: 'center' });
    }, { signal });
    thumbnails.addEventListener('close', clearThumbnails, { signal });
  } catch (error) {
    if (!signal.aborted) {
      $('#book-loading').textContent = ''; stage.setAttribute('aria-busy', 'false');
      $('#book-error').innerHTML = `Не удалось открыть PDF. <a href="${esc(pdf.local_url)}?download=1">Скачать оригинал</a>`;
    }
  }
}
