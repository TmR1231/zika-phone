"use strict";

(() => {
  const labels = {
    none: "静音",
    bubble: "气泡",
    ding: "叮咚",
    bird: "小鸟",
    drop: "水滴",
    piano: "钢琴",
    tick: "轻叩",
    "ring-warm": "温馨铃",
    "ring-classic": "经典铃"
  };
  const messageSounds = ["none", "bubble", "ding", "bird", "drop", "piano", "tick"];
  const ringSounds = ["none", "ring-warm", "ring-classic"];
  let context = null;
  let ringSource = null;
  const buffers = new Map();

  function ensureContext() {
    try {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return null;
      if (!context) context = new AudioContext();
      if (context.state === "suspended") context.resume().catch(() => {});
      return context;
    } catch {
      return null;
    }
  }

  function addTone(data, sampleRate, start, duration, from, to, decay, amount) {
    const first = Math.max(0, Math.floor(start * sampleRate));
    const last = Math.min(data.length, Math.ceil((start + duration) * sampleRate));
    let phase = 0;
    for (let index = first; index < last; index++) {
      const time = index / sampleRate - start;
      const frequency = to + (from - to) * Math.exp(-time * 14);
      phase += 2 * Math.PI * frequency / sampleRate;
      data[index] += Math.sin(phase) * amount * Math.exp(-time * decay);
    }
  }

  function bufferFor(ctx, id) {
    if (buffers.has(id)) return buffers.get(id);
    const durations = { bubble: 0.18, ding: 0.52, bird: 0.32, drop: 0.22, piano: 0.75, tick: 0.07, "ring-warm": 2.1, "ring-classic": 1.52 };
    if (!durations[id]) return null;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * durations[id]), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const rate = ctx.sampleRate;
    if (id === "bubble") addTone(data, rate, 0, 0.18, 880, 360, 26, 0.5);
    else if (id === "ding") {
      addTone(data, rate, 0, 0.14, 1568, 1568, 26, 0.4);
      addTone(data, rate, 0.2, 0.32, 1046, 1046, 13, 0.42);
    } else if (id === "bird") {
      addTone(data, rate, 0, 0.1, 2100, 3300, 32, 0.35);
      addTone(data, rate, 0.155, 0.13, 1700, 2600, 26, 0.3);
    } else if (id === "drop") {
      addTone(data, rate, 0, 0.2, 1400, 520, 20, 0.45);
      addTone(data, rate, 0, 0.15, 2800, 1600, 34, 0.1);
    } else if (id === "piano") {
      addTone(data, rate, 0, 0.75, 659.25, 659.25, 6.5, 0.4);
      addTone(data, rate, 0, 0.75, 1318.5, 1318.5, 8, 0.13);
    } else if (id === "tick") addTone(data, rate, 0, 0.06, 1200, 850, 75, 0.35);
    else {
      const notes = id === "ring-warm"
        ? [[523.25, 0.45, 0], [659.25, 0.45, 0.45], [783.99, 0.45, 0.9], [659.25, 0.75, 1.35]]
        : [[659.25, 0.35, 0], [659.25, 0.35, 0.82]];
      for (const [frequency, duration, start] of notes) {
        addTone(data, rate, start, duration, frequency, frequency, 5, 0.42);
        addTone(data, rate, start, duration, frequency * 2, frequency * 2, 6, 0.09);
      }
    }
    buffers.set(id, buffer);
    return buffer;
  }

  function play(id, volume = 70, loop = false) {
    if (!id || id === "none") return false;
    const ctx = ensureContext();
    const buffer = ctx && bufferFor(ctx, id);
    if (!buffer) return false;
    try {
      if (loop) stopRing();
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = Boolean(loop);
      gain.gain.value = Math.max(0, Math.min(100, Number(volume) || 0)) / 100 * 0.8;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      if (loop) ringSource = source;
      return true;
    } catch {
      return false;
    }
  }

  function stopRing() {
    if (!ringSource) return;
    try { ringSource.stop(); } catch {}
    ringSource = null;
  }

  if (typeof document !== "undefined") {
    const unlock = () => ensureContext();
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("keydown", unlock);
  }

  globalThis.ZikaSFX = { labels, messageSounds, ringSounds, play, stopRing };
})();
