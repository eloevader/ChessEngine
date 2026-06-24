export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
  selected: string;
  lastMove: string;
  check: string;
  legalDot: string;
  legalCapture: string;
  border: string;
  panel: string;
  background: string;
  text: string;
  textDim: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'classic',
    name: 'Classic Green',
    light: '#ebecd0',
    dark: '#779556',
    selected: 'rgba(255, 235, 110, 0.55)',
    lastMove: 'rgba(255, 235, 110, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 80, 80, 0.95) 0%, rgba(255, 80, 80, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.18)',
    legalCapture: 'auto',
    border: '#383b48',
    panel: '#22232c',
    background: '#1a1a22',
    text: '#e6e6ec',
    textDim: '#9da0ad',
  },
  {
    id: 'wood',
    name: 'Wood Brown',
    light: '#f0d9b5',
    dark: '#b58863',
    selected: 'rgba(255, 200, 80, 0.55)',
    lastMove: 'rgba(255, 200, 80, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 60, 60, 0.95) 0%, rgba(255, 60, 60, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)',
    legalCapture: 'auto',
    border: '#3a2d20',
    panel: '#2a2118',
    background: '#1c1612',
    text: '#f0e6d6',
    textDim: '#a89886',
  },
  {
    id: 'slate',
    name: 'Slate Blue',
    light: '#dee3e6',
    dark: '#4a6c8c',
    selected: 'rgba(130, 200, 255, 0.55)',
    lastMove: 'rgba(130, 200, 255, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 80, 80, 0.95) 0%, rgba(255, 80, 80, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.20)',
    legalCapture: 'auto',
    border: '#2c3a4a',
    panel: '#1f2a36',
    background: '#141b24',
    text: '#dde6ef',
    textDim: '#7d8fa3',
  },
  {
    id: 'midnight',
    name: 'Midnight Dark',
    light: '#3a3f4b',
    dark: '#22262e',
    selected: 'rgba(192, 132, 252, 0.55)',
    lastMove: 'rgba(192, 132, 252, 0.25)',
    check: 'radial-gradient(circle, rgba(255, 80, 80, 0.95) 0%, rgba(255, 80, 80, 0.4) 70%)',
    legalDot: 'rgba(255, 255, 255, 0.20)',
    legalCapture: 'auto',
    border: '#0f1116',
    panel: '#1c1e26',
    background: '#0a0c12',
    text: '#e8e8ef',
    textDim: '#7a7d8a',
  },
  {
    id: 'tournament',
    name: 'Tournament',
    light: '#ffffff',
    dark: '#444444',
    selected: 'rgba(255, 200, 60, 0.60)',
    lastMove: 'rgba(255, 200, 60, 0.30)',
    check: 'radial-gradient(circle, rgba(255, 80, 80, 0.95) 0%, rgba(255, 80, 80, 0.4) 70%)',
    legalDot: 'rgba(0, 0, 0, 0.25)',
    legalCapture: 'auto',
    border: '#222',
    panel: '#f4f4f4',
    background: '#ffffff',
    text: '#1a1a1a',
    textDim: '#666',
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
  };
}
