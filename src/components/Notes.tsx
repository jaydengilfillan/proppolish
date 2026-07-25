"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "Notes" — a personal library of saved prompt snippets (or any other text
 * worth reusing: a go-to Prompt-tab instruction, a Retry note you use often,
 * a client-specific styling brief, etc). Everything here is stored in the
 * browser's localStorage only — there is no server component and nothing is
 * ever sent to FAL/OpenAI. It's a scratchpad, not a job input.
 */

interface Preset {
  id: string;
  title: string;
  text: string;
}

const STORAGE_KEY = "proppolish-notes-v1";

function loadPresets(): Preset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Preset =>
        p && typeof p.id === "string" && typeof p.title === "string" && typeof p.text === "string"
    );
  } catch {
    return [];
  }
}

function savePresets(presets: Preset[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Storage full/unavailable — non-fatal, just won't persist this session.
  }
}

interface NotesProps {
  /** Optional: lets a preset be sent straight into the Prompt tab instead of
   * only being copied to the clipboard. Omit to hide that button. */
  onUseInPrompt?: (text: string) => void;
}

export default function Notes({ onUseInPrompt }: NotesProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load once on mount (client-only — localStorage isn't available during SSR).
  useEffect(() => {
    setPresets(loadPresets());
    setLoaded(true);
  }, []);

  // Persist whenever the list changes, but not before the initial load has
  // happened (otherwise an empty initial render would wipe saved data).
  useEffect(() => {
    if (loaded) savePresets(presets);
  }, [presets, loaded]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setTitle("");
    setText("");
  }, []);

  const save = useCallback(() => {
    const trimmedTitle = title.trim();
    const trimmedText = text.trim();
    if (!trimmedTitle || !trimmedText) return;

    if (editingId) {
      setPresets((prev) =>
        prev.map((p) => (p.id === editingId ? { ...p, title: trimmedTitle, text: trimmedText } : p))
      );
    } else {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setPresets((prev) => [...prev, { id, title: trimmedTitle, text: trimmedText }]);
    }
    resetForm();
  }, [title, text, editingId, resetForm]);

  const edit = useCallback((p: Preset) => {
    setEditingId(p.id);
    setTitle(p.title);
    setText(p.text);
  }, []);

  const remove = useCallback(
    (id: string) => {
      setPresets((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) resetForm();
    },
    [editingId, resetForm]
  );

  const copy = useCallback(async (p: Preset) => {
    try {
      await navigator.clipboard.writeText(p.text);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId((cur) => (cur === p.id ? null : cur)), 1500);
    } catch {
      // Clipboard API blocked (rare, e.g. insecure context) — nothing else to do.
    }
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-4 text-sm text-neutral-500">
        Save prompt snippets here — a go-to Prompt-tab instruction, a Retry
        note you reuse often, a client's styling brief — and copy them out
        when you need them. Stored only in this browser, nothing is sent
        anywhere.
      </p>

      {/* Add / edit form */}
      <div className="mb-6 rounded-lg border border-neutral-200 p-4">
        <p className="mb-2 text-xs font-medium text-neutral-500">
          {editingId ? "Edit preset" : "New preset"}
        </p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title, e.g. 'Modern Aussie exterior'"
          maxLength={120}
          className="mb-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Prompt text..."
          rows={4}
          maxLength={2000}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={save}
            disabled={!title.trim() || !text.trim()}
            className="rounded-md bg-black px-4 py-1.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {editingId ? "Save changes" : "Add preset"}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-800"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Saved presets */}
      {presets.length === 0 ? (
        <p className="text-sm text-neutral-400">No saved presets yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {presets.map((p) => (
            <div key={p.id} className="rounded-lg border border-neutral-200 p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{p.title}</p>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => copy(p)}
                    className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-50"
                  >
                    {copiedId === p.id ? "Copied" : "Copy"}
                  </button>
                  {onUseInPrompt && (
                    <button
                      onClick={() => onUseInPrompt(p.text)}
                      className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-50"
                    >
                      Use in Prompt tab
                    </button>
                  )}
                  <button
                    onClick={() => edit(p)}
                    className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm text-neutral-600">{p.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
