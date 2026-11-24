import type { Hub, ModelRecord } from "@hackbuild/models";
import type { Asr } from "./transcribe.js";
import { TRANSCRIBE_RECORDS } from "./records.js";

export { analyze, finishReel, options as frontEndOptions, SR, HOP, FRAME, type Analysis, type FrontEndOptions } from "./frontend.js";
export { packReels, materialize, mapTime, type Reel, type Run, type MappedRun, type Materialized } from "./reels.js";
export { cleanup, HARD, SOFT, WEAK, type Seg, type Word, type Dropped, type DropReason } from "./cleanup.js";
export { WHISPER_LANGUAGES, englishOnly, languagesFor, type Language, type LanguageChoice } from "./languages.js";
export { asTxt, asSrt, asVtt, asJson, bundle, baseName, type TranscriptDoc, type Manifest, type ManifestFile } from "./export.js";
export { levelRail, regate, railBins, type LevelRail, type RailBins } from "./rail.js";
export { createQueue, acceptsFile, measure, type FileQueue, type QueueOptions, type Job, type JobState, type FileLike, type FileMeta, type Decoded } from "./queue.js";
export { transcribe, toMono, type Asr, type AsrOutput, type TranscribeOptions, type Transcript } from "./transcribe.js";
export { TRANSCRIBE_RECORDS, defaultTranscribeId } from "./records.js";
export { LiveSegmenter, StreamDecimator, StreamResampler, toSixteenK, lowpassTaps, blockDb, type LiveOptions } from "./live.js";
export { webSpeech, webSpeechAvailable, type SpeechRecognitionLike, type WebSpeechOptions } from "./webspeech.js";

/** A stub ASR: one chunk per reel reading "stub transcript, N s", with no weights. */
export function stubAsr(text = "stub transcript"): Asr {
  return async (audio) => {
    const dur = audio.length / 16000;
    return { text, chunks: [{ timestamp: [0.1, Math.max(0.2, dur - 0.1)], text: `${text}, ${dur.toFixed(1)} s` }] };
  };
}

/** Stub builders to merge into `stubFactory({...})` for `?stub` pages and tests. */
export function transcribeStubs(): Record<string, (r: ModelRecord) => unknown> {
  return { transcribe: () => stubAsr() };
}

/** Add the speech to text records to a hub's registry. The default transformers.js loader runs them. */
export function attachTranscribe(hub: Hub): void {
  hub.registry.add(...TRANSCRIBE_RECORDS);
}
