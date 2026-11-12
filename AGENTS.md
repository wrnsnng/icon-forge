# Icon Forge

A local Vite, React 19 and three.js app. There is no backend and no deploy.

## Gate

Run these from the repo root before every commit. Each must exit 0.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run dev` serves the app at http://localhost:5173.

## Rules

- The look lives in `src/look.ts`. Its zod schema matches the look JSON in the product spec. Add fields to it, and read or write the look only through its exports.
- Every runtime request goes to the app's own origin. The HDRI is vendored at `public/hdri/studio_small_09_1k.hdr` (CC0, Poly Haven). Add no CDN, font or other cross-origin fetch.
- Never render a floor or a shadow.
