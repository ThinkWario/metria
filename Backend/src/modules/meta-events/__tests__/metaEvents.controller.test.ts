import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../../../lib/prisma', () => ({
  prisma: { conversionEvent: { findMany: vi.fn() } }
}))

import { getMetaEventsRecentHandler } from '../metaEvents.controller'
import { prisma } from '../../../lib/prisma'

const WS_ID = 'ws-1'

function buildApp() {
  const app = express()
  app.use((req: any, _res, next) => { req.user = { workspaceId: WS_ID }; next() })
  app.get('/api/meta-events/recent', getMetaEventsRecentHandler)
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('GET /meta-events/recent', () => {
  it('scopes the query to the caller workspace', async () => {
    vi.mocked(prisma.conversionEvent.findMany).mockResolvedValue([])

    await request(buildApp()).get('/api/meta-events/recent')

    expect(prisma.conversionEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: WS_ID }
    }))
  })

  it('adds a leadId filter when contactId is passed', async () => {
    vi.mocked(prisma.conversionEvent.findMany).mockResolvedValue([])

    await request(buildApp()).get('/api/meta-events/recent?contactId=c1')

    expect(prisma.conversionEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: WS_ID, leadId: 'c1' }
    }))
  })

  it('extracts event_source_url from the stored payload and drops the raw payload field', async () => {
    vi.mocked(prisma.conversionEvent.findMany).mockResolvedValue([
      {
        id: 'ce1', eventName: 'Contact', eventId: 'dc:v2:s1:Contact', status: 'sent', actionSource: 'website',
        occurredAt: new Date('2026-08-05T12:00:00Z'), metaHttpStatus: 200, metaEventsReceived: 1,
        metaFbtraceId: 'trace-1', lastErrorCode: null, attemptCount: 1, duplicateAttempts: 0, nextRetryAt: null,
        createdAt: new Date('2026-08-05T12:00:00Z'), sentAt: new Date('2026-08-05T12:00:01Z'),
        payload: { data: [{ event_source_url: 'https://solar.drillchile.cl/?propuesta=true' }] }
      }
    ] as any)

    const res = await request(buildApp()).get('/api/meta-events/recent?contactId=c1')

    expect(res.body.events[0].eventSourceUrl).toBe('https://solar.drillchile.cl/?propuesta=true')
    expect(res.body.events[0].payload).toBeUndefined()
  })

  it('returns null eventSourceUrl when the payload has none', async () => {
    vi.mocked(prisma.conversionEvent.findMany).mockResolvedValue([
      { id: 'ce1', eventName: 'QualifiedLead', payload: { data: [{}] } }
    ] as any)

    const res = await request(buildApp()).get('/api/meta-events/recent')

    expect(res.body.events[0].eventSourceUrl).toBeNull()
  })
})
