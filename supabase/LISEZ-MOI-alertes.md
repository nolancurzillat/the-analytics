# Alertes par e-mail : mise en place (à faire une seule fois)

L'application elle-même est déjà prête (case « Alertes par e-mail » dans Mon espace, Préférences). Il reste à installer la petite fonction qui surveille les cours et envoie les e-mails. Tout se fait dans le tableau de bord Supabase, sans rien installer sur l'ordinateur. Comptez 10 minutes.

## Avant de commencer
- Choisissez un **secret** : une longue suite de lettres et de chiffres que vous inventez (par exemple 30 caractères au hasard). Il sert à empêcher que n'importe qui déclenche la fonction. Gardez-le sous la main, vous le collerez deux fois.
- Ayez sous la main le **mot de passe d'application Google** de l'adresse the.analytics.app@gmail.com (le même que celui déjà utilisé pour les e-mails de connexion). Ne le partagez avec personne, collez-le seulement dans Supabase.

## Étape 1 : créer la table et le déclenchement
1. Supabase, **SQL Editor**, nouvelle requête.
2. Ouvrez le fichier `supabase/alertes-setup.sql`, copiez tout son contenu et collez-le.
3. Remplacez `REMPLACER_PAR_VOTRE_SECRET` par votre secret (gardez les apostrophes autour).
4. Cliquez sur **Run**. Si Supabase signale un problème avec `pg_cron` ou `pg_net`, allez dans **Database, Extensions**, activez ces deux extensions, puis relancez.

## Étape 2 : créer la fonction
1. Supabase, **Edge Functions**, **Deploy a new function** puis **Via Editor**.
2. Nom de la fonction : `check-alerts` (exactement).
3. Effacez le code d'exemple, ouvrez `supabase/functions/check-alerts/index.ts`, copiez tout son contenu et collez-le. Cliquez sur **Deploy**.
4. Ouvrez la fonction, onglet **Details** (ou **Settings**), et **désactivez « Verify JWT »** (ou « Enforce JWT Verification ») : la fonction se protège elle-même avec le secret.

## Étape 3 : ajouter les secrets
Supabase, **Edge Functions, Secrets** (ou Manage secrets), ajoutez :
- `CRON_SECRET` : votre secret (le même que dans l'étape 1) ;
- `SMTP_USER` : `the.analytics.app@gmail.com` ;
- `SMTP_PASS` : le mot de passe d'application Google ;
- facultatif, `MAIL_FROM` : par exemple `The Analytics <the.analytics.app@gmail.com>`.

## Étape 4 : tester sans rien envoyer
Dans PowerShell (remplacez le secret) :

```powershell
Invoke-RestMethod -Method Post -Uri "https://coygikeasyfiwuskfbqh.supabase.co/functions/v1/check-alerts?dry=1" -Headers @{ "x-cron-secret" = "VOTRE_SECRET" }
```

La réponse liste, pour chaque compte qui a coché la case, les alertes qui se déclencheraient (`newlyFired`), sans envoyer d'e-mail. Une réponse `forbidden` veut dire que le secret ne correspond pas.

Pour un vrai essai : dans l'application, connectez-vous, ajoutez votre clé Twelve Data, cochez « Alertes par e-mail » dans Préférences, créez sur une analyse en dollars (NASDAQ ou NYSE, avec un ticker) une alerte déjà vraie (par exemple « le cours passe au-dessus de 1 $ »), attendez que la synchronisation se fasse (quelques secondes), puis relancez la commande **sans** `?dry=1` : vous devez recevoir l'e-mail.

## Ce qui est surveillé, et les limites
- Toutes les 20 minutes, du lundi au vendredi, de 13 h à 21 h UTC (la séance américaine).
- Seulement les alertes liées au cours (cours, prix cible, marge de sécurité, gain ou recul d'une position), pour des actions **en dollars sur NASDAQ ou NYSE** (le compte gratuit de Twelve Data ne couvre pas les autres bourses).
- 8 tickers vérifiés au maximum par passage et par compte (limite de 8 requêtes par minute de Twelve Data) : au-delà, les tickers tournent d'un passage à l'autre.
- Un e-mail n'est envoyé qu'une fois par déclenchement. L'alerte se réarme quand sa condition redevient fausse.
- L'alerte « score global » n'envoie pas d'e-mail : le score ne change que quand vous modifiez votre fiche, l'application la signale déjà.
- Gmail limite l'envoi à environ 500 e-mails par jour.

## Pour arrêter
Décochez la case dans l'application, ou exécutez `select cron.unschedule('check-alerts');` dans le SQL Editor.
