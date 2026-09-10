import { useVideoScrubber } from '@dskukushkin/video-scrubber/react';
import { type ReactElement, useCallback } from 'react';

import type { IDemoSettings } from './settings';

export const HookDemo = ({ play, loop, sensitivity }: IDemoSettings): ReactElement => {
  const { videoRef, controlRef, snapshot, seekBy } = useVideoScrubber({ play, loop, sensitivity });
  const handleStepBack = useCallback(() => {
    seekBy(-1);
  }, [seekBy]);
  const handleStepForward = useCallback(() => {
    seekBy(1);
  }, [seekBy]);

  return (
    <section>
      <h2>useVideoScrubber</h2>
      <div
        ref={controlRef}
        className="scrub"
        role="slider"
        tabIndex={0}
        aria-label="Plan walkthrough (hook)"
        aria-valuemin={0}
        aria-valuemax={0}
        aria-valuenow={0}
        aria-disabled
      >
        <video
          ref={videoRef}
          src="/president.mp4"
          poster="/president.jpg"
          muted
          playsInline
          preload="metadata"
          aria-hidden
        />
      </div>
      <p className="readout">
        {snapshot.currentTime.toFixed(2)} / {snapshot.duration?.toFixed(2) ?? '—'} s ·{' '}
        {snapshot.isDragging ? 'dragging' : 'idle'} · play {String(snapshot.play)}
      </p>
      <div className="controls">
        <button type="button" onClick={handleStepBack}>
          −1 s
        </button>
        <button type="button" onClick={handleStepForward}>
          +1 s
        </button>
      </div>
    </section>
  );
};
