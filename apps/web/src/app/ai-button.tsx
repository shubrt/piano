"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Asks the model for the structure of one song and replaces the heuristic's parts.
export function AiButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch(`/api/songs/${id}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ai: true }),
          });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "KI läuft" : "KI-Analyse"}
    </button>
  );
}
