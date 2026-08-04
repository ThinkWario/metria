/**
 * Umbral de boleta eléctrica mensual (CLP) bajo el cual un lead queda en
 * REVISAR en vez de CALIFICA — un consumo bajo hace que el proyecto solar
 * no sea rentable a corto plazo. Valor inicial acordado con DrillChile;
 * ajustable sin tocar el resto del flujo.
 */
const MIN_MONTHLY_BILL_CLP = 30_000

export interface SolarQualificationResult {
  qualificationStatus: 'CALIFICA' | 'NO_CALIFICA' | 'REVISAR'
  qualificationSummary: string
}

function parseMontoBoleta(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const digits = String(raw).replace(/[^\d]/g, '')
  if (!digits) return null
  return Number(digits)
}

/**
 * Reglas determinísticas sobre el shape tipado de StepData de solar — a
 * diferencia de sheets.agent.ts (que infiere calificación vía IA sobre
 * columnas arbitrarias de una planilla), acá el shape ya es conocido, así
 * que no hace falta IA ni configuración por workspace.
 */
export function qualifySolarLead(data: Record<string, unknown>): SolarQualificationResult {
  const service = data.service
  if (typeof service === 'string' && service !== 'solar') {
    return {
      qualificationStatus: 'REVISAR',
      qualificationSummary: `Línea de servicio "${service}" sin reglas de calificación automática — requiere revisión manual.`
    }
  }

  const ownershipType = String(data.ownershipType ?? '')
  // Distinguish explicit false (lead confirmed "no" → NO_CALIFICA) from
  // absent (step never answered → REVISAR, missing data).
  const techoConfirmado = data.techoConfirmado === true
  const techoRechazado = data.techoConfirmado === false
  const montoBoleta = parseMontoBoleta(data.montoBoleta)

  const isOwnerOrFamily = ownershipType === 'dueño' || ownershipType === 'familiar'

  if (ownershipType === 'arrendatario' || techoRechazado) {
    return {
      qualificationStatus: 'NO_CALIFICA',
      qualificationSummary: ownershipType === 'arrendatario'
        ? 'Arrendatario — requiere autorización del propietario, no califica directamente.'
        : 'Techo no confirmado — no se puede evaluar viabilidad de instalación.'
    }
  }

  if (isOwnerOrFamily && montoBoleta !== null && montoBoleta >= MIN_MONTHLY_BILL_CLP) {
    return {
      qualificationStatus: 'CALIFICA',
      qualificationSummary: `Propietario con techo confirmado y boleta de $${montoBoleta.toLocaleString('es-CL')} — cumple los criterios básicos.`
    }
  }

  return {
    qualificationStatus: 'REVISAR',
    qualificationSummary: 'Faltan datos o la boleta está bajo el umbral mínimo — requiere revisión manual.'
  }
}
