import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../../../lib/prisma', () => ({
  prisma: { sheetIntegration: { create: vi.fn(), update: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() } }
}))
vi.mock('../../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { workspaceId: 'ws-1' }; next() }
}))
vi.mock('../../../middleware/planGate', () => ({ requirePlan: () => (_req: any, _res: any, next: any) => next() }))
vi.mock('../sheets.service', () => ({ analyzeSheet: vi.fn(), syncSheet: vi.fn(), extractSheetId: vi.fn(() => 'sheet-1') }))

import sheetsRouter from '../sheets.routes'
import { prisma } from '../../../lib/prisma'

beforeEach(() => vi.clearAllMocks())

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api', sheetsRouter)
  return app
}

describe('POST /api/sheets', () => {
  it('passes excludedColumns and customFieldMappings through to prisma.sheetIntegration.create', async () => {
    vi.mocked(prisma.sheetIntegration.create).mockResolvedValue({ id: 'integ-1' } as any)

    await request(buildApp())
      .post('/api/sheets')
      .send({
        sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit',
        sheetId: 'abc', sheetName: 'Leads', fieldMappings: { name: 'Nombre' },
        targetPipelineId: 'pipe-1', targetStageId: 'stage-1',
        excludedColumns: ['Casa Mapa'],
        customFieldMappings: { RUT: 'rut' }
      })
      .expect(201)

    expect(prisma.sheetIntegration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          excludedColumns: ['Casa Mapa'],
          customFieldMappings: { RUT: 'rut' }
        })
      })
    )
  })

  it('defaults excludedColumns to an empty array and customFieldMappings to null when omitted', async () => {
    vi.mocked(prisma.sheetIntegration.create).mockResolvedValue({ id: 'integ-1' } as any)

    await request(buildApp())
      .post('/api/sheets')
      .send({
        sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit',
        sheetId: 'abc', sheetName: 'Leads', fieldMappings: { name: 'Nombre' },
        targetPipelineId: 'pipe-1', targetStageId: 'stage-1'
      })
      .expect(201)

    expect(prisma.sheetIntegration.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ excludedColumns: [], customFieldMappings: null }) })
    )
  })
})
