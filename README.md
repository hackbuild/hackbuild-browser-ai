# hackbuild-browser-ai

Run language, vision and speech models in a browser tab: one chat interface over local runtimes, a resumable weights cache, structured output for small models, memory, voice in and out, character cards and an agent loop.

Status: scaffold, 2026-11-22. Packages land in `packages/` as they pass
their tests; the table below grows with them.

## Develop

    source ~/.nvm/nvm.sh && nvm use
    npm ci
    npm test

`npm ci` sets `core.hooksPath` to `.githooks`. Rules for every change are
in RULES.md and CONTRIBUTING.md.

## What is verified, and what is not

### Not verified by anything

- everything; nothing has landed yet.

## Licence

| path | licence |
|---|---|
| code | MIT (LICENSE) |
| README, CHANGELOG, docs | CC-BY-4.0 (LICENSES/CC-BY-4.0.txt), code samples also MIT |
