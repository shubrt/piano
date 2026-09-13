import { readFileSync } from "node:fs";
import { parseMidi } from "../src/lib/midi";

export function loadTestMidi(id: "secunda" | "ancient-stones") {
  return parseMidi(
    new Uint8Array(readFileSync(new URL(`../songs/${id}/notes.mid`, import.meta.url))),
  );
}
