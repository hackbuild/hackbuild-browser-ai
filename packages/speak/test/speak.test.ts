import { describe, expect, test } from "vitest";
import {
  GaplessPlayer,
  SegmentCutter,
  createSpeaker,
  estimateWordTimes,
  kokoroEngine,
  pocketEngine,
  prepareClone,
  speakable,
  stubEngine,
  webSpeechEngine,
  SPEAK_RECORDS,
  type AudioContextLike,
  type EngineStatus,
  type Progress,
  type UtteranceLike,
} from "@hackbuild/speak";

class FakeCtx implements AudioContextLike {
  currentTime = 0;
  sampleRate = 24000;
  started: { start: number; len: number; first: number; last: number }[] = [];
  destination = { connect() {} };
  createBuffer(_c: number, len: number) {
    const d = new Float32Array(len);
    return { getChannelData: () => d };
  }
  createBufferSource() {
    const ctx = this;
    const s = {
      buffer: null as { getChannelData(c: number): Float32Array } | null,
      onended: null as (() => void) | null,
      connect() {},
      start(when: number) {
        const d = s.buffer!.getChannelData(0);
        ctx.started.push({ start: when, len: d.length, first: d[0]!, last: d[d.length - 1]! });
      },
      stop() {},
    };
    return s;
  }
  createAnalyser() {
    return { fftSize: 0, connect() {}, getFloatTimeDomainData: (a: Float32Array) => a.fill(0.5) };
  }
  createGain() {
    return { gain: { value: 1 }, connect() {} };
  }
}

const flush = () => new Promise((r) => setTimeout(r, 5));

describe("speakable", () => {
  test("drops think blocks, fences, markdown and emoji, reads urls as a word", () => {
    const smile = String.fromCodePoint(0x1f600);
    const s = speakable(`<think>plan</think>**Hi** there ${smile} see [docs](http://x.y/z) or https://a.b/c.\n\`\`\`js\ncode\n\`\`\`\n- done`);
    expect(s.text).toBe("Hi there see docs or link. done");
  });
  test("an unclosed think block is dropped to the end", () => {
    expect(speakable("Hello. <think>still going").text).toBe("Hello.");
  });
  test("the map points back into the input", () => {
    const input = "a *b* hack.build c";
    const s = speakable(input, { lexicon: { "hack.build": "hack dot build" } });
    expect(s.text).toBe("a b hack dot build c");
    expect(input[s.map[s.text.indexOf("b")]!]).toBe("b");
    expect(s.map[s.text.indexOf("dot")]).toBe(input.indexOf("hack"));
    expect(input[s.map[s.text.length - 1]!]).toBe("c");
    expect(s.map[s.text.length]).toBe(input.length);
  });
});

describe("segment cutter", () => {
  test("first segment ends at a clause once 24 characters long, later ones at sentences", () => {
    const c = new SegmentCutter();
    expect(c.take("Well, ", false)).toEqual([]);
    const a = c.take("Well, I looked at the shelf today, and the mug was there. Then", false);
    expect(a.map((s) => s.text)).toEqual(["Well, I looked at the shelf today,", "and the mug was there."]);
    const full = "Well, I looked at the shelf today, and the mug was there. Then I left, quietly";
    const b = c.take(full, true);
    expect(b.map((s) => [s.text, s.start, s.end])).toEqual([["Then I left, quietly", full.indexOf("Then"), full.length]]);
  });
  test("abbreviations and decimals do not end a sentence, an open word waits", () => {
    const c = new SegmentCutter();
    expect(c.take("Dr. Lee paid 3.5 dollars.", false)).toEqual([]);
    expect(c.take("Dr. Lee paid 3.5 dollars. Ok", false).map((s) => s.text)).toEqual(["Dr. Lee paid 3.5 dollars."]);
  });
  test("long text is cut at the last clause before the limit", () => {
    const c = new SegmentCutter({ maxChars: 40, firstClause: 1000 });
    const out = c.take("one two three four five six, seven eight nine ten eleven twelve", false);
    expect(out[0]!.text).toBe("one two three four five six,");
  });
});

test("estimated word times share the duration by length", () => {
  const w = estimateWordTimes("ab abcd", 1.2);
  expect(w.map((x) => [x.start, x.end])).toEqual([[0, 2], [3, 7]]);
  expect(w[0]!.t1).toBeCloseTo(0.45);
  expect(w[1]!.t1).toBeCloseTo(1.2);
});

test("player schedules gapless with a lead and fades on request", () => {
  const ctx = new FakeCtx();
  const p = new GaplessPlayer(ctx);
  const one = new Float32Array(2400).fill(1);
  const a = p.schedule(one, 24000, { in: true });
  const b = p.schedule(one, 24000, { out: true });
  expect(a.start).toBeCloseTo(0.04);
  expect(b.start).toBe(a.end);
  expect(ctx.started[0]!.first).toBe(0);
  expect(ctx.started[1]!.first).toBe(1);
  expect(ctx.started[1]!.last).toBe(0);
  expect(p.level()).toBeCloseTo(0.5);
});

describe("speaker", () => {
  test("streams segments gapless and reports offsets when the clock reaches them", async () => {
    const ctx = new FakeCtx();
    const prog: Progress[] = [];
    const speakingLog: boolean[] = [];
    const sp = createSpeaker({ ctx, engines: [stubEngine()], tickMs: 0, onProgress: (p) => prog.push(p), onSpeaking: (b) => speakingLog.push(b) });
    const reply = "Hello there, my friend. The mug is on the shelf.";
    sp.feed(reply.slice(0, 30));
    sp.feed(reply, true);
    await flush();
    const starts = ctx.started.map((s) => s.start);
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeCloseTo(starts[i - 1]! + ctx.started[i - 1]!.len / 24000, 9);
    expect(prog).toEqual([]);
    ctx.currentTime = 0.05;
    sp.tick();
    expect(prog[0]).toEqual({ utterance: 1, offset: 0, kind: "segment", estimated: false });
    ctx.currentTime = 100;
    sp.tick();
    const words = prog.filter((p) => p.kind === "word").map((p) => reply.slice(p.offset, p.offset + 3));
    expect(words).toEqual(["Hel", "the", "my ", "fri", "The", "mug", "is ", "on ", "the", "she"]);
    expect(prog.filter((p) => p.kind === "end").map((p) => p.offset)).toEqual([23, 48]);
    const offs = prog.map((p) => p.offset);
    expect([...offs].sort((a, b) => a - b)).toEqual(offs);
    expect(speakingLog).toEqual([true, false]);
    await sp.done();
  });

  test("a failed engine falls through to the next and a silent one trips the watchdog", async () => {
    const ctx = new FakeCtx();
    const st: EngineStatus[] = [];
    const sp = createSpeaker({
      ctx,
      engines: [stubEngine({ id: "broken", fail: "load" }), stubEngine({ id: "quiet", fail: "hang" }), stubEngine({ id: "ok" })],
      watchdogMs: 20,
      tickMs: 0,
      onStatus: (s) => st.push(s),
    });
    sp.feed("A short line.", true);
    await new Promise((r) => setTimeout(r, 60));
    expect(sp.engine).toBe("ok");
    expect(st.some((s) => s.engine === "broken" && s.kind === "failed")).toBe(true);
    expect(st.some((s) => s.engine === "quiet" && s.kind === "watchdog")).toBe(true);
    expect(ctx.started.length).toBeGreaterThan(0);
  });

  test("a replay comes from the cache and stop clears everything", async () => {
    const ctx = new FakeCtx();
    let synths = 0;
    const base = stubEngine();
    const counted = { ...base, synth: (t: string, c: object, s: AbortSignal) => (synths++, base.synth(t, c, s)) };
    const sp = createSpeaker({ ctx, engines: [counted], tickMs: 0 });
    sp.feed("Same words again.", true);
    await flush();
    ctx.currentTime = 50;
    sp.tick();
    sp.feed("Same words again.", true);
    await flush();
    expect(synths).toBe(1);
    expect(sp.speaking).toBe(true);
    sp.stop();
    expect(sp.speaking).toBe(false);
    await sp.done();
  });

  test("a native engine reports boundaries as offsets in the input", async () => {
    const ctx = new FakeCtx();
    const spoken: UtteranceLike[] = [];
    const synth = {
      speak(u: UtteranceLike) {
        spoken.push(u);
        queueMicrotask(() => {
          u.onboundary?.({ charIndex: 0, name: "word" });
          u.onboundary?.({ charIndex: u.text.indexOf("mug"), name: "word" });
          u.onend?.();
        });
      },
      cancel() {},
      getVoices: () => [{ name: "v1", lang: "en" }],
    };
    class U {
      rate = 1;
      pitch = 1;
      voice = null;
      onboundary = null;
      onend = null;
      onerror = null;
      constructor(public text: string) {}
    }
    const prog: Progress[] = [];
    const sp = createSpeaker({ ctx, engines: [webSpeechEngine({ synth, Utterance: U })], voice: { voice: "v1" }, tickMs: 0, onProgress: (p) => prog.push(p) });
    const input = "The **mug** is here.";
    await sp.say(input);
    expect(spoken[0]!.text).toBe("The mug is here.");
    expect(spoken[0]!.voice).toEqual({ name: "v1", lang: "en" });
    const w = prog.filter((p) => p.kind === "word").map((p) => p.offset);
    expect(w).toEqual([0, input.indexOf("mug")]);
    expect(prog.at(-1)).toMatchObject({ kind: "end", offset: input.length });
  });
});

describe("native first audio", () => {
  const run = async (events: ("start" | "boundary")[]) => {
    const ctx = new FakeCtx();
    const log: string[] = [];
    const synth = {
      speak(u: UtteranceLike) {
        log.push("speak");
        setTimeout(() => {
          for (const e of events) {
            log.push(e);
            if (e === "start") u.onstart?.();
            else u.onboundary?.({ charIndex: 0, name: "word" });
          }
          u.onend?.();
        }, 5);
      },
      cancel() {},
      getVoices: () => [],
    };
    class U {
      rate = 1;
      pitch = 1;
      voice = null;
      onboundary = null;
      onstart = null;
      onend = null;
      onerror = null;
      constructor(public text: string) {}
    }
    const sp = createSpeaker({ ctx, engines: [webSpeechEngine({ synth, Utterance: U })], tickMs: 0, onSpeaking: (b) => log.push(`speaking ${b}`) });
    await sp.say("Hello there.");
    return log;
  };

  test("speaking starts at the platform's start event, not at the call", async () => {
    expect(await run(["start", "boundary"])).toEqual(["speak", "start", "speaking true", "boundary", "speaking false"]);
  });

  test("the first boundary starts it when there is no start event", async () => {
    expect(await run(["boundary"])).toEqual(["speak", "boundary", "speaking true", "speaking false"]);
  });

  test("with neither, speaking never starts, so first audio stays unknown", async () => {
    expect(await run([])).toEqual(["speak"]);
  });
});

describe("engines", () => {
  test("kokoro runs fp32 on webgpu and q8 on wasm and states its licence", async () => {
    const seen: unknown[] = [];
    const runtime = async () => ({
      KokoroTTS: {
        from_pretrained: async (id: string, o: Record<string, unknown>) => {
          seen.push([id, o.dtype, o.device]);
          return { generate: async (t: string) => ({ audio: new Float32Array(t.length), sampling_rate: 24000 }) };
        },
      },
    });
    const st: EngineStatus[] = [];
    const k = kokoroEngine({ runtime, device: "webgpu" });
    await k.load({ onStatus: (s) => st.push(s) });
    await kokoroEngine({ runtime }).load({});
    expect(seen).toEqual([
      ["onnx-community/Kokoro-82M-v1.0-ONNX", "fp32", "webgpu"],
      ["onnx-community/Kokoro-82M-v1.0-ONNX", "q8", "wasm"],
    ]);
    expect(st[0]).toMatchObject({ kind: "licence" });
    const out = [];
    for await (const c of k.synth("abc", {}, new AbortController().signal)) out.push(c);
    expect(out[0]!.samples.length).toBe(3);
  });

  const WORKER_SRC = [
    "import('./sentencepiece.js');",
    "const CHUNK_GAP_SEC = 0.25;",
    "ort.env.wasm.wasmPaths = './ort/';",
  ].join("\n");

  function fakeWorkerEnv(src: string) {
    const posted: { type: string; data?: { audio?: Float32Array; text?: string; voiceName?: string } }[] = [];
    let blobText = "";
    class W {
      private fns: ((ev: { data?: unknown }) => void)[] = [];
      constructor() {
        setTimeout(() => this.emit({ __aiEnvReady: 1 }), 0);
      }
      emit(data: unknown) {
        for (const f of [...this.fns]) f({ data });
      }
      postMessage(m: (typeof posted)[number]) {
        posted.push(m);
        setTimeout(() => {
          if (m.type === "load") {
            this.emit({ type: "voices_loaded", voices: ["alba", { name: "marius" }], defaultVoice: "alba" });
            this.emit({ type: "bundle_loaded", sampleRate: 24000 });
            this.emit({ type: "loaded" });
          } else if (m.type === "generate") {
            this.emit({ type: "generation_started" });
            this.emit({ type: "audio_chunk", data: new Float32Array(100) });
            this.emit({ type: "audio_chunk", data: new Float32Array(50) });
            this.emit({ type: "stream_ended" });
          } else if (m.type === "encode_voice") this.emit({ type: "voice_encoded" });
        }, 0);
      }
      terminate() {}
      addEventListener(_t: string, f: (ev: { data?: unknown }) => void) {
        this.fns.push(f);
      }
      removeEventListener(_t: string, f: (ev: { data?: unknown }) => void) {
        this.fns = this.fns.filter((x) => x !== f);
      }
    }
    const fetch = (async () => new Response(src)) as unknown as typeof globalThis.fetch;
    const createObjectURL = (b: Blob) => {
      void b.text().then((t) => (blobText = t));
      return "blob:x";
    };
    return { posted, spawn: { Worker: W, fetch, createObjectURL }, text: () => blobText };
  }

  test("pocket patches its worker, streams chunks and clones from a caller reference", async () => {
    const env = fakeWorkerEnv(WORKER_SRC);
    const st: EngineStatus[] = [];
    const p = pocketEngine({ base: "https://example.test/pocket/", spawn: env.spawn });
    await p.load({ onStatus: (s) => st.push(s) });
    await flush();
    expect(env.text()).toContain("self.__hbSentencepiece()");
    expect(env.text()).toContain("CHUNK_GAP_SEC = 0.1");
    expect(env.text()).toContain("ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.wasm.wasmPaths = 'https://example.test/pocket/ort/'");
    expect(p.voices!()).toEqual(["alba", "marius"]);
    const sizes: number[] = [];
    for await (const c of p.synth("hi", {}, new AbortController().signal)) sizes.push(c.samples.length);
    expect(sizes).toEqual([100, 50]);
    await p.cloneVoice(new Float32Array(48000).fill(0.25), 48000);
    const enc = env.posted.find((m) => m.type === "encode_voice")!;
    expect(enc.data!.audio!.length).toBe(24000);
    expect(enc.data!.audio![100]).toBeCloseTo(0.9);
    expect(env.posted.at(-1)).toEqual({ type: "set_voice", data: { voiceName: "custom" } });
    expect(st.some((s) => s.kind === "licence" && /cc-by-4.0/.test(s.text))).toBe(true);
  });

  test("pocket reports a patch that matched nothing and refuses to load", async () => {
    const env = fakeWorkerEnv("const nothing = 1;");
    const st: EngineStatus[] = [];
    await expect(pocketEngine({ base: "https://example.test/p/", spawn: env.spawn }).load({ onStatus: (s) => st.push(s) })).rejects.toThrow(/changed upstream/);
    expect(st.find((s) => s.kind === "patch-missed")!.text).toMatch(/CHUNK_GAP_SEC/);
  });
});

test("clone reference: resampled to 24 kHz, cut to 15 s, peak 0.9", () => {
  const x = new Float32Array(16000 * 20);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin(i / 10);
  const y = prepareClone(x, 16000);
  expect(y.length).toBe(24000 * 15);
  expect(y.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeCloseTo(0.9, 6);
});

test("every speak record names a weight licence", () => {
  for (const r of SPEAK_RECORDS) expect(r.licence.length).toBeGreaterThan(3);
});
