import { useSettingsDraft } from '../settings/SettingsStore';
import type { AnimationSpeed, AnimationStyle, SoundPack, CoordDisplay, EvalBarPosition, EngineMode } from '../settings/SettingsStore';
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

const SOUND_PACKS: { id: SoundPack; label: string; description: string }[] = [
  { id: 'classic', label: 'Classic', description: 'Lichess-style natural sounds' },
  { id: 'lichess', label: 'Lichess', description: 'Official Lichess standard pack' },
  { id: 'chesscom', label: 'Chess.com', description: 'Chess.com default pack' },
  { id: 'retro', label: 'Retro 8-bit', description: 'Chiptune beeps, arcade feel' },
  { id: 'modern', label: 'Modern', description: 'Clean sine tones, minimal' },
  { id: 'arcade', label: 'Arcade', description: 'Bouncy, game-like' },
  { id: 'soft', label: 'Soft', description: 'Gentle wood-block plucks' },
];

const COORD_MODES: { id: CoordDisplay; label: string; description: string }[] = [
  { id: 'off', label: 'Off', description: 'No coordinates' },
  { id: 'outside', label: 'Outside', description: 'Labels on rank/file edges' },
  { id: 'inside', label: 'Inside', description: 'Labels inside the edge cells' },
  { id: 'all', label: 'All', description: 'Every cell shows its square' },
];

const EVAL_POSITIONS: { id: EvalBarPosition; label: string }[] = [
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
];

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { draft, updateDraft, save, discard, reset, isDirty } = useSettingsDraft();

  if (!open) return null;

  const theme = getTheme(draft.boardThemeId);
  const light = draft.customLight ?? theme.light;
  const dark = draft.customDark ?? theme.dark;

  const handleClose = () => {
    if (isDirty) discard();
    onClose();
  };

  return (
    <div className="settings-backdrop" onClick={handleClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          {isDirty && <span className="dirty-badge">Unsaved</span>}
          <button className="icon-btn" onClick={handleClose} aria-label="Close settings">
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
                    className={`theme-chip ${draft.boardThemeId === t.id ? 'selected' : ''}`}
                    onClick={() => updateDraft({ boardThemeId: t.id, customLight: null, customDark: null })}
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
                    onChange={(e) => updateDraft({ customLight: e.target.value })}
                  />
                </div>
                <div className="color-input">
                  <span>Dark</span>
                  <input
                    type="color"
                    value={dark}
                    onChange={(e) => updateDraft({ customDark: e.target.value })}
                  />
                </div>
                {(draft.customLight || draft.customDark) && (
                  <button
                    className="text-btn"
                    onClick={() => updateDraft({ customLight: null, customDark: null })}
                  >
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
                    className={`piece-chip ${draft.pieceSet === id ? 'selected' : ''}`}
                    onClick={() => updateDraft({ pieceSet: id })}
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
                checked={draft.soundEnabled}
                onChange={(e) => updateDraft({ soundEnabled: e.target.checked })}
              />
            </div>
            <div className="setting-row">
              <label>Volume</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={draft.soundVolume}
                disabled={!draft.soundEnabled}
                onChange={(e) => updateDraft({ soundVolume: parseFloat(e.target.value) })}
              />
              <span className="setting-value">{Math.round(draft.soundVolume * 100)}%</span>
            </div>
            <div className="setting-row">
              <label>Sound pack</label>
              <div className="seg-group vertical">
                {SOUND_PACKS.map((p) => (
                  <button
                    key={p.id}
                    className={`seg ${draft.soundPack === p.id ? 'selected' : ''}`}
                    onClick={() => updateDraft({ soundPack: p.id })}
                    title={p.description}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
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
                    className={`seg ${draft.animationSpeed === s.id ? 'selected' : ''}`}
                    onClick={() => updateDraft({ animationSpeed: s.id })}
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
                    className={`seg ${draft.animationStyle === s ? 'selected' : ''}`}
                    onClick={() => updateDraft({ animationStyle: s })}
                  >
                    {s === 'slide' ? 'Flat slide' : 'Arc'}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3>Engine</h3>
            <div className="setting-row">
              <label>Engine backend</label>
              <div className="seg-group">
                <button
                  className={`seg ${draft.engineMode === 'local' ? 'selected' : ''}`}
                  onClick={() => updateDraft({ engineMode: 'local' })}
                  title="Connect to stockfish-bridge.js via WebSocket"
                >
                  Local bridge
                </button>
                <button
                  className={`seg ${draft.engineMode === 'wasm' ? 'selected' : ''}`}
                  onClick={() => updateDraft({ engineMode: 'wasm' })}
                  title="Run Stockfish in-browser via WebAssembly"
                >
                  In-browser (WASM)
                </button>
              </div>
            </div>
            {draft.engineMode === 'wasm' && (
              <p className="setting-note">
                WASM mode requires{' '}
                <code>Cross-Origin-Embedder-Policy: require-corp</code> and{' '}
                <code>Cross-Origin-Opener-Policy: same-origin</code> headers
                on the deployment (the dev server already has them). If
                these headers are missing, the engine may fail silently.
              </p>
            )}
          </section>

          <section className="settings-section">
            <h3>Display</h3>
            <div className="setting-row">
              <label>Coordinates</label>
              <div className="seg-group">
                {COORD_MODES.map((c) => (
                  <button
                    key={c.id}
                    className={`seg ${draft.coordDisplay === c.id ? 'selected' : ''}`}
                    onClick={() => updateDraft({ coordDisplay: c.id })}
                    title={c.description}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <label>Show legal move hints</label>
              <input
                type="checkbox"
                checked={draft.showLegalMoves}
                onChange={(e) => updateDraft({ showLegalMoves: e.target.checked })}
              />
            </div>
            <div className="setting-row">
              <label>Highlight last move</label>
              <input
                type="checkbox"
                checked={draft.highlightLastMove}
                onChange={(e) => updateDraft({ highlightLastMove: e.target.checked })}
              />
            </div>
            <div className="setting-row">
              <label>Highlight check</label>
              <input
                type="checkbox"
                checked={draft.highlightCheck}
                onChange={(e) => updateDraft({ highlightCheck: e.target.checked })}
              />
            </div>
            <div className="setting-row">
              <label>Flip board after my move</label>
              <input
                type="checkbox"
                checked={draft.flipAfterMove}
                onChange={(e) => updateDraft({ flipAfterMove: e.target.checked })}
              />
            </div>
            <div className="setting-row">
              <label>Show move notation on board</label>
              <input
                type="checkbox"
                checked={draft.moveNotationOnBoard}
                onChange={(e) => updateDraft({ moveNotationOnBoard: e.target.checked })}
              />
            </div>
            <div className="setting-row">
              <label>Show eval bar</label>
              <input
                type="checkbox"
                checked={draft.evalBarEnabled}
                onChange={(e) => updateDraft({ evalBarEnabled: e.target.checked })}
              />
            </div>
            {draft.evalBarEnabled && (
              <div className="setting-row">
                <label>Eval bar position</label>
                <div className="seg-group">
                  {EVAL_POSITIONS.map((p) => (
                    <button
                      key={p.id}
                      className={`seg ${draft.evalBarPosition === p.id ? 'selected' : ''}`}
                      onClick={() => updateDraft({ evalBarPosition: p.id })}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="setting-row">
              <label>Show threat arrows</label>
              <input
                type="checkbox"
                checked={draft.showThreats}
                onChange={(e) => updateDraft({ showThreats: e.target.checked })}
              />
            </div>
            {draft.showThreats && (
              <div className="setting-row">
                <label>Threat scope</label>
                <div className="seg-group">
                  <button
                    className={`seg ${draft.threatScope === 'lastMove' ? 'selected' : ''}`}
                    onClick={() => updateDraft({ threatScope: 'lastMove' })}
                    title="Only the piece that just moved"
                  >
                    Last move
                  </button>
                  <button
                    className={`seg ${draft.threatScope === 'board' ? 'selected' : ''}`}
                    onClick={() => updateDraft({ threatScope: 'board' })}
                    title="Every attack by either side, on every move"
                  >
                    Full board
                  </button>
                </div>
              </div>
            )}
            <div className="setting-row">
              <label>Show best-line arrows</label>
              <input
                type="checkbox"
                checked={draft.showAnalysisLines}
                onChange={(e) => updateDraft({ showAnalysisLines: e.target.checked })}
              />
            </div>
            {draft.showAnalysisLines && (
              <div className="setting-row">
                <label>Number of best lines</label>
                <div className="seg-group">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      className={`seg ${draft.analysisLineCount === n ? 'selected' : ''}`}
                      onClick={() =>
                        updateDraft({ analysisLineCount: n as 1 | 2 | 3 })
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="settings-footer">
            <button className="danger-btn" onClick={reset}>
              Reset to defaults
            </button>
          </div>
        </div>

        <div className="settings-savebar">
          <button
            className="text-btn"
            onClick={discard}
            disabled={!isDirty}
          >
            Discard
          </button>
          <button
            className="primary-btn"
            onClick={save}
            disabled={!isDirty}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
