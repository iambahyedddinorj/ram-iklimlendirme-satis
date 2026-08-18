// Oturumları SQLite'ta tutan depo
//
// express-session'ın varsayılan deposu oturumları sunucunun belleğinde tutar.
// Uygulama her yeniden başladığında — yani her dağıtımda — herkes giriş
// ekranına düşer. Bu depo oturumları uygulamanın kendi veritabanına yazar,
// böylece sunucu yeniden başlasa da açık oturumlar yerinde kalır.
//
// Çerezde maxAge tanımlı değil; tarayıcı kapanınca oturum yine bitiyor.
// Buradaki süre yalnızca veritabanında ölü satır birikmesin diye var.
const { Store } = require('express-session');

const VARSAYILAN_OMUR = 1000 * 60 * 60 * 24 * 7; // 7 gün

module.exports = function oturumDeposuKur(db, q) {
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    veri TEXT NOT NULL,
    biter_at INTEGER NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_biter ON sessions(biter_at)');

  function bitisZamani(sess) {
    const cerez = sess && sess.cookie;
    if (cerez && cerez.expires) return new Date(cerez.expires).getTime();
    return Date.now() + ((cerez && cerez.originalMaxAge) || VARSAYILAN_OMUR);
  }

  class SqliteOturumDeposu extends Store {
    constructor() {
      super();
      this.temizle();
      const t = setInterval(() => this.temizle(), 1000 * 60 * 60); // saatte bir
      t.unref?.();
    }

    temizle() {
      try { q.run('DELETE FROM sessions WHERE biter_at < ?', Date.now()); } catch {}
    }

    get(sid, cb) {
      try {
        const satir = q.get('SELECT veri, biter_at FROM sessions WHERE sid=?', sid);
        if (!satir) return cb(null, null);
        if (satir.biter_at < Date.now()) {
          q.run('DELETE FROM sessions WHERE sid=?', sid);
          return cb(null, null);
        }
        cb(null, JSON.parse(satir.veri));
      } catch (e) { cb(e); }
    }

    set(sid, sess, cb) {
      try {
        const veri = JSON.stringify(sess);
        const biter = bitisZamani(sess);
        q.run('INSERT INTO sessions(sid,veri,biter_at) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET veri=?, biter_at=?',
          sid, veri, biter, veri, biter);
        cb && cb(null);
      } catch (e) { cb && cb(e); }
    }

    destroy(sid, cb) {
      try { q.run('DELETE FROM sessions WHERE sid=?', sid); cb && cb(null); }
      catch (e) { cb && cb(e); }
    }

    touch(sid, sess, cb) {
      try { q.run('UPDATE sessions SET biter_at=? WHERE sid=?', bitisZamani(sess), sid); cb && cb(null); }
      catch (e) { cb && cb(e); }
    }

    length(cb) {
      try { cb(null, q.get('SELECT COUNT(*) c FROM sessions').c); } catch (e) { cb(e); }
    }

    clear(cb) {
      try { q.run('DELETE FROM sessions'); cb && cb(null); } catch (e) { cb && cb(e); }
    }
  }

  return new SqliteOturumDeposu();
};
