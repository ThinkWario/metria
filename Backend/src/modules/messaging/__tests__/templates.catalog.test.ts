import { describe, it, expect, vi } from 'vitest'
import { getTemplateVariableCatalogHandler } from '../templates.controller'
import { TEMPLATE_VARIABLE_CATALOG } from '../templateVariables'

describe('getTemplateVariableCatalogHandler', () => {
  it('returns the full variable catalog as JSON', async () => {
    const req = {} as any
    const res = { json: vi.fn() } as any

    await getTemplateVariableCatalogHandler(req, res)

    expect(res.json).toHaveBeenCalledWith({ catalog: TEMPLATE_VARIABLE_CATALOG })
  })
})
