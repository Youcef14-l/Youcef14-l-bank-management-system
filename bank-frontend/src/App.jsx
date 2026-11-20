import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, ArrowRight, BarChart3, Bell, ChevronRight, FileText, LayoutDashboard, Landmark, LogOut, Menu, Plus, Search, Settings, Shield, Users, Wallet, X } from 'lucide-react'
import { accounts, clients, operations, clientFor } from './lib/mock.js'
import { canAccessPath } from './lib/auth.js'
import LoginPage from './pages/LoginPage.jsx'
import DirectorPage from './pages/DirectorPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import Dashboard from './pages/DashboardPage.jsx'
import ClientsPage from './pages/ClientsPage.jsx'
import AccountsPage from './pages/AccountsPage.jsx'
import OperationsPage from './pages/OperationsPage.jsx'
import OperationPage from './pages/OperationPage.jsx'
import StatsPage from './pages/StatsPage.jsx'
import ClientDetail from './pages/ClientDetailPage.jsx'
import AccountDetail from './pages/AccountDetailPage.jsx'
import NewRecord from './pages/NewRecordPage.jsx'
import NotFound from './pages/NotFoundPage.jsx'

const navigationByRole = {
  caissier: [['/operations/new', 'Nouvelle opération', Plus], ['/operations', 'Historique', ArrowLeftRight]],
  'charge-clientele': [['/clients', 'Clients', Users], ['/comptes', 'Comptes', Wallet]],
  directeur: [['/direction', 'Pilotage agence', Shield]],
  auditeur: [['/operations', 'Historique', ArrowLeftRight], ['/statistiques', 'Statistiques', BarChart3]],
  administrateur: [['/admin', 'Employés & rôles', Users]],
}

const pageTitle = (path, selectedClient, selectedAccount) => {
  if (path === '/') return 'Tableau de bord'
  if (path === '/clients') return 'Clients'
  if (path === '/comptes') return 'Comptes bancaires'
  if (path === '/operations') return 'Historique des opérations'
  if (path === '/operations/new') return 'Nouvelle opération'
  if (path === '/statistiques') return 'Statistiques'
  if (path === '/direction') return 'Pilotage de l’agence'
  if (path === '/admin') return 'Gestion des employés'
  if (selectedClient) return path.endsWith('/edit') ? 'Modifier le client' : 'Fiche client'
  if (selectedAccount) return 'Détail du compte'
  if (path.includes('/new')) return path.startsWith('/clients') ? 'Nouveau client' : 'Ouvrir un compte'
  return 'Page introuvable'
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const path = location.pathname
  const [session, setSession] = useState(null)
  const [query, setQuery] = useState('')
  const [mobile, setMobile] = useState(false)
  const [dark, setDark] = useState(false)
  const [accountFilter, setAccountFilter] = useState('Tous')
  const [sort, setSort] = useState('Récent')

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  useEffect(() => {
    if (!session && path !== '/login') navigate('/login', { replace: true })
    if (session && path === '/login') navigate(session.role.landing, { replace: true })
    if (session && !canAccessPath(session.roleId, path)) navigate(session.role.landing, { replace: true })
  }, [navigate, path, session])

  if (!session || path === '/login') {
    return <LoginPage onLogin={(user) => { setSession(user); navigate(user.role.landing, { replace: true }) }} />
  }

  if (!canAccessPath(session.roleId, path)) return null

  const selectedClient = clients.find((client) => path === `/clients/${client.id}` || path === `/clients/${client.id}/edit`)
  const selectedAccount = accounts.find((account) => path === `/comptes/${account.numero}`)
  const title = pageTitle(path, selectedClient, selectedAccount)
  const filteredClients = clients.filter((client) => `${client.nom} ${client.prenom} ${client.id} ${client.email}`.toLowerCase().includes(query.toLowerCase()))
  const filteredAccounts = accounts.filter((account) => {
    const owner = clientFor(account.clientId)
    return `${account.numero} ${owner?.nom} ${owner?.prenom}`.toLowerCase().includes(query.toLowerCase()) && (accountFilter === 'Tous' || (accountFilter === 'Courants' ? account.type === 'COURANT' : account.type === 'EPARGNE'))
  })
  const sortedOperations = [...operations].sort((first, second) => sort === 'Récent' ? second.date - first.date : first.amount - second.amount)
  const roleNavigation = navigationByRole[session.roleId] || []

  let content
  if (path === '/direction') content = <DirectorPage />
  else if (path === '/admin') content = <AdminPage />
  else if (path === '/') content = <Dashboard navigate={navigate} />
  else if (path === '/clients') content = <ClientsPage data={filteredClients} query={query} setQuery={setQuery} navigate={navigate} />
  else if (path === '/comptes') content = <AccountsPage data={filteredAccounts} query={query} setQuery={setQuery} filter={accountFilter} setFilter={setAccountFilter} navigate={navigate} />
  else if (path === '/operations/new') content = <OperationPage searchParams={searchParams} setSearchParams={setSearchParams} navigate={navigate} />
  else if (path === '/operations') content = <OperationsPage data={sortedOperations} query={query} setQuery={setQuery} />
  else if (path === '/statistiques') content = <StatsPage />
  else if (selectedClient && path.endsWith('/edit')) content = <NewRecord title={title} navigate={navigate} editClient={selectedClient} />
  else if (selectedClient) content = <ClientDetail client={selectedClient} navigate={navigate} />
  else if (selectedAccount) content = <AccountDetail account={selectedAccount} navigate={navigate} />
  else if (path.includes('/new')) content = <NewRecord title={title} navigate={navigate} />
  else content = <NotFound navigate={navigate} />

  return <div className="app-shell">
    <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><Landmark size={19} /></span><b>BankServices</b><button className="mobile-close" onClick={() => setMobile(false)} aria-label="Fermer le menu"><X /></button></div>
      {session.roleId === 'caissier' && <button className="new-op" onClick={() => navigate('/operations/new')}><Plus size={17} /><span>Nouvelle opération</span></button>}
      <div className="nav-label">{session.role.label.toUpperCase()}</div>
      <nav>{roleNavigation.map(([href, label, Icon]) => <Link key={href} to={href} onClick={() => setMobile(false)} className={`nav-link ${path === href ? 'active' : ''}`}><Icon size={18} /><span>{label}</span>{href === '/operations' && <span className="nav-count">{operations.length}</span>}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="help-box"><div className="help-icon"><FileText size={17} /></div><div><b>Mode démonstration</b><span>Accès selon votre rôle</span></div><ArrowRight size={15} /></div><div className="profile"><div className="avatar">{session.name.slice(0, 2).toUpperCase()}</div><div className="profile-copy"><b>{session.name}</b><span>{session.role.label}</span></div><button className="icon-button" aria-label="Paramètres"><Settings size={18} /></button></div><button className="logout-button" onClick={() => { setSession(null); navigate('/login', { replace: true }) }}><LogOut size={15} /> Déconnexion</button><button className="theme-toggle" onClick={() => setDark(!dark)}>{dark ? 'Mode clair' : 'Mode sombre'} <span>{dark ? '☼' : '◐'}</span></button></div>
    </aside>
    <main className="main-area"><header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobile(true)} aria-label="Ouvrir le menu"><Menu /></button><div className="crumb"><span>Agence Alger Centre</span><ChevronRight size={14} /><strong>{title}</strong></div><div className="top-actions">{session.roleId !== 'administrateur' && <label className="global-search"><Search size={16} /><input aria-label="Rechercher" placeholder="Rechercher…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>}<button className="icon-button notification" aria-label="Notifications"><Bell size={19} /><i /></button><div className="top-avatar">{session.name.slice(0, 2).toUpperCase()}</div></div></header><div className="content">{content}</div></main>
  </div>
}
