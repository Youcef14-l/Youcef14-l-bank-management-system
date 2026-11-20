import { useState } from 'react'
import { Plus, Shield, UserRoundCog } from 'lucide-react'
import { PageHeader } from '../components/ui.jsx'
import { addEmployee, listEmployees, roleOptions, updateEmployee } from '../lib/auth.js'

export default function AdminPage() {
  const [staff, setStaff] = useState(listEmployees)
  const [form, setForm] = useState({ name: '', email: '', roleId: 'caissier' })
  const [message, setMessage] = useState('')
  const addStaff = (event) => {
    event.preventDefault()
    if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setMessage('Veuillez saisir un nom et une adresse email valide.')
      return
    }
    if (staff.some((employee) => employee.email.toLowerCase() === form.email.trim().toLowerCase())) {
      setMessage('Cette adresse email est déjà attribuée.')
      return
    }
    setStaff((current) => [...current, addEmployee(form)])
    setForm({ name: '', email: '', roleId: 'caissier' })
    setMessage('Employé ajouté à la simulation.')
  }

  return <>
    <PageHeader title="Gestion des employés" description="Créez les accès et attribuez les rôles de l’agence." />
    <section className="kpi-grid director-kpis"><article className="kpi"><div className="kpi-top">Employés <span className="kpi-icon blue"><UserRoundCog size={17} /></span></div><strong>{staff.length}</strong><small>Comptes simulés</small></article><article className="kpi"><div className="kpi-top">Rôles disponibles <span className="kpi-icon mint"><Shield size={17} /></span></div><strong>{roleOptions.length}</strong><small>Autorisations distinctes</small></article></section>
    <section className="card role-card"><div className="card-heading"><div><h2>Ajouter un employé</h2><p>Mot de passe initial : code du rôle choisi. Les accès restent en mémoire uniquement.</p></div></div><form className="staff-form" onSubmit={addStaff}><label>Nom complet<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex. Samira Bensaïd" /></label><label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="nom@bank.local" /></label><label>Rôle<select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>{roleOptions.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label><button className="text-action staff-submit" type="submit"><Plus size={15} /> Ajouter</button></form>{message && <p className="staff-message" role="status">{message}</p>}</section>
    <section className="card role-card"><div className="card-heading"><div><h2>Comptes des employés</h2><p>Modifiez le rôle ou désactivez un accès sans effectuer d’opération bancaire.</p></div></div><div className="role-table-wrap"><table className="role-table"><thead><tr><th>Employé</th><th>Identifiant</th><th>Rôle</th><th>Accès</th><th>Action</th></tr></thead><tbody>{staff.map((employee) => <tr key={employee.id}><td><b>{employee.name}</b><small>{employee.id}</small></td><td>{employee.email}</td><td><select className="inline-select" aria-label={`Rôle de ${employee.name}`} value={employee.roleId} onChange={(event) => { const roleId = event.target.value; updateEmployee(employee.id, { roleId, password: roleId }); setStaff(listEmployees()) }}>{roleOptions.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></td><td><span className={`decision ${employee.active ? 'approved' : 'rejected'}`}>{employee.active ? 'Actif' : 'Désactivé'}</span></td><td><button className="text-action" onClick={() => { updateEmployee(employee.id, { active: !employee.active }); setStaff(listEmployees()) }}>{employee.active ? 'Désactiver' : 'Réactiver'}</button></td></tr>)}</tbody></table></div></section>
    <aside className="admin-safety-note">L’administrateur peut gérer les employés, mais ne reçoit aucun accès aux pages de transactions.</aside>
  </>
}
