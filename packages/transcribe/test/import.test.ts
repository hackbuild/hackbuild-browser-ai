import { describe, expect, test } from "vitest";
import { toJson, toSrt, toVtt } from "@hackbuild/audio-dsp";
import { TranscriptImportError, asJson, asSrt, asVtt, importTranscript, parseSrt, parseStamp, parseTranscriptJson, parseVtt, sniffTranscript, type Seg, type TranscriptDoc } from "@hackbuild/transcribe";

const segs: Seg[] = [
  { start: 0.5, end: 2.25, text: "the bench is set up", speaker: "moe" },
  { start: 2.25, end: 4.001, text: "a < b & c > d, ok" },
  { start: 3661.999, end: 3663.5, text: "two\nlines", speaker: "guest one" },
  { start: 5, end: 6, text: "edited line", edited: true, confidence: 0.912, words: [{ start: 5, end: 5.5, text: "edited", confidence: 0.8 }, { start: 5.5, end: 6, text: "line" }] },
];
const plain = (s: Seg) => ({ start: s.start, end: s.end, text: s.text, ...(s.speaker ? { speaker: s.speaker } : {}) });

describe("round trip against the exporters", () => {
  test("json keeps everything asJson writes", () => {
    const doc: TranscriptDoc = {
      source: "talk.wav",
      model: "whisper-base",
      language: "en",
      duration: 3700,
      segments: segs,
      dropped: [{ start: 7, end: 8, text: "thanks for watching", why: "outro" }],
      stats: { dur: 3700, rtf: 4.2 },
    };
    const back = parseTranscriptJson(asJson(doc));
    expect(back).toEqual(doc);
    expect(asJson(back)).toBe(asJson(doc));
  });
  test("srt keeps times, text and, when asked, speakers", () => {
    const back = parseSrt(asSrt(segs), { speakers: true });
    expect(back).toEqual(segs.map(plain));
    expect(asSrt(back)).toBe(asSrt(segs));
    // without the option the label stays in the text
    expect(parseSrt(asSrt(segs))[0]!.text).toBe("moe: the bench is set up");
  });
  test("vtt keeps times, text and voice tags", () => {
    const back = parseVtt(asVtt(segs));
    expect(back).toEqual(segs.map(plain));
    expect(asVtt(back)).toBe(asVtt(segs));
  });
  test("the audio-dsp layouts read back too", () => {
    const p = segs.map((s) => ({ start: s.start, end: s.end, text: s.text }));
    expect(parseSrt(toSrt(p))).toEqual(p);
    expect(parseVtt(toVtt(p))).toEqual(p);
    const j = parseTranscriptJson(toJson({ source: "a.wav", duration: 9, model: "m", language: "de", segments: p, dropped: [{ start: 1, text: "you", why: "phantom" }] }));
    expect(j.segments).toEqual(p);
    expect(j.dropped).toEqual([{ start: 1, end: 1, text: "you", why: "phantom" }]);
  });
});

describe("files from elsewhere", () => {
  test("vtt with cue ids, settings, notes, styling and mm:ss stamps", () => {
    const v = "﻿WEBVTT - a title\r\n\r\nNOTE a note\r\nspans lines\r\n\r\nSTYLE\r\n::cue { color: red }\r\n\r\ncue-1\r\n00:01.500 --> 00:03.000 align:start line:0\r\n<b>hello</b> <c.loud>there</c>&nbsp;now\r\n\r\n<v.x Ann>hi</v>\r\n";
    const back = parseVtt(v.replace("<v.x Ann>hi</v>", "00:03.000 --> 00:04.000\n<v.x Ann>hi</v>"));
    expect(back).toEqual([
      { start: 1.5, end: 3, text: "hello there now" },
      { start: 3, end: 4, text: "hi", speaker: "Ann" },
    ]);
  });
  test("srt with crlf, a bom and short millisecond fields", () => {
    expect(parseSrt("﻿1\r\n00:00:01,5 --> 00:00:02,25\r\nhi\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nthere\r\n")).toEqual([
      { start: 1.5, end: 2.25, text: "hi" },
      { start: 3, end: 4, text: "there" },
    ]);
    expect(parseStamp("01:02:03.004")).toBe(3723.004);
  });
  test("refusals name the failure", () => {
    expect(() => parseVtt("1\n00:00:01,000 --> 00:00:02,000\nx")).toThrow("this is not a vtt file. it must start with WEBVTT.");
    expect(() => parseSrt("just some words")).toThrow(TranscriptImportError);
    expect(() => parseTranscriptJson("{")).toThrow("this json file does not parse. it may be cut short.");
    expect(() => parseTranscriptJson('{"segments":[{"start":1}]}')).toThrow("segment 1 needs a start, an end and a text.");
    expect(() => importTranscript("notes.txt", "hello")).toThrow("notes.txt is not a transcript this tool reads. drop a json, srt or vtt file.");
  });
});

test("import picks the format by extension or content", () => {
  expect(sniffTranscript("a.SRT", "")).toBe("srt");
  expect(sniffTranscript("clip", "WEBVTT\n")).toBe("vtt");
  expect(sniffTranscript("clip", asSrt(segs))).toBe("srt");
  expect(sniffTranscript("clip", "{}")).toBe("json");
  const srt = importTranscript("talk.srt", asSrt(segs), { speakers: true });
  expect(srt).toMatchObject({ format: "srt", source: "talk.srt", model: "", language: "" });
  expect(srt.segments[2]!.speaker).toBe("guest one");
  const json = importTranscript("x.json", asJson({ source: "talk.wav", model: "m", language: "en", segments: segs }));
  expect(json).toMatchObject({ format: "json", source: "talk.wav", model: "m" });
});
