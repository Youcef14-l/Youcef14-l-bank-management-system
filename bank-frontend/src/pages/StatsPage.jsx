import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  Landmark,
  CalendarDays
} from 'lucide-react'

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import { PageHeader, Badge, Button, Kpi } from '../components/ui.jsx'
import {
  getStatistics,
  formatAmount,
  formatCompact,
  currencySymbol,
  CURRENCIES,
  TYPE_LABELS
} from '../lib/statisticsApi.js'
import { describeError } from '../lib/errorMessages.js'

const RANGES = [
  { key: '7d', label: '7 derniers jours', days: 7 },
  { key: '30d', label: '30 derniers jours', days: 30 },
  { key: '90d', label: '90 derniers jours', days: 90 },
  { key: 'year', label: 'Cette année' },
  { key: 'custom', label: 'Période personnalisée' }
]

const COLORS = ['#12845f', '#5291d7', '#e5a23d']
const DOTS = ['green', 'blue', 'amber']

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const endOfDay = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
const parseLocalDate = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function buildPeriod(key, custom) {
  const now = new Date()
  if (key === 'custom') {
    if (!custom.from || !custom.to) return null
    return {
      from: startOfDay(parseLocalDate(custom.from)).toISOString(),
      to: endOfDay(parseLocalDate(custom.to)).toISOString()
    }
  }
  if (key === 'year') {
    return {
      from: new Date(now.getFullYear(), 0, 1).toISOString(),
      to: endOfDay(now).toISOString()
    }
  }
  const { days } = RANGES.find((r) => r.key === key)
  const start = startOfDay(now)
  start.setDate(start.getDate() - (days - 1))
  return { from: start.toISOString(), to: endOfDay(now).toISOString() }
}

const shortDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short'
  })
}

export default function StatsPage() {
  const [currency, setCurrency] = useState(CURRENCIES[0])
  const [rangeKey, setRangeKey] = useState('30d')
  const [applied, setApplied] = useState({ from: '', to: '' })
  const [draft, setDraft] = useState({ from: '', to: '' })
  const [menuOpen, setMenuOpen] = useState(false)

  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const requestId = useRef(0)

  const period = useMemo(
    () => buildPeriod(rangeKey, applied),
    [rangeKey, applied]
  )

  const load = useCallback(async () => {
    if (!period) return
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const data = await getStatistics({
        from: period.from,
        to: period.to,
        tzOffset: new Date().getTimezoneOffset()
      })
      if (id !== requestId.current) return
      setStats(data)
    } catch (err) {
      if (id !== requestId.current) return
      setStats(null)
      setError(describeError(err))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [period])

  useEffect(() => {
    load()
  }, [load])

  const currentLabel =
    rangeKey === 'custom' && applied.from && applied.to
      ? `${applied.from} → ${applied.to}`
      : RANGES.find((r) => r.key === rangeKey).label

  const draftInvalid =
    !draft.from || !draft.to || draft.from > draft.to

  const selectRange = (key) => {
    if (key === 'custom') return // handled by the inputs below
    setRangeKey(key)
    setMenuOpen(false)
  }

  const applyCustom = () => {
    if (draftInvalid) return
    setApplied(draft)
    setRangeKey('custom')
    setMenuOpen(false)
  }

  const rangeSelector = (
    <div className="range-picker">
      <Button variant="outline" onClick={() => setMenuOpen((o) => !o)}>
        <CalendarDays />
        {currentLabel}
        <ChevronDown />
      </Button>

      {menuOpen && (
        <div className="range-menu card">
          {RANGES.filter((r) => r.key !== 'custom').map((r) => (
            <button
              key={r.key}
              type="button"
              className={rangeKey === r.key ? 'active' : ''}
              onClick={() => selectRange(r.key)}
            >
              {r.label}
            </button>
          ))}

          <div className="range-custom">
            <span>Période personnalisée</span>
            <input
              type="date"
              value={draft.from}
              max={draft.to || undefined}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
            <input
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
            {draft.from && draft.to && draft.from > draft.to && (
              <small className="range-error">
                La date de début doit précéder la date de fin.
              </small>
            )}
            <Button disabled={draftInvalid} onClick={applyCustom}>
              Appliquer
            </Button>
          </div>
        </div>
      )}
    </div>
  )

  // One tab per currency: amounts in different currencies are never mixed.
  const currencySelector = (
    <div style={{ display: 'flex', gap: 8 }}>
      {CURRENCIES.map((c) => (
        <Button
          key={c}
          variant={currency === c ? undefined : 'outline'}
          onClick={() => setCurrency(c)}
        >
          {c}
        </Button>
      ))}
    </div>
  )

  const header = (
    <PageHeader
      title="Statistiques"
      description="Suivez l’activité et les flux de votre agence."
      action={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {currencySelector}
          {rangeSelector}
        </div>
      }
    />
  )

  if (loading && !stats) {
    return (
      <>
        {header}
        <section className="card list-card">
          <p className="empty-state">Chargement des statistiques…</p>
        </section>
      </>
    )
  }

  if (error) {
    return (
      <>
        {header}
        <section className="card list-card">
          <p className="empty-state">{error}</p>
          <Button variant="outline" onClick={load}>
            Réessayer
          </Button>
        </section>
      </>
    )
  }

  if (!stats) return <>{header}</>

  const { kpis, byType, netFlow } = stats.byCurrency[currency]
  const symbol = currencySymbol(currency)
  const money = (v) => formatAmount(v, currency)
  const volume = Number(kpis.totalVolume)
  const pie = byType.map((d) => ({
    name: TYPE_LABELS[d.type],
    count: d.count,
    total: Number(d.total),
    raw: d.total
  }))
  const flowData = netFlow.map((d) => ({
    name: shortDate(d.date),
    v: Number(d.cumulativeNet),
    raw: d.cumulativeNet
  }))
  const net = Number(kpis.netExternalFlow)
  const pct = (v) =>
    volume > 0 ? `${((v / volume) * 100).toFixed(1).replace('.', ',')} %` : '0 %'

  return (
    <>
      {header}

      <div className="kpi-grid stats-kpis" style={{ opacity: loading ? 0.6 : 1 }}>
        <Kpi
          icon={ArrowDownLeft}
          label="Total dépôts"
          value={money(kpis.totalDeposits)}
        />
        <Kpi
          icon={ArrowUpRight}
          label="Total retraits"
          value={money(kpis.totalWithdrawals)}
          tone="blue"
        />
        <Kpi
          icon={ArrowLeftRight}
          label="Total virements"
          value={money(kpis.totalTransfers)}
          tone="amber"
        />
        <Kpi
          icon={Landmark}
          label="Frais perçus"
          value={money(kpis.totalFees)}
          tone="mint"
        />
      </div>

      <section className="charts-grid stats-charts">
        <article className="card chart-card wide">
          <div className="card-heading">
            <div>
              <h2>Flux net cumulé</h2>
              <p>Évolution des entrées et sorties</p>
            </div>

            <Badge type="actif">
              {net >= 0 ? '+ ' : '- '}
              {formatCompact(Math.abs(net))} {symbol}
            </Badge>
          </div>

          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={flowData}>
                <defs>
                  <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#12845f" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#12845f" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 5"
                  stroke="var(--line)"
                />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCompact(v)}
                />
                <Tooltip
                  formatter={(v, _n, item) => [
                    money(item?.payload?.raw ?? v),
                    'Flux net'
                  ]}
                />
                <Area
                  dataKey="v"
                  stroke="#12845f"
                  fill="url(#fill)"
                  strokeWidth={2}
                  name="Flux net"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card chart-card">
          <div className="card-heading">
            <div>
              <h2>Répartition par type</h2>
              <p>Montant des opérations</p>
            </div>
          </div>

          <div className="donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={volume > 0 ? pie : []}
                  dataKey="total"
                  innerRadius={67}
                  outerRadius={91}
                  paddingAngle={4}
                >
                  {pie.map((d, i) => (
                    <Cell key={d.name} fill={COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, _n, item) => money(item?.payload?.raw ?? v)} />
              </PieChart>
            </ResponsiveContainer>

            <div className="donut-label">
              <b>{formatCompact(kpis.totalVolume)}</b>
              <span>{symbol} traités</span>
            </div>
          </div>

          <div className="donut-legend">
            {pie.map((d, i) => (
              <span key={d.name}>
                <i className={`dot ${DOTS[i]}`} />
                {d.name}
                <b>{pct(d.total)}</b>
              </span>
            ))}
          </div>
        </article>
      </section>

      <section className="card list-card summary-table">
        <div className="card-heading">
          <div>
            <h2>Récapitulatif par type</h2>
            <p>Pour la période sélectionnée</p>
          </div>
        </div>

        {kpis.totalTransactions === 0 && (
          <p className="empty-state">
            Aucune opération en {currency} sur la période sélectionnée.
          </p>
        )}

        <table>
          <thead>
            <tr>
              <th>TYPE</th>
              <th>NOMBRE</th>
              <th>MONTANT TOTAL</th>
              <th>MONTANT MOYEN</th>
              <th>PLUS GRANDE OPÉRATION</th>
            </tr>
          </thead>

          <tbody>
            {byType.map((d) => (
              <tr key={d.type}>
                <td><b>{TYPE_LABELS[d.type]}</b></td>
                <td>{d.count}</td>
                <td>{money(d.total)}</td>
                <td>{money(d.average)}</td>
                <td>{money(d.maximum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}