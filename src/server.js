// Interface locale « un clic » : http://localhost:3000
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envoyerReclamation, chargerConfigSite, RUNS_DIR } from './sncb.js';
import {
  lireProfil, enregistrerProfil, construireReclamation, valider,
  lireHistorique, ajouterHistorique, dejaEnvoyee,
} from './reclamation.js';
import { optionsRobot } from './options.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function creerApp({ fichierSite } = {}) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(ROOT, 'public')));
  app.use('/runs', express.static(RUNS_DIR));
  let enCours = false;

  app.get('/api/profil', async (_req, res) => {
    const p = await lireProfil();
    res.json({ ...p, identifiantsConfigures: !!(process.env.SNCB_EMAIL && process.env.SNCB_PASSWORD) });
  });
  app.put('/api/profil', async (req, res) => {
    const { identifiantsConfigures, ...p } = req.body;
    await enregistrerProfil(p);
    res.json({ ok: true });
  });
  app.get('/api/historique', async (_req, res) => res.json(await lireHistorique()));

  app.post('/api/reclamer', async (req, res) => {
    if (enCours) return res.status(409).json({ erreur: 'Une réclamation est déjà en cours d’envoi.' });
    const { dryRun = false, forcer = false, ...saisie } = req.body ?? {};
    const reclamation = construireReclamation(await lireProfil(), saisie);
    const { erreurs, avertissements } = valider(reclamation);
    if (erreurs.length) return res.status(400).json({ erreur: erreurs.join(' · '), avertissements });
    if (!dryRun && !forcer) {
      const doublon = await dejaEnvoyee(reclamation);
      if (doublon) return res.status(409).json({ erreur: `Déjà envoyée le ${doublon.date.slice(0, 10)} pour ce train et cette date.`, doublon: true });
    }
    enCours = true;
    try {
      const site = await chargerConfigSite(fichierSite);
      const r = await envoyerReclamation(reclamation, optionsRobot({ site, dryRun }));
      await ajouterHistorique(r);
      const { iban, ...visible } = r.reclamation;
      res.status(r.statut === 'erreur' ? 502 : 200).json({ ...r, reclamation: visible, avertissements });
    } finally {
      enCours = false;
    }
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  creerApp({ fichierSite: process.env.SNCB_SITE_CONFIG }).listen(port, '127.0.0.1', () => {
    console.log(`Réclamation SNCB en un clic : http://localhost:${port}`);
  });
}
