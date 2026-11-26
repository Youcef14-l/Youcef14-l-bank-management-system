export function describeError(err) {
  switch (err?.status) {
    case 0:
      return 'Serveur injoignable. Vérifiez votre connexion et réessayez.'
    case 400:
      return err.message || 'Filtres invalides.'
    case 401:
      return 'Votre session a expiré. Veuillez vous reconnecter.'
    case 403:
      return 'Vous n’avez pas l’autorisation d’accéder à cette ressource.'
    case 404:
      return 'Ressource introuvable.'
    case 409:
      return 'Conflit détecté. Actualisez la page.'
    default:
      return err?.message || 'Une erreur serveur est survenue.'
  }
}