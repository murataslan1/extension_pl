let playing = false;

async function beepLoop(durationSec = 30) {
  if (playing) return;
  playing = true;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctor();
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch (_) {}
    }
    const start = ctx.currentTime + 0.05;
    const end = start + durationSec;
    let t = start;
    while (t < end) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = (Math.floor((t - start) * 3) % 2 === 0) ? 880 : 1320;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
      t += 0.4;
    }
    setTimeout(() => {
      try { ctx.close(); } catch (_) {}
      playing = false;
    }, durationSec * 1000 + 500);
  } catch (e) {
    console.error("[passo-avci offscreen] audio fail", e);
    playing = false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PLAY_ALARM") {
    beepLoop(30);
    sendResponse({ ok: true });
  }
  return true;
});
