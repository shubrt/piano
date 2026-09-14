"use client";

import { useEffect, useRef } from "react";
import type { Scale } from "@/lib/analysis/scale";
import { barOfBeat, type Grid } from "@/lib/grid";
import type { Hand } from "@/lib/notes";
import type { BeatNote, Engine } from "./engine";
import { FIRST_KEY, keyboardLayout, LAST_KEY } from "./keyboard-layout";
import { usePlayer } from "./store";

// Hand colours. Notes on black keys use the darker shade so a narrow bar
// reads as a black key even when it is short.
const LEFT_COLOR = "#4f7be8";
const LEFT_COLOR_BLACK_KEY = "#2d55b5";
const RIGHT_COLOR = "#7fd97f";
const RIGHT_COLOR_BLACK_KEY = "#46a24a";
const KEYBOARD_HEIGHT = 72;
const VISIBLE_BEATS = 8;
// Gap at the end of every note so repeated notes read as two.
const NOTE_GAP_PX = 3;
// Keys in the scale look like a normal keyboard, the rest are grey.
const WHITE_KEY = "#f2f2f2";
const WHITE_KEY_OFF = "#7a7a7a";
const BLACK_KEY = "#000000";
const BLACK_KEY_OFF = "#3c3c3c";

type Props = {
  engine: Engine;
  notes: readonly BeatNote[];
  grid: Grid;
  scale: Scale;
  totalBars: number;
};

// One requestAnimationFrame loop draws bar lines, the notes of the next few
// beats and the keyboard. Nothing but the canvas element lives in the DOM.
export function FallingNotes({ engine, notes, grid, scale, totalBars }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef({ notes, grid, scale, totalBars });
  props.current = { notes, grid, scale, totalBars };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let lastBar = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const { notes, grid, scale, totalBars } = props.current;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const hitY = height - KEYBOARD_HEIGHT;
      const pxPerBeat = hitY / VISIBLE_BEATS;
      const position = engine.position();
      const muted = engine.muted;
      const loop = engine.loop;
      const loopStart = engine.loopStart();
      const inLoop =
        loop !== null && loopStart !== null && position >= loopStart && position < loop.toBeat;

      // In the pre-roll of a loop the header already names the loop's first bar.
      const shown = inLoop && loop && position < loop.fromBeat ? loop.fromBeat : position;
      const bar = Math.min(totalBars, barOfBeat(grid, shown));
      if (bar !== lastBar) {
        lastBar = bar;
        usePlayer.getState().set({ currentBar: bar });
      }

      context.clearRect(0, 0, width, height);
      const keys = keyboardLayout(width);
      const keyByMidi = new Map(keys.map((k) => [k.midi, k]));

      // Beat and bar lines with bar numbers. Pre-roll beats before bar 1 have none.
      const firstBeat = Math.floor(position);
      for (let beat = firstBeat; beat <= position + VISIBLE_BEATS; beat++) {
        const y = hitY - (beat - position) * pxPerBeat;
        if (y < 0 || y > hitY) continue;
        const isBar = beat % grid.beatsPerBar === 0;
        context.strokeStyle = isBar ? "#333" : "#161616";
        context.beginPath();
        context.moveTo(0, y + 0.5);
        context.lineTo(width, y + 0.5);
        context.stroke();
        if (isBar && beat >= 0 && beat / grid.beatsPerBar < totalBars) {
          context.fillStyle = "#666";
          context.font = "12px Menlo, monospace";
          context.fillText(`Takt ${beat / grid.beatsPerBar + 1}`, 6, y - 4);
        }
      }

      // Notes in view, cut off at the hit line. Sounding notes light up their keys.
      // Inside a loop only the loop's notes exist, repeated once per cycle so the
      // next pass falls in during the empty pre-roll bars.
      const sounding = new Map<number, Hand>();
      const to = position + VISIBLE_BEATS;
      const drawNote = (note: BeatNote, shift: number) => {
        const beat = note.beat + shift;
        if (beat > to || beat + note.durationBeats < position) return;
        const key = keyByMidi.get(note.midi);
        if (!key) return;
        // The note keeps falling while it sounds: its top follows the release
        // time, only the part below the hit line is cut off.
        const bottom = Math.min(hitY, hitY - (beat - position) * pxPerBeat);
        const top = Math.max(
          0,
          hitY - (beat + note.durationBeats - position) * pxPerBeat + NOTE_GAP_PX,
        );
        if (bottom <= top) return;
        context.fillStyle = noteColor(note.hand, key.black);
        context.fillRect(key.noteX + 1, top, key.noteWidth - 2, bottom - top);
        if (beat <= position && position < beat + note.durationBeats)
          sounding.set(note.midi, note.hand);
      };
      for (const note of notes) {
        if (muted[note.hand]) continue;
        if (inLoop && loop && loopStart !== null) {
          if (note.beat < loop.fromBeat || note.beat >= loop.toBeat) continue;
          const cycle = loop.toBeat - loopStart;
          for (let shift = 0; note.beat + shift <= to; shift += cycle) drawNote(note, shift);
        } else {
          if (note.beat > to) break;
          drawNote(note, 0);
        }
      }

      // Keyboard: scale tones white and black, the rest grey.
      context.fillStyle = "#000";
      context.fillRect(0, hitY, width, KEYBOARD_HEIGHT);
      for (const key of keys) {
        if (key.black) continue;
        const inScale = scale.pitchClasses.has(key.midi % 12);
        context.fillStyle = keyColor(sounding.get(key.midi), inScale ? WHITE_KEY : WHITE_KEY_OFF);
        context.fillRect(key.x + 0.5, hitY + 1, key.width - 1, KEYBOARD_HEIGHT - 2);
      }
      for (const key of keys) {
        if (!key.black) continue;
        const inScale = scale.pitchClasses.has(key.midi % 12);
        context.fillStyle = keyColor(sounding.get(key.midi), inScale ? BLACK_KEY : BLACK_KEY_OFF);
        context.fillRect(key.x, hitY + 1, key.width, KEYBOARD_HEIGHT * 0.62);
      }
      // Mark middle C.
      const c4 = keyByMidi.get(60);
      if (c4) {
        context.fillStyle = "#000";
        context.beginPath();
        context.arc(c4.x + c4.width / 2, height - 10, 2, 0, Math.PI * 2);
        context.fill();
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [engine]);

  return (
    <div className="stage">
      <canvas ref={canvasRef} aria-label={`Fallende Noten, Tasten ${FIRST_KEY} bis ${LAST_KEY}`} />
    </div>
  );
}

function noteColor(hand: Hand, blackKey: boolean): string {
  if (hand === "left") return blackKey ? LEFT_COLOR_BLACK_KEY : LEFT_COLOR;
  return blackKey ? RIGHT_COLOR_BLACK_KEY : RIGHT_COLOR;
}

function keyColor(hand: Hand | undefined, base: string): string {
  if (hand === "left") return LEFT_COLOR;
  if (hand === "right") return RIGHT_COLOR;
  return base;
}
