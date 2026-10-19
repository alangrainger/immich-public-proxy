import { describe, it, expect, vi, afterEach } from 'vitest'
import { healthcheck, healthcheckHandler } from '../src/http'
import * as client from '../src/immich/client'

/*
  Each service answers its healthcheck with its own word: IPP says `ok` and
  the upload service says `upload-ok`. An upload hostname that a reverse proxy
  points at IPP's port by mistake then reads `ok`, not `upload-ok`, instead of
  passing for a working upload service (GitHub #300).
*/

function response () {
  const res = { body: undefined as string | undefined, code: 200 }
  return Object.assign(res, {
    send (body?: string) { res.body = body; return res },
    status (code: number) { res.code = code; return res }
  })
}

afterEach(() => vi.restoreAllMocks())

describe('healthcheckHandler', () => {
  it('answers with the given word while Immich is reachable', async () => {
    vi.spyOn(client, 'accessible').mockResolvedValue(true)
    const res = response()
    await healthcheckHandler('upload-ok')({} as never, res as never)
    expect(res.code).toBe(200)
    expect(res.body).toBe('upload-ok')
  })

  it('answers 503 with no body when Immich is not reachable', async () => {
    vi.spyOn(client, 'accessible').mockResolvedValue(false)
    const res = response()
    await healthcheckHandler('upload-ok')({} as never, res as never)
    expect(res.code).toBe(503)
    expect(res.body).toBeUndefined()
  })

  it("is IPP's own healthcheck with `ok`", async () => {
    vi.spyOn(client, 'accessible').mockResolvedValue(true)
    const res = response()
    await healthcheck({} as never, res as never)
    expect(res.body).toBe('ok')
  })
})
