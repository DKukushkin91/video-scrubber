import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EnumGesturePhase,
  IDLE_GESTURE,
  beginGesture,
  clampTime,
  deltaToSeconds,
  endGesture,
  formatTimeText,
  keyToSeekTime,
  moveGesture,
  rebaseGesture,
  wrapTime,
} from '../dist/internal.js';

const assertClose = (actual, expected) => {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `expected ${String(actual)} to be within 1e-9 of ${String(expected)}`,
  );
};

describe('wrapTime', () => {
  const cases = [
    [3, 10, 3],
    [10, 10, 0],
    [13, 10, 3],
    [20, 10, 0],
    [27.5, 10, 7.5],
    [-1, 10, 9],
    [-23, 10, 7],
    [5, Number.NaN, 0],
    [5, 0, 0],
    [5, Number.POSITIVE_INFINITY, 0],
    [Number.NaN, 10, 0],
  ];

  for (const [time, duration, expected] of cases) {
    it(`wrapTime(${String(time)}, ${String(duration)}) → ${String(expected)}`, () => {
      assertClose(wrapTime(time, duration), expected);
    });
  }

  it('returns positive zero at the exact boundary', () => {
    assert.strictEqual(Object.is(wrapTime(-10, 10), 0), true);
  });
});

describe('clampTime', () => {
  it('clamps below zero', () => {
    assert.strictEqual(clampTime(-1, 10), 0);
  });

  it('clamps above duration', () => {
    assert.strictEqual(clampTime(11, 10), 10);
  });

  it('keeps values inside the range', () => {
    assertClose(clampTime(4.2, 10), 4.2);
  });

  it('treats invalid input as zero', () => {
    assert.strictEqual(clampTime(Number.NaN, 10), 0);
    assert.strictEqual(clampTime(5, Number.NaN), 0);
  });
});

describe('deltaToSeconds', () => {
  const cases = [
    [0, 400, 10, 1, 0],
    [400, 400, 10, 1, 10],
    [200, 400, 10, 1, 5],
    [800, 400, 10, 1, 20],
    [-100, 400, 10, 1, -2.5],
    [200, 400, 10, 2, 10],
    [200, 400, 10, 0.5, 2.5],
    [200, 0, 10, 1, 0],
    [200, Number.NaN, 10, 1, 0],
    [200, 400, Number.NaN, 1, 0],
  ];

  for (const [deltaX, trackWidth, duration, sensitivity, expected] of cases) {
    it(`deltaToSeconds(${String(deltaX)}, ${String(trackWidth)}, ${String(duration)}, ${String(sensitivity)}) → ${String(expected)}`, () => {
      assertClose(deltaToSeconds(deltaX, trackWidth, duration, sensitivity), expected);
    });
  }
});

describe('keyToSeekTime', () => {
  const params = { duration: 10, stepSeconds: 1, pageStepSeconds: 10 };

  it('clamps arrows at the edges instead of wrapping', () => {
    assert.strictEqual(keyToSeekTime('ArrowRight', 9.5, params), 10);
    assert.strictEqual(keyToSeekTime('ArrowLeft', 0.5, params), 0);
    assertClose(keyToSeekTime('ArrowUp', 3, params), 4);
    assertClose(keyToSeekTime('ArrowDown', 3, params), 2);
  });

  it('pages by pageStepSeconds', () => {
    assert.strictEqual(keyToSeekTime('PageUp', 1, params), 10);
    assert.strictEqual(keyToSeekTime('PageDown', 9, params), 0);
  });

  it('jumps to the edges with Home and End', () => {
    assert.strictEqual(keyToSeekTime('Home', 4, params), 0);
    assert.strictEqual(keyToSeekTime('End', 4, params), 10);
  });

  it('returns zero for End without a playable duration', () => {
    assert.strictEqual(keyToSeekTime('End', 4, { ...params, duration: Number.NaN }), 0);
  });

  it('ignores unrelated keys', () => {
    assert.strictEqual(keyToSeekTime('Enter', 4, params), null);
  });
});

describe('formatTimeText', () => {
  it('formats minutes and zero-padded seconds', () => {
    assert.strictEqual(formatTimeText(65, 130), '1:05 / 2:10');
  });

  it('formats an unknown duration as zero', () => {
    assert.strictEqual(formatTimeText(0, 0), '0:00 / 0:00');
    assert.strictEqual(formatTimeText(Number.NaN, Number.NaN), '0:00 / 0:00');
  });
});

const params = { duration: 10, sensitivity: 1, invertDirection: false, dragThresholdPx: 4 };
const createPendingGesture = () => beginGesture(100, 50, 8, 400);
const dragTo = (clientX, clientY = 50) => moveGesture(createPendingGesture(), clientX, clientY, params);

describe('gesture reducer', () => {
  it('begins in the pending phase from the current frame', () => {
    const pendingGesture = createPendingGesture();

    assert.strictEqual(pendingGesture.phase, EnumGesturePhase.Pending);
    assert.strictEqual(pendingGesture.startTime, 8);
    assert.strictEqual(pendingGesture.trackWidth, 400);
  });

  it('ignores moves while idle', () => {
    const moveResult = moveGesture(IDLE_GESTURE, 150, 50, params);

    assert.strictEqual(moveResult.state, IDLE_GESTURE);
    assert.strictEqual(moveResult.seekTo, null);
  });

  it('stays pending below the drag threshold', () => {
    for (const clientX of [103, 97]) {
      const moveResult = dragTo(clientX);

      assert.strictEqual(moveResult.state.phase, EnumGesturePhase.Pending);
      assert.strictEqual(moveResult.seekTo, null);
    }
  });

  it('starts dragging exactly at the threshold', () => {
    const moveResult = dragTo(104);

    assert.strictEqual(moveResult.state.phase, EnumGesturePhase.Dragging);
    assertClose(moveResult.seekTo, 8.1);
  });

  it('stays pending while vertical movement dominates', () => {
    const moveResult = dragTo(104, 60);

    assert.strictEqual(moveResult.state.phase, EnumGesturePhase.Pending);
    assert.strictEqual(moveResult.seekTo, null);
  });

  it('moves forward to the right and backward to the left', () => {
    assertClose(dragTo(140).seekTo, 9);
    assertClose(dragTo(60).seekTo, 7);
  });

  it('wraps in both directions across the loop boundary', () => {
    assertClose(dragTo(200).seekTo, 0.5);
    assertClose(dragTo(300).seekTo, 3);
    assertClose(dragTo(-300).seekTo, 8);
  });

  it('returns to the same frame after a full turn of the track width', () => {
    assertClose(dragTo(500).seekTo, 8);
  });

  it('scales the turn by sensitivity', () => {
    const moveResult = moveGesture(createPendingGesture(), 300, 50, { ...params, sensitivity: 2 });

    assertClose(moveResult.seekTo, 8);
  });

  it('reverses the drag direction when inverted', () => {
    const inverted = { ...params, invertDirection: true };

    assertClose(moveGesture(createPendingGesture(), 140, 50, inverted).seekTo, 7);
    assertClose(moveGesture(createPendingGesture(), 60, 50, inverted).seekTo, 9);
    assertClose(moveGesture(createPendingGesture(), 500, 50, inverted).seekTo, 8);
    assertClose(moveGesture(createPendingGesture(), -300, 50, inverted).seekTo, 8);
  });

  it('drags without seeking until the duration is known', () => {
    const moveResult = moveGesture(createPendingGesture(), 200, 50, { ...params, duration: null });

    assert.strictEqual(moveResult.state.phase, EnumGesturePhase.Dragging);
    assert.strictEqual(moveResult.seekTo, null);
  });

  it('rebases the start time and keeps the start point', () => {
    const draggingState = dragTo(140).state;
    const rebasedState = rebaseGesture(draggingState, 5);

    assert.strictEqual(rebasedState.startTime, 5);
    assert.strictEqual(rebasedState.startX, 100);
    assert.strictEqual(rebasedState.phase, EnumGesturePhase.Dragging);
    assert.strictEqual(draggingState.startTime, 8);
  });

  it('reports a drag only when the gesture reached the dragging phase', () => {
    assert.strictEqual(endGesture(dragTo(140).state).wasDrag, true);
    assert.strictEqual(endGesture(createPendingGesture()).wasDrag, false);
    assert.strictEqual(endGesture(IDLE_GESTURE).wasDrag, false);
    assert.strictEqual(endGesture(dragTo(140).state).state, IDLE_GESTURE);
  });

  it('never mutates the incoming state', () => {
    const pendingGesture = createPendingGesture();
    const snapshot = { ...pendingGesture };
    const moveResult = moveGesture(pendingGesture, 140, 50, params);

    assert.notStrictEqual(moveResult.state, pendingGesture);
    assert.deepEqual(pendingGesture, snapshot);
    assert.deepEqual(IDLE_GESTURE, { phase: 'idle', startX: 0, startY: 0, startTime: 0, trackWidth: 0 });
  });
});
