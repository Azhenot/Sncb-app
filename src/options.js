// Options communes au serveur et à la CLI, lues depuis l'environnement (.env).
export function optionsRobot(extra = {}) {
  return {
    identifiants: { email: process.env.SNCB_EMAIL, password: process.env.SNCB_PASSWORD },
    headless: process.env.HEADLESS !== 'false',
    chromiumPath: process.env.CHROMIUM_PATH || undefined,
    ...extra,
  };
}
