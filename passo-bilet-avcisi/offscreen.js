let ctx = null;
let playing = false;

function beepLoop(durationSec = 20) {
  if (playing) return;
  playing = true;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const start = ctx.currentTime;
  const end = start + durationSec;
  let t = start;
  while (t < end) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = (Math.floor((t - start) * 2) % 2 === 0) ? 1000 : 1500;
    gain.gain.value = 0.25;
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
    t += 0.45;
  }
  setTimeout(() => {
    playing = false;
    try { ctx.close(); } catch (_) {}
    ctx = null;
  }, durationSec * 1000 + 500);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PLAY_ALARM") {
    beepLoop(25);
    sendResponse({ ok: true });
  }
  return true;
});
