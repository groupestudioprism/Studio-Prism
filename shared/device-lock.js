const Lock = {
  key: uid => 'sp.lock.' + uid,
  get(uid){ return store.get(this.key(uid)); },
  set(uid, v){ store.set(this.key(uid), v); },
  clear(uid){ store.del(this.key(uid)); },
  async setPin(uid, pin){ const salt = randB64(16); const prev = this.get(uid) || {}; const rec = {...prev, declined:false, salt, iter:200000, pin:await pbkdf2(pin, salt, 200000), failed:0}; delete rec.rpin; this.set(uid, rec); return rec; },
  async check(uid, pin){ const l = this.get(uid); if (!l?.pin) return false; const ok = await pbkdf2(pin, l.salt, l.iter) === l.pin; l.failed = ok ? 0 : (l.failed || 0) + 1; this.set(uid, l); return ok; },
};
/* Face ID / empreinte partagés entre toutes les apps Studio Prism (*.studio-prism.com) :
   la clé d'accès est créée pour le domaine studio-prism.com et son identifiant (non secret) est gardé dans un cookie commun aux apps. */
const SP_DOMAIN = /(^|\.)studio-prism\.com$/.test(location.hostname) ? 'studio-prism.com' : null;
const BioShare = {
  name: uid => 'sp_bio_' + String(uid).replace(/[^A-Za-z0-9]/g, '').slice(0, 40),
  get(uid){ const m = document.cookie.match(new RegExp('(?:^|; )' + this.name(uid) + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; },
  set(uid, id){ if (!SP_DOMAIN) return; document.cookie = `${this.name(uid)}=${encodeURIComponent(id)}; domain=.${SP_DOMAIN}; path=/; max-age=${60 * 60 * 24 * 400}; secure; samesite=lax`; },
  del(uid){ if (!SP_DOMAIN) return; document.cookie = `${this.name(uid)}=; domain=.${SP_DOMAIN}; path=/; max-age=0; secure; samesite=lax`; },
  sync(uid){ const l = Lock.get(uid); if (!l) return; const c = this.get(uid); if (c && (!l.bio || !l.bioShared)){ Lock.set(uid, {...l, bio:c, bioShared:true}); } },   // activé dans une autre app : repris ici
};
const Bio = {
  label(){
    const ua = navigator.userAgent, p = navigator.platform || '';
    if (/iPhone|iPad|iPod/.test(ua) || (p === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'Face ID ou Touch ID';
    if (/Mac/.test(p)) return 'Touch ID';
    if (/Android/.test(ua)) return 'l\'empreinte ou la reconnaissance faciale';
    if (/Win/.test(p)) return 'Windows Hello';
    return 'la biométrie de l\'appareil';
  },
  async available(){ if (!window.PublicKeyCredential || !window.isSecureContext) return false; try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch(e){ return true; } },   // en cas de doute on propose : l'appareil dira lui-même s'il ne sait pas faire
  // Safari (Mac, iPhone, iPad) n'ouvre Face ID / Touch ID qu'après un geste de l'utilisateur : pas de demande automatique, on attend le bouton
  autoOK(){ const ua = navigator.userAgent; return !(/iPhone|iPad|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Edg|Android/.test(ua)) || ((navigator.platform || '') === 'MacIntel' && navigator.maxTouchPoints > 1)); },
  async enroll(u){
    const cred = await navigator.credentials.create({publicKey:{
      challenge:crypto.getRandomValues(new Uint8Array(32)), rp:{name:'Studio Prism', ...(SP_DOMAIN ? {id:SP_DOMAIN} : {})},
      user:{id:enc.encode(u.uid).slice(0, 64), name:u.email, displayName:`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email},
      pubKeyCredParams:[{type:'public-key', alg:-7}, {type:'public-key', alg:-257}],
      authenticatorSelection:{authenticatorAttachment:'platform', userVerification:'required', residentKey:'discouraged'},
      timeout:60000, attestation:'none'}});
    const id = b64(cred.rawId); BioShare.set(u.uid, id); return id;
  },
  async verify(credId, shared){
    const a = await navigator.credentials.get({publicKey:{...(shared && SP_DOMAIN ? {rpId:SP_DOMAIN} : {}), challenge:crypto.getRandomValues(new Uint8Array(32)), allowCredentials:[{type:'public-key', id:unb64(credId), transports:['internal', 'hybrid']}], userVerification:'required', timeout:60000}});
    return !!a;
  },
};

