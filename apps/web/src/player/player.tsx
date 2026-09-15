"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyseNotes } from "@/lib/analysis";
import { scaleName } from "@/lib/analysis/scale";
import { type Block, blockRepeats, blocksOfPart, effectiveParts } from "@/lib/blocks";
import { barOfBeat, barStartBeat, beatSeconds, timeToBeat } from "@/lib/grid";
import { parseMidi, type ParsedMidi } from "@/lib/midi";
import { assignHands } from "@/lib/notes";
import { assignFingering } from "@/lib/fingering";
import { type Part, type Song, SongSchema, type SongPatch } from "@/lib/song";
import { Corrections } from "./corrections";
import { type BeatNote, Engine } from "./engine";
import { FallingNotes } from "./falling-notes";
import { type Loop, TEMPO_MAX, TEMPO_MIN, TEMPO_STEP, usePlayer } from "./store";
import { StructureBar } from "./structure-bar";
import { SourceLink } from "@/app/source-link";

export function Player({ initialSong }: { initialSong: Song }) {
  const [song, setSong] = useState(initialSong);
  const [parsed, setParsed] = useState<ParsedMidi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const state = usePlayer();

  // Load and parse the MIDI once in the browser.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/songs/${song.id}/midi`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`MIDI konnte nicht geladen werden (${r.status})`);
        return parseMidi(new Uint8Array(await r.arrayBuffer()));
      })
      .then((p) => {
        if (!cancelled) setParsed(p);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [song.id]);

  // Everything derived from notes and grid. Recomputed when a correction field changes.
  const derived = useMemo(() => {
    if (!parsed) return null;
    const notes = assignHands(parsed, song.hands, song);
    const analysis = analyseNotes(song, notes);
    const parts = effectiveParts(song.parts, analysis.totalBars);
    const blocks = parts.flatMap((part, i) => blocksOfPart(part, i));
    const fingers = assignFingering(notes);
    const beatNotes: BeatNote[] = notes
      .map((n, i) => ({
        finger: fingers[i],
        beat: timeToBeat(song, n.time),
        durationBeats: n.duration / beatSeconds(song),
        midi: n.midi,
        velocity: n.velocity,
        hand: n.hand,
      }))
      .sort((a, b) => a.beat - b.beat);
    return {
      notes,
      beatNotes,
      analysis,
      parts,
      blocks,
      repeats: blockRepeats(blocks, analysis.fingerprints),
    };
  }, [parsed, song]);

  const engine = useMemo(() => {
    engineRef.current?.dispose();
    const e = new Engine();
    e.onEnded = () => usePlayer.getState().set({ playing: false });
    engineRef.current = e;
    return e;
  }, []);
  useEffect(() => () => engine.dispose(), [engine]);

  useEffect(() => {
    if (derived) engine.setSong(derived.notes, song, derived.analysis.totalBars);
  }, [engine, derived, song]);

  const setLoop = useCallback(
    (loop: Loop | null, jump: boolean) => {
      engine.setLoop(
        loop
          ? {
              fromBeat: barStartBeat(song, loop.fromBar),
              toBeat: barStartBeat(song, loop.toBar + 1),
            }
          : null,
      );
      // A loop starts with its empty pre-roll bars, like every later pass.
      if (loop && jump) engine.seek(barStartBeat(song, loop.fromBar) - engine.prerollBeats());
      usePlayer.getState().set({ loop });
    },
    [engine, song],
  );

  const loopBlock = useCallback(
    (block: Block, jump = true) => {
      if (!derived) return;
      const part = derived.parts[block.partIndex];
      const repeat = derived.repeats[derived.blocks.indexOf(block)];
      const suffix =
        repeat?.all !== null && repeat?.all !== undefined
          ? ` · wie Block ${repeat.all}`
          : repeat?.left !== null && repeat?.left !== undefined
            ? ` · links wie Block ${repeat.left}`
            : "";
      setLoop(
        {
          fromBar: block.fromBar,
          toBar: block.toBar,
          label: `${part?.name ?? ""}, Block ${block.index} (Takte ${block.fromBar} bis ${block.toBar})${suffix}`,
        },
        jump,
      );
    },
    [derived, setLoop],
  );

  const loopPart = useCallback(
    (part: Part) =>
      setLoop(
        {
          fromBar: part.fromBar,
          toBar: part.toBar,
          label: `${part.name} (Takte ${part.fromBar} bis ${part.toBar})`,
        },
        true,
      ),
    [setLoop],
  );

  const patchSong = useCallback(
    async (patch: SongPatch) => {
      const response = await fetch(`/api/songs/${song.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (response.ok) {
        setSong(SongSchema.parse(await response.json()));
        setLoop(null, false);
      }
    },
    [song.id, setLoop],
  );

  const reanalyze = useCallback(async () => {
    const response = await fetch(`/api/songs/${song.id}/analyze`, { method: "POST" });
    if (response.ok) {
      setSong(SongSchema.parse(await response.json()));
      setLoop(null, false);
    }
  }, [song.id, setLoop]);

  // Keyboard control. Everything the player does is reachable from here.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
        return;
      if (!derived) return;
      const store = usePlayer.getState();
      const { totalBars } = derived.analysis;
      const bar = Math.min(totalBars, barOfBeat(song, engine.position()));
      // Stepping back past bar 1 lands in the empty bar before it.
      const jumpToBar = (target: number) =>
        engine.seek(
          target < 1 ? -engine.prerollBeats() : barStartBeat(song, Math.min(totalBars, target)),
        );
      const moveBlock = (direction: 1 | -1) => {
        const index = derived.blocks.findIndex((b) => bar >= b.fromBar && bar <= b.toBar);
        const next = derived.blocks[index + direction];
        if (!next) return;
        if (store.loop) loopBlock(next);
        else jumpToBar(next.fromBar);
      };
      switch (event.key) {
        case " ":
          event.preventDefault();
          if (store.playing) {
            engine.pause();
            store.set({ playing: false });
          } else {
            store.set({ playing: true });
            void engine.play();
          }
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (event.shiftKey) moveBlock(-1);
          else jumpToBar(bar - 1);
          break;
        case "ArrowRight":
          event.preventDefault();
          if (event.shiftKey) moveBlock(1);
          else jumpToBar(bar + 1);
          break;
        case "ArrowUp":
        case "ArrowDown": {
          event.preventDefault();
          const delta = event.key === "ArrowDown" ? -TEMPO_STEP : TEMPO_STEP;
          const tempoPercent = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, store.tempoPercent + delta));
          engine.setTempo(tempoPercent);
          store.set({ tempoPercent });
          break;
        }
        case "l":
        case "L":
        case "r":
        case "R": {
          const hand = event.key.toLowerCase() === "l" ? "left" : "right";
          const muted = { ...store.muted, [hand]: !store.muted[hand] };
          engine.muted = muted;
          store.set({ muted });
          break;
        }
        case "m":
        case "M":
          engine.metronome = !store.metronome;
          store.set({ metronome: engine.metronome });
          break;
        case "f":
        case "F":
          store.set({ fingering: !store.fingering });
          break;
        case "Escape":
          setLoop(null, false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [derived, engine, song, loopBlock, setLoop]);

  if (error) return <main className="player">{error}</main>;

  return (
    <main className="player">
      <header className="player-head">
        <h1>{song.title}</h1>
        <SourceLink source={song.source} />
        {derived ? (
          <span className="mono">
            {scaleName(derived.analysis.scale)} · {song.beatsPerBar}/4 ·{" "}
            <span className="dim">Tempo</span> {state.tempoPercent} % · Takt{" "}
            {Math.min(state.currentBar, derived.analysis.totalBars)} von{" "}
            {derived.analysis.totalBars}
            {state.muted.left ? " · links stumm" : ""}
            {state.muted.right ? " · rechts stumm" : ""}
            {state.metronome ? " · Metronom" : ""}
            {state.fingering ? " · Fingersatz" : ""}
          </span>
        ) : (
          <span className="dim">lädt</span>
        )}
        <Corrections song={song} onPatch={patchSong} onReanalyze={reanalyze} />
      </header>

      <div>
        {derived ? (
          <>
            <StructureBar
              parts={derived.parts}
              blocks={derived.blocks}
              repeats={derived.repeats}
              currentBar={state.currentBar}
              loop={state.loop}
              onLoopBlock={loopBlock}
              onLoopPart={loopPart}
            />
            <div className="loop-line mono">
              {state.loop ? (
                <b>■ Loop: {state.loop.label}</b>
              ) : (
                <span className="dim">Block oder Part anklicken für einen Loop</span>
              )}
            </div>
          </>
        ) : null}
      </div>

      {derived ? (
        <FallingNotes
          engine={engine}
          notes={derived.beatNotes}
          grid={song}
          scale={derived.analysis.scale}
          totalBars={derived.analysis.totalBars}
        />
      ) : (
        <div className="stage" />
      )}

      <footer className="keys mono">
        <span>
          <b>Space</b>Play
        </span>
        <span>
          <b>← →</b>Takt
        </span>
        <span>
          <b>⇧← ⇧→</b>Block
        </span>
        <span>
          <b>↑ ↓</b>Tempo
        </span>
        <span>
          <b>L R</b>Hand
        </span>
        <span>
          <b>M</b>Metronom
        </span>
        <span>
          <b>F</b>Fingersatz
        </span>
        <span>
          <b>Esc</b>Loop aus
        </span>
      </footer>
    </main>
  );
}
