\# SAAS OPPORTUNITY RADAR

\*\*Cahier des charges fonctionnel — Version 1.1\*\*

Date : 3 novembre 2026
Statut : Spécifications fonctionnelles de référence
Nom du produit : SaaS Opportunity Radar (provisoire)
Objectif : Découverte, enrichissement, analyse et identification d’opportunités SaaS.

\---

\# 1. VISION DU PRODUIT

\## 1.1. Concept

Créer une plateforme privée permettant de découvrir, explorer, filtrer et analyser une grande quantité de SaaS existants à travers une interface moderne et addictive, inspirée des expériences de navigation de Product Hunt, des catalogues logiciels et des feeds de découverte.

La plateforme doit permettre à son utilisateur de :

1. Découvrir des centaines ou milliers de SaaS sans devoir effectuer une recherche manuelle à chaque fois.
2. Filtrer les résultats selon des critères très précis.
3. Consulter une fiche complète pour chaque SaaS.
4. Découvrir automatiquement ses concurrents et alternatives.
5. Identifier les problèmes rencontrés par ses utilisateurs.
6. Lancer une analyse stratégique approfondie avec l’IA.
7. Obtenir un score objectif de potentiel commercial.
8. Comparer plusieurs opportunités et constituer une sélection des meilleures.
9. Détecter les problèmes récurrents rencontrés par les clients de plusieurs SaaS concurrents, même lorsque ces problèmes sont exprimés différemment.
10. Regrouper ces frustrations en problématiques de marché et identifier les besoins insuffisamment satisfaits.
11. Transformer ces problématiques en opportunités SaaS indépendantes, documentées par des preuves et évaluées selon leur potentiel commercial.

\## 1.2. Positionnement

Ce produit n’est pas :

- Un simple annuaire de logiciels.
- Une plateforme de lancement de produits.
- Un outil de gestion de portefeuille d’entreprises.
- Un générateur automatique d’idées SaaS.
- Un outil qui attribue artificiellement un score élevé aux idées analysées.

C’est un moteur de recherche et d’intelligence sur les opportunités SaaS.

\## 1.3. Philosophie de recherche

La plateforme doit privilégier :

- Les SaaS B2B existants.
- Les petites entreprises indépendantes.
- Les produits dirigés par leurs fondateurs (founder-led).
- Les équipes réduites, idéalement de 1 à 20 personnes.
- Les produits qui ont déjà des signes crédibles de clients payants.
- Les produits fonctionnels, mais dont le développement semble encore limité.
- Les entreprises ayant des utilisateurs qui expriment des besoins non satisfaits.
- Les marchés où une meilleure expérience, une meilleure exécution ou une meilleure distribution peuvent créer un avantage.

Les États-Unis constituent le marché de découverte prioritaire.

La plateforme ne doit toutefois pas se limiter à une seule catégorie de SaaS. Le GrowthTech, le MarTech, l’acquisition, les analytics, l’automatisation et les outils business sont des domaines prioritaires, mais d’autres catégories B2B pertinentes doivent rester accessibles.

\### Exclusions permanentes

Sont exclus par défaut :

- Affiliate marketing et affiliation.
- Partner programs et partner marketplaces.
- Partner attribution.
- Commission management.
- Payouts liés aux partenaires.
- Referral/affiliate networks et leurs dérivés.

Les outils extrêmement spécialisés pour développeurs ne sont pas prioritaires. Ils pourront être accessibles via un filtre spécifique, mais ne doivent pas dominer les résultats.

\---

\# 2. ARCHITECTURE GLOBALE

La plateforme comprend sept espaces principaux.

\| Espace                  | Fonction                                  |
\| ----------------------- | ----------------------------------------- |
\| Discover                | Découvrir les SaaS dans un feed           |
\| Search & Filters        | Rechercher avec des critères avancés      |
\| SaaS Profiles           | Consulter les fiches détaillées           |
\| AI Discovery            | Trouver automatiquement de nouveaux SaaS  |
\| AI Opportunity Analyzer | Analyser le potentiel commercial          |
\| My Opportunities        | Sauvegarder, organiser et comparer        |
\| Settings                | Configurer les préférences et les sources |

\### Navigation principale

- Discover
- AI Discovery
- Opportunities
- Saved
- Settings

La recherche et les filtres doivent être accessibles directement depuis Discover.

L’ensemble de l’interface doit être cohérent, rapide, responsive et particulièrement agréable sur ordinateur comme sur mobile.

\---

\# 3. PAGE 01 — DISCOVER

\## 3.1. Objectif

C’est la page d’accueil principale et l’espace dans lequel l’utilisateur passe la majorité de son temps.

Elle doit permettre une exploration continue, sans nécessiter une recherche active pour chaque nouveau SaaS.

\## 3.2. Présentation

Chaque SaaS apparaît sous forme d’une carte.

\### Contenu obligatoire d’une carte

\| Élément      | Description                             |
\| ------------ | --------------------------------------- |
\| Logo         | Logo du SaaS                            |
\| Nom          | Nom commercial                          |
\| Description  | Une phrase claire expliquant le produit |
\| Catégories   | Catégories et sous-catégories           |
\| Clientèle    | B2B, B2C ou mixte                       |
\| Pays         | Pays du siège ou marché principal       |
\| Effectif     | Taille de l’équipe, si connue           |
\| Année        | Année de création ou de lancement       |
\| Tarification | Payant, freemium, gratuit               |
\| Statut       | Nouveau, analysé, sauvegardé            |
\| Site         | Accès au site officiel                  |

La description doit être rédigée dans un langage simple.

Exemple fictif :

\*\*MetricFlow\*\*

« Centralise les données marketing et détecte automatiquement les anomalies dans les performances de vos campagnes publicitaires. »

Catégories : Marketing / Analytics / Automation.

Équipe : 8 personnes.

Pays : États-Unis.

Business model : Abonnement SaaS.

\## 3.3. Modes d’affichage

Trois modes sont disponibles :

\### Mode Feed

- Défilement vertical continu.
- Cartes suffisamment compactes.
- Chargement progressif.
- Navigation rapide entre les SaaS.

\### Mode Grid

- Grille de cartes.
- Plusieurs SaaS visibles simultanément.
- Idéal pour explorer rapidement.

\### Mode List

- Liste compacte.
- Informations essentielles alignées.
- Idéal pour comparer un grand nombre de résultats.

\## 3.4. Interactions sur une carte

Chaque carte doit proposer :

- Ouvrir la fiche complète.
- Ajouter aux favoris.
- Ajouter à une collection.
- Masquer le SaaS.
- Signaler une mauvaise catégorie ou une information incorrecte.
- Lancer une analyse IA directement.

\## 3.5. Tri des résultats

Proposer :

- Plus récents.
- Récemment ajoutés.
- Plus pertinents.
- Meilleures preuves de monétisation.
- Plus petites équipes.
- Plus anciens.
- Plus forte activité récente.
- Les moins analysés.
- Ordre aléatoire.
- Potentiel IA, lorsqu’une analyse existe.

Le feed doit disposer d’une pagination ou d’un chargement infini, sans charger inutilement tous les résultats.

\---

\# 4. PAGE 02 — RECHERCHE ET FILTRES

C’est une fonctionnalité centrale du produit.

Les filtres doivent pouvoir être combinés librement.

Un utilisateur doit pouvoir enregistrer une combinaison de filtres et la retrouver plus tard.

\## 4.1. Recherche textuelle

La barre de recherche doit accepter :

- Nom d’un SaaS.
- Description d’un logiciel.
- Fonctionnalité.
- Problème résolu.
- Catégorie.
- Secteur.
- Mot-clé.
- Nom d’un concurrent.

La recherche sémantique devra également permettre de rechercher un SaaS à partir d’un besoin.

Exemple :

« Je cherche des SaaS qui aident les agences marketing à analyser leurs performances publicitaires. »

\## 4.2. Catalogue des filtres

\### A. Type de clientèle

- B2B.
- B2C.
- B2B + B2C.

Valeur par défaut : B2B.

\### B. Taille de l’équipe

- 1–5 employés.
- 1–10 employés.
- 1–20 employés.
- 20–50 employés.
- 50–100 employés.
- Plus de 100 employés.
- Inconnu.

Valeur recommandée par défaut : 1 à 20 employés.

Pouvoir définir une fourchette personnalisée.

\### C. Localisation

Pays :

- États-Unis.
- Royaume-Uni.
- France.
- Allemagne.
- Canada.
- Australie.
- Pays-Bas.
- Autres pays.

Possibilité de sélectionner plusieurs pays.

Filtres complémentaires :

- Pays du siège.
- Pays des principaux clients.
- Présence commerciale en France.
- Présence internationale.

\### D. Ancienneté

- Moins d’un an.
- 1 à 2 ans.
- 2 à 5 ans.
- 5 à 10 ans.
- Plus de 10 ans.

Possibilité de sélectionner une plage d’années personnalisée.

\### E. Catégories

Taxonomie organisée en catégories et sous-catégories.

\*\*Marketing & Growth\*\*

- Marketing Automation.
- Campaign Management.
- Marketing Analytics.
- Attribution.
- Conversion Optimization.
- Lead Generation.
- Lead Management.
- Email Marketing.
- Social Media Management.
- SEO.
- Content Marketing.
- Advertising Management.
- Marketing Intelligence.

\*\*Sales & CRM\*\*

- CRM.
- Sales Automation.
- Sales Intelligence.
- Lead Qualification.
- Customer Relationship Management.
- Sales Engagement.

\*\*Data & Analytics\*\*

- Business Intelligence.
- Data Analytics.
- Reporting.
- Dashboarding.
- Data Integration.
- Data Visualization.
- Monitoring.

\*\*Automation & AI\*\*

- Workflow Automation.
- AI Agents.
- AI Productivity.
- Business Process Automation.
- AI Analytics.

\*\*Business Operations\*\*

- Project Management.
- Finance Operations.
- Customer Support.
- Document Automation.
- Business Management.

\*\*E-commerce\*\*

- Store Management.
- Conversion Optimization.
- Customer Experience.
- E-commerce Analytics.
- Inventory Management.

\*\*Developer Tools\*\*

- API Platforms.
- Developer Productivity.
- Monitoring.
- Infrastructure.

Cette catégorie sera moins prioritaire dans les recommandations par défaut.

Pouvoir créer de nouvelles catégories sans modifier l’architecture de la plateforme.

\### F. Business model

- Abonnement mensuel.
- Abonnement annuel.
- Freemium.
- Free trial.
- Paiement à l’utilisation.
- Tarification par utilisateur.
- Tarification par volume.
- Licence.
- Autre.
- Inconnu.

\### G. Tarification

Filtres :

- Gratuit.
- Moins de 10 €/mois.
- 10–30 €/mois.
- 30–100 €/mois.
- 100–500 €/mois.
- Plus de 500 €/mois.
- Tarification personnalisée.

Les prix doivent pouvoir être affichés dans leur devise d’origine et convertis à titre indicatif.

\### H. Niveau de maturité

- Nouveau.
- En lancement.
- Établi.
- En croissance.
- Mature.
- Inconnu.

La maturité doit être estimée à partir de plusieurs signaux : ancienneté, activité, taille, présence commerciale et clientèle.

\### I. Validation commerciale

Filtres particulièrement importants :

- Clients payants confirmés.
- Présence d’avis clients.
- Témoignages clients.
- Études de cas.
- Entreprise avec abonnements payants.
- Signes de traction commerciale.
- Monétisation non vérifiée.
- Données insuffisantes.

Le statut « clients payants confirmés » doit nécessiter une preuve directe ou une source suffisamment fiable.

Ne pas confondre la présence d’une page de prix avec la preuve de clients payants.

\### J. Profil de l’entreprise

- Founder-led.
- Indie SaaS.
- Petite équipe.
- Entreprise indépendante.
- Entreprise financée.
- Bootstrapped.
- Filiale ou groupe.
- Statut inconnu.

\### K. Potentiel d’opportunité

Filtres calculés après analyse :

- Score inférieur à 50.
- Score de 50 à 64.
- Score de 65 à 74.
- Score de 75 à 84.
- Score de 85 à 100.
- Volonté de payer supérieure ou égale à 10/15.
- Faible différenciation produit.
- Faiblesse concurrentielle exploitable.
- Potentiel d’adaptation au marché français.

Ces filtres ne doivent pas être utilisés comme preuve de potentiel : ils servent à organiser les SaaS déjà analysés.

\### L. Géographie commerciale

- Présent aux États-Unis.
- Faible présence en Europe.
- Faible présence en France.
- Pas de version française identifiée.
- Concurrence française limitée.
- Adaptation française potentiellement intéressante.

Ces caractéristiques doivent être vérifiées et accompagnées de sources.

\### M. Niveau technologique

- SaaS Web.
- Application mobile.
- API.
- AI-native.
- No-code / Low-code.
- Extension navigateur.
- Intégration CRM.
- Intégration e-commerce.
- Intégration marketing.

\### N. Difficultés et plaintes clients

Uniquement lorsque des informations existent :

- Problèmes de prix.
- UX difficile.
- Fonctionnalités manquantes.
- Bugs récurrents.
- Support client insuffisant.
- Difficultés d’intégration.
- Performances insuffisantes.
- Mauvaise documentation.
- Limites de personnalisation.
- Fonctionnalités trop complexes.

\### O. Filtres d’exclusion

Exclusions permanentes :

- Affiliate.
- Partner.
- Referral/affiliate networks.
- Commission tracking lié aux partenaires.
- Payout management lié aux partenaires.
- Partner attribution.

Exclusions configurables :

- B2C uniquement.
- Groupes et grandes entreprises.
- Produits gratuits sans monétisation.
- Projets sans activité identifiable.
- Produits trop récents sans preuve de demande.
- Devtools très techniques.
- SaaS déjà analysés et rejetés.

\## 4.3. Fonctionnement des filtres

- Combinaison AND par défaut entre les groupes de filtres.
- Sélection multiple OR à l’intérieur d’un même groupe.
- Possibilité de sélectionner plusieurs catégories.
- Exclusions appliquées automatiquement.
- Possibilité de retirer une condition sans réinitialiser les autres.
- Affichage du nombre de résultats avant application.
- Enregistrement des filtres sous forme de recherches sauvegardées.
- Possibilité de dupliquer une recherche.

Règle importante : les données inconnues ne doivent pas être interprétées comme des valeurs négatives ou positives. L’utilisateur doit pouvoir choisir d’inclure ou d’exclure les entreprises dont les informations sont inconnues.

\---

\# 5. PAGE 03 — SAAS PROFILE

\## 5.1. Objectif

Lorsqu’un utilisateur clique sur un SaaS, il doit arriver sur une véritable page de présentation et d’intelligence concurrentielle.

Cette page doit centraliser les informations nécessaires pour comprendre rapidement l’entreprise et son produit.

\## 5.2. Header

Afficher :

- Logo.
- Nom.
- URL officielle.
- Description en une phrase.
- Catégorie.
- Pays.
- Année de création.
- Effectif estimé.
- Statut de monétisation.
- Bouton Favoris.
- Bouton Analyser avec l’IA.

\## 5.3. Informations générales

Collecter :

- Nom commercial.
- Nom juridique, si disponible.
- URL principale.
- Date de création.
- Date de lancement du produit.
- Pays.
- Ville.
- Fondateur(s).
- Équipe.
- Nombre d’employés.
- Profils LinkedIn publics de l’entreprise ou des fondateurs.
- Statut indépendant ou filiale.
- Financement public connu.
- Description officielle.

Chaque donnée doit posséder une source et une date de vérification.

\## 5.4. Informations produit

- Problème résolu.
- Clientèle cible.
- Proposition de valeur.
- Fonctionnalités principales.
- Fonctionnalités secondaires.
- Cas d’utilisation.
- Intégrations.
- Compatibilités.
- Plateformes.
- Documentation.
- Niveau de complexité.
- Langues disponibles.
- Marchés desservis.

\## 5.5. Informations commerciales

- Modèle de facturation.
- Prix d’entrée.
- Offres disponibles.
- Essai gratuit.
- Version gratuite.
- Abonnement mensuel.
- Abonnement annuel.
- Tarification par utilisateur.
- Tarification personnalisée.
- Offre entreprise.

Afficher les prix avec leur devise, leur période et leur date de vérification.

Ne pas supposer que tous les SaaS disposent de revenus publiquement accessibles.

\## 5.6. Signaux de traction

Collecter lorsque possible :

- Nombre d’avis.
- Notes sur les plateformes d’avis.
- Témoignages.
- Études de cas.
- Logos de clients publiés.
- Références commerciales.
- Présence sur Product Hunt.
- Activité des fondateurs.
- Évolution des effectifs.
- Publications de lancement ou mises à jour.
- Estimation du trafic web.

Les estimations de trafic ne doivent jamais être affichées comme des visites réellement mesurées.

\## 5.7. Analyse produit

Afficher :

- Forces principales.
- Faiblesses identifiées.
- Limites fonctionnelles.
- Expérience utilisateur.
- Qualité de la documentation.
- Qualité des intégrations.
- Positionnement tarifaire.
- Éléments de différenciation.

Cette section peut utiliser l’IA, mais toute affirmation doit être reliée à une preuve lorsque cela est possible.

\## 5.8. Avis et problèmes clients

Centraliser les retours utilisateurs disponibles.

Pour chaque retour :

- Source.
- Date.
- Note éventuelle.
- Citation courte ou résumé.
- Problème identifié.
- Catégorie du problème.
- Fréquence du problème.
- Niveau de confiance.
- Lien vers la publication originale.

L’IA doit différencier les plaintes isolées des problèmes récurrents.

\### Analyse approfondie des problèmes clients

Chaque retour utilisateur doit pouvoir être associé à un ou plusieurs problèmes structurés.

Le système doit distinguer :

- Les plaintes isolées.
- Les problèmes récurrents.
- Les problèmes communs à plusieurs fonctionnalités.
- Les problèmes communs à plusieurs concurrents.
- Les problèmes résolus.
- Les problèmes apparemment non résolus.
- Les problèmes dont le statut de résolution est inconnu.

Chaque problème doit pouvoir être relié aux SaaS concernés et aux preuves originales.

L'IA doit extraire, lorsque les informations sont disponibles :

- Problème principal.
- Problèmes secondaires.
- Fonctionnalité concernée.
- Profil utilisateur.
- Gravité.
- Fréquence déclarée.
- Conséquence opérationnelle.
- Workaround utilisé.
- Solution recherchée.
- Intention éventuelle de changer de fournisseur.
- Réponse éventuelle de l'éditeur.
- Statut du problème.

Ne pas confondre le nombre d'avis avec le nombre de clients indépendants. Les doublons, les auteurs non identifiables et les informations incertaines doivent être explicitement signalés.

\## 5.9. Concurrents et alternatives

Afficher automatiquement :

- Concurrents directs.
- Concurrents indirects.
- Alternatives moins chères.
- Alternatives plus avancées.
- Solutions gratuites.
- Solutions françaises.
- Solutions américaines.

Pour chaque concurrent :

- Nom.
- Logo.
- Description.
- Site.
- Catégorie.
- Prix.
- Positionnement.
- Fonctionnalités principales.
- Différences avec le SaaS principal.

Une comparaison sous forme de tableau doit être disponible.

Le système doit permettre de sélectionner plusieurs concurrents et de lancer une comparaison avec l’IA.

\## 5.10. Sources et fiabilité

Chaque fiche possède un espace Sources.

Pour chaque information :

- Valeur récupérée.
- Source originale.
- URL.
- Date de collecte.
- Date de dernière vérification.
- Type de source.
- Niveau de fiabilité.
- Statut : confirmé, estimé, déclaré ou inconnu.

L’utilisateur doit pouvoir ouvrir directement les sources.

\---

\# 6. PAGE 04 — AI DISCOVERY ENGINE

\## 6.1. Objectif

Le premier moteur IA est chargé de trouver automatiquement de nouveaux SaaS intéressants.

Il ne doit pas simplement générer des noms d’entreprises ou des idées de produits.

Il doit découvrir de véritables logiciels, vérifier leur existence, identifier leur entreprise et enrichir leur fiche.

\## 6.2. Mode de fonctionnement

L’utilisateur peut lancer une recherche en langage naturel.

Exemple :

« Trouve-moi des SaaS B2B américains indépendants, avec moins de 20 employés, dans le marketing et l’analytics, qui possèdent déjà des utilisateurs payants mais semblent encore sous-développés. »

L’IA transforme cette instruction en critères structurés.

\## 6.3. Workflow du moteur

\### Étape 1 — Interprétation

- Comprendre la demande.
- Déterminer les catégories.
- Identifier les conditions obligatoires.
- Appliquer les exclusions permanentes.
- Préparer les requêtes adaptées aux différentes sources.

\### Étape 2 — Recherche

Explorer les sources disponibles :

- Product Hunt.
- G2.
- Capterra.
- AlternativeTo.
- Sites officiels des logiciels.
- Répertoires SaaS.
- Crunchbase ou sources équivalentes selon les droits d’accès.
- Reddit.
- X.
- Communautés d’entrepreneurs.
- Sites d’avis.
- Bases de données d’entreprises.

\### Gestion des sources

Chaque connecteur doit disposer d'une méthode de collecte adaptée à ses conditions d'accès : API officielle, autorisation contractuelle, flux disponible ou autre méthode expressément autorisée.

Le moteur doit enregistrer :

- Les sources réellement consultées.
- Les sources indisponibles.
- Les limitations d'accès.
- Les erreurs de collecte.
- Les autorisations et conditions applicables.
- Les quotas et limites d'utilisation.

Une source mentionnée dans la configuration ne doit jamais être considérée comme intégrée tant que son connecteur n'a pas été développé et testé.

Aucun scraping non autorisé ne doit être utilisé.

\### Étape 3 — Identification

Pour chaque candidat :

- Vérifier que le produit existe.
- Identifier son site officiel.
- Identifier son nom commercial.
- Déterminer sa catégorie.
- Identifier l’entreprise derrière le produit.

\### Étape 4 — Exclusions

Éliminer :

- Les doublons.
- Les produits inexistants.
- Les entreprises hors critères.
- Les catégories exclues.
- Les solutions qui ne correspondent pas au modèle recherché.

\### Étape 5 — Enrichissement

Récupérer les données disponibles :

- Taille.
- Pays.
- Ancienneté.
- Prix.
- Fonctionnalités.
- Clients.
- Avis.
- Concurrents.
- Présence commerciale.

\### Étape 6 — Évaluation initiale

Produire :

- Score de correspondance avec les filtres.
- Niveau de confiance.
- Preuves disponibles.
- Informations manquantes.
- Motif de recommandation.

\### Étape 7 — Intégration

Les SaaS validés sont :

- Dédupliqués.
- Ajoutés à la base.
- Classés.
- Disponibles dans Discover.
- Accessibles pour une analyse approfondie.

\## 6.4. Interface AI Discovery

Chaque recherche doit présenter :

- Intitulé de la recherche.
- Prompt initial.
- Filtres interprétés.
- Sources explorées.
- Nombre de candidats trouvés.
- Nombre de doublons éliminés.
- Nombre de candidats retenus.
- Durée et date de la recherche.
- Résultats détaillés.

L’utilisateur peut relancer une recherche, la modifier ou l’enregistrer.

\## 6.5. Recherche automatique récurrente

Prévoir la possibilité de configurer des recherches périodiques :

- Quotidiennes.
- Hebdomadaires.
- Mensuelles.

Le moteur doit identifier les nouveaux SaaS et les changements détectés sur les entreprises déjà référencées.

Les résultats nouveaux doivent être distingués des SaaS déjà connus.

\---

\# 7. PAGE 05 — AI OPPORTUNITY ANALYZER

\## 7.1. Objectif

C’est le deuxième moteur IA et la fonctionnalité la plus stratégique.

Son objectif n’est pas de décrire un SaaS, mais d’évaluer la possibilité de créer une entreprise concurrente plus performante.

Il doit répondre à la question :

« Est-ce que ce SaaS représente une véritable opportunité commerciale pour nous, et avons-nous une raison crédible de construire une meilleure alternative ? »

\## 7.2. Déclenchement

Bouton présent sur chaque fiche SaaS :

« Analyze Opportunity ».

L’utilisateur peut aussi fournir un contexte complémentaire :

- Marché visé.
- Pays ciblé.
- Budget.
- Niveau technique.
- Type de produit recherché.
- Contraintes particulières.

Les critères habituels du projet doivent être préremplis.

L'analyse doit également pouvoir être lancée à partir :

- D'une catégorie de marché.
- D'un ensemble de SaaS concurrents.
- D'un Pain Point Cluster.
- D'une problématique identifiée lors d'une recherche transversale.

Dans ces cas, l'analyse ne doit pas être limitée à un seul SaaS.

\## 7.3. Workflow complet

\### Phase A — Recherche approfondie

L’IA étudie le SaaS :

- Site officiel.
- Documentation.
- Fonctionnalités.
- Tarification.
- Historique et nouveautés.
- Positionnement.
- Cible commerciale.
- Modèle économique.

Elle vérifie que l’entreprise possède des signes de monétisation crédibles.

\### Phase B — Analyse du marché

- Taille et évolution du marché, si des données fiables existent.
- Problème résolu.
- Fréquence du problème.
- Profils de clients concernés.
- Alternatives existantes.
- Tendances de marché.
- Opportunité géographique.

Les données de marché doivent être sourcées et les hypothèses clairement identifiées.

\### Phase C — Analyse des utilisateurs

Explorer :

- G2.
- Capterra.
- Reddit.
- X.
- Forums spécialisés.
- Commentaires Product Hunt.
- Témoignages disponibles.

Identifier :

- Les frustrations.
- Les demandes de fonctionnalités.
- Les plaintes récurrentes.
- Les limites tarifaires.
- Les difficultés d’utilisation.
- Les problèmes d’intégration.
- Les besoins non satisfaits.

L’IA doit regrouper les plaintes par sujet et mesurer leur récurrence.

\### Phase D — Cross-Competitor Pain Intelligence

\*\*Objectif :\*\* identifier les problèmes utilisateurs récurrents à travers plusieurs SaaS concurrents afin de découvrir des lacunes communes au marché.

Cette phase ne doit pas se limiter à l'analyse individuelle des avis d'un SaaS.

Elle doit pouvoir analyser simultanément les retours clients de plusieurs produits appartenant à une même catégorie ou répondant à un besoin similaire.

\#### A. Extraction structurée

Pour chaque avis ou discussion accessible, extraire lorsque possible :

- Problème principal.
- Problèmes secondaires.
- Fonctionnalité concernée.
- Profil utilisateur.
- Gravité.
- Fréquence déclarée.
- Conséquence opérationnelle.
- Workaround utilisé.
- Solution recherchée.
- Intention éventuelle de changer de fournisseur.
- Réponse éventuelle de l'éditeur.
- Statut du problème : résolu, non résolu ou inconnu.

Les informations non disponibles doivent rester inconnues et ne doivent pas être inventées.

\#### B. Regroupement sémantique

Regrouper les plaintes qui décrivent un même problème, même si elles utilisent des formulations différentes.

Utiliser :

- Classification par IA.
- Embeddings.
- Recherche de similarité.
- Clustering.
- Vérification sémantique des groupes.

Les regroupements doivent éviter de fusionner des problèmes simplement parce qu'ils partagent quelques mots.

Chaque cluster doit pouvoir être réexaminé et corrigé.

\#### C. Analyse transversale

Pour chaque groupe de problèmes, identifier :

- Les SaaS concernés.
- Les catégories de logiciels concernées.
- Les utilisateurs concernés.
- Le nombre de retours pertinents.
- Le nombre d'auteurs distincts vérifiés, lorsqu'il est disponible.
- Le nombre d'entreprises distinctes identifiées.
- La répartition des plaintes entre concurrents.
- L'évolution dans le temps.
- La gravité et la récurrence.
- Les solutions existantes.

Les résultats doivent distinguer le volume brut de retours, les auteurs distincts et les entreprises distinctes.

Lorsque le volume total d'avis d'un produit est connu, utiliser également des fréquences relatives pour éviter de surévaluer les produits qui possèdent simplement davantage d'avis.

Ne pas considérer plusieurs avis d'un même utilisateur comme plusieurs clients indépendants.

\#### D. Identification des lacunes

Détecter en priorité :

- Les mêmes problèmes rencontrés chez plusieurs concurrents.
- Les fonctionnalités réclamées mais insuffisamment proposées.
- Les workflows encore manuels.
- Les solutions alternatives bricolées par les utilisateurs.
- Les problèmes qui poussent les clients à envisager un changement de logiciel.
- Les besoins pour lesquels les solutions actuelles ne semblent pas satisfaisantes.

Une absence de solution identifiée ne doit pas être automatiquement considérée comme une preuve d'absence de concurrence.

\#### E. Création des Pain Point Clusters

Chaque cluster doit avoir :

- Un identifiant unique.
- Un nom.
- Une description.
- Une catégorie.
- Un profil de client concerné.
- Les SaaS concernés.
- Les preuves associées.
- Le nombre de retours pertinents.
- Le nombre d'auteurs distincts vérifiés, lorsque disponible.
- Le nombre d'entreprises distinctes identifiées.
- La récurrence.
- La gravité.
- Les solutions existantes.
- Le niveau de confiance.
- La date de première détection.
- La date de dernière observation.

\#### F. Génération d'opportunités

À partir des clusters les plus intéressants, générer des hypothèses de SaaS indépendants.

Pour chacune :

- Problème à résoudre.
- ICP.
- Proposition de valeur.
- Solution envisageable.
- Différenciation.
- Concurrents existants.
- Modèle économique potentiel.
- Pricing hypothétique.
- Faisabilité technique.
- Méthode de distribution.
- Validation commerciale nécessaire.

Une opportunité peut concerner plusieurs concurrents ou répondre à un problème plus large que la catégorie initiale.

\#### G. Règle fondamentale

Un nombre élevé d'avis négatifs ne constitue pas une preuve automatique de volonté de payer.

Chaque opportunité doit être étudiée indépendamment, en recherchant des preuves de dépenses existantes, des solutions alternatives payantes, des entretiens qualifiés, des pilotes payants ou des préventes.

Le moteur doit pouvoir conclure qu'un problème est réel mais ne constitue pas une opportunité commerciale suffisamment intéressante.

\### Phase E — Analyse concurrentielle

Identifier les principaux concurrents.

Pour chacun :

- Positionnement.
- Tarifs.
- Fonctionnalités.
- Clientèle.
- Forces.
- Faiblesses.
- Différences avec le SaaS analysé.

Produire une matrice comparative.

\### Phase F — Recherche des opportunités

L’IA doit identifier des angles de différenciation concrets.

Exemples :

- Produit plus simple.
- Meilleure UX.
- Meilleure tarification.
- Automatisation supplémentaire.
- Intégrations manquantes.
- Meilleure expérience mobile.
- Produit mieux adapté aux petites entreprises.
- Fonctionnalités manquantes.
- Meilleure localisation française.
- Meilleur support.
- Distribution plus efficace.

Chaque opportunité doit être reliée à un problème utilisateur ou à une faiblesse concurrentielle observée.

\### Phase G — Adaptation au marché français

Étudier :

- Présence du produit en France.
- Concurrents français.
- Langue et localisation.
- Spécificités de la clientèle française.
- Besoins locaux.
- Intégrations nécessaires.
- Contraintes réglementaires éventuelles.
- Tarification adaptée.
- Canaux d’acquisition possibles.

Une simple traduction du produit ne doit pas être considérée comme une différenciation suffisante.

\### Phase H — Validation commerciale

L’IA doit déterminer :

- Qui achèterait une alternative ?
- Pourquoi changerait-il de solution ?
- Quel problème justifierait le changement ?
- Quel prix pourrait être accepté ?
- Existe-t-il une preuve de volonté de payer ?
- Quels seraient les principaux obstacles à la vente ?

Il faut impérativement distinguer les intentions déclarées des achats réels.

\### Phase I — Recommandation stratégique

L’IA propose :

- Le meilleur positionnement.
- La meilleure cible initiale.
- La différenciation prioritaire.
- Les fonctionnalités essentielles.
- Une hypothèse de tarification.
- Une stratégie d’acquisition.
- Un MVP commercialisable.
- Un plan de validation terrain.

Elle doit également produire les raisons de ne pas construire.

\---

\# 8. SCORING — SYSTÈME D’ÉVALUATION SUR 100

Le scoring doit reprendre notre méthode de sélection des opportunités.

Il comporte six dimensions pondérées.

\| Dimension                                            | Pondération |
\| ---------------------------------------------------- | ----------: |
\| 1. Demande réelle et problèmes clients               |          20 |
\| 2. Volonté de payer et monétisation                  |          15 |
\| 3. Faiblesses du produit et potentiel d’amélioration |          20 |
\| 4. Attractivité du marché                            |          15 |
\| 5. Concurrence et différenciation possible           |          15 |
\| 6. Faisabilité, distribution et adaptation française |          15 |
\| \*\*Total\*\*                                            |     \*\*100\*\* |

\## 8.1. Demande réelle — 20 points

Évaluer :

- Fréquence du problème.
- Intensité du problème.
- Nombre de personnes concernées.
- Récurrence des plaintes.
- Existence d’un besoin non satisfait.

Pour les opportunités transversales, prendre également en compte :

- Diversité des SaaS concernés.
- Nombre d'utilisateurs distincts vérifiables.
- Nombre d'entreprises concernées.
- Répartition des problèmes entre concurrents.
- Persistance des problèmes.
- Évolution de la fréquence des plaintes.

Ne pas attribuer une note élevée uniquement sur la base du nombre brut d'avis.

\## 8.2. Volonté de payer — 15 points

Évaluer :

- Existence de clients payants.
- Prix déjà accepté sur le marché.
- Dépenses réalisées pour résoudre ce problème.
- Preuves d’achats ou d’intentions commerciales.
- Capacité à payer pour une alternative.

Seuil obligatoire : 10/15 minimum.

Un SaaS présentant un fort potentiel théorique mais aucune preuve suffisante de volonté de payer ne doit pas être validé.

Une intention déclarée, une plainte ou une demande de fonctionnalité ne constituent pas à elles seules une preuve de paiement.

\## 8.3. Faiblesses et amélioration — 20 points

Évaluer :

- Fonctionnalités manquantes.
- Mauvaise expérience utilisateur.
- Tarification inadaptée.
- Automatisations insuffisantes.
- Mauvaise qualité des intégrations.
- Possibilité réelle de construire un meilleur produit.

Pour les opportunités transversales, évaluer également si le problème est suffisamment commun pour justifier une solution indépendante.

\## 8.4. Attractivité du marché — 15 points

Évaluer :

- Demande actuelle.
- Potentiel de croissance.
- Marché adressable.
- Nombre de clients potentiels.
- Diversité des profils de clients.
- Possibilité d’expansion.

\## 8.5. Concurrence et différenciation — 15 points

Évaluer :

- Niveau de concurrence.
- Concentration du marché.
- Qualité des concurrents.
- Opportunités inexploitées.
- Avantage possible d’un nouvel entrant.
- Difficulté de reproduction par les concurrents.

Attention : une faible concurrence n’est pas systématiquement positive. Elle peut aussi révéler une absence de demande.

\## 8.6. Faisabilité et distribution — 15 points

Évaluer :

- Complexité technique.
- Temps de développement.
- Coût de lancement.
- Possibilités de distribution.
- Accessibilité des clients.
- Possibilité d’adaptation à la France.
- Avantage commercial réaliste.

\## 8.7. Barème

Chaque dimension est notée de 0 à 5 puis convertie selon sa pondération.

\| Note | Signification                    |
\| ---- | -------------------------------- |
\| 0    | Aucune preuve ou critère absent  |
\| 1    | Très faible                      |
\| 2    | Faible                           |
\| 3    | Correct                          |
\| 4    | Fort                             |
\| 5    | Excellent et solidement démontré |

Calcul :

Note de dimension = (note obtenue / 5) × pondération.

\## 8.8. Seuils de décision

\| Score  | Décision                 |
\| ------ | ------------------------ |
\| 0–49   | Rejeter                  |
\| 50–64  | Faible potentiel         |
\| 65–74  | À approfondir            |
\| 75–84  | Opportunité intéressante |
\| 85–100 | Opportunité prioritaire  |

Conditions cumulatives pour une recommandation positive :

- Minimum 75/100.
- Minimum 10/15 en volonté de payer.
- Preuves suffisantes de demande.
- Différenciation concrète.
- Absence de risque éliminatoire non résolu.

Le score doit être accompagné d’un niveau de confiance distinct.

Un 82/100 fondé sur de faibles preuves ne vaut pas un 82/100 avec plusieurs éléments vérifiés.

\## 8.9. Fiabilité du scoring

Le système doit afficher :

- Nombre de sources utilisées.
- Qualité des sources.
- Ancienneté des informations.
- Données confirmées.
- Données estimées.
- Informations manquantes.
- Points de désaccord entre les sources.

Une information inconnue ne doit pas automatiquement obtenir zéro. Elle doit déclencher une insuffisance de preuve et réduire le niveau de confiance.

\## 8.10. Scoring des opportunités transversales

Le système doit distinguer deux types de scores :

\*\*1. SaaS Fit Score\*\*

Mesure la pertinence d'un SaaS comme candidat à étudier, selon les critères de sélection définis dans la section 1.

\*\*2. Opportunity Score\*\*

Mesure le potentiel commercial d'une opportunité de produit identifiée.

Le scoring sur 100 défini dans cette section s'applique à une hypothèse d'opportunité SaaS précise, et non automatiquement au SaaS dont proviennent les avis.

Pour la dimension Demande réelle, tenir compte :

- De la diversité des SaaS concernés.
- Du nombre d'utilisateurs distincts vérifiables.
- Du nombre d'entreprises concernées.
- De la fréquence des problèmes.
- De leur gravité.
- De leur persistance.
- De la qualité des preuves.

Ne pas attribuer une note élevée uniquement sur la base du nombre brut d'avis.

Les données insuffisantes doivent réduire le niveau de confiance et empêcher toute recommandation prématurée.

Chaque score doit être justifié par des preuves consultables.

\---

\# 9. FORMAT DU RAPPORT IA

Chaque analyse doit générer un rapport structuré.

\### Executive Summary

- Nom du SaaS ou de l'opportunité étudiée.
- Description.
- Score /100.
- Volonté de payer /15.
- Niveau de confiance.
- Verdict.
- Trois raisons principales de poursuivre ou d’abandonner.

\### Market Analysis

- Marché.
- Cible.
- Demande.
- Tendances.
- Concurrence.

\### Customer Pain Analysis

- Top 5 des problèmes clients.
- Nombre de sources pertinentes.
- Fréquence estimée.
- Exemples de plaintes.
- Liens vers les sources.

\### Cross-Competitor Pain Analysis

- Principaux Pain Point Clusters identifiés.
- Nombre de SaaS concernés.
- Nombre de retours pertinents.
- Nombre d'utilisateurs distincts vérifiés, lorsqu'ils sont disponibles.
- Nombre d'entreprises distinctes identifiées.
- Répartition des problèmes par concurrent.
- Problèmes persistants ou résolus.
- Workarounds identifiés.
- Solutions existantes.
- Évolution des plaintes.
- Sources originales et niveau de confiance.

\### Market Gap Analysis

- Problèmes communs à plusieurs concurrents.
- Besoins insuffisamment satisfaits.
- Fonctionnalités manquantes.
- Solutions actuelles insuffisantes.
- Opportunités de produits indépendants.
- Raisons pour lesquelles ces opportunités pourraient ne pas fonctionner.

\### Competitor Analysis

Tableau comparatif des concurrents.

\### Opportunity Map

Présenter les opportunités identifiées par ordre de priorité.

Pour chacune :

- Problème.
- Segment client.
- Solution proposée.
- Avantage concurrentiel.
- Difficulté de développement.
- Potentiel commercial.

\### Recommended Product

Décrire la meilleure version alternative à construire.

- Proposition de valeur.
- Cible initiale.
- Positionnement.
- Fonctionnalités du MVP.
- Fonctionnalités secondaires.
- Pricing hypothétique.
- Avantage principal.

\### Go-to-Market

- Canal d’acquisition prioritaire.
- Première audience à cibler.
- Méthode de prospection.
- Stratégie de lancement.
- Budget ou effort de validation.

\### Validation Plan

Produire une série d’expériences permettant de vérifier la demande avant de développer.

Exemples :

- Entretiens utilisateurs.
- Landing page.
- Démonstration.
- Préventes.
- Tests tarifaires.
- Pilotes payants.

Définir des seuils de réussite et d’abandon.

\### Risks & Kill Criteria

Lister :

- Raisons de ne pas construire.
- Risques techniques.
- Risques commerciaux.
- Risques concurrentiels.
- Risques réglementaires.
- Informations non vérifiées.

\### Final Verdict

Trois verdicts possibles :

- BUILD CANDIDATE.
- VALIDATE FIRST.
- REJECT.

Même un SaaS avec un score supérieur à 75 peut recevoir « VALIDATE FIRST » si les preuves commerciales sont insuffisantes.

\---

\# 10. PAGE 06 — MY OPPORTUNITIES

\## 10.1. Objectif

Espace personnel regroupant les SaaS qui méritent une attention particulière.

\## 10.2. Fonctionnalités

- Favoris.
- Collections personnalisées.
- Notes personnelles.
- Étiquettes.
- Historique des analyses.
- Scores IA.
- Statuts.
- Comparaison.

\## 10.3. Statuts

Chaque opportunité dispose d’un statut modifiable :

1. Discovered.
2. To Research.
3. Analyzing.
4. Validate.
5. Validated.
6. Rejected.
7. Building.

Un SaaS rejeté doit pouvoir être consulté à nouveau et réévalué si de nouvelles informations apparaissent.

Les opportunités générées à partir de Pain Point Clusters doivent également pouvoir posséder leurs propres statuts, indépendamment des SaaS dont proviennent les preuves.

\## 10.4. Collections

Exemples :

- Best SaaS Opportunities.
- MarTech.
- Marketing Analytics.
- US to France.
- High Potential.
- To Validate.
- Rejected Ideas.

\---

\# 11. PAGE 07 — COMPARATOR

Fonctionnalité permettant de sélectionner plusieurs SaaS et de les comparer.

Informations comparées :

- Produit.
- Positionnement.
- Clientèle.
- Prix.
- Fonctions principales.
- Taille.
- Ancienneté.
- Marché.
- Avis.
- Points forts.
- Points faibles.
- Concurrents.
- Scores IA.
- Niveau de confiance.

L’IA doit pouvoir répondre à :

« Parmi ces cinq SaaS, lequel présente la meilleure opportunité pour créer une alternative ? »

Elle doit justifier son choix en comparant les preuves disponibles, pas simplement choisir le score le plus élevé.

La comparaison doit également pouvoir être effectuée entre plusieurs opportunités générées à partir de Pain Point Clusters.

Dans ce cas, comparer :

- Problèmes identifiés.
- Segments clients.
- Nombre de SaaS concernés.
- Qualité des preuves.
- Demande observée.
- Volonté de payer.
- Solutions concurrentes.
- Différenciation.
- Faisabilité.
- Scores.
- Niveaux de confiance.

\---

\# 12. DONNÉES À COLLECTER — MODÈLE DE DONNÉES

Le produit doit avoir une base de données structurée.

\## 12.1. SaaS

Champs principaux :

- id.
- name.
- slug.
- logo_url.
- website_url.
- description.
- tagline.
- categories.
- subcategories.
- target_audience.
- business_model.
- pricing_status.
- founding_year.
- launch_year.
- headquarters_country.
- headquarters_city.
- employee_count_min.
- employee_count_max.
- company_type.
- founder_led.
- independent_status.
- official_status.
- first_discovered_at.
- last_verified_at.
- discovery_source.
- record_status.

\## 12.2. Product Features

- saas_id.
- feature_name.
- description.
- feature_category.
- availability.
- source_id.
- confidence.

\## 12.3. Pricing Plans

- saas_id.
- plan_name.
- monthly_price.
- annual_price.
- currency.
- billing_model.
- free_trial.
- free_plan.
- custom_pricing.
- checked_at.
- source_id.

\## 12.4. Company Signals

- saas_id.
- signal_type.
- signal_value.
- signal_date.
- evidence_url.
- confidence.
- verification_status.

Exemples :

- Avis clients.
- Témoignages.
- Études de cas.
- Évolution des effectifs.
- Annonces de financement.
- Activité commerciale.

\## 12.5. Customer Feedback

- saas_id.
- source_platform.
- source_url.
- published_at.
- rating.
- original_text.
- summarized_text.
- language.
- problem_category.
- severity.
- sentiment.
- recurring_issue_group.
- resolution_status.
- distinct_author_reference, lorsque disponible et autorisé.
- content_storage_status.
- confidence.

Le texte original ne doit être conservé que lorsque les conditions de la source et les droits applicables le permettent. Sinon, conserver uniquement les références, métadonnées et éléments dérivés autorisés.

\## 12.6. Competitors

- saas_id.
- competitor_id.
- relationship_type.
- similarity_score.
- explanation.
- source_id.

\## 12.7. Sources

Chaque information importante doit pouvoir remonter à sa source.

- id.
- saas_id.
- source_name.
- source_type.
- source_url.
- collected_at.
- published_at.
- verified_at.
- reliability_level.
- evidence_type.
- raw_reference.
- extraction_method.

\## 12.8. AI Analyses

- id.
- saas_id.
- analysis_type.
- model_identifier.
- prompt_version.
- analysis_status.
- individual_scores.
- total_score.
- willingness_to_pay_score.
- confidence_score.
- verdict.
- summary.
- report_content.
- created_at.
- completed_at.

Les analyses d'opportunités indépendantes d'un SaaS précis doivent également pouvoir être associées à un Pain Point Cluster et à plusieurs SaaS sources.

\## 12.9. Saved Searches

- id.
- name.
- filters_json.
- excluded_categories.
- sorting.
- created_at.
- updated_at.

\## 12.10. Collections

- id.
- name.
- description.
- created_at.

Table de liaison :

- collection_id.
- saas_id.
- added_at.
- personal_notes.
- status.

\## 12.11. Pain Point Clusters

Cette table regroupe les problèmes similaires identifiés à partir de plusieurs retours utilisateurs.

- id.
- name.
- description.
- category.
- target_persona.
- severity_score.
- recurrence_score.
- distinct_feedback_count.
- distinct_author_count.
- distinct_company_count.
- affected_saas_count.
- affected_competitors.
- first_detected_at.
- last_detected_at.
- confidence_score.
- analysis_status.

Les compteurs doivent distinguer les valeurs vérifiées des estimations.

\## 12.12. Pain Point Evidence

Cette table relie chaque problème à ses preuves originales.

- id.
- cluster_id.
- feedback_id.
- saas_id.
- source_id.
- evidence_summary.
- evidence_url.
- published_at.
- relevance_score.
- confidence_score.
- resolution_status.

Chaque preuve doit être traçable jusqu'à sa source d'origine.

\## 12.13. Generated Opportunities

Cette table stocke les hypothèses de produits SaaS générées à partir des problèmes identifiés.

- id.
- cluster_id.
- name.
- description.
- problem_statement.
- target_persona.
- proposed_solution.
- value_proposition.
- differentiation.
- competitors.
- business_model.
- pricing_hypothesis.
- feasibility_score.
- opportunity_score.
- willingness_to_pay_score.
- confidence_score.
- verdict.
- validation_status.
- created_at.
- updated_at.

Une opportunité peut être associée à plusieurs clusters et plusieurs SaaS sources. La structure doit permettre cette relation sans duplication des données.

\## 12.14. Validation Experiments

Cette table conserve les expériences commerciales réalisées pour vérifier les opportunités.

- id.
- opportunity_id.
- experiment_type.
- target_persona.
- hypothesis.
- sample_size.
- participants_count.
- positive_responses.
- qualified_interviews.
- paying_customers.
- revenue_generated.
- success_criteria.
- result.
- evidence_url.
- created_at.
- completed_at.

Les intentions, les réponses positives, les entretiens qualifiés, les pilotes et les paiements doivent être distingués.

\---

\# 13. SOURCES ET ENRICHISSEMENT DES DONNÉES

\## 13.1. Sources prioritaires

\| Source                 | Utilisation                                       |
\| ---------------------- | ------------------------------------------------- |
\| Site officiel          | Fonctionnalités, prix, positionnement             |
\| Product Hunt           | Découverte et lancements                          |
\| G2                     | Avis et retours clients                           |
\| Capterra               | Avis et comparaison                               |
\| Reddit                 | Problèmes et expériences utilisateurs             |
\| X                      | Activité des fondateurs et utilisateurs           |
\| LinkedIn               | Équipe et informations professionnelles publiques |
\| Crunchbase             | Informations d’entreprise et financement          |
\| AlternativeTo          | Alternatives et concurrents                       |
\| BuiltWith / Wappalyzer | Technologies détectables                          |
\| Similarweb             | Estimations de trafic, si accessibles             |

L’intégration doit dépendre des API, licences, autorisations et conditions d’utilisation disponibles.

Il ne faut pas construire le système sur du scraping non autorisé ou sur une dépendance à une seule source externe.

Une source ne doit pas être considérée comme intégrée tant que son connecteur n'a pas été développé, testé et validé.

\## 13.2. Hiérarchie de fiabilité

\*\*Niveau 1 : preuve primaire.\*\*

- Site officiel.
- Documentation.
- Page tarifaire.
- Publication officielle.
- Déclaration directe.

\*\*Niveau 2 : source spécialisée.\*\*

- G2.
- Capterra.
- Crunchbase.
- LinkedIn.
- Plateformes professionnelles.

\*\*Niveau 3 : source communautaire.\*\*

- Reddit.
- X.
- Forums.
- Discussions publiques.

\*\*Niveau 4 : estimation ou inférence.\*\*

- Estimation de revenus.
- Trafic estimé.
- Nombre de clients supposé.
- Analyse concurrentielle calculée.

Les niveaux 3 et 4 ne doivent pas être présentés comme des preuves directes de monétisation.

La fiabilité d'une source doit également être évaluée selon le type d'information recherché. Une discussion communautaire peut constituer une preuve pertinente d'une frustration utilisateur, mais pas nécessairement d'une dépense commerciale.

\## 13.3. Actualisation

Prévoir une actualisation différenciée :

- Prix : vérification périodique.
- Fonctionnalités : vérification périodique.
- Effectifs : lors de nouvelles données disponibles.
- Avis clients : nouvelles publications.
- Sources officielles : changements détectés.
- Concurrents : réévaluation régulière.

La date de dernière vérification doit être visible.

Pour les Pain Point Clusters, conserver également :

- Date de première détection.
- Date de dernière observation.
- Historique des volumes de retours.
- Évolution du nombre de SaaS concernés.
- Évolution du statut des problèmes.

\---

\# 14. SETTINGS

\## 14.1. Préférences de recherche

Configurer :

- Catégories prioritaires.
- Pays prioritaires.
- Effectifs souhaités.
- Clientèle cible.
- Exclusions.
- Types de business models.
- Seuil de validation.
- Marché géographique d’adaptation.

\## 14.2. Préférences IA

- Modèle utilisé.
- Mode d’analyse rapide ou approfondi.
- Nombre de sources minimum.
- Niveau de profondeur.
- Langue des rapports.
- Budget maximal par analyse.
- Historique des analyses.
- Version des prompts.

\## 14.3. Sources

Afficher :

- Sources activées.
- Statut des connecteurs.
- Date de dernière synchronisation.
- Erreurs éventuelles.
- Limites d’utilisation.
- État des quotas.

\## 14.4. Gestion des données

- Exporter les données.
- Supprimer les recherches.
- Supprimer les analyses.
- Export CSV.
- Export JSON.

\---

\# 15. ARCHITECTURE FONCTIONNELLE DES MOTEURS IA

Il faut impérativement séparer les trois moteurs.

\## Discovery Engine

Sa mission : trouver, identifier, filtrer et enrichir des SaaS.

Son résultat est un candidat documenté et exploitable.

\## Pain Point Intelligence Engine

Sa mission :

- Normaliser les retours utilisateurs.
- Extraire les problèmes structurés.
- Regrouper les plaintes similaires.
- Comparer les problèmes entre concurrents.
- Identifier les lacunes de marché.
- Générer des Pain Point Clusters.
- Alimenter l'Opportunity Engine avec des preuves vérifiables.

Son résultat est un ensemble de problématiques de marché documentées et reliées à leurs preuves originales.

\## Opportunity Engine

Sa mission : étudier un candidat précis ou un Pain Point Cluster, rechercher des preuves, analyser les faiblesses concurrentielles et évaluer le potentiel commercial.

Son résultat est un rapport de décision stratégique accompagné d'un score, d'un niveau de confiance et d'un verdict.

\## Composants partagés

Les trois moteurs doivent utiliser :

- Un système de sources.
- Une base de données commune.
- Un système de déduplication.
- Un moteur de recherche.
- Un système de preuves.
- Un journal d’exécution.
- Un système de contrôle qualité.

\## Architecture IA

Prévoir une couche indépendante du fournisseur de modèles.

L’objectif est de pouvoir changer de modèle sans réécrire le produit.

Le système pourra sélectionner un modèle adapté à la tâche :

- Extraction structurée.
- Classification des problèmes.
- Génération d'embeddings.
- Clustering et regroupement sémantique.
- Recherche et synthèse.
- Analyse concurrentielle.
- Raisonnement stratégique.
- Validation et vérification.

Le meilleur modèle disponible devra être choisi selon la qualité attendue, le coût, la latence et les capacités de recherche. Il ne faut pas supposer qu’un seul modèle sera optimal pour toutes les tâches.

Les analyses devront conserver :

- Le modèle utilisé.
- La version des instructions.
- Les sources utilisées.
- Les résultats.
- Les erreurs.
- Le coût estimé ou mesuré lorsque disponible.

\---

\# 16. SÉCURITÉ, FIABILITÉ ET QUALITÉ

Exigences obligatoires :

1. Ne jamais inventer une entreprise.

2) Ne jamais inventer de prix.

3. Ne jamais inventer des revenus.

4) Ne jamais inventer des clients.

5. Ne jamais inventer des avis.

6) Ne jamais fabriquer des liens de sources.

7. Distinguer les faits des estimations.

8) Identifier les informations contradictoires.

9. Afficher les dates de vérification.

10) Ne pas confondre présence d’une offre payante et preuve d’achat.

11. Détecter les doublons de SaaS.

12) Ne pas laisser les contenus récupérés depuis le web modifier les instructions internes des agents IA.

13. Respecter les conditions d’utilisation, les droits d’accès et les limitations des sources.

14) Permettre de corriger les informations incorrectes.

15. Ne pas confondre le nombre de retours clients avec le nombre de clients distincts.

16) Ne pas considérer une plainte comme une preuve de volonté de payer.

17. Ne pas présenter un problème comme non résolu sans élément permettant de le justifier.

18) Ne pas fusionner artificiellement des problèmes différents lors du clustering.

19. Relier les analyses et les opportunités aux preuves originales.

20) Distinguer les informations vérifiées, estimées, déclarées et inconnues.

21. Respecter les conditions de stockage et de réutilisation des contenus issus des différentes sources.

Tous les résultats IA doivent être reproductibles autant que raisonnablement possible grâce à la conservation des sources et versions d’analyse.

\---

\# 17. DESIGN ET EXPÉRIENCE UTILISATEUR

\### Direction artistique

Le produit doit avoir une identité professionnelle, moderne et technologique.

Références d’expérience :

- Linear.
- Stripe Dashboard.
- Product Hunt.
- Arc.
- Attio.

\### Principes

- Interface premium.
- Dark mode en priorité, avec mode clair possible.
- Typographie très lisible.
- Cartes compactes.
- Navigation rapide.
- Filtres faciles à manipuler.
- Tableaux propres.
- Hiérarchie visuelle claire.
- Animations discrètes.
- Excellent responsive design.

Le feed doit rester agréable même avec plusieurs centaines de résultats.

Le produit doit donner une impression d’outil d’intelligence commerciale plutôt que d’annuaire traditionnel.

Les Pain Point Clusters et les opportunités générées doivent être présentés de manière claire, avec un accès direct aux preuves, aux SaaS concernés et aux analyses associées.

\---

\# 18. PÉRIMÈTRE DU MVP

Il est essentiel de ne pas construire toutes les fonctionnalités simultanément.

Le MVP doit permettre de réaliser le parcours central de bout en bout.

\## MVP — Phase 1

\### Discovery

- Base SaaS structurée.
- Import de données.
- Ajout manuel d’un SaaS.
- Recherche textuelle.
- Filtres fondamentaux.
- Feed et grille.
- Pagination.
- Cartes SaaS.

\### SaaS Profiles

- Fiche détaillée.
- Informations générales.
- Tarification.
- Fonctionnalités.
- Sources.
- Concurrents principaux.
- Avis disponibles.

\### Opportunity Engine

- Analyse approfondie.
- Recherche des plaintes.
- Extraction structurée des problèmes.
- Classification des problèmes.
- Clustering sémantique des retours.
- Analyse des problèmes communs à plusieurs concurrents.
- Création de Pain Point Clusters.
- Génération d'opportunités SaaS indépendantes.
- Analyse concurrentielle.
- Recherche de preuves commerciales.
- Scoring sur 100.
- Seuil de 75/100.
- Seuil de volonté de payer de 10/15.
- Niveau de confiance distinct.
- Sources et preuves consultables.
- Verdict final.
- Rapport exportable.

\### Workspace

- Favoris.
- Collections.
- Statuts.
- Historique des analyses.
- Comparaison simple.

\### AI Discovery

- Première recherche en langage naturel.
- Interprétation des filtres.
- Découverte via un nombre limité de connecteurs fiables.
- Déduplication.
- Ajout des résultats dans la base.

Le MVP doit permettre de tester le parcours complet sur un ensemble limité de SaaS et de sources dont l'accès est autorisé.

Priorité absolue : vérifier la qualité de la détection des problèmes et la pertinence des opportunités générées avant d'étendre le nombre de connecteurs.

\## Phase 2 — Enrichissement

- Plus de sources.
- Synchronisation régulière.
- Recherche automatique récurrente.
- Détection des changements.
- Comparateur avancé.
- Recherche sémantique.
- Scores de correspondance.
- Alertes.
- Enrichissement des Pain Point Clusters.
- Historique des problèmes.
- Suivi de leur évolution.
- Amélioration de la détection des utilisateurs et entreprises distincts.

\## Phase 3 — Intelligence avancée

- Découverte autonome de candidats.
- Analyse automatique des concurrents.
- Détection de nouvelles opportunités.
- Comparaison de portefeuilles d’opportunités.
- Recommandations personnalisées.
- Historique des évolutions de marché.
- Identification des SaaS dont les faiblesses augmentent.
- Détection automatique des nouvelles lacunes de marché.
- Génération autonome d'opportunités à partir de plusieurs Pain Point Clusters.
- Suivi des expériences de validation commerciale.

\---

\# 19. CRITÈRES D’ACCEPTATION DU PRODUIT

Le MVP ne sera considéré comme fonctionnel que si les tests suivants sont réussis.

\## Discover

- Un utilisateur peut consulter les SaaS.
- Les cartes présentent des données cohérentes.
- Les filtres se combinent correctement.
- Les tris fonctionnent.
- Les favoris sont conservés.
- La pagination ne crée aucun doublon.

\## SaaS Profile

- Chaque SaaS possède une fiche unique.
- Les données principales sont accessibles.
- Les sources sont consultables.
- Les concurrents sont identifiés.
- Les données inconnues sont explicites.

\## Discovery Engine

- Le moteur comprend les critères en langage naturel.
- Il trouve de vrais SaaS.
- Il respecte les exclusions.
- Il déduplique les résultats.
- Il affiche les sources.
- Il n’invente pas d’informations.

\## Pain Point Intelligence Engine

- Il collecte les retours à partir de connecteurs autorisés.
- Il distingue les retours individuels des problèmes structurés.
- Il extrait les problèmes avec des champs cohérents.
- Il regroupe les problèmes similaires.
- Il évite les regroupements sémantiquement incorrects.
- Il identifie les SaaS concernés par chaque cluster.
- Il distingue les volumes d'avis, les auteurs distincts et les entreprises distinctes lorsque ces données sont disponibles.
- Il relie chaque cluster à ses preuves originales.
- Il distingue les problèmes résolus, non résolus et inconnus.
- Il produit un niveau de confiance.
- Il peut conclure qu'un problème récurrent ne représente pas une opportunité commerciale intéressante.

\## Opportunity Engine

- Il effectue une recherche approfondie.
- Il distingue preuves et hypothèses.
- Il analyse la concurrence.
- Il identifie les problèmes clients.
- Il exploite les Pain Point Clusters.
- Il peut générer des opportunités indépendantes d'un SaaS précis.
- Il génère les six scores.
- Il calcule le score final correctement.
- Il respecte les seuils de validation.
- Il peut rejeter une opportunité.
- Il produit un rapport sourcé.

\## Workspace

- Les SaaS peuvent être sauvegardés.
- Les collections fonctionnent.
- Les analyses restent accessibles.
- Les comparaisons utilisent les bonnes fiches.
- Les opportunités indépendantes peuvent être sauvegardées.
- Les statuts des opportunités peuvent être modifiés.

\---

\# 20. INDICATEURS DE PERFORMANCE

Le produit doit mesurer sa propre efficacité.

\## Discovery

- Nombre total de SaaS en base.
- Nouveaux SaaS découverts.
- Taux de doublons.
- Taux de candidats conformes aux filtres.
- Part des fiches suffisamment enrichies.
- Fraîcheur des données.

\## AI Opportunity

- Nombre d’analyses réalisées.
- Coût moyen par analyse.
- Temps moyen d’exécution.
- Part des analyses suffisamment sourcées.
- Répartition des verdicts.
- Nombre d’opportunités dépassant 75/100.

\## Pain Point Intelligence

- Nombre de retours clients collectés.
- Nombre de retours exploitables.
- Nombre de Pain Point Clusters générés.
- Nombre de SaaS concernés par les clusters.
- Nombre d'utilisateurs distincts identifiés.
- Nombre d'entreprises distinctes identifiées.
- Nombre de clusters touchant plusieurs concurrents.
- Part des clusters reliés à des preuves consultables.
- Taux de regroupements incorrects détectés.
- Évolution des problèmes identifiés.
- Nombre d'opportunités indépendantes générées à partir des clusters.

\## Utilité réelle

- Nombre de SaaS sauvegardés.
- Nombre de SaaS approfondis.
- Nombre d’opportunités validées.
- Nombre de validations commerciales réalisées.
- Nombre de préventes ou de paiements obtenus.
- Taux de conversion entre découverte et opportunité validée.

L’indicateur de réussite ultime n’est pas le nombre de SaaS dans la base.

C’est le nombre d’opportunités commerciales réellement validées grâce à la plateforme.

\---

\# 21. DÉCISIONS PRODUIT VERROUILLÉES

Les décisions suivantes constituent la référence pour le développement de la V1.

\| Sujet                           | Décision                                                                      |
\| ------------------------------- | ----------------------------------------------------------------------------- |
\| Nature du produit               | Plateforme de découverte et d’intelligence SaaS                               |
\| Utilisateur initial             | Fondateur / entrepreneur                                                      |
\| Clientèle recherchée            | Priorité B2B                                                                  |
\| Marché de découverte            | États-Unis en priorité                                                        |
\| Taille d’entreprise privilégiée | 1–20 employés                                                                 |
\| Type d’entreprise               | Indépendante, founder-led, petite équipe                                      |
\| Monétisation                    | Signes crédibles de clients payants obligatoires pour valider une opportunité |
\| Marché cible d’adaptation       | France en priorité                                                            |
\| Catégories                      | Multiples, sans restriction à une seule niche                                 |
\| Affiliate / Partner             | Exclusion permanente                                                          |
\| Expérience principale           | Feed de découverte                                                            |
\| Détail produit                  | Fiche complète et concurrents                                                 |
\| Moteur IA 1                     | Discovery Engine                                                              |
\| Moteur IA 2                     | Pain Point Intelligence Engine                                                |
\| Moteur IA 3                     | Opportunity Engine                                                            |
\| Scoring                         | Six dimensions, sur 100                                                       |
\| Score minimum                   | 75/100                                                                        |
\| Volonté de payer                | 10/15 minimum                                                                 |
\| Verdict                         | BUILD CANDIDATE / VALIDATE FIRST / REJECT                                     |
\| Sources                         | Traçables et datées                                                           |
\| Architecture IA                 | Indépendante du fournisseur de modèles                                        |

\---

\# 22. STACK TECHNIQUE ENVISAGÉE

À confirmer au moment de la spécification technique.

\| Composant        | Technologie                                     |
\| ---------------- | ----------------------------------------------- |
\| Frontend         | Next.js + App Router                            |
\| Langage          | TypeScript                                      |
\| UI               | Tailwind CSS                                    |
\| Composants       | shadcn/ui + Radix                               |
\| Base de données  | Supabase / PostgreSQL                           |
\| Recherche        | PostgreSQL Full Text + recherche vectorielle    |
\| Authentification | Supabase Auth                                   |
\| Backend          | Next.js API / services dédiés                   |
\| Jobs             | Queue de tâches                                 |
\| IA               | API multi-modèles                               |
\| Recherche web    | Connecteurs de recherche et sources autorisées  |
\| Clustering       | Embeddings + pgvector + logique de regroupement |
\| Hébergement      | Vercel                                          |
\| Monitoring       | Logs, erreurs, coût et durée des agents         |

Architecture recommandée : séparer le frontend, les services de collecte, les tâches d’enrichissement et les moteurs IA.

Ne pas lancer les analyses longues directement dans une requête HTTP classique. Elles doivent fonctionner comme des tâches asynchrones avec progression, reprise et gestion des erreurs.

\---

\# 23. DÉFINITION DU PRODUIT TERMINÉ

SaaS Opportunity Radar sera considéré comme opérationnel lorsque l’utilisateur pourra suivre ce parcours sans intervention technique :

1. Ouvrir Discover.
2. Faire défiler des SaaS.
3. Appliquer ses propres filtres.
4. Ouvrir un SaaS.
5. Comprendre son fonctionnement et sa clientèle.
6. Examiner ses concurrents.
7. Consulter les avis et les problèmes de ses utilisateurs.
8. Cliquer sur Analyze Opportunity.
9. Laisser l’IA mener une recherche structurée.
10. Recevoir un rapport stratégique avec preuves et sources.
11. Obtenir un score et un verdict.
12. Sauvegarder l’opportunité.
13. La comparer à d’autres.
14. Déterminer si elle mérite une validation commerciale.

Le système doit également pouvoir découvrir de nouveaux candidats sans que l’utilisateur ait à trouver manuellement leurs noms.

Il doit également pouvoir suivre un second parcours :

1. Identifier plusieurs SaaS appartenant à un même marché.
2. Collecter leurs retours clients accessibles.
3. Extraire les problèmes rencontrés.
4. Regrouper les plaintes similaires.
5. Identifier les problèmes communs à plusieurs concurrents.
6. Générer des Pain Point Clusters.
7. Détecter les besoins insuffisamment satisfaits.
8. Générer des opportunités SaaS indépendantes.
9. Rechercher des preuves commerciales.
10. Attribuer un score et un niveau de confiance.
11. Produire un rapport stratégique.
12. Déterminer si l'opportunité mérite une validation commerciale.

\---

\# CONCLUSION

SaaS Opportunity Radar doit devenir notre environnement de recherche permanent.

Il ne s’agit pas de trouver le SaaS qui possède le plus de fonctionnalités ou le plus de clients.

Il s’agit de trouver celui qui réunit les caractéristiques suivantes :

- Il existe déjà.
- Il a déjà une clientèle qui paie.
- Il répond à un vrai problème.
- Il possède des faiblesses identifiables.
- Ses clients expriment des besoins insatisfaits.
- Une meilleure alternative est techniquement réalisable.
- Il existe un marché accessible.
- Nous avons une raison crédible de pouvoir faire mieux.

Il s'agit également d'identifier les problèmes qui dépassent un seul logiciel :

- Le même problème apparaît chez plusieurs concurrents.
- Plusieurs entreprises rencontrent une difficulté similaire.
- Les solutions existantes ne répondent pas correctement au besoin.
- Les utilisateurs mettent en place des contournements.
- Une solution indépendante pourrait apporter une valeur supérieure.
- Des preuves commerciales permettent de justifier son développement.

\*\*Principe directeur : découvrir beaucoup, vérifier les faits, analyser peu à peu les meilleurs candidats, identifier les problèmes communs aux marchés et ne construire que les opportunités véritablement validées.\*\*