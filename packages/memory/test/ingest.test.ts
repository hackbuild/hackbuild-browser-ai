import { describe, expect, test } from "vitest";
import { chunkText, ingest, mailText, readSources, sourceType, type SourceFile, type ZipLike } from "../src/ingest.js";

const file = (name: string, text: string, type = ""): SourceFile => Object.assign(new Blob([text], { type }), { name });

describe("ingest", () => {
  test("types by name", () => {
    expect(sourceType({ name: "a.PDF" })).toBe("pdf");
    expect(sourceType({ name: "b.docx" })).toBe("docx");
    expect(sourceType({ name: "c.eml" })).toBe("mail");
    expect(sourceType({ name: "d.md" })).toBe("text");
    expect(sourceType({ name: "e.png", type: "image/png" })).toBeNull();
  });

  test("mail body: plain part, quoted printable, attachment skipped", () => {
    const raw = [
      "Subject: bench notes",
      "From: a@b.c",
      'Content-Type: multipart/mixed; boundary="xx"',
      "",
      "--xx",
      "Content-Type: text/plain",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "the laser is booked on tues=",
      "days",
      "--xx",
      "Content-Type: text/plain",
      "Content-Disposition: attachment; filename=x.txt",
      "",
      "secret attachment",
      "--xx--",
    ].join("\r\n");
    const t = mailText(raw);
    expect(t).toContain("subject: bench notes");
    expect(t).toContain("booked on tuesdays");
    expect(t).not.toContain("secret attachment");
  });

  test("chunks overlap and stay under the size", () => {
    const text = Array.from({ length: 60 }, (_, i) => `sentence number ${i} is here.`).join(" ");
    const c = chunkText(text, 200, 40);
    expect(c.length).toBeGreaterThan(5);
    for (const p of c) expect(p.length).toBeLessThanOrEqual(200);
  });

  test("zip entries read through a passed module, unknown files reported", async () => {
    const jszip: ZipLike = {
      loadAsync: async () => ({ files: { "n.txt": { dir: false, name: "n.txt", async: async () => new Blob(["petg not pla"]) }, "p.bin": { dir: false, name: "p.bin", async: async () => new Blob(["x"]) } } }),
    };
    const notes: string[] = [];
    const out = await readSources([file("all.zip", "PK")], { modules: { jszip: async () => jszip }, onFile: (e) => e.note && notes.push(e.name) });
    expect(out).toEqual([{ name: "all.zip/n.txt", text: "petg not pla", type: "text" }]);
    expect(notes).toEqual(["all.zip/p.bin"]);
  });

  test("ingest adds doc chunks with their source", async () => {
    const added: { text: string; o: unknown }[] = [];
    const mem = { add: async (text: string, o?: unknown) => (added.push({ text, o }), { id: added.length, merged: false }) };
    const r = await ingest(mem, [file("a.md", "the dog collar needs a buckle")]);
    expect(r).toEqual({ files: 1, chunks: 1 });
    expect(added[0]!.o).toMatchObject({ kind: "doc", section: "a.md", meta: { source: "a.md" } });
  });
});
