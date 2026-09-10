# Examples

`playground/` is a Vite app with two pages that consume the **built** package through its real `exports`:

- `/` — React: `<ScrubVideo>` and `useVideoScrubber`
- `/vanilla.html` — the framework-agnostic core only

Run from the repository root with the package rebuilding on change:

```bash
pnpm build:watch
pnpm dev
```

The demo clip `public/president.mp4` (an apartment walkthrough) is published with the permission of its owner and is used here for demonstration only. It is not part of the npm package.
