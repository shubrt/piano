import type { Song } from "@/lib/song";

// Where the notes came from: the YouTube video as a link, or the dropped file name.
export function SourceLink({ source }: { source: Song["source"] }) {
  if (source.type === "youtube") {
    return (
      <a className="dim source" href={source.url} target="_blank" rel="noreferrer">
        Quelle: YouTube ↗
      </a>
    );
  }
  return <span className="dim source">Quelle: {source.fileName}</span>;
}
