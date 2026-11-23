import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { demarrerMock } from './mock-sncb.js';
import { envoyerReclamation, chargerConfigSite } from '../src/sncb.js';
import { construireReclamation, valider, ibanValide } from '../src/reclamation.js';

let mock, site;
const identifiants = { email: 'test@example.com', password: 'secret' };
const chromiumPath = process.env.CHROMIUM_PATH;
const profil = {
  titulaire: 'Jean Test', iban: 'BE68 5390 0754 7034', bic: 'GKCCBEBB', typeTitre: 'Abonnement', numeroTitre: '987',
  trajetHabituel: { numeroTrain: 'IC 1234', gareDepart: 'Namur', gareArrivee: 'Bruxelles-Midi', heurePrevue: '08:12' },
};

before(async () => {
  mock = await demarrerMock();
  site = { ...(await chargerConfigSite()), loginUrl: `${mock.url}/fr/my-sncb`, compensationUrl: `${mock.url}/fr/compensation` };
});
after(() => mock.srv.close());

test('IBAN : contrôle modulo 97', () => {
  assert.ok(ibanValide('BE68 5390 0754 7034'));
  assert.ok(!ibanValide('BE00 5390 0754 7034'));
});

test('validation : retard court signalé, champs manquants refusés', () => {
  const r = construireReclamation(profil, { retardMinutes: 20 });
  assert.equal(valider(r).erreurs.length, 0);
  assert.equal(valider(r).avertissements.length, 1);
  assert.ok(valider(construireReclamation({}, {})).erreurs.length > 0);
});

test('mode test : remplit sans envoyer', async () => {
  const r = await envoyerReclamation(construireReclamation(profil, { retardMinutes: 75 }), { site, identifiants, dryRun: true, chromiumPath });
  assert.equal(r.statut, 'test', r.erreur);
  assert.equal(mock.recues.length, 0);
});

test('un clic : connexion, remplissage et envoi', async () => {
  const r = await envoyerReclamation(construireReclamation(profil, { dateVoyage: '2026-11-20', retardMinutes: 75 }), { site, identifiants, chromiumPath });
  assert.equal(r.statut, 'envoyee', r.erreur ?? r.etapes.join('\n'));
  assert.equal(r.reference, 'CMP-000001');
  assert.deepEqual(r.champsIntrouvables, []);
  const f = mock.recues[0];
  assert.equal(f.travelDate, '2026-11-20');
  assert.equal(f.train, 'IC 1234');
  assert.equal(f.from, 'Namur');
  assert.equal(f.to, 'Bruxelles-Midi');
  assert.equal(f.delay, '75');
  assert.equal(f.ticketType, 'Abonnement');
  assert.equal(f.iban, 'BE68539007547034');
  assert.equal(f.consent, 'on');
});

test('mauvais identifiants : erreur claire', async () => {
  const r = await envoyerReclamation(construireReclamation(profil, { retardMinutes: 75 }), { site, identifiants: { email: 'x@y.z', password: 'non' }, chromiumPath });
  assert.equal(r.statut, 'erreur');
  assert.match(r.erreur, /Connexion refusée/);
});
