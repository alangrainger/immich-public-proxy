import { describe, it, expect, vi, afterEach } from 'vitest'
import { createIdleTimeoutStream, IdleTimeoutError } from '../src/idleTimeoutStream'

afterEach(() => vi.useRealTimers())

/** Resolve with the stream's error, or undefined when it ends cleanly. */
function outcome (stream: NodeJS.ReadableStream): Promise<Error | undefined> {
  return new Promise(resolve => {
    stream.on('data', () => {})
    stream.on('error', resolve)
    stream.on('end', () => resolve(undefined))
  })
}

describe('createIdleTimeoutStream', () => {
  it('drops a body that never starts', async () => {
    vi.useFakeTimers()
    const stream = createIdleTimeoutStream(1000)
    const result = outcome(stream)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await result).toBeInstanceOf(IdleTimeoutError)
  })

  it('keeps a slow but steady body flowing', async () => {
    vi.useFakeTimers()
    const stream = createIdleTimeoutStream(1000)
    const result = outcome(stream)
    for (let i = 0; i < 5; i++) {
      stream.write(Buffer.alloc(1))
      await vi.advanceTimersByTimeAsync(900)
    }
    stream.end()
    expect(await result).toBeUndefined()
  })

  it('drops a body that trickles below the byte floor', async () => {
    vi.useFakeTimers()
    const stream = createIdleTimeoutStream(1000, 100)
    const result = outcome(stream)
    stream.write(Buffer.alloc(99))
    await vi.advanceTimersByTimeAsync(1000)
    expect(await result).toBeInstanceOf(IdleTimeoutError)
  })

  it('keeps a body that meets the byte floor in every interval', async () => {
    vi.useFakeTimers()
    const stream = createIdleTimeoutStream(1000, 100)
    const result = outcome(stream)
    for (let i = 0; i < 3; i++) {
      stream.write(Buffer.alloc(50))
      await vi.advanceTimersByTimeAsync(400)
      stream.write(Buffer.alloc(50))
      await vi.advanceTimersByTimeAsync(600)
    }
    stream.end()
    expect(await result).toBeUndefined()
  })

  it('stops its timer when the body ends, so a small file is never judged by a partial interval', async () => {
    vi.useFakeTimers()
    const stream = createIdleTimeoutStream(1000, 100)
    const result = outcome(stream)
    stream.end(Buffer.alloc(10))
    expect(await result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(5000)
    expect(vi.getTimerCount()).toBe(0)
  })
})
