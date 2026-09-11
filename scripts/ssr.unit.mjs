import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const EXPECTED_FRAGMENTS = [
  'role="slider"',
  'tabindex="0"',
  'aria-label="plan"',
  'aria-valuemin="0"',
  'aria-valuemax="0"',
  'aria-valuenow="0"',
  'aria-disabled="true"',
  'src="plan.mp4"',
  'poster="plan.jpg"',
  'muted=""',
  'preload="metadata"',
  'playsinline=""',
  'aria-hidden="true"',
];

describe('server-side rendering', () => {
  it('runs without a DOM', () => {
    assert.strictEqual(globalThis.window, undefined);
    assert.strictEqual(globalThis.document, undefined);
  });

  it('imports both entries without touching the DOM', async () => {
    const core = await import('../dist/index.js');
    const react = await import('../dist/react.js');

    assert.strictEqual(typeof core.createVideoScrubber, 'function');
    assert.strictEqual(core.formatTimeText(65, 130), '1:05 / 2:10');
    assert.strictEqual(typeof react.ScrubVideo, 'function');
    assert.strictEqual(typeof react.useVideoScrubber, 'function');
  });

  it('keeps the client directive on the react entry and React out of the core chunks', async () => {
    const distUrl = new URL('../dist/', import.meta.url);
    const reactEntry = await readFile(new URL('react.js', distUrl), 'utf8');
    const [firstLine] = reactEntry.split('\n');

    assert.match(firstLine, /^["']use client["'];?$/);

    const fileNames = (await readdir(distUrl)).filter(
      (fileName) => fileName.endsWith('.js') && fileName !== 'react.js',
    );

    const sources = await Promise.all(
      fileNames.map((fileName) => readFile(new URL(fileName, distUrl), 'utf8')),
    );

    sources.forEach((source, index) => {
      const fileName = fileNames[index];

      assert.ok(!source.includes('use client'), `${fileName} must not carry the client directive`);
      assert.ok(!/from\s*["']react["']/.test(source), `${fileName} must not import React`);
    });
  });

  it('renders deterministic slider markup independent of behavior props', async () => {
    const { ScrubVideo } = await import('../dist/react.js');
    const render = (props) =>
      renderToString(
        createElement(ScrubVideo, { src: 'plan.mp4', poster: 'plan.jpg', label: 'plan', ...props }),
      );
    const markup = render({});
    const normalizedMarkup = markup.toLowerCase();

    for (const fragment of EXPECTED_FRAGMENTS) {
      assert.ok(
        normalizedMarkup.includes(fragment),
        `expected markup to include ${fragment}, got: ${markup}`,
      );
    }

    assert.strictEqual(render({}), markup);
    assert.strictEqual(render({ play: false, loop: false, sensitivity: 2 }), markup);
  });
});
