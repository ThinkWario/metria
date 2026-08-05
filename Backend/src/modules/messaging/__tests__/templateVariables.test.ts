import { describe, it, expect } from 'vitest'
import {
  TEMPLATE_VARIABLE_CATALOG,
  ROLE_VARIABLE_REQUIREMENTS,
  isKnownVariableKey,
  getVariableExample,
  arraysEqual
} from '../templateVariables'

describe('templateVariables catalog', () => {
  it('isKnownVariableKey returns true for catalog keys and false otherwise', () => {
    expect(isKnownVariableKey('contact.name')).toBe(true)
    expect(isKnownVariableKey('not.a.key')).toBe(false)
  })

  it('getVariableExample returns the example value for a known key', () => {
    expect(getVariableExample('contact.name')).toBe('Juan Pérez')
  })

  it('getVariableExample throws for an unknown key', () => {
    expect(() => getVariableExample('not.a.key')).toThrow('Unknown template variable key: not.a.key')
  })

  it('arraysEqual compares order and length, not just membership', () => {
    expect(arraysEqual(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(arraysEqual(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(arraysEqual(['a'], ['a', 'b'])).toBe(false)
  })

  it('ROLE_VARIABLE_REQUIREMENTS matches what each send call site already hardcodes', () => {
    expect(ROLE_VARIABLE_REQUIREMENTS.openingTemplateId).toEqual(['contact.name'])
    expect(ROLE_VARIABLE_REQUIREMENTS.technicalVisitTemplateId).toEqual(['contact.name', 'contact.phone', 'appointment.when'])
    expect(ROLE_VARIABLE_REQUIREMENTS.visitConfirmationTemplateId).toEqual(['contact.name'])
  })

  it('TEMPLATE_VARIABLE_CATALOG has a unique key per entry', () => {
    const keys = TEMPLATE_VARIABLE_CATALOG.map(v => v.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
