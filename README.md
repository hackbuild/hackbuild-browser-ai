# hackbuild-browser-ai

Run language, vision and speech models in a browser tab: one chat interface over local runtimes, a resumable weights cache, structured output for small models, memory, voice in and out, character cards and an agent loop.

Status: phase A, 2026-11-22. Packages land in `packages/` as they pass
their tests; the table below grows with them. Nothing is published to npm.

| package | what | tests |
|---|---|---|
| [@hackbuild/ai-env](packages/ai-env) | capability probe, file:// safe ESM import and worker ladder | 16 vitest |
| [@hackbuild/weights](packages/weights) | weight store over opfs, cache storage, indexeddb parts; resumable range downloads, sha-256, multi file repos | 20 vitest |

## Develop

    source ~/.nvm/nvm.sh && nvm use
    npm ci
    npm test

`npm ci` sets `core.hooksPath` to `.githooks`. Rules for every change are
in RULES.md and CONTRIBUTING.md.

## What is verified, and what is not

Each package README carries its own dated list. In short:

### Verified on this machine

- Unit tests under Node 22.18.0 with fakes for every browser API and model
  runtime; no network, no model weights.

### Not verified by anything

- Every package in a real browser with a real model. The list of what needs
  one is in each package README.

## Licence

| path | licence |
|---|---|
| code | MIT (LICENSE) |
| README, CHANGELOG, docs | CC-BY-4.0 (LICENSES/CC-BY-4.0.txt), code samples also MIT |
