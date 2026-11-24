import { describe, expect, it } from "vitest";
import { crc32, loadDsp } from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";
import { humanError } from "@hackbuild/devices";
import { createHub, stubFactory } from "@hackbuild/models";
import {
  TRANSCRIBE_RECORDS,
  WHISPER_LANGUAGES,
  acceptsFile,
  analyze,
  asJson,
  asSrt,
  asTxt,
  asVtt,
  baseName,
  bundle,
  createQueue,
  englishOnly,
  languagesFor,
  levelRail,
  measure,
  railBins,
  regate,
  transcribe,
  transcribeStubs,
  type Job,
  type Seg,
} from "@hackbuild/transcribe";

const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });

/** Entries of a store only zip, read from the local headers. */
function unzip(b: Uint8Array): { name: string; text: string; crcOk: boolean }[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: { name: string; text: string; crcOk: boolean }[] = [];
  let p = 0;
  while (v.getUint32(p, true) === 0x04034b50) {
    const crc = v.getUint32(p + 14, true);
    const size = v.getUint32(p + 18, true);
    const nl = v.getUint16(p + 26, true);
    const el = v.getUint16(p + 28, true);
    const name = new TextDecoder().decode(b.subarray(p + 30, p + 30 + nl));
    const data = b.subarray(p + 30 + nl + el, p + 30 + nl + el + size);
    out.push({ name, text: new TextDecoder().decode(data), crcOk: crc32(data) === crc });
    p += 30 + nl + el + size;
  }
  return out;
}

describe("languages", () => {
  it("offers auto plus 19 for a multilingual model and locks english only ones", () => {
    expect(WHISPER_LANGUAGES.length).toBe(20);
    const base = TRANSCRIBE_RECORDS.find((r) => r.id === "whisper-base")!;
    expect(languagesFor(base, "fr")).toMatchObject({ locked: false, value: "fr" });
    expect(languagesFor(base, "xx").value).toBe("auto");
    const tiny = TRANSCRIBE_RECORDS.find((r) => r.id === "whisper-tiny.en")!;
    const c = languagesFor(tiny, "fr");
    expect(c).toMatchObject({ locked: true, value: "en" });
    expect(c.options).toEqual([{ code: "en", name: "english" }]);
    expect(c.reason).toBe("whisper tiny.en is english only. pick a multilingual model for other languages.");
  });

  it("finds english only records by note or by a .en repo id, custom repos included", () => {
    for (const r of TRANSCRIBE_RECORDS) expect(englishOnly(r)).toBe(/\.en$/.test(r.source.modelId ?? "") || r.id.startsWith("moonshine"));
    expect(englishOnly("someone/whisper-medium.en")).toBe(true);
    expect(englishOnly("someone/whisper-medium.en@main")).toBe(true);
    expect(englishOnly("onnx-community/whisper-small")).toBe(false);
    expect(englishOnly("someone/english-model")).toBe(false);
  });
});

const segs: Seg[] = [
  { start: 0.5, end: 2, text: "first line", speaker: "ana", confidence: 0.91234, words: [{ start: 0.5, end: 1, text: "first" }] },
  { start: 2.2, end: 3.0004, text: "a <b> & c --> d" },
  { start: 6, end: 7, text: "after a gap", edited: true },
];

describe("exports", () => {
  it("writes txt, srt and vtt with the speaker label and escaped cues", () => {
    expect(asTxt(segs)).toBe("ana: first line a <b> & c --> d\n\nafter a gap\n");
    expect(asSrt(segs).split("\n").slice(0, 3)).toEqual(["1", "00:00:00,500 --> 00:00:02,000", "ana: first line"]);
    const vtt = asVtt(segs);
    expect(vtt.startsWith("WEBVTT\n\n00:00:00.500 --> 00:00:02.000\n<v ana>first line\n")).toBe(true);
    expect(vtt).toContain("a &lt;b&gt; &amp; c -&gt; d");
  });

  it("keeps the optional segment fields and the dropped reasons in json", () => {
    const j = JSON.parse(asJson({ source: "a.wav", segments: segs, dropped: [{ start: 9, end: 9.5, text: "thanks for watching", why: "outro" }], model: "whisper-base", language: "fr", duration: 10 }));
    expect(j.segments[0]).toEqual({ start: 0.5, end: 2, text: "first line", speaker: "ana", confidence: 0.912, words: [{ start: 0.5, end: 1, text: "first" }] });
    expect(j.segments[1]).toEqual({ start: 2.2, end: 3, text: "a <b> & c --> d" });
    expect(j.segments[2].edited).toBe(true);
    expect(j.dropped[0]).toEqual({ start: 9, end: 9.5, text: "thanks for watching", why: "outro" });
    expect(j).toMatchObject({ source: "a.wav", duration: 10, model: "whisper-base", language: "fr" });
  });

  it("zips four files per source with a manifest that records each run", () => {
    const stats = { dur: 10, noiseDb: -61.23, speechDb: -30.04, snrDb: 31.19, gainDb: 10, density: 0.41234, rtf: 12.345 };
    const date = new Date(2026, 10, 24, 12, 0, 0);
    const { zip, manifest } = bundle(
      [
        { source: "take/one.wav", segments: segs, stats, model: "whisper-base", language: "fr" },
        { source: "one.mp3", segments: segs.slice(0, 1), model: "whisper-tiny.en", language: "en" },
      ],
      { capture: { vadMargin: 6 }, date },
    );
    const files = unzip(zip);
    expect(files.map((f) => f.name)).toEqual(["manifest.json", "one.txt", "one.srt", "one.vtt", "one.json", "one-2.txt", "one-2.srt", "one-2.vtt", "one-2.json"]);
    expect(files.every((f) => f.crcOk)).toBe(true);
    expect(JSON.parse(files[0]!.text)).toEqual(manifest);
    expect(manifest).toMatchObject({ model: "mixed", language: "mixed", capture: { vadMargin: 6 }, generated: date.toISOString() });
    expect(manifest.files[0]).toEqual({
      source: "take/one.wav",
      model: "whisper-base",
      language: "fr",
      duration: 10,
      lines: 3,
      dropped: 0,
      levels: { noise_dbfs: -61.2, speech_dbfs: -30, snr_db: 31.2, lift_db: 10, speech_density: 0.412, realtime_factor: 12.35 },
      outputs: ["one.txt", "one.srt", "one.vtt", "one.json"],
    });
    expect(manifest.files[1]!.levels).toBeNull();
    expect(bundle([{ source: "x.wav", segments: segs, model: "m", language: "en" }], { date }).zip).toEqual(bundle([{ source: "x.wav", segments: segs, model: "m", language: "en" }], { date }).zip);
    expect(baseName("C:\\clips\\a:b.mov")).toBe("a_b");
    expect(baseName(".wav")).toBe("transcript");
  });
});

describe("level rail", () => {
  const pcm = dsp.synth(9, 16000 * 8, 16000);
  const a = analyze(dsp, pcm);

  it("gives frame levels, the floor and gate lines and the kept frames of the analysis", () => {
    const r = levelRail(a);
    expect(r.db.length).toBe(a.vdb.length);
    expect(r.thr.every((t) => t === a.stats.thrDb)).toBe(true);
    expect(r.noiseDb).toBe(a.stats.noiseDb);
    expect(r.frameSec).toBe(0.01);
    const kept = r.open.reduce((s, x) => s + x, 0);
    const vadFrames = a.vad.reduce((s, [x, y]) => s + (Math.min(r.db.length, Math.ceil(y / 160)) - Math.floor(x / 160)), 0);
    expect(kept).toBe(vadFrames);
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(r.db.length);
  });

  it("regates to the same answer at the same margin and keeps less at a higher one", () => {
    const r = levelRail(a);
    const same = regate(r, { vadMargin: 6 });
    expect(same.thrDb).toBe(r.thrDb);
    expect(same.regions).toEqual(r.regions);
    expect(same.open).toEqual(r.open);
    const hi = regate(r, { vadMargin: 20 });
    expect(hi.thrDb).toBeGreaterThanOrEqual(r.thrDb);
    expect(hi.open.reduce((s, x) => s + x, 0)).toBeLessThanOrEqual(same.open.reduce((s, x) => s + x, 0));
    expect(regate(r, { skipSilence: false }).open.every((x) => x === 1)).toBe(true);
    const b = railBins(r, 40);
    expect(b.db.length).toBe(40);
    expect(b.binSec).toBeCloseTo(0.2, 6);
    expect(Math.max(...b.db)).toBeCloseTo(Math.max(...r.db), 6);
    expect(b.kept.every((k) => k >= 0 && k <= 1)).toBe(true);
  });

  it("comes back on a transcript with the model and language of the run", async () => {
    const hub = createHub({ stub: true });
    hub.provide("stub", stubFactory(transcribeStubs()));
    const out = await transcribe(hub, dsp, pcm, { language: "de" });
    expect(out.rail.db.length).toBe(a.vdb.length);
    expect(out.model).toBe("stub:transcribe");
    expect(out.language).toBe("de");
  });
});

type F = { name: string; size: number; type: string; fail?: "decode" | "run" | "hang" };

describe("file queue", () => {
  const decode = async (f: F) => {
    if (f.fail === "decode") throw new Error("EncodingError");
    const ch = new Float32Array(16000).fill(0.5);
    return { sampleRate: 16000, channels: [ch, ch.map((v) => v / 2)] };
  };

  it("accepts audio and video, warns on large files and measures each one", async () => {
    const seen: string[] = [];
    const q = createQueue<F, string>({
      decode,
      run: async (a, ctx) => {
        if (ctx.job.file.fail === "run") throw new Error("out of memory: wasm allocation failed");
        ctx.progress(0.5);
        return `${a.meta.channels} ch`;
      },
      explain: humanError,
      onChange: (js) => seen.push(js.map((j) => j.state + (j.phase ? `:${j.phase}` : "")).join(",")),
    });
    const r = q.add([
      { name: "a.wav", size: 10, type: "audio/wav" },
      { name: "notes.pdf", size: 10, type: "application/pdf" },
      { name: "b.mkv", size: 2e9, type: "" },
      { name: "c.mp3", size: 10, type: "", fail: "decode" },
      { name: "d.m4a", size: 10, type: "", fail: "run" },
    ]);
    expect(r.added.length).toBe(4);
    expect(r.skipped).toEqual(["skipped notes.pdf (not audio or video)"]);
    expect(r.warnings).toEqual(["b.mkv is 2.0 gb. decoding loads the whole file into memory, so this may fail. pull the audio out first if it does."]);
    await q.start();
    const js = q.jobs();
    expect(js.map((j) => j.state)).toEqual(["done", "done", "failed", "failed"]);
    expect(js[0]!.result).toBe("2 ch");
    expect(js[0]!.meta).toMatchObject({ duration: 1, sampleRate: 16000, channels: 2, peakDb: expect.closeTo(-6.02, 2) });
    expect(js[2]!.error).toBe("could not decode c.mp3. convert it to wav or mp3 and drop it again.");
    expect(js[3]!.error).toBe("the model ran out of memory. unload another model, or pick the next row down.");
    expect(seen).toContain("running:decoding,queued,queued,queued");
    expect(seen).toContain("running:working,queued,queued,queued");
    q.retry(js[2]!.id);
    expect(q.get(js[2]!.id)!.state).toBe("queued");
    expect(acceptsFile({ name: "x.FLAC", type: "" })).toBe(true);
    const plain = createQueue<F, string>({ decode, run: async () => Promise.reject(new Error("boom.")) });
    plain.add([{ name: "e.wav", size: 1, type: "audio/wav" }]);
    await plain.start();
    expect(plain.jobs()[0]!.error).toBe("the run failed: boom. press run to try again.");
  });

  it("puts a cancelled running job back to queued and drops a waiting one", async () => {
    let started!: () => void;
    const go = new Promise<void>((res) => (started = res));
    const q = createQueue<F, string>({
      decode,
      run: (_a, ctx) =>
        new Promise((_res, rej) => {
          started();
          ctx.signal.addEventListener("abort", () => rej(new DOMException("stopped", "AbortError")));
        }),
    });
    q.add([
      { name: "a.wav", size: 1, type: "audio/wav" },
      { name: "b.wav", size: 1, type: "audio/wav" },
    ]);
    const [a, b] = q.jobs() as [Job<F, string>, Job<F, string>];
    const done = q.start();
    await go;
    expect(q.running).toBe(true);
    q.cancel(b.id);
    expect(q.jobs().length).toBe(1);
    q.stop();
    await done;
    expect(q.get(a.id)).toMatchObject({ state: "queued", phase: null, error: null });
    expect(q.running).toBe(false);
  });

  it("measures silence as -90 dBFS", () => {
    expect(measure({ sampleRate: 8000, channels: [new Float32Array(4000)] })).toEqual({ duration: 0.5, sampleRate: 8000, channels: 1, peakDb: -90, rmsDb: -90 });
  });
});
