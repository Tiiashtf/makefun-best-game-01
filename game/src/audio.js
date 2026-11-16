// All sound is synthesized with WebAudio: short oscillator blips and filtered noise, no
// audio files. The context is created on the first pointer or key gesture, so browsers
// that block autoplay never hear a thing until the player acts. Mute is a plain flag.
export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context !== null;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.16;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone({ type = 'sine', from = 440, to = null, duration = 0.12, delay = 0, volume = 1 }) {
    if (muted || !ensure()) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    if (to !== null) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function noise({ duration = 0.2, delay = 0, volume = 1, lowpass = 1200 }) {
    if (muted || !ensure()) return;
    const start = context.currentTime + delay;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  return {
    unlock() { ensure(); },
    toggleMute() { muted = !muted; return muted; },
    isMuted() { return muted; },
    shoot(kind) {
      if (kind === 'spark') tone({ type: 'square', from: 880, to: 520, duration: 0.07, volume: 0.5 });
      else if (kind === 'frost') tone({ type: 'sine', from: 1320, to: 660, duration: 0.14, volume: 0.45 });
      else tone({ type: 'triangle', from: 220, to: 90, duration: 0.16, volume: 0.8 });
    },
    cannonBoom() { noise({ duration: 0.22, volume: 0.7, lowpass: 700 }); },
    kill() { tone({ type: 'sine', from: 520, to: 780, duration: 0.08, volume: 0.4 }); },
    coin() {
      tone({ type: 'sine', from: 988, duration: 0.07, volume: 0.35 });
      tone({ type: 'sine', from: 1319, duration: 0.1, delay: 0.06, volume: 0.35 });
    },
    leak() { tone({ type: 'sawtooth', from: 180, to: 90, duration: 0.3, volume: 0.7 }); },
    build() {
      tone({ type: 'sine', from: 392, duration: 0.08, volume: 0.5 });
      tone({ type: 'sine', from: 587, duration: 0.1, delay: 0.07, volume: 0.5 });
    },
    upgrade() {
      tone({ type: 'sine', from: 523, duration: 0.08, volume: 0.5 });
      tone({ type: 'sine', from: 659, duration: 0.08, delay: 0.07, volume: 0.5 });
      tone({ type: 'sine', from: 784, duration: 0.12, delay: 0.14, volume: 0.5 });
    },
    horn() {
      tone({ type: 'sawtooth', from: 220, duration: 0.28, volume: 0.5 });
      tone({ type: 'sawtooth', from: 330, duration: 0.34, delay: 0.16, volume: 0.5 });
    },
    victory() {
      [523, 659, 784, 1047].forEach((note, index) => tone({ type: 'sine', from: note, duration: 0.22, delay: index * 0.13, volume: 0.55 }));
    },
    defeat() {
      [392, 330, 262, 196].forEach((note, index) => tone({ type: 'triangle', from: note, duration: 0.3, delay: index * 0.16, volume: 0.55 }));
    },
    click() { tone({ type: 'sine', from: 660, duration: 0.05, volume: 0.3 }); },
  };
}
