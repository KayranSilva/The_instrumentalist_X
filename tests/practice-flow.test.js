// Fluxo da tela de prática sem navegador: gravação sintética da escala de
// dó maior (contagem de 4 cliques + execução) → detectNotes → scoreAttempt.
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const X = load(["pitch", "exercise-score"], "{ detectNotes, scoreAttempt, nameToMidi, midiToFrequency, INSTRUMENT_RANGES, DIFFICULTIES }");
const RATE = 48000;
const SCALE = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];

function record({ bpm, played, clickLeak = 0, offsetMs = 0 }) {
  const beat = 60 / bpm;
  const countStart = 0.4;
  const start = countStart + 4 * beat;
  const out = new Float32Array(Math.round((start + (SCALE.length + 1) * beat) * RATE));
  // Cliques do metrônomo vazando no microfone (quadrada de 1200 Hz, 30 ms).
  const clicks = [];
  for (let i = 0; i < 4 + SCALE.length; i += 1) clicks.push(i < 4 ? countStart + i * beat : start + (i - 4) * beat);
  if (clickLeak) clicks.forEach((time) => {
    const s = Math.round(time * RATE);
    for (let i = 0; i < 0.03 * RATE; i += 1) out[s + i] += clickLeak * Math.sign(Math.sin(2 * Math.PI * 1200 * (i / RATE))) * Math.exp(-i / (0.008 * RATE));
  });
  played.forEach((name, index) => {
    if (!name) return;
    const f = X.midiToFrequency(X.nameToMidi(name));
    const s = Math.round((start + index * beat + offsetMs / 1000) * RATE);
    for (let i = 0; i < beat * 0.95 * RATE && s + i < out.length; i += 1) {
      const t = i / RATE;
      out[s + i] += 0.3 * Math.min(1, t / 0.004) * Math.exp(-t * 2.5) * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t));
    }
  });
  for (let i = 0; i < out.length; i += 1) out[i] += (Math.random() * 2 - 1) * 0.002;
  return { samples: out, start, clicks };
}

function practice(options) {
  const { samples, start, clicks } = record(options);
  const notes = X.detectNotes(samples, RATE, X.INSTRUMENT_RANGES.violao)
    .filter((note) => !(note.duration < 0.08 && clicks.some((click) => note.time - click >= 0 && note.time - click <= 0.04)));
  return X.scoreAttempt(SCALE, notes, options.bpm, start);
}

for (const difficulty of [{ bpm: 60 }, { bpm: 120 }, { bpm: 180 }]) {
  test(`escala de dó maior perfeita a ${difficulty.bpm} BPM → 100% / 100%`, () => {
    const report = practice({ bpm: difficulty.bpm, played: SCALE });
    assert.equal(report.correctPercent, 100, JSON.stringify(report.problems));
    assert.equal(report.onTimePercent, 100, JSON.stringify(report.problems));
    assert.equal(report.extras, 0);
  });
}

test("cliques vazando pelo alto-falante não viram notas", () => {
  const report = practice({ bpm: 120, played: SCALE, clickLeak: 0.15 });
  assert.equal(report.correctPercent, 100, JSON.stringify(report.problems));
  assert.equal(report.extras, 0);
});

test("errou o Fá (tocou F#) e pulou o Lá", () => {
  const played = SCALE.slice();
  played[3] = "F#4";
  played[5] = null;
  const report = practice({ bpm: 60, played });
  assert.equal(report.results[3].status, "wrong");
  assert.equal(report.results[5].status, "missing");
  assert.equal(report.correct, 6);
});

test("atrasado 130 ms no Difícil → fora do tempo e tendência a atrasar", () => {
  const report = practice({ bpm: 180, played: SCALE, offsetMs: 130 });
  assert.equal(report.correctPercent, 100);
  assert.ok(report.onTimePercent < 60);
  assert.match(report.tendencyMessage, /atrasar/);
});
