import { useState } from 'react'
import { ArrowRight, Landmark, LockKeyhole, Mail } from 'lucide-react'
import { login, roleOptions } from '../lib/auth.js' 


export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

 const submit = async (event) => {
    event.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      onLogin(await login(email, password))
    } catch (err) {
      const messages = {
        INVALID_CREDENTIALS: 'Identifiants incorrects.',
        ACCOUNT_DISABLED: 'Ce compte est désactivé.',
        TOO_MANY_ATTEMPTS: 'Trop de tentatives. Réessayez dans quelques minutes.',
        NETWORK_ERROR: 'Serveur injoignable. Vérifiez que le back-end est démarré.',
      }
      setError(messages[err.code] ?? err.message ?? 'Erreur de connexion.')
    } finally {
      setLoading(false)
    }
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
