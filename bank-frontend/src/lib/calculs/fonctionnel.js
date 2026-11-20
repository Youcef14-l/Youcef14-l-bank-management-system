export const filtrerParType=(liste,type)=>type==='TOUS'?liste.filter(Boolean):liste.filter(item=>item.type===type);
export const versLigneAffichage=operation=>({reference:operation.reference,compte:operation.account,type:operation.type,montant:operation.amount,date:operation.date,description:operation.description});
export const cumulerMontants=liste=>liste.reduce((total,item)=>total+item.amount,0);
export function calculerFrais(type,compte,montant){if(type==='VIREMENT')return Math.min(50000,Math.max(5000,Math.floor((montant+100)/200)));if(type==='RETRAIT'&&compte?.type==='EPARGNE')return Math.floor((montant+50)/100);return 0}
