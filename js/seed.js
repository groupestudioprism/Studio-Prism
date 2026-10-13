/* Studio Prism — formules d'EXEMPLE d'ArchiVision.
 *
 * Ce fichier n'est lu que par le bouton « Ajouter les formules d'exemple d'ArchiVision » de l'administration (Offres et prix), une seule
 * fois, pour remplir Firestore. Ensuite, formules et PRIX vivent uniquement dans Firestore et se modifient depuis l'administration :
 * le site n'affiche jamais les valeurs de ce fichier. Un document déjà présent n'est jamais écrasé.
 *
 * Rien n'oblige un produit à avoir ces formules : Free / Pro / Pro Entreprise ne sont qu'un exemple (un produit peut n'avoir qu'une
 * formule gratuite, un achat unique, un abonnement sans formule annuelle, un simple devis, ou aucune formule).
 * Le produit ArchiVision lui-même fait partie du catalogue intégré (js/catalog.js), importé par « Importer le catalogue du site ».
 */
const FREE = [
  "Création de compte", "Gestion de projets", "Visualisation 3D", "Fonctions AR disponibles", "Visualisation BIM disponible",
  "Gestion de base des projets", "Export standard", "Espace personnel"
];
const PRO = FREE.concat([
  "Projets illimités", "Fonctions 3D avancées", "Fonctions AR avancées disponibles dans l’application",
  "Fonctions BIM avancées disponibles dans l’application", "Gestion avancée des projets", "Exports professionnels / haute qualité",
  "Historique et gestion avancée des projets", "Expérience sans limitation artificielle", "Support prioritaire"
]);
const ENT = PRO.concat(["Nombre d’utilisateurs adapté à votre structure", "Gestion des utilisateurs de l’entreprise : à venir"]);

const base = { productId: "archivision", productName: "ArchiVision", status: "active", featured: false };

export const SEED = {
  plans: [
    {
      plan: { ...base, id: "archivision-free", name: "Free", description: "Pour découvrir ArchiVision avec votre compte Studio Prism.",
        mode: "free", licenseType: "free", features: FREE, displayOrder: 1 },
      prices: []
    },
    {
      plan: { ...base, id: "archivision-pro", name: "Pro", description: "Pour les professionnels qui souhaitent exploiter pleinement ArchiVision. Sans engagement en mensuel.",
        mode: "subscription", licenseType: "pro", features: PRO, featured: true, displayOrder: 2 },
      prices: [{ period: "monthly", amount: 14.9, currency: "EUR" }, { period: "yearly", amount: 149, currency: "EUR" }]
    },
    {
      plan: { ...base, id: "archivision-pro-entreprise", name: "Pro Entreprise", description: "Pour les équipes et les entreprises : les fonctionnalités Pro, avec un nombre d’utilisateurs adapté à votre structure.",
        mode: "quote", licenseType: "pro_entreprise", features: ENT, displayOrder: 3 },
      prices: []
    }
  ]
};
