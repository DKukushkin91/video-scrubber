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
  invertDirection: boolean;
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
  if (
    !Number.isFinite(trackWidth) ||
    trackWidth <= 0 ||
    !isPlayableDuration(duration) ||
    !Number.isFinite(deltaX)
  ) {
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
  const direction = params.invertDirection ? -1 : 1;

  return {
    state: draggingState,
    seekTo: wrapTime(state.startTime + direction * offsetSeconds, params.duration),
  };
};

export const endGesture = (state: IGestureState): IEndResult => ({
  state: IDLE_GESTURE,
  wasDrag: state.phase === EnumGesturePhase.Dragging,
});

type TSeekResolver = (currentTime: number, params: IKeyboardParams) => number;

const stepForward: TSeekResolver = (currentTime, { duration, stepSeconds }) =>
  clampTime(currentTime + stepSeconds, duration);
const stepBackward: TSeekResolver = (currentTime, { duration, stepSeconds }) =>
  clampTime(currentTime - stepSeconds, duration);
const pageForward: TSeekResolver = (currentTime, { duration, pageStepSeconds }) =>
  clampTime(currentTime + pageStepSeconds, duration);
const pageBackward: TSeekResolver = (currentTime, { duration, pageStepSeconds }) =>
  clampTime(currentTime - pageStepSeconds, duration);
const seekToStart: TSeekResolver = () => 0;
const seekToEnd: TSeekResolver = (_currentTime, { duration }) => clampTime(duration, duration);

const SEEK_RESOLVERS: ReadonlyMap<string, TSeekResolver> = new Map<string, TSeekResolver>([
  [EnumSeekKey.ArrowRight, stepForward],
  [EnumSeekKey.ArrowUp, stepForward],
  [EnumSeekKey.ArrowLeft, stepBackward],
  [EnumSeekKey.ArrowDown, stepBackward],
  [EnumSeekKey.PageUp, pageForward],
  [EnumSeekKey.PageDown, pageBackward],
  [EnumSeekKey.Home, seekToStart],
  [EnumSeekKey.End, seekToEnd],
]);

export const isSeekKey = (key: string): boolean => SEEK_RESOLVERS.has(key);

export const keyToSeekTime = (key: string, currentTime: number, params: IKeyboardParams): number | null =>
  SEEK_RESOLVERS.get(key)?.(currentTime, params) ?? null;

const formatClock = (totalSeconds: number): string => {
  const wholeSeconds = Number.isFinite(totalSeconds) ? Math.floor(Math.max(totalSeconds, 0)) : 0;
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;

  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
};

export const formatTimeText = (currentTime: number, duration: number): string =>
  `${formatClock(currentTime)} / ${formatClock(duration)}`;
