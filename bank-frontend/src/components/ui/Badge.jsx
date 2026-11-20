export default function Badge({ children, type = '' }) {
  return <span className={`badge ${type.toLowerCase()}`}>{children}</span>
}
