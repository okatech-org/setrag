import { CLE_PREFERENCES, PREFERENCES_PAR_DEFAUT } from "./preferences"

/**
 * Script posé dans `<head>`, exécuté avant le premier rendu.
 *
 * Il applique le thème voulu à l'heure qu'il est (sombre la nuit), et le
 * recopie là où next-themes le relira : sans lui, un terminal rouvert à
 * minuit afficherait un instant l'écran clair de l'après-midi — de quoi
 * éblouir l'agent dans une voiture éteinte. Autonome par construction : il ne
 * voit aucun module.
 */
export const SCRIPT_AFFICHAGE = `(function(){try{
var d=${JSON.stringify(PREFERENCES_PAR_DEFAUT)};
var p=Object.assign({},d,JSON.parse(localStorage.getItem(${JSON.stringify(CLE_PREFERENCES)})||"{}"));
var t=p.theme==="clair"?"light":p.theme==="sombre"?"dark":null;
if(!t){
var hm=new Intl.DateTimeFormat("fr-FR",{timeZone:"Africa/Libreville",hour:"2-digit",minute:"2-digit",hour12:false}).format(Date.now()).split(":");
var ici=(Number(hm[0])%24)*60+Number(hm[1]);
var m=function(s){var x=String(s).split(":");return Number(x[0])*60+Number(x[1]);};
var a=m(p.nuitDebut),b=m(p.nuitFin);
var nuit=a===b?false:a<b?(ici>=a&&ici<b):(ici>=a||ici<b);
t=nuit?"dark":"light";}
var h=document.documentElement;
h.setAttribute("data-theme",t);h.style.colorScheme=t;
localStorage.setItem("theme",t);
if(p.contraste===true)h.setAttribute("data-contraste","renforce");
}catch(e){}})();`
