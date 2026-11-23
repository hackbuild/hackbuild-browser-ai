# @hackbuild/media

Media in a tab, from SCRIBE and JIG: decode a file's audio to a target
rate, pick keyframes by scene change, and record a canvas or stream. Code
MIT; this README CC-BY-4.0 with the code samples also MIT. No models.

    npm install @hackbuild/media

    import { decodeAudio, lumaHistogram, pickKeyframes, record } from "@hackbuild/media";
    const { channels } = await decodeAudio(file, 16000);          // for transcribe; 44100 for stems
    const keys = pickKeyframes(frames.map((f) => ({ t: f.t, hist: lumaHistogram(f.rgba) })), { threshold: 0.3, maxGap: 10, max: 12 });
    const rec = record(canvas.captureStream(30));                 // first supported webm or mp4 type
    const blob = await rec.stop();

- `decodeAudio` uses the browser's decoder through an OfflineAudioContext
  and resamples by rendering; it names the failure when the container is
  refused (mkv and avi usually are). Pages cannot fetch YouTube audio
  (CORS); that needs an extension or a proxy.
- `pickKeyframes` keeps the first frame, each frame whose 32 bin luma
  histogram moved more than the threshold from the last keyframe, one per
  `maxGap` seconds, and the biggest changes under a cap.
- `record` tries vp9, vp8, plain webm, then mp4 with `MediaRecorder`.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/media` passes 3 tests under Node
  22.18.0 with fake browser objects: decode and resample flow and the
  refused container message, histogram distance and keyframe picking
  with gap and cap, MIME picking and chunk collection.

### Not verified by anything

- Real decoding of mp4, mov, webm and mkv files in Chrome, Safari and
  Firefox; real recording; ffmpeg.wasm or WebCodecs paths (not built).
