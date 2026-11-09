"use strict";
// Detecção de notas (monofônica) com YIN, sem dependências e sem DOM.
// Carregado como script global antes de admin.js / practice.js; os testes
// (tests/pitch.test.js) executam o .js compilado direto no Node.
// Para trocar o algoritmo (ex.: Basic Pitch), basta manter estas assinaturas.
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_NAME_PATTERN = /^(C|C#|D|D#|E|F|F#|G|G#|A|A#|B)([0-8])$/;
/** Faixa de cada instrumento (MIDI). Bateria e composição não têm exercício. */
const INSTRUMENT_RANGES = {
    violao: { min: 40, max: 88 }, // E2–E6
    guitarra: { min: 40, max: 88 }, // E2–E6
    ukulele: { min: 55, max: 81 }, // G3–A5
    violino: { min: 55, max: 100 }, // G3–E7
    canto: { min: 40, max: 84 }, // E2–C6
    piano: { min: 21, max: 108 }, // A0–C8
};
const PITCH_SETTINGS = {
    frameSeconds: 2048 / 44100, // ~46 ms
    hopSeconds: 512 / 44100, // ~11,6 ms
    yinThreshold: 0.15,
    minClarity: 0.8,
    minNoteSeconds: 0.08,
    attackRatio: 2, // +6 dB
    fallRatio: 0.7, // queda mínima antes de um novo ataque
    minNoiseFloor: 0.004,
};
function midiToName(midi) {
    return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
function nameToMidi(name) {
    const match = NOTE_NAME_PATTERN.exec(name);
    if (!match)
        return null;
    return (Number(match[2]) + 1) * 12 + NOTE_NAMES.indexOf(match[1]);
}
function frequencyToMidi(frequency) {
    return Math.round(69 + 12 * Math.log2(frequency / 440));
}
function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}
function instrumentRange(slug) {
    return INSTRUMENT_RANGES[slug] || null;
}
/** Fator de redução da taxa: mantém ≥ 4× a nota mais aguda da faixa. */
function decimationFactor(sampleRate, range) {
    const needed = Math.max(11025, midiToFrequency(range.max) * 4);
    return Math.max(1, Math.floor(sampleRate / needed));
}
/** Passa-baixa simples (duas médias móveis) seguido de decimação. */
function decimate(samples, factor) {
    if (factor <= 1)
        return samples;
    const once = new Float32Array(samples.length);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
        sum += samples[i];
        if (i >= factor)
            sum -= samples[i - factor];
        once[i] = sum / factor;
    }
    const out = new Float32Array(Math.floor(samples.length / factor));
    sum = 0;
    let j = 0;
    for (let i = 0; i < once.length && j < out.length; i += 1) {
        sum += once[i];
        if (i >= factor)
            sum -= once[i - factor];
        if ((i + 1) % factor === 0) {
            out[j] = sum / factor;
            j += 1;
        }
    }
    return out;
}
function createAnalyzer(rate, range) {
    const maxTau = Math.ceil(rate / (midiToFrequency(range.min) * Math.pow(2, -1 / 12))) + 1;
    const frameLength = Math.max(Math.round(PITCH_SETTINGS.frameSeconds * rate), maxTau * 2 + 2);
    return {
        rate,
        frameLength,
        hop: Math.max(1, Math.round(PITCH_SETTINGS.hopSeconds * rate)),
        maxTau,
        diff: new Float32Array(maxTau + 2),
    };
}
function frameRms(samples, start, length) {
    let sum = 0;
    for (let i = start; i < start + length; i += 1)
        sum += samples[i] * samples[i];
    return Math.sqrt(sum / length);
}
/** YIN num quadro. Devolve o MIDI dentro da faixa (ou null) e a clareza 1 − d'(τ). */
function yinFrame(samples, start, analyzer, range) {
    const { maxTau, frameLength, diff, rate } = analyzer;
    const width = frameLength - maxTau;
    for (let tau = 1; tau <= maxTau; tau += 1) {
        let sum = 0;
        for (let j = start; j < start + width; j += 1) {
            const delta = samples[j] - samples[j + tau];
            sum += delta * delta;
        }
        diff[tau] = sum;
    }
    // Diferença média normalizada cumulativa, d'(τ).
    diff[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxTau; tau += 1) {
        running += diff[tau];
        diff[tau] = running > 0 ? (diff[tau] * tau) / running : 1;
    }
    // Busca desde τ = 2 (e não só na faixa): uma nota acima da faixa precisa
    // ser reconhecida como tal, e não confundida com a oitava de baixo.
    let best = -1;
    for (let tau = 2; tau <= maxTau; tau += 1) {
        if (diff[tau] < PITCH_SETTINGS.yinThreshold) {
            while (tau + 1 <= maxTau && diff[tau + 1] < diff[tau])
                tau += 1;
            best = tau;
            break;
        }
    }
    if (best < 0) {
        // Sem mínimo abaixo do limiar: usa o mínimo global (a clareza decide).
        best = 2;
        for (let tau = 3; tau <= maxTau; tau += 1)
            if (diff[tau] < diff[best])
                best = tau;
    }
    let refined = best;
    let value = diff[best];
    if (best > 1 && best < maxTau) {
        const a = diff[best - 1];
        const b = diff[best];
        const c = diff[best + 1];
        const denominator = a - 2 * b + c;
        if (denominator > 0) {
            const shift = (a - c) / (2 * denominator);
            refined = best + shift;
            value = b - ((a - c) * shift) / 4;
        }
    }
    const clarity = 1 - Math.max(0, Math.min(1, value));
    if (clarity < PITCH_SETTINGS.minClarity)
        return { midi: null, clarity };
    const midi = frequencyToMidi(rate / refined);
    return { midi: midi >= range.min && midi <= range.max ? midi : null, clarity };
}
/** Converte o áudio em quadros de altura. `from`/`to` permitem processar em blocos. */
function analyzeFrames(samples, analyzer, range, from, to, out) {
    for (let index = from; index < to; index += 1) {
        const start = index * analyzer.hop;
        const rms = frameRms(samples, start, analyzer.frameLength);
        const { midi, clarity } = rms > 0 ? yinFrame(samples, start, analyzer, range) : { midi: null, clarity: 0 };
        out.push({ time: start / analyzer.rate, midi, rms, clarity });
    }
}
function frameCount(samples, analyzer) {
    return Math.max(0, Math.floor((samples.length - analyzer.frameLength) / analyzer.hop) + 1);
}
/** Piso de ruído: o maior entre um mínimo fixo e 1,5× o 10º percentil do RMS. */
function estimateNoiseFloor(frames, fixed) {
    if (fixed !== undefined)
        return fixed;
    if (!frames.length)
        return PITCH_SETTINGS.minNoiseFloor;
    const sorted = frames.map((frame) => frame.rms).sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)];
    return Math.min(0.02, Math.max(PITCH_SETTINGS.minNoiseFloor, p10 * 1.5));
}
/** Filtro de moda (5 quadros) para eliminar trocas de nota de um único quadro. */
function smoothMidi(values) {
    return values.map((_, index) => {
        const counts = new Map();
        for (let k = Math.max(0, index - 2); k <= Math.min(values.length - 1, index + 2); k += 1) {
            counts.set(values[k], (counts.get(values[k]) || 0) + 1);
        }
        let winner = values[index];
        let best = counts.get(winner) || 0;
        counts.forEach((count, value) => { if (count > best) {
            best = count;
            winner = value;
        } });
        return winner;
    });
}
/** O quadro reconhece a nota antes do ataque estar no início da janela; o
 *  início real é onde a energia sobe (até 20% do pico). Sem subida (notas
 *  ligadas), usa o meio do quadro, onde a nota nova passa a dominar. */
function refineOnset(data, analyzer, time) {
    const { rate, frameLength, maxTau } = analyzer;
    const block = Math.max(Math.round(0.0025 * rate), Math.ceil(maxTau / 2));
    const frameStart = Math.round(time * rate);
    const from = Math.max(0, frameStart - frameLength);
    const to = Math.min(data.length, frameStart + 2 * frameLength + block);
    const energy = [];
    for (let start = from; start + block <= to; start += block) {
        let sum = 0;
        for (let i = start; i < start + block; i += 1)
            sum += data[i] * data[i];
        energy.push(sum);
    }
    const firstInFrame = Math.ceil((frameStart - from) / block);
    let peak = firstInFrame;
    for (let k = firstInFrame; k < energy.length; k += 1)
        if (energy[k] > energy[peak])
            peak = k;
    if (!(energy[peak] > 0))
        return time;
    let k = peak;
    while (k > 0 && energy[k - 1] >= energy[peak] * 0.2)
        k -= 1;
    if (k === 0 && from > 0)
        return time + frameLength / rate / 2;
    return (from + k * block) / rate;
}
/** Agrupa quadros em notas: mesmo MIDI por ≥ 80 ms; nota repetida só com novo ataque. */
function segmentFrames(frames, hopSeconds, options = {}, onset = (time) => time) {
    const floor = estimateNoiseFloor(frames, options.noiseFloor);
    const midi = smoothMidi(frames.map((frame) => (frame.rms >= floor ? frame.midi : null)));
    const minFrames = Math.max(2, Math.ceil(PITCH_SETTINGS.minNoteSeconds / hopSeconds));
    const runs = [];
    for (let i = 0; i < midi.length;) {
        const value = midi[i];
        let j = i;
        while (j < midi.length && midi[j] === value)
            j += 1;
        if (value !== null && j - i >= minFrames)
            runs.push({ midi: value, start: i, end: j });
        i = j;
    }
    // 2) Sequências vizinhas da mesma nota são unidas; o ataque decide se viram duas.
    const notes = [];
    const maxGapFrames = Math.ceil(0.25 / hopSeconds);
    const emit = (value, start, end) => {
        let first = start;
        while (first < end && midi[first] !== value)
            first += 1;
        let stable = 0;
        let claritySum = 0;
        for (let k = first; k < end; k += 1)
            if (midi[k] === value) {
                stable += 1;
                claritySum += frames[k].clarity;
            }
        if (stable < minFrames)
            return;
        let last = end - 1;
        while (last > first && midi[last] !== value)
            last -= 1;
        const time = onset(frames[first].time);
        notes.push({
            note: midiToName(value),
            midi: value,
            time,
            duration: Math.max(hopSeconds, frames[last].time + hopSeconds - time),
            clarity: claritySum / stable,
        });
    };
    for (let r = 0; r < runs.length;) {
        let s = r;
        while (s + 1 < runs.length && runs[s + 1].midi === runs[r].midi && runs[s + 1].start - runs[s].end <= maxGapFrames)
            s += 1;
        const start = runs[r].start;
        const end = runs[s].end;
        let pieceStart = start;
        let peak = frames[start].rms;
        let valley = Infinity;
        let valleyIndex = -1;
        for (let i = start + 1; i < end; i += 1) {
            const level = frames[i].rms;
            if (valleyIndex < 0) {
                if (level >= peak)
                    peak = level;
                else {
                    valley = level;
                    valleyIndex = i;
                }
            }
            else if (level < valley) {
                valley = level;
                valleyIndex = i;
            }
            else if (level >= valley * PITCH_SETTINGS.attackRatio && valley <= peak * PITCH_SETTINGS.fallRatio && valleyIndex - pieceStart >= minFrames) {
                emit(runs[r].midi, pieceStart, valleyIndex);
                pieceStart = valleyIndex;
                peak = level;
                valley = Infinity;
                valleyIndex = -1;
            }
            else if (level > peak) {
                peak = level;
                valleyIndex = -1;
            }
        }
        emit(runs[r].midi, pieceStart, end);
        r = s + 1;
    }
    return notes;
}
function prepare(samples, sampleRate, range) {
    const factor = decimationFactor(sampleRate, range);
    const data = decimate(samples, factor);
    return { data, analyzer: createAnalyzer(sampleRate / factor, range) };
}
/** Detecta as notas de uma gravação mono. `time` em segundos desde a amostra 0. */
function detectNotes(samples, sampleRate, range, options = {}) {
    const { data, analyzer } = prepare(samples, sampleRate, range);
    const frames = [];
    analyzeFrames(data, analyzer, range, 0, frameCount(data, analyzer), frames);
    return segmentFrames(frames, analyzer.hop / analyzer.rate, options, (time) => refineOnset(data, analyzer, time));
}
/** Igual a detectNotes, mas em blocos, cedendo a vez à tela e informando o progresso (0–1). */
async function detectNotesAsync(samples, sampleRate, range, onProgress, options = {}) {
    const { data, analyzer } = prepare(samples, sampleRate, range);
    const total = frameCount(data, analyzer);
    const frames = [];
    const block = 400;
    for (let from = 0; from < total; from += block) {
        analyzeFrames(data, analyzer, range, from, Math.min(total, from + block), frames);
        if (onProgress)
            onProgress(Math.min(1, (from + block) / Math.max(1, total)));
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return segmentFrames(frames, analyzer.hop / analyzer.rate, options, (time) => refineOnset(data, analyzer, time));
}
/** Altura de um único bloco (teste de microfone). */
function detectPitch(samples, sampleRate, range) {
    const { data, analyzer } = prepare(samples, sampleRate, range);
    const usable = Math.min(data.length, analyzer.frameLength);
    const rms = frameRms(data, 0, usable);
    if (data.length < analyzer.frameLength || rms < PITCH_SETTINGS.minNoiseFloor)
        return { midi: null, clarity: 0, rms };
    return Object.assign(Object.assign({}, yinFrame(data, 0, analyzer, range)), { rms });
}
/** Mistura todos os canais de um AudioBuffer em mono. */
function mixToMono(channels) {
    if (channels.length === 1)
        return channels[0];
    const out = new Float32Array(channels[0].length);
    channels.forEach((channel) => { for (let i = 0; i < out.length; i += 1)
        out[i] += channel[i] / channels.length; });
    return out;
}
