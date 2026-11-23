/**
 * Microphone helpers. Ask for the microphone before any model download so
 * the permission prompt shows at once. Echo cancellation, noise
 * suppression and gain control are requested, since barge in depends on
 * the character's voice being cancelled out of the input.
 */

export interface MicOptions {
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  deviceId?: string;
}

export async function openMic(o: MicOptions = {}): Promise<MediaStream> {
  const gum = o.getUserMedia ?? ((c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c));
  const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
  if (o.deviceId) audio.deviceId = { exact: o.deviceId };
  return gum({ audio });
}

/** Source of the capture worklet: posts each 128 sample render quantum of channel 0, batched to `size`. */
export function captureWorkletSource(size = 2048): string {
  return [
    "class HbCapture extends AudioWorkletProcessor {",
    `  constructor() { super(); this.buf = new Float32Array(${size}); this.n = 0; }`,
    "  process(inputs) {",
    "    const ch = inputs[0] && inputs[0][0];",
    "    if (ch) for (let i = 0; i < ch.length; i++) {",
    "      this.buf[this.n++] = ch[i];",
    `      if (this.n === ${size}) { this.port.postMessage(this.buf.slice()); this.n = 0; }`,
    "    }",
    "    return true;",
    "  }",
    "}",
    "registerProcessor('hb-capture', HbCapture);",
  ].join("\n");
}

/**
 * Stream microphone blocks at the context rate to `onBlock`. The worklet
 * loads from a Blob URL, then a data: URL (file:// pages). Returns a stop
 * function. Not run in a browser by this package's tests.
 */
export async function micBlocks(ctx: AudioContext, stream: MediaStream, onBlock: (b: Float32Array) => void, size = 2048): Promise<() => void> {
  const src = captureWorkletSource(size);
  try {
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
  } catch {
    await ctx.audioWorklet.addModule(`data:text/javascript;base64,${btoa(src)}`);
  }
  const node = new AudioWorkletNode(ctx, "hb-capture");
  node.port.onmessage = (ev: MessageEvent<Float32Array>) => onBlock(ev.data);
  const input = ctx.createMediaStreamSource(stream);
  input.connect(node);
  return () => {
    input.disconnect();
    node.disconnect();
    node.port.onmessage = null;
  };
}
