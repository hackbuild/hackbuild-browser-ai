import { decodeAudio, lumaHistogram, pickKeyframes, record } from "@hackbuild/media";

// audio at 16 kHz for speech to text, from a file the user dropped
const file = new File([], "clip.mp4");
const { channels, duration } = await decodeAudio(file, 16000);
console.log(`${channels.length} channels, ${duration.toFixed(1)} s`);

// keyframes from frames you sampled off a video into RGBA pixels
const frames: { t: number; rgba: Uint8ClampedArray }[] = [];
const keys = pickKeyframes(frames.map((f) => ({ t: f.t, hist: lumaHistogram(f.rgba) })), { threshold: 0.3, maxGap: 10, max: 12 });
console.log("keyframes at", keys.map((i) => frames[i]?.t));

// record a canvas for five seconds
const canvas = document.querySelector("canvas")!;
const rec = record(canvas.captureStream(30));
setTimeout(async () => console.log("recorded", rec.mimeType, (await rec.stop()).size, "bytes"), 5000);
