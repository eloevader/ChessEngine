import { useEffect, useState } from 'react';
import { useSettingsDraft } from '../settings/SettingsStore';
import type { GameMode, PlayerSide, EngineLevel } from '../settings/SettingsStore';

interface NewGameDialogProps {
  open: boolean;
  onStart: (config: { mode: GameMode; level?: EngineLevel; side?: PlayerSide; timeMin: number; timeSec: number; increment: number }) => void;
  onCancel: () => void;
}

const PRESETS: { label: string; min: number; sec: number; inc: number }[] = [
  { label: 'No clock', min: 0, sec: 0, inc: 0 },
  { label: '1+0 Bullet', min: 1, sec: 0, inc: 0 },
  { label: '3+2 Blitz', min: 3, sec: 0, inc: 2 },
  { label: '5+0 Blitz', min: 5, sec: 0, inc: 0 },
  { label: '10+0 Rapid', min: 10, sec: 0, inc: 0 },
  { label: '10+5 Rapid', min: 10, sec: 0, inc: 5 },
  { label: '15+10 Rapid', min: 15, sec: 0, inc: 10 },
  { label: '30+0 Classical', min: 30, sec: 0, inc: 0 },
  { label: 'Custom', min: 0, sec: 0, inc: 0 },
];

const ENGINE_LEVELS: EngineLevel[] = [1, 2, 3, 4, 5, 6, 7, 8];
const PLAYER_SIDES: { id: PlayerSide; label: string }[] = [
  { id: 'w', label: 'White' },
  { id: 'b', label: 'Black' },
  { id: 'random', label: 'Random' },
];

export function NewGameDialog({ open, onStart, onCancel }: NewGameDialogProps) {
  const { draft, updateDraft, save } = useSettingsDraft();
  const [presetIdx, setPresetIdx] = useState(2); // default 3+2
  const [min, setMin] = useState(3);
  const [sec, setSec] = useState(0);
  const [inc, setInc] = useState(2);

  useEffect(() => {
    if (open) {
      setMin(PRESETS[presetIdx].min);
      setSec(PRESETS[presetIdx].sec);
      setInc(PRESETS[presetIdx].inc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetIdx]);

  if (!open) return null;

  const totalSeconds = min * 60 + sec;
  const isCustom = presetIdx === PRESETS.length - 1;
  const isNoClock = totalSeconds === 0 && inc === 0;

  const onPresetChange = (idx: number) => {
    setPresetIdx(idx);
    setMin(PRESETS[idx].min);
    setSec(PRESETS[idx].sec);
    setInc(PRESETS[idx].inc);
  };

  const onStartClick = () => {
    // Save the chosen mode/level/side into settings so other components
    // see the new values immediately and the Settings panel reflects them.
    save();
    onStart({
      mode: draft.gameMode,
      level: draft.gameMode === 'computer' ? draft.engineLevel : undefined,
      side: draft.gameMode === 'computer' ? draft.playerSide : undefined,
      timeMin: min,
      timeSec: sec,
      increment: inc,
    });
  };

  return (
    <div className="ng-backdrop" onClick={onCancel}>
      <div className="ng-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="ng-header">
          <h2>New Game</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            {'\u2715'}
          </button>
        </div>
        <div className="ng-body">
          <section className="ng-section">
            <h3>Mode</h3>
            <div className="ng-seg three">
              <button
                className={`ng-seg-btn ${draft.gameMode === 'local' ? 'selected' : ''}`}
                onClick={() => updateDraft({ gameMode: 'local' })}
              >
                <span className="ng-seg-label">2 Players</span>
                <span className="ng-seg-hint">Play offline</span>
              </button>
              <button
                className={`ng-seg-btn ${draft.gameMode === 'computer' ? 'selected' : ''}`}
                onClick={() => updateDraft({ gameMode: 'computer' })}
              >
                <span className="ng-seg-label">vs Computer</span>
                <span className="ng-seg-hint">Stockfish engine</span>
              </button>
              <button
                className={`ng-seg-btn ${draft.gameMode === 'analysis' ? 'selected' : ''}`}
                onClick={() => updateDraft({ gameMode: 'analysis' })}
              >
                <span className="ng-seg-label">Analysis</span>
                <span className="ng-seg-hint">No clock, no opponent</span>
              </button>
            </div>
          </section>

          {draft.gameMode === 'computer' && (
            <section className="ng-section">
              <h3>Engine</h3>
              <div className="ng-row">
                <label>Level</label>
                <div className="ng-level-row">
                  {ENGINE_LEVELS.map((l) => (
                    <button
                      key={l}
                      className={`ng-level-btn ${draft.engineLevel === l ? 'selected' : ''}`}
                      onClick={() => updateDraft({ engineLevel: l })}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ng-row">
                <label>You play as</label>
                <div className="ng-seg small">
                  {PLAYER_SIDES.map((s) => (
                    <button
                      key={s.id}
                      className={`ng-seg-btn ${draft.playerSide === s.id ? 'selected' : ''}`}
                      onClick={() => updateDraft({ playerSide: s.id })}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {draft.gameMode !== 'analysis' && (
            <section className="ng-section">
              <h3>Time Control</h3>
              <div className="ng-preset-grid">
                {PRESETS.map((p, i) => (
                  <button
                    key={p.label}
                    className={`ng-preset ${presetIdx === i ? 'selected' : ''}`}
                    onClick={() => onPresetChange(i)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {isCustom && (
                <div className="ng-custom">
                  <div className="ng-row">
                    <label>Minutes</label>
                    <input
                      type="number"
                      min="0"
                      max="180"
                      value={min}
                      onChange={(e) => setMin(Math.max(0, parseInt(e.target.value) || 0))}
                    />
                  </div>
                  <div className="ng-row">
                    <label>Seconds</label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={sec}
                      onChange={(e) => setSec(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                    />
                  </div>
                  <div className="ng-row">
                    <label>Increment (sec)</label>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={inc}
                      onChange={(e) => setInc(Math.max(0, parseInt(e.target.value) || 0))}
                    />
                  </div>
                </div>
              )}
              <div className="ng-summary">
                {isNoClock ? (
                  <span>No time limit</span>
                ) : (
                  <span>
                    {min > 0 ? `${min}m ` : ''}
                    {sec > 0 ? `${sec}s ` : ''}
                    {inc > 0 ? `+ ${inc}s increment` : ''}
                  </span>
                )}
              </div>
            </section>
          )}
        </div>
        <div className="ng-footer">
          <button className="text-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-btn" onClick={onStartClick}>
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
