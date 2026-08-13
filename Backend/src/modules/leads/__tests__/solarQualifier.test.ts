import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { qualifySolarLead, evaluateSolarResV2Criteria } from '../solarQualifier'

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

  it('deja en revisión si el techo es teja chilena, aunque el resto del lead califique', () => {
    const result = qualifySolarLead({
      ownershipType: 'dueño', techoConfirmado: true, montoBoleta: '210000', materialTecho: 'teja_chilena'
    })
    expect(result.qualificationStatus).toBe('REVISAR')
    expect(result.qualificationSummary).toMatch(/teja chilena/i)
  })

  it('deja en revisión con resumen explícito para líneas de servicio sin reglas propias (perforación/bombeo/mantención)', () => {
    const result = qualifySolarLead({
      service: 'drilling', ownershipType: 'dueño', techoConfirmado: true
    })
    expect(result.qualificationStatus).toBe('REVISAR')
    expect(result.qualificationSummary).toMatch(/sin reglas de calificación/i)
  })
})

describe('evaluateSolarResV2Criteria', () => {
  const ORIGINAL_ENV = process.env.SOLAR_SERVICE_AREA_COMUNAS

  beforeEach(() => { process.env.SOLAR_SERVICE_AREA_COMUNAS = 'Providencia,Las Condes' })
  afterEach(() => { process.env.SOLAR_SERVICE_AREA_COMUNAS = ORIGINAL_ENV })

  it('los 4 criterios son true cuando el lead cumple todo', () => {
    const result = evaluateSolarResV2Criteria({
      comuna: 'Providencia', ownershipType: 'dueño', techoConfirmado: true, montoBoleta: '45000'
    })
    expect(result).toEqual({
      serviceAreaMatch: true, ownerOrDecisionMaker: true, technicalFitPreliminary: true, billBandEligible: true
    })
  })

  it('serviceAreaMatch es false cuando la comuna no está en el allowlist', () => {
    const result = evaluateSolarResV2Criteria({ comuna: 'Puente Alto', ownershipType: 'dueño', techoConfirmado: true, montoBoleta: '45000' })
    expect(result.serviceAreaMatch).toBe(false)
  })

  it('serviceAreaMatch es false cuando SOLAR_SERVICE_AREA_COMUNAS no está configurado (fail-safe)', () => {
    process.env.SOLAR_SERVICE_AREA_COMUNAS = ''
    const result = evaluateSolarResV2Criteria({ comuna: 'Providencia', ownershipType: 'dueño', techoConfirmado: true, montoBoleta: '45000' })
    expect(result.serviceAreaMatch).toBe(false)
  })

  it('ownerOrDecisionMaker es false para arrendatario', () => {
    const result = evaluateSolarResV2Criteria({ comuna: 'Providencia', ownershipType: 'arrendatario', techoConfirmado: true, montoBoleta: '45000' })
    expect(result.ownerOrDecisionMaker).toBe(false)
  })

  it('technicalFitPreliminary es false cuando techoConfirmado no es exactamente true', () => {
    const result = evaluateSolarResV2Criteria({ comuna: 'Providencia', ownershipType: 'dueño', montoBoleta: '45000' })
    expect(result.technicalFitPreliminary).toBe(false)
  })

  it('billBandEligible es false bajo el umbral mínimo', () => {
    const result = evaluateSolarResV2Criteria({ comuna: 'Providencia', ownershipType: 'dueño', techoConfirmado: true, montoBoleta: '15000' })
    expect(result.billBandEligible).toBe(false)
  })
})
