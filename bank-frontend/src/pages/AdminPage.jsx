import { useEffect, useState } from 'react'
import { KeyRound, Loader2, Plus, Search, Shield, UserRoundCog, X } from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import {
  createEmployee,
  deactivateEmployee,
  getEmployees,
  getErrorMessage,
  getRoles,
  normalizePagination,
  reactivateEmployee,
  resetEmployeePassword,
  roleLabel,
  updateEmployee,
} from '../lib/employeeApi.js'

const PAGE_SIZE = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMPLOYEE_NUMBER_RE = /^[A-Za-z0-9-]{3,20}$/

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  employeeNumber: '',
  phone: '',
  password: '',
  roleId: '',
}

function validatePassword(password) {
  if (password.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Le mot de passe doit contenir au moins une lettre et un chiffre.'
  }
  return ''
}

function validateForm(form) {
  const errors = {}
  if (!form.firstName.trim()) errors.firstName = 'Prénom requis.'
  if (!form.lastName.trim()) errors.lastName = 'Nom requis.'
  if (!EMAIL_RE.test(form.email.trim())) errors.email = 'Adresse email invalide.'
  if (!EMPLOYEE_NUMBER_RE.test(form.employeeNumber.trim())) {
    errors.employeeNumber = '3 à 20 caractères : lettres, chiffres ou tirets.'
  }
  const passwordError = validatePassword(form.password)
  if (passwordError) errors.password = passwordError
  if (!form.roleId) errors.roleId = 'Choisissez un rôle.'
  return errors
}

function ResetPasswordModal({ employee, onClose, onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const submit = async (event) => {
    event.preventDefault()
    const passwordError = validatePassword(password)
    if (passwordError) return setError(passwordError)
    if (password !== confirm) return setError('Les mots de passe ne correspondent pas.')

    setSubmitting(true)
    setError('')
    try {
      await resetEmployeePassword(employee.id, password)
      onDone()
    } catch (err) {
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose() }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <div className="modal-head">
          <div>
            <h2 id="reset-title">Réinitialiser le mot de passe</h2>
            <p>{employee.firstName} {employee.lastName} · {employee.employeeNumber}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} disabled={submitting} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        <form className="modal-form" onSubmit={submit}>
          <label>Nouveau mot de passe
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </label>
          <label>Confirmer le mot de passe
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <small className="field-hint">Minimum 8 caractères, avec au moins une lettre et un chiffre.</small>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="text-action" onClick={onClose} disabled={submitting}>Annuler</button>
            <button type="submit" className="text-action" disabled={submitting}>
              {submitting ? <><Loader2 size={15} className="spin" /> Envoi…</> : <><KeyRound size={15} /> Réinitialiser</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [employees, setEmployees] = useState([])
  const [pagination, setPagination] = useState({ page: 1, total: null, totalPages: null, hasNext: false, hasPrev: false })
  const [roles, setRoles] = useState([])
  const [rolesError, setRolesError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)

  const [form, setForm] = useState(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState({})
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'success' | 'error', text }
  const [busy, setBusy] = useState({})
  const [resetTarget, setResetTarget] = useState(null)

  const refresh = () => setReloadKey((key) => key + 1)

  // Roles: fetched once from the backend (real UUIDs, never hardcoded)
  useEffect(() => {
    let cancelled = false
    getRoles()
      .then((list) => { if (!cancelled) setRoles(list) })
      .catch((err) => { if (!cancelled) setRolesError(getErrorMessage(err)) })
    return () => { cancelled = true }
  }, [])

  // Default role in the creation form once roles are available
  useEffect(() => {
    if (roles.length && !form.roleId) {
      const defaultRole = roles.find((role) => role.name === 'CAISSIER') ?? roles[0]
      setForm((current) => ({ ...current, roleId: defaultRole.id }))
    }
  }, [roles, form.roleId])

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  // Employees: server-side search, filters and pagination
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')

    getEmployees({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch,
      roleId: roleFilter,
      isActive: statusFilter === 'all' ? undefined : statusFilter === 'active' ? 'true' : 'false',
    })
      .then(({ employees: list, meta }) => {
        if (cancelled) return
        if (list.length === 0 && page > 1) {
          setPage(page - 1)
          return
        }
        setEmployees(list)
        setPagination(normalizePagination(meta, { page, limit: PAGE_SIZE, count: list.length }))
      })
      .catch((err) => { if (!cancelled) setLoadError(getErrorMessage(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [page, debouncedSearch, roleFilter, statusFilter, reloadKey])

  const hasFilters = Boolean(debouncedSearch || roleFilter || statusFilter !== 'all')
  const totalEmployees = pagination.total ?? employees.length

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    if (formErrors[field]) setFormErrors((current) => ({ ...current, [field]: undefined }))
  }

  const addStaff = async (event) => {
    event.preventDefault()
    setMessage(null)

    const errors = validateForm(form)
    setFormErrors(errors)
    if (Object.keys(errors).length) {
      setMessage({ type: 'error', text: 'Veuillez corriger les champs signalés.' })
      return
    }

    const role = roles.find((item) => item.id === form.roleId)
    if (!role) {
      setMessage({ type: 'error', text: 'Le rôle sélectionné est introuvable. Rechargez la page.' })
      return
    }

    const body = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim().toLowerCase(),
      employeeNumber: form.employeeNumber.trim(),
      password: form.password,
      roleId: role.id,
    }
    if (form.phone.trim()) body.phone = form.phone.trim()

    setCreating(true)
    try {
      await createEmployee(body)
      setMessage({ type: 'success', text: `Employé ${body.firstName} ${body.lastName} créé avec succès.` })
      setForm({ ...EMPTY_FORM, roleId: role.id })
      setFormErrors({})
      if (page === 1) refresh()
      else setPage(1)
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err) })
    } finally {
      setCreating(false)
    }
  }

  // Runs one row action with per-row loading state and error feedback
  const runAction = async (id, action, successText) => {
    setBusy((current) => ({ ...current, [id]: true }))
    setMessage(null)
    try {
      const data = await action()
      setMessage({ type: 'success', text: successText })
      return { ok: true, data }
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err) })
      return { ok: false }
    } finally {
      setBusy((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    }
  }

  const changeRole = async (employee, roleId) => {
    if (roleId === employee.role?.id) return
    const role = roles.find((item) => item.id === roleId)
    if (!role) return

    // The select is controlled by `employee.role.id`, so if the request fails
    // the previous selection is automatically restored.
    const result = await runAction(
      employee.id,
      () => updateEmployee(employee.id, { roleId }),
      `Rôle de ${employee.firstName} ${employee.lastName} : ${roleLabel(role.name)}.`,
    )
    if (result.ok) {
      const patch = result.data && typeof result.data === 'object' ? result.data : {}
      setEmployees((current) => current.map((item) => (
        item.id === employee.id ? { ...item, ...patch, role: { id: role.id, name: role.name } } : item
      )))
      refresh()
    }
  }

  const toggleActive = async (employee) => {
    const name = `${employee.firstName} ${employee.lastName}`
    if (employee.isActive) {
      if (!window.confirm(`Désactiver l’accès de ${name} ? L’employé ne pourra plus se connecter.`)) return
      const result = await runAction(employee.id, () => deactivateEmployee(employee.id), `${name} a été désactivé.`)
      if (result.ok) {
        setEmployees((current) => current.map((item) => (item.id === employee.id ? { ...item, isActive: false } : item)))
        refresh()
      }
    } else {
      const result = await runAction(employee.id, () => reactivateEmployee(employee.id), `${name} a été réactivé.`)
      if (result.ok) {
        setEmployees((current) => current.map((item) => (item.id === employee.id ? { ...item, isActive: true } : item)))
        refresh()
      }
    }
  }

  const resetFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setRoleFilter('')
    setStatusFilter('all')
    setPage(1)
  }

  return <>
    <PageHeader title="Gestion des employés" description="Créez les accès et attribuez les rôles de l’agence." />

    <section className="kpi-grid director-kpis">
      <article className="kpi">
        <div className="kpi-top">Employés <span className="kpi-icon blue"><UserRoundCog size={17} /></span></div>
        <strong>{loading && employees.length === 0 ? '…' : totalEmployees}</strong>
        <small>{hasFilters ? 'Résultats filtrés' : 'Comptes de l’agence'}</small>
      </article>
      <article className="kpi">
        <div className="kpi-top">Rôles disponibles <span className="kpi-icon mint"><Shield size={17} /></span></div>
        <strong>{roles.length || (rolesError ? '—' : '…')}</strong>
        <small>Autorisations distinctes</small>
      </article>
    </section>

    {message && (
      <p className={`staff-message ${message.type === 'error' ? 'is-error' : 'is-success'}`} role={message.type === 'error' ? 'alert' : 'status'}>
        {message.text}
      </p>
    )}
    {rolesError && <p className="staff-message is-error" role="alert">Impossible de charger les rôles : {rolesError}</p>}

    <section className="card role-card">
      <div className="card-heading">
        <div>
          <h2>Ajouter un employé</h2>
          <p>Saisissez le mot de passe initial : il sera haché côté serveur et jamais affiché.</p>
        </div>
      </div>

      <form className="staff-form staff-form-wide" onSubmit={addStaff} noValidate>
        <label>Prénom
          <input value={form.firstName} onChange={updateField('firstName')} placeholder="Ex. Samira" />
          {formErrors.firstName && <span className="field-error">{formErrors.firstName}</span>}
        </label>
        <label>Nom
          <input value={form.lastName} onChange={updateField('lastName')} placeholder="Ex. Bensaïd" />
          {formErrors.lastName && <span className="field-error">{formErrors.lastName}</span>}
        </label>
        <label>Email
          <input type="email" value={form.email} onChange={updateField('email')} placeholder="nom@bank.local" />
          {formErrors.email && <span className="field-error">{formErrors.email}</span>}
        </label>
        <label>N° d’employé
          <input value={form.employeeNumber} onChange={updateField('employeeNumber')} placeholder="Ex. EMP-001" />
          {formErrors.employeeNumber && <span className="field-error">{formErrors.employeeNumber}</span>}
        </label>
        <label>Téléphone (optionnel)
          <input type="tel" value={form.phone} onChange={updateField('phone')} placeholder="0550123456" />
        </label>
        <label>Mot de passe initial
          <input type="password" autoComplete="new-password" value={form.password} onChange={updateField('password')} placeholder="8 caractères min., lettre + chiffre" />
          {formErrors.password && <span className="field-error">{formErrors.password}</span>}
        </label>
        <label>Rôle
          <select value={form.roleId} onChange={updateField('roleId')} disabled={roles.length === 0}>
            {roles.length === 0 && <option value="">Chargement…</option>}
            {roles.map((role) => <option key={role.id} value={role.id}>{roleLabel(role.name)}</option>)}
          </select>
          {formErrors.roleId && <span className="field-error">{formErrors.roleId}</span>}
        </label>
        <button className="text-action staff-submit" type="submit" disabled={creating || roles.length === 0}>
          {creating ? <><Loader2 size={15} className="spin" /> Création…</> : <><Plus size={15} /> Ajouter</>}
        </button>
      </form>
    </section>

    <section className="card role-card">
      <div className="card-heading">
        <div>
          <h2>Comptes des employés</h2>
          <p>Modifiez le rôle, désactivez un accès ou réinitialisez un mot de passe sans effectuer d’opération bancaire.</p>
        </div>
      </div>

      <div className="staff-filters">
        <label className="staff-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher (nom, email, n° d’employé)"
            aria-label="Rechercher un employé"
          />
        </label>
        <select
          className="inline-select"
          aria-label="Filtrer par rôle"
          value={roleFilter}
          onChange={(event) => { setRoleFilter(event.target.value); setPage(1) }}
        >
          <option value="">Tous les rôles</option>
          {roles.map((role) => <option key={role.id} value={role.id}>{roleLabel(role.name)}</option>)}
        </select>
        <select
          className="inline-select"
          aria-label="Filtrer par statut"
          value={statusFilter}
          onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}
        >
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Désactivés</option>
        </select>
        {hasFilters && <button type="button" className="text-action" onClick={resetFilters}>Réinitialiser</button>}
      </div>

      {loadError && (
        <p className="staff-message is-error" role="alert">
          {loadError} <button type="button" className="text-action" onClick={refresh}>Réessayer</button>
        </p>
      )}

      <div className={`role-table-wrap ${loading && employees.length > 0 ? 'is-loading' : ''}`} aria-busy={loading}>
        <table className="role-table">
          <thead>
            <tr>
              <th>Employé</th>
              <th>N° d’employé</th>
              <th>Email</th>
              <th>Téléphone</th>
              <th>Rôle</th>
              <th>Accès</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && employees.length === 0 && (
              <tr><td colSpan={7} className="table-empty"><Loader2 size={15} className="spin" /> Chargement des employés…</td></tr>
            )}
            {!loading && !loadError && employees.length === 0 && (
              <tr><td colSpan={7} className="table-empty">Aucun employé ne correspond à votre recherche.</td></tr>
            )}
            {employees.map((employee) => {
              const isBusy = Boolean(busy[employee.id])
              const fullName = `${employee.firstName} ${employee.lastName}`
              const currentRoleId = employee.role?.id ?? ''
              const roleKnown = roles.some((role) => role.id === currentRoleId)
              return (
                <tr key={employee.id}>
                  <td><b>{fullName}</b></td>
                  <td>{employee.employeeNumber}</td>
                  <td>{employee.email}</td>
                  <td>{employee.phone || '—'}</td>
                  <td>
                    <select
                      className="inline-select"
                      aria-label={`Rôle de ${fullName}`}
                      value={currentRoleId}
                      disabled={isBusy || roles.length === 0}
                      onChange={(event) => changeRole(employee, event.target.value)}
                    >
                      {!roleKnown && <option value={currentRoleId}>{roleLabel(employee.role?.name)}</option>}
                      {roles.map((role) => <option key={role.id} value={role.id}>{roleLabel(role.name)}</option>)}
                    </select>
                  </td>
                  <td>
                    <span className={`decision ${employee.isActive ? 'approved' : 'rejected'}`}>
                      {employee.isActive ? 'Actif' : 'Désactivé'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="text-action" disabled={isBusy} onClick={() => toggleActive(employee)}>
                        {isBusy ? <Loader2 size={14} className="spin" /> : employee.isActive ? 'Désactiver' : 'Réactiver'}
                      </button>
                      <button className="text-action" disabled={isBusy} onClick={() => setResetTarget(employee)}>
                        <KeyRound size={14} /> Mot de passe
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {(pagination.hasPrev || pagination.hasNext) && (
        <div className="staff-pagination">
          <button className="text-action" disabled={!pagination.hasPrev || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Précédent
          </button>
          <span>Page {page}{pagination.totalPages ? ` sur ${pagination.totalPages}` : ''}</span>
          <button className="text-action" disabled={!pagination.hasNext || loading} onClick={() => setPage((p) => p + 1)}>
            Suivant
          </button>
        </div>
      )}
    </section>

    <aside className="admin-safety-note">
      L’administrateur peut gérer les employés, mais ne reçoit aucun accès aux pages de transactions.
    </aside>

    {resetTarget && (
      <ResetPasswordModal
        employee={resetTarget}
        onClose={() => setResetTarget(null)}
        onDone={() => {
          setMessage({ type: 'success', text: `Mot de passe de ${resetTarget.firstName} ${resetTarget.lastName} réinitialisé.` })
          setResetTarget(null)
        }}
      />
    )}
  </>
}