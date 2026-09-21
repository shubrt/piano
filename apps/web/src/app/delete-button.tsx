"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Removes the song after a confirmation and refreshes the list.
export function DeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(`"${title}" löschen? MIDI und Analyse werden entfernt.`)) return;
        setBusy(true);
        try {
          await fetch(`/api/songs/${id}`, { method: "DELETE" });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      Löschen
    </button>
  );
}
