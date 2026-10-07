# Activer le partage par lien (à faire une seule fois)

Le partage par **fichier** marche déjà sans rien faire. Pour le partage par **lien**, il faut créer une petite table dans Supabase :

1. Ouvrez votre projet sur supabase.com, menu de gauche **SQL Editor**, bouton **New query**.
2. Ouvrez le fichier `partage-setup.sql` (dans ce dossier), copiez tout son contenu et collez-le dans l'éditeur.
3. Cliquez sur **Run**. Vous devez voir « Success. No rows returned ».
4. Dans The Analytics, ouvrez une analyse, cliquez sur **Partager**, puis **Créer un lien**.

Ce que fait le script : crée la table `shared_analyses`, laisse chaque auteur voir et révoquer ses propres liens, et ajoute une fonction qui permet à n'importe qui de lire UNE analyse s'il connaît son lien (jeton de 32 caractères). La table elle-même ne peut pas être listée par les autres. Supprimer un compte supprime aussi ses liens. Aucun secret dans ce fichier.