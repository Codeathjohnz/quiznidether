import { TIME_UNITS, fmtTimer } from '../utils';

const UNIT_LABELS = { seconds: 'Seconds', minutes: 'Minutes', hours: 'Hours' };

/** Number + unit picker (seconds / minutes / hours) with a live preview of the total time. */
export default function TimerInput({ label, value, unit, onChange, who }) {
  const secs = Math.round((Number(value) || 0) * (TIME_UNITS[unit] || 60));
  const invalid = value !== '' && (secs < 5 || secs > 86400);
  return (
    <div className="timer-field">
      <div className="label">{label}</div>
      <div className="timer-input">
        <input
          type="number"
          min="0"
          step={unit === 'hours' ? '0.25' : '1'}
          required
          value={value}
          onChange={(e) => onChange({ value: e.target.value, unit })}
          aria-label={`${label} amount`}
        />
        <div className="unit-picker" role="radiogroup" aria-label={`${label} unit`}>
          {Object.keys(TIME_UNITS).map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              className={unit === u ? 'active' : ''}
              onClick={() => onChange({ value, unit: u })}
            >
              {UNIT_LABELS[u]}
            </button>
          ))}
        </div>
      </div>
      <p className={`hint timer-preview ${invalid ? 'danger-text' : ''}`}>
        {invalid ? '⚠ Must be between 5 seconds and 24 hours.' : `⏰ Students will have ${fmtTimer(secs)}${who ? ` for ${who}` : ''}.`}
      </p>
    </div>
  );
}
