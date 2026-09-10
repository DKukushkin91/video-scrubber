'use client';

import type { ReactElement } from 'react';

import { type IUseVideoScrubberOptions, useVideoScrubber } from './use-video-scrubber';

export interface IScrubVideoProps extends Omit<IUseVideoScrubberOptions, 'pointerTargetRef'> {
  src: string;
  poster?: string;
  label: string;
  className?: string;
  videoClassName?: string;
}

/**
 * ARIA-значения в разметке — константы состояния «до metadata»: живые значения ядро пишет через
 * `setAttribute` после монтирования, React не сверяет атрибуты с неизменными пропами, поэтому
 * серверная и клиентская разметка совпадают при любых `play`/`loop`/`sensitivity`. `muted` и
 * `preload="metadata"` обязательны: без первого автоплей запрещён, без второго нет длительности.
 */
export const ScrubVideo = ({
  src,
  poster,
  label,
  className,
  videoClassName,
  ...options
}: IScrubVideoProps): ReactElement => {
  const { videoRef, controlRef } = useVideoScrubber(options);

  return (
    <div
      ref={controlRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={0}
      aria-valuenow={0}
      aria-disabled
      className={className}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted
        playsInline
        preload="metadata"
        aria-hidden
        className={videoClassName}
      />
    </div>
  );
};
