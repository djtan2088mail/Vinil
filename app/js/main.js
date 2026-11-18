import { VinylEngine } from './audio-engine.js';
import { Turntable, SKINS, skinById, drawRecord } from './vinyl.js';
import { searchAll, resolveArchiveItem, localTracks } from './sources.js';
import * as store from './store.js';

const { state } = store;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
  queue: '<svg viewBox="0 0 24 24"><path d="M4 6h12M4 12h12M4 18h7M18 15v6M15 18h6"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2h1v11H6V10zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>',
};

// ---------------- core objects ----------------
const engine = new VinylEngine();
engine.set(state.settings);
const deck = new Turntable($('#stage'));
deck.setSkin(skinById(state.premium ? state.skin : 'noir'));

let queue = [];
let index = -1;
const DEMO = { id: 'demo:1', source: 'local', title: 'Кофе в 7 утра', artist: 'Vinil · демо-трек', artwork: '', duration: 36, url: new URL('../assets/demo.wav', import.meta.url).href };
let results = [DEMO];

// ---------------- engine → UI ----------------
const STATE_LABEL = {
  idle: 'ПЛАСТИНКА НЕ СТОИТ', dropping: 'ОПУСКАЕМ ИГЛУ…', playing: 'ИГРАЕТ · 33⅓', paused: 'ПАУЗА',
  runout: 'ВЫВОДНАЯ ДОРОЖКА', lifting: 'ПОДНИМАЕМ ИГЛУ',
};
engine.addEventListener('state', ({ detail: s }) => {
  $('#stateTag').textContent = STATE_LABEL[s] || '';
  document.body.classList.toggle('playing', s === 'playing' || s === 'dropping');
  deck.setArm({ dropping: 'cue', playing: 'play', paused: 'play', runout: 'runout' }[s] || 'rest');
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = s === 'playing' ? 'playing' : s === 'paused' ? 'paused' : 'none';
});
engine.addEventListener('motor', ({ detail }) => deck.setMotor(detail));
engine.addEventListener('time', () => {
  const p = engine.progress;
  deck.setProgress(p);
  if (!seeking) { seek.value = Math.round(p * 1000); paintRange(seek); }
  $('#tCur').textContent = fmt(engine.currentTime);
  $('#tDur').textContent = fmt(engine.duration);
});
engine.addEventListener('started', () => { store.countPlay(); renderPlays(); });
engine.addEventListener('finished', () => { if (index < queue.length - 1) playAt(index + 1); });
engine.addEventListener('notice', ({ detail }) => toast(detail));
engine.addEventListener('error', ({ detail }) => { toast(detail); });

// ---------------- playback ----------------
async function playAt(i) {
  if (i < 0 || i >= queue.length) return;
  if (store.playsLeft() <= 0) return paywall('limit');
  let t = queue[i];
  if (t.album) {
    toast('Открываем альбом…');
    try {
      const tracks = await resolveArchiveItem(t);
      if (!tracks.length) return toast('В этом альбоме нет mp3');
      queue.splice(i, 1, ...tracks);
      t = queue[i];
      renderQueue();
    } catch { return toast('Internet Archive не ответил'); }
  }
  index = i;
  showTrack(t);
  renderQueue(); renderResults();
  await engine.load(t);
}

function showTrack(t) {
  $('#title').textContent = t.title;
  $('#artist').textContent = t.artist;
  $('#srcTag').textContent = '· ' + ({ audius: 'AUDIUS', archive: 'ARCHIVE.ORG', local: 'ФАЙЛ' }[t.source] || '');
  $('#tDur').textContent = fmt(t.duration);
  $('#tCur').textContent = '0:00';
  seek.value = 0; paintRange(seek);
  deck.setMeta({ title: t.title, artist: t.artist });
  document.title = `${t.title} — Vinil`;
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist, album: 'Vinil',
      artwork: t.artwork ? [{ src: t.artwork, sizes: '480x480' }] : [],
    });
  }
}

function enqueue(tracks, playNow = false) {
  const start = queue.length;
  queue.push(...tracks);
  renderQueue();
  if (playNow) playAt(start);
  else toast(tracks.length > 1 ? `В очереди +${tracks.length}` : 'Добавлено в очередь');
}

function playNowList(tracks, from = 0) {
  queue = [...tracks]; index = -1;
  playAt(from);
}

$('#play').addEventListener('click', () => {
  if (engine.state === 'playing' || engine.state === 'paused') engine.toggle();
  else if (queue.length) playAt(Math.max(0, index));
  else { selectTab('search'); $('#q').focus(); toast('Сначала найдите трек'); }
});
$('#next').addEventListener('click', () => playAt(index + 1));
$('#prev').addEventListener('click', () => {
  if (engine.currentTime > 4) engine.seek(0); else playAt(index - 1);
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.target.closest('input, button, textarea')) { e.preventDefault(); $('#play').click(); }
});
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => engine.resume());
  ms.setActionHandler('pause', () => engine.pause());
  ms.setActionHandler('nexttrack', () => playAt(index + 1));
  ms.setActionHandler('previoustrack', () => playAt(index - 1));
}

const seek = $('#seek');
let seeking = false;
seek.addEventListener('input', () => { seeking = true; paintRange(seek); });
seek.addEventListener('change', () => { engine.seek(seek.value / 1000); seeking = false; });
function paintRange(el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min)) * 100 + '%'); }

// ---------------- tabs ----------------
function selectTab(name) {
  $$('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === name));
  $$('.pane').forEach((p) => (p.hidden = p.dataset.pane !== name));
}
$$('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

// ---------------- search ----------------
let searchCtl;
$('#searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (!q) return;
  const enabled = $$('input[name="src"]:checked').map((i) => i.value);
  if (!enabled.length) return toast('Выберите хотя бы один источник');
  searchCtl?.abort(); searchCtl = new AbortController();
  $('#results').innerHTML = '<div class="spinner"></div>';
  const { items, errors } = await searchAll(q, enabled, searchCtl.signal);
  results = items;
  renderResults();
  if (errors.length) toast(`Не ответил: ${errors.join(', ')}`);
});
$('#fileInput').addEventListener('change', (e) => {
  const tracks = localTracks(e.target.files);
  if (!tracks.length) return;
  results = [...tracks, ...results];
  renderResults();
  enqueue(tracks, engine.state === 'idle');
  e.target.value = '';
});

function trackRow(t, { actions = ['play', 'queue', 'heart'], current = false, i = 0 } = {}) {
  const art = t.artwork ? `style="background-image:url('${esc(t.artwork)}')"` : '';
  const sub = t.album ? `${t.artist} · альбом` : t.artist;
  return `<div class="trk ${current ? 'current' : ''}" data-i="${i}">
    <button class="art" ${art} data-act="play" aria-label="Играть"></button>
    <div class="trk-main"><div class="trk-title">${esc(t.title)}</div><div class="trk-sub">${esc(sub)}</div></div>
    <span class="trk-dur">${t.duration ? fmt(t.duration) : ''}</span>
    <div class="trk-act">${actions.map((a) => `<button class="icon ${a === 'play' ? 'fill' : ''}" data-act="${a}" aria-label="${a}">${ICON[a]}</button>`).join('')}</div>
  </div>`;
}

function renderResults() {
  const el = $('#results');
  if (!results.length) {
    if (!el.querySelector('.empty')) el.innerHTML = '<p class="empty">Ничего не нашлось. Попробуйте другой запрос.</p>';
    return;
  }
  const cur = queue[index];
  el.innerHTML = results.map((t, i) => trackRow(t, { i, current: cur && cur.id === t.id, actions: t.album ? ['play', 'queue'] : ['play', 'queue', 'heart'] })).join('');
}
$('#results').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const t = results[+b.closest('.trk').dataset.i];
  if (b.dataset.act === 'play') enqueue([t], true);
  if (b.dataset.act === 'queue') enqueue([t]);
  if (b.dataset.act === 'heart') openAddTo(t);
});

// ---------------- queue ----------------
function renderQueue() {
  const el = $('#queueList');
  el.innerHTML = queue.length
    ? queue.map((t, i) => trackRow(t, { i, current: i === index, actions: ['heart', 'x'] })).join('')
    : '<p class="empty">Очередь пуста</p>';
}
$('#queueList').addEventListener('click', (e) => {
  const row = e.target.closest('.trk'); if (!row) return;
  const i = +row.dataset.i, act = e.target.closest('[data-act]')?.dataset.act || 'play';
  if (act === 'play') playAt(i);
  if (act === 'heart') openAddTo(queue[i]);
  if (act === 'x') { queue.splice(i, 1); if (i < index) index--; else if (i === index) index = -1; renderQueue(); }
});
$('#clearQueue').addEventListener('click', () => { queue = queue.filter((_, i) => i === index); index = queue.length ? 0 : -1; renderQueue(); });

// ---------------- playlists ----------------
function renderPlaylists() {
  $('#playlists').innerHTML = state.playlists.map((p) => `
    <div class="pl" data-pid="${p.id}">
      <div class="pl-head">
        <h3>${esc(p.name)}</h3><small>${p.tracks.length} тр.</small>
        <button class="btn small" data-act="playall" ${p.tracks.length ? '' : 'disabled'}>Играть</button>
        ${p.id === 'fav' ? '' : `<button class="icon" data-act="del" aria-label="Удалить плейлист">${ICON.x}</button>`}
      </div>
      <div class="list">${p.tracks.length ? p.tracks.map((t, i) => trackRow(t, { i, actions: ['queue', 'x'] })).join('') : '<p class="empty">Пусто — добавляйте треки сердечком</p>'}</div>
    </div>`).join('');
}
$('#playlists').addEventListener('click', (e) => {
  const pl = e.target.closest('.pl'); if (!pl) return;
  const p = state.playlists.find((x) => x.id === pl.dataset.pid);
  const act = e.target.closest('[data-act]')?.dataset.act;
  const row = e.target.closest('.trk');
  if (act === 'playall') return playNowList(p.tracks);
  if (act === 'del') {
    const b = e.target.closest('[data-act]');
    if (b.dataset.armed) { store.deletePlaylist(p.id); renderPlaylists(); }
    else { b.dataset.armed = '1'; toast(`Нажмите ещё раз, чтобы удалить «${p.name}»`); setTimeout(() => delete b.dataset.armed, 3000); }
    return;
  }
  if (!row) return;
  const i = +row.dataset.i;
  if (act === 'x') { store.removeFromPlaylist(p.id, p.tracks[i].id); renderPlaylists(); }
  else if (act === 'queue') enqueue([p.tracks[i]]);
  else playNowList(p.tracks, i);
});
$('#newList').addEventListener('submit', (e) => {
  e.preventDefault();
  store.createPlaylist($('#newListName').value);
  $('#newListName').value = '';
  renderPlaylists();
});

let addToTrack = null;
function openAddTo(t) {
  addToTrack = t;
  $('#addToList').innerHTML = state.playlists.map((p) => `<button type="button" data-pid="${p.id}">${esc(p.name)} <small>· ${p.tracks.length}</small></button>`).join('');
  $('#addTo').showModal();
}
$('#addToList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pid]'); if (!b) return;
  const ok = store.addToPlaylist(b.dataset.pid, addToTrack);
  $('#addTo').close();
  toast(ok ? 'Добавлено в плейлист' : 'Уже есть в плейлисте');
  renderPlaylists();
});

// ---------------- deck settings & skins ----------------
const fx = $('#fx'), crackle = $('#crackle'), volume = $('#volume');
fx.checked = state.settings.fx; crackle.value = state.settings.crackle; volume.value = state.settings.volume;
[crackle, volume].forEach(paintRange);
const applySettings = () => {
  state.settings = { fx: fx.checked, crackle: +crackle.value, volume: +volume.value };
  engine.set(state.settings); store.save();
  [crackle, volume].forEach(paintRange);
};
[fx, crackle, volume].forEach((el) => el.addEventListener('input', applySettings));

function renderSkins() {
  const wrap = $('#skins');
  wrap.innerHTML = '';
  const active = state.premium ? state.skin : 'noir';
  for (const s of SKINS) {
    const b = document.createElement('button');
    b.className = 'skin'; b.type = 'button';
    b.setAttribute('aria-pressed', s.id === active);
    const c = document.createElement('canvas'); c.width = c.height = 240;
    drawRecord(c, s);
    b.append(c, Object.assign(document.createElement('span'), { textContent: s.name }));
    if (s.premium && !state.premium) b.insertAdjacentHTML('beforeend', `<span class="lock" aria-label="Plus">${ICON.lock}</span>`);
    b.addEventListener('click', () => {
      if (s.premium && !state.premium) return paywall('skin', s);
      state.skin = s.id; store.save(); deck.setSkin(s); renderSkins();
    });
    wrap.append(b);
  }
  $('#plusBadge').hidden = state.premium;
  $('#plusCard').innerHTML = state.premium
    ? `<h3>Vinil Plus активен</h3><p>Безлимит и все цвета пластинки. (Демо-режим прототипа.)</p><button class="btn" type="button" id="plusOff">Выключить демо Plus</button>`
    : `<h3>Vinil Plus</h3><p>Все 11 пластинок и безлимит треков. Бесплатно — ${store.FREE_DAILY_LIMIT} треков в сутки и классический чёрный винил.</p><button class="btn" type="button" id="plusOn">Подключить Plus</button>`;
  $('#plusOn')?.addEventListener('click', () => paywall('plus'));
  $('#plusOff')?.addEventListener('click', () => { state.premium = false; store.save(); deck.setSkin(skinById('noir')); renderSkins(); renderPlays(); });
}

// ---------------- monetisation ----------------
function renderPlays() {
  const left = store.playsLeft(), el = $('#playsLeft');
  el.textContent = left === Infinity ? 'PLUS · ∞' : `${left} / ${store.FREE_DAILY_LIMIT} сегодня`;
  el.classList.toggle('out', left === 0);
}
$('#playsLeft').addEventListener('click', () => { if (!state.premium) paywall('plus'); });

let pendingSkin = null;
function paywall(reason, skin) {
  pendingSkin = skin || null;
  const T = {
    limit: ['На сегодня всё', `Бесплатно можно поставить ${store.FREE_DAILY_LIMIT} пластинок в сутки. Счётчик обнулится в полночь — или подключите Plus.`],
    skin: [`Пластинка «${skin?.name}»`, 'Цветной винил доступен в Vinil Plus.'],
    plus: ['Больше пластинок', 'Цветной винил и музыка без ограничений.'],
  }[reason];
  $('#pwTitle').textContent = T[0]; $('#pwText').textContent = T[1];
  $('#paywall').returnValue = '';
  $('#paywall').showModal();
}
$('#paywall').addEventListener('close', () => {
  if ($('#paywall').returnValue !== 'buy') return;
  state.premium = true;
  if (pendingSkin) { state.skin = pendingSkin.id; deck.setSkin(pendingSkin); }
  else deck.setSkin(skinById(state.skin));
  store.save(); renderSkins(); renderPlays();
  toast('Plus включён (демо)');
});

// ---------------- toast ----------------
let toastT;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------------- boot ----------------
renderPlays(); renderQueue(); renderPlaylists(); renderSkins(); renderResults(); paintRange(seek);
document.fonts?.ready.then(() => { deck.setMeta(deck.meta); renderSkins(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// debug / testing hook
window.vinil = { engine, deck, store, enqueue };
