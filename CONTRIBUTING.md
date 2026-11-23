# Contributing

| rule | what it means |
|---|---|
| authors | people only. The git author of every commit is a person. No AI assistant, model or AI tool is an author, co-author, contributor or credit anywhere: messages, trailers, file headers, CHANGELOG, package metadata. |
| hooks | run `npm ci` once per clone. Its `prepare` script sets `core.hooksPath` to `.githooks`, so the commit-msg and pre-commit hooks run on every commit. Check with `git config core.hooksPath`; never pass `--no-verify`. |
| trailers | none of any kind. No Signed-off-by, Co-Authored-By, Reviewed-by or generated-with lines. The commit-msg hook rejects every `<word>-by:` and `<word>-with:` line, and CI repeats the check. |
| outside PRs | a maintainer squashes the PR and rewrites the message so it passes the hook. Your git author line is kept; that line is the credit. |
| commit subjects | imperative, lowercase, under 60 characters, no trailing punctuation, optional lowercase scope: `memory: merge near duplicate episodes`. |
| licence | inbound equals outbound: code is MIT (LICENSE), README, CHANGELOG and docs are CC-BY-4.0 with code samples also MIT (LICENSES/CC-BY-4.0.txt). No CLA, no DCO sign-off. |
| weights | never commit model weights or owner likeness files. Name each model's weight licence where it is referenced. |
| marks | a contribution grants no right to the hack.build name or logo (TRADEMARKS.md). |

Before you open a PR, run `npm test` and, when `crates/` changed,
`cargo test --workspace`. A harness that did not run is reported as not run.

## Toolchains

| tool | version | notes |
|---|---|---|
| Node | 22.18.0 (`.nvmrc`) | npm 11.21.0: `npx -y npm@11.21.0 ci` |
| Rust | 1.95.0 through rustup (`rust-toolchain.toml`) | with the `wasm32-unknown-unknown` target; `rustup toolchain install 1.95.0 --target wasm32-unknown-unknown --component rustfmt clippy` |

The five wasm cores are committed as bytes (`packages/*/wasm/*.wasm`
and `packages/*/src/inline.ts`). After a change under `crates/`, run
`node tools/build-wasm.mjs --all` and commit what it writes. It finds
rustc 1.95.0 with `rustup which`, so a Homebrew rustc on PATH, which has
no wasm32 standard library, is not used. CI runs the same build and fails
when the bytes differ from the committed ones. Clippy for wasm32 runs
with the toolchain's bin directory first on PATH:
`PATH=$(dirname $(rustup which rustc --toolchain 1.95.0)):$PATH cargo clippy --workspace --target wasm32-unknown-unknown -- -D warnings`.
