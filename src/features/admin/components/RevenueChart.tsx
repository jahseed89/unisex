import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatDate, formatNaira } from '@/lib/utils/format'
import type { DashboardSeriesPoint } from '@/types'

/**
 * Revenue over the selected window, split by source.
 *
 * `DashboardStats.series` is one row per day inside the range, so the chart
 * length follows the date-range selector rather than being resampled here.
 */

interface TooltipEntry {
  dataKey?: string | number
  value?: number | string
}

const SERIES = [
  { key: 'service_revenue', label: 'Services', stroke: '#a98467', fill: '#a98467' },
  { key: 'product_revenue', label: 'Products', stroke: '#b5714f', fill: '#b5714f' },
] as const

const AXIS_TICK = { fontSize: 11, fill: '#6f655d' }

function axisDay(value: string): string {
  // Appended so the yyyy-MM-dd key parses as local midnight, not UTC.
  return formatDate(`${value}T00:00:00`, 'd MMM')
}

function RevenueTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null

  const total = payload.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0)

  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2.5 shadow-md">
      <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
        {label ? axisDay(label) : ''}
      </p>
      <ul className="mt-2 space-y-1">
        {SERIES.map((series) => {
          const entry = payload.find((item) => item.dataKey === series.key)
          return (
            <li key={series.key} className="flex items-center gap-2 text-xs">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: series.stroke }}
                aria-hidden
              />
              <span className="text-muted">{series.label}</span>
              <span className="ml-auto font-medium tabular-nums text-ink">
                {formatNaira(Number(entry?.value ?? 0))}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-2 text-xs">
        <span className="text-muted">Total</span>
        <span className="font-semibold tabular-nums text-ink">{formatNaira(total)}</span>
      </p>
    </div>
  )
}

export function RevenueChart({ data }: { data: DashboardSeriesPoint[] }) {
  const summary = useMemo(() => {
    const hasService = data.some((point) => Number(point.service_revenue) > 0)
    const hasProduct = data.some((point) => Number(point.product_revenue) > 0)
    return { hasService, hasProduct }
  }, [data])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {SERIES.map((series) => {
          const visible =
            series.key === 'service_revenue' ? summary.hasService : summary.hasProduct
          if (!visible) return null
          return (
            <span key={series.key} className="flex items-center gap-2 text-xs text-muted">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: series.stroke }}
                aria-hidden
              />
              {series.label} revenue
            </span>
          )
        })}
        <span className="ml-auto text-xs text-muted">{data.length} days</span>
      </div>

      <div
        className="h-[260px] w-full"
        role="img"
        aria-label={`Daily revenue for the last ${data.length} days, split between services and products. The same figures are listed below the chart.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {SERIES.map((series) => (
                <linearGradient key={series.key} id={`grad-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={series.fill} stopOpacity={0.38} />
                  <stop offset="100%" stopColor={series.fill} stopOpacity={0.03} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid stroke="#e6ddd2" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickFormatter={axisDay}
              minTickGap={28}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              width={62}
              tickFormatter={(value: number) => formatNaira(value, { compact: true })}
            />
            <Tooltip content={<RevenueTooltip />} cursor={{ stroke: '#d4c7b8' }} />

            {SERIES.map((series) => {
              const visible =
                series.key === 'service_revenue' ? summary.hasService : summary.hasProduct
              if (!visible) return null
              return (
                <Area
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={series.stroke}
                  strokeWidth={2}
                  fill={`url(#grad-${series.key})`}
                  activeDot={{ r: 3.5 }}
                />
              )
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
