import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

export default function SearchableSelect({ label, value, onChange, options, searchLabel, placeholder = 'Rechercher…' }) {
  const [query, setQuery] = useState('')
  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr')
    const matches = options.filter((option) => `${option.label} ${option.searchText || ''}`.toLocaleLowerCase('fr').includes(normalizedQuery))
    const selectedOption = options.find((option) => option.value === value)
    return selectedOption && !matches.some((option) => option.value === selectedOption.value)
      ? [selectedOption, ...matches]
      : matches
  }, [options, query, value])

  return (
    <label className="field-label">
      {label}
      <span className="searchable-select-search">
        <Search aria-hidden="true" />
        <input
          aria-label={searchLabel}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
        />
      </span>
      <select className="field-control" value={value} onChange={(event) => onChange(event.target.value)}>
        {visibleOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}
