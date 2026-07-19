import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nvidiaProvider } from '../providers/nvidia.provider'

const originalFetch = global.fetch

beforeEach(() => {
  process.env.NVIDIA_API_KEY = 'test-key'
})

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('nvidiaProvider.extract', () => {
  it('parses a valid JSON response into the requested shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"temperature":"HOT"}' } }] })
    }) as any

    const result = await nvidiaProvider.extract<{ temperature: string }>({
      system: 'sys',
      messages: [{ role: 'user', content: 'Quiero comprar ya' }],
      schema: { type: 'object', properties: { temperature: { type: 'string' } } }
    })

    expect(result).toEqual({ temperature: 'HOT' })
    // schema is rendered into the prompt as an instruction, not sent as a native enforced shape (best-effort, unlike Gemini)
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[0].content).toContain('"temperature"')
  })

  it('returns null instead of throwing on malformed JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json' } }] })
    }) as any

    const result = await nvidiaProvider.extract({ system: 'sys', messages: [], schema: {} })

    expect(result).toBeNull()
  })

  it('returns null instead of throwing on a network/API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' }) as any

    const result = await nvidiaProvider.extract({ system: 'sys', messages: [], schema: {} })

    expect(result).toBeNull()
  })
})
