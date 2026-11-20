import { useState } from 'react'
import { ArrowRight, Landmark, LockKeyhole, Mail } from 'lucide-react'
import { authenticate, roleOptions } from '../lib/auth.js'

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = (event) => {
    event.preventDefault()
    const user = authenticate(email, password)
    if (!user) {
      setError('Identifiants incorrects. Utilisez le code de démonstration du rôle choisi.')
      return
    }
    onLogin(user)
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-brand"><span className="brand-mark"><Landmark size={20} /></span><b>BankServices</b></div>
        <p className="login-eyebrow">ESPACE SÉCURISÉ · DÉMONSTRATION</p>
        <h1>Bon retour parmi nous</h1>
        <p className="login-description">Connectez-vous pour accéder à votre espace bancaire.</p>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="login-email">Identifiant / email</label>
          <div className="login-input"><Mail size={16} /><input id="login-email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ex. caissier" required /></div>
          <label htmlFor="login-password">Mot de passe</label>
          <div className="login-input"><LockKeyhole size={16} /><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Saisissez votre mot de passe" required /></div>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="submit">Se connecter <ArrowRight size={16} /></button>
        </form>
        <div className="demo-credentials">
          <strong>Accès de démonstration</strong>
          <p>Identifiant et mot de passe identiques :</p>
          <div>{roleOptions.map((role) => <span key={role.id}>{role.label} <b>{role.id}</b></span>)}</div>
        </div>
        <p className="login-note">Simulation locale uniquement — aucun compte réel ni donnée bancaire réelle.</p>
      </section>
    </main>
  )
}
