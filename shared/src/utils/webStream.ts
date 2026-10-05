import { Readable } from 'stream'

/**
 * Wrap a fetch `Response.body` as a Node Readable, for use with `pipeline`.
 *
 * `response.body` is the global/undici ReadableStream<Uint8Array>;
 * Readable.fromWeb expects node:stream/web's ReadableStream<any>. The two
 * are structurally compatible at runtime but TS sees them as distinct
 * nominal types, so a cast is needed.
 */
export function readableFromWeb (body: ReadableStream<Uint8Array>): Readable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Readable.fromWeb(body as any)
}
