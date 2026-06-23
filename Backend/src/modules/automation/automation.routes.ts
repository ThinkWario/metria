import { Router } from 'express'
import type { Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { requirePlan } from '../../middleware/planGate'
import type { AuthRequest } from '../../middleware/auth'
import * as ws from './automation.service'

const router = Router()
const auth = [authenticate, requirePlan('PRO', 'SCALE')] as const

// Catálogo de triggers y acciones disponibles (para poblar el builder en el frontend)
const TRIGGER_TYPES = [
  { value: 'DEAL_CREATED', label: 'Deal creado' },
  { value: 'DEAL_STAGE_CHANGED', label: 'Deal cambia de etapa' },
  { value: 'DEAL_WON', label: 'Deal ganado' },
  { value: 'DEAL_LOST', label: 'Deal perdido' },
  { value: 'TASK_CREATED', label: 'Tarea creada' },
  { value: 'TASK_COMPLETED', label: 'Tarea completada' },
  { value: 'MESSAGE_RECEIVED', label: 'Mensaje recibido' },
  { value: 'STATUS_CHANGED', label: 'Estado del contacto cambia' },
  { value: 'AI_QUALIFICATION', label: 'Calificación de IA' },
  { value: 'NOTE_ADDED', label: 'Nota agregada' },
  { value: 'FORM_SUBMITTED', label: 'Formulario enviado' },
  { value: 'APPOINTMENT_BOOKED', label: 'Cita agendada' }
]

const ACTION_TYPES = [
  { value: 'add_note', label: 'Agregar nota', fields: ['title', 'text'] },
  { value: 'create_task', label: 'Crear tarea', fields: ['title', 'priority', 'dueInHours'] },
  { value: 'update_status', label: 'Cambiar estado del contacto', fields: ['status'] },
  { value: 'add_tag', label: 'Agregar etiqueta', fields: ['name', 'color'] },
  { value: 'remove_tag', label: 'Quitar etiqueta', fields: ['name'] },
  { value: 'move_deal', label: 'Mover deal a etapa', fields: ['stageId'] },
  { value: 'webhook', label: 'Webhook (HTTP)', fields: ['url', 'method'] },
  { value: 'wait', label: 'Esperar', fields: ['hours', 'minutes'] },
  { value: 'branch', label: 'Condición (filtro)', fields: ['field', 'op', 'value'] }
]

// ── Catálogo ─────────────────────────────────────────────────────────────────
router.get('/crm/workflows/catalog', ...auth, (_req: AuthRequest, res: Response): void => {
  res.json({ triggers: TRIGGER_TYPES, actions: ACTION_TYPES })
})

// ── List ─────────────────────────────────────────────────────────────────────
router.get('/crm/workflows', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json(await ws.listWorkflows(req.user!.workspaceId!))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Create ───────────────────────────────────────────────────────────────────
router.post('/crm/workflows', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, triggerType, triggerConfig, nodes, isActive } = req.body
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return }
    if (!triggerType) { res.status(400).json({ error: 'triggerType is required' }); return }
    const wf = await ws.createWorkflow(req.user!.workspaceId!, {
      name: name.trim(), description, triggerType, triggerConfig, nodes, isActive
    })
    res.status(201).json(wf)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Get one (+ últimos runs) ──────────────────────────────────────────────────
router.get('/crm/workflows/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json(await ws.getWorkflow(req.user!.workspaceId!, req.params.id))
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

// ── Update ───────────────────────────────────────────────────────────────────
router.patch('/crm/workflows/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json(await ws.updateWorkflow(req.user!.workspaceId!, req.params.id, req.body))
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

// ── Delete ───────────────────────────────────────────────────────────────────
router.delete('/crm/workflows/:id', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ws.deleteWorkflow(req.user!.workspaceId!, req.params.id)
    res.status(204).send()
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

// ── Duplicate ─────────────────────────────────────────────────────────────────
router.post('/crm/workflows/:id/duplicate', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.status(201).json(await ws.duplicateWorkflow(req.user!.workspaceId!, req.params.id))
  } catch (err: any) {
    const status = err.message.toLowerCase().includes('not found') ? 404 : 500
    res.status(status).json({ error: err.message })
  }
})

// ── Runs ─────────────────────────────────────────────────────────────────────
router.get('/crm/workflows/:id/runs', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json(await ws.listRuns(req.user!.workspaceId!, req.params.id))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Templates ─────────────────────────────────────────────────────────────────
const WORKFLOW_TEMPLATES = [
  {
    id: 'reengagement-deal-lost',
    name: 'Re-engagement: Deal Perdido',
    description: 'Reactiva contactos cuyo deal se marcó como perdido. Envía 2 mensajes espaciados + cierra si no responde.',
    triggerType: 'DEAL_LOST',
    nodes: [
      { type: 'wait', config: { hours: 24 }, label: 'Esperar 1 día' },
      { type: 'send_message', config: { channel: 'WHATSAPP', content: 'Hola {{name}}, sé que aún no fue el momento para avanzar. ¿Hay algo que podamos hacer diferente para ayudarte?' }, label: 'Mensaje re-engagement 1' },
      { type: 'wait_for_reply', config: { hours: 72 }, label: 'Esperar respuesta (3 días)' },
      { type: 'branch', config: { field: '_reply_received', op: 'eq', value: 'false' }, label: 'Si no respondió' },
      { type: 'send_message', config: { channel: 'WHATSAPP', content: 'Entendemos {{name}}. Cuando estés listo, aquí estaremos. ¡Éxitos!' }, label: 'Mensaje de cierre' }
    ]
  },
  {
    id: 'welcome-new-contact',
    name: 'Bienvenida: Nuevo Contacto',
    description: 'Secuencia de bienvenida cuando se crea un contacto. Envía presentación + agenda cita.',
    triggerType: 'DEAL_CREATED',
    nodes: [
      { type: 'send_message', config: { channel: 'WHATSAPP', content: '¡Hola {{name}}! Gracias por tu interés. Soy de aquí y me encantaría ayudarte. ¿Tienes 15 minutos esta semana?' }, label: 'Mensaje de bienvenida' },
      { type: 'wait', config: { hours: 48 }, label: 'Esperar 2 días' },
      { type: 'send_message', config: { channel: 'WHATSAPP', content: '{{name}}, ¿pudiste revisar nuestra propuesta? Me gustaría agendar una llamada para responder tus dudas.' }, label: 'Follow-up bienvenida' }
    ]
  },
  {
    id: 'post-sale-followup',
    name: 'Post-Venta: Seguimiento',
    description: 'Después de ganar un deal, mantener al cliente satisfecho y pedir referidos.',
    triggerType: 'DEAL_WON',
    nodes: [
      { type: 'wait', config: { hours: 72 }, label: 'Esperar 3 días post-venta' },
      { type: 'send_message', config: { channel: 'WHATSAPP', content: '¡Hola {{name}}! ¿Cómo va todo desde que iniciamos? Queremos asegurarnos de que estés 100% satisfecho.' }, label: 'Check-in satisfacción' },
      { type: 'wait_for_reply', config: { hours: 24 }, label: 'Esperar respuesta' },
      { type: 'send_message', config: { channel: 'WHATSAPP', content: '{{name}}, si conoces alguien más que pueda beneficiarse de nuestros servicios, ¡te lo agradecemos enormemente!' }, label: 'Pedir referido' }
    ]
  }
]

router.get('/crm/workflows/templates', ...auth, (_req: AuthRequest, res: Response): void => {
  res.json(WORKFLOW_TEMPLATES)
})

router.post('/crm/workflows/templates/:templateId/install', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const template = WORKFLOW_TEMPLATES.find(t => t.id === req.params.templateId)
    if (!template) { res.status(404).json({ error: 'Template not found' }); return }
    const wf = await ws.createWorkflow(req.user!.workspaceId!, {
      name: template.name,
      description: template.description,
      triggerType: template.triggerType as any,
      nodes: template.nodes,
      isActive: false
    })
    res.status(201).json(wf)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
