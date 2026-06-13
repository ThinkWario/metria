'use client'
import type { Conversation } from '@/hooks/useInbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { LeadQualificationBadge } from '@/components/crm/LeadQualificationBadge'
import { DollarSign, Mail, Phone, Calendar, Info, ShieldCheck, Tag } from 'lucide-react'

type Contact = Conversation['contact']

const STATUS_COLOR: Record<string, string> = {
  LEAD: 'bg-blue-500/10 text-blue-500',
  PROSPECT: 'bg-purple-500/10 text-purple-500',
  CUSTOMER: 'bg-emerald-500/10 text-emerald-500',
  VIP: 'bg-amber-500/10 text-amber-500',
}

interface Props {
  contact: Contact | null
}

export function ContactPanel({ contact }: Props) {
  if (!contact) {
    return (
      <aside className="w-[320px] bg-card/10 backdrop-blur-xl border-l border-border/40 flex items-center justify-center text-muted-foreground text-sm shrink-0" />
    )
  }

  return (
    <aside className="w-[340px] bg-card/50 backdrop-blur-2xl border-l border-border/40 flex flex-col overflow-y-auto shrink-0 animate-in slide-in-from-right duration-500">
      <div className="px-6 py-6 border-b border-border/40 flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Perfil del Cliente</h3>
        <Badge variant="outline" className="rounded-lg border-blue-500/20 text-blue-500 text-[10px] font-black uppercase">Verificado</Badge>
      </div>

      <div className="px-6 py-8 flex flex-col items-center text-center">
        <Avatar className="h-24 w-24 border-4 border-background shadow-2xl mb-4 hover:scale-105 transition-transform duration-300">
          <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${contact.email || contact.id}`} />
          <AvatarFallback className="text-2xl font-black">{contact.name.charAt(0)}</AvatarFallback>
        </Avatar>
        
        <div className="flex items-center gap-2 mb-1">
            <h4 className="text-lg font-black text-foreground">{contact.name}</h4>
            <ShieldCheck className="w-4 h-4 text-blue-500" />
        </div>
        
        <Badge className={`rounded-full px-3 py-1 font-black text-[10px] uppercase tracking-wider mb-3 border-none ${STATUS_COLOR[contact.status] || 'bg-muted text-muted-foreground'}`}>
            {contact.status}
        </Badge>

        <div className="mb-6 flex justify-center">
            <LeadQualificationBadge
                temperature={contact.leadTemperature}
                type={contact.leadType}
                score={contact.leadScore}
            />
        </div>

        <div className="grid grid-cols-2 gap-3 w-full">
            <Card className="bg-background/40 border-border/40 rounded-2xl shadow-inner">
                <CardContent className="p-4 flex flex-col items-center">
                    <DollarSign className="w-4 h-4 text-emerald-500 mb-1" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">LTV</span>
                    <span className="text-sm font-black text-foreground">${Number(contact.ltv).toLocaleString()}</span>
                </CardContent>
            </Card>
            <Card className="bg-background/40 border-border/40 rounded-2xl shadow-inner">
                <CardContent className="p-4 flex flex-col items-center">
                    <Tag className="w-4 h-4 text-primary mb-1" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Origen</span>
                    <span className="text-xs font-black text-foreground truncate w-full uppercase">{contact.source}</span>
                </CardContent>
            </Card>
        </div>
      </div>

      <div className="px-6 py-4 space-y-6">
        <div className="space-y-4">
            <div className="flex items-center gap-3 group">
                <div className="p-2 rounded-xl bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <Mail className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[9px] font-black text-muted-foreground uppercase">Email</span>
                    <span className="text-xs font-medium text-foreground truncate max-w-[180px]">{contact.email || 'No proporcionado'}</span>
                </div>
            </div>

            <div className="flex items-center gap-3 group">
                <div className="p-2 rounded-xl bg-muted/50 text-muted-foreground group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-colors">
                    <Phone className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[9px] font-black text-muted-foreground uppercase">Teléfono</span>
                    <span className="text-xs font-medium text-foreground">{contact.phone?.split('@')[0] || 'No proporcionado'}</span>
                </div>
            </div>

            <div className="flex items-center gap-3 group">
                <div className="p-2 rounded-xl bg-muted/50 text-muted-foreground group-hover:bg-amber-500/10 group-hover:text-amber-500 transition-colors">
                    <Calendar className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[9px] font-black text-muted-foreground uppercase">Última Compra</span>
                    <span className="text-xs font-medium text-foreground">Hace 2 días</span>
                </div>
            </div>
        </div>

        <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-2">
            <div className="flex items-center gap-2 text-primary">
                <Info className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase tracking-tighter">Nota del Sistema</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                "Este cliente suele comprar productos de la categoría Hogar durante los fines de semana."
            </p>
        </div>
      </div>
    </aside>
  )
}
