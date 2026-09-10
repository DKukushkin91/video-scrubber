import { createVideoScrubber } from '@dskukushkin/video-scrubber';

import './styles.css';

const required = <TElement extends Element>(element: TElement | null): TElement => {
  if (element === null) {
    throw new Error('playground: a required element is missing');
  }

  return element;
};

const control = required(document.querySelector<HTMLDivElement>('[data-scrub]'));
const video = required(document.querySelector<HTMLVideoElement>('[data-scrub] video'));
const readout = required(document.querySelector<HTMLParagraphElement>('[data-readout]'));
const playToggle = required(document.querySelector<HTMLInputElement>('[data-play]'));
const loopToggle = required(document.querySelector<HTMLInputElement>('[data-loop]'));
const sensitivityRange = required(document.querySelector<HTMLInputElement>('[data-sensitivity]'));
const sensitivityValue = required(document.querySelector<HTMLOutputElement>('[data-sensitivity-value]'));

const scrubber = createVideoScrubber(video, {
  play: playToggle.checked,
  loop: loopToggle.checked,
  sensitivity: Number(sensitivityRange.value),
});

scrubber.attach({ pointerTarget: control });

const renderReadout = (): void => {
  const snapshot = scrubber.getSnapshot();
  const duration = snapshot.duration === null ? '—' : snapshot.duration.toFixed(2);

  readout.textContent = `${snapshot.currentTime.toFixed(2)} / ${duration} s · ${snapshot.isDragging ? 'dragging' : 'idle'} · play ${String(snapshot.play)}`;
};

const handlePlayChange = (): void => {
  scrubber.update({ play: playToggle.checked });
};

const handleLoopChange = (): void => {
  scrubber.update({ loop: loopToggle.checked });
};

const handleSensitivityChange = (): void => {
  sensitivityValue.textContent = sensitivityRange.value;
  scrubber.update({ sensitivity: Number(sensitivityRange.value) });
};

scrubber.subscribe(renderReadout);
playToggle.addEventListener('change', handlePlayChange);
loopToggle.addEventListener('change', handleLoopChange);
sensitivityRange.addEventListener('input', handleSensitivityChange);
renderReadout();
