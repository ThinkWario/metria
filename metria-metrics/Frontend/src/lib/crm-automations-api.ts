import { fetchAPI } from './api'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CatalogTrigger {
  value: string
  label: string
}

export interface CatalogAction {
  value: string
  label: string
  fields: string[]
}

export interface WorkflowCatalog {
  triggers: CatalogTrigger[]
  actions: CatalogAction[]
}

export interface WorkflowNode {
  type: string
  config: Record<string, any>
}

export interface Workflow {
  id: string
  name: string
  description: string | null
  isActive: boolean
  triggerType: string
  triggerConfig: Record<string, any> | null
  nodes: WorkflowNode[]
  runCount: number
  lastRunAt: string | null
  createdAt: string
}

export interface WorkflowRun {
  id: string
  status: string
  createdAt: string
  completedAt: string | null
  log: any
}

export interface WorkflowWithRuns extends Workflow {
  runs: WorkflowRun[]
}

export interface WorkflowInput {
  name: string
  description?: string
  triggerType: string
  triggerConfig?: Record<string, any>
  nodes: WorkflowNode[]
  isActive?: boolean
}

// ── API functions ──────────────────────────────────────────────────────────────

export const getCatalog = (): Promise<WorkflowCatalog> =>
  fetchAPI('/crm/workflows/catalog')

export const listWorkflows = (): Promise<Workflow[]> =>
  fetchAPI('/crm/workflows')

export const getWorkflow = (id: string): Promise<WorkflowWithRuns> =>
  fetchAPI(`/crm/workflows/${id}`)

export const createWorkflow = (data: WorkflowInput): Promise<Workflow> =>
  fetchAPI('/crm/workflows', {
    method: 'POST',
    body: JSON.stringify(data)
  })

export const updateWorkflow = (
  id: string,
  data: Partial<WorkflowInput>
): Promise<Workflow> =>
  fetchAPI(`/crm/workflows/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })

export const deleteWorkflow = (id: string): Promise<void> =>
  fetchAPI(`/crm/workflows/${id}`, { method: 'DELETE' })

export const getWorkflowRuns = (id: string): Promise<WorkflowRun[]> =>
  fetchAPI(`/crm/workflows/${id}/runs`)
