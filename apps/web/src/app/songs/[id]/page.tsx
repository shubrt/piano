import { notFound } from "next/navigation";
import { Player } from "@/player/player";
import { readSong } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const song = await readSong(id).catch(() => null);
  if (!song) notFound();
  return <Player initialSong={song} />;
}
