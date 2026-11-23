// Maquette locale du profil SNCB (connexion + formulaire de compensation) pour tester le robot.
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const page = (corps) => `<!doctype html><html lang="fr"><meta charset="utf-8"><body>
<div id="onetrust-banner"><button id="onetrust-accept-btn-handler" onclick="this.parentNode.remove()">Accepter</button></div>${corps}</body></html>`;

export function demarrerMock(port = 0) {
  const recues = [];
  const sessions = new Set();
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const cookie = /sid=(\w+)/.exec(req.headers.cookie || '')?.[1];
    const connecte = cookie && sessions.has(cookie);
    const lireCorps = () => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(new URLSearchParams(d))); });
    const html = (s, code = 200, h = {}) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', ...h }); res.end(page(s)); };

    if (url.pathname === '/fr/my-sncb' && req.method === 'GET') {
      return connecte ? html('<h1>Mon profil</h1>') : html(`<h1>Se connecter</h1><form method="post">
        <label for="u">Adresse e-mail</label><input id="u" name="username" type="email">
        <label for="p">Mot de passe</label><input id="p" name="password" type="password">
        <button type="submit">Se connecter</button></form>`);
    }
    if (url.pathname === '/fr/my-sncb' && req.method === 'POST') {
      const f = await lireCorps();
      if (f.get('username') === 'test@example.com' && f.get('password') === 'secret') {
        const sid = Math.random().toString(36).slice(2); sessions.add(sid);
        res.writeHead(303, { Location: '/fr/my-sncb', 'Set-Cookie': `sid=${sid}; Path=/` }); return res.end();
      }
      return html('<p>Identifiants incorrects</p><input type="password">', 401);
    }
    if (url.pathname === '/fr/compensation') {
      if (!connecte) { res.writeHead(302, { Location: '/fr/my-sncb' }); return res.end(); }
      if (req.method === 'POST') {
        const f = Object.fromEntries(await lireCorps());
        const ref = 'CMP-' + String(recues.length + 1).padStart(6, '0');
        recues.push({ ...f, ref });
        return html(`<h1>Merci, votre demande a bien été reçue.</h1><p>Référence : ${ref}</p>`);
      }
      return html(`<h1>Demande de compensation pour retard</h1><form method="post">
        <label for="d">Date du voyage</label><input id="d" name="travelDate" type="date" required>
        <label for="t">Numéro du train</label><input id="t" name="train" required>
        <label for="a">Gare de départ</label><input id="a" name="from" required>
        <label for="b">Gare d'arrivée</label><input id="b" name="to" required>
        <label for="h">Heure d'arrivée prévue</label><input id="h" name="time">
        <label for="r">Retard à l'arrivée (minutes)</label><input id="r" name="delay" type="number" required>
        <label for="tt">Type de titre de transport</label><select id="tt" name="ticketType"><option>Billet</option><option>Abonnement</option></select>
        <label for="n">Numéro du titre</label><input id="n" name="ticketNumber">
        <label for="o">Nom du titulaire du compte</label><input id="o" name="owner">
        <label for="i">IBAN</label><input id="i" name="iban" required>
        <label for="bic">BIC</label><input id="bic" name="bicCode">
        <label for="c">Commentaire</label><textarea id="c" name="comment"></textarea>
        <input id="ok" name="consent" type="checkbox" required><label for="ok">Je certifie l'exactitude des informations</label>
        <button type="submit">Envoyer la demande</button></form>`);
    }
    res.writeHead(404); res.end();
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r({ srv, recues, url: `http://127.0.0.1:${srv.address().port}` })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await demarrerMock(Number(process.env.MOCK_PORT) || 4000);
  console.log(`Maquette SNCB : ${url}/fr/my-sncb (test@example.com / secret)`);
}
