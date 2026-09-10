import { ScrubVideo } from '@dskukushkin/video-scrubber/react';
import { type ReactElement, useState } from 'react';

import { HookDemo } from './hook-demo';
import { DEFAULT_SETTINGS } from './settings';
import { SettingsPanel } from './settings-panel';

export const App = (): ReactElement => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  return (
    <main>
      <nav>
        <a href="/vanilla.html">Vanilla playground</a>
      </nav>
      <h1>@dskukushkin/video-scrubber</h1>
      <p>
        Drag or swipe horizontally to scrub. Arrow keys, PageUp/PageDown, Home and End work when a preview is
        focused.
      </p>
      <SettingsPanel settings={settings} onChange={setSettings} />
      <div className="demos">
        <section>
          <h2>ScrubVideo</h2>
          <ScrubVideo
            src="/president.mp4"
            poster="/president.jpg"
            label="Plan walkthrough (component)"
            className="scrub"
            play={settings.play}
            loop={settings.loop}
            sensitivity={settings.sensitivity}
          />
        </section>
        <HookDemo {...settings} />
      </div>
    </main>
  );
};
