// Construction d'une réclamation à partir du profil enregistré + historique local.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNS_DIR } from './sncb.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFIL = path.join(ROOT, 'config', 'profil.json');
const HISTORIQUE = path.join(RUNS_DIR, 'historique.json');

export async function lireProfil() {
  try { return JSON.parse(await fs.readFile(PROFIL, 'utf8')); }
  catch { return JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'profil.example.json'), 'utf8')); }
}

export async function enregistrerProfil(profil) {
  await fs.writeFile(PROFIL, JSON.stringify(profil, null, 2));
}

const aujourdhui = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-JJ, heure locale

/** Fusionne le profil (trajet habituel, IBAN…) avec les valeurs saisies pour ce retard. */
export function construireReclamation(profil, saisie = {}) {
  const t = profil.trajetHabituel ?? {};
  const r = {
    dateVoyage: saisie.dateVoyage || aujourdhui(),
    numeroTrain: saisie.numeroTrain || t.numeroTrain,
    gareDepart: saisie.gareDepart || t.gareDepart,
    gareArrivee: saisie.gareArrivee || t.gareArrivee,
    heurePrevue: saisie.heurePrevue || t.heurePrevue,
    retardMinutes: saisie.retardMinutes ?? profil.retardParDefaut,
    typeTitre: saisie.typeTitre || profil.typeTitre,
    numeroTitre: saisie.numeroTitre || profil.numeroTitre,
    titulaire: saisie.titulaire || profil.titulaire,
    iban: (saisie.iban || profil.iban || '').replace(/\s+/g, ''),
    bic: saisie.bic || profil.bic,
    commentaire: saisie.commentaire ?? profil.commentaire,
    justificatif: saisie.justificatif || profil.justificatif,
  };
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && v !== ''));
}

export function valider(r) {
  const erreurs = [];
  const avertissements = [];
  for (const c of ['dateVoyage', 'numeroTrain', 'gareDepart', 'gareArrivee', 'retardMinutes']) {
    if (!r[c] && r[c] !== 0) erreurs.push(`Champ obligatoire manquant : ${c}`);
  }
  if (r.iban && !ibanValide(r.iban)) erreurs.push('IBAN invalide');
  const retard = Number(r.retardMinutes);
  if (r.retardMinutes !== undefined && (!Number.isFinite(retard) || retard <= 0)) erreurs.push('Retard (minutes) invalide');
  else if (retard < 60) avertissements.push('Retard inférieur à 60 min : il pourrait ne pas donner droit à une compensation (vérifiez les conditions SNCB de votre titre).');
  const jours = (Date.now() - new Date(r.dateVoyage).getTime()) / 86400000;
  if (jours > 90) avertissements.push('Voyage de plus de 3 mois : la demande risque d’être hors délai.');
  if (jours < -1) erreurs.push('La date du voyage est dans le futur.');
  return { erreurs, avertissements };
}

export function ibanValide(iban) {
  const s = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const num = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
  let reste = 0;
  for (const ch of num) reste = (reste * 10 + Number(ch)) % 97;
  return reste === 1;
}

export async function lireHistorique() {
  try { return JSON.parse(await fs.readFile(HISTORIQUE, 'utf8')); } catch { return []; }
}

export async function ajouterHistorique(res) {
  const h = await lireHistorique();
  const { iban, ...sansIban } = res.reclamation ?? {};
  h.unshift({
    id: res.id, statut: res.statut, reference: res.reference, erreur: res.erreur,
    date: new Date().toISOString(), reclamation: sansIban, captures: res.captures,
  });
  await fs.mkdir(RUNS_DIR, { recursive: true });
  await fs.writeFile(HISTORIQUE, JSON.stringify(h.slice(0, 200), null, 2));
}

/** Empêche d'envoyer deux fois la même réclamation (même train, même jour). */
export async function dejaEnvoyee(r) {
  return (await lireHistorique()).find((h) => h.statut === 'envoyee'
    && h.reclamation?.dateVoyage === r.dateVoyage && h.reclamation?.numeroTrain === r.numeroTrain);
}
