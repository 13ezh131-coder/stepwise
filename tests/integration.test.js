import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { openStorage } from '../src/storage.js';

test('JSON migration, API writes, restart persistence and private files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stepwise-'));
  const seed = JSON.parse(await readFile(new URL('../data/seed.json', import.meta.url), 'utf8'));
  seed.author.name = 'Migration test';
  await writeFile(join(dir, 'store.json'), JSON.stringify(seed));
  const migrated = await openStorage(dir, new URL('../data/seed.json', import.meta.url));
  assert.deepEqual(migrated.store.guides.slice(0,seed.guides.length).map(g=>({...g,steps:g.steps.map(({image,imageCredit,...s})=>s)})), seed.guides);
  assert.ok(migrated.store.guides.every(g=>g.steps.every(s=>s.image)));
  assert.deepEqual(migrated.store.events, seed.events);
  assert.deepEqual(migrated.store.author, seed.author);
  assert.equal(new Set(migrated.store.guides.map(g=>g.id)).size,migrated.store.guides.length);
  migrated.close();
  let child;
  let base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, STEPWISE_DATA_DIR: dir, PORT: '0' }, stdio: ['ignore','pipe','pipe'] });
    let output = '';
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout: '+output)), 10000);
      child.stderr.on('data', chunk => { output += chunk; });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/localhost:(\d+)/);
        if (match) { base = match[0]; clearTimeout(timer); resolve(); }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
    });
  };
  const stop = async () => { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } };
  let cookie = '';
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { 'content-type':'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: await response.json() };
  };
  try {
    await start();
    assert.equal((await request('/api/health')).status, 200);
    assert.equal((await request('/api/guides','POST',{title:'Guest',steps:[]})).status,401);
    const registered=await request('/api/auth/register','POST',{name:'Alice',email:'alice@example.test',password:'demo-password-1'});
    assert.equal(registered.status,200);
    const aliceCookie=cookie;
    assert.equal((await request('/api/auth/me')).data.user.name,'Alice');
    assert.equal((await request('/api/auth/register','POST',{name:'Duplicate',email:'ALICE@example.test',password:'demo-password-1'})).status,400);
    const profile = await request('/api/profile', 'PUT', { name:'Test author', email:'' });
    assert.equal(profile.status, 200);
    const guide = { title:'Saved instruction', steps:[{title:'First',text:'Do this'},{title:'Second',text:'Do that'}] };
    const created = await request('/api/guides', 'POST', guide);
    assert.equal(created.status, 201);
    const id = created.data.guide.id;
    assert.equal((await request('/api/events','POST',{type:'started',guideId:id})).status,201);
    assert.equal((await request('/api/guides','POST',{title:'Invalid',steps:[]})).status,400);
    assert.equal((await request('/api/events','POST',{type:'started',guideId:'missing'})).status,400);
    assert.equal((await request('/api/uploads','POST',{type:'image/png',data:'bad'})).status,400);
    const upload = await request('/api/uploads','POST',{type:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ZkAAAAASUVORK5CYII='});
    assert.equal(upload.status,201);
    assert.equal((await fetch(base+upload.data.url)).status,200);
    for (const path of ['/.env','/data/store.json','/data/stepwise.sqlite','/server.js','/.git/config','/src/storage.js']) assert.equal((await fetch(base+path)).status,404,path);
    await stop();
    await start();
    assert.equal((await request('/api/profile')).data.author.name,'Test author');
    assert.equal((await request('/api/guides')).data.guides.find(g=>g.id===id).steps.length,2);
    assert.ok((await request('/api/events')).data.events.some(e=>e.guideId===id));
    await request('/api/auth/logout','POST');
    cookie=aliceCookie;
    assert.equal((await request('/api/auth/me')).data.user,null,'Logout revokes session');
    cookie='';
    assert.equal((await request('/api/auth/login','POST',{email:'alice@example.test',password:'incorrect'})).status,400);
    assert.equal((await request('/api/auth/register','POST',{name:'Bob',email:'bob@example.test',password:'demo-password-2'})).status,200);
    assert.equal((await request('/api/events')).data.events.length,0,'Other author analytics hidden');
    assert.equal((await request('/api/guides','POST',{...created.data.guide,title:'Stolen'})).status,403);
    const bob=await request('/api/guides','POST',guide);
    assert.equal(bob.status,201);
    assert.notEqual(bob.data.guide.authorId,created.data.guide.authorId);
    await request('/api/auth/logout','POST');
    assert.equal((await request('/api/auth/login','POST',{email:'alice@example.test',password:'demo-password-1'})).status,200);
    assert.equal((await request('/api/profile')).data.author.name,'Test author');
  } finally { await stop(); await rm(dir,{recursive:true,force:true}); }
});
