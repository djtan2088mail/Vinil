// Music search across open sources. Each track:
// { id, source, title, artist, artwork, duration, url? , resolve? }

const APP_NAME = 'vinil-prototype';

// ---- Audius (open, decentralised, CORS-enabled, no key) ----
let audiusHost = null;
async function getAudiusHost() {
  if (audiusHost) return audiusHost;
  try {
    const r = await fetch('https://api.audius.co', { cache: 'no-store' });
    const j = await r.json();
    const list = j.data || [];
    audiusHost = list[Math.floor(Math.random() * list.length)] || 'https://discoveryprovider.audius.co';
  } catch {
    audiusHost = 'https://discoveryprovider.audius.co';
  }
  return audiusHost;
}

async function searchAudius(query, signal) {
  const host = await getAudiusHost();
  const r = await fetch(`${host}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${APP_NAME}`, { signal });
  if (!r.ok) throw new Error('Audius ' + r.status);
  const j = await r.json();
  return (j.data || [])
    .filter((t) => t.is_streamable !== false)
    .slice(0, 25)
    .map((t) => ({
      id: 'audius:' + t.id,
      source: 'audius',
      title: t.title,
      artist: t.user?.name || 'Unknown',
      artwork: t.artwork?.['480x480'] || t.artwork?.['150x150'] || '',
      duration: t.duration || 0,
      url: `${host}/v1/tracks/${t.id}/stream?app_name=${APP_NAME}`,
    }));
}

// ---- Internet Archive (public domain / CC audio, old 78s & LPs) ----
async function searchArchive(query, signal) {
  const q = `(${query}) AND mediatype:(audio) AND format:(MP3)`;
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&rows=20&output=json`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error('Archive ' + r.status);
  const j = await r.json();
  return (j.response?.docs || []).map((d) => ({
    id: 'ia:' + d.identifier,
    source: 'archive',
    title: Array.isArray(d.title) ? d.title[0] : d.title || d.identifier,
    artist: (Array.isArray(d.creator) ? d.creator[0] : d.creator) || 'Internet Archive',
    artwork: `https://archive.org/services/img/${d.identifier}`,
    duration: 0,
    identifier: d.identifier,
    album: true,
  }));
}

/** Expand an Internet Archive item into playable tracks. */
export async function resolveArchiveItem(item) {
  const r = await fetch(`https://archive.org/metadata/${item.identifier}`);
  const j = await r.json();
  const files = (j.files || []).filter((f) => /\.mp3$/i.test(f.name));
  const parseLen = (l) => {
    if (!l) return 0;
    if (String(l).includes(':')) return String(l).split(':').reduce((a, b) => a * 60 + +b, 0);
    return +l;
  };
  // prefer one bitrate (avoid duplicate 64kb derivatives)
  const originals = files.filter((f) => f.source === 'original');
  const use = originals.length ? originals : files;
  return use.slice(0, 40).map((f, i) => ({
    id: `ia:${item.identifier}:${i}`,
    source: 'archive',
    title: f.title || f.name.replace(/\.mp3$/i, '').replace(/_/g, ' '),
    artist: f.creator || f.artist || item.artist,
    artwork: item.artwork,
    duration: parseLen(f.length),
    url: `https://archive.org/download/${item.identifier}/${encodeURIComponent(f.name)}`,
  }));
}

export const SOURCES = {
  audius: { name: 'Audius', search: searchAudius },
  archive: { name: 'Internet Archive', search: searchArchive },
};

export async function searchAll(query, enabled, signal) {
  const jobs = enabled.map((k) =>
    SOURCES[k].search(query, signal).then((items) => ({ k, items }), (err) => ({ k, items: [], err })),
  );
  const res = await Promise.all(jobs);
  return {
    items: res.flatMap((r) => r.items),
    errors: res.filter((r) => r.err && r.err.name !== 'AbortError').map((r) => SOURCES[r.k].name),
  };
}

/** Local audio files the user picks — always work, good for trying the effect. */
export function localTracks(fileList) {
  return [...fileList].map((f, i) => ({
    id: `local:${Date.now()}:${i}`,
    source: 'local',
    title: f.name.replace(/\.[^.]+$/, ''),
    artist: 'Мой файл',
    artwork: '',
    duration: 0,
    url: URL.createObjectURL(f),
    ephemeral: true,
  }));
}
