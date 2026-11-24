/** Shapes every vision provider returns, so stubs, MediaPipe, transformers.js and onnxruntime models are interchangeable. */

import type { EmbeddingCache } from "./segment.js";

/** Anything the runtimes accept: an image, canvas, video frame, bitmap, URL or data URL. */
export type ImageInput = unknown;

/** RGBA pixels, as ImageData has them. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface DepthMap {
  width: number;
  height: number;
  /** 0 to 1 per pixel, larger is nearer (Depth Anything is relative inverse depth). */
  data: Float32Array;
  /** The raw model output range before normalizing, for stable scale across frames (as earlier builds did). */
  range: [min: number, max: number];
}

export interface DepthModel {
  estimate(image: ImageInput): Promise<DepthMap>;
  dispose?(): unknown;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Detection {
  label: string;
  score: number;
  /** Pixels of the input image. */
  box: Box;
}

export interface Detector {
  detect(image: ImageInput, opts?: { scoreThreshold?: number; maxResults?: number; timestamp?: number }): Promise<Detection[]>;
  dispose?(): unknown;
}

export interface Mask {
  width: number;
  height: number;
  /** 0 or 255 per pixel, or a confidence 0 to 255. */
  data: Uint8Array;
  score?: number;
}

export interface SegmentPrompt {
  /** Points in image pixels; label 1 for object, 0 for background (a negative point). */
  points?: { x: number; y: number; label?: 0 | 1 }[];
  /** A box around the object, image pixels. */
  box?: Box;
}

export interface SegmentOptions {
  /** A stable key for the image, such as a hash; the image object itself when omitted. */
  key?: string;
  /** The caller's embedding cache; the segmenter's own when omitted. */
  cache?: EmbeddingCache<unknown>;
}

export interface Segmenter {
  segment(image: ImageInput, prompt?: SegmentPrompt, o?: SegmentOptions): Promise<Mask[]>;
  dispose?(): unknown;
}

/** "gesture" is hand landmarks plus a canned gesture label per hand (MediaPipe gesture recognizer). */
export type LandmarkKind = "face" | "hand" | "pose" | "gesture";

export interface Landmarks {
  /** One list per face, hand or body; x and y normalized 0 to 1, z relative. */
  points: [number, number, number][][];
  /** Face blendshapes by name, per face. */
  blendshapes?: Record<string, number>[];
  /** Hand labels, per hand. */
  handedness?: string[];
  /** Top canned gesture per hand ("Open_Palm", "Thumb_Up" and so on), null for "None". */
  gestures?: ({ name: string; score: number } | null)[];
  /** Which record produced this, for status lines after a fallback. */
  source: string;
}

export interface Landmarker {
  detect(image: ImageInput, opts?: { timestamp?: number }): Promise<Landmarks>;
  dispose?(): unknown;
}

export interface Vlm {
  /** Answer a question about an image; caption when the question is omitted. */
  ask(image: ImageInput, question?: string, opts?: { maxTokens?: number; signal?: AbortSignal }): Promise<string>;
  dispose?(): unknown;
}
