import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { join } from 'node:path';
const scrypt = promisify(derive);
export function openAuth(dataDir) {
  const db = new DatabaseSync(join(dataDir, 'stepwise.sqlite'));
  db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);`);
  const digest = token => createHash('sha256').update(token).digest('hex');
  const publicUser = u => u ? {id:u.id,name:u.name,email:u.email} : null;
  return {
    current(req) {
      const token = (req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('stepwise_session='))?.slice(17);
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
      return publicUser(db.prepare('SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE sessions.token=? AND expires>?').get(digest(token),Date.now()));
    },
    async register(input) {
      const email=String(input.email||'').trim().toLowerCase(), name=String(input.name||'').trim(), password=input.password;
      if(!name || name.length>50 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>100 || typeof password!=='string' || password.length<8 || password.length>128) throw new Error('Укажите имя, корректную почту и пароль от 8 до 128 символов.');
      const salt=randomBytes(16).toString('hex'), hash=(await scrypt(password,salt,64)).toString('hex');
      const id=randomUUID();
      try {db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id,email,name,salt,hash);} catch(error) {if(error.code?.includes('CONSTRAINT')) throw new Error('Эта почта уже зарегистрирована.');throw error;}
      return {id,name,email};
    },
    async login(input) {
      const email=String(input.email||'').trim().toLowerCase(), password=input.password;
      if(typeof password!=='string'||password.length>128) throw new Error('Неверная почта или пароль.');
      const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
      const hash=await scrypt(password,u?.salt||'dummy-login-salt',64);
      if(!u || !timingSafeEqual(Buffer.from(u.hash,'hex'),hash)) throw new Error('Неверная почта или пароль.');
      return publicUser(u);
    },
    session(res,user,secure) {
      const token=randomBytes(32).toString('hex');
      db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token),user.id,Date.now()+7*86400000);
      res.setHeader('set-cookie',`stepwise_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure?'; Secure':''}`);
    },
    logout(req,res) {
      const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('stepwise_session='))?.slice(17);
      if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
      res.setHeader('set-cookie','stepwise_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    },
    update(user,name) {db.prepare('UPDATE users SET name=? WHERE id=?').run(name,user.id);return {...user,name};},
    close:()=>db.close()
  };
}
