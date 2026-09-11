import {
  EnumGestureEnd,
  EnumGesturePhase,
  IDLE_GESTURE,
  type IGestureState,
  type IScrubParams,
  beginGesture,
  clampTime,
  endGesture,
  formatTimeText,
  isPlayableDuration,
  isSeekKey,
  keyToSeekTime,
  moveGesture,
  rebaseGesture,
} from './scrub-math';

export interface IVideoScrubberOptions {
  play?: boolean;
  loop?: boolean;
  sensitivity?: number;
  invertDirection?: boolean;
  dragThresholdPx?: number;
  keyboardStepSeconds?: number;
  pageStepSeconds?: number;
  getTrackWidth?: (pointerTarget: HTMLElement) => number;
  formatValueText?: (currentTime: number, duration: number) => string;
  onPlaybackError?: (error: unknown) => void;
}

export interface IAttachTargets {
  pointerTarget: HTMLElement;
  controlTarget?: HTMLElement | null;
}

export interface IVideoScrubberSnapshot {
  isDragging: boolean;
  duration: number | null;
  currentTime: number;
  play: boolean;
}

export interface IVideoScrubber {
  attach: (targets: IAttachTargets) => void;
  detach: () => void;
  destroy: () => void;
  update: (options: Partial<IVideoScrubberOptions>) => void;
  seekTo: (time: number) => void;
  seekBy: (seconds: number) => void;
  getSnapshot: () => IVideoScrubberSnapshot;
  subscribe: (listener: () => void) => () => void;
}

interface IResolvedOptions {
  play: boolean;
  loop: boolean;
  sensitivity: number;
  invertDirection: boolean;
  dragThresholdPx: number;
  keyboardStepSeconds: number;
  pageStepSeconds: number;
  getTrackWidth: ((pointerTarget: HTMLElement) => number) | null;
  formatValueText: (currentTime: number, duration: number) => string;
  onPlaybackError: ((error: unknown) => void) | null;
}

const INTERACTIVE_DESCENDANTS =
  'a, button, input, select, textarea, summary, label, [role="button"], [role="link"], [contenteditable]:not([contenteditable="false"]), [data-scrub-ignore]';
const TOUCH_ACTION = 'pan-y pinch-zoom';
const PRIMARY_MOUSE_BUTTON = 0;
const PRIMARY_BUTTONS_MASK = 1;
const ARIA_ATTRIBUTES = [
  'aria-valuemin',
  'aria-valuemax',
  'aria-valuenow',
  'aria-valuetext',
  'aria-disabled',
];

const DEFAULT_OPTIONS: IResolvedOptions = {
  play: true,
  loop: true,
  sensitivity: 1,
  invertDirection: false,
  dragThresholdPx: 4,
  keyboardStepSeconds: 1,
  pageStepSeconds: 10,
  getTrackWidth: null,
  formatValueText: formatTimeText,
  onPlaybackError: null,
};

const assertOption = (name: string, value: number, allowZero: boolean): void => {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new RangeError(
      `video-scrubber: option "${name}" must be a finite number ${allowZero ? '>= 0' : '> 0'}, got ${String(value)}`,
    );
  }
};

const resolveOptions = (
  current: IResolvedOptions,
  next: Partial<IVideoScrubberOptions>,
): IResolvedOptions => {
  const has = (key: keyof IVideoScrubberOptions): boolean => Object.hasOwn(next, key);
  const resolved: IResolvedOptions = {
    play: has('play') ? (next.play ?? DEFAULT_OPTIONS.play) : current.play,
    loop: has('loop') ? (next.loop ?? DEFAULT_OPTIONS.loop) : current.loop,
    sensitivity: has('sensitivity') ? (next.sensitivity ?? DEFAULT_OPTIONS.sensitivity) : current.sensitivity,
    invertDirection: has('invertDirection')
      ? (next.invertDirection ?? DEFAULT_OPTIONS.invertDirection)
      : current.invertDirection,
    dragThresholdPx: has('dragThresholdPx')
      ? (next.dragThresholdPx ?? DEFAULT_OPTIONS.dragThresholdPx)
      : current.dragThresholdPx,
    keyboardStepSeconds: has('keyboardStepSeconds')
      ? (next.keyboardStepSeconds ?? DEFAULT_OPTIONS.keyboardStepSeconds)
      : current.keyboardStepSeconds,
    pageStepSeconds: has('pageStepSeconds')
      ? (next.pageStepSeconds ?? DEFAULT_OPTIONS.pageStepSeconds)
      : current.pageStepSeconds,
    getTrackWidth: has('getTrackWidth')
      ? (next.getTrackWidth ?? DEFAULT_OPTIONS.getTrackWidth)
      : current.getTrackWidth,
    formatValueText: has('formatValueText')
      ? (next.formatValueText ?? DEFAULT_OPTIONS.formatValueText)
      : current.formatValueText,
    onPlaybackError: has('onPlaybackError')
      ? (next.onPlaybackError ?? DEFAULT_OPTIONS.onPlaybackError)
      : current.onPlaybackError,
  };

  assertOption('sensitivity', resolved.sensitivity, false);
  assertOption('dragThresholdPx', resolved.dragThresholdPx, true);
  assertOption('keyboardStepSeconds', resolved.keyboardStepSeconds, false);
  assertOption('pageStepSeconds', resolved.pageStepSeconds, false);

  return resolved;
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

const isInteractiveDescendant = (target: EventTarget | null, root: HTMLElement): boolean => {
  const interactive = target instanceof Element ? target.closest(INTERACTIVE_DESCENDANTS) : null;

  return interactive !== null && interactive !== root && root.contains(interactive);
};

const isSameSnapshot = (left: IVideoScrubberSnapshot, right: IVideoScrubberSnapshot): boolean =>
  left.isDragging === right.isDragging &&
  left.duration === right.duration &&
  left.currentTime === right.currentTime &&
  left.play === right.play;

/**
 * Один контроллер на один `<video>`. Указатель захватывается уже на `pointerdown`, иначе `pointerup`
 * за пределами цели теряется и жест «залипает»; видео ставится на паузу только при переходе в
 * перетаскивание, поэтому обычный клик воспроизведение не трогает. Seek-очередь — last-value-wins
 * с одним присваиванием `currentTime` на кадр: по спецификации новое присваивание отменяет
 * незавершённый seek, и на `video.seeking` контроллер не смотрит — иначе потерянный `seeked` его
 * подвешивал бы. Любая перезагрузка медиа (смена `src`, собственный `load()` на первом жесте)
 * приходит как `emptied`, после которого браузер сам ставит паузу — `play` заново утверждается там же
 * и в конце жеста, иначе «крутится, пока play» переставало бы быть правдой. На верхнем уровне модуля
 * DOM не трогается — пакет импортируется на сервере.
 */
export const createVideoScrubber = (
  video: HTMLVideoElement,
  options: IVideoScrubberOptions = {},
): IVideoScrubber => {
  let resolved = resolveOptions(DEFAULT_OPTIONS, options);
  let gesture: IGestureState = IDLE_GESTURE;
  let activePointerId: number | null = null;
  let lastClientX = 0;
  let lastClientY = 0;
  let duration: number | null = isPlayableDuration(video.duration) ? video.duration : null;
  let pointerTarget: HTMLElement | null = null;
  let controlTarget: HTMLElement | null = null;
  let pendingSeek: number | null = null;
  let rafId: number | null = null;
  let suppressNextClick = false;
  let awaitingSelfLoad = false;
  let savedTouchAction = '';
  let savedUserSelect = '';
  let savedWebkitUserSelect = '';
  let savedControlAttributes: [string, string | null][] = [];
  let lastAriaSecond = -1;
  let lastAriaText = '';
  let destroyed = false;
  let snapshot: IVideoScrubberSnapshot = {
    isDragging: false,
    duration,
    currentTime: video.currentTime,
    play: resolved.play,
  };
  const listeners = new Set<() => void>();

  const notify = (): void => {
    const next: IVideoScrubberSnapshot = {
      isDragging: gesture.phase === EnumGesturePhase.Dragging,
      duration,
      currentTime: video.currentTime,
      play: resolved.play,
    };

    if (isSameSnapshot(next, snapshot)) {
      return;
    }

    snapshot = next;

    for (const listener of listeners) {
      listener();
    }
  };

  const applyAria = (): void => {
    const control = controlTarget;

    if (control === null) {
      return;
    }

    control.setAttribute('aria-valuemin', '0');

    if (duration === null) {
      control.setAttribute('aria-valuemax', '0');
      control.setAttribute('aria-valuenow', '0');
      control.setAttribute('aria-valuetext', resolved.formatValueText(0, 0));
      control.setAttribute('aria-disabled', 'true');
      lastAriaSecond = -1;
      lastAriaText = '';

      return;
    }

    lastAriaSecond = Math.floor(video.currentTime);
    lastAriaText = resolved.formatValueText(video.currentTime, duration);
    control.setAttribute('aria-valuemax', String(Math.floor(duration)));
    control.setAttribute('aria-valuenow', String(lastAriaSecond));
    control.setAttribute('aria-valuetext', lastAriaText);
    control.removeAttribute('aria-disabled');
  };

  const cancelFrame = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const flushSeek = (): void => {
    cancelFrame();

    if (pendingSeek === null) {
      return;
    }

    const seekTime = pendingSeek;

    pendingSeek = null;

    if (seekTime !== video.currentTime) {
      video.currentTime = seekTime;
    }
  };

  const handleFrame = (): void => {
    rafId = null;
    flushSeek();
  };

  const requestSeek = (time: number): void => {
    pendingSeek = time;

    if (rafId === null) {
      rafId = requestAnimationFrame(handleFrame);
    }
  };

  const handlePlaybackError = (error: unknown): void => {
    if (!destroyed && !isAbortError(error)) {
      resolved.onPlaybackError?.(error);
    }
  };

  const resumePlayback = (): void => {
    void video.play().catch(handlePlaybackError);
  };

  const getScrubParams = (): IScrubParams => ({
    duration,
    sensitivity: resolved.sensitivity,
    invertDirection: resolved.invertDirection,
    dragThresholdPx: resolved.dragThresholdPx,
  });

  const finishGesture = (reason: EnumGestureEnd, resume: boolean): void => {
    const target = pointerTarget;

    if (activePointerId === null || target === null) {
      return;
    }

    const { wasDrag } = endGesture(gesture);
    const pointerId = activePointerId;

    gesture = IDLE_GESTURE;
    activePointerId = null;
    awaitingSelfLoad = false;
    target.style.userSelect = savedUserSelect;
    target.style.webkitUserSelect = savedWebkitUserSelect;

    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }

    suppressNextClick = wasDrag && reason === EnumGestureEnd.Release;

    if (wasDrag) {
      flushSeek();
    }

    if (resume && resolved.play && (wasDrag || video.paused)) {
      resumePlayback();
    }

    notify();
  };

  const ensureMediaLoading = (): void => {
    if (video.readyState === video.HAVE_NOTHING && video.networkState !== video.NETWORK_LOADING) {
      awaitingSelfLoad = true;
      video.load();
    }
  };

  const handlePointerDown = (event: PointerEvent): void => {
    const target = pointerTarget;

    suppressNextClick = false;

    if (activePointerId !== null || target === null) {
      return;
    }

    if (event.pointerType === 'mouse' && event.button !== PRIMARY_MOUSE_BUTTON) {
      return;
    }

    if (isInteractiveDescendant(event.target, target)) {
      return;
    }

    ensureMediaLoading();

    const trackWidth = resolved.getTrackWidth?.(target) ?? target.getBoundingClientRect().width;

    gesture = beginGesture(event.clientX, event.clientY, video.currentTime, trackWidth);
    activePointerId = event.pointerId;
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    savedUserSelect = target.style.userSelect;
    savedWebkitUserSelect = target.style.webkitUserSelect;
    target.style.userSelect = 'none';
    target.style.webkitUserSelect = 'none';
    target.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== activePointerId) {
      return;
    }

    if (event.pointerType === 'mouse' && (event.buttons & PRIMARY_BUTTONS_MASK) === 0) {
      finishGesture(EnumGestureEnd.Cancel, true);

      return;
    }

    lastClientX = event.clientX;
    lastClientY = event.clientY;

    let moveResult = moveGesture(gesture, event.clientX, event.clientY, getScrubParams());

    if (gesture.phase === EnumGesturePhase.Pending && moveResult.state.phase === EnumGesturePhase.Dragging) {
      video.pause();
      moveResult = moveGesture(
        rebaseGesture(moveResult.state, video.currentTime),
        event.clientX,
        event.clientY,
        getScrubParams(),
      );
    }

    const phaseChanged = moveResult.state.phase !== gesture.phase;

    gesture = moveResult.state;

    if (moveResult.seekTo !== null) {
      requestSeek(moveResult.seekTo);
    }

    if (phaseChanged) {
      notify();
    }
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId === activePointerId) {
      finishGesture(EnumGestureEnd.Release, true);
    }
  };

  const handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === activePointerId) {
      finishGesture(EnumGestureEnd.Cancel, true);
    }
  };

  const handleClick = (event: MouseEvent): void => {
    if (!suppressNextClick) {
      return;
    }

    suppressNextClick = false;

    if (event.detail === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragStart = (event: DragEvent): void => {
    if (gesture.phase !== EnumGesturePhase.Idle) {
      event.preventDefault();
    }
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (
      event.target !== controlTarget ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !isSeekKey(event.key)
    ) {
      return;
    }

    ensureMediaLoading();

    if (duration === null) {
      return;
    }

    const seekTime = keyToSeekTime(event.key, pendingSeek ?? video.currentTime, {
      duration,
      stepSeconds: resolved.keyboardStepSeconds,
      pageStepSeconds: resolved.pageStepSeconds,
    });

    if (seekTime === null) {
      return;
    }

    event.preventDefault();
    requestSeek(seekTime);
  };

  const handleDurationChange = (): void => {
    duration = isPlayableDuration(video.duration) ? video.duration : null;
    applyAria();

    if (gesture.phase === EnumGesturePhase.Dragging && duration !== null) {
      const moveResult = moveGesture(gesture, lastClientX, lastClientY, getScrubParams());

      if (moveResult.seekTo !== null) {
        requestSeek(moveResult.seekTo);
      }
    }

    notify();
  };

  const handleTimeUpdate = (): void => {
    const control = controlTarget;

    if (control !== null && duration !== null) {
      const second = Math.floor(video.currentTime);
      const valueText = resolved.formatValueText(video.currentTime, duration);

      if (second !== lastAriaSecond || valueText !== lastAriaText) {
        lastAriaSecond = second;
        lastAriaText = valueText;
        control.setAttribute('aria-valuenow', String(second));
        control.setAttribute('aria-valuetext', valueText);
      }
    }

    notify();
  };

  const handleMediaError = (): void => {
    cancelFrame();
    pendingSeek = null;
    finishGesture(EnumGestureEnd.Cancel, false);
    duration = null;
    applyAria();
    notify();
  };

  const handleEmptied = (): void => {
    const keepGesture = awaitingSelfLoad;

    awaitingSelfLoad = false;
    cancelFrame();
    pendingSeek = null;

    if (!keepGesture) {
      finishGesture(EnumGestureEnd.Cancel, false);
    }

    duration = null;
    applyAria();

    if (resolved.play && activePointerId === null) {
      resumePlayback();
    }

    notify();
  };

  const detach = (): void => {
    const target = pointerTarget;
    const control = controlTarget;

    if (target === null) {
      return;
    }

    finishGesture(EnumGestureEnd.Cancel, true);
    target.removeEventListener('pointerdown', handlePointerDown);
    target.removeEventListener('pointermove', handlePointerMove);
    target.removeEventListener('pointerup', handlePointerUp);
    target.removeEventListener('pointercancel', handlePointerCancel);
    target.removeEventListener('lostpointercapture', handlePointerCancel);
    target.removeEventListener('click', handleClick, { capture: true });
    target.removeEventListener('dragstart', handleDragStart);
    target.style.touchAction = savedTouchAction;

    if (control !== null) {
      control.removeEventListener('keydown', handleKeyDown);

      for (const [name, value] of savedControlAttributes) {
        if (value === null) {
          control.removeAttribute(name);
        } else {
          control.setAttribute(name, value);
        }
      }
    }

    pointerTarget = null;
    controlTarget = null;
    savedControlAttributes = [];
  };

  const attach = (targets: IAttachTargets): void => {
    if (destroyed) {
      return;
    }

    detach();

    const target = targets.pointerTarget;
    const control = targets.controlTarget === undefined ? target : targets.controlTarget;

    pointerTarget = target;
    controlTarget = control;
    savedTouchAction = target.style.touchAction;
    target.style.touchAction = TOUCH_ACTION;
    target.addEventListener('pointerdown', handlePointerDown);
    target.addEventListener('pointermove', handlePointerMove);
    target.addEventListener('pointerup', handlePointerUp);
    target.addEventListener('pointercancel', handlePointerCancel);
    target.addEventListener('lostpointercapture', handlePointerCancel);
    target.addEventListener('click', handleClick, { capture: true });
    target.addEventListener('dragstart', handleDragStart);

    if (control !== null) {
      savedControlAttributes = ARIA_ATTRIBUTES.map((name) => [name, control.getAttribute(name)]);
      control.addEventListener('keydown', handleKeyDown);
      applyAria();
    }
  };

  const update = (next: Partial<IVideoScrubberOptions>): void => {
    if (destroyed) {
      return;
    }

    const previous = resolved;

    resolved = resolveOptions(previous, next);

    if (resolved.loop !== previous.loop) {
      video.loop = resolved.loop;
    }

    if (resolved.play !== previous.play && gesture.phase !== EnumGesturePhase.Dragging) {
      if (resolved.play) {
        resumePlayback();
      } else {
        video.pause();
      }
    }

    if (resolved.formatValueText !== previous.formatValueText) {
      applyAria();
    }

    notify();
  };

  const seekTo = (time: number): void => {
    if (destroyed) {
      return;
    }

    if (duration !== null) {
      requestSeek(clampTime(time, duration));
    }
  };

  const seekBy = (seconds: number): void => {
    if (destroyed) {
      return;
    }

    seekTo((pendingSeek ?? video.currentTime) + seconds);
  };

  const getSnapshot = (): IVideoScrubberSnapshot => snapshot;

  const subscribe = (listener: () => void): (() => void) => {
    if (destroyed) {
      return () => undefined;
    }

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };

  const destroy = (): void => {
    if (destroyed) {
      return;
    }

    destroyed = true;
    cancelFrame();
    pendingSeek = null;
    finishGesture(EnumGestureEnd.Cancel, false);
    detach();
    video.removeEventListener('loadedmetadata', handleDurationChange);
    video.removeEventListener('durationchange', handleDurationChange);
    video.removeEventListener('timeupdate', handleTimeUpdate);
    video.removeEventListener('emptied', handleEmptied);
    video.removeEventListener('error', handleMediaError);
    listeners.clear();
  };

  video.addEventListener('loadedmetadata', handleDurationChange);
  video.addEventListener('durationchange', handleDurationChange);
  video.addEventListener('timeupdate', handleTimeUpdate);
  video.addEventListener('emptied', handleEmptied);
  video.addEventListener('error', handleMediaError);
  video.loop = resolved.loop;

  if (resolved.play) {
    resumePlayback();
  }

  return { attach, detach, destroy, update, seekTo, seekBy, getSnapshot, subscribe };
};
