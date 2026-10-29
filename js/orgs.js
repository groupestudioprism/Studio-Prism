/* Studio Prism — établissements / entreprises clientes, clés de licence (administration) et activation d'une clé (utilisateur).
 *
 *  - #/admin/etablissements : établissements (comptes rattachés, postes, licences) et clés de licence (génération, saisie manuelle,
 *    export, révocation). Une clé peut être donnée AVANT la création du compte : la personne crée son compte Studio Prism, puis
 *    saisit sa clé (#/activer, Mon compte, ou ARCHIPLAN) : la licence s'active et le compte est rangé dans son établissement.
 *  - #/activer : activation d'une clé par l'utilisateur connecté.
 * Interface seulement : les règles Firestore valident chaque écriture (voir firebase/firestore.rules, blocs organizations / licenseKeys).
 */
(function () {
  'use strict';
  const K = window.SP && window.SP.kit;
  if (!K) return;
  const { st, AD, esc, fdate, badge, fullName, typeLabel } = K;
  const OD = () => import(K.MOD('orgsdata.js'));
  const PD = () => K.dataMod();
  const ERR = {
    'app/key-format': 'Clé invalide : vérifiez la saisie (lettres et chiffres, au moins 12 caractères).',
    'app/key-unknown': 'Cette clé n’existe pas. Vérifiez la saisie, ou contactez Studio Prism.',
    'app/key-used': 'Cette clé a déjà été activée par un autre compte.',
    'app/key-mine': 'Cette clé est déjà activée sur votre compte.',
    'app/key-revoked': 'Cette clé a été désactivée. Contactez Studio Prism.',
    'app/key-expired': 'Cette clé a expiré.',
    'app/key-exists': 'Cette clé existe déjà.',
    'app/org-has-members': 'Cet établissement a encore des comptes rattachés : détachez-les d’abord.'
  };
  const errMsg = (e) => ERR[e && e.code] || K.errMsg(e);
  const fld = (id, label, control, hint) => `<div class="acc-f"><label for="${id}">${label}</label>${control}${hint ? `<p class="acc-h">${hint}</p>` : ''}<p class="fe" id="e-${id}" role="alert"></p></div>`;
  const inp = (id, type, val, attrs) => `<input id="${id}" name="${id}" type="${type}" value="${esc(val == null ? '' : val)}" ${attrs || ''}>`;
  const sel = (id, opts, cur, attrs) => `<select id="${id}" name="${id}" ${attrs || ''}>${opts.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const pmodal = (h, wide) => { A.x(); modal(h); const m = document.querySelector('.mod'); if (m && wide) m.classList.add('mod-w'); return m; };
  const copy = async (txt) => { try { await navigator.clipboard.writeText(txt); toast('Copié dans le presse-papiers.'); } catch (e) { toast('Copie impossible : sélectionnez le texte puis Ctrl+C.'); } };
  const KS = { available: ['bd-ok', 'Disponible'], redeemed: ['bd-kind', 'Activée'], revoked: ['bd-off', 'Révoquée'] };
  const ROLE_L = { eleve: 'Élève', enseignant: 'Enseignant', responsable: 'Responsable' };
  const TYPE_L = { etudiant: 'Étudiant', enseignant: 'Enseignant' };
  const tLabel = (t) => TYPE_L[t] || typeLabel(t);
  const keyBadge = (k) => badge(KS[k.status]?.[0] || 'bd-off', KS[k.status]?.[1] || k.status);
  const dur = (k) => k.expiresAt ? `jusqu’au ${fdate(k.expiresAt)}` : k.durationDays ? `${k.durationDays % 365 === 0 ? (k.durationDays / 365) + ' an' + (k.durationDays > 365 ? 's' : '') : k.durationDays + ' jours'} après activation` : 'sans limite';

  /* ================================================================== ADMINISTRATION */
  /* Deux onglets sur la même collection organizations : SCOLAIRE (écoles, établissements : élèves / enseignants, classes) et
     ENTREPRISE (entreprises, collectivités, associations : services / équipes, pas de profil élève ou enseignant).
     Le classement se fait par le type (kind) : aucune donnée à migrer. Le champ « classe » sert de service / équipe côté entreprise. */
  const SEG = {
    scol: { tab: 'orgs', href: '#/admin/scolaire', kinds: ['ecole', 'etablissement'], def: 'ecole', roles: true,
      one: 'Établissement scolaire', many: 'Établissements', newL: 'Nouvel établissement scolaire', editL: 'Modifier l’établissement', add: '+ Établissement scolaire',
      created: 'Établissement créé.', saved: 'Établissement mis à jour.', none: 'Aucun établissement scolaire pour le moment. Créez-en un pour regrouper les comptes et les licences de ses élèves et enseignants.',
      lead: 'Écoles, lycées, universités et centres de formation : élèves, enseignants, classes et clés de licence. Une clé peut être remise avant la création du compte : la personne crée son compte Studio Prism puis saisit sa clé, la licence s’active et le compte est rangé dans son établissement et sa classe.',
      q: 'Établissement, SIRET, contact, clé…', group: 'Classe', groupPh: 'ex. BTS 1A, 3e B…', noGroup: 'Sans classe', person: 'élève', seats: 'Nombre de postes (élèves + enseignants)', groupCol: 'Profil / classe' },
    ent: { tab: 'ents', href: '#/admin/entreprises', kinds: ['entreprise', 'collectivite', 'association', 'autre'], def: 'entreprise', roles: false,
      one: 'Entreprise', many: 'Entreprises', newL: 'Nouvelle entreprise', editL: 'Modifier l’entreprise', add: '+ Entreprise',
      created: 'Entreprise créée.', saved: 'Entreprise mise à jour.', none: 'Aucune entreprise pour le moment. Créez-en une pour regrouper les comptes et les licences de ses salariés.',
      lead: 'Entreprises, bureaux d’études, collectivités et associations clientes : postes, services, comptes rattachés et clés de licence. Chaque salarié crée son compte Studio Prism puis saisit sa clé : la licence s’active et le compte est rattaché à l’entreprise.',
      q: 'Entreprise, SIRET, contact, clé…', group: 'Service / équipe', groupPh: 'ex. Bureau d’études, Chantier Nord…', noGroup: 'Sans service', person: 'salarié', seats: 'Nombre de postes (salariés)', groupCol: 'Service' }
  };
  const segOfKind = (k) => (SEG.scol.kinds.includes(k) ? 'scol' : 'ent');
  const segOfOrg = (oid) => { const o = oid && O.orgs.find((x) => x.id === oid); return o ? segOfKind(o.kind) : O.seg; };
  const O = { orgs: [], keys: [], prods: [], offers: [], busy: false, err: '', q: '', seg: 'scol', pending: [], requests: [], showPending: false };

  function orgsTab(seg, p, shell) {
    const S = SEG[seg]; O.seg = seg; O.q = ''; O.showPending = !!window.SP_OPEN_PENDING; window.SP_OPEN_PENDING = false;
    V(shell(`<p class="lead">${S.lead}</p>
<div class="adm-stats" id="org-stats"></div>
<div class="adm-tools"><div class="acc-f adm-q" style="flex:1"><label for="org-q">Rechercher</label><input id="org-q" type="search" placeholder="${S.q}" autocomplete="off"></div>
${seg === 'ent' ? '<button class="btn b4 org-pend-btn" data-a="org-pending" id="org-pend-btn">En attente</button> ' : ''}<button class="btn b4" data-a="org-keys-new" data-org="">Générer des clés</button> <button class="btn b4" data-a="org-key-manual" data-org="">Saisir une clé</button> <button class="btn b1" data-a="org-new">${S.add}</button></div>
${seg === 'ent' ? '<div id="org-pending"></div>' : ''}
<div id="org-list"><p class="mut">Chargement…</p></div>
<h2 class="lh" style="margin-top:28px">Clés sans établissement ni entreprise</h2><p class="mut">Clés individuelles (vente à un particulier, licence offerte…). Les mêmes clés apparaissent dans les onglets Scolaire et Entreprise.</p><div id="org-free-keys"></div>`));
    loadOrgs();
  }
  async function loadOrgs() {
    try {
      const [od, pd] = await Promise.all([OD(), PD()]);
      [O.orgs, O.keys, O.prods, O.offers, O.pending, O.requests] = await Promise.all([od.adminListOrgs(), od.adminListKeys(null), pd.adminListProducts(), pd.adminListOffers().catch(() => []), od.adminListPending().catch(() => []), od.adminListRequests().catch(() => [])]);
      O.err = '';
    } catch (e) { console.error('[Studio Prism] Établissements :', e); O.err = errMsg(e); }
    renderOrgs();
  }
  function renderOrgs() {
    const list = document.getElementById('org-list'); if (!list) return;
    if (O.err) { list.innerHTML = `<div class="panel"><p>${esc(O.err)}</p><p class="mut">Les règles Firestore du site doivent inclure les blocs « organizations » et « licenseKeys ».</p><p><button class="btn b1" data-a="org-reload">Réessayer</button></p></div>`; return; }
    const q = O.q.trim().toLowerCase(), m = (s) => !q || String(s || '').toLowerCase().includes(q);
    const kOf = (oid) => O.keys.filter((k) => (k.orgId || '') === oid);
    const S = SEG[O.seg], segOrgs = O.orgs.filter((o) => segOfKind(o.kind) === O.seg), ids = new Set(segOrgs.map((o) => o.id)), segKeys = O.keys.filter((k) => ids.has(k.orgId));
    const st2 = document.getElementById('org-stats');
    if (st2) st2.innerHTML = [[S.many, segOrgs.length], ['Clés disponibles', segKeys.filter((k) => k.status === 'available').length], ['Clés activées', segKeys.filter((k) => k.status === 'redeemed').length], ['Postes prévus', segOrgs.reduce((s, o) => s + (o.seats || 0), 0)]]
      .map(([l, n]) => `<div class="adm-stat"><span class="adm-n">${n}</span><span class="adm-l">${l}</span></div>`).join('');
    const orgs = segOrgs.filter((o) => m(o.name) || m(o.siret) || m(o.contactName) || m(o.email) || kOf(o.id).some((k) => m(k.key) || m(k.redeemedEmail)));
    list.innerHTML = orgs.length ? `<div class="adm-tw"><table class="adm-t org-t"><thead><tr><th>${S.one}</th><th>Type</th><th>Contact</th><th>Postes</th><th>Clés</th><th>Statut</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${orgs.map((o) => {
      const ks = kOf(o.id), used = ks.filter((k) => k.status === 'redeemed').length, avail = ks.filter((k) => k.status === 'available').length;
      return `<tr><td data-label="${S.one}"><div class="adm-v"><b>${esc(o.name)}</b><small>${esc(o.siret ? 'SIRET ' + o.siret : '')}</small></div></td>
        <td data-label="Type"><div class="adm-v">${badge('bd-kind', (window.SP_ORG_KINDS || {})[o.kind] || o.kind || '—')}</div></td>
        <td data-label="Contact"><div class="adm-v">${esc(o.contactName || '—')}<small>${esc(o.email || '')}${o.phone ? ' · ' + esc(o.phone) : ''}</small></div></td>
        <td data-label="Postes"><div class="adm-v"><b>${used}</b> / ${o.seats || '—'}<small>comptes activés / prévus</small></div></td>
        <td data-label="Clés"><div class="adm-v">${avail} disponible${avail > 1 ? 's' : ''}<small>${ks.length} au total</small></div></td>
        <td data-label="Statut"><div class="adm-v">${badge(o.status === 'active' ? 'bd-ok' : 'bd-off', o.status === 'active' ? 'Actif' : 'Suspendu')}</div></td>
        <td class="adm-act"><button class="btn b4" data-a="org-open" data-org="${esc(o.id)}">Fiche</button> <button class="btn b4" data-a="org-edit" data-org="${esc(o.id)}">Modifier</button></td></tr>`; }).join('')}</tbody></table></div>`
      : `<div class="panel"><p>${segOrgs.length ? 'Aucun résultat pour cette recherche.' : S.none}</p></div>`;
    renderPending();
    const fk = document.getElementById('org-free-keys');
    if (fk) fk.innerHTML = keyTable(kOf('').filter((k) => m(k.key) || m(k.label) || m(k.redeemedEmail) || m(k.productName)), '');
  }
  /* ---- Entreprise : demandes en attente ----
     1) inscriptions d'entreprise (compte « en attente ») avec la demande de licences du responsable (licenseRequests kind « signup ») ;
     2) demandes d'ajout de personnes par le responsable d'une entreprise validée (kind « member »). */
  const ROLE_REP = { representant: 'Représentant de l’entreprise', responsable: 'Responsable d’agence, de service ou de branche' };
  const reqOf = (uid) => O.requests.find((r) => r.kind === 'signup' && r.requesterUid === uid);
  const itemsTxt = (items) => (items || []).map((x) => `${x.qty} × ${x.productName || x.productId}`).join(', ');
  const DUR = [['365', '1 an après activation'], ['730', '2 ans après activation'], ['1095', '3 ans après activation'], ['', 'Sans limite']];
  function renderPending() {
    const members = O.requests.filter((r) => r.kind === 'member');
    const n = O.pending.length + members.length, btn = document.getElementById('org-pend-btn'), box = document.getElementById('org-pending');
    if (btn) { btn.innerHTML = `En attente${n ? ` <span class="org-pend-n">${n}</span>` : ''}`; btn.setAttribute('aria-expanded', String(!!O.showPending)); btn.classList.toggle('on', !!O.showPending); }
    if (!box) return;
    if (!O.showPending) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="panel adm-pend"><h3 class="lh" style="margin:0 0 4px">Inscriptions d’entreprise</h3><p class="mut">Demandes faites par le représentant ou un responsable de l’entreprise. Le compte ne peut pas se connecter tant qu’il n’est pas validé ; à la validation, la fiche entreprise est créée et les clés de licence demandées sont générées.</p>` +
      (O.pending.length ? `<ul class="adm-pend-l">${O.pending.map((u) => { const r = reqOf(u.uid); return `<li><div><b>${esc(u.companyName || '—')}</b>` +
        `<small>${esc(fullName(u))} · ${esc(u.email)}${r && r.repRole ? ' · ' + esc(ROLE_REP[r.repRole] || r.repRole) : ''}${u.jobTitle ? ' · ' + esc(u.jobTitle) : ''}</small>` +
        `<small>${r && r.siret ? 'SIRET ' + esc(r.siret) + ' · ' : ''}${r ? 'Licences demandées : ' + esc(itemsTxt(r.items)) : 'Aucune demande de licence'} · le ${esc(fdate(u.createdAt))}</small></div>` +
        `<span class="adm-pend-b"><button class="btn b1" data-a="org-approve" data-uid="${esc(u.uid)}">Valider</button> <button class="btn btn-danger" data-a="org-refuse" data-uid="${esc(u.uid)}">Refuser</button></span></li>`; }).join('')}</ul>`
        : '<p style="margin-top:10px">Aucune inscription en attente.</p>') +
      `<h3 class="lh" style="margin:22px 0 4px">Ajouts de personnes demandés</h3><p class="mut">Le responsable d’une entreprise demande une licence pour des collaborateurs. Accepter génère une clé par adresse, à transmettre.</p>` +
      (members.length ? `<ul class="adm-pend-l">${members.map((r) => `<li><div><b>${esc(r.companyName || '—')}</b><small>Demandé par ${esc(r.requesterName || r.requesterEmail)} · ${esc(itemsTxt(r.items).replace(/^\d+ × /, ''))} · le ${esc(fdate(r.createdAt))}</small><small>${esc((r.emails || []).join(', '))}</small></div>` +
        `<span class="adm-pend-b"><button class="btn b1" data-a="org-req-ok" data-id="${esc(r.id)}">Accepter</button> <button class="btn btn-danger" data-a="org-req-no" data-id="${esc(r.id)}">Refuser</button></span></li>`).join('')}</ul>`
        : '<p style="margin-top:10px">Aucune demande d’ajout.</p>') + '</div>';
  }
  const pendById = (uid) => O.pending.find((u) => u.uid === uid);
  function approveForm(uid) {
    const u = pendById(uid); if (!u) return;
    const r = reqOf(uid), ents = O.orgs.filter((o) => segOfKind(o.kind) === 'ent'), same = ents.find((o) => String(o.name).trim().toLowerCase() === String(u.companyName || '').trim().toLowerCase());
    pmodal(`<h3>Valider ${esc(u.companyName || fullName(u))}</h3><p class="mut">${esc(fullName(u))} · ${esc(u.email)}${r && r.repRole ? ' · ' + esc(ROLE_REP[r.repRole] || '') : ''}${r && r.siret ? ' · SIRET ' + esc(r.siret) : ''}</p><form data-f="org-approve" data-uid="${esc(uid)}">
      <fieldset class="acc-f"><legend>Fiche entreprise</legend>
      ${same ? '' : `<label class="chk"><input type="radio" name="ap-mode" value="new" checked> Créer la fiche entreprise « ${esc(u.companyName || '')} »</label>`}
      ${ents.length ? `<label class="chk"><input type="radio" name="ap-mode" value="existing"${same ? ' checked' : ''}> Rattacher à une entreprise existante (autre agence ou branche)</label>${sel('ap-org', ents.map((o) => [o.id, o.name]), same ? same.id : ents[0].id)}` : ''}</fieldset>
      <p class="mut" style="margin-top:8px">${esc(fullName(u))} devient <b>responsable</b> de cette entreprise : il voit ses clés et ses collaborateurs, et peut demander l’ajout de personnes.</p>
      ${r ? `<fieldset class="acc-f"><legend>Clés de licence demandées</legend><label class="chk"><input type="checkbox" name="ap-keys" checked> Générer ${esc(itemsTxt(r.items))} (Pro Entreprise)</label>${fld('ap-dur', 'Validité des clés', sel('ap-dur', DUR, '365'))}</fieldset>` : ''}
      <p class="fe" id="ap-err" role="alert"></p><p><button class="btn b1" type="submit">Valider l’entreprise</button></p></form>`, true);
  }
  const prefOf = (pid) => pid === 'archiplan' ? 'ARCH' : pid === 'archivision' ? 'AVIS' : pid === 'architrafic' ? 'ATRA' : String(pid).replace(/[^a-z]/gi, '').slice(0, 4);
  async function genKeys(od, org, item, n, durationDays, label) {
    const keys = Array.from({ length: n }, () => od.generateKey(prefOf(item.productId)));
    return od.adminCreateKeys(keys, { productId: item.productId, productName: item.productName || item.productId, licenseType: item.licenseType || 'pro_entreprise', durationDays, expiresAt: null, org, label: label || '', role: '', classe: '' });
  }
  function keysResult(title, org, list) {
    pmodal(`<h3>${esc(title)}</h3><p class="mut">${esc(org.name)} · les clés sont aussi visibles par le responsable dans son espace « Mon entreprise ». Chaque personne crée son compte Studio Prism puis saisit sa clé.</p>
      <textarea id="ok-out" readonly rows="${Math.min(14, list.length + 1)}" style="width:100%;font-family:monospace">${esc(list.join('\n'))}</textarea>
      <p style="margin-top:10px"><button class="btn b1" data-a="org-copy-out">Copier</button> <button class="btn b4" data-a="org-open" data-org="${esc(org.id)}">Voir la fiche entreprise</button></p>`, true);
  }
  async function submitApprove(fm) {
    const u = pendById(fm.dataset.uid), err = fm.querySelector('#ap-err'), btn = fm.querySelector('button[type=submit]'), mode = (fm.querySelector('[name=ap-mode]:checked') || {}).value || 'new';
    if (!u) return; const r = reqOf(u.uid); btn.disabled = true; btn.textContent = 'Validation…'; err.textContent = '';
    try {
      const od = await OD(); let org = null;
      const total = r ? (r.items || []).reduce((t, x) => t + (x.qty || 0), 0) : 0;
      if (mode === 'existing') org = orgById(fm.elements['ap-org'].value);
      else {
        const name = (u.companyName || fullName(u)).slice(0, 120);
        const id = await od.saveOrg({ name, kind: 'entreprise', siret: (r && r.siret) || '', email: String(u.companyEmail || u.email || '').toLowerCase(), contactName: fullName(u), seats: Math.min(10000, Math.max(1, total || u.companyUserLimit || 1)), notes: `Inscrite par ${fullName(u)} (${u.email})${r && r.repRole ? ', ' + (ROLE_REP[r.repRole] || '') : ''}.`, status: 'active' }, null);
        org = { id, name };
      }
      await od.adminApprove(u.uid, org, 'responsable');
      const out = [];
      if (r && fm.elements['ap-keys'] && fm.elements['ap-keys'].checked) {
        const dur = fm.elements['ap-dur'].value ? parseInt(fm.elements['ap-dur'].value, 10) : null;
        for (const it of r.items || []) (await genKeys(od, org, it, it.qty, dur, '')).forEach((k) => out.push(`${k.key}  ·  ${it.productName || it.productId}`));
      }
      if (r) await od.adminCloseRequest(r.id, 'accepted', org.id);
      await loadOrgs();
      toast(`Entreprise validée : ${org.name}. ${fullName(u)} peut se connecter.`);
      if (out.length) keysResult(`${out.length} clé${out.length > 1 ? 's' : ''} Pro Entreprise générée${out.length > 1 ? 's' : ''}`, org, out); else A.x();
    } catch (e) { console.error('[Studio Prism] Validation :', e); err.textContent = errMsg(e); btn.disabled = false; btn.textContent = 'Valider l’entreprise'; }
  }
  function refuseForm(uid) {
    const u = pendById(uid); if (!u) return;
    pmodal(`<h3>Refuser la demande de ${esc(u.companyName || fullName(u))} ?</h3><p>Le compte en attente (${esc(u.email)}) et sa fiche d’inscription sont supprimés. L’adresse e-mail sera libérée à sa prochaine tentative de connexion.</p><p class="mut">Action définitive.</p><p class="fe" id="rf-err" role="alert"></p><p><button class="btn btn-danger" data-a="org-refuse-ok" data-uid="${esc(uid)}">Refuser et supprimer la demande</button></p>`);
  }
  /* Ajout de personnes : une clé par adresse, au nom de l'entreprise, libellée avec l'adresse. */
  function memberForm(id) {
    const r = O.requests.find((x) => x.id === id); if (!r) return; const it = (r.items || [])[0] || {};
    pmodal(`<h3>Ajouter ${(r.emails || []).length} personne${(r.emails || []).length > 1 ? 's' : ''} à ${esc(r.companyName || '')}</h3><p class="mut">${esc(it.productName || it.productId || '')} · Pro Entreprise · une clé par adresse :</p><p>${(r.emails || []).map(esc).join('<br>')}</p>
      <form data-f="org-req-ok" data-id="${esc(id)}">${fld('rq-dur', 'Validité des clés', sel('rq-dur', DUR, '365'))}<p class="fe" id="rq-err" role="alert"></p><p><button class="btn b1" type="submit">Générer les clés</button></p></form>`);
  }
  async function submitMember(fm) {
    const r = O.requests.find((x) => x.id === fm.dataset.id), err = fm.querySelector('#rq-err'), btn = fm.querySelector('button[type=submit]');
    if (!r) return; const org = orgById(r.orgId); if (!org) { err.textContent = 'Fiche entreprise introuvable.'; return; }
    btn.disabled = true; btn.textContent = 'Génération…';
    try {
      const od = await OD(), it = (r.items || [])[0] || {}, dur = fm.elements['rq-dur'].value ? parseInt(fm.elements['rq-dur'].value, 10) : null, out = [];
      for (const em of r.emails || []) { const k = (await genKeys(od, org, it, 1, dur, em))[0]; out.push(`${em}  →  ${k.key}`); }
      await od.adminCloseRequest(r.id, 'accepted');
      await loadOrgs(); keysResult(`${out.length} clé${out.length > 1 ? 's' : ''} générée${out.length > 1 ? 's' : ''}`, org, out);
    } catch (e) { err.textContent = errMsg(e); btn.disabled = false; btn.textContent = 'Générer les clés'; }
  }
  function keyTable(ks, oid) {
    const S = SEG[segOfOrg(oid)];
    if (!ks.length) return `<div class="panel"><p class="mut">Aucune clé${oid ? ' pour ' + (S.roles ? 'cet établissement' : 'cette entreprise') : ''}.</p></div>`;
    return `<div class="adm-tw"><table class="adm-t key-t"><thead><tr><th>Clé</th><th>Licence</th><th>${oid ? S.groupCol : 'Profil / groupe'}</th><th>Validité</th><th>Libellé / poste</th><th>Statut</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${ks.map((k) => `<tr>
      <td data-label="Clé"><div class="adm-v"><code class="kcode">${esc(k.key)}</code></div></td>
      <td data-label="Licence"><div class="adm-v"><b>${esc(k.productName)}</b><small>${esc(tLabel(k.licenseType))}</small></div></td>
      <td data-label="Profil"><div class="adm-v">${esc(ROLE_L[k.role] || '—')}${k.classe ? `<small>${esc(k.classe)}</small>` : ''}</div></td>
      <td data-label="Validité"><div class="adm-v">${esc(dur(k))}</div></td>
      <td data-label="Libellé"><div class="adm-v">${packLabel(k.label)}${k.status === 'redeemed' ? `<small>Activée par ${esc(k.redeemedEmail)} le ${esc(fdate(k.redeemedAt))}</small>` : ''}</div></td>
      <td data-label="Statut"><div class="adm-v">${keyBadge(k)}</div></td>
      <td class="adm-act"><button class="btn b4" data-a="org-key-copy" data-k="${esc(k.key)}" aria-label="Copier la clé">Copier</button>${k.status !== 'revoked' ? ` <button class="btn b4" data-a="org-key-label" data-id="${esc(k.id)}">Modifier</button>` : ''}${k.status === 'available' ? ` <button class="btn b4" data-a="org-key-revoke" data-id="${esc(k.id)}">Révoquer</button>` : ''}${k.status === 'revoked' ? ` <button class="btn b4" data-a="org-key-restore" data-id="${esc(k.id)}">Rétablir</button> <button class="btn btn-danger" data-a="org-key-del" data-id="${esc(k.id)}">Supprimer</button>` : ''}${k.status !== 'revoked' && !oid ? ` <button class="btn btn-danger" data-a="org-key-del-ask" data-id="${esc(k.id)}">Supprimer</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const orgById = (id) => O.orgs.find((o) => o.id === id);

  /* ---- fiche établissement : comptes et clés, filtres Enseignants / Élèves et classe ---- */
  const FO = { id: '', mem: [], lics: [], role: '', classe: '' };
  const classesOf = (id) => [...new Set(O.keys.filter((k) => k.orgId === id && k.classe).map((k) => k.classe).concat(FO.id === id ? FO.mem.map((u) => u.orgClass).filter(Boolean) : []))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  const pass = (role, classe) => (!FO.role || role === FO.role) && (!FO.classe || classe === FO.classe);
  async function openOrg(id) {
    const o = orgById(id); if (!o) return;
    const S = SEG[segOfKind(o.kind)];
    if (FO.id !== id) Object.assign(FO, { id, mem: [], lics: [], role: '', classe: '' });
    const m = pmodal(`<h3>${esc(o.name)}</h3><p class="mut">${esc((window.SP_ORG_KINDS || {})[o.kind] || '')}${o.siret ? ' · SIRET ' + esc(o.siret) : ''}</p>${spec([
      ['Contact', esc(o.contactName || '—')], ['E-mail', esc(o.email || '—')], ['Téléphone', esc(o.phone || '—')], ['Adresse', esc(o.address || '—')],
      ['Postes prévus', esc(String(o.seats || '—'))], ['Statut', badge(o.status === 'active' ? 'bd-ok' : 'bd-off', o.status === 'active' ? 'Actif' : 'Suspendu')]])}
      ${o.notes ? `<p class="mt2">${esc(o.notes)}</p>` : ''}
      <div class="org-filt" id="org-filt"></div>
      <div class="fiche-h"><h4>Comptes rattachés</h4><button class="btn b4" data-a="org-attach" data-org="${esc(id)}">Rattacher un compte existant</button></div><div id="org-members"><p class="mut">Chargement…</p></div>
      <div class="fiche-h"><h4>Clés de licence</h4><span><button class="btn b4" data-a="org-keys-xlsx" data-org="${esc(id)}">Excel par ${S.roles ? 'classe' : 'service'} (.xlsx)</button> <button class="btn b4" data-a="org-keys-csv" data-org="${esc(id)}">CSV</button> <button class="btn b4" data-a="org-key-manual" data-org="${esc(id)}">Saisir une clé</button> <button class="btn b1" data-a="org-keys-new" data-org="${esc(id)}">Générer des clés</button></span></div>
      <div id="org-keys"></div>
      <div class="fiche-act"><button class="btn b4" data-a="org-edit" data-org="${esc(id)}">${S.editL}</button> <button class="btn btn-danger" data-a="org-del" data-org="${esc(id)}">Supprimer ${S.roles ? 'l’établissement' : 'l’entreprise'}</button></div>`, true);
    FO.loading = true; renderFiche();
    try {
      const od = await OD(), pd = await PD(); FO.mem = await od.adminOrgMembers(id);
      FO.lics = FO.mem.length ? await pd.adminLicensesFor(FO.mem.map((u) => u.uid)) : [];
      FO.loading = false; if (m && m.isConnected) renderFiche();
    } catch (e) { FO.loading = false; const box = m && m.querySelector('#org-members'); if (box) box.innerHTML = `<p class="fe" style="display:block">${esc(errMsg(e))}</p>`; }
  }
  function renderFiche() {
    const id = FO.id, f = document.getElementById('org-filt'); if (!f) return;
    const S = SEG[segOfOrg(id)];
    const ks = O.keys.filter((k) => k.orgId === id), cls = classesOf(id);
    const n = (role) => ks.filter((k) => !role || k.role === role).length;
    f.innerHTML = (S.roles ? `<div class="seg-f" role="tablist">${[['', 'Tous'], ['enseignant', 'Enseignants'], ['eleve', 'Élèves']].map(([v, t]) => `<button type="button" class="${FO.role === v ? 'on' : ''}" data-a="org-frole" data-v="${v}">${t} <small>${n(v)}</small></button>`).join('')}</div>` : '') + `
      <label class="org-fc">${S.group} <select id="org-fclass"><option value="">${S.roles ? 'Toutes les classes' : 'Tous les services'}</option>${cls.map((c) => `<option${c === FO.classe ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`;
    const kb = document.getElementById('org-keys'); if (kb) kb.innerHTML = keyTable(ks.filter((k) => pass(k.role || '', k.classe || '')), id);
    const box = document.getElementById('org-members'); if (!box) return;
    if (FO.loading){ box.innerHTML = '<p class="mut">Chargement…</p>'; return; }
    const mem = FO.mem.filter((u) => pass(u.orgRole || '', u.orgClass || ''));
    box.innerHTML = mem.length ? `<div class="adm-tw"><table class="adm-t"><thead><tr><th>Compte</th><th>${S.groupCol}</th><th>Licences</th><th>Statut</th><th></th></tr></thead><tbody>${mem.map((u) => `<tr>
        <td data-label="Compte"><div class="adm-v"><b>${esc(fullName(u))}</b><small>${esc(u.email)}</small></div></td>
        <td data-label="Profil"><div class="adm-v">${esc(ROLE_L[u.orgRole] || '—')}${u.orgClass ? `<small>${esc(u.orgClass)}</small>` : ''}</div></td>
        <td data-label="Licences"><div class="adm-v">${FO.lics.filter((l) => l.userId === u.uid).map((l) => `${esc(l.productName)} — ${esc(tLabel(l.licenseType))}${l.expiresAt ? ` <small>jusqu’au ${esc(fdate(l.expiresAt))}</small>` : ''}`).join('<br>') || '<span class="mut">Aucune</span>'}</div></td>
        <td data-label="Statut"><div class="adm-v">${badge(u.status === 'active' ? 'bd-ok' : 'bd-off', u.status === 'active' ? 'Actif' : 'Désactivé')}</div></td>
        <td class="adm-act">${!S.roles ? `<button class="btn b4" data-a="org-resp" data-uid="${esc(u.uid)}" data-org="${esc(id)}" data-on="${u.orgRole === 'responsable' ? '' : '1'}">${u.orgRole === 'responsable' ? 'Retirer responsable' : 'Nommer responsable'}</button> ` : ''}<button class="btn b4" data-a="org-detach" data-uid="${esc(u.uid)}" data-org="${esc(id)}">Détacher</button></td></tr>`).join('')}</tbody></table></div>`
      : `<p class="mut">${FO.mem.length ? 'Aucun compte pour ce filtre.' : `Aucun compte rattaché pour le moment. Les personnes qui activent une clé de ${S.roles ? 'cet établissement' : 'cette entreprise'} apparaissent ici.`}</p>`;
  }

  /* ---- création / modification ---- */
  function orgForm(id) {
    const S = SEG[id ? segOfOrg(id) : O.seg], o = id ? orgById(id) : { kind: S.def, status: 'active', seats: S.roles ? 30 : 10 };
    const all = window.SP_ORG_KINDS || { entreprise: 'Entreprise', ecole: 'École / formation' };
    const kinds = Object.entries(all).filter(([k]) => S.kinds.includes(k) || k === o.kind);
    pmodal(`<h3>${id ? S.editL : S.newL}</h3><form data-f="org-form" data-org="${esc(id || '')}" novalidate>
      ${fld('og-name', 'Nom', inp('og-name', 'text', o.name, 'maxlength="120"'))}
      <div class="row">${fld('og-kind', 'Type', sel('og-kind', kinds, o.kind))}${fld('og-siret', 'SIRET <span class="mut">(facultatif)</span>', inp('og-siret', 'text', o.siret, 'maxlength="20" inputmode="numeric"'))}</div>
      <div class="row">${fld('og-contact', 'Contact', inp('og-contact', 'text', o.contactName, 'maxlength="120"'))}${fld('og-seats', S.seats, inp('og-seats', 'number', o.seats, 'min="1" max="10000"'))}</div>
      <div class="row">${fld('og-email', 'E-mail', inp('og-email', 'email', o.email, 'maxlength="160"'))}${fld('og-phone', 'Téléphone', inp('og-phone', 'tel', o.phone, 'maxlength="40"'))}</div>
      ${fld('og-addr', 'Adresse', inp('og-addr', 'text', o.address, 'maxlength="300"'))}
      ${fld('og-notes', 'Notes internes <span class="mut">(facultatif)</span>', `<textarea id="og-notes" name="og-notes" maxlength="1000" rows="3">${esc(o.notes || '')}</textarea>`)}
      ${id ? fld('og-status', 'Statut', sel('og-status', [['active', 'Actif'], ['suspended', 'Suspendu']], o.status)) : ''}
      <p class="fe" id="og-err" role="alert"></p><p style="margin-top:14px"><button class="btn b1" type="submit">${id ? 'Enregistrer' : 'Créer'}</button></p></form>`, true);
  }
  async function submitOrg(fm) {
    K.clearErrors(); const g = (n) => (fm.elements[n] ? fm.elements[n].value.trim() : ''), er = {}, id = fm.dataset.org;
    if (!g('og-name')) er['og-name'] = 'Renseignez le nom.';
    if (g('og-email') && !K.EMAIL_RE.test(g('og-email'))) er['og-email'] = 'Adresse e-mail invalide.';
    if (g('og-siret') && !/^\d{9}(\d{5})?$/.test(g('og-siret').replace(/\s/g, ''))) er['og-siret'] = 'SIRET : 14 chiffres (ou SIREN : 9).';
    const seats = parseInt(g('og-seats'), 10); if (!(seats >= 1 && seats <= 10000)) er['og-seats'] = 'Entre 1 et 10 000.';
    if (K.showErrors(fm, er)) return;
    const btn = fm.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const nid = await (await OD()).saveOrg({ name: g('og-name'), kind: g('og-kind'), siret: g('og-siret').replace(/\s/g, ''), contactName: g('og-contact'), seats, email: g('og-email').toLowerCase(), phone: g('og-phone'), address: g('og-addr'), notes: g('og-notes'), status: g('og-status') || 'active' }, id || null);
      const S = SEG[segOfKind(g('og-kind'))]; await loadOrgs(); toast(id ? S.saved : S.created); openOrg(nid);
    } catch (e) { fm.querySelector('#og-err').textContent = errMsg(e); btn.disabled = false; }
  }

  /* ---- clés : génération et saisie manuelle ---- */
  const BASE_TYPES = ['pro', 'pro_entreprise', 'etudiant', 'enseignant', 'free'];
  /* Produits proposés pour les clés : les applications (et services) du catalogue, archivés exclus ; brouillons signalés */
  const LIC_ST = { draft: ' (brouillon)', unavailable: ' (indisponible)', hidden: ' (masqué)' };
  const licProds = () => O.prods.filter((p) => p.status !== 'archived' && (!p.category || p.category === 'application' || p.category === 'service'))
    .sort((a, b) => (a.status === 'draft') - (b.status === 'draft') || (a.displayOrder ?? 999) - (b.displayOrder ?? 999) || String(a.name).localeCompare(String(b.name), 'fr'));
  const typesForMany = (ids) => { const s = new Set(BASE_TYPES); O.offers.filter((o) => ids.includes(o.productId) && o.licenseType).forEach((o) => s.add(o.licenseType)); return [...s].map((t) => [t, tLabel(t)]); };
  const typesFor = (pid) => { const s = new Set(BASE_TYPES); O.offers.filter((o) => o.productId === pid && o.licenseType).forEach((o) => s.add(o.licenseType)); return [...s].map((t) => [t, tLabel(t)]); };
  function keysForm(oid, manual) {
    const o = oid ? orgById(oid) : null, prods = licProds();
    if (!prods.length) return pmodal('<h3>Clés de licence</h3><p>Le catalogue est vide : ajoutez d’abord un produit (onglet Catalogue).</p>');
    const first = prods.find((p) => p.id === 'archiplan') || prods[0];
    const free = o ? Math.max(0, (o.seats || 0) - O.keys.filter((k) => k.orgId === oid && k.status !== 'revoked').length) : 10;
    pmodal(`<h3>${manual ? 'Saisir une clé existante' : 'Générer des clés de licence'}</h3><p class="mut">${o ? esc(o.name) + ` · ${free} poste${free > 1 ? 's' : ''} sans clé` : 'Clés sans établissement ni entreprise'}</p>
      <form data-f="org-keys" data-org="${esc(oid || '')}" data-manual="${manual ? 1 : ''}" novalidate>
      ${manual ? fld('ok-key', 'Clé', inp('ok-key', 'text', '', 'maxlength="60" autocomplete="off" autocapitalize="characters" placeholder="ABCD-EFGH-IJKL-MNOP" style="font-family:monospace"'), 'Lettres et chiffres, tirets facultatifs (au moins 12 caractères).')
        : fld('ok-n', '<span id="ok-n-l">Nombre de clés</span>', inp('ok-n', 'number', Math.max(1, Math.min(free || 1, 50)), 'min="1" max="500"'), 'Une clé par compte.')}
      ${manual ? `<div class="row">${fld('ok-prod', 'Produit', sel('ok-prod', prods.map((p) => [p.id, p.name + (LIC_ST[p.status] || '')]), first.id))}${fld('ok-type', 'Type de licence', sel('ok-type', typesFor(first.id), 'pro'))}</div>`
        : `<fieldset class="acc-f ok-apps"><legend>Applications <span class="mut">(cochez-en plusieurs pour une clé pack : une seule clé active toutes les applications cochées)</span></legend>
            <div class="ok-apps-l">${prods.map((p) => `<label class="opt"><input type="checkbox" name="ok-app" value="${esc(p.id)}"${p.id === first.id ? ' checked' : ''}> ${esc(p.name)}<span class="mut">${esc(LIC_ST[p.status] || '')}</span></label>`).join('')}</div>
            <p class="mut" id="ok-pack-note" style="margin:6px 0 0"></p><p class="fe" id="e-ok-app" role="alert"></p></fieldset>
          <div class="row">${fld('ok-type', 'Type de licence', sel('ok-type', typesForMany([first.id]), 'pro'))}</div>`}
      <div class="row">${fld('ok-dur', 'Validité', sel('ok-dur', [['365', '1 an après activation'], ['730', '2 ans après activation'], ['1095', '3 ans après activation'], ['30', '30 jours (essai)'], ['90', '90 jours'], ['date', 'Jusqu’à une date'], ['', 'Sans limite']], '365'))}${fld('ok-date', 'Date de fin <span class="mut">(si « jusqu’à une date »)</span>', inp('ok-date', 'date', ''))}</div>
      ${o ? (() => { const S = SEG[segOfKind(o.kind)]; return `<div class="row">${S.roles ? fld('ok-role', 'Profil', sel('ok-role', [['', '—'], ['eleve', 'Élève / étudiant'], ['enseignant', 'Enseignant']], FO.role)) : ''}${fld('ok-class', S.group + ' <span class="mut">(facultatif)</span>', inp('ok-class', 'text', FO.classe, `maxlength="60" list="ok-classes" placeholder="${S.groupPh}"`) + `<datalist id="ok-classes">${classesOf(oid).map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}</div>`; })() : ''}
      ${fld('ok-label', 'Libellé <span class="mut">(facultatif : nom de la personne, poste, n° de commande…)</span>', inp('ok-label', 'text', '', 'maxlength="120"'))}
      <p class="fe" id="ok-err" role="alert"></p><p style="margin-top:14px"><button class="btn b1" type="submit">${manual ? 'Enregistrer la clé' : 'Générer'}</button></p></form>`, true);
  }
  async function submitKeys(fm) {
    K.clearErrors(); const g = (n) => fm.elements[n] ? fm.elements[n].value.trim() : '', er = {}, oid = fm.dataset.org, manual = !!fm.dataset.manual, od = await OD();
    const picked = manual ? [g('ok-prod')] : [...fm.querySelectorAll('input[name="ok-app"]:checked')].map((c) => c.value);
    const apps = picked.map((id) => O.prods.find((p) => p.id === id)).filter(Boolean), prod = apps[0], n = manual ? 1 : parseInt(g('ok-n'), 10);
    if (!apps.length){ const e = fm.querySelector('#e-ok-app'); if (e) e.textContent = 'Cochez au moins une application.'; return; }
    if (manual && !od.keyOk(g('ok-key'))) er['ok-key'] = 'Clé invalide.';
    if (!manual && !(n >= 1 && n <= (apps.length > 1 ? 100 : 500))) er['ok-n'] = apps.length > 1 ? 'Entre 1 et 100 packs.' : 'Entre 1 et 500.';
    if (g('ok-type') === 'pro_entreprise' && !oid) er['ok-type'] = 'Pro Entreprise : générez les clés depuis la fiche de l’entreprise.';
    let expiresAt = null, durationDays = null;
    if (g('ok-dur') === 'date'){ expiresAt = g('ok-date') ? new Date(g('ok-date') + 'T23:59:59') : null; if (!expiresAt || expiresAt < new Date()) er['ok-date'] = 'Choisissez une date future.'; }
    else if (g('ok-dur')) durationDays = parseInt(g('ok-dur'), 10);
    if (K.showErrors(fm, er)) return;
    const btn = fm.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Enregistrement…';
    if (!manual && apps.length > 1) return submitPacks(fm, od, apps, n, { licenseType: g('ok-type'), durationDays, expiresAt, org: oid ? orgById(oid) : null, label: g('ok-label'), role: g('ok-role'), classe: g('ok-class') }, oid, btn);
    const pref = prod.id === 'archiplan' ? 'ARCH' : prod.id === 'archivision' ? 'AVIS' : prod.id.replace(/[^a-z]/gi, '').slice(0, 4);
    const keys = manual ? [g('ok-key')] : Array.from({ length: n }, () => od.generateKey(pref));
    try {
      const out = await od.adminCreateKeys(keys, { productId: prod.id, productName: prod.name, licenseType: g('ok-type'), durationDays, expiresAt, org: oid ? orgById(oid) : null, label: g('ok-label'), role: g('ok-role'), classe: g('ok-class') });
      await loadOrgs();
      pmodal(`<h3>${out.length} clé${out.length > 1 ? 's' : ''} ${manual ? 'enregistrée' : 'générée'}${out.length > 1 ? 's' : ''}</h3><p class="mut">${esc(prod.name)} · ${esc(tLabel(g('ok-type')))}${oid ? ' · ' + esc(orgById(oid).name) : ''}. Transmettez-les au client : chaque personne crée son compte Studio Prism puis saisit sa clé (Mon compte → Activer une clé, ou dans l’application).</p>
        <textarea id="ok-out" readonly rows="${Math.min(12, out.length + 1)}" style="width:100%;font-family:monospace">${esc(out.map((x) => x.key).join('\n'))}</textarea>
        <p style="margin-top:10px"><button class="btn b1" data-a="org-copy-out">Copier les clés</button> ${oid ? `<button class="btn b4" data-a="org-open" data-org="${esc(oid)}">Retour à la fiche</button>` : ''}</p>`, true);
    } catch (e) { fm.querySelector('#ok-err').textContent = errMsg(e) + (e.key ? ' (' + e.key + ')' : ''); btn.disabled = false; btn.textContent = manual ? 'Enregistrer la clé' : 'Générer'; }
  }
  /* libellé d'une clé de pack, lisible : « Pack : ARCHIPLAN, ARCHITRAFIC · libellé » / « Pack PACK-… (application du pack) » */
  const pname = (id) => (O.prods.find((p) => p.id === id) || (window.SP?.catalog?.all?.() || []).find((p) => p.id === id) || {}).name || ({ archiplan: 'ARCHIPLAN', architrafic: 'ARCHITRAFIC', archivision: 'ArchiVision' })[id] || id;
  function packLabel(l) {
    const m = /^Pack ([a-z0-9_+-]+)(?: · (.*))?$/.exec(l || ''); if (m) return `${badge('bd-pro', 'Pack')} ${esc(m[1].split('+').map(pname).join(', '))}${m[2] ? ' · ' + esc(m[2]) : ''}`;
    const d = /^Pack (PACK-[A-Z0-9-]+)(?: · (.*))?$/.exec(l || ''); if (d) return `<span class="mut">Incluse dans le pack ${esc(d[1])}</span>${d[2] ? ' · ' + esc(d[2]) : ''}`;
    return esc(l || '—');
  }
  async function submitPacks(fm, od, apps, n, spec, oid, btn) {
    try {
      const out = await od.adminCreatePacks(n, apps.map((a) => ({ id: a.id, name: a.name })), spec);
      await loadOrgs();
      const names = apps.map((a) => a.name).join(', ');
      pmodal(`<h3>${out.length} clé${out.length > 1 ? 's' : ''} pack générée${out.length > 1 ? 's' : ''}</h3><p class="mut">${esc(names)} · ${esc(tLabel(spec.licenseType))}${oid ? ' · ' + esc(orgById(oid).name) : ''}.
        Une clé par compte : la personne la saisit une seule fois (Mon compte → Activer une clé, ou dans ARCHIPLAN, ARCHITRAFIC ou ArchiVision) et toutes ces applications s’activent.</p>
        <textarea id="ok-out" readonly rows="${Math.min(12, out.length + 1)}" style="width:100%;font-family:monospace">${esc(out.map((x) => x.key).join('\n'))}</textarea>
        <details style="margin-top:8px"><summary>Détail : clé de chaque application (activables aussi une par une)</summary><pre style="font-size:12px;white-space:pre-wrap">${esc(out.map((x) => x.key + '\n' + x.apps.map((a) => '   ' + a.productName + ' : ' + a.key).join('\n')).join('\n\n'))}</pre></details>
        <p style="margin-top:10px"><button class="btn b1" data-a="org-copy-out">Copier les clés pack</button> ${oid ? `<button class="btn b4" data-a="org-open" data-org="${esc(oid)}">Retour à la fiche</button>` : ''}</p>`, true);
    } catch (e) { fm.querySelector('#ok-err').textContent = errMsg(e) + (e.key ? ' (' + e.key + ')' : ''); btn.disabled = false; btn.textContent = 'Générer'; }
  }
  function keysCsv(oid) {
    const o = orgById(oid), ks = O.keys.filter((k) => (k.orgId || '') === (oid || '')), S = SEG[segOfOrg(oid)];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + [['Clé', 'Profil', S.group, 'Produit', 'Type', 'Validité', 'Libellé', 'Statut', 'Activée par', 'Activée le'].map(q).join(';'),
      ...ks.map((k) => [k.key, ROLE_L[k.role] || '', k.classe, k.productName, tLabel(k.licenseType), dur(k), k.label, KS[k.status]?.[1] || k.status, k.redeemedEmail, k.redeemedAt ? fdate(k.redeemedAt) : ''].map(q).join(';'))].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `cles-${(o ? o.name : 'sans-etablissement').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}.csv`; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---- Excel (.xlsx) : une feuille par classe (+ Enseignants, + Sans classe) ---- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u) => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data), lh = new DataView(new ArrayBuffer(30)), ch = new DataView(new ArrayBuffer(46));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2]].forEach(([o, v, z]) => z === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [42, off, 4]].forEach(([o, v, z]) => z === 4 ? ch.setUint32(o, v, true) : ch.setUint16(o, v, true));
      parts.push(lh, name, data); cen.push(ch, name); off += 30 + name.length + data.length;
    }
    const cs = cen.reduce((a, p) => a + p.byteLength, 0), end = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, cs, 4], [16, off, 4]].forEach(([o, v, z]) => z === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true));
    return new Blob([...parts, ...cen, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const xe = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const col = (i) => String.fromCharCode(65 + i);
  function sheet(rows, widths) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>` +
      rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => c == null || c === '' ? '' : `<c r="${col(ci)}${ri + 1}" t="inlineStr"${ri === 0 ? ' s="1"' : ri === 2 ? ' s="2"' : ci === 0 ? ' s="3"' : ''}><is><t xml:space="preserve">${xe(c)}</t></is></c>`).join('')}</row>`).join('') + '</sheetData></worksheet>';
  }
  function keysXlsx(oid) {
    const o = orgById(oid), ks = O.keys.filter((k) => k.orgId === oid), groups = new Map(), S = SEG[segOfKind(o.kind)], NG = S.noGroup;
    ks.slice().sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), 'fr', { numeric: true })).forEach((k) => { const g = S.roles && k.role === 'enseignant' ? 'Enseignants' : (k.classe || NG); (groups.get(g) || groups.set(g, []).get(g)).push(k); });
    const names = [...groups.keys()].sort((a, b) => (a === 'Enseignants' ? -1 : b === 'Enseignants' ? 1 : a === NG ? 1 : b === NG ? -1 : a.localeCompare(b, 'fr', { numeric: true })));
    if (!names.length) return toast('Aucune clé à exporter.');
    const used = new Set(), safe = (n) => { let b = n.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 28) || 'Feuille', x = b, i = 2; while (used.has(x)) x = b + ' ' + i++; used.add(x); return x; };
    const sheets = names.map((n) => ({ name: safe(n), xml: sheet([[`${o.name} — ${n}`], [`${groups.get(n).length} clé(s) · exporté le ${new Date().toLocaleDateString('fr-FR')}`], ['Clé', 'Profil', S.group, `Libellé / ${S.person}`, 'Produit', 'Licence', 'Validité', 'Statut', 'Activée par', 'Activée le'],
      ...groups.get(n).map((k) => [k.key, ROLE_L[k.role] || '', k.classe || '', k.label || '', k.productName, tLabel(k.licenseType), dur(k), KS[k.status]?.[1] || k.status, k.redeemedEmail || '', k.redeemedAt ? fdate(k.redeemedAt) : ''])], [24, 12, 12, 28, 14, 14, 24, 11, 28, 12]) }));
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((x, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2A2E35"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0"><alignment horizontal="left"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const files = [{ name: '[Content_Types].xml', data: ct },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((x, i) => `<sheet name="${xe(x.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((x, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: styles }, ...sheets.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: x.xml }))];
    const a = document.createElement('a'); a.href = URL.createObjectURL(zip(files));
    a.download = `cles-${o.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}-par-${S.roles ? 'classe' : 'service'}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---- actions ---- */
  Object.assign(A, {
    'org-reload': () => loadOrgs(),
    'org-pending': () => { O.showPending = !O.showPending; renderPending(); },
    'org-approve': (b) => approveForm(b.dataset.uid),
    'org-req-ok': (b) => memberForm(b.dataset.id),
    'org-req-no': async (b) => { b.disabled = true; try { await (await OD()).adminCloseRequest(b.dataset.id, 'refused'); await loadOrgs(); toast('Demande refusée.'); } catch (e) { toast(errMsg(e)); b.disabled = false; } },
    'org-resp': async (b) => { b.disabled = true; try { await (await OD()).adminSetResponsable(b.dataset.uid, b.dataset.on === '1'); toast(b.dataset.on === '1' ? 'Responsable nommé.' : 'Responsable retiré.'); openOrg(b.dataset.org); } catch (e) { toast(errMsg(e)); b.disabled = false; } },
    'org-refuse': (b) => refuseForm(b.dataset.uid),
    'org-refuse-ok': async (b) => { const u = pendById(b.dataset.uid); if (!u) return; b.disabled = true; b.textContent = 'Suppression…';
      try { const d = await K.dataMod(); await (K.serverOn() ? d.deleteUserByAdmin(u.uid, u.email) : d.deleteUserNoServer(u.uid, u.email)); A.x(); await loadOrgs(); toast('Demande refusée : ' + u.email); }
      catch (e) { const er = document.getElementById('rf-err'); if (er) er.textContent = errMsg(e); b.disabled = false; b.textContent = 'Réessayer'; } },
    'org-new': () => orgForm(null),
    'org-edit': (b) => orgForm(b.dataset.org),
    'org-open': (b) => openOrg(b.dataset.org),
    'org-keys-new': (b) => keysForm(b.dataset.org, false),
    'org-key-manual': (b) => keysForm(b.dataset.org, true),
    'org-keys-csv': (b) => keysCsv(b.dataset.org),
    'org-key-copy': (b) => copy(b.dataset.k),
    'org-copy-out': () => copy(document.getElementById('ok-out')?.value || ''),
    'org-key-revoke': async (b) => { b.disabled = true; try { await (await OD()).adminSetKeyStatus(b.dataset.id, 'revoked'); await loadOrgs(); refreshOpen(b); toast('Clé révoquée.'); } catch (e) { toast(errMsg(e)); b.disabled = false; } },
    'org-key-restore': async (b) => { b.disabled = true; try { await (await OD()).adminSetKeyStatus(b.dataset.id, 'available'); await loadOrgs(); refreshOpen(b); toast('Clé rétablie.'); } catch (e) { toast(errMsg(e)); b.disabled = false; } },
    // Clé sans établissement (disponible ou activée) : suppression après confirmation. Une licence déjà obtenue avec la clé reste valable.
    'org-key-del-ask': (b) => { const k = O.keys.find((x) => x.id === b.dataset.id); if (!k) return; pmodal(`<h3>Supprimer la clé ${esc(k.key)} ?</h3><p>${k.status === 'redeemed' ? `Cette clé a été activée par <b>${esc(k.redeemedEmail || '—')}</b>. La clé est supprimée, mais la <b>licence</b> déjà obtenue reste valable (à retirer depuis la fiche du compte si besoin).` : 'Cette clé n’a pas encore été activée : elle ne pourra plus l’être.'}</p><p class="mut">Action définitive.</p><p><button class="btn btn-danger" data-a="org-key-del" data-id="${esc(k.id)}">Supprimer la clé</button></p>`); },
    'org-key-del': async (b) => { b.disabled = true; const oid = O.keys.find((k) => k.id === b.dataset.id)?.orgId || ''; try { await (await OD()).adminDeleteKey(b.dataset.id); await loadOrgs(); if (b.closest('.mod')) { if (oid) openOrg(oid); else A.x(); } toast('Clé supprimée.'); } catch (e) { toast(errMsg(e)); b.disabled = false; } },
    'org-key-label': (b) => { const k = O.keys.find((x) => x.id === b.dataset.id); pmodal(`<h3>Modifier la clé</h3><p><code class="kcode">${esc(k.key)}</code></p><form data-f="org-label" data-id="${esc(k.id)}" data-org="${esc(k.orgId || '')}">${fld('kl', 'Libellé', inp('kl', 'text', k.label, 'maxlength="120"'))}${k.orgId ? (() => { const S = SEG[segOfOrg(k.orgId)]; return `<div class="row">${S.roles ? fld('kr', 'Profil', sel('kr', [['', '—'], ['eleve', 'Élève / étudiant'], ['enseignant', 'Enseignant']], k.role || '')) : ''}${fld('kc', S.group, inp('kc', 'text', k.classe, 'maxlength="60"'))}</div>`; })() : ''}${k.status === 'redeemed' ? '<p class="mut">Clé déjà activée : le profil et le groupe du compte ne changent pas (modifiez-les depuis la fiche du compte).</p>' : ''}<p><button class="btn b1" type="submit">Enregistrer</button></p></form>`); },
    'org-del': (b) => { const o = orgById(b.dataset.org), nk = O.keys.filter((k) => k.orgId === o.id).length; pmodal(`<h3>Supprimer « ${esc(o.name)} » ?</h3><p>En un seul clic : la fiche, ses <b>${nk} clé${nk > 1 ? 's' : ''}</b> et les <b>licences</b> obtenues avec ces clés sont supprimées, et les comptes rattachés sont détachés. Les comptes eux-mêmes et leurs projets sont conservés.</p><p class="mut">Action définitive.</p><p class="fe" id="od-err" role="alert"></p><p><button class="btn btn-danger" data-a="org-del-ok" data-org="${esc(o.id)}">Supprimer ${SEG[segOfKind(o.kind)].roles ? 'l’établissement' : 'l’entreprise'} et ses licences</button></p>`); },
    'org-del-ok': async (b) => { b.disabled = true; b.textContent = 'Suppression…'; try { const r = await (await OD()).deleteOrg(b.dataset.org); A.x(); FO.id = ''; await loadOrgs(); toast(`Fiche supprimée : ${r.keys} clé(s), ${r.licenses} licence(s), ${r.users} compte(s) détaché(s).`); } catch (e) { document.getElementById('od-err').textContent = errMsg(e); b.disabled = false; b.textContent = 'Réessayer'; } },
    'org-frole': (b) => { FO.role = b.dataset.v; renderFiche(); },
    'org-keys-xlsx': (b) => keysXlsx(b.dataset.org),
    'org-attach': (b) => { const S = SEG[segOfOrg(b.dataset.org)]; const o = orgById(b.dataset.org); pmodal(`<h3>Rattacher des comptes existants</h3><p class="mut">Des personnes qui ont déjà un compte Studio Prism rejoignent ${esc(o ? o.name : '')}. Leurs projets et leurs licences personnelles sont conservés.</p><form data-f="org-attach" data-org="${esc(b.dataset.org)}">${fld('oa-mail', 'E-mail(s) des comptes Studio Prism', `<textarea id="oa-mail" name="oa-mail" rows="4" maxlength="8000" placeholder="prenom.nom@entreprise.fr&#10;autre.salarie@entreprise.fr"></textarea>`, 'Une adresse par ligne (ou séparées par des virgules). Un compte déjà rattaché ailleurs est déplacé ici.')}<div class="row">${S.roles ? fld('oa-role', 'Profil', sel('oa-role', [['', '—'], ['eleve', 'Élève / étudiant'], ['enseignant', 'Enseignant']], '')) : ''}${fld('oa-class', S.group, inp('oa-class', 'text', '', 'maxlength="60"'))}</div><p class="fe" id="oa-err" role="alert"></p><p><button class="btn b1" type="submit">Rattacher</button></p></form>`); },
    'org-detach': async (b) => { b.disabled = true; try { await (await OD()).adminSetUserOrg(b.dataset.uid, null); toast('Compte détaché.'); openOrg(b.dataset.org); } catch (e) { toast(errMsg(e)); b.disabled = false; } }
  });
  function refreshOpen(b) { const oid = b.closest('.mod') ? (O.keys.find((k) => k.id === b.dataset.id)?.orgId || '') : null; if (oid) openOrg(oid); }

  document.addEventListener('submit', async (e) => {
    const f = e.target.dataset && e.target.dataset.f; if (!f || f.indexOf('org-') !== 0 && f.indexOf('co-') !== 0 && f !== 'key-redeem') return;
    e.preventDefault();
    if (f === 'org-form') submitOrg(e.target);
    else if (f === 'org-approve') submitApprove(e.target);
    else if (f === 'org-req-ok') submitMember(e.target);
    else if (f === 'co-convert') submitConvert(e.target);
    else if (f === 'co-add') submitAdd(e.target);
    else if (f === 'org-keys') submitKeys(e.target);
    else if (f === 'org-label') { const fm = e.target; try { await (await OD()).adminSetKeyLabel(fm.dataset.id, fm.elements.kl.value, fm.elements.kr ? fm.elements.kr.value : '', fm.elements.kc ? fm.elements.kc.value.trim() : ''); await loadOrgs(); if (fm.dataset.org) openOrg(fm.dataset.org); else A.x(); } catch (x) { toast(errMsg(x)); } }
    else if (f === 'org-attach') {
      const fm = e.target, err = fm.querySelector('#oa-err'), btn = fm.querySelector('button[type=submit]'), od = await OD(), org = orgById(fm.dataset.org);
      const mails = [...new Set(fm.elements['oa-mail'].value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
      err.textContent = '';
      if (!mails.length) { err.textContent = 'Saisissez au moins une adresse e-mail.'; return; }
      const bad = mails.filter((m) => !K.EMAIL_RE.test(m)); if (bad.length) { err.textContent = 'Adresse(s) invalide(s) : ' + bad.join(', '); return; }
      btn.disabled = true; btn.textContent = 'Rattachement…';
      const role = fm.elements['oa-role'] ? fm.elements['oa-role'].value : '', classe = fm.elements['oa-class'].value.trim(), ok = [], moved = [], missing = [], failed = [];
      for (const m of mails) {
        try { const u = await od.adminFindUserByEmail(m); if (!u) { missing.push(m); continue; }
          await od.adminSetUserOrg(u.uid, org, role, classe); ok.push(m); if (u.orgId && u.orgId !== org.id) moved.push(`${m} (quitte ${u.orgName || 'un autre groupe'})`);
        } catch (x) { failed.push(`${m} : ${errMsg(x)}`); }
      }
      if (!missing.length && !failed.length) { toast(`${ok.length} compte${ok.length > 1 ? 's' : ''} rattaché${ok.length > 1 ? 's' : ''}.${moved.length ? ' Déplacé(s) : ' + moved.join(', ') + '.' : ''}`); openOrg(fm.dataset.org); return; }
      btn.disabled = false; btn.textContent = 'Rattacher';
      err.innerHTML = [ok.length ? `${ok.length} rattaché(s).` : '', missing.length ? `Aucun compte Studio Prism pour : ${esc(missing.join(', '))} (la personne doit d’abord créer son compte, ou recevoir une clé).` : '', failed.length ? esc(failed.join(' · ')) : ''].filter(Boolean).join('<br>');
      fm.elements['oa-mail'].value = missing.concat(failed.map((x) => x.split(' : ')[0])).join('\n');
    }
    else if (f === 'key-redeem') submitRedeem(e.target);
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'org-q') { O.q = e.target.value; renderOrgs(); } });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'org-fclass') { FO.classe = e.target.value; renderFiche(); return; }
    if (e.target.id === 'ok-role') { const t = document.getElementById('ok-type'), v = { eleve: 'etudiant', enseignant: 'enseignant' }[e.target.value]; if (t && v && [...t.options].some((o) => o.value === v)) t.value = v; return; }
    if (e.target.name === 'ok-app') { const fm = e.target.form, ids = [...fm.querySelectorAll('input[name="ok-app"]:checked')].map((c) => c.value), t = fm.querySelector('#ok-type'), cur = t && t.value;
      if (t){ t.innerHTML = typesForMany(ids).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); if ([...t.options].some((o) => o.value === cur)) t.value = cur; }
      const pk = ids.length > 1, l = fm.querySelector('#ok-n-l'), nt = fm.querySelector('#ok-pack-note'), er = fm.querySelector('#e-ok-app'); if (er) er.textContent = '';
      if (l) l.textContent = pk ? 'Nombre de clés pack' : 'Nombre de clés';
      if (nt) nt.textContent = pk ? `Clé pack : ${ids.length} applications activées par une seule clé.` : '';
      return; }
    if (e.target.id === 'ok-prod') { const t = document.getElementById('ok-type'); if (t) t.innerHTML = typesFor(e.target.value).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); } });

  /* ================================================================== MON COMPTE : ESPACE ENTREPRISE
     - responsable d'une entreprise validée : clés de licence, collaborateurs, demandes d'ajout de personnes (validées par Studio Prism) ;
     - particulier : demande de passage en compte Entreprise (représentant ou responsable, SIRET, licences souhaitées). */
  const RQ_ST = { pending: ['bd-pend', 'En attente'], accepted: ['bd-ok', 'Acceptée'], refused: ['bd-off', 'Refusée'] };
  async function mountCompany(el, p) {
    if (!el) return;
    const user = st.auth.user;
    if (p.orgRole === 'responsable' && p.orgId) {
      el.innerHTML = '<p class="mut">Chargement de votre entreprise…</p>';
      try {
        const od = await OD();
        const [keys, mem, reqs] = await Promise.all([od.orgKeys(p.orgId), od.orgMembers(p.orgId), od.myRequests(user.uid)]);
        const apps = [...new Map(keys.map((k) => [k.productId, k.productName])).entries()];
        const opts = (apps.length ? apps : K.coApps()).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
        keys.sort((a, b) => String(a.status).localeCompare(String(b.status)) || String(a.label).localeCompare(String(b.label)));
        el.innerHTML = `<div class="fiche-h"><h2 class="lh" id="s-co">Mon entreprise · ${esc(p.orgName || p.companyName || '')}</h2></div>
          <p class="mt2">Vous êtes <b>responsable</b> de cette entreprise. Les clés ci-dessous sont celles de votre entreprise : transmettez-les à vos collaborateurs ; chacun crée son compte Studio Prism puis saisit sa clé (Mon compte › Activer une clé de licence, ou dans l’application).</p>
          <h3 class="lh" style="margin-top:18px;font-size:18px">Clés de licence (${keys.length})</h3>
          ${keys.length ? `<div class="adm-tw"><table class="adm-t"><thead><tr><th>Clé</th><th>Application</th><th>Pour</th><th>Statut</th><th></th></tr></thead><tbody>${keys.map((k) => `<tr><td data-label="Clé"><code class="kcode">${esc(k.key)}</code></td><td data-label="Application">${esc(k.productName)}</td><td data-label="Pour">${esc(k.label || '—')}</td>
            <td data-label="Statut">${k.status === 'redeemed' ? badge('bd-kind', 'Activée') + `<small> ${esc(k.redeemedEmail || '')}</small>` : keyBadge(k)}</td><td class="adm-act">${k.status === 'available' ? `<button class="btn b4" data-a="org-key-copy" data-k="${esc(k.key)}">Copier</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Aucune clé pour le moment : elles apparaissent ici dès que Studio Prism valide une demande.</p>'}
          <h3 class="lh" style="margin-top:22px;font-size:18px">Collaborateurs (${mem.length})</h3>
          ${mem.length ? `<ul class="co-mem">${mem.map((u) => `<li><b>${esc(fullName(u))}</b> <span class="mut">${esc(u.email)}</span>${u.orgRole === 'responsable' ? ' ' + badge('bd-kind', 'Responsable') : ''}</li>`).join('')}</ul>` : '<p class="mut">Aucun collaborateur rattaché pour le moment.</p>'}
          <h3 class="lh" style="margin-top:22px;font-size:18px">Ajouter des personnes</h3>
          <form data-f="co-add" class="panel" novalidate><div class="acc-f"><label for="co-mails">Adresses e-mail <span class="mut">(une par ligne)</span></label><textarea id="co-mails" rows="3" maxlength="4000" placeholder="prenom.nom@entreprise.fr"></textarea></div>
            <div class="acc-f"><label for="co-app">Application</label><select id="co-app">${opts}</select></div>
            <p class="acc-h">Chaque ajout est vérifié par Studio Prism, qui délivre ensuite une clé de licence Pro Entreprise par personne ; elle apparaîtra dans la liste ci-dessus.</p>
            <p class="fe" id="co-err" role="alert"></p><p><button class="btn b1" type="submit">Envoyer la demande</button></p></form>
          ${reqs.length ? `<h3 class="lh" style="margin-top:22px;font-size:18px">Mes demandes</h3><ul class="co-mem">${reqs.map((r) => `<li>${badge(RQ_ST[r.status]?.[0] || '', RQ_ST[r.status]?.[1] || r.status)} ${r.kind === 'member' ? `Ajout de ${esc((r.emails || []).join(', '))}` : `Inscription : ${esc((r.items || []).map((x) => x.qty + ' × ' + (x.productName || x.productId)).join(', '))}`} <span class="mut">· ${esc(fdate(r.createdAt))}</span></li>`).join('')}</ul>` : ''}`;
        el.dataset.org = p.orgId;
      } catch (e) { el.innerHTML = `<p class="fe" style="display:block">${esc(errMsg(e))}</p>`; }
      return;
    }
    if (p.accountKind !== 'company' && !p.orgId) {
      el.innerHTML = `<div class="panel"><h2 class="lh" style="font-size:20px">Votre activité est une entreprise ?</h2><p class="mt2">Le représentant de l’entreprise, ou le responsable d’une agence, d’un service ou d’une branche, peut demander un compte Entreprise avec les licences Pro Entreprise souhaitées. Studio Prism vérifie la demande ; en attendant, votre compte est mis en attente (vos projets sont conservés).</p><p style="margin-top:12px"><button class="btn b4" data-a="co-convert">Demander un compte Entreprise</button></p></div>`;
      return;
    }
    el.innerHTML = '';
  }
  A['co-convert'] = () => {
    const f = K.field;
    pmodal(`<h3>Demander un compte Entreprise</h3><form data-f="co-convert" novalidate>
      <div class="acc-f"><label for="coRole">Vous êtes</label><select id="coRole" name="coRole"><option value="">Choisir…</option><option value="representant">Représentant de l’entreprise (gérant, président, directeur…)</option><option value="responsable">Responsable d’une agence, d’un service ou d’une branche</option></select><p class="fe" id="e-coRole" role="alert"></p></div>
      ${f('coName', 'Nom de l’entreprise', 'text', 'organization', { attrs: 'maxlength="120"' })}${f('coSiret', 'Numéro SIRET', 'text', 'off', { attrs: 'maxlength="17" inputmode="numeric" placeholder="14 chiffres"' })}
      ${f('coEmail', 'E-mail de l’entreprise', 'email', 'off', { opt: 1, attrs: 'maxlength="160"' })}<div class="row">${f('coJob', 'Votre fonction', 'text', 'organization-title', { opt: 1, attrs: 'maxlength="80"' })}${f('coPhone', 'Téléphone professionnel', 'tel', 'tel', { opt: 1, attrs: 'maxlength="30"' })}</div>
      <h4 style="margin-top:12px">Licences demandées</h4><div id="coLics" class="co-lics">${K.coLicRow(0)}</div><p><button type="button" class="lk" data-a="co-lic-add">+ Ajouter une application</button></p><p class="fe" id="e-coLics" role="alert"></p>
      <p class="fe" id="cv-err" role="alert"></p><p><button class="btn b1" type="submit">Envoyer la demande</button></p></form>`, true);
  };
  async function submitConvert(fm) {
    K.clearErrors(); const a = st.auth, rc = K.readCompany(fm, a.user.email);
    if (K.showErrors(fm, rc.er)) return;
    const btn = fm.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Envoi…';
    try { await (await OD()).requestCompanyConversion(a.user, a.profile, rc.company); A.x(); toast('Demande envoyée : votre compte est en attente de validation.'); }
    catch (e) { fm.querySelector('#cv-err').textContent = errMsg(e); btn.disabled = false; btn.textContent = 'Envoyer la demande'; }
  }
  async function submitAdd(fm) {
    const err = fm.querySelector('#co-err'), btn = fm.querySelector('button[type=submit]'), p = st.auth.profile;
    const mails = [...new Set(fm.elements['co-mails'].value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
    err.textContent = '';
    if (!mails.length) { err.textContent = 'Saisissez au moins une adresse e-mail.'; return; }
    const bad = mails.filter((m) => !K.EMAIL_RE.test(m)); if (bad.length) { err.textContent = 'Adresse(s) invalide(s) : ' + bad.join(', '); return; }
    if (mails.length > 50) { err.textContent = '50 adresses au maximum par demande.'; return; }
    const sel = fm.elements['co-app'], item = { productId: sel.value, productName: sel.options[sel.selectedIndex].text, licenseType: 'pro_entreprise', qty: mails.length };
    btn.disabled = true; btn.textContent = 'Envoi…';
    try { await (await OD()).requestMembers(st.auth.user, p, mails, item); toast('Demande envoyée à Studio Prism.'); mountCompany(document.getElementById('acc-co-sec'), p); }
    catch (e) { err.textContent = errMsg(e); btn.disabled = false; btn.textContent = 'Envoyer la demande'; }
  }
  window.SP.companyUI = { mount: mountCompany };

  /* ================================================================== UTILISATEUR : ACTIVER UNE CLÉ */
  const PENDING = 'sp.pendingKey';
  function activatePage() {
    const a = st.auth, pre = (() => { try { return sessionStorage.getItem(PENDING) || ''; } catch (e) { return ''; } })();
    const shell = (inner) => `<section class="pg"><div class="w" style="max-width:640px"><p class="crumb"><a href="#/">Studio Prism</a> / Activer une clé</p><h1>Activer une clé de licence</h1>${inner}</div></section>`;
    if (a.status === 'loading') return V(shell('<p class="lead" role="status">Vérification de votre session…</p>'));
    if (a.status !== 'in') {
      return V(shell(`<p class="lead">Vous avez reçu une clé (ex. <code>ARCH-7K2F-9QXM-4TNP</code>) ? Créez votre compte Studio Prism ou connectez-vous, puis saisissez-la ici : la licence s’active sur votre compte.</p>
        <form data-f="key-pre" class="panel" onsubmit="return false">${fld('kr-key', 'Votre clé', inp('kr-key', 'text', pre, 'maxlength="60" autocomplete="off" autocapitalize="characters" style="font-family:monospace"'))}</form>
        <p style="margin-top:14px"><a class="btn b1" href="#/compte/inscription" data-a="key-remember">Créer mon compte</a> <a class="btn b4" href="#/compte/connexion" data-a="key-remember">J’ai déjà un compte</a></p>`));
    }
    V(shell(`<p class="lead">Compte : <b>${esc(a.user.email)}</b>. Saisissez la clé reçue de Studio Prism ou de votre établissement.</p>
      <form data-f="key-redeem" class="panel" novalidate>${fld('kr-key', 'Clé de licence', inp('kr-key', 'text', pre, 'maxlength="60" autocomplete="off" autocapitalize="characters" placeholder="ABCD-EFGH-IJKL-MNOP" style="font-family:monospace;letter-spacing:.06em"'))}
      <div id="kr-peek" class="mt2"></div><p class="fe" id="kr-err" role="alert"></p><p style="margin-top:12px"><button class="btn b1" type="submit">Activer</button> <a class="btn b4" href="#/compte">Mon compte</a></p></form>`));
    if (pre) peek(pre);
  }
  A['key-remember'] = (b) => { try { const v = document.getElementById('kr-key')?.value.trim(); if (v) sessionStorage.setItem(PENDING, v); } catch (e) { /* stockage indisponible */ } location.hash = b.getAttribute('href'); };
  let peekT = 0;
  async function peek(v) {
    const box = document.getElementById('kr-peek'); if (!box) return;
    try { await window.SP?.catalog?.load?.(); } catch (e) { /* noms d'applications : catalogue indisponible */ }
    try { const od = await OD(); if (!od.keyOk(v)) { box.innerHTML = ''; return; } const k = await od.peekKey(v), pk = od.packApps(k.label);
      if (pk.length > 1) { box.innerHTML = `<div class="acc-sum">${badge('bd-pro', 'Pack')} <b>${esc(pk.map(pname).join(', '))}</b> — ${esc(tLabel(k.licenseType))} · ${esc(dur(k))}<br>Une seule clé : toutes ces applications s’activent sur votre compte.${k.orgName ? `<br>Établissement : <b>${esc(k.orgName)}</b> (votre compte y sera rattaché)` : ''}</div>`; return; }
      box.innerHTML = k.status === 'available' ? `<div class="acc-sum"><b>${esc(k.productName)}</b> — ${esc(tLabel(k.licenseType))} · ${esc(dur(k))}${k.orgName ? `<br>Établissement : <b>${esc(k.orgName)}</b> (votre compte y sera rattaché)` : ''}</div>` : `<p class="fe" style="display:block">${esc(errMsg({ code: k.status === 'redeemed' ? (k.redeemedBy === st.auth.user?.uid ? 'app/key-mine' : 'app/key-used') : 'app/key-revoked' }))}</p>`;
    } catch (e) { box.innerHTML = e.code === 'app/key-unknown' ? `<p class="fe" style="display:block">${esc(errMsg(e))}</p>` : ''; }
  }
  document.addEventListener('input', (e) => { if (e.target.id === 'kr-key' && e.target.closest('[data-f="key-redeem"]')) { clearTimeout(peekT); const v = e.target.value; peekT = setTimeout(() => peek(v), 350); } });
  async function submitRedeem(fm) {
    const err = fm.querySelector('#kr-err'), btn = fm.querySelector('button[type=submit]'), v = fm.elements['kr-key'].value; err.textContent = '';
    btn.disabled = true; btn.textContent = 'Activation…';
    try {
      const res = await (await OD()).redeemAny(v, st.auth.user), k = res.find((r) => r.ok) || res[0];
      try { sessionStorage.removeItem(PENDING); } catch (e) { /* rien */ }
      if (res.length > 1) return V(`<section class="pg"><div class="w" style="max-width:640px"><h1>Pack activé</h1><div class="panel"><ul class="acc-sumul">${res.map((r) => `<li><b>${esc(r.productName || pname(r.productId))}</b> — ${r.ok ? `${esc(tLabel(r.licenseType))} activée (${esc(dur(r))})` : esc(errMsg({ code: r.code }))}</li>`).join('')}</ul>${k.orgName ? `<p>Votre compte est rattaché à <b>${esc(k.orgName)}</b>.</p>` : ''}
        <p style="margin-top:12px"><a class="btn b1" href="#/compte">Mon compte</a></p></div></div></section>`);
      V(`<section class="pg"><div class="w" style="max-width:640px"><h1>Licence activée</h1><div class="panel"><p><b>${esc(k.productName)}</b> — ${esc(tLabel(k.licenseType))} est activée sur votre compte (${esc(dur(k))}).</p>${k.orgName ? `<p>Votre compte est rattaché à <b>${esc(k.orgName)}</b>.</p>` : ''}
        <p style="margin-top:12px"><a class="btn b1" href="#/compte">Mon compte</a>${k.productId === 'archiplan' ? ' <a class="btn b4" href="https://archiplan.studio-prism.com/" target="_blank" rel="noopener">Ouvrir ARCHIPLAN</a>' : ''}</p></div></div></section>`);
    } catch (e) { console.error('[Studio Prism] Activation de clé :', e); err.textContent = errMsg(e); btn.disabled = false; btn.textContent = 'Activer'; }
  }
  /* Clé saisie avant la connexion : on reprend l'activation dès que le compte est ouvert. */

  const scol = () => K.adminGate('orgs', (p, sh) => orgsTab('scol', p, sh)), ents = () => K.adminGate('ents', (p, sh) => orgsTab('ent', p, sh));
  Object.assign(R, { 'admin/scolaire': scol, 'admin/etablissements': scol, 'admin/entreprises': ents, activer: activatePage });
  import(K.MOD('orgsdata.js')).then((m) => { window.SP_ORG_KINDS = m.ORG_KINDS; }).catch(() => {});
})();
