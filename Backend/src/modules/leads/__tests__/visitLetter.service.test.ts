import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: { findFirst: vi.fn(), findUnique: vi.fn() },
    workspace: { findUnique: vi.fn() },
    appointment: { findFirst: vi.fn() },
    businessHours: { findUnique: vi.fn() }
  }
}))
vi.mock('../../scheduling/scheduling.service', () => ({
  getWorkspaceTimezone: vi.fn(async () => 'America/Santiago')
}))
vi.mock('../../scheduling/appointment-notifications.service', () => ({
  formatApptDateTime: vi.fn(() => '14 de agosto a las 10:00')
}))

import {
  buildVisitLetterHtml, getVisitLetterDataForContact, getVisitLetterPublicToken, getVisitLetterDataByToken
} from '../visitLetter.service'
import { prisma } from '../../../lib/prisma'

beforeEach(() => vi.clearAllMocks())

describe('buildVisitLetterHtml', () => {
  const BASE = { nombre: 'Germán Barrales Venegas', fechaEmision: '13 de agosto de 2026' }

  it('includes the provided data verbatim', () => {
    const html = buildVisitLetterHtml({ ...BASE, rut: '9.477.501-9', comuna: 'Colina', telefono: '56979452724' })
    expect(html).toContain('Germán Barrales Venegas')
    expect(html).toContain('9.477.501-9')
    expect(html).toContain('Colina')
    expect(html).toContain('56979452724')
  })

  it('renders blank underscores for fields that are missing, never "undefined"', () => {
    const html = buildVisitLetterHtml(BASE)
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('null')
  })

  it('checks only the modalidad box that matches, case-insensitively', () => {
    const html = buildVisitLetterHtml({ ...BASE, modalidad: 'videollamada' })
    // The checked box for Videollamada has a ✓, the others don't
    const videollamadaBlock = html.slice(html.indexOf('Videollamada') - 120, html.indexOf('Videollamada'))
    expect(videollamadaBlock).toContain('✓')
  })

  it('escapes HTML in free-text fields (observaciones) to prevent injection', () => {
    const html = buildVisitLetterHtml({ ...BASE, observaciones: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('produces two page divs (2-page document)', () => {
    const html = buildVisitLetterHtml(BASE)
    expect(html.match(/class="page"/g)?.length).toBe(2)
  })

  it('includes the company footer with RUT and address on both pages, numbered 1 and 2', () => {
    const html = buildVisitLetterHtml(BASE)
    expect(html.match(/RUT 76\.655\.391-5 \| Servicios de Ingeniería \| Casa Real 4530/g)?.length).toBe(2)
    expect(html).toContain('Página 1')
    expect(html).toContain('Página 2')
  })
})

describe('getVisitLetterDataForContact', () => {
  it('merges contact scalars, rawFields, visitLetter fields, workspace executive and the latest SITE_VISIT appointment', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: 'c1', name: 'Germán Barrales Venegas', phone: '56979452724', email: 'gbarrales@gmail.com', rut: '94775019',
      qualificationData: {
        rawFields: { comuna: 'Colina', direccion: 'Chicureo', distribuidora: 'Enel', rut: '9.477.501-9' },
        visitLetter: { tecnicoResponsable: 'Juan Pérez', numeroSolicitud: 'SOL-001' }
      }
    } as any)
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
      visitLetterExecutiveName: 'Roberto Morales', visitLetterExecutiveTitle: 'Gerente Comercial'
    } as any)
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({ scheduledAt: new Date('2026-08-14T14:00:00Z') } as any)

    const data = await getVisitLetterDataForContact('ws-1', 'c1')

    expect(data.nombre).toBe('Germán Barrales Venegas')
    expect(data.rut).toBe('9.477.501-9')
    expect(data.comuna).toBe('Colina')
    expect(data.distribuidora).toBe('Enel')
    expect(data.tecnicoResponsable).toBe('Juan Pérez')
    expect(data.numeroSolicitud).toBe('SOL-001')
    expect(data.ejecutivoNombre).toBe('Roberto Morales')
    expect(data.ejecutivoTitulo).toBe('Gerente Comercial')
    expect(data.fechaVisita).toBe('14 de agosto a las 10:00')
  })

  it('throws when the contact does not belong to the workspace', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    await expect(getVisitLetterDataForContact('ws-1', 'missing')).rejects.toThrow('Contact not found')
  })

  it('omits fechaVisita when there is no SITE_VISIT appointment', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: 'c1', name: 'Ana', phone: null, email: null, rut: null, qualificationData: {}
    } as any)
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null)

    const data = await getVisitLetterDataForContact('ws-1', 'c1')
    expect(data.fechaVisita).toBeUndefined()
  })
})

describe('getVisitLetterPublicToken', () => {
  it('returns the sessionId for a solar_direct contact that has one', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ sessionId: 'sess-1', source: 'solar_direct' } as any)
    await expect(getVisitLetterPublicToken('ws-1', 'c1')).resolves.toBe('sess-1')
  })

  it('returns null for a contact with no sessionId (never went through the wizard)', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ sessionId: null, source: 'solar_direct' } as any)
    await expect(getVisitLetterPublicToken('ws-1', 'c1')).resolves.toBeNull()
  })

  it('returns null for a non solar_direct contact even if it has a sessionId', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ sessionId: 'sess-1', source: 'WHATSAPP' } as any)
    await expect(getVisitLetterPublicToken('ws-1', 'c1')).resolves.toBeNull()
  })
})

describe('getVisitLetterDataByToken', () => {
  it('resolves the contact by workspaceId+source+sessionId and delegates to getVisitLetterDataForContact', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ id: 'c1' } as any)
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: 'c1', name: 'Ana', phone: null, email: null, rut: null, qualificationData: {}
    } as any)
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({} as any)
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null)

    const data = await getVisitLetterDataByToken('ws-1', 'sess-1')

    expect(prisma.contact.findUnique).toHaveBeenCalledWith({
      where: { workspaceId_source_sessionId: { workspaceId: 'ws-1', source: 'solar_direct', sessionId: 'sess-1' } }
    })
    expect(data.nombre).toBe('Ana')
  })

  it('throws when no contact matches the sessionId', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null)
    await expect(getVisitLetterDataByToken('ws-1', 'missing-session')).rejects.toThrow('Contact not found')
  })
})
