'use client'

import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, DollarSign, LayoutList } from 'lucide-react'
import { getPipelineForecast } from '@/lib/crm-forecast-api'

function formatCLP(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'K'
  return '$' + Math.round(n).toLocaleString('es-CL')
}

const STATUS_BADGE: Record<string, string> = {
  WON: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  LOST: 'bg-red-500/15 text-red-500 border-red-500/30',
  OPEN: 'bg-sky-500/15 text-sky-400 border-sky-500/30'
}

export function PipelineForecast() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pipeline-forecast'],
    queryFn: getPipelineForecast,
    staleTime: 2 * 60_000
  })

  if (isLoading) return <PipelineForecastSkeleton />
  if (isError || !data) return null

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2 shrink-0">
              <DollarSign className="h-5 w-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Pipeline total</p>
              <p className="text-xl font-semibold tabular-nums">{formatCLP(data.totalValue)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-violet-500/10 p-2 shrink-0">
              <TrendingUp className="h-5 w-5 text-violet-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Pronóstico ponderado</p>
              <p className="text-xl font-semibold tabular-nums">{formatCLP(data.weightedValue)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 shrink-0">
              <LayoutList className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Deals activos</p>
              <p className="text-xl font-semibold tabular-nums">{data.totalDeals}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Top deals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium">Pronóstico 3 meses</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={data.forecast3Months} barSize={32}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  formatter={(value: number | undefined) => [formatCLP(value ?? 0), 'Ponderado']}
                  cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="weighted" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium">Top oportunidades</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {data.topDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sin deals activos</p>
            ) : (
              <ul className="space-y-2">
                {data.topDeals.map(deal => (
                  <li key={deal.id} className="flex items-center justify-between gap-2 py-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{deal.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{deal.stage}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-sm font-semibold tabular-nums">{formatCLP(deal.value)}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {deal.probability}%
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${STATUS_BADGE[deal.status] ?? ''}`}
                      >
                        {deal.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PipelineForecastSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-7 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card><CardContent className="p-4"><Skeleton className="h-[140px] w-full" /></CardContent></Card>
        <Card><CardContent className="p-4 space-y-2">
          {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
        </CardContent></Card>
      </div>
    </div>
  )
}
