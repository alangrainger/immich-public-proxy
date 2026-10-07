import { Transform } from 'stream'

/** The error a stalled stream is destroyed with. */
export class IdleTimeoutError extends Error {}

/**
 * A pass-through Transform that destroys itself when fewer than `minBytes`
 * flow through it in any `idleMs` interval. The check is armed when the
 * transform is created, so a body that never starts also times out.
 *
 * With `minBytes` left at 1 this is a plain idle timeout: a slow-but-steady
 * stream keeps going, a stalled one fails. A higher `minBytes` is a floor on
 * throughput, which stops a trickle of one byte a minute holding the
 * resources an upload reserved for as long as the sender likes.
 */
export function createIdleTimeoutStream (idleMs: number, minBytes = 1): Transform {
  let received = 0
  const check = () => {
    if (received < minBytes) {
      transform.destroy(new IdleTimeoutError(`Fewer than ${minBytes} bytes received in ${idleMs}ms`))
    }
    received = 0
  }
  const timer = setInterval(check, idleMs)
  const transform: Transform = new Transform({
    transform (chunk, _, cb) {
      received += chunk.length
      cb(null, chunk)
    },
    flush (cb) {
      clearInterval(timer)
      cb()
    },
    destroy (err, cb) {
      clearInterval(timer)
      cb(err)
    }
  })
  return transform
}
