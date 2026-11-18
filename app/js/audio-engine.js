// Vinyl audio engine: plays a track through a "record" chain (EQ, saturation,
// wow & flutter) and overlays procedurally generated surface noise, needle
// drop and needle lift sounds. No audio assets required.

const RPM = 33.333;
const REV_SECONDS = 60 / RPM; // one platter revolution ≈ 1.8 s

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class VinylEngine extends EventTarget {
  constructor() {
    super();
    this.ctx = null;
    // Element routed through Web Audio (needs CORS). Fallback element plays
    // "dry" when the source has no CORS headers; crackle still overlays it.
    this.fxAudio = new Audio();
    this.fxAudio.crossOrigin = 'anonymous';
    this.dryAudio = new Audio();
    for (const a of [this.fxAudio, this.dryAudio]) {
      a.preload = 'auto';
      a.addEventListener('timeupdate', () => this._emit('time'));
      a.addEventListener('ended', () => { if (a === this.audio) this._onEnded(); });
    }
    this.audio = this.fxAudio;
    this.state = 'idle'; // idle | dropping | playing | paused | runout | lifting
    this.track = null;
    this.token = 0;
    this.settings = { crackle: 0.5, fx: true, volume: 0.9 };
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  _setState(s) { this.state = s; this._emit('state', s); }

  // ---------- graph ----------
  _ensure() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());

    this.master = ctx.createGain();
    this.master.gain.value = this.settings.volume;
    this.master.connect(ctx.destination);

    // Music chain: src -> hp -> warmth -> presence dip -> lp -> saturation -> wow -> musicGain
    this.src = ctx.createMediaElementSource(this.fxAudio);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 35;
    const warm = ctx.createBiquadFilter(); warm.type = 'peaking'; warm.frequency.value = 180; warm.Q.value = 0.8; warm.gain.value = 2.5;
    const dip = ctx.createBiquadFilter(); dip.type = 'peaking'; dip.frequency.value = 3200; dip.Q.value = 1; dip.gain.value = -1.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 12500; lp.Q.value = 0.5;
    const sat = ctx.createWaveShaper(); sat.curve = softClipCurve(1.6); sat.oversample = '2x';
    const wow = ctx.createDelay(0.05); wow.delayTime.value = 0.008;
    // wow (slow, ~0.55 Hz = platter eccentricity) + flutter (faster, subtle)
    const lfo1 = ctx.createOscillator(); lfo1.frequency.value = 1 / REV_SECONDS;
    const lfo1g = ctx.createGain(); lfo1g.gain.value = 0.00035;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 6.3;
    const lfo2g = ctx.createGain(); lfo2g.gain.value = 0.00004;
    lfo1.connect(lfo1g).connect(wow.delayTime);
    lfo2.connect(lfo2g).connect(wow.delayTime);
    lfo1.start(); lfo2.start();

    this.fxIn = ctx.createGain();
    this.dryIn = ctx.createGain();
    this.musicGain = ctx.createGain();
    this.src.connect(this.fxIn);
    this.src.connect(this.dryIn);
    this.fxIn.connect(hp).connect(warm).connect(dip).connect(lp).connect(sat).connect(wow).connect(this.musicGain);
    this.dryIn.connect(this.musicGain);
    this.musicGain.connect(this.master);
    this._applyFx();

    // Surface noise loop
    this.crackleBuf = makeCrackleBuffer(ctx, 9);
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0;
    const crackleTone = ctx.createBiquadFilter();
    crackleTone.type = 'lowpass'; crackleTone.frequency.value = 9000;
    this.crackleGain.connect(crackleTone).connect(this.master);
    this.crackleSrc = null;

    this.dropBuf = makeNeedleDropBuffer(ctx);
    this.liftBuf = makeNeedleLiftBuffer(ctx);
    this.tickBuf = makeTickBuffer(ctx);
  }

  _applyFx() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.fxIn.gain.setTargetAtTime(this.settings.fx ? 1 : 0, t, 0.05);
    this.dryIn.gain.setTargetAtTime(this.settings.fx ? 0 : 1, t, 0.05);
  }

  set(settings) {
    Object.assign(this.settings, settings);
    this.dryAudio.volume = this.settings.volume;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.settings.volume, this.ctx.currentTime, 0.05);
    this._applyFx();
    if (this.state === 'playing') this._crackleTo(this._bedLevel(), 0.3);
  }

  _bedLevel() { return this.settings.fx ? 0.34 * this.settings.crackle : 0; }
  _introLevel() { return this.settings.fx ? 0.15 + 0.6 * this.settings.crackle : 0.08; }

  _startCrackle() {
    if (this.crackleSrc) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.crackleBuf; s.loop = true;
    s.connect(this.crackleGain);
    s.start(0, Math.random() * this.crackleBuf.duration);
    this.crackleSrc = s;
  }
  _stopCrackle(after = 0) {
    const s = this.crackleSrc; if (!s) return;
    this.crackleSrc = null;
    try { s.stop(this.ctx.currentTime + after); } catch {}
  }
  _crackleTo(v, time = 0.4) {
    const g = this.crackleGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(v, t + time);
  }
  _oneShot(buf, gain = 1) {
    if (!this.settings.fx && buf !== this.liftBuf && buf !== this.dropBuf) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = gain * (this.settings.fx ? 1 : 0.35);
    s.connect(g).connect(this.master); s.start();
  }
  // Lead-in / run-out groove: a soft pop once per revolution.
  _ticks(count) {
    if (!this.settings.fx) return;
    const t0 = this.ctx.currentTime + 0.25;
    for (let i = 0; i < count; i++) {
      const s = this.ctx.createBufferSource(); s.buffer = this.tickBuf;
      const g = this.ctx.createGain(); g.gain.value = 0.25 + 0.5 * this.settings.crackle;
      s.connect(g).connect(this.master); s.start(t0 + i * REV_SECONDS);
    }
  }

  // ---------- transport ----------
  async load(track) {
    this._ensure();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const my = ++this.token;
    const wasOnRecord = ['playing', 'paused', 'runout', 'dropping'].includes(this.state);
    this.audio.pause();
    if (wasOnRecord) await this._lift(my);
    if (my !== this.token) return false;

    this.track = track;
    this._emit('track', track);
    const ok = await this._prepare(track.url, my);
    if (my !== this.token) return false;
    if (!ok) { this._setState('idle'); this._emit('error', 'Не удалось загрузить трек'); return false; }

    // Needle drop: arm swings in, platter spins up, needle lands, lead-in crackle.
    this._setState('dropping');
    this._emit('motor', true);
    await sleep(900);
    if (my !== this.token) return false;
    this._oneShot(this.dropBuf, 0.9);
    this._startCrackle();
    this._crackleTo(this._introLevel(), 0.15);
    this._ticks(2);
    await sleep(Math.round(REV_SECONDS * 1.6 * 1000));
    if (my !== this.token) return false;

    this._crackleTo(this._bedLevel(), 1.2);
    try { await this.audio.play(); } catch (e) {
      this._emit('error', 'Браузер не дал начать воспроизведение'); this._setState('idle'); return false;
    }
    this._setState('playing');
    this._emit('started', track);
    return true;
  }

  // Try CORS element (full effect), else fall back to dry element.
  async _prepare(url, my) {
    const tryEl = (el) => new Promise((resolve) => {
      const done = (ok) => { el.removeEventListener('canplay', okH); el.removeEventListener('error', errH); clearTimeout(to); resolve(ok); };
      const okH = () => done(true), errH = () => done(false);
      const to = setTimeout(() => done(false), 20000);
      el.addEventListener('canplay', okH); el.addEventListener('error', errH);
      el.src = url; el.load();
    });
    this.fxAudio.removeAttribute('src'); this.dryAudio.removeAttribute('src');
    if (await tryEl(this.fxAudio)) { this.audio = this.fxAudio; this.processed = true; return true; }
    if (my !== this.token) return false;
    if (await tryEl(this.dryAudio)) { this.audio = this.dryAudio; this.processed = false; this.dryAudio.volume = this.settings.volume; this._emit('notice', 'Источник без CORS: эффект пластинки упрощён (только треск)'); return true; }
    return false;
  }

  async pause() {
    if (this.state !== 'playing') return;
    this.audio.pause();
    this._crackleTo(0, 0.6);
    this._emit('motor', false);
    this._setState('paused');
  }

  async resume() {
    if (this.state !== 'paused') return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this._emit('motor', true);
    this._crackleTo(this._bedLevel(), 0.6);
    await sleep(500);
    try { await this.audio.play(); this._setState('playing'); } catch {}
  }

  toggle() { if (this.state === 'playing') return this.pause(); if (this.state === 'paused') return this.resume(); }

  seek(fraction) {
    const d = this.audio.duration;
    if (!isFinite(d)) return;
    this.audio.currentTime = Math.max(0, Math.min(d - 0.1, fraction * d));
    if (this.settings.fx && this.ctx) this._oneShot(this.tickBuf, 0.6); // needle skip
  }

  get progress() {
    const d = this.audio.duration;
    return isFinite(d) && d > 0 ? this.audio.currentTime / d : 0;
  }
  get currentTime() { return this.audio.currentTime || 0; }
  get duration() { return isFinite(this.audio.duration) ? this.audio.duration : (this.track?.duration || 0); }

  async _onEnded() {
    if (this.state !== 'playing') return;
    const my = this.token;
    // Run-out groove: crackle swells, rhythmic pops, platter starts slowing.
    this._setState('runout');
    this._crackleTo(this._introLevel(), 0.8);
    this._ticks(2);
    this._emit('motor', 'slow');
    await sleep(Math.round(REV_SECONDS * 2 * 1000));
    if (my !== this.token) return;
    await this._lift(my);
    if (my !== this.token) return;
    this._emit('finished', this.track);
  }

  async _lift(my) {
    this._setState('lifting');
    this._oneShot(this.liftBuf, 0.8);
    this._crackleTo(0, 0.25);
    this._stopCrackle(0.3);
    this._emit('motor', false);
    await sleep(700);
    if (my === this.token || this.state === 'lifting') this._setState('idle');
  }

  async stop() {
    const my = ++this.token;
    this.audio.pause();
    if (this.state !== 'idle') await this._lift(my);
  }
}

// ---------- sound synthesis ----------

function softClipCurve(drive) {
  const n = 2048, c = new Float32Array(n), norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(drive * x) / norm; }
  return c;
}

function makeCrackleBuffer(ctx, seconds) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let hiss = 0, rumble = 0;
    for (let i = 0; i < len; i++) {
      // soft hiss (filtered white noise) + very low rumble
      hiss = hiss * 0.6 + (Math.random() * 2 - 1) * 0.4;
      rumble = rumble * 0.995 + (Math.random() * 2 - 1) * 0.005;
      d[i] = hiss * 0.012 + rumble * 0.35;
    }
    // dust clicks
    const clicks = Math.floor(seconds * 55);
    for (let k = 0; k < clicks; k++) {
      const pos = Math.floor(Math.random() * len);
      const amp = Math.pow(Math.random(), 3) * 0.55 + 0.03;
      const L = 8 + Math.floor(Math.random() * 60);
      const sign = Math.random() < 0.5 ? -1 : 1;
      for (let j = 0; j < L && pos + j < len; j++) {
        d[pos + j] += sign * amp * Math.exp(-j / (L * 0.25)) * (j % 2 ? -0.6 : 1);
      }
    }
    // occasional deep pops (scratches)
    const pops = Math.floor(seconds * 1.2);
    for (let k = 0; k < pops; k++) {
      const pos = Math.floor(Math.random() * len);
      const amp = 0.25 + Math.random() * 0.35;
      const L = 200 + Math.floor(Math.random() * 400);
      for (let j = 0; j < L && pos + j < len; j++) {
        d[pos + j] += amp * Math.exp(-j / (L * 0.2)) * Math.sin(j / 9);
      }
    }
  }
  // smooth loop seam
  const fade = Math.floor(sr * 0.05);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < fade; i++) { const g = i / fade; d[i] *= g; d[len - 1 - i] *= g; }
  }
  return buf;
}

function makeNeedleDropBuffer(ctx) {
  const sr = ctx.sampleRate, len = Math.floor(sr * 1.1);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lpN = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // touch-down thump: low sine + filtered noise burst
      const thump = Math.sin(2 * Math.PI * 58 * t) * Math.exp(-t * 18) * 0.7;
      lpN = lpN * 0.85 + (Math.random() * 2 - 1) * 0.15;
      const body = lpN * Math.exp(-t * 30) * 1.4;
      // stylus settling into groove: bright scrape
      const scrape = (Math.random() * 2 - 1) * Math.exp(-Math.max(0, t - 0.03) * 22) * 0.12 * (t > 0.02 ? 1 : 0);
      d[i] = thump + body + scrape;
    }
    // second small bounce
    const off = Math.floor(sr * 0.085);
    for (let i = 0; i < sr * 0.2 && off + i < len; i++) {
      const t = i / sr; d[off + i] += Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 35) * 0.25;
    }
  }
  return buf;
}

function makeNeedleLiftBuffer(ctx) {
  const sr = ctx.sampleRate, len = Math.floor(sr * 0.7);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lpN = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // short scrape as the stylus leaves the groove, then a soft "pluck"
      const env = t < 0.12 ? (t / 0.12) * Math.exp(-t * 4) : Math.exp(-(t - 0.12) * 28) * 0.88;
      const scrape = (Math.random() * 2 - 1) * env * 0.16;
      lpN = lpN * 0.9 + (Math.random() * 2 - 1) * 0.1;
      const pluck = t > 0.12 ? Math.sin(2 * Math.PI * 95 * (t - 0.12)) * Math.exp(-(t - 0.12) * 25) * 0.35 + lpN * Math.exp(-(t - 0.12) * 40) : 0;
      d[i] = scrape + pluck;
    }
  }
  return buf;
}

function makeTickBuffer(ctx) {
  const sr = ctx.sampleRate, len = Math.floor(sr * 0.06);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lpN = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      lpN = lpN * 0.7 + (Math.random() * 2 - 1) * 0.3;
      d[i] = (lpN * 0.8 + Math.sin(2 * Math.PI * 140 * t) * 0.4) * Math.exp(-t * 90);
    }
  }
  return buf;
}
