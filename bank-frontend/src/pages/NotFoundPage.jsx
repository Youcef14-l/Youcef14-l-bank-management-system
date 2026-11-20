import { Button } from '../components/ui.jsx'

export default function NotFound({navigate}){return <div className="not-found"><span>404</span><h1>Page introuvable</h1><p>La page demandée n’existe pas ou a été déplacée.</p><Button onClick={()=>navigate('/')}>Retour au tableau de bord</Button></div>}
