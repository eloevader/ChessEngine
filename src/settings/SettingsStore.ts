import { useCallback, useEffect, useState } from 'react';
import type { PieceSetId } from '../chess/pieces';

export type AnimationSpeed = 'slow' | 'normal' | 'fast' | 'arcade';
export type AnimationStyle = 'slide' | 'arc';

export interface Settings {
  boardThemeId: string;
  customLight: string | null;
  customDark: string | null;
  pieceSet: PieceSetId;
  soundEnabled: boolean;
  soundVolume: number;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  highlightLastMove: boolean;
  highlightCheck: boolean;
  flipAfterMove: boolean;
  animationSpeed: AnimationSpeed;
  animationStyle: AnimationStyle;
  showSettingsOnStart: boolean;
}

const STORAGE_KEY = 'chess-analyzer.settings.v2';

export const DEFAULT_SETTINGS: Settings = {
  boardThemeId: 'classic',
  customLight: null,
  customDark: null,
  pieceSet: 'cburnett',
  soundEnabled: true,
  soundVolume: 0.6,
  showCoordinates: true,
  showLegalMoves: true,
  highlightLastMove: true,
  highlightCheck: true,
  flipAfterMove: false,
  animationSpeed: 'normal',
  animationStyle: 'slide',
  showSettingsOnStart: false,
};

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
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

let listeners: Array<(s: Settings) => void> = [];
let currentState: Settings | null = null;

function getState(): Settings {
  if (currentState === null) currentState = loadSettings();
  return currentState;
}

function setState(updater: (s: Settings) => Settings) {
  const next = updater(getState());
  currentState = next;
  saveSettings(next);
  listeners.forEach((l) => l(next));
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void, () => void] {
  const [s, setLocal] = useState<Settings>(getState());

  useEffect(() => {
    const listener = (next: Settings) => setLocal(next);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setState(() => DEFAULT_SETTINGS);
  }, []);

  return [s, update, reset];
}

export function getSettings(): Settings {
  return getState();
}

export const ANIMATION_DURATIONS_MS: Record<AnimationSpeed, number> = {
  slow: 450,
  normal: 200,
  fast: 90,
  arcade: 300,
};
