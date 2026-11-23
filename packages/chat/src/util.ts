/** Push based async queue: turns callback streams into async iterables. */
export class Channel<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: ((r: IteratorResult<T>) => void)[] = [];
  private failed: unknown = null;
  private closed = false;

  push(v: T): void {
    if (this.closed) return;
    const w = this.waiters.shift();
    if (w) w({ value: v, done: false });
    else this.items.push(v);
  }

  close(): void {
    this.closed = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined as never, done: true });
  }

  fail(e: unknown): void {
    this.failed = e;
    this.close();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (;;) {
      if (this.items.length) {
        yield this.items.shift()!;
        continue;
      }
      if (this.closed) {
        if (this.failed) throw this.failed;
        return;
      }
      const r = await new Promise<IteratorResult<T>>((res) => this.waiters.push(res));
      if (r.done) {
        if (this.failed) throw this.failed;
        return;
      }
      yield r.value;
    }
  }
}

/** Server sent events from a fetch body. Yields { event, data } per message. */
export async function* sse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let event = "message";
  let data: string[] = [];
  try {
    for (;;) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.search(/\r?\n/)) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + (buf[nl] === "\r" ? 2 : 1));
        if (line === "") {
          if (data.length) yield { event, data: data.join("\n") };
          event = "message";
          data = [];
        } else if (line.startsWith(":")) continue;
        else {
          const c = line.indexOf(":");
          const field = c < 0 ? line : line.slice(0, c);
          const val = c < 0 ? "" : line.slice(c + 1).replace(/^ /, "");
          if (field === "data") data.push(val);
          else if (field === "event") event = val;
        }
      }
    }
    if (data.length) yield { event, data: data.join("\n") };
  } finally {
    reader.releaseLock();
  }
}
