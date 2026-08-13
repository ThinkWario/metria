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
  const materialTecho = String(data.materialTecho ?? '')

  const isOwnerOrFamily = ownershipType === 'dueño' || ownershipType === 'familiar'

  if (ownershipType === 'arrendatario' || techoRechazado) {
    return {
      qualificationStatus: 'NO_CALIFICA',
      qualificationSummary: ownershipType === 'arrendatario'
        ? 'Arrendatario — requiere autorización del propietario, no califica directamente.'
        : 'Techo no confirmado — no se puede evaluar viabilidad de instalación.'
    }
  }

  // DrillChile aún no tiene sistema de anclaje para teja chilena — el wizard
  // web ya bloquea este material, pero el gate corre acá también por si el
  // lead entra por otra vía (bot, carga manual en CRM, API).
  if (materialTecho === 'teja_chilena') {
    return {
      qualificationStatus: 'REVISAR',
      qualificationSummary: 'Techo de teja chilena — DrillChile aún no opera este material, requiere lista de espera / revisión manual.'
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

export interface SolarResV2Criteria {
  serviceAreaMatch: boolean
  ownerOrDecisionMaker: boolean
  technicalFitPreliminary: boolean
  billBandEligible: boolean
}

/**
 * Allowlist leída en cada llamada (no cacheada a nivel de módulo) para que
 * cambios de env var surtan efecto sin reiniciar el proceso y para que los
 * tests puedan controlarla con process.env directamente. Vacía por diseño =
 * fail-safe: sin comunas configuradas, ningún lead pasa service_area_match
 * automáticamente — evita "calificar" por defecto por un env var olvidado.
 */
function isInServiceArea(comuna: string): boolean {
  const allowlist = (process.env.SOLAR_SERVICE_AREA_COMUNAS ?? '')
    .split(',').map(c => c.trim().toLowerCase()).filter(Boolean)
  if (allowlist.length === 0) return false
  return allowlist.includes(comuna.trim().toLowerCase())
}

/**
 * Los 4 criterios automáticos del gate `solar_res_v2`
 * (INSTRUCCIONES_DESARROLLADOR_TRACKING_METRIA_SOLAR_AGOSTO_2026.md §9) que
 * SÍ se pueden derivar de StepData sin intervención humana. Los otros dos
 * campos que ese documento exige — `next_step_confirmed` y la validación
 * humana en sí — no se calculan aquí: los satisface el flujo de
 * confirmación manual (contact.service.ts::confirmQualifiedLead, Task 6).
 */
export function evaluateSolarResV2Criteria(data: Record<string, unknown>): SolarResV2Criteria {
  const comuna = String(data.comuna ?? '')
  const ownershipType = String(data.ownershipType ?? '')
  const montoBoleta = parseMontoBoleta(data.montoBoleta)

  return {
    serviceAreaMatch: isInServiceArea(comuna),
    ownerOrDecisionMaker: ownershipType === 'dueño' || ownershipType === 'familiar',
    technicalFitPreliminary: data.techoConfirmado === true,
    billBandEligible: montoBoleta !== null && montoBoleta >= MIN_MONTHLY_BILL_CLP
  }
}
