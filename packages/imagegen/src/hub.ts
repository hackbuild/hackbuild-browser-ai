/**
 * The hub loader: image models load through the models hub and the weight
 * store like any other ort model, so the tool never builds sessions by
 * hand. Register an ort provider once (`ortProvider` from
 * @hackbuild/devices), call attachImagegen, then loadImagegen. Each graph
 * call of a generate runs under hub.run, so the gpu lock and frame budget
 * apply. In stub mode, `stubImagegenModel` serves a flat grey image with
 * no weights.
 */

import type { Capability, Hub, Loaded, ModelRecord, RunOptions, UseOptions } from "@hackbuild/models";
import { generate, type ClipTokenize, type Generated, type GenerateOptions, type OrtLike, type SessionLike, type Sessions } from "./pipeline.js";
import { formOf, IMAGEGEN_RECORDS, type ImageForm } from "./records.js";

/** What the ort provider loads, structurally: the module and sessions by graph name. */
export interface ImagegenModel {
  ort: OrtLike;
  sessions: Record<string, SessionLike>;
}

export type FormOptions = Omit<GenerateOptions, "run" | "spacing"> & { runOptions?: RunOptions };

export interface ImageGenerator {
  readonly loaded: Loaded<ImagegenModel>;
  readonly record: ModelRecord;
  readonly form: ImageForm;
  readonly sessions: Sessions;
  /** Generate with the form's defaults filled in; fields the model does not take are dropped. */
  generate(tokenize: ClipTokenize, o: FormOptions): Promise<Generated>;
  release(): void;
}

/** Thrown when a request does not fit the model's form; the message is the copy to show. */
export class FormError extends Error {
  override readonly name = "FormError";
}

/** Add the image records to the hub's registry. */
export function attachImagegen(hub: Hub): void {
  hub.registry.add(...IMAGEGEN_RECORDS);
}

/** The three sessions of a loaded model, by the form's graph names. */
export function sessionsOf(m: ImagegenModel, form: ImageForm): Sessions {
  const pick = (k: string) => {
    const s = m.sessions[k];
    if (!s) throw new Error(`the loaded model has no ${k} graph; it has ${Object.keys(m.sessions).join(", ") || "none"}`);
    return s;
  };
  return { textEncoder: pick(form.graphs.textEncoder), unet: pick(form.graphs.unet), vaeDecoder: pick(form.graphs.vaeDecoder) };
}

/** Clamp a request to what the form allows, with the form's defaults. */
export function applyForm(form: ImageForm, o: Omit<GenerateOptions, "run">): Omit<GenerateOptions, "run"> {
  const size = o.size ?? form.sizes[0]!;
  if (!form.sizes.includes(size)) throw new FormError(`this model makes ${form.sizes.join(" or ")} pixel images, not ${size}.`);
  const steps = Math.round(Math.min(form.steps.max, Math.max(form.steps.min, o.steps ?? form.steps.default)));
  const out: Omit<GenerateOptions, "run"> = { ...o, size, steps, spacing: form.spacing };
  if (form.guidance) out.guidance = Math.min(form.guidance.max, Math.max(form.guidance.min, o.guidance ?? form.guidance.default));
  else delete out.guidance;
  if (!form.negative) delete out.negative;
  return out;
}

/**
 * Load an image model through the hub: a record id (`{ id: "sd-1.5" }`)
 * or the capability ("imagegen", which the hub routes, or sends to the
 * stub in stub mode). A record without a form (the stub) gets SD-Turbo's.
 */
export async function loadImagegen(hub: Hub, what: Capability | { id: string } = "imagegen", o: UseOptions = {}): Promise<ImageGenerator> {
  const loaded = await hub.use<ImagegenModel>(what, o);
  const form = formOf(loaded.record) ?? IMAGEGEN_RECORDS[0]!.form;
  let sessions: Sessions;
  try {
    sessions = sessionsOf(loaded.value, form);
  } catch (e) {
    hub.release(loaded);
    throw e;
  }
  return {
    loaded,
    record: loaded.record,
    form,
    sessions,
    generate(tokenize, req) {
      const { runOptions, ...rest } = req;
      const run = <T>(fn: () => Promise<T>) => hub.run(loaded, () => fn(), { ...(runOptions ?? {}), ...(rest.signal ? { signal: rest.signal } : {}) });
      return generate(loaded.value.ort, sessions, tokenize, { ...applyForm(form, rest), run });
    },
    release() {
      hub.release(loaded);
    },
  };
}

/**
 * A weightless model for stub pages and tests: the text encoder returns
 * zeros, the UNet predicts zero noise, and the VAE returns a flat grey, so
 * the whole flow (stages, timing cells, history) runs with no download.
 */
export function stubImagegenModel(): ImagegenModel {
  class Tensor {
    constructor(
      readonly type: string,
      readonly data: Float32Array | Int32Array | BigInt64Array,
      readonly dims: number[],
    ) {}
  }
  const dims = (t: unknown) => (t as Tensor).dims;
  return {
    ort: { Tensor },
    sessions: {
      text_encoder: { run: async () => ({ last_hidden_state: { data: new Float32Array(77 * 8), dims: [1, 77, 8] } }) },
      unet: { run: async (f) => ({ out_sample: { data: new Float32Array((f.sample as Tensor).data.length) } }) },
      vae_decoder: {
        run: async (f) => {
          const [, , h, w] = dims(f.latent_sample);
          return { sample: { data: new Float32Array(3 * h! * 8 * w! * 8) } };
        },
      },
    },
  };
}
