import { probe } from "@hackbuild/ai-env";
import { loadOrt, loadTransformers, PINS } from "@hackbuild/devices";
import { openWeightStore, Sha256 } from "@hackbuild/weights";
import { $, auto, check, finish, readout, result, status } from "../shared/ui.js";

// all-MiniLM-L6-v2 q8 graph, weights Apache-2.0, about 23 MB (inferred), used only for the range resume test
const RESUME_URL = "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx";

const r = result("devices");
$("#controls").innerHTML = `
<button id="rt">import the runtimes</button>
<button id="resume">test a resumed download</button>
<button id="sha">time sha-256</button>`;
const rows: Record<string, string | number> = {};
const show = (o: Record<string, string | number>) => {
  Object.assign(rows, o);
  readout(rows);
};

status("probing this browser.");
const env = await probe();
show({
  webgpu: env.webgpu ? `yes, ${env.adapter?.vendor ?? "unknown"} ${env.adapter?.architecture ?? ""}` : "no",
  "shader-f16": env.f16 ? "yes" : "no",
  "max buffer MB (measured)": env.maxBufferBytes ? Math.round(env.maxBufferBytes / 1e6) : "unknown",
  "cross origin isolated": env.isolated ? "yes" : "no",
  "wasm threads (computed)": env.threads,
  opfs: env.opfs ? "yes" : "no",
  "cache storage": env.cacheStorage ? "yes" : "no",
  indexeddb: env.indexedDB ? "yes" : "no",
  "device memory GB (vendor, rounded by the browser)": env.deviceMemoryGB ?? "unknown",
  "prompt api": env.promptApi ? "present" : "absent",
  protocol: env.protocol,
});
status(env.notes.length ? env.notes.join(" ") : "every capability the probe checks is present.", env.notes.length ? "warn" : "ok");
r.numbers["probe webgpu"] = String(env.webgpu);
r.numbers["probe f16"] = String(env.f16);
r.numbers["probe opfs"] = String(env.opfs);
r.numbers["probe threads"] = env.threads;
r.numbers["probe prompt api"] = String(env.promptApi);
// the fields are what is checked; the published site is https and local runs are http
const probeOk = (env.protocol === "http" || env.protocol === "https") && typeof env.webgpu === "boolean" && env.indexedDB;

async function runtimes(): Promise<boolean> {
  status(`importing transformers.js ${PINS.transformers} and onnxruntime-web ${PINS.ort} from the pinned cdn urls.`);
  let ok = true;
  for (const [name, load] of [["transformers.js", loadTransformers()], ["onnxruntime-web", loadOrt()]] as const) {
    const t = performance.now();
    try {
      const m = (await load()) as unknown as Record<string, unknown>;
      const ms = Math.round(performance.now() - t);
      const keys = name === "transformers.js" ? ["pipeline", "env"] : ["InferenceSession", "Tensor", "env"];
      const missing = keys.filter((k) => !(k in m));
      show({ [`${name} import ms (measured)`]: missing.length ? `missing ${missing.join(", ")}` : ms });
      r.numbers[`${name} import ms (measured)`] = ms;
      if (missing.length) ok = false;
    } catch (e) {
      ok = false;
      show({ [`${name} import`]: `failed: ${(e as Error).message.slice(0, 120)}` });
    }
  }
  status(ok ? "both runtimes imported." : "a runtime did not import. see the readout.", ok ? "ok" : "bad");
  return ok;
}

async function resumeTest(): Promise<{ ok: boolean; why: string }> {
  status("downloading part of a file, stopping it, and asking for the rest.");
  const seen: { status: number; range: string | null; ifRange: string | null }[] = [];
  const f: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    const h = new Headers(init?.headers);
    seen.push({ status: res.status, range: h.get("range"), ifRange: h.get("if-range") });
    return res;
  };
  const store = await openWeightStore({ backends: ["idb"], partBytes: 2 * 1024 * 1024, fetch: f, onNotice: (l) => r.notes.push(`notice: ${l}`) });
  const ref = { url: RESUME_URL, key: "example:minilm-q8-resume", licence: "Apache-2.0" };
  await store.evict(ref.key);
  const ac = new AbortController();
  let firstStop = 0;
  try {
    await store.get(ref, {
      signal: ac.signal,
      onProgress: (p) => {
        if (p.loaded > 5e6 && !ac.signal.aborted) {
          firstStop = p.loaded;
          ac.abort();
        }
      },
    });
  } catch {
    /* the abort */
  }
  const kept = (await store.meta(ref.key))?.parts.reduce((a, b) => a + b, 0) ?? 0;
  const t = performance.now();
  const blob = await store.get(ref);
  const ms = Math.round(performance.now() - t);
  const second = seen[seen.length - 1];
  show({
    "stopped at MB (measured)": (firstStop / 1e6).toFixed(1),
    "kept parts MB (measured)": (kept / 1e6).toFixed(1),
    "resume request": `range ${second?.range ?? "none"}, if-range ${second?.ifRange ? "sent" : "not sent"}`,
    "resume answer": second?.status ?? "none",
    "file MB (measured)": (blob.size / 1e6).toFixed(1),
  });
  r.numbers["resume answer status (measured)"] = second?.status ?? 0;
  r.numbers["resume kept MB (measured)"] = Math.round(kept / 1e5) / 10;
  r.numbers["resume rest ms (measured)"] = ms;
  await store.evict(ref.key);
  if (!second?.range) return { ok: false, why: "the second get sent no range header" };
  if (second.status !== 206) return { ok: false, why: `hugging face answered ${second.status} to range plus if-range` };
  return { ok: true, why: `206 for ${second.range} with if-range` };
}

/** SHA-256 of 64 MiB on the main thread; correct only when it equals Web Crypto's digest of the same bytes. */
async function shaTest(): Promise<{ mbps: number; ok: boolean }> {
  const n = 64 * 1024 * 1024;
  const buf = new Uint8Array(n);
  for (let i = 0; i < n; i += 4096) buf[i] = i & 255;
  const t = performance.now();
  const hex = new Sha256().update(buf).digestHex();
  const ms = performance.now() - t;
  const ref = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buf)), (b) => b.toString(16).padStart(2, "0")).join("");
  const mbps = Math.round((n / 1e6 / ms) * 1000);
  show({ "sha-256 main thread MB/s over 64 MiB (measured)": mbps });
  r.numbers["sha-256 main thread MB/s (measured)"] = mbps;
  return { mbps, ok: hex === ref && mbps > 0 };
}

$("#rt").addEventListener("click", () => void runtimes());
$("#resume").addEventListener("click", () => void resumeTest().then((x) => status(x.why, x.ok ? "ok" : "bad")));
$("#sha").addEventListener("click", () => void shaTest());

if (auto) {
  check(r, "#1 ai-env: probe() fields", probeOk ? "pass" : "fail", "chrome over http or https; safari, firefox and file:// not run");
  const rt = await runtimes();
  check(r, "#24 devices: loadTransformers and loadOrt from the pinned urls", rt ? "pass" : "fail", "chrome over http only; safari and file:// not run");
  try {
    const x = await resumeTest();
    // the CDN answers 206 even to a stale If-Range; the validator compare on the 206 is covered by the weights unit tests
    check(r, "#5 weights: resume against hugging face with range and if-range", x.ok ? "pass" : "fail", `${x.why}; a 206 shows the range works, the etag compare that guards a changed file is unit tested only`);
  } catch (e) {
    check(r, "#5 weights: resume against hugging face with range and if-range", "fail", (e as Error).message);
  }
  const sha = await shaTest();
  check(r, "#7 weights: sha-256 throughput", sha.ok ? "pass" : "fail", `main thread ${sha.mbps} MB/s (measured), digest ${sha.ok ? "equals" : "differs from"} web crypto; the worker half not run`);
  const failed = Object.values(r.checks).some((c) => c.status === "fail");
  finish(r, failed ? "fail" : "pass");
}
