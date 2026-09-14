"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Removes the song folder after a confirmation and refreshes the list.
export function DeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="delete"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(`"${title}" löschen? Der Ordner mit MIDI und Analyse wird entfernt.`))
          return;
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
