import { describe, it, expect, afterEach } from 'vitest'
import { basePathFrom, byteBudget, filenamePrefix, maxFileSize, notifyConfig } from '../src/config'
import { resetConfig, setConfig } from './helpers'

afterEach(resetConfig)

const MB = 1024 * 1024

describe('basePathFrom', () => {
  it('is empty for an own-hostname deployment', () => {
    expect(basePathFrom('https://upload.example.com')).toBe('')
    expect(basePathFrom('https://upload.example.com/')).toBe('')
    expect(basePathFrom(undefined)).toBe('')
  })

  it('is the URL path for a path-prefix deployment, without a trailing slash', () => {
    expect(basePathFrom('https://photos.example.com/upload')).toBe('/upload')
    expect(basePathFrom('https://photos.example.com/a/b/')).toBe('/a/b')
  })

  it('is empty for a value that is not a URL', () => {
    expect(basePathFrom('not a url')).toBe('')
  })
})

describe('upload options', () => {
  it('has the documented defaults', () => {
    expect(maxFileSize()).toBe(500 * MB)
    expect(byteBudget()).toBe(10240 * MB)
    expect(filenamePrefix()).toBe('ipp_upload_')
    expect(notifyConfig()).toBeUndefined()
  })

  it('never lets maxFileSize reach zero, which would refuse every file', () => {
    setConfig({ ipp: { upload: { maxFileSize: 0 } } })
    expect(maxFileSize()).toBe(MB)
  })

  it('keeps only string notification headers', () => {
    setConfig({ ipp: { upload: { notifyUrl: 'https://ntfy.example.com/topic', notifyHeaders: { Authorization: 'Bearer x', Bad: 1 } } } })
    expect(notifyConfig()).toEqual({ url: 'https://ntfy.example.com/topic', headers: { Authorization: 'Bearer x' }, timeoutMs: 10_000 })
  })
})
