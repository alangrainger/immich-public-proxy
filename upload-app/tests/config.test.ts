import { describe, it, expect, afterEach } from 'vitest'
import { byteBudget, filenamePrefix, maxFileSize, notifyConfig, uploadNotice } from '../src/config'
import { resetConfig, setConfig } from './helpers'

afterEach(resetConfig)

const MB = 1024 * 1024

describe('upload options', () => {
  it('has the documented defaults', () => {
    expect(maxFileSize()).toBe(500 * MB)
    expect(byteBudget()).toBe(10240 * MB)
    expect(filenamePrefix()).toBe('ipp_upload_')
    expect(notifyConfig()).toBeUndefined()
    expect(uploadNotice()).toBe('Uploaded photos may not appear in the gallery immediately.')
  })

  it('shows the owner\'s notice, and hides one that is not a string', () => {
    setConfig({ ipp: { upload: { notice: 'Les photos apparaissent plus tard.' } } })
    expect(uploadNotice()).toBe('Les photos apparaissent plus tard.')
    setConfig({ ipp: { upload: { notice: false } } })
    expect(uploadNotice()).toBe('')
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
