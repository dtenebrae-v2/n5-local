export const AUDIO_KEY = 'n5.audio.v1';
export const RATES = [.75, 1, 1.25, 1.5];
export function uniqueAudioTracks(tracks, preferredId) {
  const preferred = tracks.find(t => t.id === preferredId);
  const seen = new Set();
  return tracks.flatMap(track => {
    const family = track.family || track.id;
    if (seen.has(family)) return [];
    seen.add(family);
    return [preferred && family === (preferred.family || preferred.id) ? preferred : track];
  });
}
export function restoreAudio(value, tracks) {
  const known = new Set(tracks.map(t => t.id));
  const queue = Array.isArray(value?.queue) ? [...new Set(value.queue.filter(id => known.has(id)))] : [];
  const current = value?.queue?.[value?.index];
  const positions = Object.fromEntries(Object.entries(value?.positions || {}).filter(([id,n]) => known.has(id) && Number.isFinite(n) && n >= 0));
  return {queue, index: Math.max(0,queue.indexOf(current)), positions, rate: RATES.includes(value?.rate) ? value.rate : 1, repeat: value?.repeat === true};
}
export function nextIndex(state, delta = 1) {
  const index = state.index + delta;
  if (index >= 0 && index < state.queue.length) return index;
  return state.repeat && state.queue.length ? (index + state.queue.length) % state.queue.length : -1;
}
