export async function getJSON(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// Each page owns its requests; a newer search also cancels the previous one.
export function latestRequest(parentSignal) {
  let controller;
  const cancel = () => controller?.abort();
  parentSignal.addEventListener('abort', cancel, { once: true });
  const get = async (url) => {
    cancel();
    controller = new AbortController();
    const current = controller;
    if (parentSignal.aborted) current.abort();
    const data = await getJSON(url, current.signal);
    // A completed fetch can still become obsolete while its body is decoded.
    if (current.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return data;
  };
  return { get, cancel };
}
