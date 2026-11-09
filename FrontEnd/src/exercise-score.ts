// Avaliação de uma tentativa do aluno contra o gabarito. Funções puras, sem
// DOM (testadas em tests/exercise-score.test.js). Depende de pitch.js
// (nameToMidi/midiToName), que precisa ser carregado antes.

type DifficultyId = "facil" | "medio" | "dificil";
type Difficulty = { id: DifficultyId; label: string; bpm: number; toleranceMs: number };
type NoteStatus = "ok" | "octave" | "timing" | "wrong" | "missing";
type NoteResult = {
  index: number;
  expected: string;
  played: string | null;
  status: NoteStatus;
  /** Desvio em ms (positivo = atrasado); null quando faltou. */
  deviationMs: number | null;
  octaveShift: number;
};
type AttemptReport = {
  total: number;
  correct: number;
  onTime: number;
  correctPercent: number;
  onTimePercent: number;
  tendencyMs: number | null;
  tendencyMessage: string | null;
  octaveMessage: string | null;
  octaveNotes: string[];
  problems: string[];
  extras: number;
  results: NoteResult[];
  tip: string;
};

const DIFFICULTIES: Difficulty[] = [
  { id: "facil", label: "Fácil", bpm: 60, toleranceMs: 150 },
  { id: "medio", label: "Médio", bpm: 120, toleranceMs: 100 },
  { id: "dificil", label: "Difícil", bpm: 180, toleranceMs: 70 },
];

function difficultyForBpm(bpm: number): Difficulty {
  return DIFFICULTIES.reduce((best, item) => (Math.abs(item.bpm - bpm) < Math.abs(best.bpm - bpm) ? item : best));
}

function percent(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function octaveWord(shift: number): string {
  const amount = Math.abs(shift);
  return `${amount === 1 ? "uma oitava" : `${amount} oitavas`} ${shift > 0 ? "acima" : "abaixo"}`;
}

/** Trecho de até 4 notas com mais problemas, como "3–6" (1-based). */
function worstStretch(results: NoteResult[], isProblem: (result: NoteResult) => boolean): string {
  const size = Math.min(4, results.length);
  let bestStart = 0;
  let bestCount = -1;
  for (let start = 0; start + size <= results.length; start += 1) {
    const count = results.slice(start, start + size).filter(isProblem).length;
    if (count > bestCount) { bestCount = count; bestStart = start; }
  }
  return size <= 1 ? `${bestStart + 1}` : `${bestStart + 1}–${bestStart + size}`;
}

function scoreAttempt(expected: string[], played: DetectedNote[], bpm: number, startTime: number): AttemptReport {
  const difficulty = difficultyForBpm(bpm);
  const beat = 60 / bpm;
  const tolerance = difficulty.toleranceMs / 1000;
  const total = expected.length;

  // Cada nota tocada pertence à janela ±½ tempo do tempo mais próximo.
  const candidates: DetectedNote[][] = expected.map(() => []);
  let extras = 0;
  played.forEach((note) => {
    const index = Math.round((note.time - startTime) / beat);
    if (index >= 0 && index < total) candidates[index].push(note);
  });

  const results: NoteResult[] = expected.map((name, index) => {
    const expectedMidi = nameToMidi(name);
    const beatTime = startTime + index * beat;
    const options = candidates[index];
    if (!options.length || expectedMidi === null) {
      extras += options.length;
      return { index, expected: name, played: null, status: "missing", deviationMs: null, octaveShift: 0 };
    }
    const byDistance = options.slice().sort((a, b) => Math.abs(a.time - beatTime) - Math.abs(b.time - beatTime));
    const chosen = byDistance.find((note) => (note.midi - expectedMidi) % 12 === 0) || byDistance[0];
    extras += options.length - 1;

    const deviation = chosen.time - beatTime;
    const deviationMs = Math.round(deviation * 1000);
    const samePitchClass = (chosen.midi - expectedMidi) % 12 === 0;
    const octaveShift = samePitchClass ? (chosen.midi - expectedMidi) / 12 : 0;
    let status: NoteStatus;
    if (!samePitchClass) status = "wrong";
    else if (Math.abs(deviation) > tolerance) status = "timing";
    else status = octaveShift ? "octave" : "ok";
    return { index, expected: name, played: chosen.note, status, deviationMs, octaveShift };
  });

  const correctResults = results.filter((result) => result.status === "ok" || result.status === "octave" || result.status === "timing");
  const correct = correctResults.length;
  const onTime = correctResults.filter((result) => result.status !== "timing").length;
  const correctPercent = percent(correct, total);
  const onTimePercent = percent(onTime, correct);

  let tendencyMs: number | null = null;
  let tendencyMessage: string | null = null;
  if (correct) {
    tendencyMs = Math.round(correctResults.reduce((sum, result) => sum + (result.deviationMs || 0), 0) / correct);
    if (Math.abs(tendencyMs) > 40) {
      tendencyMessage = tendencyMs > 0
        ? `Você tende a atrasar (+${tendencyMs} ms).`
        : `Você tende a adiantar (${tendencyMs} ms).`;
    }
  }

  // Oitava: se quase tudo foi tocado deslocado pela mesma quantidade, uma mensagem só.
  let octaveMessage: string | null = null;
  const octaveNotes: string[] = [];
  const shifts = new Map<number, number>();
  correctResults.forEach((result) => shifts.set(result.octaveShift, (shifts.get(result.octaveShift) || 0) + 1));
  let commonShift = 0;
  let commonCount = 0;
  shifts.forEach((count, shift) => { if (shift !== 0 && count > commonCount) { commonShift = shift; commonCount = count; } });
  if (commonShift && commonCount >= correct * 0.8) {
    octaveMessage = `Você tocou tudo ${octaveWord(commonShift)}. Não tem problema, mas confira a região do instrumento.`;
  } else {
    correctResults.filter((result) => result.octaveShift).forEach((result) => {
      octaveNotes.push(`Nota ${result.index + 1}: tocou ${result.played} (${octaveWord(result.octaveShift)} de ${result.expected}).`);
    });
  }

  const problems: string[] = [];
  results.forEach((result) => {
    const label = `Nota ${result.index + 1}`;
    if (result.status === "wrong") problems.push(`${label}: tocou ${result.played} em vez de ${result.expected}.`);
    else if (result.status === "missing") problems.push(`${label}: faltou ${result.expected}.`);
    else if (result.status === "timing") {
      const ms = result.deviationMs || 0;
      problems.push(`${label}: ${result.expected} ${ms > 0 ? `atrasada (+${ms} ms)` : `adiantada (${ms} ms)`}.`);
    }
  });

  const isHard = difficulty.id === "dificil";
  let tip: string;
  if (correctPercent >= 90 && onTimePercent >= 80) {
    tip = isHard ? "Exercício dominado!" : "Muito bem! Tente o próximo nível.";
  } else if (correctPercent < 60) {
    const stretch = worstStretch(results, (result) => result.status === "wrong" || result.status === "missing");
    tip = difficulty.id === "facil"
      ? `Continue no Fácil e foque nas notas ${stretch}.`
      : `Volte para o Fácil e foque nas notas ${stretch}.`;
  } else if (onTimePercent < 60) {
    tip = "As notas estão certas; foque no ritmo com o metrônomo.";
  } else {
    tip = `Repita focando nas notas ${worstStretch(results, (result) => result.status === "wrong" || result.status === "missing" || result.status === "timing")}.`;
  }

  return {
    total, correct, onTime, correctPercent, onTimePercent, tendencyMs, tendencyMessage,
    octaveMessage, octaveNotes, problems, extras, results, tip,
  };
}
