const CODE_MESSAGES = {
  NETWORK_ERROR: 'Serveur injoignable. Vérifiez votre connexion et que le backend est démarré.',
  CUSTOMER_NATIONAL_ID_ALREADY_EXISTS: 'Un client avec cette pièce d’identité existe déjà.',
  CUSTOMER_EMAIL_ALREADY_EXISTS: 'Un client avec cette adresse email existe déjà.',
  CUSTOMER_ALREADY_EXISTS: 'Ce client existe déjà.',
  CUSTOMER_NOT_FOUND: 'Client introuvable.',
  CUSTOMER_INACTIVE: 'Impossible d’ouvrir un compte pour un client désactivé.',
  CUSTOMER_HAS_ACTIVE_ACCOUNTS: 'Ce client possède encore des comptes actifs.',
  ACCOUNT_NOT_FOUND: 'Compte introuvable.',
  INVALID_ACCOUNT_CONFIGURATION: 'Les paramètres ne correspondent pas au type de compte choisi.',
  DUPLICATE_ACCOUNT_NUMBER: 'Impossible de générer un numéro de compte unique. Veuillez réessayer.',
}

const STATUS_MESSAGES = {
  0: 'Serveur injoignable. Vérifiez votre connexion et que le backend est démarré.',
  401: 'Session expirée. Veuillez vous reconnecter.',
  403: 'Vous n’avez pas l’autorisation d’effectuer cette action.',
  404: 'Ressource introuvable.',
  409: 'Conflit : cette information existe déjà ou l’état actuel ne permet pas cette action.',
}

export function getErrorMessage(err) {
  if (err?.code && CODE_MESSAGES[err.code]) return CODE_MESSAGES[err.code]

  if (err?.status === 400) {
    const detail = err.message && err.message !== 'Erreur serveur' ? ` (${err.message})` : ''
    return `Données invalides. Vérifiez les champs saisis.${detail}`
  }
  if (STATUS_MESSAGES[err?.status]) return STATUS_MESSAGES[err.status]
  if (err?.status >= 500) return 'Erreur interne du serveur. Veuillez réessayer plus tard.'
  return err?.message || 'Une erreur est survenue.'
}