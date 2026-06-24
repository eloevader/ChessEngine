import { useSettings, type AnimationSpeed, type AnimationStyle } from '../settings/SettingsStore';
import { BOARD_THEMES, getTheme } from '../chess/themes';
import { PIECE_SETS, pieceImageUrl, type PieceSetId } from '../chess/pieces';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const PIECE_SET_IDS: PieceSetId[] = PIECE_SETS.map((p) => p.id);
const ANIM_SPEEDS: { id: AnimationSpeed; label: string }[] = [
  { id: 'slow', label: 'Slow' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fast' },
  { id: 'arcade', label: 'Arcade' },
];

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [settings, update, reset] = useSettings();

  if (!open) return null;

  const theme = getTheme(settings.boardThemeId);
  const light = settings.customLight ?? theme.light;
  const dark = settings.customDark ?? theme.dark;

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            {'\u2715'}
          </button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3>Board</h3>
            <div className="setting-row">
              <label>Theme</label>
              <div className="theme-grid">
                {BOARD_THEMES.map((t) => (
                  <button
                    key={t.id}
                    className={`theme-chip ${settings.boardThemeId === t.id ? 'selected' : ''}`}
                    onClick={() => update({ boardThemeId: t.id, customLight: null, customDark: null })}
                    title={t.name}
                  >
                    <span
                      className="theme-swatch"
                      style={{
                        backgroundImage: t.imageUrl ? `url('${t.imageUrl}')` : undefined,
                        backgroundSize: 'cover',
                      }}
                    >
                      {!t.imageUrl && (
                        <>
                          <span style={{ background: t.light }} />
                          <span style={{ background: t.dark }} />
                        </>
                      )}
                    </span>
                    <span className="theme-name">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <label>Custom colors</label>
              <div className="color-row">
                <div className="color-input">
                  <span>Light</span>
                  <input
                    type="color"
                    value={light}
                    onChange={(e) => update({ customLight: e.target.value })}
                  />
                </div>
                <div className="color-input">
                  <span>Dark</span>
                  <input
                    type="color"
                    value={dark}
                    onChange={(e) => update({ customDark: e.target.value })}
                  />
                </div>
                {(settings.customLight || settings.customDark) && (
                  <button className="text-btn" onClick={() => update({ customLight: null, customDark: null })}>
                    Reset to theme
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3>Pieces</h3>
            <div className="piece-grid">
              {PIECE_SET_IDS.map((id) => {
                const meta = PIECE_SETS.find((p) => p.id === id)!;
                return (
                  <button
                    key={id}
                    className={`piece-chip ${settings.pieceSet === id ? 'selected' : ''}`}
                    onClick={() => update({ pieceSet: id })}
                    title={meta.description}
                  >
                    <span className="piece-preview">
                      <img src={pieceImageUrl(id, 'w', 'k')} alt="" />
                      <img src={pieceImageUrl(id, 'w', 'q')} alt="" />
                      <img src={pieceImageUrl(id, 'b', 'k')} alt="" />
                    </span>
                    <span className="piece-name">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="settings-section">
            <h3>Sound</h3>
            <div className="setting-row">
              <label>Enable sounds</label>
              <input
                type="checkbox"
                checked={settings.soundEnabled}
                onChange={(e) => update({ soundEnabled: e.target.checked })}
              />
            </div>
            <div className="setting-row">
              <label>Volume</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.soundVolume}
                disabled={!settings.soundEnabled}
                onChange={(e) => update({ soundVolume: parseFloat(e.target.value) })}
              />
              <span className="setting-value">{Math.round(settings.soundVolume * 100)}%</span>
            </div>
          </section>

          <section className="settings-section">
            <h3>Animation</h3>
            <div className="setting-row">
              <label>Speed</label>
              <div className="seg-group">
                {ANIM_SPEEDS.map((s) => (
                  <button
                    key={s.id}
                    className={`seg ${settings.animationSpeed === s.id ? 'selected' : ''}`}
                    onClick={() => update({ animationSpeed: s.id })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <label>Move style</label>
              <div className="seg-group">
                {(['slide', 'arc'] as AnimationStyle[]).map((s) => (
                  <button
                    key={s}
                    className={`seg ${settings.animationStyle === s ? 'selected' : ''}`}
                    onClick={() => update({ animationStyle: s })}
                  >
                    {s === 'slide' ? 'Flat slide' : 'Arc'}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3>Display</h3>
            <div className="setting-row">
              <label>Show coordinates</label>
              <input
                type="checkbox"
                checked={settings.showCoordinates}
                onChange={(e) => update({ showCoordinates: e.target.checked })}
              />
            </div>
            <div className="setting-row">
              <label>Show legal move hints</label>
              <input
                type="checkbox"
                checked={settings.showLegalMoves}
                onChange={(e) => update({ showLegalMoves: e.target.checked })}
              />
            </div>
            <div className="setting-row">
              <label>Highlight last move</label>
              <input
                type="checkbox"
                checked={settings.highlightLastMove}
                onChange={(e) => update({ highlightLastMove: e.target.checked })}
              />
            </div>
            <div className="setting-row">
              <label>Highlight check</label>
              <input
                type="checkbox"
                checked={settings.highlightCheck}
                onChange={(e) => update({ highlightCheck: e.target.checked })}
              />
            </div>
            <div className="setting-row">
              <label>Flip board after my move</label>
              <input
                type="checkbox"
                checked={settings.flipAfterMove}
                onChange={(e) => update({ flipAfterMove: e.target.checked })}
              />
            </div>
          </section>

          <div className="settings-footer">
            <button className="danger-btn" onClick={reset}>
              Reset all to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
