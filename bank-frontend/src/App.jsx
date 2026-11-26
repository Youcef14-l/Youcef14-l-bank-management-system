import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, ArrowRight, BarChart3, Bell, ChevronRight, FileText, Landmark, LogOut, Menu, Plus, Search, Settings, Shield, Users, Wallet, X } from 'lucide-react'
import { operations } from './lib/mock.js'
import { canAccessPath, restoreSession, logout } from './lib/auth.js'
import { hasPermission } from './lib/permissions.js'
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
import AuditLogsPage from './pages/AuditLogsPage.jsx'
import { ShieldCheck } from 'lucide-react'

const navigationByRole = {
  caissier: [['/operations/new', 'Nouvelle opération', Plus], ['/operations', 'Historique', ArrowLeftRight]],
  'charge-clientele': [['/clients', 'Clients', Users], ['/comptes', 'Comptes', Wallet]],
  directeur: [['/direction', 'Pilotage agence', Shield]],
  auditeur: [
    ['/operations', 'Historique', ArrowLeftRight],
    ['/statistiques', 'Statistiques', BarChart3],
    ['/audit', 'Journal d’audit', ShieldCheck],
  ],
  administrateur: [['/admin', 'Employés & rôles', Users]],
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Customer / account routes. Identifiers in the URL are backend UUIDs.
function matchEntityRoute(path) {
  if (path === '/clients/new') return { view: 'client-new' }
  if (path === '/comptes/new') return { view: 'account-new' }

  let match = path.match(/^\/clients\/([^/]+)\/edit$/)
  if (match) return UUID_RE.test(match[1]) ? { view: 'client-edit', id: match[1] } : null

  match = path.match(/^\/clients\/([^/]+)$/)
  if (match) return UUID_RE.test(match[1]) ? { view: 'client-detail', id: match[1] } : null

  match = path.match(/^\/comptes\/([^/]+)$/)
  if (match) return UUID_RE.test(match[1]) ? { view: 'account-detail', id: match[1] } : null

  return null
}

const entityTitles = {
  'client-new': 'Nouveau client',
  'client-edit': 'Modifier le client',
  'client-detail': 'Fiche client',
  'account-new': 'Ouvrir un compte',
  'account-detail': 'Détail du compte',
}

const pageTitle = (path, entity) => { 
  if (path === '/statistiques') return 'Statistiques'
  if (path === '/audit') return 'Journal d’audit'
  if (path === '/') return 'Tableau de bord'
  if (path === '/clients') return 'Clients'
  if (path === '/comptes') return 'Comptes bancaires'
  if (path === '/operations') return 'Historique des opérations'
  if (path === '/operations/new') return 'Nouvelle opération'
  if (path === '/statistiques') return 'Statistiques'
  if (path === '/direction') return 'Pilotage de l’agence'
  if (path === '/admin') return 'Gestion des employés'
  if (entity) return entityTitles[entity.view]
  return 'Page introuvable'
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const path = location.pathname

  // حالة الموظف الذي سجل الدخول
  const [session, setSession] = useState(null)

  // منع عرض صفحة Login قبل التحقق من الجلسة
  const [booting, setBooting] = useState(true)

  // استعادة الجلسة عند فتح التطبيق أو تحديث الصفحة
  useEffect(() => {
    restoreSession()
      .then((user) => setSession(user))
      .finally(() => setBooting(false))
  }, [])

  const handleLogout = () => {
    logout()
    setSession(null)
    navigate('/login', { replace: true })
  }

  const [query, setQuery] = useState('')
  const [mobile, setMobile] = useState(false)
  const [dark, setDark] = useState(false)
  const [accountFilter, setAccountFilter] = useState('Tous')
  const [sort, setSort] = useState('Récent')

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  // The shared search text is cleared when the user changes section (e.g. Clients -> Comptes),
  // so a customer-name search is never silently applied to the account-number search.
  const section = path.split('/')[1] ?? ''
  useEffect(() => { setQuery('') }, [section])

  // Single redirect effect. It waits for the session check (booting), so a page refresh
  // on /clients/<uuid> is no longer redirected to /login before the session is restored.
  useEffect(() => {
    if (booting) return
    if (!session && path !== '/login') navigate('/login', { replace: true })
    if (session && path === '/login') navigate(session.role.landing, { replace: true })
    if (session && !canAccessPath(session.roleId, path)) navigate(session.role.landing, { replace: true })
  }, [booting, navigate, path, session])

  if (booting) return null
  if (!session || path === '/login') {
    return <LoginPage onLogin={(user) => { setSession(user); navigate(user.role.landing, { replace: true }) }} />
  }

  if (!canAccessPath(session.roleId, path)) return null

  const can = (code) => hasPermission(session, code)
  const entity = matchEntityRoute(path)
  const title = pageTitle(path, entity)
  const sortedOperations = [...operations].sort((first, second) => sort === 'Récent' ? second.date - first.date : first.amount - second.amount)
  const roleNavigation = navigationByRole[session.roleId] || []
  const preselectedClientId = UUID_RE.test(searchParams.get('client') ?? '') ? searchParams.get('client') : ''

  let content
  if (path === '/direction') content = <DirectorPage user={session} />
  else if (path === '/admin') content = <AdminPage />
  else if (path === '/') content = <Dashboard navigate={navigate} />
  else if (path === '/clients') content = <ClientsPage query={query} setQuery={setQuery} navigate={navigate} can={can} />
  else if (path === '/comptes') content = <AccountsPage query={query} setQuery={setQuery} filter={accountFilter} setFilter={setAccountFilter} navigate={navigate} can={can} />
  else if (path === '/operations/new') content = <OperationPage searchParams={searchParams} setSearchParams={setSearchParams} navigate={navigate} />
 else if (path === '/operations') { content = (<OperationsPage data={sortedOperations} query={query} setQuery={setQuery} canCreate={session.roleId !== 'auditeur'}/>)}
  else if (path === '/statistiques') content = <StatsPage />
  else if (entity?.view === 'client-new') content = <NewRecord mode="client-new" title={title} navigate={navigate} can={can} />
  else if (entity?.view === 'client-edit') content = <NewRecord key={entity.id} mode="client-edit" title={title} clientId={entity.id} navigate={navigate} can={can} />
  else if (entity?.view === 'client-detail') content = <ClientDetail key={entity.id} id={entity.id} navigate={navigate} can={can} />
  else if (entity?.view === 'account-new') content = <NewRecord mode="account-new" title={title} preselectedClientId={preselectedClientId} navigate={navigate} can={can} />
  else if (entity?.view === 'account-detail') content = <AccountDetail key={entity.id} id={entity.id} navigate={navigate} />
  else if (path === '/audit') content = <AuditLogsPage />
  else content = <NotFound navigate={navigate} />

  return <div className="app-shell">
    <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><Landmark size={19} /></span><b>BankServices</b><button className="mobile-close" onClick={() => setMobile(false)} aria-label="Fermer le menu"><X /></button></div>

      <div className="nav-label">{session.role.label.toUpperCase()}</div>
      <nav>{roleNavigation.map(([href, label, Icon]) => <Link key={href} to={href} onClick={() => setMobile(false)} className={`nav-link ${path === href ? 'active' : ''}`}><Icon size={18} /><span>{label}</span>{href === '/operations' && <span className="nav-count">{operations.length}</span>}</Link>)}</nav>
      <div className="sidebar-bottom">{/*<div className="help-box"><div className="help-icon"><FileText size={17} /></div>{/*<div><b>Mode démonstration</b><span>Accès selon votre rôle</span></div><ArrowRight size={15} /></div>*/}<div className="profile"><div className="avatar">{session.name.slice(0, 2).toUpperCase()}</div><div className="profile-copy"><b>{session.name}</b><span>{session.role.label}</span></div><button className="icon-button" aria-label="Paramètres"><Settings size={18} /></button></div><button className="logout-button" onClick={handleLogout}><LogOut size={15} /> Déconnexion</button><button className="theme-toggle" onClick={() => setDark(!dark)}>{dark ? 'Mode clair' : 'Mode sombre'} <span>{dark ? '☼' : '◐'}</span></button></div>
    </aside>
    <main className="main-area"><header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobile(true)} aria-label="Ouvrir le menu"><Menu /></button><div className="crumb"><span>Agence Alger Centre</span><ChevronRight size={14} /><strong>{title}</strong></div><div className="top-actions">{session.roleId !== 'administrateur' && <label className="global-search"><Search size={16} /><input aria-label="Rechercher" placeholder="Rechercher…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>}<button className="icon-button notification" aria-label="Notifications"><Bell size={19} /><i /></button><div className="top-avatar">{session.name.slice(0, 2).toUpperCase()}</div></div></header><div className="content">{content}</div></main>
  </div>
}