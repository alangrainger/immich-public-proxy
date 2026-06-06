/**
 * Returns a function that runs at most `limit` async tasks concurrently.
 * Tasks queue when the limit is reached and resume in FIFO order.
 */
export function createLimiter (limit: number) {
  let active = 0
  const queue: Array<() => void> = []
  return async function run<T> (fn: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>(resolve => queue.push(resolve))
    }
    active++
    try {
      return await fn()
    } finally {
      active--
      const next = queue.shift()
      if (next) next()
    }
  }
}
