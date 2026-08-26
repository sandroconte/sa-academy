import { create } from "zustand";
import { syncContent } from "../lib/sync";
import { getSyncState } from "../lib/db";
import type { Manifest } from "../lib/types";

interface ContentState {
  syncing: boolean;
  stale: boolean;
  lastSyncedAt: number | null;
  version: Record<string, string> | null;
  refresh: () => Promise<void>;
  loadLocalMeta: () => Promise<void>;
}

export const useContent = create<ContentState>((set, get) => ({
  syncing: false,
  stale: false,
  lastSyncedAt: null,
  version: null,
  loadLocalMeta: async () => {
    const raw = await getSyncState("manifest");
    const m: Manifest | null = raw ? JSON.parse(raw) : null;
    set({ version: m?.version ?? null });
  },
  refresh: async () => {
    if (get().syncing) return;
    set({ syncing: true });
    try {
      const result = await syncContent();
      await get().loadLocalMeta();
      set({
        syncing: false,
        stale: result.stale || !result.ok,
        ...(result.ok && !result.stale ? { lastSyncedAt: Date.now() } : {}),
      });
    } catch {
      set({ syncing: false, stale: true });
    }
  },
}));
