/**
 * The file queue: files are
 * accepted by type or extension, a file over 1.5 GB gets a warning, and each job goes queued, running
 * (decoding, then working), done or failed. Decoding measures the file:
 * duration, sample rate, channels, peak and rms level. Stop puts the
 * running job back to queued; a failure keeps its line of copy. The
 * decoder and the run are injected, so a page passes `decodeAudio` and
 * `transcribe`, and a test passes stubs. Pass `humanError` from
 * `@hackbuild/devices` as `explain` for the shared failure copy; it is
 * injected so the queue does not pull the error tables into this bundle.
 */

export type JobState = "queued" | "running" | "done" | "failed";

/** The parts of a File the queue reads: name, size and type. */
export interface FileLike {
  name: string;
  size: number;
  type: string;
}

/** Measured from the decoded audio. Levels in dBFS (computed), -90 for silence. */
export interface FileMeta {
  /** Seconds. */
  duration: number;
  /** The decoded rate, which is the file's own rate only when the decoder keeps it. */
  sampleRate: number;
  channels: number;
  peakDb: number;
  rmsDb: number;
}

/** One file in the queue: its state, phase, progress, measured levels, result and error line. */
export interface Job<F extends FileLike = FileLike, R = unknown> {
  id: number;
  file: F;
  name: string;
  size: number;
  state: JobState;
  /** While running: "decoding", then "working". */
  phase: "decoding" | "working" | null;
  /** 0 to 1 while working, as the run reports it. */
  progress: number;
  meta: FileMeta | null;
  result: R | null;
  /** A lowercase line naming the failure, when failed. */
  error: string | null;
}

/** Decoded audio: the sample rate and one Float32Array per channel. */
export interface Decoded {
  sampleRate: number;
  channels: Float32Array[];
}

/** The queue's decoder, run, change callback and failure copy. */
export interface QueueOptions<F extends FileLike, R> {
  decode: (file: F, signal: AbortSignal) => Promise<Decoded>;
  run: (audio: Decoded & { meta: FileMeta }, ctx: { job: Readonly<Job<F, R>>; signal: AbortSignal; progress: (p: number) => void }) => Promise<R>;
  /** Called after every state change with a copy of the list. */
  onChange?: (jobs: Job<F, R>[]) => void;
  /** A lowercase line for a run failure. Default: "the run failed: <message>. press run to try again." */
  explain?: (e: unknown) => string;
  /** Bytes over which a file gets a warning. Default 1.5e9 (vendor). */
  largeBytes?: number;
}

const AV = /\.(mp4|m4v|mov|webm|mkv|avi|mpg|mpeg|ogv|m4a|mp3|wav|flac|ogg|opus|aac|wma|3gp)$/i;

/** Audio or video by MIME type, or by one of its known extensions. */
export function acceptsFile(f: Pick<FileLike, "name" | "type">): boolean {
  return f.type.startsWith("audio/") || f.type.startsWith("video/") || AV.test(f.name);
}

const sizeText = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} gb` : `${Math.round(b / 1e6)} mb`);

const db = (x: number) => (x > 1e-9 ? Math.max(-90, 20 * Math.log10(x)) : -90);

/** Duration, rate, channels, and peak and rms over every channel. */
export function measure(d: Decoded): FileMeta {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (const ch of d.channels) {
    for (let i = 0; i < ch.length; i++) {
      const v = Math.abs(ch[i]!);
      if (v > peak) peak = v;
      sum += v * v;
    }
    n += ch.length;
  }
  const len = d.channels[0]?.length ?? 0;
  return { duration: d.sampleRate > 0 ? len / d.sampleRate : 0, sampleRate: d.sampleRate, channels: d.channels.length, peakDb: db(peak), rmsDb: db(n ? Math.sqrt(sum / n) : 0) };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "") || "no message";

const aborted = (e: unknown) => !!e && typeof e === "object" && (e as { name?: unknown }).name === "AbortError";

/** A file queue: add, list, start, stop, cancel and retry jobs. */
export interface FileQueue<F extends FileLike, R> {
  /** Adds what it accepts. Skipped files and large file warnings come back as ui lines. */
  add(files: Iterable<F>): { added: Job<F, R>[]; skipped: string[]; warnings: string[] };
  jobs(): Job<F, R>[];
  get(id: number): Job<F, R> | undefined;
  /** Runs every queued and failed job in order; resolves when the queue stops or empties. */
  start(): Promise<void>;
  /** Stops after aborting the running job, which goes back to queued. */
  stop(): void;
  /** Stops a running job (back to queued) or takes a waiting one off the list. */
  cancel(id: number): void;
  remove(id: number): void;
  /** Puts a failed or done job back to queued. */
  retry(id: number): void;
  clear(): void;
  readonly running: boolean;
}

/** A file queue that decodes, measures and runs each file in turn. */
export function createQueue<F extends FileLike, R = unknown>(o: QueueOptions<F, R>): FileQueue<F, R> {
  const list: Job<F, R>[] = [];
  let seq = 0;
  let running = false;
  let current: { id: number; ctl: AbortController } | null = null;
  const large = o.largeBytes ?? 1.5e9;
  const changed = () => o.onChange?.(list.map((j) => ({ ...j })));
  const find = (id: number) => list.find((j) => j.id === id);
  const reset = (j: Job<F, R>) => Object.assign(j, { state: "queued" as const, phase: null, progress: 0, error: null });

  async function runOne(j: Job<F, R>): Promise<void> {
    const ctl = new AbortController();
    current = { id: j.id, ctl };
    Object.assign(j, { state: "running" as const, phase: "decoding" as const, progress: 0, error: null, result: null });
    changed();
    let audio: Decoded;
    try {
      audio = await o.decode(j.file, ctl.signal);
      j.meta = measure(audio);
      if (!audio.channels.length || !audio.channels[0]!.length) throw new Error("no samples");
    } catch (e) {
      if (aborted(e) || ctl.signal.aborted) reset(j);
      else Object.assign(j, { state: "failed" as const, phase: null, error: `could not decode ${j.name}. convert it to wav or mp3 and drop it again.` });
      changed();
      return;
    }
    j.phase = "working";
    changed();
    try {
      const r = await o.run(
        { ...audio, meta: j.meta },
        {
          job: j,
          signal: ctl.signal,
          progress: (p) => {
            j.progress = Math.min(1, Math.max(0, p));
            changed();
          },
        },
      );
      if (ctl.signal.aborted) reset(j);
      else Object.assign(j, { state: "done" as const, phase: null, progress: 1, result: r });
    } catch (e) {
      if (aborted(e) || ctl.signal.aborted) reset(j);
      else Object.assign(j, { state: "failed" as const, phase: null, error: o.explain ? o.explain(e) : `the run failed: ${message(e)}. press run to try again.` });
    }
    changed();
  }

  return {
    add(files) {
      const added: Job<F, R>[] = [];
      const skipped: string[] = [];
      const warnings: string[] = [];
      for (const f of files) {
        if (!acceptsFile(f)) {
          skipped.push(`skipped ${f.name} (not audio or video)`);
          continue;
        }
        if (f.size > large) warnings.push(`${f.name} is ${sizeText(f.size)}. decoding loads the whole file into memory, so this may fail. pull the audio out first if it does.`);
        const j: Job<F, R> = { id: ++seq, file: f, name: f.name, size: f.size, state: "queued", phase: null, progress: 0, meta: null, result: null, error: null };
        list.push(j);
        added.push({ ...j });
      }
      if (added.length) changed();
      return { added, skipped, warnings };
    },
    jobs: () => list.map((j) => ({ ...j })),
    get: (id) => {
      const j = find(id);
      return j ? { ...j } : undefined;
    },
    async start() {
      if (running) return;
      running = true;
      const tried = new Set<number>();
      try {
        for (;;) {
          const next = list.find((j) => (j.state === "queued" || j.state === "failed") && !tried.has(j.id));
          if (!running || !next) break;
          tried.add(next.id);
          await runOne(next);
          current = null;
        }
      } finally {
        running = false;
        current = null;
      }
    },
    stop() {
      running = false;
      current?.ctl.abort();
    },
    cancel(id) {
      if (current?.id === id) current.ctl.abort();
      else this.remove(id);
    },
    remove(id) {
      if (current?.id === id) current.ctl.abort();
      const i = list.findIndex((j) => j.id === id);
      if (i >= 0) {
        list.splice(i, 1);
        changed();
      }
    },
    retry(id) {
      const j = find(id);
      if (j && (j.state === "failed" || j.state === "done")) {
        reset(j);
        j.result = null;
        changed();
      }
    },
    clear() {
      current?.ctl.abort();
      list.length = 0;
      changed();
    },
    get running() {
      return running;
    },
  };
}
