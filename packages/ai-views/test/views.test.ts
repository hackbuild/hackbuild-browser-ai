import { describe, expect, it } from "vitest";
import type { Env } from "@hackbuild/ai-env";
import { scripted } from "@hackbuild/chat";
import {
  chatList,
  contextSegments,
  JOBS,
  JOB_NAMES,
  boxWords,
  chatThread,
  fitMap,
  frameTag,
  jobRecords,
  rowOf,
  toView,
  traceRows,
  transcribeQueue,
  useJobsPick,
  useModelPick,
  type Loader,
} from "@hackbuild/ai-views";
import { ELEMENT_NAMES, define } from "@hackbuild/ai-views/elements";

const env = (o: Partial<Env> = {}): Env =>
  ({ webgpu: true, f16: true, adapter: null, maxBufferBytes: null, isolated: false, protocol: "https", opfs: true, cacheStorage: true, indexedDB: true, promptApi: false, deviceMemoryGB: 8, cores: 8, mobile: false, ...o }) as Env;

describe("jobs", () => {
  it("every job has a real choice, as plan section 6 lists", () => {
    const n = (j: Parameters<typeof jobRecords>[0]) => jobRecords(j).length;
    expect(n("chat")).toBeGreaterThanOrEqual(26);
    expect(n("transcribe")).toBe(6);
    expect(jobRecords("vision").map((r) => r.id)).toEqual(expect.arrayContaining(["smolvlm-256m-instruct", "smolvlm-500m-instruct", "lfm2-vl-450m", "gemma-4-e2b-vision"]));
    expect(jobRecords("detect").map((r) => r.id)).toEqual(expect.arrayContaining(["yolov10n", "yolov10s", "yolov10m"]));
    expect(jobRecords("masks").map((r) => r.id)).toEqual(["slimsam-77-uniform", "fastsam-s"]);
    expect(jobRecords("image").map((r) => r.id)).toEqual(["sd-turbo", "sd-1.5", "sdxl-turbo"]);
    expect(jobRecords("voice").map((r) => r.id)).toEqual(["kokoro-82m", "pocket-tts", "bellows-voice", "web-speech"]);
    expect(jobRecords("faceswap").map((r) => r.id)).toEqual(["scrfd-10g", "arcface-w600k-r50", "inswapper-128"]);
    for (const j of JOB_NAMES) expect(JOBS[j].title).toMatch(/^pick/);
  });
  it("every record a job lists has a speed word and a verdict", () => {
    for (const j of JOB_NAMES) for (const r of jobRecords(j)) expect([r.id, !!r.speed, !!r.verdict]).toEqual([r.id, true, true]);
  });
});

describe("rows", () => {
  it("writes size, memory, backend, speed, verdict, marks and detail", () => {
    const hermes = jobRecords("chat").find((r) => r.id === "hermes-3-llama-3.2-3b-mlc")!;
    const row = rowOf(hermes, { env: env() });
    expect(row).toMatchObject({ name: "hermes 3 llama 3.2 3b", group: "start", backend: "gpu", speed: "steady", verdict: "best all round", uncensored: true, memory: "needs 2.3 gb" });
    expect(row.size).toMatch(/gb$/);
    expect(row.detail?.find((d) => d.label === "licence")?.value).toMatch(/commercial/);
    expect(row.unfit).toBeUndefined();
  });
  it("greys a row that does not fit, with the reason", () => {
    const big = jobRecords("chat").find((r) => r.id === "qwen2.5-7b-instruct-mlc")!;
    expect(rowOf(big, { env: env({ webgpu: false, f16: false }) }).unfit).toMatch(/webgpu/);
    expect(rowOf(big, { env: env({ deviceMemoryGB: 2 }) }).unfit).toMatch(/this machine gives a model/);
  });
  it("marks no download and non commercial rows, and a stored row leads", () => {
    const sys = jobRecords("voice").find((r) => r.id === "web-speech")!;
    expect(rowOf(sys, { env: env({ promptApi: false }) })).toMatchObject({ noDownload: true, group: "none" });
    const yolo = jobRecords("detect").find((r) => r.id === "yolov10n")!;
    expect(rowOf(yolo, { env: env(), state: "stored" })).toMatchObject({ noncommercial: true, group: "here", state: "stored" });
  });
  it("offers backend and context options on a chosen chat row", () => {
    const smol = jobRecords("chat").find((r) => r.id === "smollm2-360m-instruct")!;
    expect(rowOf(smol, { env: env() }).options?.map((o) => o.key)).toEqual(["backend"]);
  });
});

describe("useModelPick", () => {
  it("chooses the first row that fits, loads with progress, and ends loaded", async () => {
    const seen: number[] = [];
    const loader: Loader = async (_r, c) => {
      c.onProgress(0.5);
      c.onProgress(1);
    };
    const pick = useModelPick("transcribe", { env: env(), loader });
    pick.subscribe((s) => s.row?.state === "loading" && seen.push(s.row.progress ?? 0));
    expect(pick.snapshot().chosen).toBe("whisper-base");
    pick.choose("whisper-tiny.en");
    await pick.load();
    expect(seen).toContain(0.5);
    expect(pick.snapshot().row?.state).toBe("loaded");
  });
  it("cancel returns the row to none; a failure keeps its words", async () => {
    const hang: Loader = (_r, c) => new Promise((_, bad) => c.signal.addEventListener("abort", () => bad(new Error("aborted"))));
    const pick = useModelPick("masks", { env: env(), loader: hang });
    const p = pick.load();
    expect(pick.snapshot().row?.state).toBe("loading");
    pick.cancel();
    await p;
    expect(pick.snapshot().row?.state).toBe("none");
    pick.update({ loader: async () => Promise.reject(new Error("http 404")) });
    await expect(pick.load()).rejects.toThrow("http 404");
    expect(pick.snapshot().row?.state).toBe("error");
    expect(pick.error(pick.snapshot().chosen)).toBe("http 404");
  });
  it("needs a loader, keeps what it returned, and runs it for a row with nothing to fetch", async () => {
    const none = useModelPick("voice", { env: env() });
    await expect(none.load("web-speech")).rejects.toThrow(/no loader/);
    expect(none.snapshot().rows.find((r) => r.id === "web-speech")?.state).toBe("error");
    const ran: string[] = [];
    const pick = useModelPick("voice", { env: env(), loader: async (r) => (ran.push(r.id), { speaker: r.id }), chosen: "web-speech" });
    await pick.load();
    expect(ran).toEqual(["web-speech"]);
    expect(pick.snapshot().loaded).toEqual({ speaker: "web-speech" });
  });
  it("removes a stored model through onRemove", async () => {
    const gone: string[] = [];
    const pick = useModelPick("masks", { env: env(), stored: ["slimsam-77-uniform"], onRemove: (r) => void gone.push(r.id) });
    expect(pick.snapshot().row?.state).toBe("stored");
    await pick.remove("slimsam-77-uniform");
    expect(gone).toEqual(["slimsam-77-uniform"]);
    expect(pick.snapshot().row?.state).toBe("none");
  });
  it("starts on a start here record of every job", () => {
    for (const j of JOB_NAMES) {
      const recs = jobRecords(j);
      if (!recs.length) continue;
      expect([j, recs.every((r) => !!r.group)]).toEqual([j, true]);
      const chosen = useModelPick(j, { env: env() }).snapshot().chosen;
      expect([j, jobRecords(j).find((r) => r.id === chosen)?.group]).toEqual([j, "start here"]);
    }
  });
  it("greys a record that does not run yet", () => {
    const sdxl = jobRecords("image").find((r) => r.id === "sdxl-turbo")!;
    expect(rowOf(sdxl, { env: env() })).toMatchObject({ verdict: "not run yet", unfit: expect.stringMatching(/not run yet/) });
  });
  it("adds a model from a your own form and picks it", () => {
    const pick = useModelPick("chat", { env: env() });
    const id = pick.custom("gguf", { repo: "someone/model-GGUF", file: "model.Q4_K_M.gguf" });
    expect(pick.snapshot().row).toMatchObject({ id, group: "own", verdict: "your own" });
  });
  it("totals presets for several jobs and loads all", async () => {
    const jobs = useJobsPick([{ job: "chat", required: true }, { job: "voice" }], [{ id: "light", label: "light", picks: { chat: "smollm2-135m-instruct", voice: "web-speech" } }], { env: env(), loader: async () => undefined });
    expect(jobs.presets()[0]!.total).toMatch(/^about \d+ mb$/);
    jobs.applyPreset("light");
    expect(jobs.lines().map((l) => l.row?.id)).toEqual(["smollm2-135m-instruct", "web-speech"]);
    expect(jobs.all().label).toMatch(/^load all, \d+ mb$/);
    await jobs.loadAll();
    expect(jobs.lines().every((l) => l.row?.state === "loaded")).toBe(true);
  });
});

describe("chatThread", () => {
  it("streams a reply with its reasoning apart, memory used and stats", async () => {
    const engine = scripted({ replies: ["<think>they said hi</think>hello there."] });
    const t = chatThread({ engine, recall: async () => [{ label: "bio: who i am", score: 0.9 }] });
    await t.send("hi");
    const [u, a] = t.snapshot().turns;
    expect(u).toMatchObject({ role: "user", text: "hi" });
    expect(a).toMatchObject({ role: "assistant", text: "hello there.", think: "they said hi", done: true, mem: [{ label: "bio: who i am", score: 0.9 }] });
    expect(a!.stats).toMatch(/tok/);
    expect(t.markdown("x")).toContain("hello there.");
  });
  it("says how to get a model when there is none, and regenerates the last reply", async () => {
    const t = chatThread();
    await t.send("hi");
    expect(t.snapshot().turns[1]!.text).toMatch(/pick one/);
    t.setEngine(scripted({ replies: ["one", "two"] }));
    await t.regenerate();
    expect(t.snapshot().turns.map((x) => x.text)).toEqual(["hi", "one"]);
  });
});

describe("transcribeQueue", () => {
  const file = (name: string) => Object.assign(new Blob(["x".repeat(10)]), { name });
  it("runs queued files, edits a line with undo, and exports", async () => {
    const q = transcribeQueue({ autostart: false, run: async (_f, c) => (c.onProgress(0.5), { segments: [{ start: 0, end: 1.5, text: "sit." }, { start: 2, end: 3, text: "good dog." }], duration: 3 }) });
    q.add([file("walk.wav")]);
    await q.start();
    const c = q.snapshot().channels[0]!;
    expect(c).toMatchObject({ status: "done", pct: 100, duration: 3 });
    q.edit(c.id, 0, { text: "sit down." });
    expect(q.snapshot().channels[0]!.segments[0]).toMatchObject({ text: "sit down.", edited: true });
    q.undo();
    expect(q.snapshot().channels[0]!.segments[0]!.text).toBe("sit.");
    q.redo();
    expect(q.exportAs("srt")).toMatchObject({ name: "walk.srt", type: "application/x-subrip" });
    expect(q.exportAs("srt")!.text).toContain("00:00:00,000 --> 00:00:01,500");
    expect(q.exportAs("vtt")!.text.startsWith("WEBVTT")).toBe(true);
    expect(JSON.parse(q.exportAs("json")!.text).source).toBe("walk.wav");
  });
  it("names a failure and stops on stop", async () => {
    const q = transcribeQueue({ autostart: false, run: async () => Promise.reject(new Error("no speech model loaded")) });
    q.add([file("a.wav")]);
    await q.start();
    expect(q.snapshot().channels[0]).toMatchObject({ status: "failed", error: "no speech model loaded" });
    expect(q.exportAs("txt")).toBeNull();
  });
});

describe("frame", () => {
  it("maps boxes through a cropping tile and mirrors them", () => {
    const m = fitMap({ w: 640, h: 480 }, { w: 320, h: 320 }, "cover");
    expect(m.scale).toBeCloseTo(320 / 480);
    expect(m.dx).toBeCloseTo((320 - 640 * m.scale) / 2);
    const v = toView({ x: 0, y: 0, w: 60, h: 60 }, { scale: 1, dx: 0, dy: 0 }, 200, true);
    expect(v.x).toBe(140);
    expect(boxWords({ x: 0, y: 0, w: 1, h: 1, label: "cup", score: 0.937 })).toBe("cup 94%");
    expect(frameTag({ boxes: [{ x: 0, y: 0, w: 1, h: 1 }] })).toBe("1 found");
  });
});

describe("memory inspector rows and elements", () => {
  it("ranks from one and marks the used hits", () => {
    const rows = traceRows({ hits: [{ item: { id: 2 } }] as never, trace: [{ id: 2, kind: "fact", text: "a", bm25: 1, bm25Rank: 0, cos: 0.5, vecRank: -1, rrf: 0.1, score: 0.2 }] as never });
    expect(rows[0]).toMatchObject({ rank: 1, used: true, bm25: "#1 1.000", cos: "none 0.500" });
  });
  it("define registers every element, bare or under a prefix, and leaves defined names alone", () => {
    const reg = new Map<string, unknown>();
    const target = { get: (n: string) => reg.get(n), define: (n: string, c: unknown) => void reg.set(n, c) };
    class B {}
    expect(define("", target, B as never)).toEqual([...ELEMENT_NAMES]);
    expect(define("hb", target, B as never)[0]).toBe("hb-model-select");
    expect(reg.size).toBe(ELEMENT_NAMES.length * 2);
  });
});

describe("chatList", () => {
  it("keeps several chats, names them from the first message, and the thread follows the open one", async () => {
    const list = chatList({ engine: scripted({ replies: ["ok."] }) });
    await list.thread.send("plan the bench night");
    const first = list.snapshot().current;
    expect(list.snapshot().items[0]!.title).toBe("plan the bench night");
    const second = list.create();
    expect(list.thread.snapshot().turns).toEqual([]);
    list.open(first);
    expect(list.thread.snapshot().turns.length).toBe(2);
    list.rename(first, "bench");
    list.remove(second);
    expect(list.snapshot().items.map((i) => i.title)).toEqual(["bench"]);
    const seg = contextSegments(list.thread.snapshot(), "be terse");
    expect(seg.map((x) => x.key)).toEqual(["system", "memory", "chat"]);
  });
});
