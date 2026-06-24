export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
  selected: string;
  lastMove: string;
  lastMoveLight: string;
  lastMoveDark: string;
  check: string;
  legalDot: string;
  border: string;
  panel: string;
  background: string;
  text: string;
  textDim: string;
  imageUrl?: string;
  imageOpacity?: number;
}

const checkGrad = 'radial-gradient(circle, rgba(255, 80, 80, 0.95) 0%, rgba(255, 80, 80, 0.4) 70%)';
const checkGradWarm = 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '').match(/^([0-9a-fA-F]{6})$/);
  if (!m) return { r: 200, g: 200, b: 200 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function mix(hex: string, tintRgba: string): string {
  const { r, g, b } = hexToRgb(hex);
  const m = tintRgba.match(/rgba?\(([^)]+)\)/);
  if (!m) return hex;
  const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
  const tr = parts[0];
  const tg = parts[1];
  const tb = parts[2];
  const ta = parts[3] !== undefined ? parts[3] : 1;
  const nr = Math.round(r * (1 - ta) + tr * ta);
  const ng = Math.round(g * (1 - ta) + tg * ta);
  const nb = Math.round(b * (1 - ta) + tb * ta);
  return `rgb(${nr}, ${ng}, ${nb})`;
}

interface BaseThemeOpts {
  selected: string;
  lastMove: string;
  check?: string;
  legalDot?: string;
  border?: string;
  panel?: string;
  background?: string;
  text?: string;
  textDim?: string;
}

function buildTheme(
  id: string,
  name: string,
  light: string,
  dark: string,
  opts: BaseThemeOpts,
  imageUrl?: string,
  imageOpacity?: number,
): BoardTheme {
  return {
    id,
    name,
    light,
    dark,
    selected: opts.selected,
    lastMove: opts.lastMove,
    lastMoveLight: mix(light, opts.lastMove),
    lastMoveDark: mix(dark, opts.lastMove),
    check: opts.check ?? checkGrad,
    legalDot: opts.legalDot ?? 'rgba(0, 0, 0, 0.18)',
    border: opts.border ?? '#383b48',
    panel: opts.panel ?? '#22232c',
    background: opts.background ?? '#1a1a22',
    text: opts.text ?? '#e6e6ec',
    textDim: opts.textDim ?? '#9da0ad',
    imageUrl,
    imageOpacity,
  };
}

export const BOARD_THEMES: BoardTheme[] = [
  buildTheme('classic', 'Classic Green', '#ebecd0', '#779556', {
    selected: 'rgba(255, 235, 110, 0.65)',
    lastMove: 'rgba(255, 235, 110, 0.45)',
  }),
  buildTheme('wood', 'Wood Brown', '#f0d9b5', '#b58863', {
    selected: 'rgba(255, 200, 80, 0.65)', lastMove: 'rgba(255, 200, 80, 0.45)',
    border: '#3a2d20', panel: '#2a2118', background: '#1c1612',
    text: '#f0e6d6', textDim: '#a89886',
  }),
  buildTheme('slate', 'Slate Blue', '#dee3e6', '#4a6c8c', {
    selected: 'rgba(130, 200, 255, 0.65)', lastMove: 'rgba(130, 200, 255, 0.45)',
    border: '#2c3a4a', panel: '#1f2a36', background: '#141b24',
    text: '#dde6ef', textDim: '#7d8fa3',
  }),
  buildTheme('midnight', 'Midnight Dark', '#3a3f4b', '#22262e', {
    selected: 'rgba(192, 132, 252, 0.65)', lastMove: 'rgba(192, 132, 252, 0.40)',
    border: '#0f1116', panel: '#1c1e26', background: '#0a0c12',
    legalDot: 'rgba(255, 255, 255, 0.20)',
  }),
  buildTheme('tournament', 'Tournament', '#ffffff', '#444444', {
    selected: 'rgba(255, 200, 60, 0.65)', lastMove: 'rgba(255, 200, 60, 0.45)',
    border: '#222', panel: '#f4f4f4', background: '#ffffff',
    text: '#1a1a1a', textDim: '#666',
    legalDot: 'rgba(0, 0, 0, 0.25)',
  }),
  buildTheme('purple', 'Purple Diag', '#e0d4f5', '#7e57c2', {
    selected: 'rgba(220, 180, 255, 0.65)', lastMove: 'rgba(220, 180, 255, 0.45)',
    border: '#3a2a5a', panel: '#2a1f3a', background: '#1a1226',
    text: '#ece4f5', textDim: '#a093bf',
  }),
  buildTheme('olive', 'Olive', '#f0e8d4', '#7a8556', {
    selected: 'rgba(255, 220, 80, 0.65)', lastMove: 'rgba(255, 220, 80, 0.45)',
    border: '#3a3a25', panel: '#2a2a1f', background: '#1a1a14',
    text: '#ece8d4', textDim: '#a09a86',
  }),
  buildTheme('img-wood', 'Lichess Wood', '#e8d4ad', '#a87a4a', {
    selected: 'rgba(255, 200, 80, 0.65)', lastMove: 'rgba(255, 200, 80, 0.45)',
    check: checkGradWarm, legalDot: 'rgba(0, 0, 0, 0.20)',
    border: '#3a2d20', panel: '#2a2118', background: '#1c1612',
    text: '#f0e6d6', textDim: '#a89886',
  }, 'boards/wood.jpg', 0.85),
  buildTheme('img-wood2', 'Lichess Wood 2', '#ecd2a8', '#9c6a3c', {
    selected: 'rgba(255, 200, 80, 0.65)', lastMove: 'rgba(255, 200, 80, 0.45)',
    check: checkGradWarm, legalDot: 'rgba(0, 0, 0, 0.20)',
    border: '#3a2d20', panel: '#2a2118', background: '#1c1612',
    text: '#f0e6d6', textDim: '#a89886',
  }, 'boards/wood2.jpg', 0.85),
  buildTheme('img-wood3', 'Lichess Wood 3', '#e6d2a8', '#8a5a30', {
    selected: 'rgba(255, 200, 80, 0.65)', lastMove: 'rgba(255, 200, 80, 0.45)',
    check: checkGradWarm, legalDot: 'rgba(0, 0, 0, 0.20)',
    border: '#3a2d20', panel: '#2a2118', background: '#1c1612',
    text: '#f0e6d6', textDim: '#a89886',
  }, 'boards/wood3.jpg', 0.85),
  buildTheme('img-wood4', 'Lichess Wood 4', '#f0dfb0', '#a07050', {
    selected: 'rgba(255, 200, 80, 0.65)', lastMove: 'rgba(255, 200, 80, 0.45)',
    check: checkGradWarm, legalDot: 'rgba(0, 0, 0, 0.20)',
    border: '#3a2d20', panel: '#2a2118', background: '#1c1612',
    text: '#f0e6d6', textDim: '#a89886',
  }, 'boards/wood4.jpg', 0.85),
  buildTheme('img-maple', 'Lichess Maple', '#f0dab8', '#c08a5c', {
    selected: 'rgba(255, 200, 80, 0.65)', lastMove: 'rgba(255, 200, 80, 0.45)',
    check: checkGradWarm, legalDot: 'rgba(0, 0, 0, 0.20)',
    border: '#3a2d20', panel: '#2a2118', background: '#1c1612',
    text: '#f0e6d6', textDim: '#a89886',
  }, 'boards/maple.jpg', 0.85),
  buildTheme('img-olive', 'Lichess Olive', '#ece4c8', '#7a8050', {
    selected: 'rgba(255, 220, 80, 0.65)', lastMove: 'rgba(255, 220, 80, 0.45)',
    check: checkGradWarm, legalDot: 'rgba(0, 0, 0, 0.20)',
    border: '#3a3a25', panel: '#2a2a1f', background: '#1a1a14',
    text: '#ece8d4', textDim: '#a09a86',
  }, 'boards/olive.jpg', 0.85),
  buildTheme('img-leather', 'Lichess Leather', '#d8b88a', '#6a4022', {
    selected: 'rgba(255, 200, 80, 0.65)', lastMove: 'rgba(255, 200, 80, 0.45)',
    check: checkGradWarm, legalDot: 'rgba(0, 0, 0, 0.20)',
    border: '#3a2412', panel: '#2a1c10', background: '#1c1208',
    text: '#f0e0c8', textDim: '#a89070',
  }, 'boards/leather.jpg', 0.9),
  buildTheme('img-marble', 'Lichess Marble', '#f4f0e8', '#6a7a8a', {
    selected: 'rgba(180, 200, 255, 0.65)', lastMove: 'rgba(180, 200, 255, 0.45)',
    check: checkGradWarm, legalDot: 'rgba(0, 0, 0, 0.20)',
    border: '#2c3a4a', panel: '#1f2a36', background: '#141b24',
    text: '#dde6ef', textDim: '#7d8fa3',
  }, 'boards/marble.jpg', 0.8),
  buildTheme('img-metal', 'Lichess Metal', '#c8c8c8', '#404040', {
    selected: 'rgba(255, 200, 60, 0.65)', lastMove: 'rgba(255, 200, 60, 0.45)',
    check: checkGradWarm, legalDot: 'rgba(0, 0, 0, 0.20)',
    border: '#1a1a1a', panel: '#252525', background: '#0f0f0f',
    text: '#e6e6e6', textDim: '#888',
  }, 'boards/metal.jpg', 0.8),
  buildTheme('img-canvas2', 'Lichess Canvas', '#e8e4d8', '#7a6a4a', {
    selected: 'rgba(255, 200, 80, 0.65)', lastMove: 'rgba(255, 200, 80, 0.45)',
    check: checkGradWarm, legalDot: 'rgba(0, 0, 0, 0.20)',
    border: '#3a3025', panel: '#2a2418', background: '#1c1810',
    text: '#ece4d4', textDim: '#a09a86',
  }, 'boards/canvas2.jpg', 0.85),
  buildTheme('img-blue2', 'Lichess Blue 2', '#c8d8e8', '#3a5a7a', {
    selected: 'rgba(180, 200, 255, 0.65)', lastMove: 'rgba(180, 200, 255, 0.45)',
    check: checkGradWarm, legalDot: 'rgba(0, 0, 0, 0.20)',
    border: '#1c2a3a', panel: '#1f2a36', background: '#0e1620',
    text: '#dde6ef', textDim: '#7d8fa3',
  }, 'boards/blue2.jpg', 0.85),
  buildTheme('img-blue3', 'Lichess Blue 3', '#dce8f4', '#4a7090', {
    selected: 'rgba(180, 200, 255, 0.65)', lastMove: 'rgba(180, 200, 255, 0.45)',
    check: checkGradWarm, legalDot: 'rgba(0, 0, 0, 0.20)',
    border: '#1c2a3a', panel: '#1f2a36', background: '#0e1620',
    text: '#dde6ef', textDim: '#7d8fa3',
  }, 'boards/blue3.jpg', 0.85),
  buildTheme('img-grey', 'Lichess Grey', '#b8b8b8', '#5a5a5a', {
    selected: 'rgba(255, 200, 60, 0.65)', lastMove: 'rgba(255, 200, 60, 0.45)',
    check: checkGradWarm, legalDot: 'rgba(0, 0, 0, 0.20)',
    border: '#222', panel: '#1f1f1f', background: '#0c0c0c',
    text: '#e6e6e6', textDim: '#888',
  }, 'boards/grey.jpg', 0.8),
];

export function getTheme(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}

export function themeToCss(theme: BoardTheme): Record<string, string> {
  return {
    '--light-sq': theme.light,
    '--dark-sq': theme.dark,
    '--last-move-light': theme.lastMoveLight,
    '--last-move-dark': theme.lastMoveDark,
    '--check-sq': theme.check,
    '--legal-dot': theme.legalDot,
    '--border-clr': theme.border,
    '--bg-panel': theme.panel,
    '--bg-app': theme.background,
    '--text': theme.text,
    '--text-dim': theme.textDim,
    '--board-img': theme.imageUrl ? `url('${theme.imageUrl}')` : 'none',
    '--board-img-opacity': theme.imageUrl ? String(theme.imageOpacity ?? 0.85) : '0',
  };
}
