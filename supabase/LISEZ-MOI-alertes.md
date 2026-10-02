# Alertes par e-mail : guide d'installation pas à pas

L'application est déjà prête (case « Alertes par e-mail » dans Mon espace, Préférences). Il reste à installer, une seule fois, la petite fonction qui surveille les cours et envoie les e-mails. Tout se fait dans le navigateur, sur le site de Supabase. Comptez 15 minutes.

Les noms des boutons de Supabase changent parfois un peu d'une version à l'autre : si un libellé n'est pas exactement le même, cherchez le plus proche. Les noms entre **gras** sont ceux à chercher à l'écran.

## Ce qu'il faut préparer (5 minutes)

### A. Inventer un secret
Le secret empêche n'importe qui d'autre de déclencher la fonction. Vous allez le coller à deux endroits (étapes 1 et 3), il doit être **identique**.

Le plus simple : ouvrez PowerShell et collez cette ligne, puis appuyez sur Entrée. Elle affiche une suite de 32 caractères au hasard.

```powershell
-join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
```

Copiez le résultat dans un Bloc-notes pour le garder sous la main (exemple : `k3j9x0q8w7e2r5t1y6u4i0o9p3a8s7d2`). Ne l'envoyez à personne.

### B. Un mot de passe d'application Google
C'est un mot de passe spécial de 16 lettres que Google fabrique pour qu'une application puisse envoyer des e-mails avec votre adresse the.analytics.app@gmail.com. Vous avez déjà fait ça pour les e-mails de connexion ; le plus propre est d'en créer un nouveau, réservé aux alertes.

1. Connectez-vous à Gmail avec the.analytics.app@gmail.com, puis allez sur **myaccount.google.com**.
2. Menu de gauche, **Sécurité**. La **validation en deux étapes** doit être activée (elle l'est déjà si vous avez fait l'étape pour les e-mails de connexion).
3. Dans la barre de recherche en haut de la page, tapez **Mots de passe des applications** et ouvrez le résultat.
4. Nom de l'application : écrivez `The Analytics alertes`, puis **Créer**.
5. Google affiche 16 lettres dans un cadre jaune. Copiez-les **sans les espaces** dans votre Bloc-notes. Elles ne seront plus jamais affichées.

Vous avez maintenant, dans le Bloc-notes : le **secret** et le **mot de passe d'application**.

## Étape 1 : créer la table et le déclenchement automatique

1. Allez sur **supabase.com/dashboard** et ouvrez votre projet (celui de The Analytics).
2. Dans le menu de gauche, cliquez sur **SQL Editor** (icône avec les signes `>_`).
3. Cliquez sur **New query** (ou le bouton **+**) pour ouvrir une page vide.
4. Sur votre ordinateur, ouvrez le fichier `alertes-setup.sql` : il est dans le dossier du projet, sous-dossier `supabase`. Clic droit, **Ouvrir avec**, **Bloc-notes**. Faites **Ctrl + A** puis **Ctrl + C** pour tout copier.
5. Revenez dans Supabase, cliquez dans la grande zone de texte et faites **Ctrl + V**.
6. Repérez, vers la fin, la ligne :

   ```
   headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'REMPLACER_PAR_VOTRE_SECRET'),
   ```

   Remplacez uniquement `REMPLACER_PAR_VOTRE_SECRET` par votre secret, **en gardant les apostrophes** autour. Résultat attendu (avec l'exemple) :

   ```
   headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'k3j9x0q8w7e2r5t1y6u4i0o9p3a8s7d2'),
   ```
7. Cliquez sur **Run** (bouton vert en bas à droite, ou **Ctrl + Entrée**).
8. En bas de l'écran, vous devez voir un résultat. Deux cas :
   - **Success** (avec éventuellement un numéro, c'est le numéro de la tâche programmée) : parfait.
   - **Une erreur parlant de `pg_cron` ou `pg_net`** : allez dans le menu de gauche, **Database**, puis **Extensions**. Dans la barre de recherche, tapez `pg_cron` et activez l'interrupteur, puis `pg_net` et activez-le aussi. Revenez dans le SQL Editor et refaites **Run**.
   - Si Supabase affiche une fenêtre d'avertissement sur une « requête potentiellement destructive », elle est normale : la requête ne supprime rien. Confirmez.

**Vérification** : dans le SQL Editor, ouvrez une nouvelle requête et exécutez :

```sql
select jobname, schedule, active from cron.job;
```

Vous devez voir une ligne `check-alerts`, `*/20 13-21 * * 1-5`, `true`.

## Étape 2 : créer la fonction

1. Menu de gauche, cliquez sur **Edge Functions** (icône d'éclair ou de code).
2. Cliquez sur **Deploy a new function**, puis choisissez **Via Editor**. (Si Supabase propose des modèles, prenez n'importe lequel : on remplace tout le code juste après.)
3. En haut de l'éditeur, repérez le nom de la fonction (souvent `function-name` ou un nom généré) et remplacez-le par exactement : `check-alerts`
4. Dans la grande zone de code, **effacez tout** (Ctrl + A puis Suppr).
5. Sur votre ordinateur, ouvrez le fichier `supabase\functions\check-alerts\index.ts` avec le Bloc-notes, **Ctrl + A**, **Ctrl + C**.
6. Collez dans l'éditeur de Supabase avec **Ctrl + V**.
7. Cliquez sur **Deploy function** (bouton en bas à droite). Attendez quelques secondes : un message indique que la fonction est déployée.

### Désactiver la vérification JWT (important)
Par défaut, Supabase exige un jeton de connexion pour appeler une fonction. Notre fonction se protège toute seule avec le secret, il faut donc enlever cette exigence.

1. Dans **Edge Functions**, cliquez sur la fonction **check-alerts**.
2. Ouvrez l'onglet **Details** (ou **Settings**).
3. Cherchez l'interrupteur **Verify JWT** (parfois **Enforce JWT Verification**) et **désactivez-le** (il doit être gris, pas vert).
4. Cliquez sur **Save changes** (en bas de la section).

## Étape 3 : enregistrer les secrets

1. Menu de gauche, **Edge Functions**, puis l'onglet ou le lien **Secrets** (parfois **Manage secrets**).
2. Dans **Add or replace secrets**, ajoutez quatre secrets, un par ligne (bouton **Add another** pour ajouter une ligne) :

   | Name (nom) | Value (valeur) |
   |---|---|
   | `CRON_SECRET` | votre secret de l'étape A (le même que dans le SQL) |
   | `SMTP_USER` | `the.analytics.app@gmail.com` |
   | `SMTP_PASS` | le mot de passe d'application Google, 16 lettres sans espaces |
   | `MAIL_FROM` | `The Analytics <the.analytics.app@gmail.com>` (facultatif mais conseillé) |

3. Cliquez sur **Save** (ou **Bulk save**). Les valeurs s'affichent ensuite masquées : c'est normal.

Les autres informations dont la fonction a besoin (adresse du projet, clé de service) sont fournies automatiquement par Supabase : il n'y a rien à ajouter.

## Étape 4 : tester sans envoyer d'e-mail

Dans PowerShell, collez ceci après avoir remplacé `VOTRE_SECRET` par votre secret (gardez les guillemets) :

```powershell
Invoke-RestMethod -Method Post -Uri "https://coygikeasyfiwuskfbqh.supabase.co/functions/v1/check-alerts?dry=1" -Headers @{ "x-cron-secret" = "VOTRE_SECRET" }
```

Ce que vous pouvez obtenir :
- **`dry : True` et `users : {}`** (liste vide) : tout est bien installé, mais aucun compte n'a encore coché la case (voir l'étape 5).
- **Une liste avec votre compte** : la fonction a lu vos analyses. Regardez `newlyFired` : ce sont les alertes qui enverraient un e-mail.
- **`forbidden`** (erreur 403) : le secret de la commande ne correspond pas à `CRON_SECRET`. Vérifiez qu'il n'y a pas d'espace en trop.
- **`Invalid JWT`** ou erreur 401 : la vérification JWT n'est pas désactivée (voir l'étape 2).
- **Erreur 404** : le nom de la fonction n'est pas exactement `check-alerts`.
- **Erreur 500** : ouvrez **Edge Functions, check-alerts, Logs** pour lire le message, et envoyez-le-moi.

## Étape 5 : faire un vrai essai de bout en bout

1. Ouvrez l'application, connectez-vous à votre compte et vérifiez que votre clé Twelve Data est bien renseignée (Mon espace, Préférences, « Mise à jour automatique du prix actuel »).
2. Dans Préférences, cochez **Alertes par e-mail**.
3. Ouvrez une analyse **en dollars**, avec un ticker américain (NASDAQ ou NYSE, par exemple Apple, `AAPL`). Dans la section Décision, bloc **Alertes**, ajoutez : « Le cours passe au-dessus de » `1` (une alerte forcément déjà vraie).
4. Attendez environ 10 secondes que l'application synchronise. Vous pouvez le vérifier : dans Supabase, **Table Editor**, table **user_data**, ouvrez la ligne, puis la colonne `data` : vous devez y trouver `"alertEmails": true` (dans `settings`) et votre alerte (dans la liste `alerts` de l'analyse).
5. Relancez la commande de l'étape 4 **sans `?dry=1`** :

   ```powershell
   Invoke-RestMethod -Method Post -Uri "https://coygikeasyfiwuskfbqh.supabase.co/functions/v1/check-alerts" -Headers @{ "x-cron-secret" = "VOTRE_SECRET" }
   ```

6. Vous devez recevoir un e-mail « The Analytics : alerte sur … » dans la boîte de l'adresse de votre compte (pensez à regarder les indésirables la première fois). La réponse de la commande indique `sent : True`.
7. Relancez la commande une deuxième fois : **aucun nouvel e-mail** ne doit partir (l'alerte a déjà été signalée).
8. Supprimez ensuite l'alerte de test dans l'application.

Note : le Twelve Data gratuit ne répond pas toujours hors des heures de Bourse pour les cours en direct, mais renvoie en général le dernier cours connu, ce qui suffit pour ce test.

### Si l'e-mail n'arrive pas
- La réponse contient **`mailError`** avec « Username and Password not accepted » : le mot de passe d'application est faux. Recréez-en un (étape B) et remplacez `SMTP_PASS`.
- La réponse contient **`skipped : pas de clé Twelve Data`** : ajoutez la clé dans Préférences, attendez la synchronisation.
- **`users : {}` vide** alors que la case est cochée : la synchronisation n'a pas eu lieu. Vérifiez que vous êtes bien connecté (en haut à droite, votre adresse doit apparaître avec « Synchronisé ») puis recochez la case.
- **`checked : 0`** : l'analyse n'est pas en dollars, n'a pas de ticker, ou sa cotation n'est pas NASDAQ ou NYSE.
- Rien dans la réponse pour votre alerte : le cours n'a pas pu être lu (ticker inconnu de Twelve Data, quota atteint). Réessayez dans une minute.

## Vérifier que le déclenchement automatique fonctionne
Le lendemain (un jour de semaine, après 13 h UTC), dans le SQL Editor :

```sql
select status, start_time, return_message from cron.job_run_details order by start_time desc limit 5;
```

Chaque ligne `succeeded` est un passage réussi. Pour voir ce que la fonction a répondu :

```sql
select status_code, content, created from net._http_response order by created desc limit 5;
```

`status_code` doit valoir 200.

## Ce qui est surveillé, et les limites
- Toutes les 20 minutes, du lundi au vendredi, de 13 h à 21 h UTC (la séance américaine, heure d'été comme d'hiver).
- Seulement les alertes liées au cours (cours, prix cible, marge de sécurité, gain ou recul d'une position), pour des actions **en dollars sur NASDAQ ou NYSE** (le compte gratuit de Twelve Data ne couvre pas les autres bourses).
- 8 tickers vérifiés au maximum par passage et par compte (limite de 8 requêtes par minute de Twelve Data) : au-delà, les tickers tournent d'un passage à l'autre.
- Un e-mail n'est envoyé qu'une fois par déclenchement. L'alerte se réarme quand sa condition redevient fausse.
- L'alerte « score global » n'envoie pas d'e-mail : le score ne change que quand vous modifiez votre fiche, l'application la signale déjà.
- Gmail limite l'envoi à environ 500 e-mails par jour.

## Pour arrêter ou modifier
- **Arrêter les e-mails de votre compte** : décochez la case dans l'application.
- **Arrêter complètement** : dans le SQL Editor, exécutez `select cron.unschedule('check-alerts');`
- **Changer le secret** : modifiez `CRON_SECRET` dans Edge Functions, Secrets, puis refaites l'étape 1 avec le nouveau secret (exécutez d'abord `select cron.unschedule('check-alerts');`).
- **Mettre à jour la fonction** après un changement de code : Edge Functions, **check-alerts**, onglet **Code**, collez la nouvelle version, **Deploy updates**.
