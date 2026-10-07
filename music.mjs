/**
 * An original, dependency-free ambient score for Integrals: Remake.
 * 80 BPM; eight bars of warm extended chords, an evolving arpeggio and a
 * composed upper melody. Audio is synthesized here; no recordings are used.
 *
 * start() may be attempted on load and repeated from a user gesture if the
 * browser blocks autoplay. pause()/resume() also handle page visibility;
 * resume() never creates an AudioContext by itself.
 */
export function createMusicPlayer() {
  const BPM = 80;
  const STEP = 60 / BPM / 2;
  const LOOKAHEAD = 0.16;
  const CHORDS = [
    { bass: 38, pad: [53, 57, 60, 64], arp: [62, 65, 69, 72, 76] }, // Dm9
    { bass: 34, pad: [53, 57, 60, 62], arp: [58, 62, 65, 69, 72] }, // Bbmaj9
    { bass: 41, pad: [53, 57, 60, 64], arp: [60, 64, 65, 69, 72] }, // Fmaj7
    { bass: 36, pad: [55, 60, 62, 64], arp: [60, 62, 64, 67, 74] }, // Cadd9
    { bass: 31, pad: [53, 57, 58, 62], arp: [55, 58, 62, 65, 69] }, // Gm9
    { bass: 33, pad: [52, 55, 60, 64], arp: [57, 60, 64, 67, 72] }, // Am7
    { bass: 34, pad: [53, 57, 60, 62], arp: [58, 62, 65, 69, 72] }, // Bbmaj9
    { bass: 33, pad: [52, 55, 61, 64], arp: [57, 61, 64, 67, 69] }, // A7
  ];
  const ARPEGGIOS = [
    [0, -1, 2, 1, 3, -1, 4, 2],
    [0, 2, -1, 1, 4, 3, -1, 2],
    [0, -1, 1, 3, 2, -1, 4, 3],
    [0, 2, 1, -1, 3, 4, 2, -1],
  ];
  // A complete original melody, with rests that leave room for the player.
  const MELODY = [
    [81, -1, -1, 79, 77, -1, 76, -1],
    [77, -1, -1, -1, 74, -1, 72, -1],
    [76, -1, 77, -1, 81, -1, -1, -1],
    [79, -1, -1, 76, 74, -1, -1, -1],
    [77, -1, -1, 74, 70, -1, 74, -1],
    [76, -1, -1, -1, 72, -1, 71, -1],
    [74, -1, 77, -1, 81, -1, 79, -1],
    [76, -1, -1, 73, 69, -1, -1, -1],
  ];

  let context = null;
  let master = null;
  let dry = null;
  let wet = null;
  let reverbInput = null;
  let delayInput = null;
  let delayFeedback = null;
  let timer = null;
  let volume = 0.35;
  // Intent must survive a suspended autoplay attempt so toggle() can cancel
  // it. Actual playback also requires a running context and our scheduler.
  let playbackRequested = false;
  let stepIndex = 0;
  let nextStepTime = 0;
  let generation = 0;
  const voices = new Set();
  const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

  function createContext() {
    if (context) return;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) throw new Error('Этот браузер не поддерживает музыкальное сопровождение.');
    context = new Context({ latencyHint: 'playback' });
    master = context.createGain();
    master.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 20;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.012;
    limiter.release.value = 0.22;
    master.connect(limiter).connect(context.destination);
    dry = context.createGain();
    dry.gain.value = 0.82;
    dry.connect(master);
    wet = context.createGain();
    wet.gain.value = 0.26;
    wet.connect(master);

    const reverb = context.createConvolver();
    const seconds = 2.2;
    const impulse = context.createBuffer(2, Math.floor(context.sampleRate * seconds), context.sampleRate);
    let seed = 137113;
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      let smooth = 0;
      for (let i = 0; i < data.length; i++) {
        seed = (1664525 * seed + 1013904223) >>> 0;
        smooth = 0.67 * smooth + 0.33 * (seed / 2147483648 - 1);
        const attack = Math.min(1, i / (context.sampleRate * 0.018));
        data[i] = smooth * attack * (1 - i / data.length) ** 2.6;
      }
    }
    reverb.buffer = impulse;
    reverbInput = context.createGain();
    reverbInput.gain.value = 0.32;
    const reverbLowpass = context.createBiquadFilter();
    reverbLowpass.type = 'lowpass';
    reverbLowpass.frequency.value = 3000;
    reverbInput.connect(reverb).connect(reverbLowpass).connect(wet);

    delayInput = context.createGain();
    delayInput.gain.value = 0.18;
    const delay = context.createDelay(2);
    delay.delayTime.value = STEP * 3;
    delayFeedback = context.createGain();
    delayFeedback.gain.value = 0.22;
    const delayLowpass = context.createBiquadFilter();
    delayLowpass.type = 'lowpass';
    delayLowpass.frequency.value = 1900;
    delayInput.connect(delay);
    delay.connect(delayLowpass);
    delayLowpass.connect(wet);
    delayLowpass.connect(delayFeedback).connect(delay);
  }

  function registerVoice(sources, nodes, start, end) {
    const voice = { sources, nodes };
    voices.add(voice);
    let remaining = sources.length;
    for (const source of sources) {
      source.onended = () => {
        remaining--;
        if (remaining) return;
        voices.delete(voice);
        for (const node of nodes) node.disconnect();
        for (const oscillator of sources) oscillator.disconnect();
      };
      source.start(start);
      source.stop(end);
    }
  }

  function route(gain, pan, delaySend = true) {
    // StereoPanner is supported by current browsers; a gain fallback also
    // keeps the score usable on older Web Audio implementations.
    const output = context.createStereoPanner ? context.createStereoPanner() : context.createGain();
    if (output.pan) output.pan.value = pan;
    gain.connect(output);
    output.connect(dry);
    output.connect(reverbInput);
    if (delaySend) output.connect(delayInput);
    return output;
  }

  function pad(note, time, duration, pan) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.024, time + 0.55);
    gain.gain.setValueAtTime(0.024, time + duration - 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.7);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(740, time);
    filter.frequency.linearRampToValueAtTime(1050, time + duration / 2);
    filter.frequency.linearRampToValueAtTime(640, time + duration + 0.7);
    filter.Q.value = 0.3;
    filter.connect(gain);
    const output = route(gain, pan, false);
    const first = context.createOscillator();
    const second = context.createOscillator();
    first.type = 'triangle';
    second.type = 'sine';
    first.frequency.value = frequency(note);
    second.frequency.value = frequency(note);
    first.detune.value = -3;
    second.detune.value = 3;
    first.connect(filter);
    second.connect(filter);
    registerVoice([first, second], [filter, gain, output], time, time + duration + 0.75);
  }

  function pluck(note, time, melody, pan) {
    const gain = context.createGain();
    const level = melody ? 0.057 : 0.068;
    const duration = melody ? 2.1 : 1.35;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(level * 0.27, time + 0.24);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.32;
    filter.frequency.setValueAtTime(melody ? 3400 : 2400, time);
    filter.frequency.exponentialRampToValueAtTime(650, time + duration);
    filter.connect(gain);
    const output = route(gain, pan);
    const oscillator = context.createOscillator();
    oscillator.type = melody ? 'sine' : 'triangle';
    oscillator.frequency.value = frequency(note);
    oscillator.connect(filter);
    registerVoice([oscillator], [filter, gain, output], time, time + duration + 0.04);
  }

  function bass(note, time, duration) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.072, time + 0.055);
    gain.gain.exponentialRampToValueAtTime(0.036, time + 0.55);
    gain.gain.setValueAtTime(0.036, time + duration - 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.14);
    gain.connect(dry);
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency(note);
    oscillator.connect(gain);
    registerVoice([oscillator], [gain], time, time + duration + 0.2);
  }

  function kick(time, softer = false) {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(94, time);
    oscillator.frequency.exponentialRampToValueAtTime(43, time + 0.16);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(softer ? 0.055 : 0.085, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
    oscillator.connect(gain).connect(dry);
    registerVoice([oscillator], [gain], time, time + 0.29);
  }

  function scheduleStep(index, time) {
    const position = index % 8;
    const bar = Math.floor(index / 8) % CHORDS.length;
    const phrase = Math.floor(index / 64);
    const chord = CHORDS[bar];
    if (position === 0) {
      chord.pad.forEach((note, i) => pad(note, time, STEP * 8, (i - 1.5) * 0.3));
      bass(chord.bass, time, STEP * 8);
      kick(time);
    }
    if (position === 4 && phrase % 3 !== 2) kick(time, true);
    const arp = ARPEGGIOS[(bar + phrase) % ARPEGGIOS.length][position];
    if (arp >= 0) {
      const note = chord.arp[arp] + (phrase % 4 === 3 && position === 6 ? 12 : 0);
      pluck(note, time, false, Math.sin((index + 3) * 1.3) * 0.4);
    }
    const melodyNote = MELODY[bar][position];
    // Begin with four bars of atmosphere; later phrases alternate between a
    // full melodic statement and a more spacious variation.
    const melodyActive = index >= 32 && !(phrase % 3 === 2 && position > 0);
    if (melodyActive && melodyNote >= 0) {
      pluck(melodyNote, time + 0.007, true, Math.cos(bar * 0.8) * 0.16);
    }
  }

  function schedule() {
    if (!playbackRequested || !context || context.state !== 'running') return;
    const now = context.currentTime;
    // A stalled tab must never replay a backlog of notes in one loud burst.
    if (nextStepTime < now - 0.08) nextStepTime = now + 0.035;
    while (nextStepTime < now + LOOKAHEAD) {
      scheduleStep(stepIndex, nextStepTime);
      nextStepTime += STEP;
      stepIndex++;
    }
  }

  function pause() {
    playbackRequested = false;
    const token = ++generation;
    clearInterval(timer);
    timer = null;
    if (!context || context.state === 'closed') return;
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(0, now, 0.012);
    delayFeedback.gain.setTargetAtTime(0, now, 0.015);
    for (const voice of voices) {
      for (const source of voice.sources) {
        try { source.stop(now + 0.045); } catch { /* Already ended. */ }
      }
    }
    // Let note-release and the master fade run before suspending. A rapid
    // resume invalidates this timeout so it cannot suspend fresh playback.
    setTimeout(() => {
      if (generation === token && !playbackRequested && context?.state === 'running') {
        context.suspend().catch(() => {});
      }
    }, 65);
  }

  async function resume() {
    if (!context || context.state === 'closed') return false;
    if (isPlaying()) return true;
    const token = ++generation;
    playbackRequested = true;
    try {
      await context.resume();
    } catch (error) {
      if (generation === token) pause();
      throw error;
    }
    if (generation !== token || !playbackRequested) {
      // A delayed browser permission must not revive a disabled player, even
      // if pause's fade timeout already ran while the context was suspended.
      if (!playbackRequested && context.state === 'running') context.suspend().catch(() => {});
      return false;
    }
    if (context.state !== 'running') {
      playbackRequested = false;
      return false;
    }
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(volume * 0.68, now, 0.2);
    delayFeedback.gain.cancelScheduledValues(now);
    delayFeedback.gain.setTargetAtTime(0.22, now, 0.2);
    // Resume on a complete bar so sustained harmonies and bass always exist.
    stepIndex = Math.floor(stepIndex / 8) * 8;
    nextStepTime = now + 0.055;
    clearInterval(timer);
    schedule();
    timer = setInterval(schedule, 35);
    return true;
  }

  function isPlaying() {
    return playbackRequested && context?.state === 'running' && timer !== null;
  }

  async function start() {
    createContext();
    return resume();
  }

  async function toggle() {
    if (playbackRequested) {
      pause();
      return false;
    }
    return start();
  }

  function setVolume(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    volume = Math.min(1, Math.max(0, numeric));
    if (context && master && playbackRequested && context.state !== 'closed') {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(volume * 0.68, now, 0.06);
    }
  }

  return {
    start,
    toggle,
    pause,
    resume,
    setVolume,
    get playing() { return Boolean(isPlaying()); },
    get volume() { return volume; },
  };
}
