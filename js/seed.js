/* Studio Prism — offres et prix DE DÉPART de toutes les applications (propositions, à ajuster dans l'administration).
 *
 * Lu uniquement par « Ajouter les offres de départ de toutes les applications » (administration, Offres et prix), qui remplit Firestore
 * une seule fois : un produit ou une formule déjà présent n'est jamais écrasé. Ensuite, produits, formules et PRIX vivent uniquement dans
 * Firestore et se modifient depuis l'administration (le site n'affiche jamais les valeurs de ce fichier).
 *
 * Modèle tarifaire : abonnement MENSUEL ou ANNUEL uniquement (jamais d'achat à vie), mises à jour gratuites, essai gratuit d'1 mois,
 * offre Étudiant (un seul pack pour toutes les applications), offre Entreprise sur devis. Annuel = 10 mensualités (2 mois offerts).
 */

/* Fonctionnalités communes à toutes les applications : catalogue prédéfini (réutilisable dans l'éditeur d'offres). */
export const COMMON = {
  trial: ["Essai complet gratuit pendant 1 mois", "Aucune carte bancaire demandée", "Espace personnel Studio Prism"],
  pro: ["Toutes les fonctionnalités de l’application", "Projets illimités", "Mises à jour gratuites", "Exports haute qualité", "Support par e-mail", "Sans engagement en mensuel"],
  student: ["Toutes les applications Studio Prism dans un seul pack", "Mises à jour gratuites", "Usage pédagogique (justificatif étudiant)", "Exports haute qualité"],
  team: ["Tout le contenu de l’offre Pro", "Nombre d’utilisateurs adapté à votre structure", "Gestion des licences de l’équipe", "Support prioritaire", "Accompagnement et formation"]
};

/* Fonctionnalités propres à chaque application. */
export const APPS = [
  { id: "archiplan", name: "ARCHIPLAN", monthly: 14.9, yearly: 149, logo: "assets/img/apps/archiplan.svg", image: "assets/img/ArchiPlan.png", web: "https://archiplan.studio-prism.com/",
    tagline: "Conception de plans et modélisation 3D",
    description: "Dessinez vos plans, modélisez en 3D, calculez vos quantités et exportez en un seul outil, compatible ArchiVision.",
    features: ["Plans 2D et modélisation 3D", "Métrés et quantités automatiques", "Bibliothèque d’objets et de matériaux", "Compatible ArchiVision (visite 3D et AR)", "Export PDF, images et formats d’échange"] },
  { id: "architrafic", name: "ARCHITRAFIC", monthly: 12.9, yearly: 129, logo: "assets/img/apps/architrafic.svg", image: "assets/img/ArchiTraffic.jpg", web: "https://architraffic.studio-prism.com/",
    tagline: "Routes barrées, déviations et simulation du trafic",
    description: "Concevez les plans de signalisation et de déviation de vos chantiers, simulez le trafic et gérez le chantier.",
    features: ["Plans de signalisation temporaire", "Déviations et routes barrées", "Simulation du trafic", "Gestion de chantier", "Compatible ARCHIPLAN"] },
  { id: "archivision", name: "ArchiVision", monthly: 14.9, yearly: 149, logo: "assets/img/apps/archivision.png",
    tagline: "Maquettes BIM en visite 3D et réalité augmentée",
    description: "Explorez, isolez, analysez et mesurez vos maquettes BIM en visite 3D et en réalité augmentée.",
    features: ["Visite 3D de maquettes BIM", "Réalité augmentée", "Mesures et analyses", "Isolation par lots et niveaux", "Compatible ARCHIPLAN"] },
  { id: "archiindus", name: "ARCHIINDUS", monthly: 14.9, yearly: 149, logo: "assets/img/apps/archiindus.svg",
    tagline: "Conception et suivi de sites industriels",
    description: "L’application de la gamme Archi dédiée aux sites industriels, intégrée à la suite Studio Prism.",
    features: ["Conception de sites industriels", "Équipements et réseaux", "Compatible ARCHIPLAN"] },
  { id: "nexus", name: "NEXUS", monthly: 7.9, yearly: 79, logo: "assets/img/apps/nexus.svg", web: "https://groupestudioprism.github.io/Nexus/",
    tagline: "Automatisations entre les applications Studio Prism",
    description: "Reliez vos applications et automatisez vos tâches répétitives, avec AXION.",
    features: ["Automatisations entre applications", "Assistant AXION", "Scénarios illimités"] },
  { id: "spectrawriter", name: "SPECTRA Writer", monthly: 4.9, yearly: 49, logo: "assets/img/apps/writer.svg",
    tagline: "Traitement de texte", description: "Rédigez rapports, courriers et documents professionnels dans un traitement de texte moderne.",
    features: ["Mise en page professionnelle", "Modèles de documents", "Export PDF et Word"] },
  { id: "spectracalc", name: "SPECTRA Calc", monthly: 4.9, yearly: 49, logo: "assets/img/apps/calc.svg",
    tagline: "Tableur", description: "Calculs, tableaux et graphiques dans un tableur rapide et complet.",
    features: ["Formules et fonctions avancées", "Graphiques", "Import et export Excel"] },
  { id: "spectraslide", name: "SPECTRA Slide", monthly: 4.9, yearly: 49, logo: "assets/img/apps/slide.svg",
    tagline: "Présentations", description: "Créez des présentations soignées, prêtes à projeter.",
    features: ["Modèles de présentations", "Transitions et animations", "Export PDF et PowerPoint"] },
  { id: "spectramotion", name: "SPECTRA Motion", monthly: 7.9, yearly: 79, logo: "assets/img/apps/motion.svg",
    tagline: "Animation et montage", description: "Animez vos visuels et montez vos vidéos de présentation.",
    features: ["Animation de calques", "Montage vidéo", "Export vidéo haute qualité"] }
];

/* Pack Étudiant : une seule offre pour toutes les applications. */
export const STUDENT = { id: "studio-prism-etudiant", name: "Pack Étudiant", monthly: 4.9, yearly: 49, logo: "assets/img/studio-prism.png",
  tagline: "Toutes les applications Studio Prism, au tarif étudiant",
  description: "Un seul abonnement étudiant donne accès à toutes les applications Studio Prism." };

/* Catalogue de fonctionnalités prédéfinies (groupe → libellés), proposé dans l'éditeur d'offres tant que l'administrateur n'a pas le sien. */
export const DEFAULT_FEATURES = [
  ...Object.entries(COMMON).flatMap(([k, l]) => l.map((label) => ({ label, group: { trial: "Essai", pro: "Pro", student: "Étudiant", team: "Entreprise" }[k] }))),
  ...APPS.flatMap((a) => a.features.map((label) => ({ label, group: a.name })))
];

/* Modèles de fiche produit proposés par défaut. */
export const DEFAULT_TEMPLATES = [
  { id: "application", name: "Application (abonnement)", fields: { category: "application", pole: "app", stage: "released", tagline: "", description: "", availability: "Disponible en abonnement mensuel ou annuel — essai gratuit d’1 mois",
    info: "Abonnement : mensuel ou annuel\nMises à jour : gratuites\nEssai : 1 mois gratuit\nOffre étudiant : pack toutes applications", platforms: ["Web"],
    highlights: ["Essai gratuit d’1 mois", "Mises à jour gratuites", "Sans engagement en mensuel", "Compatible avec la suite Studio Prism"] } },
  { id: "jeu", name: "Jeu", fields: { category: "game", pole: "game", stage: "concept", tagline: "", description: "", availability: "Concept expérimental — non disponible", info: "Genre : \nStatut : concept", platforms: ["Roblox"], highlights: [] } },
  { id: "objet-3d", name: "Objet 3D", fields: { category: "3d", pole: "p3d", stage: "concept", tagline: "", description: "", availability: "Concept — prix et dimensions à confirmer", info: "Matériaux : PLA ou PETG\nProcédé : impression 3D", platforms: [], highlights: [] } }
];

const plansOf = (a) => {
  const base = { productId: a.id, productName: a.name, status: "active", featured: false };
  return [
    { plan: { ...base, id: a.id + "-essai", name: "Essai gratuit", description: "Testez toute l’application pendant 1 mois, sans carte bancaire.", mode: "free", licenseType: "free", features: COMMON.trial, displayOrder: 1 }, prices: [] },
    { plan: { ...base, id: a.id + "-pro", name: "Pro", description: "Toutes les fonctionnalités, mises à jour gratuites. Sans engagement en mensuel, 2 mois offerts en annuel.", mode: "subscription", licenseType: "pro", features: a.features.concat(COMMON.pro), featured: true, displayOrder: 2 },
      prices: [{ period: "monthly", amount: a.monthly, currency: "EUR" }, { period: "yearly", amount: a.yearly, currency: "EUR" }] },
    { plan: { ...base, id: a.id + "-entreprise", name: "Entreprise", description: "Pour les équipes : nombre d’utilisateurs adapté, gestion des licences, accompagnement.", mode: "quote", licenseType: "pro_entreprise", features: a.features.concat(COMMON.team), displayOrder: 3 }, prices: [] }
  ];
};

export const SEED = {
  /* produits à créer s'ils n'existent pas (publiés : leurs offres s'affichent aussitôt sur le site) */
  products: APPS.map((a, i) => ({ id: a.id, name: a.name, tagline: a.tagline, description: a.description, logo: a.logo, image: a.image || "", website: a.web || "", displayOrder: i + 1 }))
    .concat([{ id: STUDENT.id, name: STUDENT.name, tagline: STUDENT.tagline, description: STUDENT.description, logo: STUDENT.logo, image: "", website: "", displayOrder: 20 }]),
  plans: APPS.flatMap(plansOf).concat([{
    plan: { productId: STUDENT.id, productName: STUDENT.name, status: "active", featured: true, id: STUDENT.id + "-etudiant", name: "Étudiant", description: "Toutes les applications Studio Prism dans un seul pack, sur justificatif étudiant.",
      mode: "subscription", licenseType: "etudiant", features: COMMON.student.concat(APPS.map((a) => a.name)), displayOrder: 1 },
    prices: [{ period: "monthly", amount: STUDENT.monthly, currency: "EUR" }, { period: "yearly", amount: STUDENT.yearly, currency: "EUR" }]
  }])
};
