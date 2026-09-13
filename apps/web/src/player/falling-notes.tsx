"use client";

import { useEffect, useRef } from "react";
import type { Scale } from "@/lib/analysis/scale";
import { barOfBeat, type Grid } from "@/lib/grid";
import type { Hand } from "@/lib/notes";
import type { BeatNote, Engine } from "./engine";
import { FIRST_KEY, keyboardLayout, LAST_KEY } from "./keyboard-layout";
import { usePlayer } from "./store";

const LEFT_COLOR = "#4f7be8";
const RIGHT_COLOR = "#ffffff";
const KEYBOARD_HEIGHT = 72;
const VISIBLE_BEATS = 8;
const PAST_BEATS = 0.5;

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

      const bar = Math.min(totalBars, barOfBeat(grid, position));
      if (bar !== lastBar) {
        lastBar = bar;
        usePlayer.getState().set({ currentBar: bar });
      }

      context.clearRect(0, 0, width, height);
      const keys = keyboardLayout(width);
      const keyByMidi = new Map(keys.map((k) => [k.midi, k]));

      // Beat and bar lines with bar numbers.
      const firstBeat = Math.floor(position - PAST_BEATS);
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

      // Notes in view. Sounding notes light up their keys.
      const sounding = new Map<number, Hand>();
      const from = position - PAST_BEATS - 16;
      const to = position + VISIBLE_BEATS;
      for (const note of notes) {
        if (note.beat > to) break;
        if (note.beat + note.durationBeats < position - PAST_BEATS) continue;
        if (muted[note.hand]) continue;
        const key = keyByMidi.get(note.midi);
        if (!key || note.beat < from) continue;
        const bottom = hitY - (note.beat - position) * pxPerBeat;
        const top = bottom - note.durationBeats * pxPerBeat;
        const x = key.black ? key.x + 1 : key.x + 2;
        const w = key.black ? key.width - 2 : key.width - 4;
        context.fillStyle = note.hand === "left" ? LEFT_COLOR : RIGHT_COLOR;
        context.globalAlpha = bottom > hitY ? 0.5 : 1;
        context.fillRect(x, Math.max(0, top), w, Math.min(bottom, hitY) - Math.max(0, top));
        context.globalAlpha = 1;
        if (note.beat <= position && position < note.beat + note.durationBeats)
          sounding.set(note.midi, note.hand);
      }

      // Keyboard: scale tones bright, others dark.
      context.fillStyle = "#000";
      context.fillRect(0, hitY, width, KEYBOARD_HEIGHT);
      for (const key of keys) {
        if (key.black) continue;
        const inScale = scale.pitchClasses.has(key.midi % 12);
        context.fillStyle = keyColor(sounding.get(key.midi), inScale ? "#f2f2f2" : "#4a4a4a");
        context.fillRect(key.x + 0.5, hitY + 1, key.width - 1, KEYBOARD_HEIGHT - 2);
      }
      for (const key of keys) {
        if (!key.black) continue;
        const inScale = scale.pitchClasses.has(key.midi % 12);
        context.fillStyle = keyColor(sounding.get(key.midi), inScale ? "#9a9a9a" : "#1c1c1c");
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

function keyColor(hand: Hand | undefined, base: string): string {
  if (hand === "left") return LEFT_COLOR;
  if (hand === "right") return "#7fd97f";
  return base;
}
