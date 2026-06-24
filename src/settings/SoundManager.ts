import { useEffect, useRef } from 'react';
import type { LegalMove } from '../chess/GameState';
import { getSettings, type Settings } from '../settings/SettingsStore';

export type SoundEvent =
  | { type: 'move'; move: LegalMove }
  | { type: 'capture'; move: LegalMove }
  | { type: 'check' }
  | { type: 'checkmate' }
  | { type: 'stalemate' }
  | { type: 'draw' }
  | { type: 'victory' }
  | { type: 'defeat' }
  | { type: 'illegal' }
  | { type: 'lowTime' };

const SOUND_FILES: Record<string, string> = {
  move: 'sounds/move.mp3',
  capture: 'sounds/capture.mp3',
  check: 'sounds/check.mp3',
  checkmate: 'sounds/checkmate.wav',
  victory: 'sounds/victory.wav',
  defeat: 'sounds/defeat.mp3',
  draw: 'sounds/draw.mp3',
  illegal: 'sounds/error.wav',
  lowTime: 'sounds/lowtime.mp3',
};

class SoundManager {
  private cache = new Map<string, HTMLAudioElement>();
  private settings: Settings;
  private lastLowTimeAt = 0;

  constructor() {
    this.settings = getSettings();
  }

  refresh() {
    this.settings = getSettings();
  }

  private getAudio(key: string): HTMLAudioElement | null {
    if (!this.settings.soundEnabled) return null;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const src = SOUND_FILES[key];
    if (!src) return null;
    const a = new Audio(src);
    a.preload = 'auto';
    a.volume = this.settings.soundVolume;
    this.cache.set(key, a);
    return a;
  }

  private play(key: string) {
    const a = this.getAudio(key);
    if (!a) return;
    try {
      const clone = a.cloneNode(true) as HTMLAudioElement;
      clone.volume = this.settings.soundVolume;
      clone.currentTime = 0;
      void clone.play();
    } catch {
      /* ignore */
    }
  }

  emit(event: SoundEvent) {
    this.refresh();
    if (!this.settings.soundEnabled) return;

    switch (event.type) {
      case 'move':
        if (event.move.isCastle) this.play('move');
        else if (event.move.isPromotion) this.play('move');
        else this.play('move');
        break;
      case 'capture':
        this.play('capture');
        break;
      case 'check':
        this.play('check');
        break;
      case 'checkmate':
        this.play('checkmate');
        this.scheduleSide('victory', 'defeat');
        break;
      case 'stalemate':
      case 'draw':
        this.play('draw');
        break;
      case 'victory':
        this.play('victory');
        break;
      case 'defeat':
        this.play('defeat');
        break;
      case 'illegal':
        this.play('illegal');
        break;
      case 'lowTime':
        const now = Date.now();
        if (now - this.lastLowTimeAt > 1000) {
          this.play('lowTime');
          this.lastLowTimeAt = now;
        }
        break;
    }
  }

  private scheduleSide(win: string, lose: string) {
    setTimeout(() => this.play(win), 700);
    setTimeout(() => this.play(lose), 1500);
  }
}

let _manager: SoundManager | null = null;
function getManager(): SoundManager {
  if (!_manager) _manager = new SoundManager();
  return _manager;
}

export function useSound() {
  const mgr = useRef(getManager());
  useEffect(() => {
    mgr.current.refresh();
  }, []);
  return {
    emit: (e: SoundEvent) => mgr.current.emit(e),
  };
}
