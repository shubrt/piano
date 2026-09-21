import { customType, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { Song } from "../song";

// bytea without the Buffer round trip drizzle would otherwise leave to us.
const bytes = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

// Song = the old song.json (everything but id and title) plus the MIDI bytes.
// Songs are shared by every signed-in user, so there is no owner column.
export const songs = pgTable("songs", {
  id: text().primaryKey(),
  title: text().notNull(),
  data: jsonb().$type<Omit<Song, "id" | "title">>().notNull(),
  midi: bytes().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const IMPORT_STATUSES = [
  "queued",
  "audio",
  "transcribe",
  "transcribed",
  "analyze",
  "done",
  "error",
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

// One row per import. The worker owns queued to transcribed and fills midi and
// title, the web app takes over at transcribed, runs the analysis and sets song_id.
export const importJobs = pgTable(
  "import_jobs",
  {
    id: text().primaryKey(),
    status: text().$type<ImportStatus>().notNull().default("queued"),
    // YouTube URL, or null for an uploaded audio file.
    url: text(),
    // Uploaded audio, cleared once the MIDI exists.
    audio: bytes(),
    fileName: text("file_name"),
    title: text(),
    midi: bytes(),
    error: text(),
    songId: text("song_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("import_jobs_status_idx").on(table.status)],
);
