import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const { mockFindPossibleDuplicates, mockMergeContacts } = vi.hoisted(() => ({
  mockFindPossibleDuplicates: vi.fn(),
  mockMergeContacts: vi.fn()
}))
vi.mock('../contact.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../contact.service')>()
  return { ...actual, findPossibleDuplicates: mockFindPossibleDuplicates, mergeContacts: mockMergeContacts }
})
vi.mock('../../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { workspaceId: 'ws-1', role: 'ADMIN' }; next() }
}))
vi.mock('../../../middleware/planGate', () => ({ requirePlan: () => (_req: any, _res: any, next: any) => next() }))

import crmRouter from '../crm.routes'

beforeEach(() => vi.clearAllMocks())

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api', crmRouter)
  return app
}

describe('GET /api/crm/contacts/:contactId/duplicates', () => {
  it('returns possible duplicates for the contact', async () => {
    mockFindPossibleDuplicates.mockResolvedValue([{ id: 'ct-2', name: 'Juan Perez' }])
    const res = await request(buildApp()).get('/api/crm/contacts/ct-1/duplicates').expect(200)
    expect(res.body).toEqual([{ id: 'ct-2', name: 'Juan Perez' }])
    expect(mockFindPossibleDuplicates).toHaveBeenCalledWith('ws-1', 'ct-1')
  })
})

describe('POST /api/crm/contacts/:contactId/merge', () => {
  it('merges the duplicate into the contact', async () => {
    mockMergeContacts.mockResolvedValue({ id: 'ct-1', name: 'Juan Perez' })
    const res = await request(buildApp())
      .post('/api/crm/contacts/ct-1/merge')
      .send({ duplicateContactId: 'ct-2' })
      .expect(200)
    expect(res.body).toEqual({ id: 'ct-1', name: 'Juan Perez' })
    expect(mockMergeContacts).toHaveBeenCalledWith('ws-1', 'ct-1', 'ct-2')
  })

  it('requires duplicateContactId', async () => {
    const res = await request(buildApp()).post('/api/crm/contacts/ct-1/merge').send({}).expect(400)
    expect(res.body).toEqual({ error: 'duplicateContactId is required' })
    expect(mockMergeContacts).not.toHaveBeenCalled()
  })
})
