// Robot Playwright : se connecte au profil SNCB et remplit le formulaire de compensation.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RUNS_DIR = path.join(ROOT, 'runs');

export async function chargerConfigSite(fichier = path.join(ROOT, 'config', 'sncb.json')) {
  return JSON.parse(await fs.readFile(fichier, 'utf8'));
}

const rx = (motif) => new RegExp(motif, 'i');
const MARQUE = 'data-sncb-rempli';

/** Retourne le premier élément visible, pas encore rempli, correspondant à un des candidats. */
async function premierLibre(candidats) {
  for (const loc of candidats) {
    let elements;
    try { elements = await loc.all(); } catch { continue; }
    for (const el of elements) {
      try {
        if (!(await el.isVisible()) && (await el.getAttribute('type')) !== 'file') continue;
        if ((await el.getAttribute(MARQUE)) !== null) continue;
        if (await el.isDisabled()) continue;
        return el;
      } catch { /* élément détaché */ }
    }
  }
  return null;
}

function candidatsChamp(page, cle, motsCles) {
  return [
    page.locator(`[name="${cle}"], #${cle}`),
    ...motsCles.map((m) => page.getByLabel(rx(m))),
    ...motsCles.map((m) => page.getByPlaceholder(rx(m))),
  ];
}

async function cliquerBouton(page, motifs) {
  for (const m of motifs) {
    const btn = page.getByRole('button', { name: rx(m) });
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click();
      return true;
    }
  }
  const generique = page.locator('button[type=submit], input[type=submit]').first();
  if (await generique.isVisible().catch(() => false)) { await generique.click(); return true; }
  return false;
}

async function accepterCookies(page, selecteurs) {
  for (const s of selecteurs) {
    const b = page.locator(s).first();
    if (await b.isVisible({ timeout: 1500 }).catch(() => false)) { await b.click().catch(() => {}); return; }
  }
}

async function remplirChamp(el, type, valeur) {
  if (type === 'file') return el.setInputFiles(valeur);
  const tag = await el.evaluate((n) => n.tagName.toLowerCase());
  if (tag === 'select') {
    try { await el.selectOption({ label: valeur }); }
    catch { await el.selectOption(valeur); }
  } else {
    const t = (await el.getAttribute('type')) || '';
    if (t === 'checkbox' || t === 'radio') await el.check();
    else await el.fill(String(valeur));
  }
  await el.evaluate((n, m) => n.setAttribute(m, ''), MARQUE);
}

async function seConnecter(page, site, identifiants, journal) {
  const email = await premierLibre(site.login.email.map((m) => page.getByLabel(rx(m)))
    .concat([page.locator('input[type=email], input[name*=mail i], input[name=username]')]));
  if (!email) { journal('Aucun formulaire de connexion visible : session déjà ouverte ?'); return; }
  if (!identifiants.email || !identifiants.password) {
    throw new Error('Identifiants SNCB manquants : renseignez SNCB_EMAIL et SNCB_PASSWORD dans .env');
  }
  await email.fill(identifiants.email);
  const mdp = await premierLibre([page.locator('input[type=password]')]);
  if (!mdp) {
    // Connexion en deux étapes (e-mail puis mot de passe)
    await cliquerBouton(page, ['continuer', 'suivant', 'next', ...site.login.submit]);
    await page.locator('input[type=password]').first().waitFor({ timeout: 15000 });
  }
  await page.locator('input[type=password]').first().fill(identifiants.password);
  await cliquerBouton(page, site.login.submit);
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  if (await page.locator('input[type=password]').first().isVisible().catch(() => false)) {
    throw new Error('Connexion refusée : vérifiez vos identifiants SNCB (ou un captcha/2FA est demandé, lancez avec HEADLESS=false).');
  }
  journal('Connecté au profil SNCB.');
}

/**
 * Envoie une réclamation.
 * @param {object} reclamation  valeurs des champs (dateVoyage, numeroTrain, ...)
 * @param {object} opts { identifiants, site, dryRun, headless, chromiumPath }
 */
export async function envoyerReclamation(reclamation, opts) {
  const site = opts.site ?? (await chargerConfigSite());
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const dossier = path.join(RUNS_DIR, id);
  await fs.mkdir(dossier, { recursive: true });
  const etapes = [];
  const journal = (m) => { etapes.push(m); opts.onLog?.(m); };

  const browser = await chromium.launch({
    headless: opts.headless ?? true,
    ...(opts.chromiumPath ? { executablePath: opts.chromiumPath } : {}),
  });
  const page = await browser.newPage({ locale: 'fr-BE' });
  const capture = async (nom) => {
    const f = path.join(dossier, `${nom}.png`);
    await page.screenshot({ path: f, fullPage: true }).catch(() => {});
    return path.relative(ROOT, f);
  };

  const resultat = { id, statut: 'erreur', dryRun: !!opts.dryRun, reclamation, etapes, captures: [] };
  try {
    journal(`Ouverture de ${site.loginUrl}`);
    await page.goto(site.loginUrl, { waitUntil: 'domcontentloaded' });
    await accepterCookies(page, site.cookieButton);
    await seConnecter(page, site, opts.identifiants ?? {}, journal);

    journal(`Ouverture du formulaire de compensation`);
    await page.goto(site.compensationUrl, { waitUntil: 'domcontentloaded' });
    await accepterCookies(page, site.cookieButton);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    const manquants = [];
    for (const [cle, def] of Object.entries(site.champs)) {
      const valeur = reclamation[cle];
      if (valeur === undefined || valeur === null || valeur === '') continue;
      const el = await premierLibre(candidatsChamp(page, cle, def.motsCles));
      if (!el) { manquants.push(cle); continue; }
      await remplirChamp(el, def.type, valeur);
      journal(`Champ « ${cle} » rempli.`);
    }
    if (manquants.length) journal(`Champs introuvables sur la page : ${manquants.join(', ')} (voir config/sncb.json).`);

    for (const m of site.consentement) {
      const cases = await page.getByLabel(rx(m)).all();
      for (const c of cases) {
        if ((await c.getAttribute('type')) === 'checkbox' && !(await c.isChecked())) await c.check();
      }
    }
    resultat.captures.push(await capture('1-formulaire-rempli'));
    resultat.champsIntrouvables = manquants;

    if (opts.dryRun) {
      resultat.statut = 'test';
      journal('Mode test : formulaire rempli mais NON envoyé.');
      return resultat;
    }

    if (!(await cliquerBouton(page, site.submit))) throw new Error('Bouton d’envoi introuvable.');
    journal('Formulaire envoyé, attente de la confirmation…');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    const confirmation = page.getByText(rx(site.confirmation.join('|'))).first();
    await confirmation.waitFor({ timeout: 20000 }).catch(() => {});
    resultat.captures.push(await capture('2-confirmation'));

    const texte = await page.locator('body').innerText();
    const ref = texte.match(rx(site.referenceRegex));
    if (ref) resultat.reference = ref[1];
    if (await confirmation.isVisible().catch(() => false)) {
      resultat.statut = 'envoyee';
      journal(`Réclamation envoyée${ref ? ` (référence ${ref[1]})` : ''}.`);
    } else {
      resultat.statut = 'incertain';
      journal('Pas de message de confirmation détecté : vérifiez la capture et votre profil SNCB.');
    }
    return resultat;
  } catch (e) {
    resultat.erreur = e.message;
    journal(`Erreur : ${e.message}`);
    resultat.captures.push(await capture('erreur'));
    return resultat;
  } finally {
    await browser.close();
    await fs.writeFile(path.join(dossier, 'resultat.json'), JSON.stringify(resultat, null, 2));
  }
}
