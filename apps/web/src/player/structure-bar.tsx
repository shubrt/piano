"use client";

import type { Block, BlockRepeat } from "@/lib/blocks";
import type { Part } from "@/lib/song";
import type { Loop } from "./store";

type Props = {
  parts: readonly Part[];
  blocks: readonly Block[];
  repeats: readonly BlockRepeat[];
  currentBar: number;
  loop: Loop | null;
  onLoopBlock: (block: Block) => void;
  onLoopPart: (part: Part, partIndex: number) => void;
};

// Parts with their blocks as clickable boxes. Repeats are dimmed and carry a
// reference to the block they repeat.
export function StructureBar({
  parts,
  blocks,
  repeats,
  currentBar,
  loop,
  onLoopBlock,
  onLoopPart,
}: Props) {
  return (
    <div className="structure">
      {parts.map((part, partIndex) => {
        const partActive = loop?.fromBar === part.fromBar && loop.toBar === part.toBar;
        return (
          <div className="part" key={`${part.name}-${part.fromBar}`}>
            <button
              type="button"
              className={`part-name${partActive ? " active" : ""}`}
              title={`Takte ${part.fromBar} bis ${part.toBar}`}
              onClick={() => onLoopPart(part, partIndex)}
            >
              {part.name}
            </button>
            {blocks.map((block, i) => {
              if (block.partIndex !== partIndex) return null;
              const repeat = repeatText(repeats[i]);
              const looped = loop?.fromBar === block.fromBar && loop.toBar === block.toBar;
              const current = currentBar >= block.fromBar && currentBar <= block.toBar;
              const classes = [
                "block",
                repeat ? "repeat" : "",
                current ? "current" : "",
                looped ? "looped" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  type="button"
                  key={block.fromBar}
                  className={classes}
                  title={`Takte ${block.fromBar} bis ${block.toBar}${repeat ? ` · ${repeat}` : ""}`}
                  onClick={() => onLoopBlock(block)}
                >
                  {block.index}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// "wie Block 1", "links wie Block 1", "rechts wie Block 2" or null.
export function repeatText(repeat: BlockRepeat | undefined): string | null {
  if (!repeat) return null;
  if (repeat.all !== null) return `wie Block ${repeat.all}`;
  if (repeat.left !== null) return `links wie Block ${repeat.left}`;
  if (repeat.right !== null) return `rechts wie Block ${repeat.right}`;
  return null;
}
