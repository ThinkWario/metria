'use client'
import type { Conversation } from '@/hooks/useInbox'

type Contact = Conversation['contact']

interface Props {
  contact: Contact | null
}

export function ContactPanel({ contact }: Props) {
  if (!contact) {
    return (
      <aside className="w-[320px] border-l flex items-center justify-center text-muted-foreground text-sm shrink-0" />
    )
  }

  return (
    <aside className="w-[320px] border-l flex flex-col overflow-y-auto shrink-0">
      <div className="px-4 py-3 border-b font-semibold text-sm">Perfil del contacto</div>
      <div className="px-4 py-4 flex flex-col items-center gap-2">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-xl font-bold uppercase">
          {contact.name.charAt(0)}
        </div>
        <p className="font-semibold text-sm">{contact.name}</p>
        {contact.phone && (
          <p className="text-xs text-muted-foreground">{contact.phone}</p>
        )}
      </div>
      <div className="px-4 py-2 border-t">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">
          Integración CRM
        </p>
        <p className="text-xs text-muted-foreground">Disponible en Fase 3</p>
      </div>
    </aside>
  )
}
