import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

// One transaction preserves the order and relationship of guides and steps.
export async function openStorage(dataDir, seedFile) {
  await mkdir(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'stepwise.sqlite'));
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS guides (id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS steps (guide_id TEXT NOT NULL REFERENCES guides(id) ON DELETE CASCADE, position INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(guide_id, position));
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, guide_id TEXT NOT NULL REFERENCES guides(id), data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_guide ON events(guide_id);`);
  const guideInsert = db.prepare('INSERT INTO guides VALUES (?, ?, ?)');
  const stepInsert = db.prepare('INSERT INTO steps VALUES (?, ?, ?)');
  const eventInsert = db.prepare('INSERT INTO events VALUES (?, ?, ?)');
  const save = store => {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('DELETE FROM events; DELETE FROM steps; DELETE FROM guides; DELETE FROM profile;');
      db.prepare('INSERT INTO profile VALUES (1, ?)').run(JSON.stringify(store.author));
      store.guides.forEach((guide, position) => {
        const { steps, ...fields } = guide;
        guideInsert.run(guide.id, position, JSON.stringify(fields));
        steps.forEach((step, index) => stepInsert.run(guide.id, index, JSON.stringify(step)));
      });
      store.events.forEach(event => eventInsert.run(event.id, event.guideId, JSON.stringify(event)));
      db.prepare("INSERT OR REPLACE INTO metadata VALUES ('initialized', '1')").run();
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  try {
    if (!db.prepare("SELECT value FROM metadata WHERE key='initialized'").get()) {
      let initial;
      const legacy = join(dataDir, 'store.json');
      try {
        initial = JSON.parse(await readFile(legacy, 'utf8'));
        await copyFile(legacy, join(dataDir, `store.before-sqlite-${Date.now()}.json`));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        initial = JSON.parse(await readFile(seedFile, 'utf8'));
      }
      save(initial);
    }
    const stepsQuery = db.prepare('SELECT data FROM steps WHERE guide_id=? ORDER BY position');
    const store = {
      author: JSON.parse(db.prepare('SELECT data FROM profile WHERE id=1').get().data),
      guides: db.prepare('SELECT id, data FROM guides ORDER BY position').all().map(row => ({...JSON.parse(row.data), steps: stepsQuery.all(row.id).map(step => JSON.parse(step.data))})),
      events: db.prepare('SELECT data FROM events ORDER BY rowid').all().map(row => JSON.parse(row.data))
    };
    // Add editorial examples once; never replace a user's guide or create events.
    const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
    let changed = false;
    for (const guide of catalog) {
      const index=store.guides.findIndex(existing=>existing.id===guide.id);
      if(index<0){store.guides.push(guide);changed=true;}
      else if(!store.guides[index].authorId && store.guides[index].author==='Редакция STEPWISE' && JSON.stringify(store.guides[index])!==JSON.stringify(guide)){
        store.guides[index]=guide;changed=true;
      }
    }
    const enrich = !db.prepare("SELECT value FROM metadata WHERE key='step-images-v1'").get();
    if(enrich){
      for(const guide of store.guides){
        const category={'Технологии':'Компьютеры','Разработка':'Компьютеры','Учёба':'Учёба и навыки','Быт':'Дом и быт'}[guide.category]||guide.category;
        const sample=catalog.find(g=>g.category===category)||catalog[0];
        guide.steps=guide.steps.map((step,index)=>step.image?step:{...step,image:sample.steps[index%sample.steps.length].image,imageCredit:'Unsplash · тематическая иллюстрация, не снимок конкретного действия'});
      }
      changed=true;
    }
    if(changed)save(store);
    if(enrich)db.prepare("INSERT INTO metadata VALUES ('step-images-v1','1')").run();
    return { store, save, close: () => db.close() };
  } catch (error) { db.close(); throw error; }
}
