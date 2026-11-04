/* Studio Prism — compteur de jours de la licence, commun aux applications (en haut à droite de l'écran).
 * Affiché seulement s'il reste 30 jours ou moins avant la fin d'un abonnement à durée définie.
 * Pastille FLOTTANTE (position:fixed) : ne déplace aucun élément de l'application.
 * Usage :  PrismLicenseCountdown.update(expiresAt, "ARCHIPLAN")   // expiresAt : Date, millisecondes ou horodatage Firestore ; null = rien
 *          PrismLicenseCountdown.update(null)                      // masque la pastille
 * Licence expirée : « Licence expirée » reste affiché 7 jours (puis l'app repasse en Free, la pastille disparaît). */
const PrismLicenseCountdown = (() => {
  const DAY = 864e5, GRACE = 7 * DAY;
  let el = null;
  const toMs = (t) => (t == null ? 0 : typeof t.toMillis === 'function' ? t.toMillis() : t instanceof Date ? t.getTime() : Number(t) || 0);
  function node() {
    if (el && el.isConnected) return el;
    el = document.createElement('div');
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.id = 'prism-lic-countdown';
    el.style.cssText = 'position:fixed;top:10px;right:12px;z-index:2147483000;padding:6px 12px;border-radius:999px;font:600 13px/1.2 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none;max-width:60vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    document.body.appendChild(el); return el;
  }
  function update(expiresAt, label) {
    const e = toMs(expiresAt), now = Date.now();
    if (!e || e - now > 30 * DAY || now - e > GRACE) { if (el) el.hidden = true; return null; }
    const n = node(), d = Math.ceil((e - now) / DAY), name = label ? label + ' · ' : '';
    n.hidden = false;
    if (e < now) { n.textContent = name + 'Licence expirée'; n.style.background = '#c0392b'; n.style.color = '#fff'; }
    else { n.textContent = name + (d <= 0 ? 'Expire aujourd’hui' : `${d} jour${d > 1 ? 's' : ''} restant${d > 1 ? 's' : ''}`); n.style.background = d <= 7 ? '#e0a100' : '#0877B9'; n.style.color = d <= 7 ? '#2b1f00' : '#fff'; }
    return d;
  }
  return { update };
})();
if (typeof module !== 'undefined') module.exports = PrismLicenseCountdown;
