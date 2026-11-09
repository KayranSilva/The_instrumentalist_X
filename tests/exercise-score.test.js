const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");

const S = load(["pitch", "exercise-score"], "{ scoreAttempt, nameToMidi }");
const SCALE = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
const START = 2;

function play(names, bpm, { offsetMs = 0 } = {}) {
  return names.map((name, i) => name && ({
    note: name, midi: S.nameToMidi(name), time: START + (i * 60) / bpm + offsetMs / 1000, duration: 0.3, clarity: 0.95,
  })).filter(Boolean);
}

test("execução perfeita → 100% / 100%", () => {
  const report = S.scoreAttempt(SCALE, play(SCALE, 120), 120, START);
  assert.equal(report.correctPercent, 100);
  assert.equal(report.onTimePercent, 100);
  assert.equal(report.problems.length, 0);
  assert.equal(report.extras, 0);
  assert.equal(report.tip, "Muito bem! Tente o próximo nível.");
  assert.ok(report.results.every((r) => r.status === "ok"));
});

test("perfeita no Difícil → exercício dominado", () => {
  assert.equal(S.scoreAttempt(SCALE, play(SCALE, 180), 180, START).tip, "Exercício dominado!");
});

test("atraso de 200 ms no Médio → fora do tempo", () => {
  const report = S.scoreAttempt(SCALE, play(SCALE, 120, { offsetMs: 200 }), 120, START);
  assert.equal(report.correctPercent, 100);
  assert.equal(report.onTimePercent, 0);
  assert.ok(report.results.every((r) => r.status === "timing"));
  assert.equal(report.tendencyMs, 200);
  assert.match(report.tendencyMessage, /atrasar/);
  assert.equal(report.tip, "As notas estão certas; foque no ritmo com o metrônomo.");
});

test("atraso de 80 ms no Médio ainda está no tempo, mas mostra tendência", () => {
  const report = S.scoreAttempt(SCALE, play(SCALE, 120, { offsetMs: 80 }), 120, START);
  assert.equal(report.onTimePercent, 100);
  assert.match(report.tendencyMessage, /\+80 ms/);
});

test("nota pulada → faltou", () => {
  const notes = SCALE.slice();
  notes[3] = null;
  const report = S.scoreAttempt(SCALE, play(notes, 120), 120, START);
  assert.equal(report.results[3].status, "missing");
  assert.equal(report.correct, 7);
  assert.ok(report.problems.includes("Nota 4: faltou F4."));
});

test("nota trocada → errada", () => {
  const notes = SCALE.slice();
  notes[2] = "F4";
  const report = S.scoreAttempt(SCALE, play(notes, 60), 60, START);
  assert.equal(report.results[2].status, "wrong");
  assert.ok(report.problems.includes("Nota 3: tocou F4 em vez de E4."));
});

test("escala inteira uma oitava acima → 100% + mensagem única", () => {
  const up = SCALE.map((n) => n.replace(/\d/, (d) => String(Number(d) + 1)));
  const report = S.scoreAttempt(SCALE, play(up, 120), 120, START);
  assert.equal(report.correctPercent, 100);
  assert.match(report.octaveMessage, /uma oitava acima/);
  assert.equal(report.octaveNotes.length, 0);
  assert.ok(report.results.every((r) => r.status === "octave"));
});

test("uma nota só na oitava errada → aviso por nota, não erro", () => {
  const notes = SCALE.slice();
  notes[1] = "D5";
  const report = S.scoreAttempt(SCALE, play(notes, 120), 120, START);
  assert.equal(report.correctPercent, 100);
  assert.equal(report.octaveMessage, null);
  assert.equal(report.octaveNotes.length, 1);
  assert.equal(report.problems.length, 0);
});

test("nota extra → contada como extra sem afetar as demais", () => {
  const played = play(SCALE, 120);
  played.push({ note: "G#4", midi: S.nameToMidi("G#4"), time: START + 1.2, duration: 0.1, clarity: 0.9 });
  const report = S.scoreAttempt(SCALE, played, 120, START);
  assert.equal(report.extras, 1);
  assert.equal(report.correctPercent, 100);
  assert.equal(report.onTimePercent, 100);
});

test("prefere a nota certa quando há várias na janela", () => {
  const played = play(SCALE, 60);
  played.push({ note: "C#4", midi: S.nameToMidi("C#4"), time: START + 0.01, duration: 0.1, clarity: 0.9 });
  const report = S.scoreAttempt(SCALE, played, 60, START);
  assert.equal(report.results[0].status, "ok");
  assert.equal(report.extras, 1);
});

test("muitos erros → volta para o Fácil focando no pior trecho", () => {
  const report = S.scoreAttempt(SCALE, play(["C4", "D4", "E4", "F4", null, null, null, null], 120), 120, START);
  assert.equal(report.correctPercent, 50);
  assert.equal(report.tip, "Volte para o Fácil e foque nas notas 5–8.");
});

test("caso geral → repetir focando no trecho", () => {
  const notes = SCALE.slice();
  notes[6] = "A4";
  const report = S.scoreAttempt(SCALE, play(notes, 120), 120, START);
  assert.equal(report.correctPercent, 88);
  assert.equal(report.tip, "Repita focando nas notas 4–7.");
});

test("notas na contagem (antes do 1º tempo) são ignoradas", () => {
  const played = play(SCALE, 120);
  played.unshift({ note: "E2", midi: 40, time: START - 1.5, duration: 0.3, clarity: 0.9 });
  assert.equal(S.scoreAttempt(SCALE, played, 120, START).extras, 0);
});
