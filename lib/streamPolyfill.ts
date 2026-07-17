// Safari only gained async iteration of ReadableStream (Symbol.asyncIterator /
// .values()) in 18.4. pdfjs-dist v5 consumes its text-content stream with
// `for await (const chunk of readableStream)` inside getTextContent(), which on
// older Safari throws: "undefined is not a function (near '...t of e...')".
// The pdfjs legacy build only polyfills ECMAScript built-ins (core-js), not web
// platform APIs, so this spec-shaped shim must be installed before pdfjs runs.

interface StreamIteratorOptions {
  preventCancel?: boolean;
}

export function ensureReadableStreamAsyncIterator(): void {
  if (typeof ReadableStream === 'undefined') return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = ReadableStream.prototype as any;
  if (proto[Symbol.asyncIterator]) return;

  proto.values ??= function (
    this: ReadableStream,
    { preventCancel = false }: StreamIteratorOptions = {},
  ) {
    const reader = this.getReader();
    return {
      async next(): Promise<IteratorResult<unknown>> {
        try {
          const result = await reader.read();
          if (result.done) reader.releaseLock();
          return result as IteratorResult<unknown>;
        } catch (err) {
          reader.releaseLock();
          throw err;
        }
      },
      async return(value?: unknown): Promise<IteratorResult<unknown>> {
        if (preventCancel) {
          reader.releaseLock();
        } else {
          const cancelPromise = reader.cancel(value);
          reader.releaseLock();
          await cancelPromise;
        }
        return { done: true, value };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
  proto[Symbol.asyncIterator] = proto.values;
}
