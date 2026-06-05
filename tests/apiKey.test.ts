import { describe, it, expect, vi } from 'vitest'
import { createApiKeyGuard } from '../src/middleware/apiKey'

const mockReq = (key?: string) =>
  ({
    header: (name: string) => (name.toLowerCase() === 'x-api-key' ? key : undefined),
  }) as never

const mockRes = () => {
  const res: {
    statusCode: number
    body?: unknown
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
  } = {
    statusCode: 200,
    status: vi.fn(),
    json: vi.fn(),
  }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: unknown) => {
    res.body = body
    return res
  })
  return res
}

describe('createApiKeyGuard', () => {
  it('allows every request when no keys are configured (open mode)', () => {
    const next = vi.fn()
    createApiKeyGuard([])(mockReq(), mockRes() as never, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('rejects a request with no key (401)', () => {
    const next = vi.fn()
    const res = mockRes()
    createApiKeyGuard(['secret'])(mockReq(undefined), res as never, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a wrong key (401)', () => {
    const next = vi.fn()
    const res = mockRes()
    createApiKeyGuard(['secret'])(mockReq('nope'), res as never, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('accepts a valid key', () => {
    const next = vi.fn()
    const res = mockRes()
    createApiKeyGuard(['secret', 'other'])(mockReq('other'), res as never, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(200)
  })

  it('trims and ignores blank entries in the key list', () => {
    const next = vi.fn()
    createApiKeyGuard(['  spaced  ', '', '   '])(mockReq('spaced'), mockRes() as never, next)
    expect(next).toHaveBeenCalledOnce()
  })
})
