# Réclamation SNCB en un clic

Petite application locale qui, **en un seul clic**, se connecte à votre profil SNCB
(« Mon SNCB »), remplit le **formulaire de compensation pour retard** avec votre trajet
habituel, votre titre de transport et votre IBAN, l'envoie, puis garde la référence et une
capture d'écran de la confirmation.

Elle fonctionne avec un robot navigateur (Playwright) qui fait exactement ce que vous feriez
à la main sur belgiantrain.be.

## Installation

```bash
npm install
npx playwright install chromium      # une seule fois
cp .env.example .env                 # puis mettez votre e-mail et mot de passe SNCB
cp config/profil.example.json config/profil.json   # ou remplissez-le depuis l'interface
```

## Utilisation

```bash
npm start            # puis ouvrez http://localhost:3000
```

1. La première fois, ouvrez **Mon profil** et renseignez votre trajet habituel (train, gares,
   heure prévue), votre titre de transport, votre IBAN, puis enregistrez.
2. Ensuite, quand votre train est en retard : choisissez la durée (15 min … 3 h) et cliquez
   **Envoyer ma réclamation**. La date du jour est utilisée par défaut.
3. Cochez **Mode test** pour voir le formulaire rempli (capture d'écran) **sans l'envoyer** :
   conseillé la première fois.

En ligne de commande (pratique pour un raccourci bureau ou un raccourci iPhone/Android via SSH) :

```bash
npm run reclamer -- --retard 75                     # trajet habituel, aujourd'hui
npm run reclamer -- --test --retard 120 --date 2026-11-20 --train "IC 2117"
```

Protections intégrées : contrôle de l'IBAN, refus d'une date future, avertissement si le
retard est < 60 min ou si le voyage date de plus de 3 mois, et blocage des doublons (même
train, même jour) sauf si vous confirmez (`--forcer`).

## Si SNCB change son site

Tout ce qui dépend du site est dans `config/sncb.json` : URL de connexion, URL du formulaire,
libellés des champs (expressions régulières FR/NL), texte des boutons et du message de
confirmation. Les champs sont repérés par leur **libellé**, pas par des sélecteurs CSS
fragiles. Si un champ n'est pas trouvé, l'interface l'indique (« Champs non trouvés ») et une
capture est enregistrée dans `runs/`. Pour regarder le robot travailler : `HEADLESS=false`.

> ⚠️ Les URLs et libellés par défaut n'ont pas pu être vérifiés sur le site réel lors du
> développement : faites un premier essai en **mode test**, regardez la capture, et ajustez
> `config/sncb.json` si nécessaire. Si SNCB demande un captcha ou une double
> authentification, lancez avec `HEADLESS=false` pour la valider vous-même.

## Tests

Une maquette du site (connexion + formulaire) permet de tester tout le parcours sans toucher
au vrai site :

```bash
npm test                 # 5 tests, dont un envoi complet sur la maquette
npm run mock             # maquette sur http://localhost:4000 (test@example.com / secret)
```

## Vie privée

Vos identifiants restent dans `.env`, votre IBAN dans `config/profil.json` ; ces deux fichiers
et le dossier `runs/` sont exclus de Git. L'IBAN n'est pas écrit dans l'historique. Le serveur
n'écoute que sur `127.0.0.1`.
