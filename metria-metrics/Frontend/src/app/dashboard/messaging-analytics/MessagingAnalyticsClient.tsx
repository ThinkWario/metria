'use client'
import { useState, useEffect } from 'react'
import { fetchAPI } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Sparkles } from 'lucide-react'

interface Snapshot {
  id: string
  date: string
  channelId: string
  totalInbound: number
  totalOutbound: number
  newContacts: number
  conversationsOpened: number
  conversationsResolved: number
  botHandledCount: number
  botResolvedCount: number
  humanHandoffCount: number
  dealsCreated: number
  dealsWon: number
  dealsWonValue: number
  channel: { id: string; name: string; platform: string }
}

interface FunnelSummary {
  totalInbound: number
  totalOutbound: number
  newContacts: number
  conversationsOpened: number
  conversationsResolved: number
  botHandledCount: number
  botResolvedCount: number
  humanHandoffCount: number
  dealsCreated: number
  dealsWon: number
  dealsWonValue: number
  avgResolutionRate: number
  avgResponseSeconds: number
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function convRate(num: number, den: number): string {
  if (den === 0) return '—'
  return `${Math.round((num / den) * 100)}%`
}

export default function MessagingAnalyticsClient() {
  const [mounted, setMounted] = useState(false)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [summary, setSummary] = useState<FunnelSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [snapshotsData, funnelData] = await Promise.all([
          fetchAPI('/analytics/snapshots?days=30'),
          fetchAPI('/analytics/funnel?days=30'),
        ])
        setSnapshots(Array.isArray(snapshotsData?.snapshots) ? snapshotsData.snapshots : [])
        setSummary(funnelData?.summary ?? null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [mounted])

  if (!mounted) {
    return null
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-xl bg-muted/40 animate-pulse" />
        <div className="h-48 rounded-xl bg-muted/40 animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      </div>
    )
  }

  const s = summary ?? {
    totalInbound: 0,
    totalOutbound: 0,
    newContacts: 0,
    conversationsOpened: 0,
    conversationsResolved: 0,
    botHandledCount: 0,
    botResolvedCount: 0,
    humanHandoffCount: 0,
    dealsCreated: 0,
    dealsWon: 0,
    dealsWonValue: 0,
    avgResolutionRate: 0,
    avgResponseSeconds: 0,
  }

  const kpiCards = [
    { label: 'Messages In', value: s.totalInbound.toLocaleString() },
    { label: 'New Contacts', value: s.newContacts.toLocaleString() },
    { label: 'Chats Opened', value: s.conversationsOpened.toLocaleString() },
    { label: 'AI Responses', value: s.botHandledCount.toLocaleString(), highlight: true },
    { label: 'AI Resolution', value: convRate(s.botResolvedCount, s.botHandledCount), highlight: true },
    { label: 'Revenue Won', value: formatCurrency(s.dealsWonValue) },
  ]

  const chartData = (() => {
    const byDate = new Map<string, { date: string; opened: number; resolved: number; ai: number }>()
    for (const snap of snapshots) {
      const d = snap.date.slice(0, 10)
      const existing = byDate.get(d) ?? { date: d, opened: 0, resolved: 0, ai: 0 }
      existing.opened += snap.conversationsOpened
      existing.resolved += snap.conversationsResolved
      existing.ai += snap.botHandledCount
      byDate.set(d, existing)
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  })()

  const funnelRows: { label: string; value: string | number; rate: string }[] = [
    { label: 'New Contacts', value: s.newContacts, rate: '—' },
    { label: 'Chats Opened', value: s.conversationsOpened, rate: convRate(s.conversationsOpened, s.newContacts) },
    { label: 'AI Handled', value: s.botHandledCount, rate: convRate(s.botHandledCount, s.conversationsOpened) },
    { label: 'Human Handoffs', value: s.humanHandoffCount, rate: convRate(s.humanHandoffCount, s.botHandledCount) },
    { label: 'Deals Created', value: s.dealsCreated, rate: convRate(s.dealsCreated, s.conversationsOpened) },
    { label: 'Deals Won', value: s.dealsWon, rate: convRate(s.dealsWon, s.dealsCreated) },
    { label: 'Revenue', value: formatCurrency(s.dealsWonValue), rate: formatSeconds(s.avgResponseSeconds) },
  ]

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messaging Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Last 30 days</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className={cn(
              "rounded-xl border bg-card p-4 space-y-1 shadow-sm",
              (card as any).highlight && "border-primary/20 bg-primary/5"
            )}
          >
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              {(card as any).highlight && <Sparkles className="w-3 h-3 text-primary" />}
              {card.label}
            </p>
            <p className="text-xl font-bold tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Stacked Area Chart */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold mb-4">Activity Over Time</h2>
        {chartData.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
            No data yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorOpened" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => v.slice(5)}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                labelFormatter={(v) => typeof v === 'string' ? v.slice(5) : v}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="opened"
                name="Chats Opened"
                stroke="#3b82f6"
                fill="url(#colorOpened)"
                strokeWidth={2}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="resolved"
                name="Chats Resolved"
                stroke="#22c55e"
                fill="url(#colorResolved)"
                strokeWidth={2}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="ai"
                name="AI Responses"
                stroke="#6366f1"
                fill="url(#colorAi)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Attribution Funnel Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Attribution Funnel</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Stage</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Value</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Conv. / Metric</th>
            </tr>
          </thead>
          <tbody>
            {funnelRows.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? '' : 'bg-muted/10'}>
                <td className="px-4 py-2 font-medium">{row.label}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.value}</td>
                <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">{row.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
