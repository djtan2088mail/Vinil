// Local persistence. In production the play counter and premium flag must
// live on a server (localStorage is trivially editable) — see README.

const KEY = 'vinil:v1';
export const FREE_DAILY_LIMIT = 10;

const today = () => new Date().toISOString().slice(0, 10);

const defaults = () => ({
  skin: 'noir',
  premium: false,
  plays: { date: today(), count: 0 },
  settings: { crackle: 0.5, fx: true, volume: 0.9 },
  playlists: [{ id: 'fav', name: 'Любимое', tracks: [] }],
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) return { ...defaults(), ...raw, settings: { ...defaults().settings, ...raw.settings } };
  } catch {}
  return defaults();
}

export const state = load();

export function save() {
  try {
    // object URLs of local files don't survive a reload — don't persist them
    const clean = { ...state, playlists: state.playlists.map((p) => ({ ...p, tracks: p.tracks.filter((t) => !t.ephemeral) })) };
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {}
}

export function playsLeft() {
  if (state.premium) return Infinity;
  if (state.plays.date !== today()) state.plays = { date: today(), count: 0 };
  return Math.max(0, FREE_DAILY_LIMIT - state.plays.count);
}

export function countPlay() {
  if (state.premium) return;
  playsLeft();
  state.plays.count++;
  save();
}

export function addToPlaylist(pid, track) {
  const p = state.playlists.find((x) => x.id === pid);
  if (!p || p.tracks.some((t) => t.id === track.id)) return false;
  const { resolve, ...plain } = track;
  p.tracks.push(plain);
  save();
  return true;
}

export function createPlaylist(name) {
  const p = { id: 'p' + Date.now().toString(36), name: name.trim() || 'Новый плейлист', tracks: [] };
  state.playlists.push(p);
  save();
  return p;
}

export function deletePlaylist(pid) {
  state.playlists = state.playlists.filter((p) => p.id !== pid);
  save();
}

export function removeFromPlaylist(pid, tid) {
  const p = state.playlists.find((x) => x.id === pid);
  if (p) { p.tracks = p.tracks.filter((t) => t.id !== tid); save(); }
}
