export const clampScale = scale => Math.max(.1, Math.min(4, scale));

// Keep the PDF point beneath the fingers fixed while PDF.js updates page geometry.
export function zoomAround(viewer, stage, scale, origin = null, drawingDelay = 0) {
  const bounds = stage.getBoundingClientRect();
  const [x, y] = origin || [bounds.left + stage.clientWidth / 2, bounds.top + stage.clientHeight / 2];
  const pages = [...stage.querySelectorAll('.page')];
  const element = pages.find(page => {
    const rect = page.getBoundingClientRect();
    return y >= rect.top && y <= rect.bottom;
  }) || pages.find(page => Number(page.dataset.pageNumber) === viewer.currentPageNumber);
  const view = element && viewer.getPageView(Number(element.dataset.pageNumber) - 1);
  const rect = element?.getBoundingClientRect();
  const point = view && view.getPagePoint(x - rect.left, y - rect.top);
  viewer.updateScale({ scaleFactor: clampScale(scale) / viewer.currentScale, drawingDelay });
  if (point && view.viewport) {
    const [left, top] = view.viewport.convertToViewportPoint(...point);
    const moved = element.getBoundingClientRect();
    stage.scrollLeft += moved.left + left - x;
    stage.scrollTop += moved.top + top - y;
  }
}

export function bindBookGestures(stage, viewer, onZoom, signal) {
  let pinch = null, frame = 0, pending = null;
  const distance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const center = touches => [(touches[0].clientX + touches[1].clientX) / 2, (touches[0].clientY + touches[1].clientY) / 2];
  const flush = () => {
    frame = 0;
    if (!pending || signal.aborted) return;
    zoomAround(viewer, stage, pending.scale, pending.origin, 250);
    pending = null;
    onZoom();
  };
  stage.addEventListener('touchstart', event => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    pinch = { distance: distance(event.touches), scale: viewer.currentScale };
  }, { signal, passive: false });
  stage.addEventListener('touchmove', event => {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    pending = { scale: pinch.scale * distance(event.touches) / Math.max(1, pinch.distance), origin: center(event.touches) };
    if (!frame) frame = requestAnimationFrame(flush);
  }, { signal, passive: false });
  const end = event => {
    if (pinch) {
      if (pending) { cancelAnimationFrame(frame); flush(); }
      if (event.touches.length < 2) pinch = null;
    }
  };
  stage.addEventListener('touchend', end, { signal });
  stage.addEventListener('touchcancel', end, { signal });
  // Double-tap zoom is optional convenience; all actions also have visible buttons.
  stage.addEventListener('dblclick', event => {
    if (!viewer.pdfDocument) return;
    event.preventDefault();
    zoomAround(viewer, stage, viewer.currentScale < 1.5 ? 1.5 : .75, [event.clientX, event.clientY]);
    onZoom();
  }, { signal });
  stage.addEventListener('wheel', event => {
    if (!(event.ctrlKey || event.metaKey) || !viewer.pdfDocument) return;
    event.preventDefault();
    zoomAround(viewer, stage, viewer.currentScale * Math.exp(-event.deltaY * .005), [event.clientX, event.clientY], 100);
    onZoom();
  }, { signal, passive: false });
  signal.addEventListener('abort', () => cancelAnimationFrame(frame), { once: true });
}
