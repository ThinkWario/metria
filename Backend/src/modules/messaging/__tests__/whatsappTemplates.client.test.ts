import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMetaTemplate } from '../channels/whatsappTemplates.client'

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.restoreAllMocks())

describe('createMetaTemplate — example values', () => {
  it('uses the catalog example values, in order, when variables are provided', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: 'meta-1', status: 'PENDING' })
    } as Response)

    await createMetaTemplate('waba-1', 'token-1', {
      name: 'saludo',
      language: 'es',
      category: 'MARKETING',
      bodyText: 'Hola {{1}}, tu teléfono es {{2}}',
      variables: ['contact.name', 'contact.phone']
    })

    const [, options] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(options!.body as string)
    expect(body.components[0].example.body_text).toEqual([['Juan Pérez', '+56912345678']])
  })

  it('falls back to generic placeholders when no variables are provided (legacy path)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: 'meta-2', status: 'PENDING' })
    } as Response)

    await createMetaTemplate('waba-1', 'token-1', {
      name: 'saludo_legacy',
      language: 'es',
      category: 'MARKETING',
      bodyText: 'Hola {{1}}'
    })

    const [, options] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(options!.body as string)
    expect(body.components[0].example.body_text).toEqual([['Ejemplo1']])
  })

  it('falls back to generic placeholders when variables.length does not match the {{n}} count', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: 'meta-3', status: 'PENDING' })
    } as Response)

    await createMetaTemplate('waba-1', 'token-1', {
      name: 'saludo_mismatch',
      language: 'es',
      category: 'MARKETING',
      bodyText: 'Hola {{1}} y {{2}}',
      variables: ['contact.name']
    })

    const [, options] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(options!.body as string)
    expect(body.components[0].example.body_text).toEqual([['Ejemplo1', 'Ejemplo2']])
  })
})
