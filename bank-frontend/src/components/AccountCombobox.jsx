import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import './AccountCombobox.css'

const normalize = (value) => String(value ?? '').toLocaleLowerCase('fr')
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`

// Wraps the part of the text that matches what the user typed.
function Highlight({ text, query }) {
  const q = query.trim()
  if (!q) return text
  const index = normalize(text).indexOf(normalize(q))
  if (index === -1) return text
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  )
}

/**
 * options: [{ value, label, title, subtitle, searchText }]
 * onQueryChange: called on every keystroke so the parent can run its server-side search.
 */
export default function AccountCombobox({
  label,
  value,
  options,
  onChange,
  onQueryChange,
  placeholder = 'Rechercher par numéro de compte…',
  searching = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  total,
}) {
  const id = useId()
  const listId = `${id}-list`
  const rootRef = useRef(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)

  const selected = options.find((option) => option.value === value) ?? null

  // Instant client-side filtering of what is already loaded; the parent's server search
  // then replaces the list with the exact matches.
  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return options
    return options.filter((option) => normalize(`${option.label} ${option.searchText ?? ''}`).includes(q))
  }, [options, query])

  const active = Math.min(highlighted, Math.max(filtered.length - 1, 0))

  const resetQuery = () => {
    setQuery('')
    onQueryChange?.('')
  }

  const close = () => {
    setOpen(false)
    resetQuery()
  }

  const openList = () => {
    if (open) return
    const index = options.findIndex((option) => option.value === value)
    setHighlighted(Math.max(index, 0))
    setOpen(true)
  }

  const select = (option) => {
    onChange(option.value)
    setOpen(false)
    resetQuery()
  }

  // Click outside = close.
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
        setQuery('')
        onQueryChange?.('')
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, onQueryChange])

  // Keep the highlighted row visible when navigating with the keyboard.
  useEffect(() => {
    if (!open) return
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, id])

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) openList()
      else setHighlighted(Math.min(active + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (open) setHighlighted(Math.max(active - 1, 0))
    } else if (event.key === 'Enter') {
      if (open && filtered[active]) {
        event.preventDefault()
        select(filtered[active])
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        close()
      }
    } else if (event.key === 'Tab') {
      if (open) close()
    }
  }

  return (
    <div className="account-combobox" ref={rootRef}>
      <label className="field-label" htmlFor={id}>{label}</label>

      <div className="account-combobox-input">
        <Search className="account-combobox-icon" aria-hidden="true" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={open ? query : selected?.label ?? ''}
          placeholder={open && selected ? selected.title : placeholder}
          onFocus={openList}
          onClick={openList}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            setQuery(event.target.value)
            onQueryChange?.(event.target.value)
            setHighlighted(0)
            setOpen(true)
          }}
        />
        <ChevronDown className={`account-combobox-chevron${open ? ' open' : ''}`} aria-hidden="true" />
      </div>

      {open && (
        // preventDefault on mousedown keeps focus in the input while clicking inside the list.
        <div className="account-combobox-popover" onMouseDown={(event) => event.preventDefault()}>
          {filtered.length > 0 && (
            <ul id={listId} role="listbox" aria-label={label} className="account-combobox-list">
              {filtered.map((option, index) => {
                const isSelected = option.value === value
                return (
                  <li
                    key={option.value}
                    id={`${id}-opt-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`account-combobox-option${index === active ? ' highlighted' : ''}${isSelected ? ' selected' : ''}`}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => select(option)}
                  >
                    <span className="account-combobox-text">
                      <b><Highlight text={option.title} query={query} /></b>
                      <small><Highlight text={option.subtitle} query={query} /></small>
                    </span>
                    {isSelected && <Check size={16} aria-hidden="true" />}
                  </li>
                )
              })}
            </ul>
          )}

          {filtered.length === 0 && (
            <div className="account-combobox-empty" id={listId} role="status">
              {searching ? 'Recherche en cours…' : 'Aucun compte actif ne correspond à cette recherche.'}
            </div>
          )}

          {(typeof total === 'number' || hasMore) && (
            <div className="account-combobox-footer">
              <span>
                {typeof total === 'number'
                  ? `${plural(filtered.length, 'affiché')} sur ${plural(total, 'compte')} actif${total > 1 ? 's' : ''}`
                  : ''}
              </span>
              {hasMore && (
                <button type="button" disabled={loadingMore} onClick={onLoadMore}>
                  {loadingMore ? 'Chargement…' : 'Charger plus'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}