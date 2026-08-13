import type { LanguageGuard } from './responseSanitizer'

export interface AgentProfile {
  business?: { description?: string; coverage?: string }
  offer?: { name: string; price?: string }[]
  qualificationQuestions?: { key: string; question: string }[]
  objections?: { objection: string; response: string }[]
  scheduling?: { enabled: boolean; types: string[] }
  languageGuard?: LanguageGuard
}

export interface CompileInput {
  agent: { name: string; tone: string; promptBase?: string | null }
  profile: AgentProfile | null
  knowledgeChunks: string[]
  contact: {
    id: string; name: string; status: string;
    leadTemperature: string | null; leadType: string | null; leadScore: number | null;
    qualificationData: any
  } | null
  deal: { title: string; status: string; stage?: { name: string } | null } | null
  /** The contact's active (SCHEDULED/CONFIRMED) appointment, if any — grounds the model so
   *  it doesn't re-offer scheduling (including on follow-ups) when one already exists. */
  appointment?: { typeLabel: string; when: string } | null
}

export function pendingQualificationQuestions(profile: AgentProfile | null, contact: CompileInput['contact']) {
  if (!contact) return []
  const qualified = (contact.qualificationData ?? {}) as Record<string, unknown>
  return (profile?.qualificationQuestions ?? []).filter(q => qualified[q.key] === undefined)
}

function renderPrompt(
  { agent, profile, knowledgeChunks, contact, deal, appointment }: CompileInput,
  includeQualifierRules: boolean
): string {
  const sections: string[] = []

  sections.push(`Eres ${agent.name}, agente de ventas experto. Tono: ${agent.tone}.`)
  if (agent.promptBase) sections.push(`Instrucciones base: ${agent.promptBase}`)

  if (profile?.business?.description) {
    sections.push(`NEGOCIO:\n${profile.business.description}${profile.business.coverage ? `\nCobertura: ${profile.business.coverage}` : ''}`)
  }

  if (profile?.offer?.length) {
    sections.push(`OFERTA (no inventes precios fuera de esta lista):\n${profile.offer.map(o => `- ${o.name}${o.price ? `: ${o.price}` : ''}`).join('\n')}`)
  }

  if (knowledgeChunks.length) {
    sections.push(`CONOCIMIENTO DEL NEGOCIO (usa esto para responder; si no está aquí ni en la oferta, no lo afirmes):\n${knowledgeChunks.map(c => `- ${c}`).join('\n')}`)
  }

  if (contact) {
    const pending = pendingQualificationQuestions(profile, contact)
    sections.push(`LEAD ACTUAL:\nNombre: ${contact.name}\nStatus: ${contact.status}\nTemperatura: ${contact.leadTemperature ?? 'sin calificar'} | Tipo: ${contact.leadType ?? 'sin calificar'} | Score: ${contact.leadScore ?? '-'}`)
    if (pending.length) {
      sections.push(`PREGUNTAS DE CALIFICACIÓN PENDIENTES (obtén estas respuestas de forma natural, máximo una por mensaje, nunca como interrogatorio):\n${pending.map(q => `- [${q.key}] ${q.question}`).join('\n')}`)
    }
  }

  if (deal) {
    sections.push(`DEAL ACTIVO: "${deal.title}" en etapa "${deal.stage?.name ?? 'inicial'}". Tu trabajo es empujarlo a la siguiente etapa.`)
  }

  if (appointment) {
    sections.push(`CITA AGENDADA:\n${appointment.typeLabel} confirmada para ${appointment.when}. NO ofrezcas agendar de nuevo ni preguntes qué día le acomoda — esa cita ya existe. Si el cliente pregunta por ella, confírmasela con esta fecha/hora tal cual. Si pide cambiarla, usa reschedule_appointment.`)
  }

  if (profile?.objections?.length) {
    sections.push(`MANEJO DE OBJECIONES:\n${profile.objections.map(o => `- Si dice "${o.objection}" → responde en línea con: ${o.response}`).join('\n')}`)
  }

  const qualifierBullet = includeQualifierRules
    ? '\n- Cada vez que obtengas una respuesta de calificación o detectes cambio de intención, llama update_qualification y tag_contact.'
    : ''
  const handoverBullet = includeQualifierRules
    ? '\n- Si el cliente se molesta o pide un humano, usa handover_to_human.'
    : ''
  const closingAction = profile?.scheduling?.enabled
    ? 'agenda una cita con schedule_appointment (ofrece horarios reales con get_available_slots); si el cliente ya tiene una cita y quiere cambiar la hora, usa reschedule_appointment'
    : includeQualifierRules
      ? 'crea o avanza el deal'
      : 'sigue avanzando la conversación hacia el cierre'

  sections.push(`PLAYBOOK DE CIERRE (sigue las etapas en orden):
1. Saludo breve y cálido.
2. Descubrimiento: obtén las respuestas de calificación pendientes.
3. Presenta la solución adecuada de la OFERTA según sus respuestas.
4. Maneja objeciones con los argumentos dados.
5. Cierre: ${closingAction} y confirma el siguiente paso.

REGLAS DURAS:${qualifierBullet}
- No inventes precios, plazos ni garantías que no estén en OFERTA o CONOCIMIENTO.${handoverBullet}
- Al ofrecer o confirmar horarios de citas, usa siempre el texto "label" que entregan get_available_slots/schedule_appointment/reschedule_appointment tal cual — nunca calcules, conviertas ni reescribas la hora tú mismo.
- Sé conciso: mensajes cortos estilo WhatsApp.${!profile ? '\n- Ayuda al cliente y trata de cerrar una venta.' : ''}`)

  return sections.join('\n\n')
}

export function compileSystemPrompt(input: CompileInput): string {
  return renderPrompt(input, true)
}

/**
 * Same prompt as compileSystemPrompt() minus the CRM-tool rules (moved to
 * compileQualifierPrompt()) — used by the split-path responder, which no
 * longer declares update_qualification / tag_contact / handover_to_human
 * as tools.
 */
export function compileResponderPrompt(input: CompileInput): string {
  return renderPrompt(input, false)
}

export function compileQualifierPrompt({ agent, profile, contact }: Pick<CompileInput, 'agent' | 'profile' | 'contact'>): string {
  const sections: string[] = []

  sections.push(`Eres el motor de calificación interno de ${agent.name}, un agente de ventas. No hablas con el cliente — tu única salida es un objeto JSON.`)

  if (contact) {
    sections.push(`LEAD ACTUAL:\nNombre: ${contact.name}\nStatus: ${contact.status}\nTemperatura: ${contact.leadTemperature ?? 'sin calificar'} | Tipo: ${contact.leadType ?? 'sin calificar'} | Score: ${contact.leadScore ?? '-'}`)
    const pending = pendingQualificationQuestions(profile, contact)
    if (pending.length) {
      sections.push(`PREGUNTAS DE CALIFICACIÓN PENDIENTES:\n${pending.map(q => `- [${q.key}] ${q.question}`).join('\n')}`)
    }
  }

  sections.push(`REGLAS:
- Si el último mensaje del cliente responde una pregunta de calificación pendiente o revela su intención de compra, llena "qualification" (temperature, type, score, data) con lo que aprendiste.
- Usa "tags" para etiquetas de segmentación (ej. "lead-caliente", "financiamiento", "postventa").
- Usa "statusChange" solo cuando el status del contacto debe pasar de LEAD a PROSPECT o a CUSTOMER.
- Usa "deal" solo si corresponde crear una oportunidad nueva o mover una existente a otra etapa del pipeline.
- Usa "needsHuman" si el cliente pide hablar con un humano explícitamente o está molesto.
- Usa "stopFollowUps" solo si el cliente rechaza la oferta de forma clara y firme (ej. "no me interesa", "no gracias", "no me escribas más") Y esa objeción NO está en la lista de MANEJO DE OBJECIONES de arriba (si está en la lista, respóndela normalmente y no actives esto — la secuencia de seguimiento sigue). Un "no" dudoso, una pregunta, o silencio no cuentan.
- Si no hay señal nueva en este turno, devuelve un objeto vacío {}. No inventes datos que el cliente no dijo.`)

  return sections.join('\n\n')
}
