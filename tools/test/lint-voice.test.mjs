import { test } from "node:test";
import assert from "node:assert/strict";
import { lintText } from "../voice-rules.mjs";

const rules = (path, text) => lintText(path, text).map((f) => f.rule);

test("internal code names and the private nickname are blocked; common words are not", () => {
  assert.deepEqual(rules("a.md", "the SCRIBE front end"), ["private"]);
  assert.deepEqual(rules("a.ts", "// as the HACKLE build did"), ["private"]);
  const nick = Buffer.from("Y29tcGFuaW9u", "base64").toString("utf8");
  assert.deepEqual(rules("a.md", `${nick} builds saw this`), ["private"]);
  assert.deepEqual(rules("a.md", "a worker shaped shim, a shear stress, bail out"), []);
  assert.deepEqual(rules("a.md", "Shim the worker"), []);
});
