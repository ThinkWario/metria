'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type OnConnect,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Zap, MessageSquare, Clock, MessageCircle, GitBranch, Globe, X, Plus,
} from 'lucide-react'
import {
  type Workflow,
  type WorkflowNode,
  type WorkflowCatalog,
  type CatalogAction,
} from '@/lib/crm-automations-api'
import { toast } from 'sonner'
import type { LucideProps } from 'lucide-react'

// ── Node metadata ──────────────────────────────────────────────────────────────

type IconComponent = React.FC<LucideProps>

interface NodeMeta {
  label: string
  Icon: IconComponent
  color: string       // Tailwind bg class for header
  textColor: string   // Tailwind text class for header
}

const NODE_META: Record<string, NodeMeta> = {
  trigger: {
    label: 'Disparador',
    Icon: Zap,
    color: 'bg-purple-500',
    textColor: 'text-white',
  },
  send_message: {
    label: 'Enviar Mensaje',
    Icon: MessageSquare,
    color: 'bg-blue-500',
    textColor: 'text-white',
  },
  wait: {
    label: 'Esperar',
    Icon: Clock,
    color: 'bg-amber-500',
    textColor: 'text-white',
  },
  wait_for_reply: {
    label: 'Esperar Respuesta',
    Icon: MessageCircle,
    color: 'bg-teal-500',
    textColor: 'text-white',
  },
  branch: {
    label: 'Bifurcación',
    Icon: GitBranch,
    color: 'bg-orange-500',
    textColor: 'text-white',
  },
  webhook: {
    label: 'Webhook',
    Icon: Globe,
    color: 'bg-gray-500',
    textColor: 'text-white',
  },
}

// Fallback meta for any action type not in the map above
function getNodeMeta(type: string, catalog?: WorkflowCatalog): NodeMeta {
  if (NODE_META[type]) return NODE_META[type]
  const catalogLabel = catalog?.actions.find(a => a.value === type)?.label
  return {
    label: catalogLabel ?? type,
    Icon: Zap,
    color: 'bg-slate-500',
    textColor: 'text-white',
  }
}

// ── Config field constants (mirrored from AutomationBuilder) ──────────────────

const NUMERIC_FIELDS = new Set(['dueInHours', 'hours', 'minutes'])

const ENUM_FIELDS: Record<string, { value: string; label: string }[]> = {
  priority: [
    { value: 'LOW', label: 'Baja' },
    { value: 'MEDIUM', label: 'Media' },
    { value: 'HIGH', label: 'Alta' },
    { value: 'URGENT', label: 'Urgente' },
  ],
  status: [
    { value: 'LEAD', label: 'Lead' },
    { value: 'PROSPECT', label: 'Prospecto' },
    { value: 'CUSTOMER', label: 'Cliente' },
    { value: 'VIP', label: 'VIP' },
    { value: 'CHURNED', label: 'Perdido' },
  ],
  method: [
    { value: 'GET', label: 'GET' },
    { value: 'POST', label: 'POST' },
  ],
  op: [
    { value: 'eq', label: '= igual a' },
    { value: 'neq', label: '≠ distinto de' },
    { value: 'gt', label: '> mayor que' },
    { value: 'gte', label: '≥ mayor o igual' },
    { value: 'lt', label: '< menor que' },
    { value: 'lte', label: '≤ menor o igual' },
    { value: 'contains', label: 'contiene' },
    { value: 'is_true', label: 'es verdadero' },
    { value: 'is_false', label: 'es falso' },
  ],
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Título',
  text: 'Texto',
  priority: 'Prioridad',
  dueInHours: 'Vence en (horas)',
  status: 'Nuevo estado',
  name: 'Nombre',
  color: 'Color',
  stageId: 'ID de etapa',
  url: 'URL',
  method: 'Método',
  hours: 'Horas',
  minutes: 'Minutos',
  field: 'Campo',
  op: 'Operador',
  value: 'Valor',
  channel: 'Canal',
  content: 'Contenido',
}

const FIELD_PLACEHOLDERS: Record<string, string> = {
  title: 'ej. Llamar al lead',
  text: 'Contenido de la nota...',
  name: 'ej. caliente',
  color: '#22c55e',
  stageId: 'ID de la etapa destino',
  url: 'https://...',
  field: 'ej. leadScore',
  value: 'Valor a comparar',
  channel: 'whatsapp',
  content: 'Hola {{name}}, ...',
}

function fieldLabel(f: string) {
  return FIELD_LABELS[f] ?? f
}

// ── Config preview for node card ───────────────────────────────────────────────

function configPreview(type: string, config: Record<string, unknown>): string {
  if (type === 'wait') {
    const h = config.hours ?? ''
    const m = config.minutes ?? ''
    if (h || m) return `Esperar ${h ? `${h}h` : ''}${m ? ` ${m}min` : ''}`.trim()
  }
  if (type === 'send_message') {
    const ch = config.channel ? `[${config.channel}] ` : ''
    const ct = String(config.content ?? '').slice(0, 30)
    if (ct) return `${ch}${ct}${ct.length === 30 ? '…' : ''}`
  }
  if (type === 'wait_for_reply') {
    const h = config.hours ?? ''
    if (h) return `Timeout: ${h}h`
  }
  if (type === 'branch') {
    const f = config.field ?? ''
    const op = config.op ?? ''
    const v = config.value ?? ''
    if (f) return `${f} ${op} ${v}`.trim()
  }
  if (type === 'webhook') {
    return String(config.url ?? '').slice(0, 35) || ''
  }
  return ''
}

// ── Custom node component ──────────────────────────────────────────────────────

import { Handle, Position } from '@xyflow/react'

interface CanvasNodeData {
  nodeType: string
  config: Record<string, unknown>
  isTrigger?: boolean
  onDelete?: (id: string) => void
  catalog?: WorkflowCatalog
  [key: string]: unknown
}

function WorkflowNode({ id, data, selected }: {
  id: string
  data: CanvasNodeData
  selected?: boolean
}) {
  const { nodeType, config, isTrigger, onDelete, catalog } = data
  const meta = getNodeMeta(nodeType, catalog)
  const { Icon } = meta
  const preview = configPreview(nodeType, config)

  return (
    <div
      className={`rounded-lg border shadow-sm bg-white dark:bg-gray-800 min-w-[200px] transition-all ${
        selected ? 'ring-2 ring-primary ring-offset-1' : 'hover:shadow-md'
      }`}
    >
      {/* Target handle — not shown for trigger */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white dark:!border-gray-800"
        />
      )}

      {/* Header */}
      <div className={`${meta.color} ${meta.textColor} rounded-t-lg px-3 py-2 flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-semibold truncate">{meta.label}</span>
        </div>
        {onDelete && !isTrigger && (
          <button
            type="button"
            onClick={() => onDelete(id)}
            className="opacity-70 hover:opacity-100 shrink-0 rounded p-0.5 hover:bg-white/20 transition-opacity"
            title="Eliminar nodo"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2 min-h-[36px]">
        {preview ? (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{preview}</p>
        ) : (
          <p className="text-xs text-muted-foreground/50 italic">Sin configurar</p>
        )}
      </div>

      {/* Source handle */}
      {data.sourceHandleId === 'yes' ? (
        // Branch node has two source handles
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="yes"
            style={{ left: '30%' }}
            className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white dark:!border-gray-800"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="no"
            style={{ left: '70%' }}
            className="!w-3 !h-3 !bg-red-400 !border-2 !border-white dark:!border-gray-800"
          />
          <div className="flex justify-between px-2 pb-1">
            <span className="text-[9px] text-emerald-600 font-medium ml-1">Sí</span>
            <span className="text-[9px] text-red-500 font-medium mr-1">No</span>
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white dark:!border-gray-800"
        />
      )}
    </div>
  )
}

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNode as any,
}

// ── Sidebar palette ────────────────────────────────────────────────────────────

const PALETTE_NODE_TYPES = [
  'send_message',
  'wait',
  'wait_for_reply',
  'branch',
  'webhook',
]

function NodePalette({ catalog }: { catalog?: WorkflowCatalog }) {
  function onDragStart(e: React.DragEvent, nodeType: string) {
    e.dataTransfer.setData('application/reactflow-type', nodeType)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-[200px] shrink-0 border-r bg-gray-50 dark:bg-gray-900 p-3 flex flex-col gap-2 overflow-y-auto">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        Acciones
      </p>
      {PALETTE_NODE_TYPES.map(type => {
        const meta = getNodeMeta(type, catalog)
        const { Icon } = meta
        return (
          <div
            key={type}
            draggable
            onDragStart={e => onDragStart(e, type)}
            className="flex items-center gap-2 rounded-md border bg-white dark:bg-gray-800 px-2 py-2 cursor-grab active:cursor-grabbing hover:border-primary/40 hover:shadow-sm transition-all select-none"
          >
            <div className={`${meta.color} rounded p-1`}>
              <Icon className="h-3 w-3 text-white" />
            </div>
            <span className="text-xs font-medium leading-tight">{meta.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Right config panel ─────────────────────────────────────────────────────────

interface ConfigPanelProps {
  nodeId: string | null
  nodeType: string | null
  config: Record<string, unknown>
  catalog: WorkflowCatalog
  onConfigChange: (nodeId: string, field: string, value: unknown) => void
  onDelete: (nodeId: string) => void
  isTrigger: boolean
}

function ConfigPanel({
  nodeId,
  nodeType,
  config,
  catalog,
  onConfigChange,
  onDelete,
  isTrigger,
}: ConfigPanelProps) {
  if (!nodeId || !nodeType) {
    return (
      <div className="w-[280px] shrink-0 border-l bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <p className="text-xs text-muted-foreground text-center">
          Selecciona un nodo para configurarlo
        </p>
      </div>
    )
  }

  const actionMeta: CatalogAction | undefined = catalog.actions.find(a => a.value === nodeType)
  const fields = actionMeta?.fields ?? []
  const meta = getNodeMeta(nodeType, catalog)
  const { Icon } = meta

  return (
    <div className="w-[280px] shrink-0 border-l bg-gray-50 dark:bg-gray-900 p-4 flex flex-col gap-4 overflow-y-auto">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`${meta.color} rounded p-1.5`}>
            <Icon className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold">{meta.label}</span>
        </div>
        {!isTrigger && (
          <button
            type="button"
            onClick={() => onDelete(nodeId)}
            className="rounded p-1 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
            title="Eliminar nodo"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Separator />

      {/* Fields */}
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">Este nodo no tiene configuración adicional.</p>
      ) : (
        <div className="space-y-3">
          {fields.map(field => {
            const value = config[field] ?? ''
            const enumOptions = ENUM_FIELDS[field]
            const isNumeric = NUMERIC_FIELDS.has(field)

            return (
              <div key={field} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{fieldLabel(field)}</Label>
                {enumOptions ? (
                  <Select
                    value={String(value)}
                    onValueChange={v => onConfigChange(nodeId, field, v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {enumOptions.map(o => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field === 'text' || field === 'content' ? (
                  <Textarea
                    rows={3}
                    placeholder={FIELD_PLACEHOLDERS[field] ?? ''}
                    value={String(value)}
                    onChange={e => onConfigChange(nodeId, field, e.target.value)}
                    className="text-xs resize-none"
                  />
                ) : (
                  <Input
                    type={isNumeric ? 'number' : 'text'}
                    placeholder={FIELD_PLACEHOLDERS[field] ?? ''}
                    value={String(value)}
                    className="h-8 text-xs"
                    onChange={e =>
                      onConfigChange(
                        nodeId,
                        field,
                        isNumeric
                          ? e.target.value === ''
                            ? ''
                            : Number(e.target.value)
                          : e.target.value
                      )
                    }
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── ID generation ──────────────────────────────────────────────────────────────

let idCounter = 1
function nextId() {
  return `node_${Date.now()}_${idCounter++}`
}

// ── Serialization: canvas → WorkflowNode[] ─────────────────────────────────────

function serializeNodes(
  rfNodes: Node[],
  rfEdges: Edge[]
): WorkflowNode[] {
  // Find the trigger node
  const triggerNode = rfNodes.find(n => (n.data as CanvasNodeData).isTrigger)
  if (!triggerNode) return []

  // Build adjacency map: nodeId → [targetNodeId, ...]
  const adjacency: Record<string, string[]> = {}
  for (const edge of rfEdges) {
    if (!adjacency[edge.source]) adjacency[edge.source] = []
    // Only follow the "yes" handle for branch nodes (or single handle)
    if (!edge.sourceHandle || edge.sourceHandle === 'yes') {
      adjacency[edge.source].push(edge.target)
    }
  }

  const result: WorkflowNode[] = []
  const visited = new Set<string>()
  const queue: string[] = [triggerNode.id]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const node = rfNodes.find(n => n.id === currentId)
    if (!node) continue

    const nodeData = node.data as CanvasNodeData
    if (!nodeData.isTrigger) {
      result.push({
        type: nodeData.nodeType,
        config: nodeData.config as Record<string, unknown>,
      })
    }

    const children = adjacency[currentId] ?? []
    queue.push(...children)
  }

  return result
}

// ── Deserialization: WorkflowNode[] → canvas nodes+edges ──────────────────────

function deserializeWorkflow(
  workflow: Workflow | null | undefined,
  triggerType: string
): { nodes: Node[]; edges: Edge[] } {
  const SPACING_Y = 160

  const triggerNode: Node = {
    id: 'trigger',
    type: 'workflowNode',
    position: { x: 200, y: 50 },
    data: {
      nodeType: 'trigger',
      config: {},
      isTrigger: true,
      label: triggerType,
    } satisfies Partial<CanvasNodeData>,
  }

  if (!workflow?.nodes?.length) {
    return { nodes: [triggerNode], edges: [] }
  }

  const nodes: Node[] = [triggerNode]
  const edges: Edge[] = []
  let prevId = 'trigger'

  workflow.nodes.forEach((wNode, i) => {
    const id = `wnode_${i}`
    nodes.push({
      id,
      type: 'workflowNode',
      position: { x: 200, y: 50 + (i + 1) * SPACING_Y },
      data: {
        nodeType: wNode.type,
        config: { ...wNode.config },
        isTrigger: false,
      } satisfies Partial<CanvasNodeData>,
    })
    edges.push({
      id: `e_${prevId}_${id}`,
      source: prevId,
      target: id,
      type: 'smoothstep',
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
    })
    prevId = id
  })

  return { nodes, edges }
}

// ── Main canvas inner component ────────────────────────────────────────────────

interface WorkflowCanvasInnerProps {
  workflow: Workflow | null | undefined
  triggerType: string
  catalog: WorkflowCatalog
  onNodesReady: (
    getNodes: () => Node[],
    getEdges: () => Edge[]
  ) => void
}

function WorkflowCanvasInner({
  workflow,
  triggerType,
  catalog,
  onNodesReady,
}: WorkflowCanvasInnerProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)

  const { nodes: initNodes, edges: initEdges } = deserializeWorkflow(workflow, triggerType)

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Expose current nodes/edges to parent via callback
  useEffect(() => {
    onNodesReady(
      () => nodes as Node[],
      () => edges as Edge[]
    )
  })

  // Attach onDelete to each node's data
  const handleDeleteNode = useCallback((id: string) => {
    setNodes(nds => nds.filter(n => n.id !== id))
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id))
    setSelectedNodeId(prev => (prev === id ? null : prev))
  }, [setNodes, setEdges])

  // Update node config from panel
  const handleConfigChange = useCallback((nodeId: string, field: string, value: unknown) => {
    setNodes(nds =>
      nds.map(n => {
        if (n.id !== nodeId) return n
        const data = n.data as CanvasNodeData
        return {
          ...n,
          data: {
            ...data,
            config: { ...data.config, [field]: value },
          },
        }
      })
    )
  }, [setNodes])

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges(eds =>
        addEdge(
          {
            ...connection,
            type: 'smoothstep',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds
        )
      )
    },
    [setEdges]
  )

  // Drop from palette
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const type = e.dataTransfer.getData('application/reactflow-type')
      if (!type || !reactFlowWrapper.current) return

      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      // Approximate drop position (we can't use project() without the hook)
      const x = e.clientX - bounds.left - 100
      const y = e.clientY - bounds.top - 30

      const id = nextId()
      const newNode: Node = {
        id,
        type: 'workflowNode',
        position: { x, y },
        data: {
          nodeType: type,
          config: {},
          isTrigger: false,
        } satisfies Partial<CanvasNodeData>,
      }
      setNodes(nds => [...nds, newNode])
      setSelectedNodeId(id)
    },
    [setNodes]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  // Node with injected callbacks for rendering
  const nodesWithCallbacks = nodes.map(n => ({
    ...n,
    data: {
      ...(n.data as CanvasNodeData),
      onDelete: handleDeleteNode,
      catalog,
      // branch nodes get special handle id for left source
      ...(n.data?.nodeType === 'branch' ? { sourceHandleId: 'yes' } : {}),
    },
  }))

  const selectedNode = nodes.find(n => n.id === selectedNodeId)
  const selectedData = selectedNode?.data as CanvasNodeData | undefined
  const isTriggerSelected = selectedData?.isTrigger ?? false

  return (
    <div className="flex h-full">
      {/* Left palette */}
      <NodePalette catalog={catalog} />

      {/* Canvas */}
      <div ref={reactFlowWrapper} className="flex-1 relative">
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          deleteKeyCode="Delete"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls />
          <MiniMap
            nodeColor={n => {
              const t = (n.data as CanvasNodeData)?.nodeType ?? ''
              const meta = NODE_META[t]
              return meta ? meta.color.replace('bg-', '').replace('-500', '') : '#94a3b8'
            }}
            pannable
            zoomable
          />
        </ReactFlow>
      </div>

      {/* Right config panel */}
      <ConfigPanel
        nodeId={selectedNodeId}
        nodeType={selectedData?.nodeType ?? null}
        config={(selectedData?.config as Record<string, unknown>) ?? {}}
        catalog={catalog}
        onConfigChange={handleConfigChange}
        onDelete={handleDeleteNode}
        isTrigger={isTriggerSelected}
      />
    </div>
  )
}

// ── Public props ───────────────────────────────────────────────────────────────

export interface WorkflowCanvasProps {
  open: boolean
  workflow?: Workflow | null
  catalog: WorkflowCatalog
  onClose: () => void
  onSave: (data: {
    name: string
    triggerType: string
    nodes: WorkflowNode[]
    isActive: boolean
  }) => Promise<void>
}

// ── Main exported component ────────────────────────────────────────────────────

export function WorkflowCanvas({
  open,
  workflow,
  catalog,
  onClose,
  onSave,
}: WorkflowCanvasProps) {
  const [name, setName] = useState(workflow?.name ?? '')
  const [triggerType, setTriggerType] = useState(workflow?.triggerType ?? '')
  const [saving, setSaving] = useState(false)

  // Reset form state when the canvas opens for a different workflow
  useEffect(() => {
    if (open) {
      setName(workflow?.name ?? '')
      setTriggerType(workflow?.triggerType ?? '')
    }
  }, [open, workflow])

  // Mutable ref to current nodes/edges set by the inner canvas
  const getNodesRef = useRef<(() => Node[]) | null>(null)
  const getEdgesRef = useRef<(() => Edge[]) | null>(null)

  const handleNodesReady = useCallback(
    (getNodes: () => Node[], getEdges: () => Edge[]) => {
      getNodesRef.current = getNodes
      getEdgesRef.current = getEdges
    },
    []
  )

  async function handleSave() {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
    if (!triggerType) { toast.error('Selecciona un disparador'); return }

    const currentNodes = getNodesRef.current?.() ?? []
    const currentEdges = getEdgesRef.current?.() ?? []
    const serialized = serializeNodes(currentNodes, currentEdges)

    if (serialized.length === 0) {
      toast.error('Agrega al menos una acción al canvas')
      return
    }

    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        triggerType,
        nodes: serialized,
        isActive: workflow?.isActive ?? false,
      })
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="h-4 w-4 text-purple-500 shrink-0" />
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nombre del workflow"
            className="h-8 w-64 text-sm font-medium"
          />
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Disparador:</Label>
          <Select value={triggerType} onValueChange={setTriggerType}>
            <SelectTrigger className="h-8 text-xs w-52">
              <SelectValue placeholder="Seleccionar evento" />
            </SelectTrigger>
            <SelectContent>
              {catalog.triggers.map(t => (
                <SelectItem key={t.value} value={t.value} className="text-xs">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-hidden">
        <ReactFlowProvider>
          <WorkflowCanvasInner
            key={workflow?.id ?? 'new'}
            workflow={workflow}
            triggerType={triggerType}
            catalog={catalog}
            onNodesReady={handleNodesReady}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
