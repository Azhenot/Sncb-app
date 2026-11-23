// Usage : npm run reclamer -- [--test] [--forcer] [--retard 75] [--train "IC 1234"] [--date 2026-11-23] ...
import { parseArgs } from 'node:util';
import { envoyerReclamation, chargerConfigSite } from './sncb.js';
import { lireProfil, construireReclamation, valider, ajouterHistorique, dejaEnvoyee } from './reclamation.js';
import { optionsRobot } from './options.js';

const { values: a } = parseArgs({
  options: {
    test: { type: 'boolean' }, forcer: { type: 'boolean' },
    date: { type: 'string' }, train: { type: 'string' }, retard: { type: 'string' },
    depart: { type: 'string' }, arrivee: { type: 'string' }, heure: { type: 'string' },
    commentaire: { type: 'string' }, justificatif: { type: 'string' },
  },
});

const reclamation = construireReclamation(await lireProfil(), {
  dateVoyage: a.date, numeroTrain: a.train, retardMinutes: a.retard, gareDepart: a.depart,
  gareArrivee: a.arrivee, heurePrevue: a.heure, commentaire: a.commentaire, justificatif: a.justificatif,
});
const { erreurs, avertissements } = valider(reclamation);
avertissements.forEach((w) => console.warn(`⚠ ${w}`));
if (erreurs.length) { erreurs.forEach((e) => console.error(`✖ ${e}`)); process.exit(1); }
if (!a.test && !a.forcer && (await dejaEnvoyee(reclamation))) {
  console.error('✖ Déjà envoyée pour ce train et cette date (utilisez --forcer).'); process.exit(1);
}

const site = await chargerConfigSite(process.env.SNCB_SITE_CONFIG);
const r = await envoyerReclamation(reclamation, optionsRobot({ site, dryRun: !!a.test, onLog: (m) => console.log(`• ${m}`) }));
await ajouterHistorique(r);
console.log(`\nStatut : ${r.statut}${r.reference ? ` — référence ${r.reference}` : ''}`);
r.captures.forEach((c) => console.log(`Capture : ${c}`));
process.exit(r.statut === 'erreur' ? 1 : 0);
