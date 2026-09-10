'use client';

import { type RefObject, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  type IVideoScrubber,
  type IVideoScrubberOptions,
  type IVideoScrubberSnapshot,
  createVideoScrubber,
} from '../core/video-scrubber';

export interface IUseVideoScrubberOptions extends Omit<IVideoScrubberOptions, 'getTrackWidth'> {
  pointerTargetRef?: RefObject<HTMLElement | null>;
}

export interface IUseVideoScrubberResult<TControl extends HTMLElement> {
  videoRef: (node: HTMLVideoElement | null) => void;
  controlRef: (node: TControl | null) => void;
  snapshot: IVideoScrubberSnapshot;
  seekTo: (time: number) => void;
  seekBy: (seconds: number) => void;
}

const noop = (): void => undefined;

/**
 * Refs здесь — callback-refs поверх `useState`: условный рендер и замена DOM-узла должны пересоздать
 * контроллер, а `RefObject`, прочитанный в эффекте, такой замены не видит. Экземпляр контроллера
 * хранится в состоянии ради `useSyncExternalStore`: подписка обязана меняться вместе с экземпляром,
 * поэтому `setState` в эффекте — синхронизация с внешней системой, а не производное состояние.
 * `play`/`loop` меняются на каждое наведение, поэтому уходят в `update()`, а не пересоздают контроллер.
 */
export const useVideoScrubber = <TControl extends HTMLElement = HTMLDivElement>(
  options: IUseVideoScrubberOptions = {},
): IUseVideoScrubberResult<TControl> => {
  const {
    pointerTargetRef,
    play = true,
    loop = true,
    sensitivity,
    dragThresholdPx,
    keyboardStepSeconds,
    pageStepSeconds,
    formatValueText,
    onPlaybackError,
  } = options;
  const coreOptions: IVideoScrubberOptions = {
    play,
    loop,
    sensitivity,
    dragThresholdPx,
    keyboardStepSeconds,
    pageStepSeconds,
    formatValueText,
    onPlaybackError,
  };
  const latestOptionsRef = useRef<IVideoScrubberOptions>(coreOptions);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [control, setControl] = useState<TControl | null>(null);
  const [scrubber, setScrubber] = useState<IVideoScrubber | null>(null);
  const [idleSnapshot] = useState<IVideoScrubberSnapshot>(() => ({
    isDragging: false,
    duration: null,
    currentTime: 0,
    play,
  }));

  useEffect(() => {
    latestOptionsRef.current = coreOptions;
  });

  useEffect(() => {
    if (video === null) {
      return undefined;
    }

    const instance = createVideoScrubber(video, latestOptionsRef.current);

    instance.attach({ pointerTarget: pointerTargetRef?.current ?? control ?? video, controlTarget: control });
    setScrubber(instance);

    return () => {
      instance.destroy();
      setScrubber(null);
    };
  }, [video, control, pointerTargetRef]);

  useEffect(() => {
    scrubber?.update({
      play,
      loop,
      sensitivity,
      dragThresholdPx,
      keyboardStepSeconds,
      pageStepSeconds,
      formatValueText,
      onPlaybackError,
    });
  }, [
    scrubber,
    play,
    loop,
    sensitivity,
    dragThresholdPx,
    keyboardStepSeconds,
    pageStepSeconds,
    formatValueText,
    onPlaybackError,
  ]);

  const subscribe = useCallback(
    (listener: () => void): (() => void) => (scrubber === null ? noop : scrubber.subscribe(listener)),
    [scrubber],
  );
  const getSnapshot = useCallback(
    (): IVideoScrubberSnapshot => (scrubber === null ? idleSnapshot : scrubber.getSnapshot()),
    [scrubber, idleSnapshot],
  );
  const getServerSnapshot = useCallback((): IVideoScrubberSnapshot => idleSnapshot, [idleSnapshot]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const seekTo = useCallback(
    (time: number): void => {
      scrubber?.seekTo(time);
    },
    [scrubber],
  );
  const seekBy = useCallback(
    (seconds: number): void => {
      scrubber?.seekBy(seconds);
    },
    [scrubber],
  );

  return { videoRef: setVideo, controlRef: setControl, snapshot, seekTo, seekBy };
};
