import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../metaEvents.capi', () => ({
  emitConversionEvent: vi.fn(async () => {})
}))

import { emitMetaContactEvent, emitMetaLeadEvent, emitMetaFinanceApplicationSubmittedEvent, emitMetaQualifiedLeadEvent } from '../metaEvents.service'
import { emitConversionEvent } from '../metaEvents.capi'

const contact = { id: 'c-1', email: 'a@b.cl', phone: null }

beforeEach(() => vi.clearAllMocks())

describe('emitMetaContactEvent / emitMetaLeadEvent — eventSourceUrl', () => {
  it('pasa eventSourceUrl a emitConversionEvent cuando se provee', async () => {
    await emitMetaContactEvent('ws-1', contact, 'website', undefined, 'sess-1', 'https://solar.drillchile.cl/paso-3')
    expect(emitConversionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventSourceUrl: 'https://solar.drillchile.cl/paso-3'
    }))
  })

  it('pasa eventSourceUrl undefined cuando no se provee', async () => {
    await emitMetaLeadEvent('ws-1', contact, 'website', undefined, 'sess-1')
    expect(emitConversionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventSourceUrl: undefined
    }))
  })
})

describe('emitMetaFinanceApplicationSubmittedEvent — eventSourceUrl', () => {
  it('pasa eventSourceUrl a emitConversionEvent', async () => {
    await emitMetaFinanceApplicationSubmittedEvent('ws-1', contact, 'website', 'sess-1', 'https://solar.drillchile.cl/financiamiento')
    expect(emitConversionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventSourceUrl: 'https://solar.drillchile.cl/financiamiento'
    }))
  })
})

describe('emitMetaQualifiedLeadEvent — serviceAreaMatch', () => {
  it('incluye service_area_match en custom_data cuando se provee', async () => {
    await emitMetaQualifiedLeadEvent('ws-1', contact, 'system_generated', {
      qualificationVersion: 'solar_res_v2', serviceAreaMatch: true
    })
    expect(emitConversionEvent).toHaveBeenCalledWith(expect.objectContaining({
      customData: expect.objectContaining({ qualification_version: 'solar_res_v2', service_area_match: true })
    }))
  })

  it('omite service_area_match cuando no se provee', async () => {
    await emitMetaQualifiedLeadEvent('ws-1', contact, 'system_generated', { qualificationVersion: 'solar_res_v2' })
    const call = vi.mocked(emitConversionEvent).mock.calls[0][0]
    expect(call.customData).not.toHaveProperty('service_area_match')
  })
})
