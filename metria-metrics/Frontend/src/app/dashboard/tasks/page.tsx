import type { Metadata } from 'next'
import TasksPageClient from './TasksPageClient'

export const metadata: Metadata = {
  title: 'Mis Tareas | Metria',
  description: 'Gestiona tus tareas pendientes del CRM',
}

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <TasksPageClient />
    </div>
  )
}
