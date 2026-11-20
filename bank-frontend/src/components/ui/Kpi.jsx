import { ArrowUpRight as Trend } from 'lucide-react'

export default function Kpi({ icon: Icon, label, value, trend = '12,8 %', tone = '' }) {
  return (
    <article className="kpi card">
      <div className="kpi-top">
        <span>{label}</span>
        <span className={`kpi-icon ${tone}`}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>
        <span className="positive">
          <Trend size={13} /> {trend}
        </span>{' '}
        vs période précédente
      </small>
    </article>
  )
}
