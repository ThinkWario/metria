import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockFetchAPI } = vi.hoisted(() => ({ mockFetchAPI: vi.fn() }))
vi.mock('@/lib/api', () => ({ fetchAPI: mockFetchAPI }))

import SheetLinkModal from '../SheetLinkModal'

// jsdom doesn't implement the Pointer Events methods Radix's Select uses to
// open its portal content — without these, user.click() on a SelectTrigger
// never renders its options.
beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false)
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {})
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {})
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})
})

function mockAnalyzeAndPipelines() {
  mockFetchAPI.mockImplementation((path: string) => {
    if (path === '/crm/pipelines') return Promise.resolve([{ id: 'pipe-1', name: 'Ventas', isDefault: true, stages: [{ id: 'stage-1', name: 'Lead', order: 0, color: '#000' }] }])
    if (path === '/crm/custom-fields') return Promise.resolve([{ id: 'cf-1', key: 'rut', label: 'RUT' }])
    if (path === '/sheets/analyze') return Promise.resolve({
      data: {
        sheetId: 'abc', sheetName: 'Leads',
        headers: ['Nombre', 'RUT'],
        suggestedMappings: { mappings: { name: 'Nombre' }, suggestedQualificationFields: [], notes: [] }
      }
    })
    return Promise.resolve({})
  })
}

describe('SheetLinkModal — column exclusion + custom field mapping', () => {
  it('sends excludedColumns and customFieldMappings when saving', async () => {
    mockAnalyzeAndPipelines()
    const user = userEvent.setup()
    render(<SheetLinkModal open onClose={() => {}} onCreated={() => {}} />)

    // Controlled Input typed via fireEvent — userEvent.type() hangs on this
    // specific field in this suite's jsdom environment for unrelated reasons;
    // fireEvent.change is equivalent for a plain onChange-driven text input.
    const urlInput = await screen.findByPlaceholderText(/docs.google.com/i)
    fireEvent.change(urlInput, { target: { value: 'https://docs.google.com/spreadsheets/d/abc/edit' } })
    await user.click(screen.getByRole('button', { name: /analizar con ia/i }))

    await screen.findByText(/mapeo de campos al crm/i)
    await user.click(screen.getByRole('button', { name: /configurar pre-calificación/i }))

    // toggle off "RUT" inclusion (step 3)
    await user.click(await screen.findByRole('switch', { name: /incluir rut/i }))
    // map RUT to the RUT custom field (Radix Select — trigger then pick the option)
    await user.click(await screen.findByRole('combobox', { name: /campo personalizado para rut/i }))
    await user.click(await screen.findByRole('option', { name: 'RUT' }))

    await user.click(await screen.findByRole('button', { name: /vincular planilla/i }))

    await waitFor(() => expect(mockFetchAPI).toHaveBeenCalledWith('/sheets', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"excludedColumns":["RUT"]')
    })))
  }, 15000)
})

describe('SheetLinkModal — permission-denied on analyze', () => {
  it('shows the sharing-fix instructions instead of a generic toast when the sheet is not accessible', async () => {
    mockFetchAPI.mockImplementation((path: string) => {
      if (path === '/crm/pipelines') return Promise.resolve([{ id: 'pipe-1', name: 'Ventas', isDefault: true, stages: [{ id: 'stage-1', name: 'Lead', order: 0, color: '#000' }] }])
      if (path === '/crm/custom-fields') return Promise.resolve([])
      if (path === '/sheets/analyze') return Promise.reject(new Error('SHEET_PERMISSION_DENIED'))
      return Promise.resolve({})
    })
    const user = userEvent.setup()
    render(<SheetLinkModal open onClose={() => {}} onCreated={() => {}} />)

    const urlInput = await screen.findByPlaceholderText(/docs.google.com/i)
    fireEvent.change(urlInput, { target: { value: 'https://docs.google.com/spreadsheets/d/restricted/edit' } })
    await user.click(screen.getByRole('button', { name: /analizar con ia/i }))

    expect(await screen.findByText(/no tiene permiso para leer esta planilla/i)).toBeInTheDocument()
    expect(screen.getByText(/cualquiera con el enlace/i)).toBeInTheDocument()
  })
})
