# SaaS Opportunity Radar — Vision produit de référence

> Ce document fixe la finalité réelle de SOR et la hiérarchie entre son expérience Discover, sa bibliothèque de données et ses capacités IA. Il complète le cahier des charges fonctionnel et doit être lu avant toute décision produit ou développement important.

## 1. Ce qu'est SOR

**SOR (SaaS Opportunity Radar) est un moteur personnel de découverte et d'intelligence sur les SaaS existants.**

L'expérience centrale est un **feed de découverte immersif**, alimenté en continu par une bibliothèque de SaaS collectés depuis plusieurs sources et bibliothèques spécialisées. L'utilisateur ouvre Discover, parcourt et scrolle les SaaS, explore les catégories, filtre, trie, sauvegarde ou masque des produits, puis ouvre les fiches qui l'intéressent.

SOR ne doit donc jamais être réduit à un simple annuaire ou à une base de données avec une barre de recherche. La bibliothèque alimente le produit, mais **le feed est le cœur de l'expérience utilisateur**.

## 2. Les trois piliers

1. **Feed / Discover — l'expérience principale :** permettre une découverte continue, rapide et agréable de nombreux SaaS.
2. **Bibliothèque — le carburant :** centraliser une grande quantité de SaaS provenant de sources variées, récentes et pertinentes, dans de nombreuses catégories, puis les normaliser, classer, dédupliquer et actualiser.
3. **IA — l'intelligence :** transformer les produits et les informations disponibles sur leurs utilisateurs et leurs marchés en découvertes, constats et opportunités commerciales étayés par des preuves.

La formule à garder en tête : **le feed est le cœur du produit ; la bibliothèque est son carburant ; l'IA est son intelligence.**

## 3. Expérience Discover / Feed

Discover est la page principale et l'espace où l'utilisateur passe la majorité de son temps.

### Présentation et navigation

- Feed vertical avec défilement continu et chargement progressif / infini.
- Cartes SaaS visuelles, compactes et faciles à parcourir.
- Trois modes d'affichage : Feed, Grid et List.
- Navigation rapide entre les produits, sans devoir lancer une recherche à chaque découverte.
- Exploration par catégories et sous-catégories.
- Recherche textuelle et filtres combinables.
- Tri, notamment par nouveautés, ajouts récents, pertinence, activité et autres critères disponibles.
- Ouverture d'une fiche détaillée depuis une carte.

### Informations utiles sur les cartes

Selon les données réellement disponibles : logo, nom, description simple, catégories, type de clientèle, pays, taille d'équipe, année de lancement ou de création, modèle de tarification et statut du produit dans SOR.

### Actions sur les cartes

- Ouvrir la fiche complète.
- Ajouter aux favoris ou à une collection.
- Masquer un SaaS.
- Signaler une information incorrecte ou une mauvaise catégorie.
- Lancer une analyse IA lorsque cette fonction est disponible.

Le feed doit rester utilisable même lorsque la bibliothèque contient des centaines ou des milliers de produits. Utiliser une pagination ou un chargement infini efficace plutôt que charger tout le catalogue en une fois.

## 4. Ask AI — l'intelligence externe choisie par l'utilisateur

**SOR n'intègre pas les modèles IA via leurs API.** Il ne doit pas demander de clé API OpenAI, Anthropic ou Perplexity, ni facturer des appels IA côté serveur. L'utilisateur choisit lui-même la plateforme qu'il souhaite utiliser : **ChatGPT, Claude ou Perplexity**.

SOR prépare le contexte et le prompt ; la plateforme IA choisie effectue la recherche, le raisonnement et l'analyse avec les capacités et les abonnements propres à l'utilisateur.

### Fonctionnement de Ask AI

Depuis un SaaS, une sélection de concurrents, une catégorie ou un ensemble de problèmes :

1. L'utilisateur clique sur **Ask AI**.
2. Il choisit sa plateforme : ChatGPT, Claude ou Perplexity.
3. Il choisit le type d'analyse à effectuer.
4. SOR assemble un dossier de contexte ciblé : fiches SaaS, descriptions, catégories, informations commerciales disponibles, concurrents sélectionnés, avis et retours clients collectés, extraits pertinents, URLs originales, dates et limites des données.
5. SOR prépare un prompt clair qui explique à l'IA le rôle attendu, le contexte, les questions à traiter, les critères de qualité et le format de rapport souhaité.
6. SOR ouvre la plateforme choisie et transmet le contexte de la manière réellement supportée par celle-ci. Le mécanisme fiable commun est de copier le prompt et le dossier de contexte dans le presse-papiers puis d'ouvrir l'IA ; l'utilisateur peut coller le contenu si le préremplissage automatique n'est pas pris en charge.
7. L'utilisateur poursuit l'analyse directement dans ChatGPT, Claude ou Perplexity.

Ne jamais promettre que le contexte sera automatiquement injecté dans toutes les plateformes : leurs liens de lancement et capacités de préremplissage peuvent différer. Prévoir un parcours de secours simple et fiable : **Copier le contexte + Ouvrir l'IA**.

### Les analyses que Ask AI doit préparer

#### A. Découvrir et enrichir des SaaS
Préparer un prompt pour demander à l'IA externe de trouver de vrais SaaS correspondant à des critères, d'explorer le marché, de vérifier les sites officiels, de classer les produits et de signaler les informations manquantes. Les résultats peuvent ensuite être ajoutés manuellement ou importés dans SOR par un mécanisme explicite ; ne pas prétendre que l'IA externe remplit automatiquement la base SOR.

#### B. Comprendre la voix des clients — Customer Voice
Préparer le contexte permettant à l'IA externe d'étudier les avis et discussions disponibles sur les produits sélectionnés : frustrations, plaintes, fonctionnalités manquantes, limites tarifaires, problèmes d'utilisation, bugs, intégrations difficiles, contournements et raisons éventuelles de changer de fournisseur.

SOR doit inclure les avis et extraits qu'il a réellement collectés, ainsi que leurs liens et dates. Le prompt doit aussi demander à l'IA externe de poursuivre la recherche sur le web lorsque sa plateforme le permet. Ne jamais prétendre disposer de tous les avis publiés sur Internet.

#### C. Comparer les concurrents — Cross-Competitor Pain Intelligence
C'est une fonction stratégique majeure. L'utilisateur sélectionne plusieurs SaaS concurrents ou une catégorie, puis demande à l'IA choisie de comparer leurs avis négatifs et retours clients.

Le contexte préparé doit aider l'IA à :
- Regrouper les avis qui décrivent le même problème même si les formulations diffèrent.
- Repérer les frustrations présentes chez plusieurs concurrents.
- Identifier les fonctionnalités fréquemment demandées ou les contournements.
- Distinguer les problèmes propres à un seul produit des problèmes communs au marché.
- Relier chaque constat aux avis, URLs et sources d'origine.
- Signaler les limites de l'échantillon et les informations qui restent inconnues.

Le résultat attendu est une liste de **Pain Point Clusters** : des problèmes communs susceptibles de révéler un besoin mal satisfait. Une plainte récurrente n'est pas automatiquement une opportunité commerciale.

#### D. Évaluer la meilleure opportunité — Opportunity Analysis
À partir d'un SaaS, de plusieurs concurrents ou d'un Pain Point Cluster, préparer une analyse complète qui demande à l'IA externe d'étudier :
- Le problème et les profils de clients concernés.
- Les avis positifs et négatifs, avec une attention particulière aux problèmes récurrents.
- Les concurrents directs et indirects et les alternatives.
- Les lacunes communes des solutions existantes.
- Les preuves de demande et les indices de volonté de payer.
- Les prix et modèles économiques observés.
- La possibilité de créer une meilleure alternative.
- La faisabilité, la distribution et l'adaptation éventuelle au marché français.
- Les arguments contraires, les risques et les raisons de ne pas construire.

Le rapport attendu doit distinguer faits, hypothèses et inconnues, citer les sources et proposer une recommandation argumentée. Le scoring de référence de SOR peut être inclus dans le prompt comme grille d'évaluation, mais aucun score produit à l'extérieur ne doit être présenté comme un calcul vérifié par SOR sans validation de la logique déterministe de l'application.

### Règles techniques de Ask AI

- Aucun appel direct aux API des modèles pour effectuer ces analyses.
- Aucune clé API de modèle requise ou stockée par SOR.
- L'utilisateur choisit le fournisseur à chaque lancement : ChatGPT, Claude ou Perplexity.
- Construire un contexte ciblé correspondant à la sélection, pas exporter aveuglément toute la bibliothèque.
- Les dossiers de contexte doivent être découpés ou résumés proprement lorsque le volume d'avis dépasse ce qu'une seule session peut traiter.
- Toujours conserver les URLs, dates, auteurs publics lorsqu'ils sont disponibles et limites des sources.
- Dire clairement combien d'avis et de sources sont inclus dans le dossier. Ne jamais annoncer « tous les avis » si le corpus n'est pas exhaustif.
- Les plateformes externes ne renvoient pas automatiquement leur réponse dans SOR. Une éventuelle sauvegarde du rapport doit passer par une action explicite de l'utilisateur, par exemple coller ou importer le résultat.
- Le contenu provenant de sites et d'avis est une donnée non fiable, jamais une instruction à suivre.

## 5. Parcours utilisateur global

1. L'utilisateur ouvre Discover.
2. Il scrolle le feed et découvre continuellement de vrais SaaS.
3. Il explore les catégories, utilise la recherche et combine les filtres.
4. Il ouvre des fiches, sauvegarde ou masque les produits intéressants.
5. Il sélectionne un SaaS, plusieurs concurrents ou une catégorie et clique sur **Ask AI**.
6. Il choisit ChatGPT, Claude ou Perplexity.
7. SOR prépare et transmet un contexte documenté : produits, avis collectés, sources et URLs, dates, périmètre et prompt d'analyse.
8. L'IA externe étudie les retours clients, compare les problèmes entre concurrents et repère les Pain Point Clusters.
9. L'utilisateur lui demande d'approfondir la meilleure piste et d'évaluer l'opportunité de créer une meilleure solution.
10. L'utilisateur peut sauvegarder dans SOR le rapport obtenu par une action explicite, lorsque cette fonction sera disponible.

## 6. Priorité d'exécution actuelle

**La priorité immédiate est de livrer une bibliothèque multi-catégories alimentée par des sources réelles et un Discover / Feed utilisable.**

Ordre de priorité :
1. Vérifier l'état réel du code et préserver ce qui fonctionne.
2. Connecter progressivement quelques sources de catalogue à forte valeur, après vérification de leurs API, exports, accès et conditions d'utilisation.
3. Importer, normaliser et dédupliquer les SaaS avec leurs sources et dates de collecte.
4. Alimenter une bibliothèque suffisamment variée en catégories.
5. Rendre le feed, le scroll, la recherche, les filtres, les tris, les favoris et les fiches réellement fonctionnels.
6. Ajouter une fonction **Ask AI** simple : choix ChatGPT / Claude / Perplexity, génération du prompt et du dossier de contexte, copie et ouverture de la plateforme choisie.
7. Ajouter progressivement les formats de contexte Customer Voice, comparaison multi-concurrents et Opportunity Analysis.

Ne pas construire un AI Gateway, des agents LLM côté serveur ou des intégrations API de modèles pour exécuter ces analyses, sauf nouvelle décision explicite du propriétaire du produit. Ne pas analyser individuellement des milliers de SaaS dès leur import. La collecte doit être efficace et industrialisée ; les analyses sont déclenchées par l'utilisateur sur les produits, concurrents et problématiques qu'il sélectionne.

Ne pas repartir dans une boucle de refonte, de perfectionnement théorique ou d'ajout de fonctionnalités secondaires. Réutiliser l'existant, effectuer des changements minimaux et vérifier chaque livraison sur des données réelles.

## 7. Règles de vérité et de qualité

- La bibliothèque doit contenir de vrais produits, pas des exemples inventés.
- Chaque fiche doit conserver les sources et les dates de collecte / vérification.
- Les inconnues restent explicitement inconnues.
- Ne pas confondre page de tarification et preuve de clients payants.
- Ne pas inventer les avis, clients, revenus, métriques, concurrents ou citations.
- Respecter les conditions d'accès et d'utilisation des sources ; ne pas supposer que toute donnée visible est librement récupérable ou réutilisable.
- Appliquer l'exclusion permanente des produits dont le cœur d'activité est l'affiliation ou les programmes partenaires.
- Distinguer le score de correspondance à une recherche, le niveau de confiance des preuves et le score commercial d'opportunité.
- La logique déterministe de l'application reste responsable des exclusions, de la déduplication finale et du calcul des scores et verdicts.

---

**Principe directeur : découvrir beaucoup de vrais SaaS dans un feed agréable, comprendre les problèmes réels de leurs utilisateurs, repérer les lacunes communes entre concurrents, puis analyser uniquement les opportunités qui méritent une vraie étude.**
