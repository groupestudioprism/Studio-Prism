/* Studio Prism — textes légaux du site : mentions légales, confidentialité, CGU, CGV, cookies, accessibilité.
 * Chargé après app.js : remplit LG (titres) et LT (sections) utilisés par legal() dans app.js.
 * L'identité de l'éditeur (raison sociale, SIRET, adresse, e-mail, directeur de la publication, médiateur) n'est pas écrite ici :
 * elle vient de la fiche Administration › Infos légales (copie publique settings/legal dans Firestore), affichée à la place des
 * repères « [À COMPLÉTER] ». Aucune donnée inventée : un champ vide reste signalé.
 * Textes rédigés le 19/11/2026 d'après la LCEN, le RGPD, le Code de la consommation et les recommandations de la CNIL.
 * À faire relire par un juriste avant l'ouverture de la vente aux particuliers. */
(function () {
  'use strict';
  const DATE = '19 novembre 2026';
  const LABEL = { legalName: 'raison sociale', tradeName: 'nom commercial', legalForm: 'forme juridique', capital: 'capital social', address: 'adresse du siège',
    siret: 'SIRET', rcs: 'immatriculation (RCS)', vatNumber: 'n° de TVA', email: 'e-mail de contact', phone: 'téléphone', director: 'directeur de la publication',
    mediatorName: 'médiateur de la consommation', mediatorUrl: 'site du médiateur' };
  // valeur de la fiche légale ; « opt » : morceau masqué si le champ est vide (le reste du texte reste correct)
  const f = (k) => `<span data-lg="${k}">[À COMPLÉTER : ${LABEL[k]}]</span>`;
  const opt = (k, before, after) => `<span data-lg-opt="${k}" hidden>${before || ''}<span data-lg="${k}"></span>${after || ''}</span>`;
  const link = (h, t) => `<a class="more" href="${h}">${t}</a>`;
  const ext = (h, t) => `<a class="more" href="${h}" target="_blank" rel="noopener">${t}</a>`;
  const ul = (a) => `<ul class="lg-ul">${a.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  const ID = `${f('legalName')}${opt('legalForm', ', ')}${opt('capital', ', au capital de ')}, dont le siège est situé ${f('address')}, immatriculée sous le numéro SIRET ${f('siret')}${opt('rcs', ' (', ')')}${opt('vatNumber', ', TVA intracommunautaire ')}`;
  const MAIL = `<a class="more" data-lg-mail href="#/contact">${f('email')}</a>`;
  const APPS = 'ArchiPlan, ArchiTraffic, ArchiVision, ArchiPhase, SPECTRA Writer, SPECTRA Calc, SPECTRA Slide, SPECTRA Motion, Nexus, Prism Arcade';
  const HOST_GH = 'GitHub Pages — GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis (https://pages.github.com)';
  const HOST_FB = 'Firebase — Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043, États-Unis (https://firebase.google.com)';

  Object.assign(LG, { cgv: 'Conditions générales de vente', accessibilite: 'Accessibilité' });
  Object.assign(LK, { cgv: 'cv', accessibilite: 'ac' });
  LT.ml = [
    ['Éditeur', `Le site studio-prism.com et les applications Studio Prism publiées sur ses sous-domaines (${APPS}) sont édités par ${ID}. Nom commercial : Studio Prism.`],
    ['Directeur de la publication', f('director')],
    ['Contact', `E-mail : ${MAIL}${opt('phone', ' · Téléphone : ')}. Vous pouvez aussi utiliser le ${link('#/contact', 'formulaire de contact')}.`],
    ['Hébergement', ul([`Site et applications : ${HOST_GH}.`, `Comptes, projets enregistrés et fichiers : ${HOST_FB}.`])],
    ['Médiation de la consommation', `En cas de litige avec un consommateur, et après une réclamation écrite restée sans réponse satisfaisante, le consommateur peut recourir gratuitement au médiateur : ${f('mediatorName')}${opt('mediatorUrl', ' — ')}. Voir aussi les ${link('#/cgv', 'CGV')}.`],
    ['Propriété intellectuelle', `Les textes, logos (Studio Prism, ${APPS}, Prism App, Prism Game, Prism 3D), interfaces, visuels et codes du site et des applications sont la propriété de Studio Prism, sauf mention contraire. Toute reproduction ou réutilisation sans autorisation écrite est interdite (art. L122-4 du Code de la propriété intellectuelle). Les contenus que vous créez avec les applications restent les vôtres (${link('#/conditions-utilisation', 'conditions d’utilisation')}).`],
    ['Statut des projets présentés', 'Les projets en conception et les concepts Prism Game et Prism 3D présentés sur le site sont des projets de Studio Prism, et non des réalisations pour des clients. Ils peuvent évoluer.'],
    ['Responsabilité', 'Studio Prism s’efforce de fournir des informations exactes et à jour mais ne peut garantir l’absence d’erreur. Les liens vers des sites tiers sont fournis à titre d’information : Studio Prism n’est pas responsable de leur contenu.'],
    ['Données personnelles et cookies', `Voir la ${link('#/confidentialite', 'politique de confidentialité')} et la page ${link('#/cookies', 'Cookies et données')}.`]
  ];
  LT.pc = [
    ['Responsable du traitement', `${ID}. Contact pour toute question sur vos données : ${MAIL}.`],
    ['Données traitées', ul([
      '<b>Compte Studio Prism</b> : prénom, nom, adresse e-mail, mot de passe (géré par Firebase Authentication : Studio Prism ne le voit jamais), type de compte ; pour une entreprise : nom, SIRET, fonction, téléphone, site internet et nombre d’utilisateurs souhaité ; dates de création et de dernière connexion ; code PIN (seule son empreinte hachée est enregistrée).',
      '<b>Licences et commandes</b> : formules, clés de licence, devis, acceptations, paiements et rétractations.',
      '<b>Contenus des applications</b> : projets, plans, plannings, documents et fichiers que vous enregistrez dans le cloud Studio Prism, leurs partages et l’espace utilisé. Les projets non enregistrés dans le cloud restent dans votre navigateur.',
      '<b>Sécurité</b> : appareils autorisés sur le compte (identifiant technique de l’appareil, navigateur, date), pour limiter le partage de compte.',
      '<b>Échanges</b> : messages, demandes de devis ou de rendez-vous que vous nous adressez.'])],
    ['Finalités et bases légales', ul([
      'Créer et gérer votre compte, fournir les applications et le stockage cloud : exécution du contrat (art. 6.1.b du RGPD).',
      'Répondre à vos demandes et établir des devis : mesures précontractuelles (art. 6.1.b).',
      'Facturation, comptabilité, preuve des commandes : obligation légale (art. 6.1.c).',
      'Sécurité du service, prévention de la fraude et du partage de comptes : intérêt légitime de Studio Prism (art. 6.1.f).'])],
    ['Durées de conservation', ul([
      'Compte et contenus : tant que le compte est utilisé. Vous pouvez le supprimer à tout moment (' + link('compte-suppression.html', 'suppression du compte') + '). Un compte resté inactif 3 ans est supprimé après un message d’information.',
      'Demandes sans suite : 3 ans après le dernier échange.',
      'Devis, commandes et factures : 10 ans (art. L123-22 du Code de commerce).',
      'Données de sécurité des appareils : jusqu’au retrait de l’appareil ou la suppression du compte.'])],
    ['Destinataires et sous-traitants', `Les données sont réservées à Studio Prism. Elles sont hébergées par ses sous-traitants : Google (Firebase : authentification, base de données Cloud Firestore, stockage des fichiers) et GitHub (hébergement des pages du site et des applications, qui reçoit l’adresse IP des visiteurs). Elles ne sont ni vendues ni utilisées à des fins publicitaires.`],
    ['Transferts hors de l’Union européenne', 'Google LLC et GitHub, Inc. sont établis aux États-Unis. Les transferts sont encadrés par la décision d’adéquation de la Commission européenne du 10 juillet 2023 (Data Privacy Framework UE–États-Unis), à laquelle ces sociétés sont certifiées, et par les clauses contractuelles types de la Commission européenne.'],
    ['Vos droits', `Vous pouvez accéder à vos données, les rectifier, les effacer, en limiter le traitement, vous y opposer, demander leur portabilité et définir des directives sur leur sort après votre décès, en écrivant à ${MAIL}. Nous répondons sous un mois. Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL (${ext('https://www.cnil.fr/fr/plaintes', 'cnil.fr')}).`],
    ['Sécurité', 'Connexions chiffrées (HTTPS), mots de passe gérés par Firebase Authentication, règles d’accès strictes à la base de données (chaque utilisateur ne lit que ses propres données), code PIN et contrôle des appareils autorisés.'],
    ['Mineurs', 'Les comptes Studio Prism sont destinés aux personnes de 15 ans et plus. En dessous, l’accord d’un titulaire de l’autorité parentale est nécessaire.'],
    ['Cookies', `Le site ne dépose aucun cookie publicitaire ni de mesure d’audience : voir ${link('#/cookies', 'Cookies et données')}.`]
  ];
  LT.cu = [
    ['Objet', `Ces conditions encadrent l’utilisation du site studio-prism.com, des comptes Studio Prism et des applications Studio Prism (${APPS}). La vente des formules payantes relève en plus des ${link('#/cgv', 'conditions générales de vente')}.`],
    ['Accès', 'Le site est accessible librement. Les applications nécessitent un compte Studio Prism. Studio Prism peut faire évoluer, suspendre ou interrompre un service, notamment pour maintenance, en prévenant les utilisateurs quand c’est possible.'],
    ['Compte', 'Vous vous engagez à fournir des informations exactes et à garder vos identifiants et votre code PIN confidentiels. Un compte est personnel : il ne peut pas être partagé ; le nombre d’appareils autorisés est limité. Studio Prism peut suspendre un compte en cas d’usage frauduleux, de partage ou de non-respect de ces conditions, après vous en avoir informé sauf urgence.'],
    ['Comptes Particulier et Entreprise', 'À l’inscription, vous choisissez un compte Particulier ou Entreprise. Un compte Entreprise est demandé par le représentant de l’entreprise ou par le responsable d’une agence, d’un service ou d’une branche, avec le numéro SIRET de l’entreprise et les licences souhaitées ; Studio Prism vérifie la demande avant d’ouvrir le compte. Le responsable peut ensuite demander l’ajout de collaborateurs ; chaque ajout est validé par Studio Prism, qui délivre les clés de licence.'],
    ['Formules', 'La gamme SPECTRA est gratuite. Les applications en phase de test sont gratuites pendant le test. Les autres applications proposent une formule gratuite et des formules payantes, décrites sur la page ' + link('#/abonnements', 'Abonnements') + '.'],
    ['Usage personnel et usage commercial', 'Les applications sont concédées sous licence, sans transfert de propriété ; chaque licence précise l’usage autorisé. Un compte Particulier, y compris avec la licence Pro, est limité à un usage personnel et non commercial : vendre, ou remettre contre rémunération, des plans, études ou prestations réalisés avec les applications n’est pas autorisé. L’usage commercial est réservé aux entreprises titulaires de la licence Pro Entreprise.'],
    ['Vos contenus', 'Vous restez propriétaire des projets, documents et fichiers que vous créez ou importez. Vous autorisez seulement Studio Prism à les héberger, les copier pour la sauvegarde et les afficher aux personnes avec qui vous les partagez, pour fournir le service. Vous garantissez disposer des droits sur les fichiers importés et ne pas publier de contenu illicite ; Studio Prism peut retirer un contenu manifestement illicite qui lui est signalé (art. 6 de la LCEN).'],
    ['Usage des applications', 'Les applications (plans, trafic, planning, réalité augmentée, bureautique…) sont des outils d’aide. Elles ne remplacent ni les études, les calculs et les contrôles réglementaires d’un professionnel, ni vos propres vérifications : les résultats doivent être vérifiés avant toute utilisation sur un chantier ou un document officiel.'],
    ['Disponibilité et sauvegarde', 'Studio Prism fait ses meilleurs efforts pour assurer l’accès aux services, sans garantie de disponibilité continue. Les applications permettent d’exporter vos projets : conservez des copies de vos fichiers importants.'],
    ['Responsabilité', 'Studio Prism est responsable des dommages directs causés par un manquement à ses obligations, dans les limites prévues par la loi. Il n’est pas responsable d’un usage non conforme des applications, des contenus des utilisateurs, ni d’une interruption due à un tiers (hébergeur, réseau) ou à un cas de force majeure. Rien dans ces conditions ne limite les droits que la loi reconnaît aux consommateurs.'],
    ['Résiliation', 'Vous pouvez arrêter d’utiliser les services et supprimer votre compte à tout moment depuis Mon compte (' + link('compte-suppression.html', 'suppression du compte') + ').'],
    ['Droit applicable', `Ces conditions sont soumises au droit français. En cas de litige, une solution amiable est recherchée en priorité ; un consommateur peut recourir au médiateur indiqué dans les ${link('#/mentions-legales', 'mentions légales')}. À défaut, les tribunaux français sont compétents ; le consommateur peut saisir le tribunal de son domicile.`],
    ['Modification', 'Studio Prism peut modifier ces conditions ; la date de mise à jour figure en haut de la page. Une modification importante est signalée aux utilisateurs.']
  ];
  LT.cv = [
    ['Vendeur', `${ID}. Contact : ${MAIL}${opt('phone', ', ')}.`],
    ['1. Objet', 'Les présentes conditions générales de vente (CGV) s’appliquent aux licences d’utilisation (abonnements) des applications Studio Prism et aux prestations sur devis, vendues à des consommateurs et à des professionnels. Elles complètent les ' + link('#/conditions-utilisation', 'conditions d’utilisation') + '.'],
    ['2. Offres et prix', `Les formules, leurs fonctionnalités, leur durée (mensuelle ou annuelle) et leurs prix sont indiqués sur la page ${link('#/abonnements', 'Abonnements')} et repris sur chaque devis. Les prix sont en euros<span data-lg-vat="franchise" hidden> ; TVA non applicable, art. 293 B du CGI</span><span data-lg-vat="tva" hidden>, hors taxes, la TVA en vigueur s’ajoutant</span>. La gamme SPECTRA et les applications en phase de test sont gratuites.`],
    ['3. Commande', 'Une commande se fait par devis : Studio Prism émet un devis dans votre espace Mon compte ; vous l’acceptez en ligne (case « bon pour accord » et nom du signataire) ou en le renvoyant signé. Le contrat est conclu à l’acceptation du devis. Le devis accepté reste consultable et téléchargeable (PDF) dans Mon compte.'],
    ['4. Paiement', 'Le prix est payable à réception du devis accepté, par virement bancaire, en indiquant le numéro du devis. Entre professionnels, tout retard de paiement entraîne des pénalités au taux de trois fois le taux d’intérêt légal et une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 et D441-5 du Code de commerce).'],
    ['5. Accès au service', 'Les clés de licence sont délivrées dès réception du paiement et apparaissent dans Mon compte. La licence est active pour la durée achetée, à compter de son activation.'],
    ['6. Durée et renouvellement', 'Les licences sont souscrites pour une durée déterminée, sans reconduction tacite : à l’échéance, la licence expire et vos données restent accessibles avec la formule gratuite. Un renouvellement se fait par un nouveau devis.'],
    ['7. Droit de rétractation (consommateurs)', `Vous disposez de 14 jours à compter de l’acceptation du devis pour vous rétracter, sans motif ni pénalité (art. L221-18 du Code de la consommation). Pour l’exercer, utilisez le bouton <b>« Se rétracter du contrat »</b> sur la page du devis dans Mon compte : un accusé de réception est affiché et téléchargeable immédiatement. Vous pouvez aussi nous adresser le formulaire ci-dessous ou toute déclaration dénuée d’ambiguïté à ${MAIL}. Studio Prism vous rembourse au plus tard 14 jours après votre rétractation, par le moyen de paiement utilisé. Si vous avez demandé à utiliser la licence avant la fin du délai, un montant proportionnel au service fourni jusqu’à la rétractation reste dû (art. L221-25). Le droit de rétractation ne s’applique pas aux professionnels, sauf exceptions prévues par la loi.`],
    ['Formulaire type de rétractation', '<p class="lg-form">À l’attention de ' + f('legalName') + ', ' + f('address') + ', ' + f('email') + ' :<br>Je vous notifie par la présente ma rétractation du contrat portant sur la prestation de services ci-dessous :<br>Commandé le / reçu le : …<br>Numéro du devis : …<br>Nom du consommateur : …<br>Adresse du consommateur : …<br>Signature du consommateur (en cas de notification sur papier) : …<br>Date : …</p>'],
    ['8. Garanties légales', 'Les applications bénéficient de la garantie légale de conformité des contenus et services numériques (art. L224-25-12 et suivants du Code de la consommation) pendant toute la durée de fourniture. En cas de défaut, contactez Studio Prism : il est remédié au défaut de conformité dans un délai raisonnable ou, à défaut, le prix est réduit ou le contrat résolu.'],
    ['9. Réclamations et médiation', `Adressez vos réclamations à ${MAIL}. Si la réclamation écrite n’aboutit pas, le consommateur peut recourir gratuitement au médiateur de la consommation : ${f('mediatorName')}${opt('mediatorUrl', ' — ')}.`],
    ['10. Données personnelles', 'Les données nécessaires à la commande sont traitées comme décrit dans la ' + link('#/confidentialite', 'politique de confidentialité') + '.'],
    ['11. Droit applicable', 'Les présentes CGV sont soumises au droit français. Les litiges relèvent des tribunaux français ; le consommateur peut saisir, à son choix, la juridiction de son domicile ou celle du lieu du fait dommageable.']
  ];
  LT.ck = [
    ['En bref', 'Le site et les applications Studio Prism ne déposent aucun cookie publicitaire, aucun traceur de mesure d’audience et aucun bouton de réseau social : aucun bandeau de consentement n’est donc nécessaire.'],
    ['Ce qui est enregistré dans votre navigateur', ul([
      'Votre session de connexion (Firebase Authentication, dans le stockage du navigateur) : nécessaire pour rester connecté.',
      'Vos préférences (thème, affichage), le panier, l’identifiant de l’appareil autorisé et les projets non encore enregistrés dans le cloud.']) +
      '<p>Ces données sont strictement nécessaires au service que vous demandez : elles sont exemptées de consentement (art. 82 de la loi Informatique et Libertés). Elles ne servent pas à vous suivre et restent sur votre appareil.</p>'],
    ['Ressources externes', 'Les polices de caractères et la bibliothèque 3D sont hébergées par Studio Prism. Seules les bibliothèques Firebase sont chargées depuis les serveurs de Google, qui reçoivent alors votre adresse IP, pour la connexion et l’enregistrement des données.'],
    ['Gérer vos choix', 'Vous pouvez effacer ces données à tout moment depuis les réglages de votre navigateur (vous serez alors déconnecté). Si un outil soumis à consentement était ajouté un jour, votre accord serait demandé au préalable, avec un bouton « Tout refuser » aussi visible que « Tout accepter ».'],
    ['Contact', `Une question ? ${MAIL} ou le ${link('#/contact', 'formulaire de contact')}.`]
  ];
  LT.ac = [
    ['Engagement', 'Studio Prism veut rendre son site et ses applications utilisables par tous, y compris avec un lecteur d’écran, au clavier ou avec un affichage agrandi, et s’appuie pour cela sur le Référentiel général d’amélioration de l’accessibilité (RGAA 4.1) et les WCAG 2.1 niveau AA.'],
    ['État de conformité', 'Le site et les applications n’ont pas encore fait l’objet d’un audit complet : ils sont considérés comme non conformes à ce stade. Points déjà en place : navigation au clavier et lien d’évitement, textes alternatifs des images, contrastes vérifiés, respect du réglage « réduire les animations », structure de titres, formulaires étiquetés.'],
    ['Contenus non accessibles connus', 'Les vues 3D, la réalité augmentée et les éditeurs graphiques (plans, plannings, diapositives) ne sont que partiellement utilisables sans la vue. Leurs données peuvent être exportées dans des formats lisibles (CSV, PDF, texte) quand l’application le permet.'],
    ['Signaler un problème', `Si vous ne pouvez pas accéder à un contenu ou à un service, écrivez à ${MAIL} : nous vous proposerons une alternative accessible ou vous transmettrons le contenu sous une autre forme.`],
    ['Voies de recours', `Si vous signalez un défaut d’accessibilité sans obtenir de réponse satisfaisante, vous pouvez contacter le Défenseur des droits (${ext('https://www.defenseurdesdroits.fr', 'defenseurdesdroits.fr')}).`]
  ];

  /* ----- identité de l'éditeur (settings/legal, lisible par tous) ----- */
  const URL_LEGAL = 'https://firestore.googleapis.com/v1/projects/archivision-studioprism/databases/(default)/documents/settings/legal?key=AIzaSyAAD5rrHuVh6_PC2_45L3y9F7zWe5ACW6E';
  let data = null, req = null;
  const load = () => req || (req = fetch(URL_LEGAL).then((r) => (r.ok ? r.json() : null)).then((j) => {
    const o = {}; const fl = (j && j.fields) || {};
    Object.keys(fl).forEach((k) => { const v = fl[k]; o[k] = v.stringValue != null ? v.stringValue : v.integerValue != null ? String(v.integerValue) : ''; });
    return (data = o);
  }).catch(() => (data = {})));
  function fill() {
    const root = document.getElementById('v'); if (!root) return;
    const apply = (d) => {
      root.querySelectorAll('[data-lg]').forEach((el) => { const v = String(d[el.dataset.lg] || '').trim(); if (v) { el.textContent = v; el.classList.add('lg-ok'); } });
      root.querySelectorAll('[data-lg-opt]').forEach((el) => { el.hidden = !String(d[el.dataset.lgOpt] || '').trim(); });
      root.querySelectorAll('[data-lg-vat]').forEach((el) => { el.hidden = (d.vatMode || 'franchise') !== el.dataset.lgVat; });
      if (d.email) root.querySelectorAll('[data-lg-mail]').forEach((a) => a.setAttribute('href', 'mailto:' + d.email));
      if (/^https:\/\//.test(d.mediatorUrl || '')) root.querySelectorAll('[data-lg-opt="mediatorUrl"] [data-lg]').forEach((el) => {
        const a = document.createElement('a'); a.className = 'more'; a.href = d.mediatorUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = d.mediatorUrl; el.replaceWith(a); });
      const todo = root.querySelector('.lg-todo'); if (todo) todo.hidden = !root.querySelector('[data-lg]:not(.lg-ok)');
    };
    apply(data || {});
    if (!data) load().then(() => { if (document.getElementById('v') === root) apply(data); });
  }
  window.SPLegal = { DATE, fill, load };
})();
