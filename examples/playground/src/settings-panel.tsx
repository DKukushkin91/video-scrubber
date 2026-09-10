import { type ChangeEvent, type ReactElement, useCallback } from 'react';

import type { IDemoSettings } from './settings';

interface IProps {
  settings: IDemoSettings;
  onChange: (settings: IDemoSettings) => void;
}

export const SettingsPanel = ({ settings, onChange }: IProps): ReactElement => {
  const handlePlayChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...settings, play: event.target.checked });
    },
    [settings, onChange],
  );
  const handleLoopChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...settings, loop: event.target.checked });
    },
    [settings, onChange],
  );
  const handleSensitivityChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...settings, sensitivity: Number(event.target.value) });
    },
    [settings, onChange],
  );

  return (
    <div className="controls">
      <label>
        <input type="checkbox" checked={settings.play} onChange={handlePlayChange} /> play
      </label>
      <label>
        <input type="checkbox" checked={settings.loop} onChange={handleLoopChange} /> loop
      </label>
      <label>
        sensitivity{' '}
        <input
          type="range"
          min={0.25}
          max={4}
          step={0.25}
          value={settings.sensitivity}
          onChange={handleSensitivityChange}
        />{' '}
        <output>{settings.sensitivity}</output>
      </label>
    </div>
  );
};
