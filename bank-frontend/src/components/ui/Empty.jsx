import { Search } from 'lucide-react'

export default function Empty({ title, text, action }) {
  return (
    <div className="empty-state">
      <span><Search /></span>
      <b>{title}</b>
      <p>{text}</p>
      {action}
    </div>
  )
}
