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

// ── Runs ─────────────────────────────────────────────────────────────────────
router.get('/crm/workflows/:id/runs', ...auth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json(await ws.listRuns(req.user!.workspaceId!, req.params.id))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
