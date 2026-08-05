import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockFetchAPI } = vi.hoisted(() => ({ mockFetchAPI: vi.fn() }))
vi.mock('@/lib/api', () => ({ fetchAPI: mockFetchAPI }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { WhatsAppTemplatesPanel } from '../WhatsAppTemplatesPanel'

const CATALOG = [{ key: 'contact.name', label: 'Nombre del lead', example: 'Juan Pérez' }]

const LONG_BODY = 'Hola {{1}}, este es un texto bien largo que hoy se corta en la lista y no se puede leer completo'

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAPI.mockImplementation((endpoint: string) => {
    if (endpoint === '/messaging/whatsapp/templates/variable-catalog') return Promise.resolve({ catalog: CATALOG })
    if (endpoint === '/messaging/whatsapp/templates') {
      return Promise.resolve({
        templates: [{
          id: 't1', name: 'saludo_inicial_leads', language: 'es', category: 'MARKETING',
          bodyText: LONG_BODY, status: 'APPROVED', variables: ['contact.name']
        }],
        openingTemplateId: null, technicalVisitTemplateId: null, visitConfirmationTemplateId: null
      })
    }
    return Promise.resolve({})
  })
})

describe('WhatsAppTemplatesPanel — view modal', () => {
  it('opens a dialog with the full body text when clicking the view button', async () => {
    const user = userEvent.setup()
    render(<WhatsAppTemplatesPanel />)

    const viewButton = await screen.findByRole('button', { name: /ver plantilla saludo_inicial_leads/i })
    await user.click(viewButton)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(LONG_BODY)).toBeInTheDocument()
    expect(within(dialog).getByText(/Nombre del lead/)).toBeInTheDocument()
  })
})
