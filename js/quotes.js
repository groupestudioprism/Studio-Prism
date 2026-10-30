/* Studio Prism — devis : administration (registre, éditeur, émission, paiement → clés), informations légales de l'émetteur,
 * et côté client (Mes devis, consultation, PDF par l'impression du navigateur, bon pour accord en ligne).
 *
 *  - #/admin/devis              registre des devis (filtre, recherche, export CSV) ; #/admin/devis/{id} : un devis et ses actions
 *  - #/admin/infos-legales      informations légales de Studio Prism, recopiées dans chaque devis émis
 *  - #/compte/devis/{id}        le devis côté client : télécharger (PDF), accepter (bon pour accord) ou refuser, puis payer
 * Données : js/quotesdata.js ; règles : firebase/rules/05-devis.rules (numérotation continue, devis émis figés).
 */
(function () {
  'use strict';
  const K = window.SP && window.SP.kit;
  if (!K) return;
  const { st, esc, fdate, badge, fullName } = K;
  const QD = () => import(K.MOD('quotesdata.js'));
  const OD = () => import(K.MOD('orgsdata.js'));
  const PD = () => K.dataMod();
  const OK = () => window.SP.orgsKit;
  const RULES = 'Les règles Firestore des devis ne sont pas encore publiées : publiez le fichier firebase/firestore.rules (console Firebase › Firestore Database › Règles › Publier).';
  const ERR = {
    'app/quote-empty': 'Ajoutez au moins une ligne avec une quantité.',
    'app/quote-client': 'Renseignez le nom et l’adresse du client : ce sont des mentions obligatoires du devis.',
    'app/quote-missing': 'Ce devis n’existe pas, ou vous n’y avez pas accès.',
    'app/org-missing': 'Fiche entreprise introuvable.'
  };
  const errMsg = (e) => e && e.code === 'app/company-incomplete' ? `Complétez d’abord les informations légales de Studio Prism (onglet Devis › Informations légales) : ${e.missing.join(', ')}.`
    : e && /permission/.test(String(e.code || '')) ? RULES : ERR[e && e.code] || K.errMsg(e);
  const eur = (x) => (Number(x) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const fld = (id, label, control, hint) => `<div class="acc-f"><label for="${id}">${label}</label>${control}${hint ? `<p class="acc-h">${hint}</p>` : ''}<p class="fe" id="e-${id}" role="alert"></p></div>`;
  const inp = (id, type, val, attrs) => `<input id="${id}" name="${id}" type="${type}" value="${esc(val == null ? '' : val)}" ${attrs || ''}>`;
  const area = (id, val, attrs) => `<textarea id="${id}" name="${id}" ${attrs || 'rows="3"'}>${esc(val || '')}</textarea>`;
  const sel = (id, opts, cur, attrs) => `<select id="${id}" name="${id}" ${attrs || ''}>${opts.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const pmodal = (h, wide) => { A.x(); modal(h); const m = document.querySelector('.mod'); if (m && wide) m.classList.add('mod-w', 'mod-q'); return m; };
  const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);
  const SITE = () => location.origin + location.pathname;
  const hashId = (n) => decodeURIComponent((location.hash.split('?')[0].split('/')[n] || ''));

  const Q = { list: null, err: '', at: 0, company: undefined, plans: null, f: '', q: '', paidKeys: {}, mod: null };
  let MODS = null; const mods = async () => (MODS = MODS || await QD());

  /* ------------------------------------------------------------------ chargements */
  async function load(force) {
    if (!force && Q.list && Date.now() - Q.at < 20000) return;
    const qd = await mods();
    try { Q.list = await qd.adminListQuotes(); Q.err = ''; }
    catch (e) { console.warn('[Studio Prism] Devis :', e); Q.list = Q.list || []; Q.err = errMsg(e); }
    Q.at = Date.now();
  }
  async function loadCompany(force) {
    if (Q.company !== undefined && !force) return Q.company;
    try { Q.company = await (await mods()).getCompany(); } catch (e) { console.warn('[Studio Prism] Informations légales :', e); Q.company = null; Q.companyErr = errMsg(e); }
    return Q.company;
  }
  async function loadPlans() {
    if (Q.plans) return Q.plans;
    try { const pd = await PD(), [subs, prices] = await Promise.all([pd.adminListOffers(), pd.adminListPrices()]); Q.plans = window.SP.catalog.buildPlans(subs, prices).plans; }
    catch (e) { console.warn('[Studio Prism] Tarifs :', e); Q.plans = []; }
    return Q.plans;
  }
  /* Prix catalogue HT d'une licence : formule Pro Entreprise du produit (à défaut Pro), prix de la période. null = pas de prix défini. */
  function priceFor(pid, period, lt) {
    const pl = (Q.plans || []).filter((p) => p.productId === pid && p.status !== 'archived' && p.status !== 'inactive');
    const plan = pl.find((p) => p.licenseType === (lt || 'pro_entreprise')) || pl.find((p) => p.licenseType === 'pro_entreprise') || pl.find((p) => p.licenseType === 'pro');
    const x = plan && plan.prices.find((y) => y.period === period && y.status !== 'inactive' && typeof y.amount === 'number');
    return x ? x.amount : null;
  }
  const apps = () => K.coApps();
  const pname = (pid) => (apps().find(([v]) => v === pid) || [, pid])[1];

  /* ------------------------------------------------------------------ document (vue commune admin / client, imprimable) */
  function docHtml(q, PER) {
    const I = q.issuer || Q.company || {}, c = q.client || {}, draft = q.status === 'draft';
    const lines = (q.lines || []).map((l) => `<tr><td>${esc(l.designation)}</td><td class="n">${esc(l.qty)}</td><td class="n">${esc(eur(l.unitHT))}</td><td class="n">${esc(eur((l.qty || 0) * (l.unitHT || 0)))}</td></tr>`).join('');
    const legal = [I.legalName, I.legalForm, I.capital ? `capital de ${I.capital}` : '', I.siret ? `SIRET ${I.siret}` : '', I.rcs, I.vatMode === 'tva' && I.vatNumber ? `TVA ${I.vatNumber}` : ''].filter(Boolean).map(esc).join(' · ');
    const acc = q.acceptedAt ? `<p><b>Bon pour accord</b> — accepté ${q.acceptedBy && q.acceptedBy.via === 'online' ? 'en ligne' : ''} le ${esc(fdate(q.acceptedAt, true))} par ${esc((q.acceptedBy && q.acceptedBy.name) || '—')}${q.acceptedBy && q.acceptedBy.email ? ' (' + esc(q.acceptedBy.email) + ')' : ''}.</p>`
      : `<div class="qd-sign"><p>Date, signature et cachet du client, précédés de la mention « Bon pour accord » :</p><div></div></div>`;
    return `<article class="qdoc${draft ? ' qd-draft' : ''}" aria-label="Devis">
      ${draft ? '<p class="qd-wm" aria-hidden="true">BROUILLON — sans valeur</p>' : ''}
      <div class="qd-h"><div><b class="qd-iss">${esc(I.tradeName || I.legalName || 'Studio Prism')}</b>${I.tradeName && I.legalName && I.tradeName !== I.legalName ? `<br>${esc(I.legalName)}` : ''}<br>${esc(I.address || '').replace(/\n/g, '<br>')}${I.email ? `<br>${esc(I.email)}` : ''}${I.phone ? ` · ${esc(I.phone)}` : ''}${I.website ? `<br>${esc(I.website)}` : ''}</div>
        <div class="qd-t"><h2>Devis</h2><p><b>${esc(q.number || 'Numéro attribué à l’émission')}</b></p><p>Date : ${esc(q.issuedAt ? fdate(q.issuedAt) : '—')}</p><p>Valable jusqu’au : ${esc(q.validUntil ? fdate(q.validUntil) : `${q.validDays || 30} jours après émission`)}</p></div></div>
      <div class="qd-c"><p class="mut">Client</p><p><b>${esc(c.name || '—')}</b>${c.contact ? `<br>À l’attention de ${esc(c.contact)}` : ''}<br>${esc(c.address || '').replace(/\n/g, '<br>')}${c.siret ? `<br>SIRET ${esc(c.siret)}` : ''}${c.vatNumber ? `<br>TVA ${esc(c.vatNumber)}` : ''}${c.email ? `<br>${esc(c.email)}` : ''}</p></div>
      <table class="qd-l"><thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">Prix unitaire HT</th><th class="n">Total HT</th></tr></thead><tbody>${lines}</tbody></table>
      <table class="qd-tot"><tbody><tr><th>Total HT</th><td>${esc(eur(q.totalHT))}</td></tr>${q.vatMode === 'franchise' ? '' : `<tr><th>TVA ${esc(q.vatRate)} %</th><td>${esc(eur(q.totalVAT))}</td></tr>`}<tr class="qd-ttc"><th>Total ${q.vatMode === 'franchise' ? '' : 'TTC'}</th><td>${esc(eur(q.totalTTC))}</td></tr></tbody></table>
      ${q.vatMode === 'franchise' ? '<p class="qd-small">TVA non applicable, art. 293 B du CGI.</p>' : ''}
      ${q.period && PER && PER[q.period] ? `<p class="qd-small">Licences délivrées sous forme de clés, valables ${esc(PER[q.period].dur)} à compter de leur activation.</p>` : ''}
      ${q.notes ? `<p class="qd-small">${esc(q.notes).replace(/\n/g, '<br>')}</p>` : ''}
      <div class="qd-cond"><p><b>Conditions de paiement</b> — ${esc(q.paymentTerms || '').replace(/\n/g, '<br>')}</p>${I.iban ? `<p>Virement : ${I.bank ? esc(I.bank) + ' · ' : ''}IBAN ${esc(I.iban)}${I.bic ? ' · BIC ' + esc(I.bic) : ''} · référence ${esc(q.number || '—')}</p>` : ''}${I.latePenalty ? `<p class="qd-small">${esc(I.latePenalty)}</p>` : ''}</div>
      ${acc}
      <div class="qd-f">${legal}${I.footer ? `<br>${esc(I.footer)}` : ''}</div></article>`;
  }
  const stBadge = (qd, q) => { const s = qd.shownStatus(q), b = qd.STATUS[s] || ['', s]; return badge(b[0], b[1]); };

  /* ------------------------------------------------------------------ « À traiter » : devis acceptés à encaisser */
  const accepted = () => (Q.list || []).filter((q) => q.status === 'accepted');
  function todoParts(sec) {
    if (!Q.list || !MODS) return [];
    const out = [], acc = accepted();
    if (Q.err) out.push(sec('Devis', 0, `<p class="mut">${esc(Q.err)}</p>`));
    if (acc.length) out.push(sec('Devis acceptés · paiement à recevoir', acc.length, `<ul class="adm-pend-l">${acc.map((q) => `<li><div><b>${esc(q.number)} · ${esc(q.client?.name || '')}</b><small>${esc(eur(q.totalTTC))} · accepté le ${esc(fdate(q.acceptedAt))} par ${esc(q.acceptedBy?.name || '—')}</small></div>` +
      `<span class="adm-pend-b"><button class="btn b1" data-a="q-paid" data-id="${esc(q.id)}">Paiement reçu</button> <a class="btn b4" href="#/admin/devis/${esc(q.id)}">Voir</a></span></li>`).join('')}</ul>`,
      '« Paiement reçu » génère les clés de licence du devis : elles apparaissent aussitôt dans l’espace « Mon entreprise » du client.'));
    const drafts = (Q.list || []).filter((q) => q.status === 'draft');
    if (drafts.length) out.push(sec('Devis en brouillon', drafts.length, `<ul class="adm-pend-l">${drafts.map((q) => `<li><div><b>${esc(q.client?.name || '—')}</b><small>${esc(eur(q.totalTTC))} · modifié le ${esc(fdate(q.updatedAt))}</small></div><span class="adm-pend-b"><button class="btn b1" data-a="q-edit" data-id="${esc(q.id)}">Reprendre</button></span></li>`).join('')}</ul>`));
    return out;
  }

  /* ------------------------------------------------------------------ registre */
  function listTab(p, shell) {
    Q.f = ''; Q.q = '';
    V(shell(`<p class="lead">Tous les devis émis sont conservés ici, numérotés sans trou (DEV-année-numéro). Un devis émis ne se modifie plus : annulez-le et émettez-en un nouveau.</p>
<div id="q-warn"></div>
<div class="panel adm-bar"><div class="acc-f adm-q" style="flex:1"><label for="q-q">Rechercher</label><input id="q-q" type="search" placeholder="Numéro, client, SIRET…" autocomplete="off"></div>
<div class="acc-f"><label for="q-f">Statut</label>${sel('q-f', [['', 'Tous'], ['draft', 'Brouillons'], ['sent', 'Envoyés'], ['expired', 'Expirés'], ['accepted', 'Acceptés · à payer'], ['paid', 'Payés'], ['refused', 'Refusés'], ['cancelled', 'Annulés']], '')}</div>
<div class="adm-bar-b"><button class="btn b1" data-a="q-new">+ Nouveau devis</button> <button class="btn b4" data-a="q-csv">Exporter le registre (CSV)</button></div></div>
<div id="q-list"><p class="mut" role="status">Chargement des devis…</p></div>`));
    if (Q.list) renderList();
    Promise.all([load(true), loadCompany(true)]).then(() => { renderList(); renderWarn(); });
  }
  async function renderWarn() {
    const box = document.getElementById('q-warn'); if (!box) return; const qd = await mods(), miss = qd.companyMissing(Q.company);
    box.innerHTML = Q.companyErr && Q.company === null ? `<div class="panel q-warn"><p>${esc(Q.companyErr)}</p></div>`
      : miss.length ? `<div class="panel q-warn"><p><b>Émission bloquée.</b> Pour qu’un devis soit valable, il doit indiquer qui l’émet. Il manque : ${esc(miss.join(', '))}.</p><p><a class="btn b1" href="#/admin/infos-legales">Compléter les informations légales</a></p><p class="mut">En attendant, vous pouvez préparer des brouillons.</p></div>` : '';
  }
  async function renderList() {
    const box = document.getElementById('q-list'); if (!box || !Q.list) return; const qd = await mods();
    if (Q.err) { box.innerHTML = `<div class="panel"><p>${esc(Q.err)}</p><p><button class="btn b1" data-a="q-reload">Réessayer</button></p></div>`; return; }
    const t = Q.q.trim().toLowerCase();
    const l = Q.list.filter((q) => (!Q.f || qd.shownStatus(q) === Q.f) && (!t || [q.number, q.client?.name, q.client?.siret, q.client?.email, q.orgName].some((x) => String(x || '').toLowerCase().includes(t))));
    if (!l.length) { box.innerHTML = `<div class="panel"><p class="mut">${Q.list.length ? 'Aucun devis pour ce filtre.' : 'Aucun devis pour le moment. Ils se préparent depuis « À traiter » (demandes des entreprises) ou avec « + Nouveau devis ».'}</p></div>`; return; }
    box.innerHTML = `<div class="adm-tw"><table class="adm-t q-t5"><thead><tr><th>Numéro</th><th>Date</th><th>Client</th><th class="n">Total</th><th>Statut</th><th></th></tr></thead><tbody>${l.map((q) =>
      `<tr><td data-label="Numéro"><b>${esc(q.number || '—')}</b></td><td data-label="Date">${esc(fdate(q.issuedAt || q.updatedAt))}</td><td data-label="Client">${esc(q.client?.name || '—')}</td><td data-label="Total" class="n">${esc(eur(q.totalTTC))}</td><td data-label="Statut">${stBadge(qd, q)}</td>` +
      `<td class="adm-act">${q.status === 'draft' ? `<button class="btn b4" data-a="q-edit" data-id="${esc(q.id)}">Modifier</button> ` : ''}<a class="btn b4" href="#/admin/devis/${esc(q.id)}">Voir</a></td></tr>`).join('')}</tbody></table></div>`;
  }
  document.addEventListener('input', (e) => {
    if (e.target.id === 'q-q') { Q.q = e.target.value; renderList(); }
    if (e.target.closest && e.target.closest('form[data-f="q-edit"]')) recalc(e.target.form);
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'q-f') { Q.f = e.target.value; renderList(); }
    if (e.target.id === 'q-period') periodChanged(e.target.form);
    if (e.target.id === 'lg-vatMode') { const t = document.getElementById('lg-tva'); if (t) t.hidden = e.target.value !== 'tva'; }
  });

  /* ------------------------------------------------------------------ éditeur */
  const desig = (PER, name, period) => `Licence ${name} Pro Entreprise — ${PER[period] ? PER[period].long : ''}`;
  async function fromRequest(rid) {
    const ok = OK(); if (!ok.state.requests.length && !ok.state.pending.length) await ok.reload();
    const r = ok.state.requests.find((x) => x.id === rid); if (!r) throw Object.assign(new Error('req'), { code: 'app/quote-missing' });
    const { PERIODS } = await mods(); await loadPlans();
    const u = r.kind === 'signup' ? ok.pendById(r.requesterUid) : null, org = r.orgId ? ok.orgById(r.orgId) : null;
    const period = ((r.items || [])[0] || {}).period || 'yearly';
    return {
      requestId: r.id, clientUid: r.requesterUid, clientEmail: r.requesterEmail, orgId: r.orgId || '', orgName: r.companyName || (org && org.name) || '', period,
      client: { name: r.companyName || (org && org.name) || '', siret: r.siret || (org && org.siret) || '', address: (org && org.address) || '', email: (u && u.companyEmail) || r.requesterEmail || '', contact: r.requesterName || '' },
      lines: (r.items || []).map((it) => ({ designation: desig(PERIODS, it.productName || pname(it.productId), period), productId: it.productId, licenseType: it.licenseType || 'pro_entreprise', period, qty: it.qty || 1, unitHT: priceFor(it.productId, period, it.licenseType) })),
      notes: r.kind === 'member' && (r.emails || []).length ? `Licences pour : ${(r.emails || []).join(', ')}.` : ''
    };
  }
  async function openEditor(opt) {
    const qd = await mods(); let q;
    try {
      await Promise.all([loadCompany(), loadPlans()]);
      q = opt.id ? await qd.getQuote(opt.id) : opt.req ? await fromRequest(opt.req) : opt.dup ? { ...(await qd.getQuote(opt.dup)) } : { client: {}, lines: [], period: 'yearly' };
    } catch (e) { return toast(errMsg(e)); }
    if (opt.dup) ['number', 'year', 'seq', 'issuer', 'issuedAt', 'validUntil', 'acceptedAt', 'acceptedBy', 'refusedAt', 'paidAt', 'paymentRef', 'keyIds', 'cancelledAt', 'cancelReason', 'requestId'].forEach((k) => delete q[k]);
    const C = Q.company || {}, PER = qd.PERIODS, miss = qd.companyMissing(Q.company), c = q.client || {};
    Q.mod = { id: opt.id || '', base: q };
    const vatMode = C.vatMode || 'tva', vatRate = C.vatMode === 'franchise' ? 0 : (C.vatRate != null && C.vatRate !== '' ? Number(C.vatRate) : 20);
    pmodal(`<h3>${opt.id ? 'Modifier le brouillon' : 'Nouveau devis'}</h3>
      ${miss.length ? `<p class="q-warn-s">Émission impossible tant que les informations légales sont incomplètes (il manque ${esc(miss.join(', '))}) : vous pouvez enregistrer un brouillon.</p>` : ''}
      <form data-f="q-edit" novalidate data-vm="${esc(vatMode)}" data-vr="${esc(vatRate)}">
      <fieldset class="acc-f"><legend>Client</legend>
        <div class="row">${fld('q-cname', 'Raison sociale', inp('q-cname', 'text', c.name, 'maxlength="160"'))}${fld('q-csiret', 'SIRET', inp('q-csiret', 'text', c.siret, 'maxlength="17" inputmode="numeric"'), '<button type="button" class="lk" data-a="q-siret">Remplir l’adresse d’après le SIRET</button>')}</div>
        ${fld('q-caddr', 'Adresse', area('q-caddr', c.address, 'rows="2" maxlength="400"'))}
        <div class="row">${fld('q-ccontact', 'À l’attention de', inp('q-ccontact', 'text', c.contact, 'maxlength="160"'))}${fld('q-cemail', 'E-mail', inp('q-cemail', 'email', c.email, 'maxlength="160"'))}</div>
        <div class="row">${fld('q-cvat', 'N° de TVA du client <span class="mut">(facultatif)</span>', inp('q-cvat', 'text', c.vatNumber, 'maxlength="30"'))}${q.clientUid || q.forUid ? `<div class="acc-f"><label>Compte du client</label><p class="mt2">${esc(q.clientEmail || '')}</p><p class="acc-h">Le devis apparaîtra dans son espace.</p></div>` : fld('q-cacct', 'Compte Studio Prism du client <span class="mut">(e-mail, facultatif)</span>', inp('q-cacct', 'email', '', 'maxlength="160"'), 'Si le client a un compte, il verra le devis dans son espace et pourra l’accepter en ligne.')}</div>
      </fieldset>
      <fieldset class="acc-f"><legend>Contenu</legend>
        ${fld('q-period', 'Facturation', sel('q-period', Object.entries(PER).map(([k, v]) => [k, v.label + ' · clés valables ' + v.days + ' jours']), q.period || 'yearly'), 'Change la désignation et le prix catalogue des licences.')}
        <div class="q-lt"><div class="q-lh" aria-hidden="true"><span>Désignation</span><span class="n">Qté</span><span class="n">Prix unitaire HT</span><span class="n">Total HT</span><span></span></div><div id="q-lines">${(q.lines || []).map(lineRow).join('')}</div></div>
        <div class="adm-bar" style="margin-top:8px"><div class="acc-f"><label for="q-add">Ajouter</label>${sel('q-add', [...apps().map(([v, t]) => [v, 'Licence ' + t]), ['', 'Ligne libre']], (apps()[0] || [''])[0])}</div><button type="button" class="btn b4" data-a="q-ln-add">+ Ligne</button></div>
        <div id="q-tot" class="q-tot"></div>
      </fieldset>
      <fieldset class="acc-f"><legend>Conditions</legend>
        <div class="row">${fld('q-valid', 'Validité (jours)', inp('q-valid', 'number', q.validDays || C.validDays || 30, 'min="1" max="365"'))}<div></div></div>
        ${fld('q-terms', 'Conditions de paiement', area('q-terms', q.paymentTerms || C.paymentTerms || qd.DEFAULT_TERMS, 'rows="3" maxlength="2000"'))}
        ${fld('q-notes', 'Remarques <span class="mut">(facultatif, imprimées sur le devis)</span>', area('q-notes', q.notes, 'rows="2" maxlength="2000"'))}
      </fieldset>
      <p class="fe" id="q-err" role="alert"></p>
      <p><button class="btn b4" type="submit" data-act="draft">Enregistrer le brouillon</button> <button class="btn b1" type="submit" data-act="issue"${miss.length ? ' disabled' : ''}>Émettre le devis</button></p></form>`, true);
    recalc(document.querySelector('form[data-f="q-edit"]'));
  }
  function lineRow(l) {
    const miss = l.unitHT == null;
    return `<div class="q-ln" data-pid="${esc(l.productId || '')}" data-lt="${esc(l.licenseType || '')}" data-auto="${esc(l.designation || '')}">
      <input class="q-d" aria-label="Désignation" maxlength="300" value="${esc(l.designation || '')}" placeholder="Désignation">
      <label class="q-c"><span>Qté</span><input class="q-n" aria-label="Quantité" type="number" min="0" max="10000" value="${esc(l.qty == null ? 1 : l.qty)}"></label>
      <label class="q-c"><span>Prix unitaire HT</span><input class="q-u${miss ? ' q-miss' : ''}" aria-label="Prix unitaire HT" type="number" min="0" step="0.01" value="${miss ? '' : esc(l.unitHT)}"${miss ? ' placeholder="à saisir"' : ''}></label>
      <span class="n q-t"></span><button type="button" class="lk" data-a="q-ln-del" aria-label="Supprimer la ligne">Retirer</button></div>`;
  }
  function readLines(fm) {
    return [...fm.querySelectorAll('.q-ln')].map((tr) => ({ designation: tr.querySelector('.q-d').value.trim(), productId: tr.dataset.pid, licenseType: tr.dataset.lt,
      period: tr.dataset.pid ? fm.elements['q-period'].value : '', qty: parseInt(tr.querySelector('.q-n').value, 10) || 0, unitHT: parseFloat(tr.querySelector('.q-u').value) || 0 }));
  }
  function recalc(fm) {
    if (!fm || !MODS) return; const vm = fm.dataset.vm, vr = Number(fm.dataset.vr) || 0;
    fm.querySelectorAll('.q-ln').forEach((tr) => { tr.querySelector('.q-t').textContent = eur((parseInt(tr.querySelector('.q-n').value, 10) || 0) * (parseFloat(tr.querySelector('.q-u').value) || 0)); const u = tr.querySelector('.q-u'); u.classList.toggle('q-miss', u.value === ''); });
    const t = MODS.totals(readLines(fm), vm, vr), box = fm.querySelector('#q-tot');
    if (box) box.innerHTML = `<span>Total HT <b>${esc(eur(t.totalHT))}</b></span>${vm === 'franchise' ? '<span class="mut">TVA non applicable (art. 293 B du CGI)</span>' : `<span>TVA ${esc(vr)} % <b>${esc(eur(t.totalVAT))}</b></span>`}<span>Total ${vm === 'franchise' ? '' : 'TTC'} <b>${esc(eur(t.totalTTC))}</b></span>`;
  }
  function periodChanged(fm) {
    const PER = MODS.PERIODS, period = fm.elements['q-period'].value;
    fm.querySelectorAll('.q-ln').forEach((tr) => {
      if (!tr.dataset.pid) return; const d = tr.querySelector('.q-d'), u = tr.querySelector('.q-u'), nd = desig(PER, pname(tr.dataset.pid), period);
      if (d.value === tr.dataset.auto) d.value = nd; tr.dataset.auto = nd;
      const p = priceFor(tr.dataset.pid, period, tr.dataset.lt); u.value = p == null ? '' : p; u.placeholder = p == null ? 'à saisir' : '';
    });
    recalc(fm);
  }
  A['q-ln-add'] = (b) => {
    const fm = b.form || b.closest('form'), pid = fm.elements['q-add'].value, period = fm.elements['q-period'].value;
    fm.querySelector('#q-lines').insertAdjacentHTML('beforeend', lineRow(pid ? { designation: desig(MODS.PERIODS, pname(pid), period), productId: pid, licenseType: 'pro_entreprise', qty: 1, unitHT: priceFor(pid, period) } : { designation: '', qty: 1, unitHT: 0 }));
    recalc(fm);
  };
  A['q-ln-del'] = (b) => { const fm = b.closest('form'); b.closest('.q-ln').remove(); recalc(fm); };
  /* Adresse d'après le SIRET : annuaire public des entreprises (api.gouv.fr) ; à défaut, la fiche s'ouvre dans un nouvel onglet. */
  A['q-siret'] = async (b) => {
    const fm = b.closest('form'), s = fm.elements['q-csiret'].value.replace(/\s/g, ''), er = fm.querySelector('#e-q-csiret'); er.textContent = '';
    if (!/^\d{14}$/.test(s)) { er.textContent = 'SIRET : 14 chiffres.'; return; }
    b.disabled = true; b.textContent = 'Recherche…';
    try {
      const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${s}&page=1&per_page=1`); const j = await r.json(), e = j.results && j.results[0];
      const et = e && ((e.matching_etablissements || []).find((x) => x.siret === s) || (e.siege && e.siege.siret === s ? e.siege : null));
      if (!et) throw new Error('introuvable');
      fm.elements['q-caddr'].value = (et.adresse || '').trim(); if (!fm.elements['q-cname'].value && e.nom_complet) fm.elements['q-cname'].value = e.nom_complet;
      toast('Adresse remplie d’après l’annuaire des entreprises.');
    } catch (e) { window.open(`https://annuaire-entreprises.data.gouv.fr/etablissement/${s}`, '_blank', 'noopener'); er.textContent = 'Recherche automatique impossible : la fiche publique s’ouvre dans un onglet, copiez l’adresse.'; }
    b.disabled = false; b.textContent = 'Remplir l’adresse d’après le SIRET';
  };
  function readForm(fm) {
    const g = (id) => ((fm.elements[id] && fm.elements[id].value) || '').trim(), base = (Q.mod && Q.mod.base) || {};
    return { ...base, client: { name: g('q-cname'), siret: g('q-csiret').replace(/\s/g, ''), address: g('q-caddr'), contact: g('q-ccontact'), email: g('q-cemail').toLowerCase(), vatNumber: g('q-cvat') },
      period: g('q-period'), durationDays: MODS.PERIODS[g('q-period')]?.days || null, lines: readLines(fm).filter((l) => l.designation || l.qty),
      vatMode: fm.dataset.vm, vatRate: Number(fm.dataset.vr) || 0, validDays: parseInt(g('q-valid'), 10) || 30, paymentTerms: g('q-terms'), notes: g('q-notes') };
  }
  let submitter = 'draft';
  document.addEventListener('click', (e) => { const b = e.target.closest('form[data-f="q-edit"] button[type=submit]'); if (b) submitter = b.dataset.act; }, true);
  async function submitEdit(fm) {
    const err = fm.querySelector('#q-err'), btns = fm.querySelectorAll('button[type=submit]'), act = submitter, q = readForm(fm), qd = MODS; err.textContent = '';
    if (act === 'issue' && (!q.client.name || !q.client.address)) { err.textContent = errMsg({ code: 'app/quote-client' }); return; }
    if (!q.lines.length) { err.textContent = errMsg({ code: 'app/quote-empty' }); return; }
    btns.forEach((b) => { b.disabled = true; }); const btn = fm.querySelector(`[data-act="${act}"]`), lbl = btn.textContent; btn.textContent = act === 'issue' ? 'Émission…' : 'Enregistrement…';
    try {
      const acct = fm.elements['q-cacct'] && fm.elements['q-cacct'].value.trim();
      if (acct && !q.clientUid && !q.forUid) { const u = await (await OD()).adminFindUserByEmail(acct); if (!u) throw Object.assign(new Error('u'), { code: 'x' }, { message: 'Aucun compte avec cette adresse.' }); Object.assign(q, { clientUid: u.uid, forUid: u.uid, clientEmail: u.email, orgId: u.orgId || '', orgName: u.orgName || '' }); }
      let id = await qd.saveDraft(q, Q.mod.id); Q.mod.id = id; Q.mod.base = q;
      if (act === 'draft') { await load(true); toast('Brouillon enregistré.'); A.x(); afterChange(); return; }
      /* émission : l'entreprise en attente est validée (fiche créée, demandeur responsable), la demande est close */
      const ok = OK();
      if (q.requestId) {
        await ok.reload(); const r = ok.state.requests.find((x) => x.id === q.requestId);
        if (r && r.kind === 'signup' && ok.pendById(r.requesterUid)) { const org = await ok.approveOnly(r.requesterUid); if (org) { q.orgId = org.id; q.orgName = org.name; } }
        else if (r) await ok.closeRequest(r.id, r.orgId || '');
      }
      const res = await qd.issueQuote(q, id); await Promise.all([load(true), ok.reload()]); afterChange();
      issued(res.id);
    } catch (e) { console.error('[Studio Prism] Devis :', e); err.textContent = e && e.code === 'x' ? e.message : errMsg(e); btns.forEach((b) => { b.disabled = false; }); btn.textContent = lbl; }
  }
  function afterChange() { renderList(); OK()?.renderTodo?.(); }
  async function issued(id) {
    const q = await MODS.getQuote(id);
    pmodal(`<h3>Devis ${esc(q.number)} émis</h3><p>${esc(q.client.name)} · ${esc(eur(q.totalTTC))} · valable jusqu’au ${esc(fdate(q.validUntil))}.</p>
      <p class="mut">${q.clientUid ? 'Le client le voit maintenant dans son espace Studio Prism (Mon compte › Mes devis), où il peut le télécharger et l’accepter.' : 'Ce client n’a pas de compte : envoyez-lui le devis en PDF.'} L’envoi automatique par e-mail n’est pas encore branché : prévenez-le avec le bouton ci-dessous.</p>
      <p><a class="btn b1" href="${esc(mailto(q))}">Envoyer par e-mail</a> <a class="btn b4" href="#/admin/devis/${esc(q.id)}" data-a="x">Voir le devis</a></p>`);
  }
  function mailto(q) {
    const I = q.issuer || {}, to = q.clientEmail || q.client?.email || '';
    const body = `Bonjour${q.client?.contact ? ' ' + q.client.contact : ''},\n\nVeuillez trouver notre devis ${q.number} d’un montant de ${eur(q.totalTTC)}${q.vatMode === 'franchise' ? '' : ' TTC'}, valable jusqu’au ${fdate(q.validUntil)}.\n\n` +
      (q.clientUid ? `Vous pouvez le consulter, le télécharger en PDF et l’accepter en ligne depuis votre espace Studio Prism :\n${SITE()}#/compte/devis/${q.id}\n\n` : 'Le devis est joint à ce message (PDF). Pour l’accepter, renvoyez-le daté et signé avec la mention « Bon pour accord ».\n\n') +
      `Dès réception du paiement, vos clés de licence vous sont délivrées.\n\nCordialement,\n${I.tradeName || I.legalName || 'Studio Prism'}`;
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Devis ${q.number} — ${I.tradeName || 'Studio Prism'}`)}&body=${encodeURIComponent(body)}`;
  }

  /* ------------------------------------------------------------------ un devis (administration) */
  async function viewAdmin(id, shell) {
    V(shell(`<p class="crumb q-side"><a href="#/admin/devis">← Tous les devis</a></p><div id="q-view"><p class="mut" role="status">Chargement du devis…</p></div>`));
    const qd = await mods(); let q;
    try { [q] = await Promise.all([qd.getQuote(id), loadCompany()]); } catch (e) { const b = document.getElementById('q-view'); if (b) b.innerHTML = `<div class="panel"><p>${esc(errMsg(e))}</p></div>`; return; }
    const box = document.getElementById('q-view'); if (!box) return; const s = qd.shownStatus(q);
    const act = [];
    if (q.status === 'draft') act.push(`<button class="btn b1" data-a="q-edit" data-id="${esc(id)}">Modifier / émettre</button>`, `<button class="btn btn-danger" data-a="q-del" data-id="${esc(id)}">Supprimer le brouillon</button>`);
    if (q.status === 'sent') act.push(`<a class="btn b1" href="${esc(mailto(q))}">Envoyer par e-mail</a>`, `<button class="btn b4" data-a="q-acc-admin" data-id="${esc(id)}">Accord reçu (papier, e-mail)</button>`);
    if (q.status === 'accepted') act.push(`<button class="btn b1" data-a="q-paid" data-id="${esc(id)}">Paiement reçu → générer les clés</button>`);
    if (q.status !== 'draft') act.push(`<button class="btn b4" data-a="q-print">Télécharger en PDF / imprimer</button>`, `<button class="btn b4" data-a="q-dup" data-id="${esc(id)}">Dupliquer</button>`);
    if (q.status === 'sent' || q.status === 'accepted') act.push(`<button class="btn btn-danger" data-a="q-cancel" data-id="${esc(id)}">Annuler le devis</button>`);
    const info = [q.status === 'paid' ? `Payé le ${fdate(q.paidAt)}${q.paymentRef ? ' (' + q.paymentRef + ')' : ''} · ${(q.keyIds || []).length} clé(s) générée(s)${q.orgId ? ' : visibles dans la fiche entreprise et dans l’espace du client' : ''}.` : '',
      q.status === 'refused' ? `Refusé par le client le ${fdate(q.refusedAt)}.` : '', q.status === 'cancelled' ? `Annulé le ${fdate(q.cancelledAt)}${q.cancelReason ? ' : ' + q.cancelReason : ''}.` : '',
      s === 'expired' ? 'Date de validité dépassée : le client ne peut plus l’accepter en ligne. Dupliquez-le pour en émettre un nouveau.' : '',
      q.clientUid || q.forUid ? `Compte client : ${q.clientEmail || q.clientUid || q.forUid}.` : 'Client sans compte Studio Prism : envoyez-lui le PDF.'].filter(Boolean);
    box.innerHTML = `<div class="panel q-side q-act"><p>${stBadge(qd, q)} ${info.map(esc).join(' ')}</p><p class="q-btns">${act.join(' ')}</p></div>${docHtml(q, qd.PERIODS)}`;
  }
  A['q-print'] = () => window.print();
  A['q-new'] = () => openEditor({});
  A['q-edit'] = (b) => openEditor({ id: b.dataset.id });
  A['q-dup'] = (b) => openEditor({ dup: b.dataset.id });
  A['q-from-req'] = (b) => openEditor({ req: b.dataset.id });
  A['q-reload'] = () => load(true).then(renderList);
  A['q-csv'] = async () => {
    await load(true); const blob = new Blob([MODS.registerCsv(Q.list || [])], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `registre-devis-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  A['q-del'] = (b) => pmodal(`<h3>Supprimer ce brouillon ?</h3><p>Un brouillon n’a pas encore de numéro : le supprimer ne crée pas de trou dans la numérotation.</p><p><button class="btn btn-danger" data-a="q-del-ok" data-id="${esc(b.dataset.id)}">Supprimer</button></p>`);
  A['q-del-ok'] = async (b) => { try { await MODS.deleteDraft(b.dataset.id); A.x(); await load(true); toast('Brouillon supprimé.'); location.hash = '#/admin/devis'; } catch (e) { toast(errMsg(e)); } };
  A['q-cancel'] = (b) => pmodal(`<h3>Annuler ce devis ?</h3><p>Il reste dans le registre avec la mention « Annulé » (un devis émis ne se supprime pas) et le client ne peut plus l’accepter.</p><form data-f="q-cancel" data-id="${esc(b.dataset.id)}">${fld('qc-r', 'Motif <span class="mut">(facultatif)</span>', inp('qc-r', 'text', '', 'maxlength="300"'))}<p class="fe" id="qc-err" role="alert"></p><p><button class="btn btn-danger" type="submit">Annuler le devis</button></p></form>`);
  A['q-acc-admin'] = (b) => pmodal(`<h3>Accord du client reçu</h3><p>À utiliser quand le client a renvoyé le devis signé « Bon pour accord » (papier, PDF signé, e-mail). Conservez ce document.</p><form data-f="q-acc-admin" data-id="${esc(b.dataset.id)}">${fld('qa-n', 'Nom du signataire', inp('qa-n', 'text', '', 'maxlength="160" required'))}<p class="fe" id="qa-err" role="alert"></p><p><button class="btn b1" type="submit">Enregistrer l’accord</button></p></form>`);
  /* Paiement reçu : clés générées d'après les lignes « licence » du devis (quantité, application, durée de la période), au nom de l'entreprise. */
  A['q-paid'] = async (b) => {
    let q; try { q = await (await mods()).getQuote(b.dataset.id); } catch (e) { return toast(errMsg(e)); }
    const L = (q.lines || []).filter((l) => l.productId && l.qty > 0), days = q.durationDays || (MODS.PERIODS[q.period] || {}).days || 365;
    pmodal(`<h3>Paiement reçu · ${esc(q.number)}</h3><p>${esc(q.client?.name || '')} · <b>${esc(eur(q.totalTTC))}</b></p>
      <p>Clés générées : ${L.length ? L.map((l) => `<b>${esc(l.qty)} × ${esc(pname(l.productId))}</b>`).join(', ') : 'aucune (le devis n’a pas de ligne de licence)'} — Pro Entreprise, valables ${esc(days)} jours après activation${q.orgId ? `, au nom de ${esc(q.orgName || '')}` : ''}.</p>
      <form data-f="q-paid" data-id="${esc(q.id)}">${fld('qp-ref', 'Référence du paiement <span class="mut">(facultatif)</span>', inp('qp-ref', 'text', '', 'maxlength="120" placeholder="Virement du …"'))}<p class="fe" id="qp-err" role="alert"></p><p><button class="btn b1" type="submit">Enregistrer le paiement et générer les clés</button></p></form>`);
  };
  async function submitPaid(fm) {
    const err = fm.querySelector('#qp-err'), btn = fm.querySelector('button[type=submit]'), id = fm.dataset.id; err.textContent = ''; btn.disabled = true; btn.textContent = 'Génération…';
    try {
      const qd = await mods(), q = await qd.getQuote(id), ok = OK(), od = await OD();
      if (!ok.state.orgs.length) await ok.reload();
      const org = q.orgId ? ok.orgById(q.orgId) : null; if (q.orgId && !org) throw Object.assign(new Error('org'), { code: 'app/org-missing' });
      const days = q.durationDays || (qd.PERIODS[q.period] || {}).days || 365;
      let made = Q.paidKeys[id];   // clés déjà générées lors d'un essai précédent qui n'a pas pu enregistrer le paiement : pas de doublon
      if (!made) { made = []; for (const l of (q.lines || []).filter((x) => x.productId && x.qty > 0)) (await ok.genKeys(od, org, { productId: l.productId, productName: pname(l.productId), licenseType: l.licenseType || 'pro_entreprise' }, l.qty, days, `Devis ${q.number}`)).forEach((k) => made.push({ ...k, app: pname(l.productId) })); Q.paidKeys[id] = made; }
      await qd.adminMarkPaid(id, fm.elements['qp-ref'].value, made.map((k) => k.id)); delete Q.paidKeys[id];
      await Promise.all([load(true), ok.reload()]); afterChange();
      if (location.hash.indexOf('#/admin/devis/') === 0) R['admin/devis']();
      if (made.length) ok.keysResult(`${made.length} clé${made.length > 1 ? 's' : ''} générée${made.length > 1 ? 's' : ''} · ${q.number}`, org || { id: '', name: q.client?.name || '' }, made.map((k) => `${k.key}  ·  ${k.app}`));
      else { A.x(); toast('Paiement enregistré.'); }
    } catch (e) { console.error('[Studio Prism] Paiement :', e); err.textContent = errMsg(e); btn.disabled = false; btn.textContent = 'Réessayer'; }
  }

  /* ------------------------------------------------------------------ informations légales */
  async function legalTab(p, shell) {
    V(shell('<div id="lg"><p class="mut" role="status">Chargement…</p></div>'));
    const qd = await mods(), C = (await loadCompany(true)) || {}, box = document.getElementById('lg'); if (!box) return;
    if (Q.companyErr && Q.company === null && !Object.keys(C).length && /règles/.test(Q.companyErr)) { box.innerHTML = `<div class="panel"><p>${esc(Q.companyErr)}</p></div>`; return; }
    const v = (k, d) => (C[k] != null && C[k] !== '' ? C[k] : d == null ? '' : d), f = (id, label, ctl, hint) => fld('lg-' + id, label, ctl, hint);
    box.innerHTML = `<p class="lead">Ces informations figurent sur chaque devis (mentions obligatoires de l’émetteur). Elles sont recopiées dans le devis au moment de son émission : les modifier ne change pas les devis déjà émis.</p>
      <form data-f="q-legal" class="panel" novalidate>
      <h3 class="lh">Identité</h3>
      <div class="row">${f('legalName', 'Raison sociale ou nom de l’entrepreneur', inp('lg-legalName', 'text', v('legalName'), 'maxlength="160"'), 'Entreprise individuelle : vos nom et prénom.')}${f('tradeName', 'Nom commercial', inp('lg-tradeName', 'text', v('tradeName', 'Studio Prism'), 'maxlength="120"'))}</div>
      <div class="row">${f('legalForm', 'Forme juridique', inp('lg-legalForm', 'text', v('legalForm'), 'maxlength="80" list="lg-forms" placeholder="EI, SASU, SARL…"') + '<datalist id="lg-forms"><option value="Entrepreneur individuel (EI)"><option value="EI — micro-entreprise"><option value="EURL"><option value="SARL"><option value="SASU"><option value="SAS"></datalist>')}${f('capital', 'Capital social <span class="mut">(société)</span>', inp('lg-capital', 'text', v('capital'), 'maxlength="40" placeholder="1 000 €"'))}</div>
      ${f('address', 'Adresse', area('lg-address', v('address'), 'rows="2" maxlength="300"'))}
      <div class="row">${f('siret', 'SIRET', inp('lg-siret', 'text', v('siret'), 'maxlength="17" inputmode="numeric"'))}${f('rcs', 'Immatriculation', inp('lg-rcs', 'text', v('rcs'), 'maxlength="80" placeholder="RCS Rennes 123 456 789 · ou « Dispensé d’immatriculation »"'))}</div>
      <h3 class="lh">TVA</h3>
      ${f('vatMode', 'Régime', sel('lg-vatMode', [['franchise', 'Franchise en base (TVA non applicable, art. 293 B du CGI)'], ['tva', 'Assujetti à la TVA']], v('vatMode', 'franchise')))}
      <div class="row" id="lg-tva"${v('vatMode', 'franchise') === 'tva' ? '' : ' hidden'}>${f('vatNumber', 'N° de TVA intracommunautaire', inp('lg-vatNumber', 'text', v('vatNumber'), 'maxlength="30" placeholder="FR…"'))}${f('vatRate', 'Taux (%)', inp('lg-vatRate', 'number', v('vatRate', 20), 'min="0" max="30" step="0.1"'))}</div>
      <p class="acc-h">Les prix de vos offres (Produits et prix) sont repris <b>hors taxes</b> sur les devis.</p>
      <h3 class="lh">Contact et paiement</h3>
      <div class="row">${f('email', 'E-mail', inp('lg-email', 'email', v('email'), 'maxlength="160"'))}${f('phone', 'Téléphone', inp('lg-phone', 'tel', v('phone'), 'maxlength="40"'))}</div>
      ${f('website', 'Site internet', inp('lg-website', 'text', v('website', 'www.studio-prism.com'), 'maxlength="120"'))}
      <div class="row">${f('bank', 'Banque', inp('lg-bank', 'text', v('bank'), 'maxlength="80"'))}${f('iban', 'IBAN', inp('lg-iban', 'text', v('iban'), 'maxlength="42"'))}</div>
      <div class="row">${f('bic', 'BIC', inp('lg-bic', 'text', v('bic'), 'maxlength="11"'))}${f('validDays', 'Validité des devis (jours)', inp('lg-validDays', 'number', v('validDays', 30), 'min="1" max="365"'))}</div>
      ${f('paymentTerms', 'Conditions de paiement par défaut', area('lg-paymentTerms', v('paymentTerms', qd.DEFAULT_TERMS), 'rows="3" maxlength="2000"'))}
      ${f('latePenalty', 'Pénalités de retard (mention obligatoire entre professionnels)', area('lg-latePenalty', v('latePenalty', qd.DEFAULT_PENALTY), 'rows="3" maxlength="600"'))}
      ${f('footer', 'Mentions complémentaires <span class="mut">(facultatif)</span>', area('lg-footer', v('footer'), 'rows="2" maxlength="400"'))}
      <p class="fe" id="lg-err" role="alert"></p><p><button class="btn b1" type="submit">Enregistrer</button></p></form>`;
  }
  async function submitLegal(fm) {
    const qd = await mods(), g = (k) => ((fm.elements['lg-' + k] && fm.elements['lg-' + k].value) || '').trim(), err = fm.querySelector('#lg-err'), btn = fm.querySelector('button[type=submit]');
    K.clearErrors(); err.textContent = ''; const c = {}, er = {};
    qd.COMPANY_FIELDS.forEach((k) => { c[k] = g(k); });
    c.siret = c.siret.replace(/\s/g, ''); c.vatRate = c.vatMode === 'tva' ? Math.max(0, Math.min(30, parseFloat(c.vatRate) || 0)) : 0; c.validDays = Math.max(1, Math.min(365, parseInt(c.validDays, 10) || 30));
    c.iban = c.iban.replace(/\s/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim(); c.vatNumber = c.vatNumber.replace(/\s/g, '').toUpperCase();
    if (c.siret && !K.siretOk(c.siret)) er['lg-siret'] = 'SIRET invalide (14 chiffres).';
    if (c.email && !K.EMAIL_RE.test(c.email)) er['lg-email'] = 'E-mail invalide.';
    if (K.showErrors(fm, er)) return;
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try { await qd.saveCompany(c); Q.company = { ...c }; Q.companyErr = ''; const miss = qd.companyMissing(c);
      toast(miss.length ? `Enregistré. Pour émettre des devis, il manque encore : ${miss.join(', ')}.` : 'Enregistré : les devis peuvent être émis.');
    } catch (e) { err.textContent = errMsg(e); }
    btn.disabled = false; btn.textContent = 'Enregistrer';
  }

  /* ------------------------------------------------------------------ client : Mes devis + un devis */
  async function mountMine(el) {
    if (!el || !st.auth.user) return;
    let list; try { list = await (await mods()).myQuotes(st.auth.user.uid); } catch (e) { el.hidden = true; return; }
    if (!list.length) { el.hidden = true; return; }
    const qd = MODS, todo = list.filter((q) => qd.shownStatus(q) === 'sent' || q.status === 'accepted').length;
    el.hidden = false;
    el.innerHTML = `<div class="fiche-h"><h2 class="lh" id="s-q">Mes devis${todo ? ` <span class="org-pend-n">${todo}</span>` : ''}</h2></div>
      <div class="adm-tw"><table class="adm-t q-t5"><thead><tr><th>Numéro</th><th>Date</th><th class="n">Montant</th><th>Statut</th><th></th></tr></thead><tbody>${list.map((q) => `<tr><td data-label="Numéro"><b>${esc(q.number)}</b></td><td data-label="Date">${esc(fdate(q.issuedAt))}</td><td data-label="Montant" class="n">${esc(eur(q.totalTTC))}</td><td data-label="Statut">${stBadge(qd, q)}</td><td class="adm-act"><a class="btn ${qd.shownStatus(q) === 'sent' ? 'b1' : 'b4'}" href="#/compte/devis/${esc(q.id)}">${qd.shownStatus(q) === 'sent' ? 'Consulter et accepter' : 'Voir'}</a></td></tr>`).join('')}</tbody></table></div>`;
  }
  async function clientPage() {
    const a = st.auth, id = hashId(3);
    const shell = (inner) => `<section class="pg"><div class="w" style="max-width:860px"><p class="crumb q-side"><a href="#/compte">Mon compte</a> / Devis</p>${inner}</div></section>`;
    if (a.status === 'loading') return V(shell('<p class="lead" role="status">Vérification de votre session…</p>'));
    if (a.status !== 'in') { V(shell('<p class="lead">Connectez-vous pour consulter votre devis.</p><p><a class="btn b1" href="#/compte/connexion">Se connecter</a></p>')); return; }
    V(shell('<div id="q-view"><p class="mut" role="status">Chargement du devis…</p></div>'));
    const qd = await mods(); let q;
    try { q = await qd.getQuote(id); } catch (e) { const b = document.getElementById('q-view'); if (b) b.innerHTML = `<div class="panel"><p>${esc(errMsg(e.code === 'permission-denied' ? { code: 'app/quote-missing' } : e))}</p></div>`; return; }
    const box = document.getElementById('q-view'); if (!box) return;
    const s = qd.shownStatus(q), I = q.issuer || {};
    const pay = `<p>Pour recevoir vos clés de licence, réglez <b>${esc(eur(q.totalTTC))}</b>${I.iban ? ` par virement : ${I.bank ? esc(I.bank) + ' · ' : ''}IBAN <b>${esc(I.iban)}</b>${I.bic ? ' · BIC ' + esc(I.bic) : ''}, en indiquant la référence <b>${esc(q.number)}</b>` : ` selon les conditions du devis (référence <b>${esc(q.number)}</b>)`}.</p><p class="mut">Dès réception du paiement, Studio Prism génère vos clés : elles apparaîtront dans Mon compte › Mon entreprise.</p>`;
    const panel = s === 'sent' ? `<div class="panel q-side q-act"><h2 class="lh" style="font-size:20px">Accepter ce devis</h2>
        <form data-f="q-accept" data-id="${esc(q.id)}" novalidate>${fld('qx-n', 'Nom et fonction du signataire', inp('qx-n', 'text', fullName(a.profile) !== '—' ? fullName(a.profile) : '', 'maxlength="160" autocomplete="name"'))}
        <label class="opt"><input type="checkbox" id="qx-ok"><span>J’ai lu ce devis et je l’accepte sans réserve : <b>bon pour accord</b>, valant engagement de commande de ${esc(eur(q.totalTTC))}.</span></label><p class="fe" id="e-qx-ok" role="alert"></p>
        <p class="fe" id="qx-err" role="alert"></p><p class="q-btns"><button class="btn b1" type="submit">Accepter le devis</button> <button class="btn b4" type="button" data-a="q-print">Télécharger en PDF</button> <button class="btn btn-danger" type="button" data-a="q-refuse" data-id="${esc(q.id)}">Refuser</button></p></form>
        <p class="mut">Valable jusqu’au ${esc(fdate(q.validUntil))}. Une question ? Écrivez à ${esc(I.email || 'Studio Prism')}.</p></div>`
      : `<div class="panel q-side q-act"><p>${stBadge(qd, q)} ${s === 'accepted' ? 'Merci, votre accord est enregistré.' : s === 'paid' ? `Payé le ${esc(fdate(q.paidAt))}. Vos clés sont dans <a class="more" href="#/compte">Mon compte › Mon entreprise</a>.` : s === 'expired' ? 'La date de validité de ce devis est dépassée : contactez Studio Prism pour un nouveau devis.' : s === 'refused' ? 'Vous avez refusé ce devis.' : s === 'cancelled' ? 'Ce devis a été annulé par Studio Prism.' : ''}</p>${s === 'accepted' ? pay : ''}<p class="q-btns"><button class="btn b4" data-a="q-print">Télécharger en PDF</button></p></div>`;
    box.innerHTML = panel + docHtml(q, qd.PERIODS);
  }
  async function submitAccept(fm) {
    const err = fm.querySelector('#qx-err'), btn = fm.querySelector('button[type=submit]'), name = fm.elements['qx-n'].value.trim(), er = {};
    K.clearErrors(); err.textContent = '';
    if (name.length < 2) er['qx-n'] = 'Indiquez le nom du signataire.';
    if (!fm.querySelector('#qx-ok').checked) er['qx-ok'] = 'Cochez la case pour donner votre accord.';
    if (K.showErrors(fm, er)) return;
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try { await (await mods()).acceptQuote(fm.dataset.id, st.auth.user, name); toast('Devis accepté. Merci !'); clientPage(); }
    catch (e) { err.textContent = errMsg(e); btn.disabled = false; btn.textContent = 'Accepter le devis'; }
  }
  A['q-refuse'] = (b) => pmodal(`<h3>Refuser ce devis ?</h3><p>Studio Prism en sera informé. Pour une modification, vous pouvez aussi lui écrire avant de refuser.</p><p><button class="btn btn-danger" data-a="q-refuse-ok" data-id="${esc(b.dataset.id)}">Refuser le devis</button></p>`);
  A['q-refuse-ok'] = async (b) => { try { await (await mods()).refuseQuote(b.dataset.id); A.x(); toast('Devis refusé.'); clientPage(); } catch (e) { toast(errMsg(e)); } };

  /* ------------------------------------------------------------------ formulaires */
  document.addEventListener('submit', (e) => {
    const f = e.target.dataset && e.target.dataset.f; if (!f || f.indexOf('q-') !== 0) return; e.preventDefault();
    const fm = e.target, id = fm.dataset.id;
    if (f === 'q-edit') return submitEdit(fm);
    if (f === 'q-legal') return submitLegal(fm);
    if (f === 'q-paid') return submitPaid(fm);
    if (f === 'q-accept') return submitAccept(fm);
    const btn = fm.querySelector('button[type=submit]'), err = fm.querySelector('.fe[id$="-err"]'); btn.disabled = true;
    const done = async (msg) => { A.x(); toast(msg); await load(true); afterChange(); R['admin/devis'](); };
    (f === 'q-cancel' ? MODS.adminCancel(id, fm.elements['qc-r'].value).then(() => done('Devis annulé.'))
      : f === 'q-acc-admin' ? (fm.elements['qa-n'].value.trim().length < 2 ? Promise.reject(Object.assign(new Error('n'), { code: 'x', message: 'Indiquez le nom du signataire.' })) : MODS.adminMarkAccepted(id, fm.elements['qa-n'].value.trim()).then(() => done('Accord enregistré : le devis attend le paiement.')))
      : Promise.resolve()).catch((e2) => { if (err) err.textContent = e2.code === 'x' ? e2.message : errMsg(e2); btn.disabled = false; });
  });

  /* ------------------------------------------------------------------ routes */
  const adminDevis = () => { const id = hashId(3); return id ? K.adminGate('quotes', (p, sh) => viewAdmin(id, sh)) : K.adminGate('quotes', listTab); };
  Object.assign(R, { 'admin/devis': adminDevis, 'admin/infos-legales': () => K.adminGate('legal', legalTab), 'compte/devis': clientPage });
  window.SP.quotesUI = { load: async () => { await mods(); return load(true); }, todoParts, todoN: () => accepted().length, mountMine, docHtml };
})();
