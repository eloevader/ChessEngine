export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
  selected: string;
  lastMove: string;
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

const standard = (id: string, name: string, light: string, dark: string, overrides: Partial<BoardTheme> = {}): BoardTheme => ({
  id,
  name,
  light,
  dark,
  selected: 'rgba(255, 235, 110, 0.55)',
  lastMove: 'rgba(255, 235, 110, 0.30)',
  check: 'radial-gradient(circle, rgba(255, 80, 80, 0.95) 0%, rgba(255, 80, 80, 0.4) 70%)',
  legalDot: 'rgba(0, 0, 0, 0.18)',
  border: '#383b48',
  panel: '#22232c',
  background: '#1a1a22',
  text: '#e6e6ec',
  textDim: '#9da0ad',
  ...overrides,
});

export const BOARD_THEMES: BoardTheme[] = [
  standard('classic', 'Classic Green', '#ebecd0', '#779556'),
  standard('wood', 'Wood Brown', '#f0d9b5', '#b58863', {
    border: '#3a2d20', panel: '#2a2118', background: '#1c1612',
    text: '#f0e6d6', textDim: '#a89886',
    selected: 'rgba(255, 200, 80, 0.55)', lastMove: 'rgba(255, 200, 80, 0.30)',
  }),
  standard('slate', 'Slate Blue', '#dee3e6', '#4a6c8c', {
    border: '#2c3a4a', panel: '#1f2a36', background: '#141b24',
    text: '#dde6ef', textDim: '#7d8fa3',
    selected: 'rgba(130, 200, 255, 0.55)', lastMove: 'rgba(130, 200, 255, 0.30)',
  }),
  standard('midnight', 'Midnight Dark', '#3a3f4b', '#22262e', {
    border: '#0f1116', panel: '#1c1e26', background: '#0a0c12',
    selected: 'rgba(192, 132, 252, 0.55)', lastMove: 'rgba(192, 132, 252, 0.25)',
    legalDot: 'rgba(255, 255, 255, 0.20)',
  }),
  standard('tournament', 'Tournament', '#ffffff', '#444444', {
    border: '#222', panel: '#f4f4f4', background: '#ffffff',
    text: '#1a1a1a', textDim: '#666',
    selected: 'rgba(255, 200, 60, 0.60)', lastMove: 'rgba(255, 200, 60, 0.30)',
    legalDot: 'rgba(0, 0, 0, 0.25)',
  }),
  standard('purple', 'Purple Diag', '#e0d4f5', '#7e57c2', {
    border: '#3a2a5a', panel: '#2a1f3a', background: '#1a1226',
    text: '#ece4f5', textDim: '#a093bf',
    selected: 'rgba(220, 180, 255, 0.55)', lastMove: 'rgba(220, 180, 255, 0.30)',
  }),
  standard('olive', 'Olive', '#f0e8d4', '#7a8556', {
    border: '#3a3a25', panel: '#2a2a1f', background: '#1a1a14',
    text: '#ece8d4', textDim: '#a09a86',
  }),
  // Image-based themes (from Lichess)
  {
    id: 'img-wood', name: 'Lichess Wood', light: '#e8d4ad', dark: '#a87a4a',
    selected: 'rgba(255, 200, 80, 0.55)', lastMove: 'rgba(255, 200, 80, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)', border: '#3a2d20', panel: '#2a2118', background: '#1c1612',
    text: '#f0e6d6', textDim: '#a89886',
    imageUrl: 'boards/wood.jpg', imageOpacity: 0.85,
  },
  {
    id: 'img-wood2', name: 'Lichess Wood 2', light: '#ecd2a8', dark: '#9c6a3c',
    selected: 'rgba(255, 200, 80, 0.55)', lastMove: 'rgba(255, 200, 80, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)', border: '#3a2d20', panel: '#2a2118', background: '#1c1612',
    text: '#f0e6d6', textDim: '#a89886',
    imageUrl: 'boards/wood2.jpg', imageOpacity: 0.85,
  },
  {
    id: 'img-wood3', name: 'Lichess Wood 3', light: '#e6d2a8', dark: '#8a5a30',
    selected: 'rgba(255, 200, 80, 0.55)', lastMove: 'rgba(255, 200, 80, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)', border: '#3a2d20', panel: '#2a2118', background: '#1c1612',
    text: '#f0e6d6', textDim: '#a89886',
    imageUrl: 'boards/wood3.jpg', imageOpacity: 0.85,
  },
  {
    id: 'img-wood4', name: 'Lichess Wood 4', light: '#f0dfb0', dark: '#a07050',
    selected: 'rgba(255, 200, 80, 0.55)', lastMove: 'rgba(255, 200, 80, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)', border: '#3a2d20', panel: '#2a2118', background: '#1c1612',
    text: '#f0e6d6', textDim: '#a89886',
    imageUrl: 'boards/wood4.jpg', imageOpacity: 0.85,
  },
  {
    id: 'img-maple', name: 'Lichess Maple', light: '#f0dab8', dark: '#c08a5c',
    selected: 'rgba(255, 200, 80, 0.55)', lastMove: 'rgba(255, 200, 80, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)', border: '#3a2d20', panel: '#2a2118', background: '#1c1612',
    text: '#f0e6d6', textDim: '#a89886',
    imageUrl: 'boards/maple.jpg', imageOpacity: 0.85,
  },
  {
    id: 'img-olive', name: 'Lichess Olive', light: '#ece4c8', dark: '#7a8050',
    selected: 'rgba(255, 220, 80, 0.55)', lastMove: 'rgba(255, 220, 80, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)', border: '#3a3a25', panel: '#2a2a1f', background: '#1a1a14',
    text: '#ece8d4', textDim: '#a09a86',
    imageUrl: 'boards/olive.jpg', imageOpacity: 0.85,
  },
  {
    id: 'img-leather', name: 'Lichess Leather', light: '#d8b88a', dark: '#6a4022',
    selected: 'rgba(255, 200, 80, 0.55)', lastMove: 'rgba(255, 200, 80, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)', border: '#3a2412', panel: '#2a1c10', background: '#1c1208',
    text: '#f0e0c8', textDim: '#a89070',
    imageUrl: 'boards/leather.jpg', imageOpacity: 0.9,
  },
  {
    id: 'img-marble', name: 'Lichess Marble', light: '#f4f0e8', dark: '#6a7a8a',
    selected: 'rgba(180, 200, 255, 0.55)', lastMove: 'rgba(180, 200, 255, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)', border: '#2c3a4a', panel: '#1f2a36', background: '#141b24',
    text: '#dde6ef', textDim: '#7d8fa3',
    imageUrl: 'boards/marble.jpg', imageOpacity: 0.8,
  },
  {
    id: 'img-metal', name: 'Lichess Metal', light: '#c8c8c8', dark: '#404040',
    selected: 'rgba(255, 200, 60, 0.60)', lastMove: 'rgba(255, 200, 60, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)', border: '#1a1a1a', panel: '#252525', background: '#0f0f0f',
    text: '#e6e6e6', textDim: '#888',
    imageUrl: 'boards/metal.jpg', imageOpacity: 0.8,
  },
  {
    id: 'img-canvas2', name: 'Lichess Canvas', light: '#e8e4d8', dark: '#7a6a4a',
    selected: 'rgba(255, 200, 80, 0.55)', lastMove: 'rgba(255, 200, 80, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)', border: '#3a3025', panel: '#2a2418', background: '#1c1810',
    text: '#ece4d4', textDim: '#a09a86',
    imageUrl: 'boards/canvas2.jpg', imageOpacity: 0.85,
  },
  {
    id: 'img-blue2', name: 'Lichess Blue 2', light: '#c8d8e8', dark: '#3a5a7a',
    selected: 'rgba(180, 200, 255, 0.55)', lastMove: 'rgba(180, 200, 255, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)', border: '#1c2a3a', panel: '#1f2a36', background: '#0e1620',
    text: '#dde6ef', textDim: '#7d8fa3',
    imageUrl: 'boards/blue2.jpg', imageOpacity: 0.85,
  },
  {
    id: 'img-blue3', name: 'Lichess Blue 3', light: '#dce8f4', dark: '#4a7090',
    selected: 'rgba(180, 200, 255, 0.55)', lastMove: 'rgba(180, 200, 255, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)', border: '#1c2a3a', panel: '#1f2a36', background: '#0e1620',
    text: '#dde6ef', textDim: '#7d8fa3',
    imageUrl: 'boards/blue3.jpg', imageOpacity: 0.85,
  },
  {
    id: 'img-grey', name: 'Lichess Grey', light: '#b8b8b8', dark: '#5a5a5a',
    selected: 'rgba(255, 200, 60, 0.60)', lastMove: 'rgba(255, 200, 60, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)', border: '#222', panel: '#1f1f1f', background: '#0c0c0c',
    text: '#e6e6e6', textDim: '#888',
    imageUrl: 'boards/grey.jpg', imageOpacity: 0.8,
  },
];

export function getTheme(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}

export function themeToCss(theme: BoardTheme): Record<string, string> {
  return {
    '--light-sq': theme.light,
    '--dark-sq': theme.dark,
    '--selected-sq': theme.selected,
    '--last-move-sq': theme.lastMove,
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
