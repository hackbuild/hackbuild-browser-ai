import { afterEach, describe, expect, test, vi } from "vitest";
import { DEPRECATION, ELEMENT_NAMES, define, traceRows } from "@hackbuild/ai-elements";

describe("ai-elements, deprecated", () => {
  afterEach(() => vi.restoreAllMocks());
  test("define registers the ai-views elements under hb and notes the deprecation once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const reg = new Map<string, unknown>();
    const target = { get: (n: string) => reg.get(n), define: (n: string, c: unknown) => void reg.set(n, c) };
    class B {}
    expect(define("hb", target, B as never)).toEqual(ELEMENT_NAMES.map((n) => `hb-${n}`));
    define("x", target, B as never);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe(DEPRECATION);
    expect(DEPRECATION).toMatch(/@hackbuild\/ai-views/);
    expect(typeof traceRows).toBe("function");
  });
});
