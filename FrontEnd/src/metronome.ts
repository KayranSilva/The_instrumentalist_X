// Agendamento de cliques do metrônomo e síntese das notas do gabarito
// ("Ouvir") via Web Audio. Depende de pitch.js (nameToMidi/midiToFrequency).

const Metronome = (() => {
  "use strict";

  type Scheduled = { stop(): void };

  function createContext(): AudioContext {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    return new Ctor({ latencyHint: "interactive" });
  }

  /** Guarda os nós agendados para poder cancelar tudo de uma vez. */
  class Scheduler {
    readonly ctx: AudioContext;
    private nodes: AudioScheduledSourceNode[] = [];

    constructor(ctx: AudioContext) { this.ctx = ctx; }

    private track(node: AudioScheduledSourceNode): void {
      this.nodes.push(node);
      node.addEventListener("ended", () => { this.nodes = this.nodes.filter((item) => item !== node); });
    }

    /** Clique curto (o acento é mais agudo). */
    click(time: number, accent = false): void {
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
    tone(midi: number, time: number, duration: number): void {
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

    stopAll(): void {
      this.nodes.forEach((node) => { try { node.stop(); } catch { /* já parado */ } });
      this.nodes = [];
    }
  }

  /** Toca o gabarito no BPM dado, uma nota por tempo. Devolve o horário de término. */
  function playNotes(scheduler: Scheduler, notes: string[], bpm: number, startAt?: number): number {
    const beat = 60 / bpm;
    const start = startAt ?? scheduler.ctx.currentTime + 0.1;
    notes.forEach((name, index) => {
      const midi = nameToMidi(name);
      if (midi !== null) scheduler.tone(midi, start + index * beat, beat * 0.9);
    });
    return start + notes.length * beat;
  }

  /** Cliques de `count` tempos a partir de `start`; acento a cada `accentEvery`. */
  function clicks(scheduler: Scheduler, start: number, count: number, bpm: number, accentEvery = 4): number[] {
    const beat = 60 / bpm;
    const times: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const time = start + i * beat;
      scheduler.click(time, i % accentEvery === 0);
      times.push(time);
    }
    return times;
  }

  return { createContext, Scheduler, playNotes, clicks };
})();

type MetronomeScheduler = InstanceType<typeof Metronome.Scheduler>;
