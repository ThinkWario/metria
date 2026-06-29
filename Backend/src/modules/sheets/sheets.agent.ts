import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '')
const model = genAI.getGenerativeModel({ model: process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash' })

const CRM_FIELDS = `
- name: Nombre completo del contacto (requerido)
- email: Correo electrónico
- phone: Teléfono de contacto
- sessionId: Identificador único de sesión/registro (para evitar duplicados)
- eventColumn: Columna que indica el estado del registro (ej: "Evento", "Estado")
- eventFilter: Valor exacto que indica registro completo (ej: "complete", "completo", "enviado")
`

export interface FieldMappings {
  name?: string
  email?: string
  phone?: string
  sessionId?: string
  eventColumn?: string
  eventFilter?: string
}

export interface SuggestedAnalysis {
  mappings: FieldMappings
  suggestedQualificationFields: string[]
  allHeaders: string[]
  notes: string[]
}

export async function suggestFieldMappings(headers: string[]): Promise<SuggestedAnalysis> {
  const prompt = `Eres un agente experto en CRM que analiza planillas de captura de leads.

Se te proporcionan los encabezados de una planilla de Google Sheets:
${JSON.stringify(headers)}

Campos del CRM disponibles para mapear:
${CRM_FIELDS}

Tu tarea:
1. Sugiere qué columna de la planilla corresponde a cada campo del CRM.
2. Sugiere qué columnas son relevantes para pre-calificar un lead (datos financieros, de propiedad, estado civil, etc.).
3. Agrega notas sobre la calidad de los datos o advertencias importantes.

Responde SOLO con JSON válido, sin markdown, sin explicaciones:
{
  "mappings": {
    "name": "nombre_columna_o_null",
    "email": "nombre_columna_o_null",
    "phone": "nombre_columna_o_null",
    "sessionId": "nombre_columna_o_null",
    "eventColumn": "nombre_columna_o_null",
    "eventFilter": "valor_exacto_o_null"
  },
  "suggestedQualificationFields": ["columna1", "columna2"],
  "allHeaders": ${JSON.stringify(headers)},
  "notes": ["nota1", "nota2"]
}`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
  const clean = text.startsWith('```') ? text.replace(/```json?\n?/g, '').replace(/```/g, '').trim() : text
  return JSON.parse(clean)
}

export interface QualificationResult {
  qualificationStatus: 'CALIFICA' | 'NO_CALIFICA' | 'REVISAR'
  qualificationSummary: string
  observations: string[]
}

export async function qualifyLead(
  rowData: Record<string, string>,
  qualificationFields: string[],
  rules: string
): Promise<QualificationResult> {
  const relevantData = Object.fromEntries(
    qualificationFields.filter(f => rowData[f] !== undefined).map(f => [f, rowData[f]])
  )

  const prompt = `Eres un agente de pre-calificación de leads para una empresa de energía solar / servicios de financiamiento.

Datos del lead (campos seleccionados para calificación):
${JSON.stringify(relevantData, null, 2)}

${rules ? `Reglas de calificación del negocio:\n${rules}` : 'Evalúa con criterios generales: capacidad de pago, propiedad del inmueble, ausencia de deudas críticas.'}

Determina si este lead CALIFICA para financiamiento, NO_CALIFICA, o requiere REVISIÓN adicional.

Responde SOLO con JSON válido, sin markdown:
{
  "qualificationStatus": "CALIFICA|NO_CALIFICA|REVISAR",
  "qualificationSummary": "Resumen breve en 1-2 oraciones",
  "observations": [
    "✅ Observación positiva",
    "⚠️ Punto de atención",
    "❌ Factor negativo"
  ]
}`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
  const clean = text.startsWith('```') ? text.replace(/```json?\n?/g, '').replace(/```/g, '').trim() : text
  return JSON.parse(clean)
}
