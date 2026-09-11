# @dskukushkin/video-scrubber

Drag a `<video>` like an object: press and move right to play it forward, move left to play it backward, cross either end and it wraps around — an endless loop in both directions. On touch devices the same works with a horizontal swipe while vertical scrolling and pinch-zoom keep working. Release the pointer and the frame stays; with `play` enabled the clip continues from that frame.

- Framework-agnostic core (`@dskukushkin/video-scrubber`) — no dependencies.
- Optional React adapter (`@dskukushkin/video-scrubber/react`) — `useVideoScrubber` and `<ScrubVideo>`.
- Safe to import on the server: nothing touches the DOM until a controller is created.
- Keyboard support and slider ARIA out of the box.

## Install

```bash
pnpm add @dskukushkin/video-scrubber
```

React is an optional peer dependency (`>=18`) — only needed for the `/react` entry.

## React

```tsx
import { ScrubVideo } from '@dskukushkin/video-scrubber/react';

export const PlanPreview = ({ isHovered }: { isHovered: boolean }) => (
  <ScrubVideo
    src="/videos/plan.mp4"
    poster="/videos/plan.jpg"
    label="Apartment walkthrough"
    play={isHovered}
    className="preview"
    videoClassName="preview-video"
  />
);
```

`ScrubVideo` renders a focusable `role="slider"` wrapper around a muted, inline, `preload="metadata"` video. Styling is yours: pass `className` for the wrapper and `videoClassName` for the video (keep `pointer-events: none` on the video so the wrapper receives the gesture).

Need your own markup, or the gesture on a larger surface than the slider itself? Use the hook:

```tsx
import { useCallback, useRef } from 'react';
import { useVideoScrubber } from '@dskukushkin/video-scrubber/react';

export const Card = () => {
  const cardRef = useRef<HTMLElement | null>(null);
  const { videoRef, controlRef, snapshot, seekBy } = useVideoScrubber({
    play: false,
    pointerTargetRef: cardRef,
  });
  const handleStepForward = useCallback(() => {
    seekBy(1);
  }, [seekBy]);

  return (
    <article ref={cardRef}>
      <div
        ref={controlRef}
        role="slider"
        tabIndex={0}
        aria-label="Walkthrough"
        aria-valuemin={0}
        aria-valuemax={0}
        aria-valuenow={0}
        aria-disabled
      >
        <video ref={videoRef} src="/videos/plan.mp4" muted playsInline preload="metadata" aria-hidden />
      </div>
      <p>{snapshot.currentTime.toFixed(1)} s</p>
      <button type="button" onClick={handleStepForward}>
        +1 s
      </button>
      <a href="/details">Details</a>
    </article>
  );
};
```

The pointer target (`pointerTargetRef`, the whole card here) receives the drag; the control target (`controlRef`) receives keyboard events and ARIA updates. Links, buttons, inputs and anything marked `data-scrub-ignore` inside the pointer target keep working — pressing on them never starts a gesture, and a click without movement is never swallowed.

Both refs are callback refs, so conditional rendering and node replacement are handled. Changing `play`, `loop`, `sensitivity` or the other options updates the running controller instead of recreating it.

## Vanilla

```ts
import { createVideoScrubber } from '@dskukushkin/video-scrubber';

const video = document.querySelector('video')!;
const control = video.parentElement!;

const scrubber = createVideoScrubber(video, { play: true, loop: true });
scrubber.attach({ pointerTarget: control });

scrubber.subscribe(() => {
  const { currentTime, duration, isDragging, play } = scrubber.getSnapshot();

  readout.textContent = `${currentTime.toFixed(1)} / ${String(duration ?? '?')}${isDragging ? ' (dragging)' : ''}${play ? '' : ' (paused)'}`;
});

scrubber.update({ play: false });
scrubber.destroy();
```

`attach({ pointerTarget, controlTarget })` takes two elements: the pointer target receives the drag; the control target receives keyboard events and the slider values (`aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext`, plus `aria-disabled` until the duration is known — all restored on detach). Omit `controlTarget` to use the pointer target for both; pass `null` to turn keyboard and ARIA off — the right choice when the pointer target is a whole card with links and no slider role of its own.

The controller exposes `attach(targets)`, `detach()`, `destroy()` (terminal — later calls are ignored), `update(partialOptions)`, `seekTo(seconds)` and `seekBy(seconds)` (both clamp to the clip), `getSnapshot()` → `{ currentTime, duration, isDragging, play }` and `subscribe(listener)`. The `.` entry also exports the helpers `wrapTime(time, duration)` (wraps into `[0, duration)`), `clampTime(time, duration)` (clamps into `[0, duration]`) and `formatTimeText(currentTime, duration)` (the default `aria-valuetext` formatter).

The core never sets `muted`, `preload` or ARIA roles on your elements — give the video `muted` and `playsinline` if you want autoplay, `preload="metadata"` so the duration is known before the first gesture, and the control target `role="slider"` with `tabindex="0"` if you want keyboard access.

## Options

| Option                | Default       | Meaning                                                                                                 |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| `play`                | `true`        | Keep the clip playing; a drag pauses it and it resumes from the released frame.                         |
| `loop`                | `true`        | Sets `video.loop` for playback. Dragging always wraps regardless.                                       |
| `sensitivity`         | `1`           | How many loops one full drag across the pointer target makes. `2` — half the width is a full loop.      |
| `invertDirection`     | `false`       | Dragging or swiping right rewinds and left plays forward. Keyboard keys keep their usual meaning.       |
| `dragThresholdPx`     | `4`           | Horizontal movement before a press becomes a drag. Movement must also be more horizontal than vertical. |
| `keyboardStepSeconds` | `1`           | Arrow keys step.                                                                                        |
| `pageStepSeconds`     | `10`          | PageUp / PageDown step.                                                                                 |
| `getTrackWidth`       | —             | Custom track width instead of the pointer target's bounding width.                                      |
| `formatValueText`     | `m:ss / m:ss` | `aria-valuetext` formatter.                                                                             |
| `onPlaybackError`     | —             | Called when `video.play()` rejects for a reason other than an interrupted play.                         |

Numeric options are validated; an invalid value throws a `RangeError`.

## Behaviour details

- Drag position is computed from the total offset since the press, so the gesture is O(1) per event and wraps naturally (`8 s + 5 s` on a 10 s clip is `3 s`).
- At most one `currentTime` assignment per animation frame; the last requested position wins and is flushed before playback resumes.
- Keyboard (`←` `→` `↑` `↓` `PageUp` `PageDown` `Home` `End`), `seekTo` and `seekBy` clamp to `[0, duration]` — slider semantics — while dragging wraps.
- `touch-action: pan-y pinch-zoom` is applied to the pointer target while attached; `user-select: none` only for the duration of a gesture. Both are restored on detach.
- If the browser has not loaded metadata yet (iOS ignores `preload` until a gesture), the first press calls `video.load()` and the accumulated drag is applied as soon as the duration is known.

## Accessibility

The control target gets `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext` kept in sync with the clip, and `aria-disabled="true"` until metadata is available. Give it an accessible name (`aria-label` or `aria-labelledby`); `ScrubVideo` requires `label` for that reason. Original attributes are restored on detach.

## SSR and Next.js

The `/react` entry is marked `'use client'`. `ScrubVideo` renders identical markup on the server and the client — behaviour props never change the HTML — so there are no hydration mismatches. Importing either entry in Node is safe.

## Video encoding

Scrubbing seeks to arbitrary frames, so keyframe spacing decides how smooth it feels. Encode with dense keyframes and no B-frames, for example:

```bash
ffmpeg -i in.mp4 -an -c:v libx264 -profile:v main -preset slow -crf 22 -pix_fmt yuv420p \
  -g 6 -keyint_min 6 -sc_threshold 0 -bf 0 -movflags +faststart out.mp4
```

## Development

```bash
pnpm install
pnpm check          # format, lint (oxlint, type-aware), comment policy, tsc, build, contract checks, publint/attw, playground
pnpm build:watch    # in one terminal
pnpm dev            # playground on http://localhost:5173 (React) and /vanilla.html
```

Built with TypeScript 7, tsdown, oxlint and oxfmt. Contract checks run with `node --test` against the built output. The library's internal gesture math is exported from a non-public `internal` entry for those checks only; the public types intentionally expose no enums, so projects with `isolatedModules` are unaffected.

## License

MIT
