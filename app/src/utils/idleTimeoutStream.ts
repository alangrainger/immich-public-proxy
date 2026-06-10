import { Transform } from 'stream'

/**
 * A pass-through Transform that destroys itself if no data flows through for
 * `idleMs`. The timer is set when the transform is created and reset on every
 * chunk, so a slow-but-steady download (large video over a slow link) keeps
 * going, while a genuinely stalled connection still fails fast.
 */
export function createIdleTimeoutStream (idleMs: number): Transform {
  let timer: NodeJS.Timeout | undefined
  const transform: Transform = new Transform({
    transform (chunk, _, cb) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => transform.destroy(new Error(`No data received for ${idleMs}ms`)), idleMs)
      cb(null, chunk)
    },
    flush (cb) {
      if (timer) clearTimeout(timer)
      cb()
    }
  })
  // Arm the timer immediately so a response that returns headers but never
  // sends a body also times out.
  timer = setTimeout(() => transform.destroy(new Error(`No data received for ${idleMs}ms`)), idleMs)
  return transform
}
