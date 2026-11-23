/**
 * The face landmark fallback over face-api.js (code MIT, weights MIT from
 * @vladmandic/face-api): the tiny face detector plus the 68 point tiny
 * landmark net, on the wasm or cpu backend (FaceSwap forced wasm). Points
 * come back normalized to the image like MediaPipe's.
 */

import type { Factory } from "@hackbuild/models";
import type { Landmarker } from "./types.js";

/** The parts of face-api.js the provider touches. Tests pass a fake. */
export interface FaceApi {
  nets: { tinyFaceDetector: { loadFromUri(u: string): Promise<void> }; faceLandmark68TinyNet: { loadFromUri(u: string): Promise<void> } };
  TinyFaceDetectorOptions: new (o?: Record<string, unknown>) => unknown;
  detectAllFaces(img: unknown, o: unknown): {
    withFaceLandmarks(tiny: boolean): Promise<{ landmarks: { positions: { x: number; y: number }[] }; detection: { imageWidth: number; imageHeight: number } }[]>;
  };
}

export function faceApiProvider(opts: { runtime: () => Promise<FaceApi> }): Factory<Landmarker> {
  return async ({ record }) => {
    const fa = await opts.runtime();
    const base = record.source.url!;
    await fa.nets.tinyFaceDetector.loadFromUri(base);
    await fa.nets.faceLandmark68TinyNet.loadFromUri(base);
    return {
      async detect(image) {
        const res = await fa.detectAllFaces(image, new fa.TinyFaceDetectorOptions({ inputSize: 320 })).withFaceLandmarks(true);
        return {
          points: res.map((r) => r.landmarks.positions.map((p): [number, number, number] => [p.x / r.detection.imageWidth, p.y / r.detection.imageHeight, 0])),
          source: record.id,
        };
      },
    };
  };
}
