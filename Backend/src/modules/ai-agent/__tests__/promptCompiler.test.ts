import { describe, it, expect } from 'vitest'
import { compileSystemPrompt, compileResponderPrompt, compileQualifierPrompt, type AgentProfile } from '../promptCompiler'

const baseProfile: AgentProfile = {
  business: { description: 'Vendemos paneles solares residenciales', coverage: 'RM, Chile' },
  offer: [{ name: 'Kit Solar 3kW', price: 'desde $2.500.000 CLP' }],
  qualificationQuestions: [
    { key: 'monthly_kwh', question: '¿Cuánto pagas de luz al mes?' },
    { key: 'is_owner', question: '¿Eres propietario de la vivienda?' }
  ],
  objections: [{ objection: 'Es muy caro', response: 'Se paga solo en 5 años con el ahorro.' }],
  scheduling: { enabled: true, types: ['SITE_VISIT'] }
}

const agent = { name: 'Sol', tone: 'casual', promptBase: 'Sé amable.' }

describe('compileSystemPrompt', () => {
  it('includes identity, business, offer and objections', () => {
    const prompt = compileSystemPrompt({ agent, profile: baseProfile, knowledgeChunks: [], contact: null, deal: null })
    expect(prompt).toContain('Sol')
    expect(prompt).toContain('casual')
    expect(prompt).toContain('paneles solares residenciales')
    expect(prompt).toContain('Kit Solar 3kW')
    expect(prompt).toContain('Es muy caro')
  })

  it('lists pending qualification questions only', () => {
    const contact = { id: 'c1', name: 'Ana', status: 'LEAD', leadTemperature: null, leadType: null, leadScore: null, qualificationData: { monthly_kwh: '50000' } }
    const prompt = compileSystemPrompt({ agent, profile: baseProfile, knowledgeChunks: [], contact: contact as any, deal: null })
    expect(prompt).toContain('¿Eres propietario de la vivienda?')
    expect(prompt).not.toContain('¿Cuánto pagas de luz al mes?')
  })

  it('injects knowledge chunks section when present', () => {
    const prompt = compileSystemPrompt({ agent, profile: baseProfile, knowledgeChunks: ['Garantía de 10 años.'], contact: null, deal: null })
    expect(prompt).toContain('CONOCIMIENTO DEL NEGOCIO')
    expect(prompt).toContain('Garantía de 10 años.')
  })

  it('includes deal stage when deal exists', () => {
    const deal = { title: 'Kit Ana', status: 'OPEN', stage: { name: 'Cotización' } }
    const prompt = compileSystemPrompt({ agent, profile: baseProfile, knowledgeChunks: [], contact: null, deal: deal as any })
    expect(prompt).toContain('Cotización')
  })

  it('works with empty profile (no wizard yet)', () => {
    const prompt = compileSystemPrompt({ agent, profile: null, knowledgeChunks: [], contact: null, deal: null })
    expect(prompt).toContain('Sol')
    expect(prompt).toContain('cerrar una venta')
  })
})

describe('compileResponderPrompt', () => {
  it('keeps business/offer/knowledge/objections but drops the CRM-tool rules', () => {
    const prompt = compileResponderPrompt({ agent, profile: baseProfile, knowledgeChunks: ['Garantía de 10 años.'], contact: null, deal: null })
    expect(prompt).toContain('paneles solares residenciales')
    expect(prompt).toContain('Kit Solar 3kW')
    expect(prompt).toContain('Garantía de 10 años.')
    expect(prompt).toContain('Es muy caro')
    expect(prompt).not.toContain('update_qualification')
    expect(prompt).not.toContain('tag_contact')
    expect(prompt).not.toContain('handover_to_human')
  })

  it('does not tell the responder to create/advance a deal when scheduling is disabled', () => {
    const profileNoScheduling: AgentProfile = { ...baseProfile, scheduling: { enabled: false, types: [] } }
    const prompt = compileResponderPrompt({ agent, profile: profileNoScheduling, knowledgeChunks: [], contact: null, deal: null })
    expect(prompt).not.toContain('crea o avanza el deal')
    expect(prompt).toContain('sigue avanzando la conversación')
  })
})

describe('compileQualifierPrompt', () => {
  it('includes lead state and pending questions but excludes business/offer/knowledge', () => {
    const contact = { id: 'c1', name: 'Ana', status: 'LEAD', leadTemperature: null, leadType: null, leadScore: null, qualificationData: {} }
    const prompt = compileQualifierPrompt({ agent, profile: baseProfile, contact: contact as any })
    expect(prompt).toContain('Ana')
    expect(prompt).toContain('¿Cuánto pagas de luz al mes?')
    expect(prompt).not.toContain('paneles solares residenciales')
    expect(prompt).not.toContain('Kit Solar 3kW')
  })

  it('omits the pending-questions section once all questions are answered', () => {
    const contact = { id: 'c1', name: 'Ana', status: 'LEAD', leadTemperature: null, leadType: null, leadScore: null, qualificationData: { monthly_kwh: '50000', is_owner: 'true' } }
    const prompt = compileQualifierPrompt({ agent, profile: baseProfile, contact: contact as any })
    expect(prompt).not.toContain('PREGUNTAS DE CALIFICACIÓN PENDIENTES')
  })
})
