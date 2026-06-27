import { useEffect, useRef } from 'react';
import type { LegalMove } from '../chess/GameState';
import { getSettings, type Settings, type SoundPack } from '../settings/SettingsStore';

export type SoundEvent =
  | { type: 'move'; move: LegalMove }
  | { type: 'capture'; move: LegalMove }
  | { type: 'castle'; move: LegalMove }
  | { type: 'check' }
  | { type: 'checkmate' }
  | { type: 'stalemate' }
  | { type: 'draw' }
  | { type: 'victory' }
  | { type: 'defeat' }
  | { type: 'illegal' }
  | { type: 'lowTime' };

type SoundKey =
  | 'move'
  | 'capture'
  | 'check'
  | 'checkmate'
  | 'castle'
  | 'victory'
  | 'defeat'
  | 'draw'
  | 'illegal'
  | 'lowTime';

const SOUND_MAP: Record<SoundPack, Partial<Record<SoundKey, string>>> = {
  classic: {
    move: 'sounds/move.mp3',
    capture: 'sounds/capture.mp3',
    check: 'sounds/check.mp3',
    checkmate: 'sounds/checkmate.wav',
    victory: 'sounds/victory.wav',
    defeat: 'sounds/defeat.mp3',
    draw: 'sounds/draw.mp3',
    illegal: 'sounds/error.wav',
    lowTime: 'sounds/lowtime.mp3',
  },
  retro: {
    move: 'sounds/retro-move.wav',
    capture: 'sounds/retro-capture.wav',
    check: 'sounds/retro-check.wav',
    checkmate: 'sounds/retro-checkmate.wav',
    victory: 'sounds/retro-victory.wav',
    defeat: 'sounds/retro-defeat.wav',
    draw: 'sounds/retro-draw.wav',
    illegal: 'sounds/retro-error.wav',
    lowTime: 'sounds/retro-lowtime.wav',
  },
  modern: {
    move: 'sounds/modern-move.wav',
    capture: 'sounds/modern-capture.wav',
    check: 'sounds/modern-check.wav',
    checkmate: 'sounds/modern-checkmate.wav',
    victory: 'sounds/modern-victory.wav',
    defeat: 'sounds/modern-defeat.wav',
    draw: 'sounds/modern-draw.wav',
    illegal: 'sounds/modern-error.wav',
    lowTime: 'sounds/modern-lowtime.wav',
  },
  arcade: {
    move: 'sounds/arcade-move.wav',
    capture: 'sounds/arcade-capture.wav',
    check: 'sounds/arcade-check.wav',
    checkmate: 'sounds/arcade-checkmate.wav',
    victory: 'sounds/arcade-victory.wav',
    defeat: 'sounds/arcade-defeat.wav',
    draw: 'sounds/arcade-draw.wav',
    illegal: 'sounds/arcade-error.wav',
    lowTime: 'sounds/arcade-lowtime.wav',
  },
  soft: {
    move: 'sounds/soft-move.wav',
    capture: 'sounds/soft-capture.wav',
    check: 'sounds/soft-check.wav',
    checkmate: 'sounds/soft-checkmate.wav',
    victory: 'sounds/soft-victory.wav',
    defeat: 'sounds/soft-defeat.wav',
    draw: 'sounds/soft-draw.wav',
    illegal: 'sounds/soft-error.wav',
    lowTime: 'sounds/soft-lowtime.wav',
  },
  // Lichess standard sound pack (downloaded from the official
  // lichess-org/lila repo, served from lichess1.org).
  lichess: {
    move: 'sounds/lichess/Move.mp3',
    capture: 'sounds/lichess/Capture.mp3',
    check: 'sounds/lichess/Check.mp3',
    checkmate: 'sounds/lichess/Checkmate.mp3',
    castle: 'sounds/lichess/Castle.mp3',
    victory: 'sounds/lichess/Victory.mp3',
    defeat: 'sounds/lichess/Defeat.mp3',
    draw: 'sounds/lichess/Draw.mp3',
    lowTime: 'sounds/lichess/LowTime.mp3',
    illegal: 'sounds/lichess/Select.mp3',
  },
  // Chess.com default sound pack (scraped from chess.com, mirrored
  // in the Orivoir/scraping-sound-effects-chess.com repo).
  chesscom: {
    move: 'sounds/chesscom/Move.mp3',
    capture: 'sounds/chesscom/Capture.mp3',
    check: 'sounds/chesscom/Check.mp3',
    checkmate: 'sounds/chesscom/Checkmate.mp3',
    castle: 'sounds/chesscom/Castle.mp3',
    victory: 'sounds/chesscom/Victory.mp3',
    defeat: 'sounds/chesscom/Defeat.mp3',
    draw: 'sounds/chesscom/Draw.mp3',
    lowTime: 'sounds/chesscom/LowTime.mp3',
    illegal: 'sounds/chesscom/Illegal.mp3',
  },
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

  private getAudio(key: SoundKey): HTMLAudioElement | null {
    if (!this.settings.soundEnabled) return null;
    const pack = SOUND_MAP[this.settings.soundPack] ?? SOUND_MAP.classic;
    const src = pack[key];
    if (!src) return null;
    const cacheKey = `${this.settings.soundPack}:${key}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const a = new Audio(src);
    a.preload = 'auto';
    a.volume = this.settings.soundVolume;
    this.cache.set(cacheKey, a);
    return a;
  }

  private play(key: SoundKey) {
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
        this.play('move');
        break;
      case 'capture':
        this.play('capture');
        break;
      case 'castle':
        this.play('castle');
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

  private scheduleSide(win: SoundKey, lose: SoundKey) {
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
