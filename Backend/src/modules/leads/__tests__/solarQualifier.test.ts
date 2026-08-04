import { describe, it, expect } from 'vitest'
import { qualifySolarLead } from '../solarQualifier'

describe('qualifySolarLead', () => {
  it('califica cuando el dueño confirma techo y la boleta supera el umbral', () => {
    const result = qualifySolarLead({
      ownershipType: 'dueño', techoConfirmado: true, montoBoleta: '45000'
    })
    expect(result.qualificationStatus).toBe('CALIFICA')
  })

  it('califica también para propiedad familiar', () => {
    const result = qualifySolarLead({
      ownershipType: 'familiar', techoConfirmado: true, montoBoleta: '60000'
    })
    expect(result.qualificationStatus).toBe('CALIFICA')
  })

  it('no califica si es arrendatario', () => {
    const result = qualifySolarLead({
      ownershipType: 'arrendatario', techoConfirmado: true, montoBoleta: '80000'
    })
    expect(result.qualificationStatus).toBe('NO_CALIFICA')
  })

  it('no califica si no confirma el techo', () => {
    const result = qualifySolarLead({
      ownershipType: 'dueño', techoConfirmado: false, montoBoleta: '80000'
    })
    expect(result.qualificationStatus).toBe('NO_CALIFICA')
  })

  it('deja en revisión si la boleta está bajo el umbral', () => {
    const result = qualifySolarLead({
      ownershipType: 'dueño', techoConfirmado: true, montoBoleta: '15000'
    })
    expect(result.qualificationStatus).toBe('REVISAR')
  })

  it('deja en revisión si faltan datos', () => {
    const result = qualifySolarLead({})
    expect(result.qualificationStatus).toBe('REVISAR')
  })

  it('deja en revisión con resumen explícito para líneas de servicio sin reglas propias (perforación/bombeo/mantención)', () => {
    const result = qualifySolarLead({
      service: 'drilling', ownershipType: 'dueño', techoConfirmado: true
    })
    expect(result.qualificationStatus).toBe('REVISAR')
    expect(result.qualificationSummary).toMatch(/sin reglas de calificación/i)
  })
})
