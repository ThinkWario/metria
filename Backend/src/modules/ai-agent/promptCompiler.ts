export interface AgentProfile {
  business?: { description?: string; coverage?: string }
  offer?: { name: string; price?: string }[]
  qualificationQuestions?: { key: string; question: string }[]
  objections?: { objection: string; response: string }[]
  scheduling?: { enabled: boolean; types: string[] }
}

interface CompileInput {
  agent: { name: string; tone: string; promptBase?: string | null }
  profile: AgentProfile | null
  knowledgeChunks: string[]
  contact: {
    id: string; name: string; status: string;
    leadTemperature: string | null; leadType: string | null; leadScore: number | null;
    qualificationData: any
  } | null
  deal: { title: string; status: string; stage?: { name: string } | null } | null
}

export function compileSystemPrompt({ agent, profile, knowledgeChunks, contact, deal }: CompileInput): string {
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
    const qualified = (contact.qualificationData ?? {}) as Record<string, unknown>
    const pending = (profile?.qualificationQuestions ?? []).filter(q => qualified[q.key] === undefined)
    sections.push(`LEAD ACTUAL:\nNombre: ${contact.name}\nStatus: ${contact.status}\nTemperatura: ${contact.leadTemperature ?? 'sin calificar'} | Tipo: ${contact.leadType ?? 'sin calificar'} | Score: ${contact.leadScore ?? '-'}`)
    if (pending.length) {
      sections.push(`PREGUNTAS DE CALIFICACIÓN PENDIENTES (obtén estas respuestas de forma natural, máximo una por mensaje, nunca como interrogatorio):\n${pending.map(q => `- [${q.key}] ${q.question}`).join('\n')}`)
    }
  }

  if (deal) {
    sections.push(`DEAL ACTIVO: "${deal.title}" en etapa "${deal.stage?.name ?? 'inicial'}". Tu trabajo es empujarlo a la siguiente etapa.`)
  }

  if (profile?.objections?.length) {
    sections.push(`MANEJO DE OBJECIONES:\n${profile.objections.map(o => `- Si dice "${o.objection}" → responde en línea con: ${o.response}`).join('\n')}`)
  }

  sections.push(`PLAYBOOK DE CIERRE (sigue las etapas en orden):
1. Saludo breve y cálido.
2. Descubrimiento: obtén las respuestas de calificación pendientes.
3. Presenta la solución adecuada de la OFERTA según sus respuestas.
4. Maneja objeciones con los argumentos dados.
5. Cierre: ${profile?.scheduling?.enabled ? 'agenda una cita con schedule_appointment (ofrece horarios reales con get_available_slots)' : 'crea o avanza el deal'} y confirma el siguiente paso.

REGLAS DURAS:
- Cada vez que obtengas una respuesta de calificación o detectes cambio de intención, llama update_qualification y tag_contact.
- No inventes precios, plazos ni garantías que no estén en OFERTA o CONOCIMIENTO.
- Si el cliente se molesta o pide un humano, usa handover_to_human.
- Sé conciso: mensajes cortos estilo WhatsApp.${!profile ? '\n- Ayuda al cliente y trata de cerrar una venta.' : ''}`)

  return sections.join('\n\n')
}
