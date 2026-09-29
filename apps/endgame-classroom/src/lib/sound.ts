const KEY = "endgame-classroom.sound";

export function soundEnabled() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

let ctx: AudioContext | null = null;

function tone(freqs: number[], duration = 0.08, type: OscillatorType = "sine", gap = 0.07) {
  if (!soundEnabled()) return;
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = type;
      osc.frequency.value = f;
      const start = t0 + i * gap;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    });
  } catch {
    /* audio unavailable */
  }
}

export const sounds = {
  move: () => tone([420], 0.06, "triangle"),
  wrong: () => tone([220, 180], 0.12, "square", 0.1),
  success: () => tone([523, 659, 784, 1047], 0.14, "triangle", 0.09),
};
