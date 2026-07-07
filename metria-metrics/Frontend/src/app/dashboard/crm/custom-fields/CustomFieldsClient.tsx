'use client'
import { useEffect, useState } from 'react'
import { fetchAPI } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'

interface CustomFieldDefinition {
  id: string
  key: string
  label: string
}

export default function CustomFieldsClient() {
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fetchAPI('/crm/custom-fields')
      .then(setDefinitions)
      .catch(() => toast.error('No se pudieron cargar los campos personalizados'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const create = async () => {
    if (!newLabel.trim()) return
    setSaving(true)
    try {
      await fetchAPI('/crm/custom-fields', { method: 'POST', body: JSON.stringify({ label: newLabel.trim() }) })
      setNewLabel('')
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    try {
      await fetchAPI(`/crm/custom-fields/${id}`, { method: 'DELETE' })
      load()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex gap-2">
        <Input
          placeholder="Nombre del campo (ej. RUT)"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && create()}
        />
        <Button onClick={create} disabled={saving || !newLabel.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Agregar
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : definitions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin campos personalizados todavía.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {definitions.map(d => (
            <li key={d.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-medium">{d.label}</span>
              <Button variant="ghost" size="sm" aria-label={`Eliminar ${d.label}`} onClick={() => remove(d.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
