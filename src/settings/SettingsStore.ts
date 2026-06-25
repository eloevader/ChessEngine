import { useCallback, useEffect, useState } from 'react';
import type { PieceSetId } from '../chess/pieces';

export type AnimationSpeed = 'slow' | 'normal' | 'fast' | 'arcade';
export type AnimationStyle = 'slide' | 'arc';
export type SoundPack = 'classic' | 'retro' | 'modern' | 'arcade' | 'soft';
export type CoordDisplay = 'off' | 'inside' | 'outside' | 'all';
export type GameMode = 'local' | 'computer' | 'analysis';
export type PlayerSide = 'w' | 'b' | 'random';
export type EngineLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type EvalBarPosition = 'left' | 'right' | 'top' | 'bottom';

export interface Settings {
  boardThemeId: string;
  customLight: string | null;
  customDark: string | null;
  pieceSet: PieceSetId;
  soundEnabled: boolean;
  soundVolume: number;
  soundPack: SoundPack;
  coordDisplay: CoordDisplay;
  showLegalMoves: boolean;
  highlightLastMove: boolean;
  highlightCheck: boolean;
  flipAfterMove: boolean;
  animationSpeed: AnimationSpeed;
  animationStyle: AnimationStyle;
  showSettingsOnStart: boolean;
  gameMode: GameMode;
  engineLevel: EngineLevel;
  playerSide: PlayerSide;
  evalBarEnabled: boolean;
  evalBarPosition: EvalBarPosition;
  showAnalysisLines: boolean;
  showThreats: boolean;
}

const STORAGE_KEY = 'chess-analyzer.settings.v6';
// Older keys we may have used previously. We don't read from them, but we
// delete them on load so users who upgrade don't get stuck on stale settings.
const LEGACY_STORAGE_KEYS = [
  'chess-analyzer.settings.v1',
  'chess-analyzer.settings.v2',
  'chess-analyzer.settings.v3',
  'chess-analyzer.settings.v4',
  'chess-analyzer.settings.v5',
];

export const DEFAULT_SETTINGS: Settings = {
  boardThemeId: 'classic',
  customLight: null,
  customDark: null,
  pieceSet: 'cburnett',
  soundEnabled: true,
  soundVolume: 0.6,
  soundPack: 'classic',
  coordDisplay: 'outside',
  showLegalMoves: true,
  highlightLastMove: true,
  highlightCheck: true,
  flipAfterMove: false,
  animationSpeed: 'normal',
  animationStyle: 'slide',
  showSettingsOnStart: false,
  gameMode: 'analysis',
  engineLevel: 4,
  playerSide: 'w',
  evalBarEnabled: true,
  evalBarPosition: 'left',
  showAnalysisLines: false,
  showThreats: true,
};

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  // Wipe any legacy keys from prior versions.
  try {
    for (const k of LEGACY_STORAGE_KEYS) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

let committedState: Settings | null = null;
let listeners: Array<(s: Settings) => void> = [];

function getCommitted(): Settings {
  if (committedState === null) committedState = loadSettings();
  return committedState;
}

function setCommitted(next: Settings) {
  committedState = next;
  saveSettings(next);
  listeners.forEach((l) => l(next));
}

/**
 * Hook used by the rest of the app to read the active (committed) settings.
 * Does NOT respond to staged-but-unsaved changes in the panel.
 */
export function useSettings(): Settings {
  const [s, setLocal] = useState<Settings>(getCommitted());
  useEffect(() => {
    const listener = (next: Settings) => setLocal(next);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);
  return s;
}

/**
 * Hook for the Settings panel. Manages a staged draft + Save / Discard.
 * Returns the live draft (not yet committed), updateDraft, save, discard, reset.
 */
export function useSettingsDraft(): {
  draft: Settings;
  setDraft: (next: Settings) => void;
  updateDraft: (patch: Partial<Settings>) => void;
  save: () => void;
  discard: () => void;
  reset: () => void;
  isDirty: boolean;
} {
  const [draft, setDraftInternal] = useState<Settings>(() => getCommitted());
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const listener = (next: Settings) => {
      // When committed state changes from elsewhere (e.g. reset), refresh draft
      if (!isDirty) setDraftInternal(next);
    };
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  const setDraft = useCallback((next: Settings) => {
    setDraftInternal(next);
    setIsDirty(true);
  }, []);

  const updateDraft = useCallback((patch: Partial<Settings>) => {
    setDraftInternal((s) => ({ ...s, ...patch }));
    setIsDirty(true);
  }, []);

  const save = useCallback(() => {
    setDraftInternal((current) => {
      setCommitted(current);
      return current;
    });
    setIsDirty(false);
  }, []);

  const discard = useCallback(() => {
    setDraftInternal(getCommitted());
    setIsDirty(false);
  }, []);

  const reset = useCallback(() => {
    setDraftInternal(DEFAULT_SETTINGS);
    setIsDirty(true);
  }, []);

  return { draft, setDraft, updateDraft, save, discard, reset, isDirty };
}

export function getSettings(): Settings {
  return getCommitted();
}

export function getCommittedSettings(): Settings {
  return getCommitted();
}

/** Immediately commit a new settings value, bypassing the draft system.
 *  Used when the App needs to start a new game with new game-mode settings
 *  that the user has just chosen in a dialog. */
export function setCommittedSettings(s: Settings) {
  setCommitted(s);
}

export const ANIMATION_DURATIONS_MS: Record<AnimationSpeed, number> = {
  slow: 450,
  normal: 200,
  fast: 90,
  arcade: 300,
};
