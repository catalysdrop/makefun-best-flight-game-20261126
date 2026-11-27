// Ridge Runner — sound.
// Every sound is synthesised with WebAudio: engine hum, wind, ring chimes,
// the landing beep and the crash thud. No audio files, no network. The context
// starts on the first user gesture; until then everything is silent.

function makeAudio() {
  let ctx = null, engineOsc = null, engineGain = null, windGain = null, windSrc = null;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Engine: two detuned saws through a low-pass, gain follows throttle.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 55 * 1.01;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filt); osc2.connect(filt);
      filt.connect(engineGain); engineGain.connect(ctx.destination);
      engineOsc.start(); osc2.start();
      engineOsc._twin = osc2;
      // Wind: looped noise buffer through a band-pass.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf; windSrc.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.6;
      windGain = ctx.createGain(); windGain.gain.value = 0;
      windSrc.connect(bp); bp.connect(windGain); windGain.connect(ctx.destination);
      windSrc.start();
      started = true;
      return true;
    } catch (e) { return false; }
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  // Called every frame: throttle 0..1, speed m/s, airborne bool.
  function update(throttle, speed, airborne) {
    if (!ctx || !started) return;
    const t = ctx.currentTime;
    const rpm = 40 + throttle * 90;
    engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    if (engineOsc._twin) engineOsc._twin.frequency.setTargetAtTime(rpm * 1.01, t, 0.08);
    engineGain.gain.setTargetAtTime(airborne ? 0.05 + throttle * 0.05 : 0.02 + throttle * 0.04, t, 0.1);
    windGain.gain.setTargetAtTime(clamp(speed / 90, 0, 1) * 0.09, t, 0.15);
  }

  function blip(freq, dur, type, vol, when) {
    if (!ctx || !started) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function ringChime() {
    blip(880, 0.35, 'sine', 0.22, 0);
    blip(1318, 0.45, 'sine', 0.16, 0.09);
  }
  function landingBeep() {
    blip(660, 0.12, 'square', 0.1, 0);
    blip(660, 0.12, 'square', 0.1, 0.18);
    blip(990, 0.3, 'square', 0.1, 0.36);
  }
  function crashThud() {
    if (!ctx || !started) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.4);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.55);
  }
  function dropThud() { blip(220, 0.2, 'triangle', 0.2, 0); }

  return { ensure, resume, update, ringChime, landingBeep, crashThud, dropThud };
}
