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

const { mockListDefinitions, mockCreateDefinition, mockDeleteDefinition, mockSetContactCustomFields } = vi.hoisted(() => ({
  mockListDefinitions: vi.fn(),
  mockCreateDefinition: vi.fn(),
  mockDeleteDefinition: vi.fn(),
  mockSetContactCustomFields: vi.fn()
}))
vi.mock('../customField.service', () => ({
  listDefinitions: mockListDefinitions,
  createDefinition: mockCreateDefinition,
  deleteDefinition: mockDeleteDefinition,
  setContactCustomFields: mockSetContactCustomFields
}))
vi.mock('../../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { workspaceId: 'ws-1', role: 'ADMIN' }; next() }
}))
vi.mock('../../../middleware/planGate', () => ({ requirePlan: () => (_req: any, _res: any, next: any) => next() }))

const { mockUpdateSolarLeadData } = vi.hoisted(() => ({ mockUpdateSolarLeadData: vi.fn() }))
vi.mock('../../leads/leadIngestion.service', () => ({ updateSolarLeadData: mockUpdateSolarLeadData }))

const { mockGenerateVisitLetterPdf } = vi.hoisted(() => ({ mockGenerateVisitLetterPdf: vi.fn() }))
vi.mock('../../leads/visitLetter.service', () => ({ generateVisitLetterPdf: mockGenerateVisitLetterPdf }))

vi.mock('../../../lib/prisma', () => ({
  prisma: { workspace: { findUnique: vi.fn() } }
}))

import crmRouter from '../crm.routes'
import { prisma } from '../../../lib/prisma'

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

describe('GET /api/crm/custom-fields', () => {
  it('lists definitions', async () => {
    mockListDefinitions.mockResolvedValue([{ id: 'cf-1', key: 'rut', label: 'RUT' }])
    const res = await request(buildApp()).get('/api/crm/custom-fields').expect(200)
    expect(res.body).toEqual([{ id: 'cf-1', key: 'rut', label: 'RUT' }])
  })
})

describe('POST /api/crm/custom-fields', () => {
  it('creates a definition', async () => {
    mockCreateDefinition.mockResolvedValue({ id: 'cf-1', key: 'rut', label: 'RUT' })
    const res = await request(buildApp()).post('/api/crm/custom-fields').send({ label: 'RUT' }).expect(201)
    expect(res.body).toEqual({ id: 'cf-1', key: 'rut', label: 'RUT' })
    expect(mockCreateDefinition).toHaveBeenCalledWith('ws-1', 'RUT')
  })

  it('requires a non-blank label', async () => {
    const res = await request(buildApp()).post('/api/crm/custom-fields').send({ label: '  ' }).expect(400)
    expect(res.body).toEqual({ error: 'label is required' })
  })
})

describe('DELETE /api/crm/custom-fields/:id', () => {
  it('deletes a definition', async () => {
    mockDeleteDefinition.mockResolvedValue(undefined)
    await request(buildApp()).delete('/api/crm/custom-fields/cf-1').expect(204)
    expect(mockDeleteDefinition).toHaveBeenCalledWith('ws-1', 'cf-1')
  })

  it('returns 404 when not found', async () => {
    mockDeleteDefinition.mockRejectedValue(new Error('Custom field not found'))
    const res = await request(buildApp()).delete('/api/crm/custom-fields/cf-1').expect(404)
    expect(res.body).toEqual({ error: 'Custom field not found' })
  })
})

describe('PATCH /api/crm/contacts/:contactId/custom-fields', () => {
  it("updates a contact's custom field values", async () => {
    mockSetContactCustomFields.mockResolvedValue({ id: 'ct-1', customFields: { rut: '11.111.111-1' } })
    const res = await request(buildApp())
      .patch('/api/crm/contacts/ct-1/custom-fields')
      .send({ values: { rut: '11.111.111-1' } })
      .expect(200)
    expect(res.body).toEqual({ id: 'ct-1', customFields: { rut: '11.111.111-1' } })
    expect(mockSetContactCustomFields).toHaveBeenCalledWith('ws-1', 'ct-1', { rut: '11.111.111-1' })
  })
})

describe('PATCH /api/crm/contacts/:contactId/solar-data', () => {
  it('updates the rawFields and visitLetter data of the contact', async () => {
    mockUpdateSolarLeadData.mockResolvedValue({ id: 'ct-1' })
    const res = await request(buildApp())
      .patch('/api/crm/contacts/ct-1/solar-data')
      .send({ rawFields: { comuna: 'Colina' }, visitLetter: { tecnicoResponsable: 'Juan' } })
      .expect(200)

    expect(res.body).toEqual({ id: 'ct-1' })
    expect(mockUpdateSolarLeadData).toHaveBeenCalledWith('ws-1', 'ct-1', {
      rawFields: { comuna: 'Colina' }, visitLetter: { tecnicoResponsable: 'Juan' }
    })
  })

  it('returns 404 when the contact is not found', async () => {
    mockUpdateSolarLeadData.mockRejectedValue(new Error('Contact not found'))
    const res = await request(buildApp())
      .patch('/api/crm/contacts/missing/solar-data')
      .send({ rawFields: { comuna: 'Colina' } })
      .expect(404)
    expect(res.body).toEqual({ error: 'Contact not found' })
  })
})

describe('POST /api/crm/visit-letter/generate', () => {
  it('streams a PDF built from manually-entered data, using the workspace executive', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
      visitLetterExecutiveName: 'Roberto Morales', visitLetterExecutiveTitle: 'Gerente Comercial'
    } as any)
    mockGenerateVisitLetterPdf.mockResolvedValue(Buffer.from('%PDF-fake'))

    const res = await request(buildApp())
      .post('/api/crm/visit-letter/generate')
      .send({ nombre: 'Lead Manual', comuna: 'Providencia' })
      .expect(200)

    expect(res.headers['content-type']).toBe('application/pdf')
    expect(mockGenerateVisitLetterPdf).toHaveBeenCalledWith(expect.objectContaining({
      nombre: 'Lead Manual', comuna: 'Providencia',
      ejecutivoNombre: 'Roberto Morales', ejecutivoTitulo: 'Gerente Comercial'
    }))
  })

  it('rejects when nombre is missing', async () => {
    const res = await request(buildApp())
      .post('/api/crm/visit-letter/generate')
      .send({ comuna: 'Providencia' })
      .expect(400)
    expect(res.body).toEqual({ error: 'nombre es requerido' })
    expect(mockGenerateVisitLetterPdf).not.toHaveBeenCalled()
  })
})
