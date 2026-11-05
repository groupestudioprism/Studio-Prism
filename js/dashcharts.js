/* Studio Prism - administration : petits diagrammes interactifs et animés (SVG / HTML, aucune bibliothèque).
 * donut · colonnes empilées · courbe · barres horizontales. Survol et focus clavier = infobulle ; légendes cliquables.
 * Chaque fonction écrit dans l'élément fourni ; `anim:false` redessine sans rejouer l'animation (mises à jour en direct). */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- infobulle unique ---------- */
let tip = null;
function tipEl() {
  if (!tip) { tip = document.createElement('div'); tip.className = 'dc-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
  return tip;
}
export function showTip(html, x, y) {
  const t = tipEl(); t.innerHTML = html; t.classList.add('on');
  const w = t.offsetWidth, h = t.offsetHeight, vw = innerWidth;
  t.style.left = Math.max(8, Math.min(vw - w - 8, x + 14)) + 'px';
  t.style.top = Math.max(8, y - h - 12 < 8 ? y + 18 : y - h - 12) + 'px';
}
export function hideTip() { if (tip) tip.classList.remove('on'); }
const at = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
/* branche survol + focus + toucher sur des éléments portant data-tip */
function wire(root, fn) {
  root.querySelectorAll('[data-i]').forEach((el) => {
    const i = Number(el.dataset.i);
    el.addEventListener('pointermove', (e) => fn(i, e.clientX, e.clientY, el));
    el.addEventListener('pointerenter', (e) => fn(i, e.clientX, e.clientY, el));
    el.addEventListener('pointerleave', () => fn(-1));
    el.addEventListener('focus', () => { const [x, y] = at(el); fn(i, x, y, el); });
    el.addEventListener('blur', () => fn(-1));
  });
}
const legend = (items, hidden, key) => `<ul class="dc-leg">${items.map((s) => `<li><button type="button" class="dc-lg${hidden.has(s.id) ? ' off' : ''}" data-lg="${esc(s.id)}" aria-pressed="${!hidden.has(s.id)}" title="Afficher / masquer ${esc(s.label)}"><i style="background:${s.color}"></i>${esc(s.label)}${s.note != null ? `<b>${esc(s.note)}</b>` : ''}</button></li>`).join('')}</ul>`;
function bindLegend(root, onToggle) {
  root.querySelectorAll('[data-lg]').forEach((b) => b.addEventListener('click', () => onToggle(b.dataset.lg)));
}

/* ---------- donut ---------- */
/* o : { items:[{id,label,value,color}], hidden:Set, fmt:(v)=>string, center:[valeur, libellé], anim, onToggle(id), empty } */
export function donut(el, o) {
  const items = o.items, hid = o.hidden || new Set(), fmt = o.fmt || String;
  const vis = items.filter((s) => !hid.has(s.id) && s.value > 0), total = vis.reduce((a, s) => a + s.value, 0);
  const R = 70, C = 2 * Math.PI * R;
  let acc = 0;
  const segs = vis.map((s, k) => { const p = s.value / total, seg = { ...s, p, from: acc, k }; acc += p; return seg; });
  const ctr = o.center || [fmt(total), 'Total'];
  el.innerHTML = `<div class="dc-donut${o.anim === false || reduce() ? ' still' : ''}">
<div class="dc-dw"><svg viewBox="0 0 200 200" role="img" aria-label="${esc(o.label || 'Répartition')}"><circle class="dc-ring" cx="100" cy="100" r="${R}" fill="none" stroke-width="26"/>
${total ? segs.map((s) => { const gap = segs.length > 1 ? 0.6 : 0; return `<circle class="dc-seg" data-i="${s.k}" tabindex="0" role="img" aria-label="${esc(s.label)} : ${esc(fmt(s.value))} (${Math.round(s.p * 100)} %)" cx="100" cy="100" r="${R}" fill="none" stroke="${s.color}" stroke-width="26" pathLength="100" stroke-dasharray="${o.anim === false || reduce() ? Math.max(0, s.p * 100 - gap) : 0} 100" data-len="${Math.max(0, s.p * 100 - gap)}" stroke-dashoffset="${-(s.from * 100)}" transform="rotate(-90 100 100)"/>`; }).join('') : ''}
</svg><div class="dc-c"><b>${esc(ctr[0])}</b><span>${esc(ctr[1])}</span></div></div>
${legend(items.map((s) => ({ ...s, note: o.notes ? o.notes(s, total) : null })), hid)}</div>${total ? '' : `<p class="dc-empty">${esc(o.empty || 'Aucune donnée pour le moment.')}</p>`}`;
  const root = el.querySelector('.dc-donut'), center = el.querySelector('.dc-c');
  const c0 = center.innerHTML;
  if (!root.classList.contains('still')) requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('.dc-seg').forEach((c, i) => { c.style.transitionDelay = (i * 90) + 'ms'; c.setAttribute('stroke-dasharray', c.dataset.len + ' 100'); })));
  wire(el, (i, x, y) => {
    el.querySelectorAll('.dc-seg').forEach((c) => c.classList.toggle('hi', i >= 0 && Number(c.dataset.i) === i));
    el.querySelector('svg').classList.toggle('dim', i >= 0);
    if (i < 0) { hideTip(); center.innerHTML = c0; return; }
    const s = segs[i]; if (!s) return;
    center.innerHTML = `<b>${esc(fmt(s.value))}</b><span>${esc(s.label)} · ${Math.round(s.p * 100)} %</span>`;
    showTip(`<b><i style="background:${s.color}"></i>${esc(s.label)}</b>${esc(fmt(s.value))} · ${Math.round(s.p * 1000) / 10} %`, x, y);
  });
  bindLegend(el, o.onToggle || (() => {}));
}

/* ---------- colonnes empilées ---------- */
/* o : { labels:[], series:[{id,label,color,values}], hidden, fmt, anim, onToggle, tickEvery } */
export function stack(el, o) {
  const hid = o.hidden || new Set(), fmt = o.fmt || String, S = o.series.filter((s) => !hid.has(s.id)), n = o.labels.length;
  const tot = o.labels.map((_, i) => S.reduce((a, s) => a + (s.values[i] || 0), 0));
  const max = Math.max(...tot, 0), nice = niceMax(max), anim = o.anim !== false && !reduce();
  const ticks = [0, 1, 2, 3, 4].map((k) => nice * k / 4);
  el.innerHTML = `<div class="dc-stack"><div class="dc-y">${ticks.slice().reverse().map((t) => `<span>${esc(o.axis ? o.axis(t) : fmt(t))}</span>`).join('')}</div>
<div class="dc-plot">${ticks.map((t, k) => `<i class="dc-gl" style="bottom:${k * 25}%"></i>`).join('')}
<div class="dc-cols" style="--n:${n}">${o.labels.map((l, i) => `<div class="dc-col" data-i="${i}" tabindex="0" role="img" aria-label="${esc(l)} : ${esc(fmt(tot[i]))}"><div class="dc-st">${S.map((s) => { const v = s.values[i] || 0; return v > 0 ? `<b style="height:${nice ? v / nice * 100 : 0}%;background:${s.color}${anim ? ';transition-delay:' + (i * 14) + 'ms' : ''}" ${anim ? 'class="gr"' : ''}></b>` : ''; }).join('')}</div></div>`).join('')}</div>
<div class="dc-x" style="--n:${n}">${o.labels.map((l, i) => `<span style="${i % (o.tickEvery || 5) === 0 ? '' : 'visibility:hidden'}">${esc(l)}</span>`).join('')}</div></div></div>
${legend(o.series, hid)}${max ? '' : `<p class="dc-empty">${esc(o.empty || 'Aucune activité enregistrée sur la période.')}</p>`}`;
  if (anim) requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('.dc-st b.gr').forEach((b) => b.classList.add('go'))));
  wire(el, (i, x, y, c) => {
    el.querySelectorAll('.dc-col').forEach((k) => k.classList.toggle('hi', i >= 0 && Number(k.dataset.i) === i));
    if (i < 0) return hideTip();
    const rows = S.filter((s) => (s.values[i] || 0) > 0).sort((a, b) => b.values[i] - a.values[i]);
    showTip(`<b>${esc(o.long ? o.long[i] : o.labels[i])}</b>${rows.map((s) => `<div class="dc-tr"><i style="background:${s.color}"></i>${esc(s.label)}<em>${esc(fmt(s.values[i]))}</em></div>`).join('') || '<div class="dc-tr">Aucune activité</div>'}${rows.length > 1 ? `<div class="dc-tr tot">Total<em>${esc(fmt(tot[i]))}</em></div>` : ''}`, x, y);
  });
  bindLegend(el, o.onToggle || (() => {}));
}
function niceMax(v) {
  if (v <= 0) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 4 ? 4 : m <= 8 ? 8 : 10) * p;
}

/* ---------- courbe (aire) ---------- */
/* o : { labels, values, color, fmt, unit, anim } */
export function line(el, o) {
  const v = o.values, n = v.length, fmt = o.fmt || String, max = niceMax(Math.max(...v, 0)), col = o.color || '#0877B9';
  const X = (i) => n > 1 ? i / (n - 1) * 600 : 300, Y = (x) => 160 - (max ? x / max : 0) * 150;
  const pts = v.map((x, i) => [X(i), Y(x)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const anim = o.anim !== false && !reduce();
  el.innerHTML = `<div class="dc-line${anim ? ' anim' : ''}"><div class="dc-y">${[4, 3, 2, 1, 0].map((k) => `<span>${esc(fmt(max * k / 4))}</span>`).join('')}</div>
<div class="dc-plot"><svg viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden="true">${[0, 1, 2, 3, 4].map((k) => `<line class="dc-gl2" x1="0" x2="600" y1="${10 + k * 37.5}" y2="${10 + k * 37.5}" vector-effect="non-scaling-stroke"/>`).join('')}
<defs><linearGradient id="dl-${esc(o.id || 'a')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
<path class="dc-area" d="${d} L${X(n - 1)} 160 L${X(0)} 160Z" fill="url(#dl-${esc(o.id || 'a')})"/><path class="dc-ln" d="${d}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" pathLength="1"/></svg>
<i class="dc-cur" hidden></i><i class="dc-dot" hidden style="background:${col}"></i>
<div class="dc-hits" style="--n:${n}">${v.map((x, i) => `<div data-i="${i}" tabindex="0" role="img" aria-label="${esc(o.labels[i])} : ${esc(fmt(x))}"></div>`).join('')}</div>
<div class="dc-x" style="--n:${n}">${o.labels.map((l, i) => `<span style="${i % (o.tickEvery || 6) === 0 ? '' : 'visibility:hidden'}">${esc(l)}</span>`).join('')}</div></div></div>`;
  const cur = el.querySelector('.dc-cur'), dot = el.querySelector('.dc-dot');
  wire(el, (i, x, y) => {
    if (i < 0) { cur.hidden = dot.hidden = true; return hideTip(); }
    cur.hidden = dot.hidden = false;
    const lx = (n > 1 ? i / (n - 1) : .5) * 100;
    cur.style.left = lx + '%'; dot.style.left = lx + '%'; dot.style.top = (pts[i][1] / 160 * 100) + '%';
    showTip(`<b>${esc(o.long ? o.long[i] : o.labels[i])}</b>${esc(fmt(v[i]))} ${esc(o.unit || '')}`, x, y);
  });
}

/* ---------- barres horizontales ---------- */
/* o : { rows:[{label,value,color,sub}], fmt, anim, empty } */
export function hbars(el, o) {
  const rows = o.rows, fmt = o.fmt || String, max = Math.max(1, ...rows.map((r) => r.value)), anim = o.anim !== false && !reduce();
  el.innerHTML = rows.length ? `<ul class="dc-hb">${rows.map((r, i) => `<li data-i="${i}" tabindex="0"><span class="dc-hl">${r.color ? `<i style="background:${r.color}"></i>` : ''}${esc(r.label)}</span><span class="dc-ht"><b class="${anim ? 'gr' : 'go'}" style="width:${Math.max(r.value ? 2 : 0, r.value / max * 100)}%;${r.color ? 'background:' + r.color : ''};transition-delay:${i * 60}ms"></b></span><em>${esc(fmt(r.value))}</em></li>`).join('')}</ul>` : `<p class="dc-empty">${esc(o.empty || 'Aucune donnée.')}</p>`;
  if (anim) requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('.dc-hb b.gr').forEach((b) => b.classList.add('go'))));
  wire(el, (i, x, y) => {
    el.querySelectorAll('.dc-hb li').forEach((k) => k.classList.toggle('hi', i >= 0 && Number(k.dataset.i) === i));
    if (i < 0) return hideTip();
    const r = rows[i]; showTip(`<b>${r.color ? `<i style="background:${r.color}"></i>` : ''}${esc(r.label)}</b>${esc(fmt(r.value))}${r.sub ? '<br>' + esc(r.sub) : ''}`, x, y);
  });
}

/* ---------- valeur qui « roule » jusqu'à la nouvelle valeur ---------- */
export function countTo(node, to) {
  const from = Number(node.dataset.v || 0); node.dataset.v = to;
  if (reduce() || from === to) { node.textContent = to; return; }
  const t0 = performance.now(), dur = 600;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); node.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
