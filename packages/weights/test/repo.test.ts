import { describe, expect, it } from "vitest";
import { getRepo, hfResolve, openWeightStore, ortExternalData, transformersCache } from "@hackbuild/weights";

function host(files: Record<string, string>) {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    const body = files[url];
    return body === undefined ? new Response("missing", { status: 404 }) : new Response(body, { headers: { "content-length": String(body.length) } });
  };
  return { fetch: f as unknown as typeof fetch, calls };
}

const base = hfResolve("onnx-community/depth-anything-v2-small", "main");

describe("multi file repos", () => {
  it("builds the resolve url", () => {
    expect(base).toBe("https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/");
  });

  it("fetches every file, skips a missing optional one, and gives ort external data", async () => {
    const h = host({
      [base + "config.json"]: "{}",
      [base + "onnx/model.onnx"]: "graph",
      [base + "onnx/model.onnx_data"]: "weights-bytes",
    });
    const store = await openWeightStore({ backends: ["memory"], fetch: h.fetch, onNotice: () => {} });
    const seen: string[] = [];
    const files = await getRepo(
      store,
      {
        base,
        licence: "Apache-2.0",
        files: [{ path: "config.json" }, { path: "preprocessor_config.json", optional: true }, { path: "onnx/model.onnx" }, { path: "onnx/model.onnx_data" }],
      },
      { onProgress: (p) => seen.push(`${p.index}/${p.count}:${p.file}`) },
    );
    expect([...files.keys()]).toEqual(["config.json", "onnx/model.onnx", "onnx/model.onnx_data"]);
    expect(seen).toContain("3/4:onnx/model.onnx_data");
    const ext = await ortExternalData(files, "onnx/model.onnx");
    expect(ext.map((e) => e.path)).toEqual(["model.onnx_data"]);
    expect(new TextDecoder().decode(ext[0]!.data)).toBe("weights-bytes");
  });

  it("fails the repo on a missing required file", async () => {
    const store = await openWeightStore({ backends: ["memory"], fetch: host({}).fetch, onNotice: () => {} });
    await expect(getRepo(store, { base, licence: "MIT", files: [{ path: "x.onnx" }] })).rejects.toThrow(/http 404/);
  });
});

describe("transformers.js cache", () => {
  it("downloads managed urls through the store and passes others through", async () => {
    const h = host({ [base + "onnx/model_q4.onnx"]: "abc" });
    const lines: string[] = [];
    const store = await openWeightStore({ backends: ["memory"], fetch: h.fetch, onNotice: (l) => lines.push(l) });
    const cache = transformersCache(store, { licenceFor: (u) => (u.startsWith(base) ? "Apache-2.0" : null) });
    const r = await cache.match(base + "onnx/model_q4.onnx");
    expect(await r!.text()).toBe("abc");
    expect(lines[0]).toMatch(/Apache-2.0/);
    expect(await cache.match(base + "missing.json")).toBeUndefined();
    expect(await cache.match("https://other.test/tok.json")).toBeUndefined();
    await cache.put("https://other.test/tok.json", new Response("tok"));
    expect(await (await cache.match("https://other.test/tok.json"))!.text()).toBe("tok");
  });
});
