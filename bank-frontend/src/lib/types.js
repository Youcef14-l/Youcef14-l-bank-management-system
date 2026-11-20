/** @typedef {{id:string,nom:string,prenom:string,email:string,telephone:string,adresse:string,created:string}} Client */
/** @typedef {{numero:string,clientId:string,type:string,balance:number,status:string,overdraft?:number,minimum?:number,rate?:number}} Compte */
/** @typedef {{reference:string,account:string,type:string,amount:number,fee:number,date:Date,description:string}} Transaction */
export const TypeCompte=Object.freeze({COURANT:'COURANT',EPARGNE:'EPARGNE'});
export const TypeTransaction=Object.freeze({DEPOT:'DEPOT',RETRAIT:'RETRAIT',VIREMENT:'VIREMENT'});
export const StatutCompte=Object.freeze({ACTIF:'ACTIF',BLOQUE:'BLOQUE',FERME:'FERME'});
