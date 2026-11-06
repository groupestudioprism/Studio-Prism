/* Fichier commun : source unique studio-prism/shared/prism-settings.js, recopiée par tools/sync_shared.py — ne pas modifier dans les apps */
/* ============ Réglages Studio Prism (module commun ARCHITRAFIC · ARCHIPLAN) ============
   Petit bouton ⚙ dans la barre du haut et sur l'accueil, à côté du compte. Les réglages d'interface (thème, taille,
   molette, animations) sont partagés entre les apps Studio Prism de cet appareil ; chaque app ajoute ses propres sections
   (qualité graphique, grille, cotes…) par PrismSettings.init({...}). Même fichier copié tel quel dans chaque app. */
const PrismSettings = (() => {
  const KEY = 'prism.ui', DEF = {theme:'', scale:1, wheel:1, inv:false, motion:true};
  let P = {...DEF}; try { P = {...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}')}; } catch(e){}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch(e){} };
  let C = null, dlg = null;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
  const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.4 7.4 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.4z"/></svg>';

  function applyTheme(){ if (!C?.theme) return; if (P.theme === 'auto') C.theme.set(mq.matches ? 'dark' : 'light'); }
  mq.addEventListener?.('change', applyTheme);
  function applyUI(){
    const r = document.documentElement;
    r.style.setProperty('--prism-ui', P.scale); r.classList.toggle('prism-big', P.scale > 1); r.classList.toggle('prism-still', !P.motion);
  }
  function css(){
    if (document.getElementById('prismSetCss')) return;
    const s = document.createElement('style'); s.id = 'prismSetCss';
    s.textContent = `
.prism-gear{display:inline-grid;place-items:center}.prism-gear svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linejoin:round}
.prism-set-bg{position:fixed;inset:0;z-index:9000;background:rgba(10,16,28,.38);display:grid;place-items:center;padding:16px}
.prism-set{width:min(860px,100%);height:min(86vh,720px);display:flex;flex-direction:column;animation:prismIn .22s cubic-bezier(.2,.8,.2,1);background:var(--panel,#fff);color:var(--ink,#141a24);border:1px solid var(--line,#dde3ec);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.28);font:14px/1.45 var(--f-body,system-ui,sans-serif);overflow:hidden}
.prism-set header{display:flex;align-items:center;gap:10px;padding:16px 18px 12px;border-bottom:1px solid var(--line,#dde3ec)}
.prism-set header h3{margin:0;font:700 18px var(--f-display,inherit);flex:1}.prism-set header small{display:block;color:var(--mut,#6b7686);font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
.prism-set .x{width:34px;height:34px;border:1px solid var(--line,#dde3ec);border-radius:9px;background:transparent;color:inherit;font-size:18px;cursor:pointer}
.prism-set .mid{display:flex;flex:1;min-height:0}
.prism-set nav{flex:none;width:188px;padding:12px 10px;border-right:1px solid var(--line,#dde3ec);display:flex;flex-direction:column;gap:2px;overflow:auto}
.prism-set nav button{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;font:600 13px var(--f-body,inherit);padding:8px 10px;border-radius:8px;cursor:pointer;transition:background .15s,color .15s,transform .15s}
.prism-set nav button:hover{background:color-mix(in srgb,var(--line,#dde3ec) 50%,transparent)}.prism-set nav button.on{background:color-mix(in srgb,var(--accent,#0B57D0) 12%,transparent);color:var(--accent,#0B57D0);transform:translateX(2px)}
.prism-set .bd{overflow:auto;padding:6px 22px 22px;flex:1;scroll-behavior:smooth;overscroll-behavior:contain}
.prism-set button,.prism-set label,.prism-set input,.prism-set select{-webkit-tap-highlight-color:transparent}
.prism-set button:focus,.prism-set input:focus{outline:none}.prism-set button:focus-visible,.prism-set select:focus-visible{outline:2px solid var(--accent,#0B57D0);outline-offset:2px}
.prism-set .sw input:focus-visible+i{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent,#0B57D0) 35%,transparent)}
@keyframes prismOut{to{opacity:0}}@keyframes prismDlgOut{to{opacity:0;transform:translateY(8px) scale(.98)}}.prism-set-bg.out{animation:prismOut .16s ease forwards;pointer-events:none}.prism-set-bg.out .prism-set{animation:prismDlgOut .16s ease forwards}
@keyframes prismIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes prismPop{0%{transform:scale(1)}40%{transform:scale(1.18)}100%{transform:scale(1)}}
.prism-set .sw.pop i::after{animation:prismPop .28s ease}
.prism-set .seg{position:relative}.prism-set .seg .pill{position:absolute;top:3px;bottom:3px;left:0;width:0;border-radius:8px;background:var(--panel,#fff);box-shadow:0 1px 3px rgba(0,0,0,.18);transition:transform .25s cubic-bezier(.3,.9,.3,1),width .25s cubic-bezier(.3,.9,.3,1);pointer-events:none}
.prism-set .seg button{position:relative;z-index:1;transition:color .2s}.prism-set .seg button.on{background:transparent;box-shadow:none}
.prism-set .row{transition:background .15s;padding-left:6px;padding-right:6px;border-radius:8px}.prism-set .row:hover{background:color-mix(in srgb,var(--line,#dde3ec) 22%,transparent)}
.prism-set .row>span{flex:1}.prism-set h4{scroll-margin-top:6px}
@media (max-width:700px){.prism-set nav{display:none}}
.prism-set h4{margin:16px 0 6px;font:700 11px var(--f-body,inherit);letter-spacing:.08em;text-transform:uppercase;color:var(--mut,#6b7686)}
.prism-set .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid color-mix(in srgb,var(--line,#dde3ec) 60%,transparent)}
.prism-set .row>span{min-width:0}.prism-set .row>span small{display:block;color:var(--mut,#6b7686);font-size:12px}
.prism-set .seg{display:inline-flex;flex-wrap:wrap;gap:4px;background:color-mix(in srgb,var(--line,#dde3ec) 55%,transparent);padding:3px;border-radius:10px;flex:none}
.prism-set .seg button{border:0;background:transparent;color:inherit;font:600 12.5px var(--f-body,inherit);padding:6px 10px;border-radius:8px;cursor:pointer;min-height:30px}
.prism-set .seg button.on{background:var(--panel,#fff);box-shadow:0 1px 3px rgba(0,0,0,.18);color:var(--accent,#0B57D0)}
.prism-set select{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid var(--line,#dde3ec);background:var(--panel,#fff);color:inherit}
.prism-set .sw{position:relative;width:42px;height:24px;flex:none}.prism-set .sw input{opacity:0;position:absolute;inset:0;margin:0;cursor:pointer}
.prism-set .sw i{position:absolute;inset:0;border-radius:12px;background:var(--line,#ccd);transition:background .2s}.prism-set .sw i::after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:left .22s cubic-bezier(.3,.9,.3,1)}
.prism-set .sw input:checked+i{background:var(--accent,#0B57D0)}.prism-set .sw input:checked+i::after{left:21px}
.prism-set table{width:100%;border-collapse:collapse;font-size:13px}.prism-set td{padding:4px 0;border-bottom:1px solid color-mix(in srgb,var(--line,#dde3ec) 50%,transparent)}
.prism-set kbd{display:inline-block;min-width:22px;text-align:center;font:600 12px ui-monospace,monospace;padding:2px 6px;border:1px solid var(--line,#dde3ec);border-bottom-width:2px;border-radius:6px;background:var(--chip,#f3f5f9)}
.prism-set .btnl{border:1px solid var(--line,#dde3ec);background:transparent;color:inherit;font:600 13px var(--f-body,inherit);padding:7px 12px;border-radius:9px;cursor:pointer}
.prism-set .meta{color:var(--mut,#6b7686);font-size:12px}
html.prism-still *,html.prism-still *::before,html.prism-still *::after{transition-duration:0s!important;animation-duration:0s!important;animation-iteration-count:1!important;scroll-behavior:auto!important}
@media (max-width:560px){.prism-set .row{flex-direction:column;align-items:flex-start}}
${C?.scaleSel ? `${C.scaleSel}{zoom:var(--prism-ui,1)}` : ''}`;
    document.head.appendChild(s);
  }
  function gearBtns(){
    for (const id of C.anchors || ['userBtn', 'homeUser']){
      const a = document.getElementById(id); if (!a || a.previousElementSibling?.classList.contains('prism-gear')) continue;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ib prism-gear'; b.title = 'Réglages'; b.setAttribute('aria-label', 'Réglages'); b.innerHTML = GEAR;
      b.onclick = e => { e.stopPropagation(); open(); }; a.parentNode.insertBefore(b, a);
    }
  }
  const seg = (k, val, opts) => `<span class="seg" data-k="${k}">${opts.map(([v, n]) => `<button type="button" data-v="${h(v)}" class="${String(val) === String(v) ? 'on' : ''}">${h(n)}</button>`).join('')}</span>`;
  const sw = (k, on) => `<label class="sw"><input type="checkbox" data-k="${k}"${on ? ' checked' : ''}><i></i></label>`;
  const row = (label, sub, ctl) => `<div class="row"><span>${h(label)}${sub ? `<small>${h(sub)}</small>` : ''}</span>${ctl}</div>`;
  function field(f, i, j){
    const k = `f${i}_${j}`, v = f.get();
    if (f.type === 'seg') return row(f.label, f.sub, seg(k, v, f.options));
    if (f.type === 'switch') return row(f.label, f.sub, sw(k, v));
    if (f.type === 'select') return row(f.label, f.sub, `<select data-k="${k}">${f.options.map(([o, n]) => `<option value="${h(o)}"${String(o) === String(v) ? ' selected' : ''}>${h(n)}</option>`).join('')}</select>`);
    return '';
  }
  function build(){
    const cur = P.theme || C.theme?.get?.() || 'light', S = C.sections || [], K = C.shortcuts?.() || [];
    const sec = (t, inner) => `<section class="ps-sec"><h4>${h(t)}</h4>${inner}</section>`;
    const parts = [
      ['Affichage', `${C.theme ? row('Thème', P.theme === 'auto' ? 'Suit le réglage de l\'appareil' : '', seg('theme', cur, [['light', 'Clair'], ['dark', 'Sombre'], ['auto', 'Auto']])) : ''}
      ${row('Taille de l\'interface', 'Boutons, menus et textes ; la vue 3D n\'est pas agrandie', seg('scale', P.scale, [[1, 'Normale'], [1.15, 'Grande'], [1.3, 'Très grande']]))}
      ${row('Animations', 'Désactiver pour les appareils lents ou par confort', sw('motion', P.motion))}`],
      ['Souris et zoom', `${row('Vitesse du zoom à la molette', '', seg('wheel', P.wheel, [[0.6, 'Lente'], [1, 'Normale'], [1.6, 'Rapide']]))}${row('Inverser le sens du zoom', '', sw('inv', P.inv))}`],
      ...S.map((x, i) => [x.title, x.fields.map((f, j) => field(f, i, j)).join('')]),
      ...(K.length ? [['Raccourcis clavier', `<table>${K.map(([k, n]) => `<tr><td>${k.split('+').map(x => `<kbd>${h(x)}</kbd>`).join(' + ')}</td><td>${h(n)}</td></tr>`).join('')}</table>`]] : []),
      ['À propos', `<div class="row"><span>${h(C.app)}<small>Mise à jour du ${h(new Date(document.lastModified).toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'}))}</small></span>${C.clearCache ? '<button type="button" class="btnl" data-k="cache">Vider le cache local</button>' : ''}</div>
      ${C.clearCache ? `<p class="meta">${h(C.cacheNote || 'Efface les données téléchargées gardées sur cet appareil (elles seront rechargées). Vos projets ne sont pas touchés.')}</p>` : ''}`]];
    return `<div class="prism-set" role="dialog" aria-modal="true" aria-label="Réglages"><header><div style="flex:1"><small>${h(C.app)}</small><h3>Réglages</h3></div><button class="x" type="button" aria-label="Fermer">×</button></header>
      <div class="mid"><nav aria-label="Sections">${parts.map(([t], i) => `<button type="button" data-sec="${i}"${i ? '' : ' class="on"'}>${h(t)}</button>`).join('')}</nav><div class="bd">${parts.map(([t, inner]) => sec(t, inner)).join('')}</div></div></div>`;
  }
  const strip = x => x.replace(/ class="on"| checked| selected(?==|>| )/g, '');
  /* pastille glissante des sélecteurs : posée sans transition au premier affichage (plus de glissement depuis la gauche), recalculée si la taille change (police, échelle, fenêtre) */
  let pillRO = null;
  function pills(){ dlg.querySelectorAll('.seg').forEach(g => { let pl = g.querySelector('.pill'), fresh = false; if (!pl){ pl = document.createElement('i'); pl.className = 'pill'; pl.style.transition = 'none'; g.prepend(pl); fresh = true; }
    const b = g.querySelector('button.on'); if (b){ pl.style.width = b.offsetWidth + 'px'; pl.style.transform = `translateX(${b.offsetLeft}px)`; } else pl.style.width = '0';
    if (fresh) requestAnimationFrame(() => requestAnimationFrame(() => { pl.style.transition = ''; })); });
    if (!pillRO && window.ResizeObserver){ pillRO = new ResizeObserver(() => { if (dlg && !dlg.hidden){ dlg.querySelectorAll('.seg .pill').forEach(pl => pl.style.transition = 'none'); pills(); requestAnimationFrame(() => dlg.querySelectorAll('.seg .pill').forEach(pl => pl.style.transition = '')); } }); pillRO.observe(dlg); } }
  function wire(){
    dlg.querySelector('.x').onclick = close;
    dlg.querySelectorAll('.seg').forEach(g => g.onclick = e => { const b = e.target.closest('button'); if (!b) return; set(g.dataset.k, b.dataset.v); });
    dlg.querySelectorAll('input[type=checkbox]').forEach(c => c.onchange = () => { const l = c.closest('.sw'); l.classList.remove('pop'); void l.offsetWidth; l.classList.add('pop'); set(c.dataset.k, c.checked); });
    dlg.querySelectorAll('select').forEach(c => c.onchange = () => set(c.dataset.k, c.value));
    const bd = dlg.querySelector('.bd'), secs = [...dlg.querySelectorAll('.ps-sec')], navs = [...dlg.querySelectorAll('nav button')];
    navs.forEach((n, i) => n.onclick = () => bd.scrollTo({top:secs[i].offsetTop - bd.offsetTop - 4}));
    bd.onscroll = () => { let k = 0; secs.forEach((x, i) => { if (x.offsetTop - bd.offsetTop - 12 <= bd.scrollTop) k = i; }); if (bd.scrollTop + bd.clientHeight >= bd.scrollHeight - 4) k = secs.length - 1; navs.forEach((n, i) => n.classList.toggle('on', i === k)); };
    const cb = dlg.querySelector('[data-k="cache"]'); if (cb) cb.onclick = async () => { cb.disabled = true; cb.textContent = 'Nettoyage…'; try { await C.clearCache(); cb.textContent = 'Cache vidé ✓'; } catch(e){ cb.textContent = 'Échec'; } };
    pills();
  }
  function render(){
    const html = build();
    if (dlg.firstChild && dlg._sig === strip(html)){   // même structure : mise à jour sur place (animations, pas de saut de défilement)
      const t = document.createElement('div'); t.innerHTML = html;
      const o = dlg.querySelectorAll('.seg button, nav button'), n = t.querySelectorAll('.seg button, nav button');
      o.forEach((b, i) => { if (b.closest('nav')) return; b.classList.toggle('on', n[i].classList.contains('on')); });
      dlg.querySelectorAll('input[type=checkbox]').forEach((c, i) => c.checked = t.querySelectorAll('input[type=checkbox]')[i].checked);
      dlg.querySelectorAll('select').forEach((c, i) => c.value = t.querySelectorAll('select')[i].value);
      pills(); requestAnimationFrame(pills); return;
    }
    const top = dlg.querySelector('.bd')?.scrollTop || 0; dlg._sig = strip(html); dlg.innerHTML = html; wire();
    const bd = dlg.querySelector('.bd'); bd.style.scrollBehavior = 'auto'; bd.scrollTop = top; bd.style.scrollBehavior = '';
  }
  function set(k, v){
    if (k === 'theme'){ P.theme = v; save(); if (v === 'auto') applyTheme(); else C.theme.set(v); }
    else if (k === 'scale'){ P.scale = +v; save(); applyUI(); C.onResize?.(); }
    else if (k === 'wheel'){ P.wheel = +v; save(); }
    else if (k === 'inv'){ P.inv = !!v; save(); }
    else if (k === 'motion'){ P.motion = !!v; save(); applyUI(); }
    else { const [i, j] = k.slice(1).split('_').map(Number), f = C.sections[i].fields[j]; f.set(f.type === 'seg' && typeof f.get() === 'number' ? +v : v); }
    render();
  }
  function open(){ if (!dlg){ dlg = document.createElement('div'); dlg.className = 'prism-set-bg'; dlg.onclick = e => { if (e.target === dlg) close(); }; document.body.appendChild(dlg); }
    dlg.classList.remove('out'); dlg.hidden = false; dlg._sig = ''; render(); document.addEventListener('keydown', esc, true); }
  function close(){ if (dlg){ const d = dlg; d.classList.add('out'); setTimeout(() => { if (d.classList.contains('out')){ d.hidden = true; d.classList.remove('out'); } }, matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 160); } document.removeEventListener('keydown', esc, true); }
  function esc(e){ if (e.key === 'Escape'){ e.stopPropagation(); close(); } }
  return {
    init(cfg){ C = cfg; css(); applyUI(); applyTheme(); gearBtns(); },
    /* thème choisi ailleurs dans l'app (menu Calques, bouton lune…) : on quitte le mode Auto */
    themeChanged(){ if (P.theme === 'auto'){ P.theme = ''; save(); } },
    wheel:() => ({k:P.wheel || 1, inv:!!P.inv}), open, prefs:() => ({...P})
  };
})();
window.PrismSettings = PrismSettings;
