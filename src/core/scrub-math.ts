export const enum EnumGesturePhase {
  Idle = 'idle',
  Pending = 'pending',
  Dragging = 'dragging',
}

export const enum EnumGestureEnd {
  Release = 'release',
  Cancel = 'cancel',
}

export const enum EnumSeekKey {
  ArrowRight = 'ArrowRight',
  ArrowUp = 'ArrowUp',
  ArrowLeft = 'ArrowLeft',
  ArrowDown = 'ArrowDown',
  PageUp = 'PageUp',
  PageDown = 'PageDown',
  Home = 'Home',
  End = 'End',
}

export interface IGestureState {
  phase: EnumGesturePhase;
  startX: number;
  startY: number;
  startTime: number;
  trackWidth: number;
}

export interface IScrubParams {
  duration: number | null;
  sensitivity: number;
  dragThresholdPx: number;
}

export interface IMoveResult {
  state: IGestureState;
  seekTo: number | null;
}

export interface IEndResult {
  state: IGestureState;
  wasDrag: boolean;
}

export interface IKeyboardParams {
  duration: number;
  stepSeconds: number;
  pageStepSeconds: number;
}

export const IDLE_GESTURE: IGestureState = {
  phase: EnumGesturePhase.Idle,
  startX: 0,
  startY: 0,
  startTime: 0,
  trackWidth: 0,
};

export const isPlayableDuration = (duration: number | null): duration is number =>
  duration !== null && Number.isFinite(duration) && duration > 0;

export const wrapTime = (time: number, duration: number): number => {
  if (!isPlayableDuration(duration) || !Number.isFinite(time)) {
    return 0;
  }

  return ((time % duration) + duration) % duration;
};

export const clampTime = (time: number, duration: number): number => {
  if (!isPlayableDuration(duration) || !Number.isFinite(time)) {
    return 0;
  }

  return Math.min(Math.max(time, 0), duration);
};

export const deltaToSeconds = (
  deltaX: number,
  trackWidth: number,
  duration: number,
  sensitivity: number,
): number => {
  if (trackWidth <= 0 || !isPlayableDuration(duration) || !Number.isFinite(deltaX)) {
    return 0;
  }

  return (deltaX / trackWidth) * duration * sensitivity;
};

export const beginGesture = (
  startX: number,
  startY: number,
  startTime: number,
  trackWidth: number,
): IGestureState => ({
  phase: EnumGesturePhase.Pending,
  startX,
  startY,
  startTime,
  trackWidth,
});

export const rebaseGesture = (state: IGestureState, startTime: number): IGestureState => ({
  ...state,
  startTime,
});

const hasCrossedDragThreshold = (deltaX: number, deltaY: number, dragThresholdPx: number): boolean =>
  Math.abs(deltaX) >= dragThresholdPx && Math.abs(deltaX) >= Math.abs(deltaY);

/**
 * Позиция считается от точки нажатия по суммарному смещению, а не накоплением приращений: каждое
 * событие — O(1) без дрейфа округления, а выход за длительность на любое число кругов схлопывает
 * `wrapTime`.
 */
export const moveGesture = (
  state: IGestureState,
  clientX: number,
  clientY: number,
  params: IScrubParams,
): IMoveResult => {
  if (state.phase === EnumGesturePhase.Idle) {
    return { state, seekTo: null };
  }

  const deltaX = clientX - state.startX;
  const deltaY = clientY - state.startY;

  if (
    state.phase === EnumGesturePhase.Pending &&
    !hasCrossedDragThreshold(deltaX, deltaY, params.dragThresholdPx)
  ) {
    return { state, seekTo: null };
  }

  const draggingState =
    state.phase === EnumGesturePhase.Dragging ? state : { ...state, phase: EnumGesturePhase.Dragging };

  if (!isPlayableDuration(params.duration)) {
    return { state: draggingState, seekTo: null };
  }

  const offsetSeconds = deltaToSeconds(deltaX, state.trackWidth, params.duration, params.sensitivity);

  return { state: draggingState, seekTo: wrapTime(state.startTime + offsetSeconds, params.duration) };
};

export const endGesture = (state: IGestureState): IEndResult => ({
  state: IDLE_GESTURE,
  wasDrag: state.phase === EnumGesturePhase.Dragging,
});

const SEEK_KEYS: ReadonlySet<string> = new Set<string>([
  EnumSeekKey.ArrowRight,
  EnumSeekKey.ArrowUp,
  EnumSeekKey.ArrowLeft,
  EnumSeekKey.ArrowDown,
  EnumSeekKey.PageUp,
  EnumSeekKey.PageDown,
  EnumSeekKey.Home,
  EnumSeekKey.End,
]);

const isSeekKey = (key: string): key is EnumSeekKey => SEEK_KEYS.has(key);

export const keyToSeekTime = (key: string, currentTime: number, params: IKeyboardParams): number | null => {
  if (!isSeekKey(key)) {
    return null;
  }

  const { duration, stepSeconds, pageStepSeconds } = params;

  switch (key) {
    case EnumSeekKey.ArrowRight:
    case EnumSeekKey.ArrowUp:
      return clampTime(currentTime + stepSeconds, duration);
    case EnumSeekKey.ArrowLeft:
    case EnumSeekKey.ArrowDown:
      return clampTime(currentTime - stepSeconds, duration);
    case EnumSeekKey.PageUp:
      return clampTime(currentTime + pageStepSeconds, duration);
    case EnumSeekKey.PageDown:
      return clampTime(currentTime - pageStepSeconds, duration);
    case EnumSeekKey.Home:
      return 0;
    case EnumSeekKey.End:
      return clampTime(duration, duration);
    default:
      return null;
  }
};

const formatClock = (totalSeconds: number): string => {
  const wholeSeconds = Number.isFinite(totalSeconds) ? Math.floor(Math.max(totalSeconds, 0)) : 0;
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;

  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
};

export const formatTimeText = (currentTime: number, duration: number): string =>
  `${formatClock(currentTime)} / ${formatClock(duration)}`;
