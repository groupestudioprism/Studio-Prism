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
    return `<div class="adm-tw"><table class="adm-t key-t"><thead><tr><th>Clé</th><th>Licence</th><th>Validité</th><th>Libellé / poste</th><th>Statut</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${ks.map((k) => `<tr>
      <td data-label="Clé"><div class="adm-v"><code class="kcode">${esc(k.key)}</code></div></td>
      <td data-label="Licence"><div class="adm-v"><b>${esc(k.productName)}</b><small>${esc(typeLabel(k.licenseType))}</small></div></td>
      <td data-label="Validité"><div class="adm-v">${esc(dur(k))}</div></td>
      <td data-label="Libellé"><div class="adm-v">${esc(k.label || '—')}${k.status === 'redeemed' ? `<small>Activée par ${esc(k.redeemedEmail)} le ${esc(fdate(k.redeemedAt))}</small>` : ''}</div></td>
      <td data-label="Statut"><div class="adm-v">${keyBadge(k)}</div></td>
      <td class="adm-act"><button class="btn b4" data-a="org-key-copy" data-k="${esc(k.key)}" aria-label="Copier la clé">Copier</button>${k.status === 'available' ? ` <button class="btn b4" data-a="org-key-label" data-id="${esc(k.id)}">Libellé</button> <button class="btn b4" data-a="org-key-revoke" data-id="${esc(k.id)}">Révoquer</button>` : ''}${k.status === 'revoked' ? ` <button class="btn b4" data-a="org-key-restore" data-id="${esc(k.id)}">Rétablir</button> <button class="btn btn-danger" data-a="org-key-del" data-id="${esc(k.id)}">Supprimer</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const orgById = (id) => O.orgs.find((o) => o.id === id);

  /* ---- fiche établissement ---- */
  async function openOrg(id) {
    const o = orgById(id); if (!o) return;
    const m = pmodal(`<h3>${esc(o.name)}</h3><p class="mut">${esc((window.SP_ORG_KINDS || {})[o.kind] || '')}${o.siret ? ' · SIRET ' + esc(o.siret) : ''}</p>${spec([
      ['Contact', esc(o.contactName || '—')], ['E-mail', esc(o.email || '—')], ['Téléphone', esc(o.phone || '—')], ['Adresse', esc(o.address || '—')],
      ['Postes prévus', esc(String(o.seats || '—'))], ['Statut', badge(o.status === 'active' ? 'bd-ok' : 'bd-off', o.status === 'active' ? 'Actif' : 'Suspendu')]])}
      ${o.notes ? `<p class="mt2">${esc(o.notes)}</p>` : ''}
      <div class="fiche-h"><h4>Comptes rattachés</h4><button class="btn b4" data-a="org-attach" data-org="${esc(id)}">Rattacher un compte existant</button></div><div id="org-members"><p class="mut">Chargement…</p></div>
      <div class="fiche-h"><h4>Clés de licence</h4><span><button class="btn b4" data-a="org-keys-csv" data-org="${esc(id)}">Exporter (CSV)</button> <button class="btn b4" data-a="org-key-manual" data-org="${esc(id)}">Saisir une clé</button> <button class="btn b1" data-a="org-keys-new" data-org="${esc(id)}">Générer des clés</button></span></div>
      <div id="org-keys">${keyTable(O.keys.filter((k) => k.orgId === id), id)}</div>
      <div class="fiche-act"><button class="btn b4" data-a="org-edit" data-org="${esc(id)}">Modifier l’établissement</button> <button class="btn btn-danger" data-a="org-del" data-org="${esc(id)}">Supprimer l’établissement</button></div>`, true);
    try {
      const od = await OD(), pd = await PD(), mem = await od.adminOrgMembers(id);
      const lics = mem.length ? await pd.adminLicensesFor(mem.map((u) => u.uid)) : [];
      const box = m && m.querySelector('#org-members'); if (!box) return;
      box.innerHTML = mem.length ? `<div class="adm-tw"><table class="adm-t"><thead><tr><th>Compte</th><th>Licences</th><th>Statut</th><th></th></tr></thead><tbody>${mem.map((u) => `<tr>
        <td data-label="Compte"><div class="adm-v"><b>${esc(fullName(u))}</b><small>${esc(u.email)}</small></div></td>
        <td data-label="Licences"><div class="adm-v">${lics.filter((l) => l.userId === u.uid).map((l) => `${esc(l.productName)} — ${esc(typeLabel(l.licenseType))}${l.expiresAt ? ` <small>jusqu’au ${esc(fdate(l.expiresAt))}</small>` : ''}`).join('<br>') || '<span class="mut">Aucune</span>'}</div></td>
        <td data-label="Statut"><div class="adm-v">${badge(u.status === 'active' ? 'bd-ok' : 'bd-off', u.status === 'active' ? 'Actif' : 'Désactivé')}</div></td>
        <td class="adm-act"><button class="btn b4" data-a="org-detach" data-uid="${esc(u.uid)}" data-org="${esc(id)}">Détacher</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="mut">Aucun compte rattaché pour le moment. Les personnes qui activent une clé de cet établissement apparaissent ici.</p>';
    } catch (e) { const box = m && m.querySelector('#org-members'); if (box) box.innerHTML = `<p class="fe" style="display:block">${esc(errMsg(e))}</p>`; }
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
  const BASE_TYPES = ['pro', 'pro_entreprise', 'free'];
  const typesFor = (pid) => { const s = new Set(BASE_TYPES); O.offers.filter((o) => o.productId === pid && o.licenseType).forEach((o) => s.add(o.licenseType)); return [...s].map((t) => [t, typeLabel(t)]); };
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
      const out = await od.adminCreateKeys(keys, { productId: prod.id, productName: prod.name, licenseType: g('ok-type'), durationDays, expiresAt, org: oid ? orgById(oid) : null, label: g('ok-label') });
      await loadOrgs();
      pmodal(`<h3>${out.length} clé${out.length > 1 ? 's' : ''} ${manual ? 'enregistrée' : 'générée'}${out.length > 1 ? 's' : ''}</h3><p class="mut">${esc(prod.name)} · ${esc(typeLabel(g('ok-type')))}${oid ? ' · ' + esc(orgById(oid).name) : ''}. Transmettez-les au client : chaque personne crée son compte Studio Prism puis saisit sa clé (Mon compte → Activer une clé, ou dans l’application).</p>
        <textarea id="ok-out" readonly rows="${Math.min(12, out.length + 1)}" style="width:100%;font-family:monospace">${esc(out.map((x) => x.key).join('\n'))}</textarea>
        <p style="margin-top:10px"><button class="btn b1" data-a="org-copy-out">Copier les clés</button> ${oid ? `<button class="btn b4" data-a="org-open" data-org="${esc(oid)}">Retour à la fiche</button>` : ''}</p>`, true);
    } catch (e) { fm.querySelector('#ok-err').textContent = errMsg(e) + (e.key ? ' (' + e.key + ')' : ''); btn.disabled = false; btn.textContent = manual ? 'Enregistrer la clé' : 'Générer'; }
  }
  function keysCsv(oid) {
    const o = orgById(oid), ks = O.keys.filter((k) => (k.orgId || '') === (oid || ''));
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + [['Clé', 'Produit', 'Type', 'Validité', 'Libellé', 'Statut', 'Activée par', 'Activée le'].map(q).join(';'),
      ...ks.map((k) => [k.key, k.productName, typeLabel(k.licenseType), dur(k), k.label, KS[k.status]?.[1] || k.status, k.redeemedEmail, k.redeemedAt ? fdate(k.redeemedAt) : ''].map(q).join(';'))].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `cles-${(o ? o.name : 'sans-etablissement').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}.csv`; document.body.appendChild(a); a.click(); a.remove();
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
    'org-key-del': async (b) => { b.disabled = true; try { await (await OD()).adminDeleteKey(b.dataset.id); await loadOrgs(); refreshOpen(b); toast('Clé supprimée.'); } catch (e) { toast(errMsg(e)); b.disabled = false; } },
    'org-key-label': (b) => { const k = O.keys.find((x) => x.id === b.dataset.id); pmodal(`<h3>Libellé de la clé</h3><p><code class="kcode">${esc(k.key)}</code></p><form data-f="org-label" data-id="${esc(k.id)}" data-org="${esc(k.orgId || '')}">${fld('kl', 'Libellé', inp('kl', 'text', k.label, 'maxlength="120"'))}<p><button class="btn b1" type="submit">Enregistrer</button></p></form>`); },
    'org-del': (b) => { const o = orgById(b.dataset.org); pmodal(`<h3>Supprimer « ${esc(o.name)} » ?</h3><p>Les clés non activées de cet établissement sont supprimées. Les comptes rattachés doivent d’abord être détachés.</p><p class="fe" id="od-err" role="alert"></p><p><button class="btn btn-danger" data-a="org-del-ok" data-org="${esc(o.id)}">Supprimer</button></p>`); },
    'org-del-ok': async (b) => { b.disabled = true; try { await (await OD()).deleteOrg(b.dataset.org); A.x(); await loadOrgs(); toast('Établissement supprimé.'); } catch (e) { document.getElementById('od-err').textContent = errMsg(e); b.disabled = false; } },
    'org-attach': (b) => pmodal(`<h3>Rattacher un compte existant</h3><form data-f="org-attach" data-org="${esc(b.dataset.org)}">${fld('oa-mail', 'E-mail du compte Studio Prism', inp('oa-mail', 'email', '', 'maxlength="160"'))}<p class="fe" id="oa-err" role="alert"></p><p><button class="btn b1" type="submit">Rattacher</button></p></form>`),
    'org-detach': async (b) => { b.disabled = true; try { await (await OD()).adminSetUserOrg(b.dataset.uid, null); toast('Compte détaché.'); openOrg(b.dataset.org); } catch (e) { toast(errMsg(e)); b.disabled = false; } }
  });
  function refreshOpen(b) { const oid = b.closest('.mod') ? (O.keys.find((k) => k.id === b.dataset.id)?.orgId || '') : null; if (oid) openOrg(oid); }

  document.addEventListener('submit', async (e) => {
    const f = e.target.dataset && e.target.dataset.f; if (!f || f.indexOf('org-') !== 0 && f !== 'key-redeem') return;
    e.preventDefault();
    if (f === 'org-form') submitOrg(e.target);
    else if (f === 'org-keys') submitKeys(e.target);
    else if (f === 'org-label') { const fm = e.target; try { await (await OD()).adminSetKeyLabel(fm.dataset.id, fm.elements.kl.value); await loadOrgs(); if (fm.dataset.org) openOrg(fm.dataset.org); else A.x(); } catch (x) { toast(errMsg(x)); } }
    else if (f === 'org-attach') {
      const fm = e.target, err = fm.querySelector('#oa-err'), od = await OD();
      try { const u = await od.adminFindUserByEmail(fm.elements['oa-mail'].value); if (!u) { err.textContent = 'Aucun compte avec cette adresse.'; return; }
        await od.adminSetUserOrg(u.uid, orgById(fm.dataset.org)); toast('Compte rattaché.'); openOrg(fm.dataset.org); } catch (x) { err.textContent = errMsg(x); }
    }
    else if (f === 'key-redeem') submitRedeem(e.target);
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'org-q') { O.q = e.target.value; renderOrgs(); } });
  document.addEventListener('change', (e) => { if (e.target.id === 'ok-prod') { const t = document.getElementById('ok-type'); if (t) t.innerHTML = typesFor(e.target.value).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); } });

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
      box.innerHTML = k.status === 'available' ? `<div class="acc-sum"><b>${esc(k.productName)}</b> — ${esc(typeLabel(k.licenseType))} · ${esc(dur(k))}${k.orgName ? `<br>Établissement : <b>${esc(k.orgName)}</b> (votre compte y sera rattaché)` : ''}</div>` : `<p class="fe" style="display:block">${esc(errMsg({ code: k.status === 'redeemed' ? (k.redeemedBy === st.auth.user?.uid ? 'app/key-mine' : 'app/key-used') : 'app/key-revoked' }))}</p>`;
    } catch (e) { box.innerHTML = e.code === 'app/key-unknown' ? `<p class="fe" style="display:block">${esc(errMsg(e))}</p>` : ''; }
  }
  document.addEventListener('input', (e) => { if (e.target.id === 'kr-key' && e.target.closest('[data-f="key-redeem"]')) { clearTimeout(peekT); const v = e.target.value; peekT = setTimeout(() => peek(v), 350); } });
  async function submitRedeem(fm) {
    const err = fm.querySelector('#kr-err'), btn = fm.querySelector('button[type=submit]'), v = fm.elements['kr-key'].value; err.textContent = '';
    btn.disabled = true; btn.textContent = 'Activation…';
    try {
      const k = await (await OD()).redeemKey(v, st.auth.user);
      try { sessionStorage.removeItem(PENDING); } catch (e) { /* rien */ }
      V(`<section class="pg"><div class="w" style="max-width:640px"><h1>Licence activée</h1><div class="panel"><p><b>${esc(k.productName)}</b> — ${esc(typeLabel(k.licenseType))} est activée sur votre compte (${esc(dur(k))}).</p>${k.orgName ? `<p>Votre compte est rattaché à <b>${esc(k.orgName)}</b>.</p>` : ''}
        <p style="margin-top:12px"><a class="btn b1" href="#/compte">Mon compte</a>${k.productId === 'archiplan' ? ' <a class="btn b4" href="../archiplan/">Ouvrir ARCHIPLAN</a>' : ''}</p></div></div></section>`);
    } catch (e) { console.error('[Studio Prism] Activation de clé :', e); err.textContent = errMsg(e); btn.disabled = false; btn.textContent = 'Activer'; }
  }
  /* Clé saisie avant la connexion : on reprend l'activation dès que le compte est ouvert. */

  Object.assign(R, { 'admin/etablissements': () => K.adminGate('orgs', orgsTab), activer: activatePage });
  import(K.MOD('orgsdata.js')).then((m) => { window.SP_ORG_KINDS = m.ORG_KINDS; }).catch(() => {});
})();
