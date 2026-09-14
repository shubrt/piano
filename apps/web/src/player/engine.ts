import { SplendidGrandPiano } from "smplr";
import { barStartBeat, beatSeconds, type Grid, timeToBeat } from "@/lib/grid";
import type { Hand, Note } from "@/lib/notes";

export type BeatNote = {
  beat: number;
  durationBeats: number;
  midi: number;
  velocity: number;
  hand: Hand;
};

type Anchor = { beat: number; time: number };

const LOOKAHEAD_SEC = 0.2;
const TICK_MS = 50;

// Empty bars before the music: at the start of the song after pressing play,
// and between two passes of a loop. One place, both cases.
export const PREROLL_BARS = 2;

// Plays notes on the Web Audio clock. Position is a beat number relative to
// bar 1; time <-> beat mapping goes through anchors so tempo changes, seeks and
// loop wraps are a new anchor instead of a rescheduling.
export class Engine {
  private ctx: AudioContext | null = null;
  private piano: ReturnType<typeof SplendidGrandPiano> | null = null;
  private anchors: Anchor[] = [{ beat: 0, time: 0 }];
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduledUntil = 0;
  private notes: BeatNote[] = [];
  private grid: Grid = { bpm: 120, beatsPerBar: 4, offsetSec: 0 };
  private endBeat = 0;
  playing = false;
  tempoPercent = 100;
  muted: Record<Hand, boolean> = { left: false, right: false };
  metronome = false;
  loop: { fromBeat: number; toBeat: number } | null = null;
  onEnded: (() => void) | null = null;

  prerollBeats(): number {
    return PREROLL_BARS * this.grid.beatsPerBar;
  }

  // Start of the empty bars before a loop pass.
  loopStart(): number | null {
    return this.loop ? this.loop.fromBeat - this.prerollBeats() : null;
  }

  // True while the position sits in the loop cycle: pre-roll plus loop bars.
  inLoopCycle(beat: number): boolean {
    return (
      this.loop !== null &&
      beat >= this.loop.fromBeat - this.prerollBeats() - 1e-9 &&
      beat < this.loop.toBeat - 1e-9
    );
  }

  setSong(notes: readonly Note[], grid: Grid, totalBars: number) {
    const beat = this.position();
    this.grid = grid;
    this.notes = notes
      .map((n) => ({
        beat: timeToBeat(grid, n.time),
        durationBeats: n.duration / beatSeconds(grid),
        midi: n.midi,
        velocity: n.velocity,
        hand: n.hand,
      }))
      .sort((a, b) => a.beat - b.beat);
    this.endBeat = barStartBeat(grid, totalBars + 1);
    this.seek(Math.min(beat, this.endBeat));
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  // Beats per second at the current tempo.
  private rate(): number {
    return (this.grid.bpm / 60) * (this.tempoPercent / 100);
  }

  private anchorAt(time: number): Anchor {
    let anchor = this.anchors[0]!;
    for (const a of this.anchors) if (a.time <= time) anchor = a;
    return anchor;
  }

  position(time = this.now()): number {
    const anchor = this.anchorAt(time);
    if (!this.playing) return anchor.beat;
    return Math.min(anchor.beat + (time - anchor.time) * this.rate(), this.endBeat);
  }

  private timeOf(beat: number): number {
    const anchor = this.anchors[this.anchors.length - 1]!;
    return anchor.time + (beat - anchor.beat) / this.rate();
  }

  private pushAnchor(anchor: Anchor) {
    // Keep the anchor that is current now, drop older ones.
    const current = this.anchorAt(this.now());
    this.anchors = [...this.anchors.filter((a) => a === current || a.time > current.time), anchor];
  }

  async play() {
    if (this.playing) return;
    this.ctx ??= new AudioContext();
    this.piano ??= SplendidGrandPiano(this.ctx);
    await this.ctx.resume();
    let beat = this.anchorAt(this.now()).beat;
    // Play from the very beginning starts with empty bars.
    if (beat <= 0) beat = -this.prerollBeats();
    this.anchors = [{ beat, time: this.now() }];
    this.scheduledUntil = beat;
    this.playing = true;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  pause() {
    if (!this.playing) return;
    const beat = this.position();
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.piano?.stop();
    this.anchors = [{ beat, time: this.now() }];
  }

  seek(beat: number) {
    const target = Math.max(-this.prerollBeats(), Math.min(beat, this.endBeat));
    this.piano?.stop();
    this.anchors = [{ beat: target, time: this.now() }];
    this.scheduledUntil = target;
  }

  setTempo(percent: number) {
    const beat = this.position();
    this.tempoPercent = percent;
    if (this.playing) this.pushAnchor({ beat, time: this.now() });
  }

  setLoop(loop: { fromBeat: number; toBeat: number } | null) {
    this.loop = loop;
    this.piano?.stop();
  }

  private tick() {
    if (!this.ctx || !this.piano || !this.playing) return;
    const horizon = this.now() + LOOKAHEAD_SEC;
    // Several wraps per tick keep very short loops seamless.
    for (let guard = 0; guard < 8; guard++) {
      // Outside the loop cycle playback runs on to the end of the song.
      const inLoop = this.inLoopCycle(this.scheduledUntil);
      const limit = inLoop && this.loop ? this.loop.toBeat : this.endBeat;
      const upTo = Math.min(limit, this.beatAtHorizon(horizon));
      if (upTo > this.scheduledUntil) {
        this.scheduleRange(this.scheduledUntil, upTo, inLoop);
        this.scheduledUntil = upTo;
      }
      if (upTo < limit - 1e-9) return;
      if (inLoop && this.loop) {
        // Wrap to the empty bars before the loop, the metronome keeps going.
        const wrapTime = this.timeOf(limit);
        const restart = this.loop.fromBeat - this.prerollBeats();
        this.pushAnchor({ beat: restart, time: wrapTime });
        this.scheduledUntil = restart;
        if (wrapTime >= horizon) return;
      } else {
        this.finish(this.timeOf(limit));
        return;
      }
    }
  }

  private beatAtHorizon(horizon: number): number {
    const anchor = this.anchors[this.anchors.length - 1]!;
    return anchor.beat + (horizon - anchor.time) * this.rate();
  }

  private finish(atTime: number) {
    const delay = Math.max(0, atTime - this.now()) * 1000;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    setTimeout(() => {
      if (!this.playing) return;
      this.playing = false;
      this.anchors = [{ beat: this.endBeat, time: this.now() }];
      this.onEnded?.();
    }, delay);
  }

  // Schedules every note and metronome click with a beat in [from, to). Inside
  // the loop cycle only the loop's own notes sound, the pre-roll bars are silent.
  private scheduleRange(from: number, to: number, inLoop: boolean) {
    if (!this.piano || to <= from) return;
    const rate = this.rate();
    let i = lowerBound(this.notes, from);
    for (; i < this.notes.length && this.notes[i]!.beat < to; i++) {
      const note = this.notes[i]!;
      if (this.muted[note.hand]) continue;
      if (inLoop && this.loop && (note.beat < this.loop.fromBeat || note.beat >= this.loop.toBeat))
        continue;
      this.piano.start({
        note: note.midi,
        velocity: Math.round(note.velocity * 127),
        time: this.timeOf(note.beat),
        duration: Math.max(0.05, note.durationBeats / rate),
      });
    }
    if (this.metronome) {
      for (let beat = Math.ceil(from - 1e-9); beat < to; beat++) {
        this.click(this.timeOf(beat), beat % this.grid.beatsPerBar === 0);
      }
    }
  }

  private click(time: number, accent: boolean) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    gain.gain.setValueAtTime(accent ? 0.35 : 0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  dispose() {
    this.pause();
    void this.ctx?.close();
    this.ctx = null;
    this.piano = null;
  }
}

function lowerBound(notes: readonly BeatNote[], beat: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid]!.beat < beat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
