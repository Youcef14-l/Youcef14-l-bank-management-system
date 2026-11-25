import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Button, Empty } from '../components/ui.jsx'
import SearchableSelect from '../components/SearchableSelect.jsx'
import {
  CUSTOMER_TYPES,
  createCustomer,
  getAllActiveCustomers,
  getCustomer,
  toCreatePayload,
  toDateInput,
  toUpdatePayload,
  updateCustomer,
} from '../lib/customerApi.js'
import { CURRENCIES, createAccount, toCreateAccountPayload } from '../lib/accountApi.js'
import { currencySymbol } from '../lib/money.js'
import { normalizeAmount, validateAccountForm, validateCustomerForm } from '../lib/formValidation.js'
import { getErrorMessage } from '../lib/apiErrors.js'
import { useApiResource } from '../lib/hooks.js'

const EMPTY_CUSTOMER = {
  firstName: '', lastName: '', nationalId: '', customerType: 'INDIVIDUAL',
  email: '', phone: '', address: '', dateOfBirth: '',
}

const requiredPermission = { 'client-new': 'CUSTOMERS_CREATE', 'client-edit': 'CUSTOMERS_UPDATE', 'account-new': 'ACCOUNTS_CREATE' }

function ErrorBox({ errors }) {
  if (!errors.length) return null
  return <div className="inline-error" role="alert">{errors.map((message) => <div key={message}>{message}</div>)}</div>
}

/* ------------------------------------------------------------------ */
/* Customer form (creation + edition)                                  */
/* ------------------------------------------------------------------ */
function CustomerForm({ title, navigate, customer = null }) {
  const isEdit = Boolean(customer)
  const [form, setForm] = useState(() => customer ? {
    firstName: customer.firstName ?? '',
    lastName: customer.lastName ?? '',
    nationalId: customer.nationalId ?? '',
    customerType: customer.customerType ?? 'INDIVIDUAL',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    address: customer.address ?? '',
    dateOfBirth: toDateInput(customer.dateOfBirth),
  } : EMPTY_CUSTOMER)
  const [errors, setErrors] = useState([])
  const [saving, setSaving] = useState(false)

  const save = async (event) => {
    event.preventDefault()
    if (saving) return

    const problems = validateCustomerForm(form)
    if (problems.length) { setErrors(problems); return }
    setErrors([])

    try {
      if (isEdit) {
        const changes = toUpdatePayload(customer, form)
        if (Object.keys(changes).length === 0) {
          toast.info('Aucune modification à enregistrer.')
          navigate(`/clients/${customer.id}`)
          return
        }
        setSaving(true)
        await updateCustomer(customer.id, changes)
        toast.success('Fiche client mise à jour.')
        navigate(`/clients/${customer.id}`)
      } else {
        setSaving(true)
        const created = await createCustomer(toCreatePayload(form))
        toast.success('Client créé avec succès.')
        navigate(`/clients/${created.id}`)
      }
    } catch (err) {
      setErrors([getErrorMessage(err)])
      setSaving(false)
    }
  }

  const field = (key, label, type = 'text', extra = {}) => (
    <label className="field-label" key={key}>{label}
      <input className="field-control" type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...extra} />
    </label>
  )

  return <>
    <PageHeader title={title} description={isEdit ? 'Modifiez les coordonnées du client.' : 'Ajoutez un nouveau client à votre agence.'} />
    <form className="card record-form" onSubmit={save} noValidate>
      <h2>Informations du client</h2>
      <ErrorBox errors={errors} />
      {field('firstName', 'Prénom *')}
      {field('lastName', 'Nom *')}
      {field('nationalId', 'Pièce d’identité (N° national) *', 'text', { maxLength: 30 })}
      <label className="field-label">Type de client
        <select className="field-control" value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value })}>
          {CUSTOMER_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
        </select>
      </label>
      {field('email', 'Email', 'email')}
      {field('phone', 'Téléphone', 'tel')}
      {field('address', 'Adresse')}
      {field('dateOfBirth', 'Date de naissance', 'date')}
      <div className="form-actions">
        <Button variant="outline" type="button" onClick={() => navigate(-1)} disabled={saving}>Annuler</Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : <>{isEdit ? 'Enregistrer les modifications' : 'Enregistrer le client'} <ArrowRight /></>}
        </Button>
      </div>
    </form>
  </>
}

function EditCustomer({ title, clientId, navigate }) {
  const { data: customer, error, loading, reload } = useApiResource(() => getCustomer(clientId), [clientId])

  if (error) {
    return <>
      <PageHeader title={title} description="" />
      <div className="inline-error" role="alert">
        {getErrorMessage(error)}{' '}
        <Button variant="outline" onClick={reload}>Réessayer</Button>{' '}
        <Button variant="outline" onClick={() => navigate('/clients')}>Retour aux clients</Button>
      </div>
    </>
  }
  if (loading || !customer) {
    return <>
      <PageHeader title={title} description="Chargement…" />
      <Empty title="Chargement…" text="Récupération de la fiche client." />
    </>
  }
  return <CustomerForm title={title} navigate={navigate} customer={customer} />
}

/* ------------------------------------------------------------------ */
/* Account opening                                                     */
/* ------------------------------------------------------------------ */
function AccountForm({ title, navigate, preselectedClientId }) {
  const [customers, setCustomers] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [form, setForm] = useState({
    customerId: preselectedClientId || '',
    accountType: 'COURANT',
    currency: 'DZD',
    overdraftLimit: '10000',
    interestRate: '2.5',
    minimumBalance: '1000',
  })
  const [errors, setErrors] = useState([])
  const [saving, setSaving] = useState(false)

  // Active customers come from the backend (real UUIDs).
  useEffect(() => {
    let cancelled = false
    setLoadError('')
    getAllActiveCustomers()
      .then((list) => { if (!cancelled) setCustomers(list) })
      .catch((err) => { if (!cancelled) setLoadError(getErrorMessage(err)) })
    return () => { cancelled = true }
  }, [reloadKey])

  const options = useMemo(() => (customers ?? []).map((c) => ({
    value: c.id,
    label: `${c.firstName} ${c.lastName} — ${c.nationalId}`,
    searchText: `${c.firstName} ${c.lastName} ${c.nationalId} ${c.email ?? ''}`,
  })), [customers])

  // The selected customer is always one of the loaded options (falls back to the first one).
  const customerId = options.some((option) => option.value === form.customerId) ? form.customerId : (options[0]?.value ?? '')
  const symbol = currencySymbol(form.currency)

  const save = async (event) => {
    event.preventDefault()
    if (saving) return

    const problems = validateAccountForm(form, customerId)
    if (problems.length) { setErrors(problems); return }
    setErrors([])

    const body = toCreateAccountPayload({
      customerId,
      accountType: form.accountType,
      currency: form.currency,
      overdraftLimit: normalizeAmount(form.overdraftLimit),
      interestRate: normalizeAmount(form.interestRate),
      minimumBalance: normalizeAmount(form.minimumBalance),
    })

    setSaving(true)
    try {
      const created = await createAccount(body)
      toast.success(`Compte ${created.accountNumber} créé.`)
      navigate(`/comptes/${created.id}`)
    } catch (err) {
      setErrors([getErrorMessage(err)])
      setSaving(false)
    }
  }

  const amountField = (key, label, extra = {}) => (
    <label className="field-label" key={key}>{label}
      <input className="field-control" type="number" min="0" step="any" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...extra} />
    </label>
  )

  const header = <PageHeader title={title} description="Créez un compte bancaire et définissez ses paramètres." />

  if (loadError) {
    return <>
      {header}
      <div className="inline-error" role="alert">
        {loadError} <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>Réessayer</Button>
      </div>
    </>
  }
  if (!customers) return <>{header}<Empty title="Chargement…" text="Récupération des clients depuis le serveur." /></>
  if (customers.length === 0) {
    return <>
      {header}
      <Empty
        title="Aucun client actif"
        text="Créez d’abord un client avant d’ouvrir un compte."
        action={<Button onClick={() => navigate('/clients/new')}>Nouveau client</Button>}
      />
    </>
  }

  return <>
    {header}
    <form className="card record-form" onSubmit={save} noValidate>
      <h2>Paramètres du compte</h2>
      <ErrorBox errors={errors} />
      <SearchableSelect
        label="Titulaire"
        searchLabel="Rechercher un client"
        value={customerId}
        onChange={(value) => setForm({ ...form, customerId: value })}
        options={options}
      />
      <label className="field-label">Type de compte
        <select className="field-control" value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}>
          <option value="COURANT">Compte courant</option>
          <option value="EPARGNE">Compte épargne</option>
        </select>
      </label>
      <label className="field-label">Devise
        <select className="field-control" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
      </label>
      {form.accountType === 'COURANT'
        ? amountField('overdraftLimit', `Découvert autorisé (${symbol})`)
        : <>
            {amountField('interestRate', 'Taux annuel (%)', { max: 100 })}
            {amountField('minimumBalance', `Solde minimum (${symbol})`)}
          </>}
      <p className="fee-note">Le numéro de compte est attribué automatiquement. Le compte est ouvert avec un solde nul : les dépôts sont effectués par un caissier.</p>
      <div className="form-actions">
        <Button variant="outline" type="button" onClick={() => navigate(-1)} disabled={saving}>Annuler</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Création…' : <>Créer le compte <ArrowRight /></>}</Button>
      </div>
    </form>
  </>
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */
export default function NewRecord({ mode, title, navigate, clientId, preselectedClientId, can }) {
  if (!can(requiredPermission[mode])) {
    return <>
      <PageHeader title={title} description="" />
      <Empty
        title="Action non autorisée"
        text="Votre rôle ne permet pas d’effectuer cette action."
        action={<Button variant="outline" onClick={() => navigate(-1)}>Retour</Button>}
      />
    </>
  }

  if (mode === 'client-edit') return <EditCustomer title={title} clientId={clientId} navigate={navigate} />
  if (mode === 'account-new') return <AccountForm title={title} navigate={navigate} preselectedClientId={preselectedClientId} />
  return <CustomerForm title={title} navigate={navigate} />
}