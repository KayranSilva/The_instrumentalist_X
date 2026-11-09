"use strict";
// Agendamento de cliques do metrônomo e síntese das notas do gabarito
// ("Ouvir") via Web Audio. Depende de pitch.js (nameToMidi/midiToFrequency).
const Metronome = (() => {
    "use strict";
    function createContext() {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        return new Ctor({ latencyHint: "interactive" });
    }
    /** Guarda os nós agendados para poder cancelar tudo de uma vez. */
    class Scheduler {
        constructor(ctx) {
            this.nodes = [];
            this.ctx = ctx;
        }
        track(node) {
            this.nodes.push(node);
            node.addEventListener("ended", () => { this.nodes = this.nodes.filter((item) => item !== node); });
        }
        /** Clique curto (o acento é mais agudo). */
        click(time, accent = false) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = "square";
            osc.frequency.value = accent ? 1800 : 1200;
            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.22, time + 0.002);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
            osc.connect(gain).connect(this.ctx.destination);
            osc.start(time);
            osc.stop(time + 0.04);
            this.track(osc);
        }
        /** Nota "dedilhada": fundamental + harmônico com decaimento. */
        tone(midi, time, duration) {
            const frequency = midiToFrequency(midi);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.exponentialRampToValueAtTime(0.3, time + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.1, duration));
            gain.connect(this.ctx.destination);
            [1, 2].forEach((harmonic, index) => {
                const osc = this.ctx.createOscillator();
                const level = this.ctx.createGain();
                osc.type = index ? "sine" : "triangle";
                osc.frequency.value = frequency * harmonic;
                level.gain.value = index ? 0.25 : 1;
                osc.connect(level).connect(gain);
                osc.start(time);
                osc.stop(time + duration + 0.05);
                this.track(osc);
            });
        }
        stopAll() {
            this.nodes.forEach((node) => { try {
                node.stop();
            }
            catch ( /* já parado */_a) { /* já parado */ } });
            this.nodes = [];
        }
    }
    /** Toca o gabarito no BPM dado, uma nota por tempo. Devolve o horário de término. */
    function playNotes(scheduler, notes, bpm, startAt) {
        const beat = 60 / bpm;
        const start = startAt !== null && startAt !== void 0 ? startAt : scheduler.ctx.currentTime + 0.1;
        notes.forEach((name, index) => {
            const midi = nameToMidi(name);
            if (midi !== null)
                scheduler.tone(midi, start + index * beat, beat * 0.9);
        });
        return start + notes.length * beat;
    }
    /** Cliques de `count` tempos a partir de `start`; acento a cada `accentEvery`. */
    function clicks(scheduler, start, count, bpm, accentEvery = 4) {
        const beat = 60 / bpm;
        const times = [];
        for (let i = 0; i < count; i += 1) {
            const time = start + i * beat;
            scheduler.click(time, i % accentEvery === 0);
            times.push(time);
        }
        return times;
    }
    return { createContext, Scheduler, playNotes, clicks };
})();
