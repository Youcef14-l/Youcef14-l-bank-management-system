import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from 'lucide-react'
import Badge from './Badge.jsx'

export default function OperationsTable({ data, compact = false }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>OPÉRATION</th>
            {!compact && <th>COMPTE</th>}
            <th>DATE</th>
            <th>MONTANT</th>
            <th>STATUT</th>
          </tr>
        </thead>
        <tbody>
          {data.map((operation) => (
            <tr key={operation.reference}>
              <td>
                <div className="operation-name">
                  <span className={`op-icon ${operation.type.toLowerCase()}`}>
                    {operation.type === 'DEPOT' ? <ArrowDownLeft /> : operation.type === 'RETRAIT' ? <ArrowUpRight /> : <ArrowLeftRight />}
                  </span>
                  <span>
                    <b>{operation.type === 'DEPOT' ? 'Dépôt' : operation.type === 'RETRAIT' ? 'Retrait' : 'Virement'}</b>
                    <small>{operation.description}</small>
                  </span>
                </div>
              </td>
              {!compact && <td className="mono">{operation.account}</td>}
              <td>
                {formatDate(operation.date)}
                <small className="table-sub">
                  {operation.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </small>
              </td>
              <td className={`amount ${operation.type === 'DEPOT' ? 'positive' : 'negative'}`}>
                {operation.type === 'DEPOT' ? '+' : '−'} {formatMontant(operation.amount)}
              </td>
              <td><Badge type="actif">Terminé</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
