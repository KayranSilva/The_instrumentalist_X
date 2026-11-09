const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const P = load(["pitch"], "{ detectNotes, detectPitch, midiToName, nameToMidi, midiToFrequency, INSTRUMENT_RANGES }");
const RATE = 44100;
const GUITAR = P.INSTRUMENT_RANGES.guitarra;
// Arrays criados no contexto do vm têm outro protótipo: copia para comparar.
const names = (notes) => Array.from(notes, (note) => note.note);

/** Notas "dedilhadas": ataque curto, decaimento exponencial e 2 harmônicos. */
function synth(notes, totalSeconds, { noise = 0 } = {}) {
  const out = new Float32Array(Math.round(totalSeconds * RATE));
  notes.forEach(({ midi, time, duration }) => {
    const f = P.midiToFrequency(midi);
    const start = Math.round(time * RATE);
    const length = Math.round(duration * RATE);
    for (let i = 0; i < length && start + i < out.length; i += 1) {
      const t = i / RATE;
      const envelope = Math.min(1, t / 0.005) * Math.exp(-t * 3);
      out[start + i] += 0.4 * envelope * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t));
    }
  });
  if (noise) for (let i = 0; i < out.length; i += 1) out[i] += (Math.random() * 2 - 1) * noise;
  return out;
}

function sine(frequency, seconds, amplitude = 0.5) {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i += 1) out[i] = amplitude * Math.sin(2 * Math.PI * frequency * (i / RATE));
  return out;
}

test("nomes de nota", () => {
  assert.equal(P.midiToName(69), "A4");
  assert.equal(P.midiToName(40), "E2");
  assert.equal(P.midiToName(61), "C#4");
  assert.equal(P.nameToMidi("C4"), 60);
  assert.equal(P.nameToMidi("A#3"), 58);
  assert.equal(P.nameToMidi("Bb3"), null);
  assert.equal(P.nameToMidi("E#4"), null);
});

test("senoide A4 440 Hz → A4", () => {
  const notes = P.detectNotes(sine(440, 1), RATE, GUITAR);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].note, "A4");
});

test("senoide E2 82,4 Hz → E2", () => {
  const notes = P.detectNotes(sine(82.41, 1), RATE, GUITAR);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].note, "E2");
});

test("escala de dó maior a 120 BPM: notas e tempos (±15 ms)", () => {
  const scale = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
  const beat = 0.5;
  const input = scale.map((name, i) => ({ midi: P.nameToMidi(name), time: 0.5 + i * beat, duration: beat * 0.95 }));
  const notes = P.detectNotes(synth(input, 5.5, { noise: 0.002 }), RATE, GUITAR);
  assert.deepEqual(names(notes), scale);
  notes.forEach((note, i) => {
    assert.ok(Math.abs(note.time - input[i].time) <= 0.015, `nota ${i + 1}: ${note.time.toFixed(3)} vs ${input[i].time}`);
  });
});

test("escala de dó maior grave (C3–C4) a 180 BPM", () => {
  const scale = ["C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4"];
  const beat = 60 / 180;
  const input = scale.map((name, i) => ({ midi: P.nameToMidi(name), time: 0.3 + i * beat, duration: beat * 0.95 }));
  const notes = P.detectNotes(synth(input, 3.6), RATE, GUITAR);
  assert.deepEqual(names(notes), scale);
  notes.forEach((note, i) => assert.ok(Math.abs(note.time - input[i].time) <= 0.015, `nota ${i + 1}: ${note.time.toFixed(3)} vs ${input[i].time.toFixed(3)}`));
});

test("escala de dó maior com notas ligadas (sem silêncio entre elas)", () => {
  const scale = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
  const input = scale.map((name, i) => ({ midi: P.nameToMidi(name), time: 0.5 + i, duration: 1 }));
  assert.deepEqual(names(P.detectNotes(synth(input, 9), RATE, P.INSTRUMENT_RANGES.piano)), scale);
});

test("taxa de 48 kHz também funciona", () => {
  const out = new Float32Array(48000);
  for (let i = 0; i < out.length; i += 1) out[i] = 0.5 * Math.sin(2 * Math.PI * 261.63 * (i / 48000));
  assert.deepEqual(names(P.detectNotes(out, 48000, GUITAR)), ["C4"]);
});

test("ruído branco → nenhuma nota", () => {
  const noise = new Float32Array(RATE * 2);
  for (let i = 0; i < noise.length; i += 1) noise[i] = (Math.random() * 2 - 1) * 0.3;
  assert.equal(P.detectNotes(noise, RATE, GUITAR).length, 0);
});

test("mesma nota repetida com novo ataque → duas entradas", () => {
  const midi = P.nameToMidi("E4");
  const input = [{ midi, time: 0.2, duration: 0.5 }, { midi, time: 0.7, duration: 0.5 }];
  const notes = P.detectNotes(synth(input, 1.5), RATE, GUITAR);
  assert.deepEqual(names(notes), ["E4", "E4"]);
  assert.ok(Math.abs(notes[1].time - 0.7) <= 0.015, `segunda nota em ${notes[1].time}`);
});

test("nota sustentada não vira duas", () => {
  assert.equal(P.detectNotes(sine(329.63, 2), RATE, GUITAR).length, 1);
});

test("nota fora da faixa do instrumento é descartada", () => {
  // C7 (2093 Hz) está acima do E6 da guitarra, mas é aceita no piano.
  assert.equal(P.detectNotes(sine(2093, 1), RATE, GUITAR).length, 0);
  assert.deepEqual(names(P.detectNotes(sine(2093, 1), RATE, P.INSTRUMENT_RANGES.piano)), ["C7"]);
});

test("nota curta (< 80 ms) é ignorada", () => {
  assert.equal(P.detectNotes(sine(440, 0.05), RATE, GUITAR).length, 0);
});

test("detectPitch num bloco de 2048 amostras", () => {
  assert.equal(P.midiToName(P.detectPitch(sine(196, 2048 / RATE), RATE, GUITAR).midi), "G3");
  assert.equal(P.detectPitch(new Float32Array(2048), RATE, GUITAR).midi, null);
});
