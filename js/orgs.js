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
  const ROLE_L = { eleve: 'Élève', enseignant: 'Enseignant' };
  const TYPE_L = { etudiant: 'Étudiant', enseignant: 'Enseignant' };
  const tLabel = (t) => TYPE_L[t] || typeLabel(t);
  const keyBadge = (k) => badge(KS[k.status]?.[0] || 'bd-off', KS[k.status]?.[1] || k.status);
  const dur = (k) => k.expiresAt ? `jusqu’au ${fdate(k.expiresAt)}` : k.durationDays ? `${k.durationDays % 365 === 0 ? (k.durationDays / 365) + ' an' + (k.durationDays > 365 ? 's' : '') : k.durationDays + ' jours'} après activation` : 'sans limite';

  /* ================================================================== ADMINISTRATION */
  const O = { orgs: [], keys: [], prods: [], offers: [], busy: false, err: '', q: '' };

  function orgsTab(p, shell) {
    V(shell(`<p class="lead">Établissements, entreprises et clés de licence. Une clé peut être remise avant la création du compte : la personne crée son compte Studio Prism puis saisit sa clé, la licence s’active et le compte est rangé dans son établissement.</p>
<div class="adm-stats" id="org-stats"></div>
<div class="adm-tools"><div class="acc-f adm-q" style="flex:1"><label for="org-q">Rechercher</label><input id="org-q" type="search" placeholder="Établissement, SIRET, contact, clé…" autocomplete="off"></div>
<button class="btn b4" data-a="org-keys-new" data-org="">Générer des clés</button> <button class="btn b4" data-a="org-key-manual" data-org="">Saisir une clé</button> <button class="btn b1" data-a="org-new">+ Établissement / entreprise</button></div>
<div id="org-list"><p class="mut">Chargement…</p></div>
<h2 class="lh" style="margin-top:28px">Clés sans établissement</h2><p class="mut">Clés individuelles (vente à un particulier, licence offerte…).</p><div id="org-free-keys"></div>`));
    loadOrgs();
  }
  async function loadOrgs() {
    try {
      const [od, pd] = await Promise.all([OD(), PD()]);
      [O.orgs, O.keys, O.prods, O.offers] = await Promise.all([od.adminListOrgs(), od.adminListKeys(null), pd.adminListProducts(), pd.adminListOffers().catch(() => [])]);
      O.err = '';
    } catch (e) { console.error('[Studio Prism] Établissements :', e); O.err = errMsg(e); }
    renderOrgs();
  }
  function renderOrgs() {
    const list = document.getElementById('org-list'); if (!list) return;
    if (O.err) { list.innerHTML = `<div class="panel"><p>${esc(O.err)}</p><p class="mut">Les règles Firestore du site doivent inclure les blocs « organizations » et « licenseKeys ».</p><p><button class="btn b1" data-a="org-reload">Réessayer</button></p></div>`; return; }
    const q = O.q.trim().toLowerCase(), m = (s) => !q || String(s || '').toLowerCase().includes(q);
    const kOf = (oid) => O.keys.filter((k) => (k.orgId || '') === oid);
    const st2 = document.getElementById('org-stats');
    if (st2) st2.innerHTML = [['Établissements', O.orgs.length], ['Clés disponibles', O.keys.filter((k) => k.status === 'available').length], ['Clés activées', O.keys.filter((k) => k.status === 'redeemed').length], ['Postes prévus', O.orgs.reduce((s, o) => s + (o.seats || 0), 0)]]
      .map(([l, n]) => `<div class="adm-stat"><span class="adm-n">${n}</span><span class="adm-l">${l}</span></div>`).join('');
    const orgs = O.orgs.filter((o) => m(o.name) || m(o.siret) || m(o.contactName) || m(o.email) || kOf(o.id).some((k) => m(k.key) || m(k.redeemedEmail)));
    list.innerHTML = orgs.length ? `<div class="adm-tw"><table class="adm-t org-t"><thead><tr><th>Établissement</th><th>Type</th><th>Contact</th><th>Postes</th><th>Clés</th><th>Statut</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${orgs.map((o) => {
      const ks = kOf(o.id), used = ks.filter((k) => k.status === 'redeemed').length, avail = ks.filter((k) => k.status === 'available').length;
      return `<tr><td data-label="Établissement"><div class="adm-v"><b>${esc(o.name)}</b><small>${esc(o.siret ? 'SIRET ' + o.siret : '')}</small></div></td>
        <td data-label="Type"><div class="adm-v">${badge('bd-kind', (window.SP_ORG_KINDS || {})[o.kind] || o.kind || '—')}</div></td>
        <td data-label="Contact"><div class="adm-v">${esc(o.contactName || '—')}<small>${esc(o.email || '')}${o.phone ? ' · ' + esc(o.phone) : ''}</small></div></td>
        <td data-label="Postes"><div class="adm-v"><b>${used}</b> / ${o.seats || '—'}<small>comptes activés / prévus</small></div></td>
        <td data-label="Clés"><div class="adm-v">${avail} disponible${avail > 1 ? 's' : ''}<small>${ks.length} au total</small></div></td>
        <td data-label="Statut"><div class="adm-v">${badge(o.status === 'active' ? 'bd-ok' : 'bd-off', o.status === 'active' ? 'Actif' : 'Suspendu')}</div></td>
        <td class="adm-act"><button class="btn b4" data-a="org-open" data-org="${esc(o.id)}">Fiche</button> <button class="btn b4" data-a="org-edit" data-org="${esc(o.id)}">Modifier</button></td></tr>`; }).join('')}</tbody></table></div>`
      : `<div class="panel"><p>${O.orgs.length ? 'Aucun établissement ne correspond.' : 'Aucun établissement pour le moment. Créez-en un pour regrouper les comptes et les licences d’une même entreprise.'}</p></div>`;
    const fk = document.getElementById('org-free-keys');
    if (fk) fk.innerHTML = keyTable(kOf('').filter((k) => m(k.key) || m(k.label) || m(k.redeemedEmail) || m(k.productName)), '');
  }
  function keyTable(ks, oid) {
    if (!ks.length) return `<div class="panel"><p class="mut">Aucune clé${oid ? ' pour cet établissement' : ''}.</p></div>`;
    return `<div class="adm-tw"><table class="adm-t key-t"><thead><tr><th>Clé</th><th>Licence</th><th>Profil / classe</th><th>Validité</th><th>Libellé / poste</th><th>Statut</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${ks.map((k) => `<tr>
      <td data-label="Clé"><div class="adm-v"><code class="kcode">${esc(k.key)}</code></div></td>
      <td data-label="Licence"><div class="adm-v"><b>${esc(k.productName)}</b><small>${esc(tLabel(k.licenseType))}</small></div></td>
      <td data-label="Profil"><div class="adm-v">${esc(ROLE_L[k.role] || '—')}${k.classe ? `<small>${esc(k.classe)}</small>` : ''}</div></td>
      <td data-label="Validité"><div class="adm-v">${esc(dur(k))}</div></td>
      <td data-label="Libellé"><div class="adm-v">${esc(k.label || '—')}${k.status === 'redeemed' ? `<small>Activée par ${esc(k.redeemedEmail)} le ${esc(fdate(k.redeemedAt))}</small>` : ''}</div></td>
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
    if (FO.id !== id) Object.assign(FO, { id, mem: [], lics: [], role: '', classe: '' });
    const m = pmodal(`<h3>${esc(o.name)}</h3><p class="mut">${esc((window.SP_ORG_KINDS || {})[o.kind] || '')}${o.siret ? ' · SIRET ' + esc(o.siret) : ''}</p>${spec([
      ['Contact', esc(o.contactName || '—')], ['E-mail', esc(o.email || '—')], ['Téléphone', esc(o.phone || '—')], ['Adresse', esc(o.address || '—')],
      ['Postes prévus', esc(String(o.seats || '—'))], ['Statut', badge(o.status === 'active' ? 'bd-ok' : 'bd-off', o.status === 'active' ? 'Actif' : 'Suspendu')]])}
      ${o.notes ? `<p class="mt2">${esc(o.notes)}</p>` : ''}
      <div class="org-filt" id="org-filt"></div>
      <div class="fiche-h"><h4>Comptes rattachés</h4><button class="btn b4" data-a="org-attach" data-org="${esc(id)}">Rattacher un compte existant</button></div><div id="org-members"><p class="mut">Chargement…</p></div>
      <div class="fiche-h"><h4>Clés de licence</h4><span><button class="btn b4" data-a="org-keys-xlsx" data-org="${esc(id)}">Excel par classe (.xlsx)</button> <button class="btn b4" data-a="org-keys-csv" data-org="${esc(id)}">CSV</button> <button class="btn b4" data-a="org-key-manual" data-org="${esc(id)}">Saisir une clé</button> <button class="btn b1" data-a="org-keys-new" data-org="${esc(id)}">Générer des clés</button></span></div>
      <div id="org-keys"></div>
      <div class="fiche-act"><button class="btn b4" data-a="org-edit" data-org="${esc(id)}">Modifier l’établissement</button> <button class="btn btn-danger" data-a="org-del" data-org="${esc(id)}">Supprimer l’établissement</button></div>`, true);
    FO.loading = true; renderFiche();
    try {
      const od = await OD(), pd = await PD(); FO.mem = await od.adminOrgMembers(id);
      FO.lics = FO.mem.length ? await pd.adminLicensesFor(FO.mem.map((u) => u.uid)) : [];
      FO.loading = false; if (m && m.isConnected) renderFiche();
    } catch (e) { FO.loading = false; const box = m && m.querySelector('#org-members'); if (box) box.innerHTML = `<p class="fe" style="display:block">${esc(errMsg(e))}</p>`; }
  }
  function renderFiche() {
    const id = FO.id, f = document.getElementById('org-filt'); if (!f) return;
    const ks = O.keys.filter((k) => k.orgId === id), cls = classesOf(id);
    const n = (role) => ks.filter((k) => !role || k.role === role).length;
    f.innerHTML = `<div class="seg-f" role="tablist">${[['', 'Tous'], ['enseignant', 'Enseignants'], ['eleve', 'Élèves']].map(([v, t]) => `<button type="button" class="${FO.role === v ? 'on' : ''}" data-a="org-frole" data-v="${v}">${t} <small>${n(v)}</small></button>`).join('')}</div>
      <label class="org-fc">Classe <select id="org-fclass"><option value="">Toutes les classes</option>${cls.map((c) => `<option${c === FO.classe ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`;
    const kb = document.getElementById('org-keys'); if (kb) kb.innerHTML = keyTable(ks.filter((k) => pass(k.role || '', k.classe || '')), id);
    const box = document.getElementById('org-members'); if (!box) return;
    if (FO.loading){ box.innerHTML = '<p class="mut">Chargement…</p>'; return; }
    const mem = FO.mem.filter((u) => pass(u.orgRole || '', u.orgClass || ''));
    box.innerHTML = mem.length ? `<div class="adm-tw"><table class="adm-t"><thead><tr><th>Compte</th><th>Profil / classe</th><th>Licences</th><th>Statut</th><th></th></tr></thead><tbody>${mem.map((u) => `<tr>
        <td data-label="Compte"><div class="adm-v"><b>${esc(fullName(u))}</b><small>${esc(u.email)}</small></div></td>
        <td data-label="Profil"><div class="adm-v">${esc(ROLE_L[u.orgRole] || '—')}${u.orgClass ? `<small>${esc(u.orgClass)}</small>` : ''}</div></td>
        <td data-label="Licences"><div class="adm-v">${FO.lics.filter((l) => l.userId === u.uid).map((l) => `${esc(l.productName)} — ${esc(tLabel(l.licenseType))}${l.expiresAt ? ` <small>jusqu’au ${esc(fdate(l.expiresAt))}</small>` : ''}`).join('<br>') || '<span class="mut">Aucune</span>'}</div></td>
        <td data-label="Statut"><div class="adm-v">${badge(u.status === 'active' ? 'bd-ok' : 'bd-off', u.status === 'active' ? 'Actif' : 'Désactivé')}</div></td>
        <td class="adm-act"><button class="btn b4" data-a="org-detach" data-uid="${esc(u.uid)}" data-org="${esc(id)}">Détacher</button></td></tr>`).join('')}</tbody></table></div>`
      : `<p class="mut">${FO.mem.length ? 'Aucun compte pour ce filtre.' : 'Aucun compte rattaché pour le moment. Les personnes qui activent une clé de cet établissement apparaissent ici.'}</p>`;
  }

  /* ---- création / modification ---- */
  function orgForm(id) {
    const o = id ? orgById(id) : { kind: 'entreprise', status: 'active', seats: 10 };
    const kinds = Object.entries(window.SP_ORG_KINDS || { entreprise: 'Entreprise' });
    pmodal(`<h3>${id ? 'Modifier l’établissement' : 'Nouvel établissement / entreprise'}</h3><form data-f="org-form" data-org="${esc(id || '')}" novalidate>
      ${fld('og-name', 'Nom', inp('og-name', 'text', o.name, 'maxlength="120"'))}
      <div class="row">${fld('og-kind', 'Type', sel('og-kind', kinds, o.kind))}${fld('og-siret', 'SIRET <span class="mut">(facultatif)</span>', inp('og-siret', 'text', o.siret, 'maxlength="20" inputmode="numeric"'))}</div>
      <div class="row">${fld('og-contact', 'Contact', inp('og-contact', 'text', o.contactName, 'maxlength="120"'))}${fld('og-seats', 'Nombre de postes', inp('og-seats', 'number', o.seats, 'min="1" max="10000"'))}</div>
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
      await loadOrgs(); toast(id ? 'Établissement mis à jour.' : 'Établissement créé.'); openOrg(nid);
    } catch (e) { fm.querySelector('#og-err').textContent = errMsg(e); btn.disabled = false; }
  }

  /* ---- clés : génération et saisie manuelle ---- */
  const BASE_TYPES = ['pro', 'pro_entreprise', 'etudiant', 'enseignant', 'free'];
  const typesFor = (pid) => { const s = new Set(BASE_TYPES); O.offers.filter((o) => o.productId === pid && o.licenseType).forEach((o) => s.add(o.licenseType)); return [...s].map((t) => [t, tLabel(t)]); };
  function keysForm(oid, manual) {
    const o = oid ? orgById(oid) : null, prods = O.prods.filter((p) => p.status !== 'draft');
    if (!prods.length) return pmodal('<h3>Clés de licence</h3><p>Le catalogue est vide : ajoutez d’abord un produit (onglet Catalogue).</p>');
    const first = prods.find((p) => p.id === 'archiplan') || prods[0];
    const free = o ? Math.max(0, (o.seats || 0) - O.keys.filter((k) => k.orgId === oid && k.status !== 'revoked').length) : 10;
    pmodal(`<h3>${manual ? 'Saisir une clé existante' : 'Générer des clés de licence'}</h3><p class="mut">${o ? esc(o.name) + ` · ${free} poste${free > 1 ? 's' : ''} sans clé` : 'Clés sans établissement'}</p>
      <form data-f="org-keys" data-org="${esc(oid || '')}" data-manual="${manual ? 1 : ''}" novalidate>
      ${manual ? fld('ok-key', 'Clé', inp('ok-key', 'text', '', 'maxlength="60" autocomplete="off" autocapitalize="characters" placeholder="ABCD-EFGH-IJKL-MNOP" style="font-family:monospace"'), 'Lettres et chiffres, tirets facultatifs (au moins 12 caractères).')
        : fld('ok-n', 'Nombre de clés', inp('ok-n', 'number', Math.max(1, Math.min(free || 1, 50)), 'min="1" max="500"'))}
      <div class="row">${fld('ok-prod', 'Produit', sel('ok-prod', prods.map((p) => [p.id, p.name]), first.id))}${fld('ok-type', 'Type de licence', sel('ok-type', typesFor(first.id), 'pro'))}</div>
      <div class="row">${fld('ok-dur', 'Validité', sel('ok-dur', [['365', '1 an après activation'], ['730', '2 ans après activation'], ['1095', '3 ans après activation'], ['30', '30 jours (essai)'], ['90', '90 jours'], ['date', 'Jusqu’à une date'], ['', 'Sans limite']], '365'))}${fld('ok-date', 'Date de fin <span class="mut">(si « jusqu’à une date »)</span>', inp('ok-date', 'date', ''))}</div>
      ${o ? `<div class="row">${fld('ok-role', 'Profil', sel('ok-role', [['', '—'], ['eleve', 'Élève / étudiant'], ['enseignant', 'Enseignant']], FO.role))}${fld('ok-class', 'Classe <span class="mut">(facultatif)</span>', inp('ok-class', 'text', FO.classe, 'maxlength="60" list="ok-classes" placeholder="ex. BTS 1A, 3e B…"') + `<datalist id="ok-classes">${classesOf(oid).map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}</div>` : ''}
      ${fld('ok-label', 'Libellé <span class="mut">(facultatif : nom de la personne, poste, n° de commande…)</span>', inp('ok-label', 'text', '', 'maxlength="120"'))}
      <p class="fe" id="ok-err" role="alert"></p><p style="margin-top:14px"><button class="btn b1" type="submit">${manual ? 'Enregistrer la clé' : 'Générer'}</button></p></form>`, true);
  }
  async function submitKeys(fm) {
    K.clearErrors(); const g = (n) => fm.elements[n] ? fm.elements[n].value.trim() : '', er = {}, oid = fm.dataset.org, manual = !!fm.dataset.manual, od = await OD();
    const prod = O.prods.find((p) => p.id === g('ok-prod')), n = manual ? 1 : parseInt(g('ok-n'), 10);
    if (manual && !od.keyOk(g('ok-key'))) er['ok-key'] = 'Clé invalide.';
    if (!manual && !(n >= 1 && n <= 500)) er['ok-n'] = 'Entre 1 et 500.';
    let expiresAt = null, durationDays = null;
    if (g('ok-dur') === 'date'){ expiresAt = g('ok-date') ? new Date(g('ok-date') + 'T23:59:59') : null; if (!expiresAt || expiresAt < new Date()) er['ok-date'] = 'Choisissez une date future.'; }
    else if (g('ok-dur')) durationDays = parseInt(g('ok-dur'), 10);
    if (K.showErrors(fm, er)) return;
    const btn = fm.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Enregistrement…';
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
  function keysCsv(oid) {
    const o = orgById(oid), ks = O.keys.filter((k) => (k.orgId || '') === (oid || ''));
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + [['Clé', 'Profil', 'Classe', 'Produit', 'Type', 'Validité', 'Libellé', 'Statut', 'Activée par', 'Activée le'].map(q).join(';'),
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
    const o = orgById(oid), ks = O.keys.filter((k) => k.orgId === oid), groups = new Map();
    ks.slice().sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key), 'fr', { numeric: true })).forEach((k) => { const g = k.role === 'enseignant' ? 'Enseignants' : (k.classe || 'Sans classe'); (groups.get(g) || groups.set(g, []).get(g)).push(k); });
    const names = [...groups.keys()].sort((a, b) => (a === 'Enseignants' ? -1 : b === 'Enseignants' ? 1 : a === 'Sans classe' ? 1 : b === 'Sans classe' ? -1 : a.localeCompare(b, 'fr', { numeric: true })));
    if (!names.length) return toast('Aucune clé à exporter.');
    const used = new Set(), safe = (n) => { let b = n.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 28) || 'Feuille', x = b, i = 2; while (used.has(x)) x = b + ' ' + i++; used.add(x); return x; };
    const sheets = names.map((n) => ({ name: safe(n), xml: sheet([[`${o.name} — ${n}`], [`${groups.get(n).length} clé(s) · exporté le ${new Date().toLocaleDateString('fr-FR')}`], ['Clé', 'Profil', 'Classe', 'Libellé / élève', 'Produit', 'Licence', 'Validité', 'Statut', 'Activée par', 'Activée le'],
      ...groups.get(n).map((k) => [k.key, ROLE_L[k.role] || '', k.classe || '', k.label || '', k.productName, tLabel(k.licenseType), dur(k), KS[k.status]?.[1] || k.status, k.redeemedEmail || '', k.redeemedAt ? fdate(k.redeemedAt) : ''])], [24, 12, 12, 28, 14, 14, 24, 11, 28, 12]) }));
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((x, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2A2E35"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0"><alignment horizontal="left"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const files = [{ name: '[Content_Types].xml', data: ct },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((x, i) => `<sheet name="${xe(x.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((x, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: styles }, ...sheets.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: x.xml }))];
    const a = document.createElement('a'); a.href = URL.createObjectURL(zip(files));
    a.download = `cles-${o.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}-par-classe.xlsx`; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---- actions ---- */
  Object.assign(A, {
    'org-reload': () => loadOrgs(),
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
    'org-key-label': (b) => { const k = O.keys.find((x) => x.id === b.dataset.id); pmodal(`<h3>Modifier la clé</h3><p><code class="kcode">${esc(k.key)}</code></p><form data-f="org-label" data-id="${esc(k.id)}" data-org="${esc(k.orgId || '')}">${fld('kl', 'Libellé', inp('kl', 'text', k.label, 'maxlength="120"'))}${k.orgId ? `<div class="row">${fld('kr', 'Profil', sel('kr', [['', '—'], ['eleve', 'Élève / étudiant'], ['enseignant', 'Enseignant']], k.role || ''))}${fld('kc', 'Classe', inp('kc', 'text', k.classe, 'maxlength="60"'))}</div>` : ''}${k.status === 'redeemed' ? '<p class="mut">Clé déjà activée : le profil et la classe du compte ne changent pas (modifiez-les depuis la fiche du compte).</p>' : ''}<p><button class="btn b1" type="submit">Enregistrer</button></p></form>`); },
    'org-del': (b) => { const o = orgById(b.dataset.org), nk = O.keys.filter((k) => k.orgId === o.id).length; pmodal(`<h3>Supprimer « ${esc(o.name)} » ?</h3><p>En un seul clic : la fiche, ses <b>${nk} clé${nk > 1 ? 's' : ''}</b> et les <b>licences</b> obtenues avec ces clés sont supprimées, et les comptes rattachés sont détachés. Les comptes eux-mêmes et leurs projets sont conservés.</p><p class="mut">Action définitive.</p><p class="fe" id="od-err" role="alert"></p><p><button class="btn btn-danger" data-a="org-del-ok" data-org="${esc(o.id)}">Supprimer l’établissement et ses licences</button></p>`); },
    'org-del-ok': async (b) => { b.disabled = true; b.textContent = 'Suppression…'; try { const r = await (await OD()).deleteOrg(b.dataset.org); A.x(); FO.id = ''; await loadOrgs(); toast(`Établissement supprimé : ${r.keys} clé(s), ${r.licenses} licence(s), ${r.users} compte(s) détaché(s).`); } catch (e) { document.getElementById('od-err').textContent = errMsg(e); b.disabled = false; b.textContent = 'Réessayer'; } },
    'org-frole': (b) => { FO.role = b.dataset.v; renderFiche(); },
    'org-keys-xlsx': (b) => keysXlsx(b.dataset.org),
    'org-attach': (b) => pmodal(`<h3>Rattacher un compte existant</h3><form data-f="org-attach" data-org="${esc(b.dataset.org)}">${fld('oa-mail', 'E-mail du compte Studio Prism', inp('oa-mail', 'email', '', 'maxlength="160"'))}<div class="row">${fld('oa-role', 'Profil', sel('oa-role', [['', '—'], ['eleve', 'Élève / étudiant'], ['enseignant', 'Enseignant']], ''))}${fld('oa-class', 'Classe', inp('oa-class', 'text', '', 'maxlength="60"'))}</div><p class="fe" id="oa-err" role="alert"></p><p><button class="btn b1" type="submit">Rattacher</button></p></form>`),
    'org-detach': async (b) => { b.disabled = true; try { await (await OD()).adminSetUserOrg(b.dataset.uid, null); toast('Compte détaché.'); openOrg(b.dataset.org); } catch (e) { toast(errMsg(e)); b.disabled = false; } }
  });
  function refreshOpen(b) { const oid = b.closest('.mod') ? (O.keys.find((k) => k.id === b.dataset.id)?.orgId || '') : null; if (oid) openOrg(oid); }

  document.addEventListener('submit', async (e) => {
    const f = e.target.dataset && e.target.dataset.f; if (!f || f.indexOf('org-') !== 0 && f !== 'key-redeem') return;
    e.preventDefault();
    if (f === 'org-form') submitOrg(e.target);
    else if (f === 'org-keys') submitKeys(e.target);
    else if (f === 'org-label') { const fm = e.target; try { await (await OD()).adminSetKeyLabel(fm.dataset.id, fm.elements.kl.value, fm.elements.kr ? fm.elements.kr.value : '', fm.elements.kc ? fm.elements.kc.value.trim() : ''); await loadOrgs(); if (fm.dataset.org) openOrg(fm.dataset.org); else A.x(); } catch (x) { toast(errMsg(x)); } }
    else if (f === 'org-attach') {
      const fm = e.target, err = fm.querySelector('#oa-err'), od = await OD();
      try { const u = await od.adminFindUserByEmail(fm.elements['oa-mail'].value); if (!u) { err.textContent = 'Aucun compte avec cette adresse.'; return; }
        await od.adminSetUserOrg(u.uid, orgById(fm.dataset.org), fm.elements['oa-role'].value, fm.elements['oa-class'].value.trim()); toast('Compte rattaché.'); openOrg(fm.dataset.org); } catch (x) { err.textContent = errMsg(x); }
    }
    else if (f === 'key-redeem') submitRedeem(e.target);
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'org-q') { O.q = e.target.value; renderOrgs(); } });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'org-fclass') { FO.classe = e.target.value; renderFiche(); return; }
    if (e.target.id === 'ok-role') { const t = document.getElementById('ok-type'), v = { eleve: 'etudiant', enseignant: 'enseignant' }[e.target.value]; if (t && v && [...t.options].some((o) => o.value === v)) t.value = v; return; }
    if (e.target.id === 'ok-prod') { const t = document.getElementById('ok-type'); if (t) t.innerHTML = typesFor(e.target.value).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); } });

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
    try { const od = await OD(); if (!od.keyOk(v)) { box.innerHTML = ''; return; } const k = await od.peekKey(v);
      box.innerHTML = k.status === 'available' ? `<div class="acc-sum"><b>${esc(k.productName)}</b> — ${esc(tLabel(k.licenseType))} · ${esc(dur(k))}${k.orgName ? `<br>Établissement : <b>${esc(k.orgName)}</b> (votre compte y sera rattaché)` : ''}</div>` : `<p class="fe" style="display:block">${esc(errMsg({ code: k.status === 'redeemed' ? (k.redeemedBy === st.auth.user?.uid ? 'app/key-mine' : 'app/key-used') : 'app/key-revoked' }))}</p>`;
    } catch (e) { box.innerHTML = e.code === 'app/key-unknown' ? `<p class="fe" style="display:block">${esc(errMsg(e))}</p>` : ''; }
  }
  document.addEventListener('input', (e) => { if (e.target.id === 'kr-key' && e.target.closest('[data-f="key-redeem"]')) { clearTimeout(peekT); const v = e.target.value; peekT = setTimeout(() => peek(v), 350); } });
  async function submitRedeem(fm) {
    const err = fm.querySelector('#kr-err'), btn = fm.querySelector('button[type=submit]'), v = fm.elements['kr-key'].value; err.textContent = '';
    btn.disabled = true; btn.textContent = 'Activation…';
    try {
      const k = await (await OD()).redeemKey(v, st.auth.user);
      try { sessionStorage.removeItem(PENDING); } catch (e) { /* rien */ }
      V(`<section class="pg"><div class="w" style="max-width:640px"><h1>Licence activée</h1><div class="panel"><p><b>${esc(k.productName)}</b> — ${esc(tLabel(k.licenseType))} est activée sur votre compte (${esc(dur(k))}).</p>${k.orgName ? `<p>Votre compte est rattaché à <b>${esc(k.orgName)}</b>.</p>` : ''}
        <p style="margin-top:12px"><a class="btn b1" href="#/compte">Mon compte</a>${k.productId === 'archiplan' ? ' <a class="btn b4" href="../archiplan/">Ouvrir ARCHIPLAN</a>' : ''}</p></div></div></section>`);
    } catch (e) { console.error('[Studio Prism] Activation de clé :', e); err.textContent = errMsg(e); btn.disabled = false; btn.textContent = 'Activer'; }
  }
  /* Clé saisie avant la connexion : on reprend l'activation dès que le compte est ouvert. */

  Object.assign(R, { 'admin/etablissements': () => K.adminGate('orgs', orgsTab), activer: activatePage });
  import(K.MOD('orgsdata.js')).then((m) => { window.SP_ORG_KINDS = m.ORG_KINDS; }).catch(() => {});
})();
