import { describe, expect, it } from "vitest";
import { humanError, tjsProvider } from "@hackbuild/devices";
import { createHub, type LoadEvent, type ModelRecord } from "@hackbuild/models";
import { WeightError } from "@hackbuild/weights";

const dom = (name: string, message = "x") => Object.assign(new Error(message), { name });

describe("humanError", () => {
  it("maps each mic error name to its line, ending with what still works", () => {
    expect(humanError("mic", dom("NotAllowedError"))).toBe("the mic is blocked for this site. type instead, or allow it in the address bar.");
    expect(humanError("mic", dom("NotFoundError"))).toBe("no microphone found. plug one in, or type instead.");
    expect(humanError("mic", dom("NotReadableError"))).toBe("the mic is in use by another app. close it, or type instead.");
    expect(humanError("mic", dom("OverconstrainedError"))).toMatch(/^no microphone found/);
  });

  it("maps camera errors and keeps an unknown message", () => {
    expect(humanError("camera", dom("SecurityError"))).toMatch(/^the camera is blocked.*drop an image instead/);
    expect(humanError("camera", dom("NotFoundError"))).toBe("no camera found. drop an image instead.");
    expect(humanError("camera", dom("TypeError", "constraints were odd."))).toBe("the camera did not start: constraints were odd. drop an image instead.");
  });

  it("names runtime failures and the working alternative", () => {
    expect(humanError(new Error("RangeError: Array buffer allocation failed"))).toMatch(/^the model ran out of memory\. unload another model/);
    expect(humanError(new Error("GPUDevice was lost"))).toMatch(/^the gpu reset/);
    expect(humanError(new Error("shader-f16 not supported"))).toMatch(/^this gpu has no shader-f16/);
    expect(humanError(new Error("LinkError: import mismatch"))).toMatch(/^the runtime and the model build do not match/);
    expect(humanError(new TypeError("Failed to fetch"))).toMatch(/^the download failed\..*finished files are kept\.$/);
    expect(humanError(dom("AbortError", "aborted"))).toMatch(/^stopped\./);
  });

  it("names storage failures from the weight store", () => {
    expect(humanError(new WeightError("quota", "not enough storage for k"))).toMatch(/^not enough storage for this model\. remove a stored model/);
    expect(humanError(new WeightError("sha256", "sha256 of k is a"))).toMatch(/checksum/);
    expect(humanError("storage", new Error("idb closed"))).toBe("storage failed: idb closed. the model still runs, and is fetched again next visit.");
  });

  it("keeps an unknown message, one line and lowercase around it", () => {
    expect(humanError(new Error("Weird thing\n happened."))).toBe("the model failed: Weird thing happened. pick another row, or reload the page.");
    expect(humanError("model")).toBe("the model failed: model. pick another row, or reload the page.");
    for (const line of [humanError("mic", dom("NotAllowedError")), humanError(new Error("out of memory"))]) {
      expect(line).toBe(line.toLowerCase());
      expect(line).not.toMatch(/!/);
    }
  });
});

describe("tjs progress reaches hub.onLoad", () => {
  it("reports merged file progress under the record id", async () => {
    const rec: ModelRecord = { id: "d", provides: ["depth"], provider: "tjs", source: { modelId: "o/d" }, sizeMB: 1, sizeSource: "inferred", ladder: [{ device: "wasm" }], licence: "MIT", commercial: true };
    const tjs = {
      pipeline: async (_t: string, _m: string, o: Record<string, unknown>) => {
        const cb = o.progress_callback as (e: unknown) => void;
        cb({ status: "progress", file: "onnx/model.onnx", loaded: 50, total: 100 });
        cb({ status: "done", file: "onnx/model.onnx" });
        return () => null;
      },
    };
    const hub = createHub({ onLicence: () => {} });
    hub.registry.add(rec);
    hub.provide("tjs", tjsProvider({ runtime: async () => tjs }).factory);
    const seen: LoadEvent[] = [];
    hub.onLoad((e) => seen.push(e));
    await hub.use({ id: "d" });
    expect(seen.map((e) => [e.phase, e.fraction])).toEqual([
      ["fetch", null],
      ["fetch", 0.5],
      ["fetch", 1],
      ["ready", 1],
    ]);
    expect(seen[1]!.file).toBe("onnx/model.onnx");
  });
});
