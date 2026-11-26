import { decodeAudio, lumaHistogram, pickKeyframes, sampleTimes } from "@hackbuild/media";

const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
input.onchange = async () => {
  const file = input.files![0]!;
  const { channels, duration } = await decodeAudio(file, 16000); // the audio at 16 kHz for speech to text
  console.log(`${channels.length} channels, ${duration.toFixed(1)} s`);
  // one small frame a second off a video element, then keyframes by scene change
  const video = Object.assign(document.createElement("video"), { src: URL.createObjectURL(file), muted: true });
  await new Promise((r) => (video.onloadeddata = r));
  const g = new OffscreenCanvas(64, 36).getContext("2d")!;
  const frames: { t: number; hist: Float32Array }[] = [];
  for (const t of sampleTimes(video.duration, 1)) {
    video.currentTime = t;
    await new Promise((r) => (video.onseeked = r));
    g.drawImage(video, 0, 0, 64, 36);
    frames.push({ t, hist: lumaHistogram(g.getImageData(0, 0, 64, 36).data) });
  }
  console.log("keyframes at", pickKeyframes(frames, { threshold: 0.3, maxGap: 10, max: 12 }).map((i) => frames[i]!.t));
};
