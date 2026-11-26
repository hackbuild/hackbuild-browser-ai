# getting started

The packages under @hackbuild run language, vision and speech models in a browser tab. Each one does one job, installs from npm on its own, and ships its types. You pick the packages your page needs; none of them pulls in a model runtime or a weight file by itself.

## install

Install the packages you use. A chat page with a weight cache needs three:

```sh
npm install @hackbuild/chat @hackbuild/weights @hackbuild/ai-env
```

Every package is ESM only and MIT. Runtimes such as WebLLM, wllama, transformers.js and onnxruntime-web are optional peers: you install or load the one you pick, and the package never imports it. Each package README lists its peers and the versions they are pinned to.

## your first program

This page streams a reply from a model in the tab. The runtime loads from a pinned URL through `importEsm`, the weights come through the weight store, and the chat package gets both handed in.

<!-- example: examples/docs/first.ts -->

The code is [examples/docs/first.ts](../examples/docs/first.ts) in the repository. Every package README starts with a quick start like it, of 10 to 20 lines, taken from `examples/<package>/quick.ts` in the repository and typechecked in CI.

## where to go next

- [concepts](concepts.md): the ideas every package shares, read once.
- The examples: the demo pages of this site, each one a package at work with its source linked.
- A package page: its README, then its API reference, generated from the TSDoc in the code.
- For a coding agent: [llms.txt](https://hackbuild.github.io/hackbuild-browser-ai/llms.txt) lists every package's `llms.md`, a single file with its exports, examples and the mistakes to avoid.

## packages

<!-- packages -->
