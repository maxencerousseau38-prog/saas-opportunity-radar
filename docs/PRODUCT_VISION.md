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

## 4. Ce que fait réellement l'IA

L'IA a quatre missions complémentaires. Elle ne sert pas simplement à rédiger les descriptions ou remplir les fiches.

### Mission 1 — AI Discovery : trouver et enrichir de vrais SaaS

L'utilisateur peut écrire une demande en langage naturel, par exemple :

« Trouve-moi des SaaS B2B américains indépendants, avec moins de 20 employés, dans le marketing et l'analytics, qui possèdent des signes crédibles de monétisation et semblent encore sous-développés. »

L'IA :
- Interprète la demande et la transforme en critères structurés.
- Prépare des recherches adaptées aux sources disponibles.
- Explore uniquement les sources dont l'accès est réellement disponible et autorisé.
- Identifie de vrais produits et leurs sites officiels.
- Classe les produits et repère les doublons à l'aide des règles de l'application.
- Enrichit les fiches avec les informations vérifiables : description, catégorie, entreprise, pays, équipe, prix, fonctionnalités, clients, concurrents, avis et autres signaux disponibles.
- Sépare les faits vérifiés, les estimations, les déclarations et les informations inconnues.
- Présente les sources, les résultats, les doublons écartés, les limites et le niveau de confiance.
- Ajoute les candidats validés à la bibliothèque et les rend disponibles dans Discover.

L'IA ne doit jamais inventer un SaaS, une entreprise, un client, un prix ou une preuve. Une recherche peut être partielle si certaines sources sont indisponibles.

### Mission 2 — Customer Voice : comprendre les utilisateurs

Pour un SaaS sélectionné, l'IA étudie les retours clients et discussions accessibles depuis des sources pertinentes, par exemple G2, Capterra, Reddit, X, Product Hunt ou des forums spécialisés, selon les possibilités d'accès réelles.

Elle cherche notamment :
- Les frustrations et plaintes.
- Les fonctionnalités manquantes ou demandées.
- Les limites du produit et de ses tarifs.
- Les difficultés d'utilisation et d'intégration.
- Les bugs ou problèmes récurrents.
- Les raisons éventuelles de changer de fournisseur.
- Les contournements utilisés par les clients.
- Les problèmes résolus, non résolus ou dont le statut reste inconnu.

Elle structure ces retours et les relie à leurs sources originales. Elle distingue le nombre de publications du nombre d'utilisateurs distincts lorsque cette information est disponible. Elle ne présente pas un échantillon d'avis comme représentatif de tous les clients.

### Mission 3 — Cross-Competitor Pain Intelligence : repérer les problèmes communs

C'est une capacité particulièrement stratégique de SOR.

L'IA compare les retours clients de plusieurs SaaS concurrents ou de produits répondant à un même besoin. Elle repère les plaintes qui décrivent le même problème, même lorsque les utilisateurs emploient des mots différents.

Elle :
- Extrait et normalise les problèmes.
- Regroupe sémantiquement les retours réellement similaires.
- Identifie les problèmes qui apparaissent chez plusieurs concurrents.
- Mesure leur récurrence dans l'échantillon collecté, sans inventer une fréquence globale.
- Relie chaque problème aux produits concernés et aux preuves originales.
- Distingue les problèmes confirmés, les hypothèses et les informations inconnues.

Le résultat est un ensemble de **Pain Point Clusters** : des problématiques partagées qui peuvent révéler un besoin de marché mal satisfait. Un problème récurrent ne constitue toutefois pas automatiquement une opportunité commerciale.

### Mission 4 — Opportunity Analyzer : évaluer une opportunité de création

L'utilisateur peut lancer une analyse à partir d'un SaaS, de plusieurs concurrents, d'une catégorie ou d'un Pain Point Cluster.

L'IA mène une recherche approfondie sur :
- Le produit, ses fonctionnalités, son positionnement et ses tarifs.
- Le marché, les segments et les tendances documentées.
- La demande et les problèmes réellement exprimés par les clients.
- Les concurrents, alternatives et solutions de remplacement.
- Les lacunes des solutions existantes.
- Les preuves de monétisation et la volonté de payer.
- La possibilité de construire une meilleure alternative.
- La faisabilité, la distribution et l'adaptation éventuelle au marché français.

Elle produit un rapport sourcé qui distingue les faits, les estimations et les hypothèses, présente les arguments favorables et défavorables, et tente aussi de réfuter l'opportunité.

Le résultat comprend notamment :
- Un score commercial sur 100, calculé par la logique déterministe de l'application.
- Un score de volonté de payer sur 15.
- Un niveau de confiance distinct du score.
- La couverture et les limites des preuves.
- Les concurrents et les problèmes identifiés.
- Les arguments contre, les risques et les critères d'abandon.
- Un verdict : BUILD CANDIDATE, VALIDATE FIRST ou REJECT, selon les règles de scoring existantes.

Un score élevé ne garantit jamais le succès et ne doit pas remplacer une validation auprès de vrais clients.

## 5. Parcours utilisateur global

1. L'utilisateur ouvre Discover.
2. Il scrolle le feed et découvre continuellement des SaaS.
3. Il explore les catégories, utilise la recherche et combine les filtres.
4. Il ouvre des fiches, sauvegarde ou masque les produits intéressants.
5. Il peut demander à AI Discovery de chercher d'autres SaaS selon ses critères.
6. Il sélectionne un SaaS ou plusieurs concurrents pour étudier leurs utilisateurs.
7. SOR identifie les frustrations individuelles puis les problèmes communs entre concurrents.
8. L'utilisateur lance une analyse d'opportunité sur les candidats ou problématiques prometteurs.
9. SOR produit un rapport sourcé qui aide à décider s'il faut valider commercialement l'idée.

## 6. Priorité d'exécution actuelle

**La priorité immédiate est de livrer quelque chose de concret : une bibliothèque multi-catégories alimentée par des sources réelles et un Discover / Feed utilisable.**

Ordre de priorité :
1. Vérifier l'état réel du code et préserver ce qui fonctionne.
2. Connecter progressivement quelques sources de catalogue à forte valeur, après vérification de leurs API, exports, accès et conditions d'utilisation.
3. Importer, normaliser et dédupliquer les SaaS avec leurs sources et dates de collecte.
4. Alimenter une bibliothèque suffisamment variée en catégories.
5. Rendre le feed, le scroll, la recherche, les filtres, les tris, les favoris et les fiches réellement fonctionnels.
6. Ajouter et éprouver ensuite les capacités IA de découverte et d'enrichissement.
7. Développer progressivement l'analyse des retours clients, les Pain Point Clusters et l'Opportunity Analyzer.

Ne pas analyser individuellement des milliers de SaaS dès leur import. La collecte doit être efficace et industrialisée ; les analyses approfondies doivent être réservées aux produits, concurrents et problématiques que l'utilisateur sélectionne ou que des signaux justifient d'approfondir.

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
