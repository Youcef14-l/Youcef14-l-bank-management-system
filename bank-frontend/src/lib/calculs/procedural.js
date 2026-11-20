import {BankError} from '../errors.js';
export function calculerSolde(compte){return compte.balance}
export function verifierMontant(montant){if(!Number.isSafeInteger(montant)||montant<=0)throw new BankError('MONTANT_INVALIDE','Le montant doit être strictement supérieur à 0.');return true}
export function effectuerDepot(compte,montant){verifierMontant(montant);if(compte.status!=='ACTIF')throw new BankError('COMPTE_INACTIF','Ce compte est bloqué : aucune opération n’est possible.');compte.balance+=montant;return compte.balance}
export function effectuerRetrait(compte,montant,frais=0){verifierMontant(montant);if(compte.status!=='ACTIF')throw new BankError('COMPTE_INACTIF','Ce compte est bloqué : aucune opération n’est possible.');const disponible=compte.balance+(compte.type==='COURANT'?compte.overdraft:-(compte.minimum||0));if(montant+frais>disponible)throw new BankError('SOLDE_INSUFFISANT',`Solde insuffisant : disponible ${disponible} centimes, montant demandé ${montant+frais} centimes.`);compte.balance-=montant+frais;return compte.balance}
export function calculerTotalOperations(liste){let total=0;for(let i=0;i<liste.length;i++)total+=liste[i].amount;return total}
