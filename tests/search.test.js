import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {searchGuides} from '../src/search.js';
const catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
const steam={id:'steam',published:true,title:'Как скачать и установить Steam на MacBook',description:'Установка приложения',steps:[]};
const guides=[...catalog,steam];
for(const query of ['стим','СТИМ','steam','установить стим на макбуке','макбук стим','стми','cnbv']){
  test(`Search: ${query}`,()=>assert.equal(searchGuides(guides,query)[0]?.id,'steam'));
}
for(const [query,id] of [['бэкап файлов','backup-files'],['почистить клавиатуру','keyboard-clean'],['овсянка','overnight-oats'],['фруктовый йогурт','fruit-salad'],['собрать рюкзак','travel-bag'],['конспект','learning-notes']]){
  test(`General search: ${query}`,()=>assert.ok(searchGuides(guides,query).some(g=>g.id==='editorial-'+id)));
}
test('Empty, irrelevant, punctuation and multiple terms',()=>{
  assert.deepEqual(searchGuides(guides,''),guides);
  assert.deepEqual(searchGuides(guides,'несуществующаяабракадабра'),[]);
  assert.equal(searchGuides(guides,'Steam!!!')[0].id,'steam');
  assert.equal(searchGuides(guides,'steam йогурт').length,0);
});
test('New user content and searching materials and step text',()=>{
  const custom={id:'user',title:'Мой опыт',description:'',materials:['Микрофибра'],steps:[{title:'Подготовка',text:'Нужен термометр'}]};
  assert.equal(searchGuides([custom],'микрофибра')[0].id,'user');
  assert.equal(searchGuides([custom],'термометр')[0].id,'user');
});
test('At least three guides per category, all step images exist locally',async()=>{
  const categories=new Set(catalog.map(g=>g.category));assert.equal(categories.size,6);
  for(const category of categories)assert.ok(catalog.filter(g=>g.category===category).length>=3);
  for(const guide of catalog){assert.equal(guide.steps.length,5);for(const step of guide.steps){assert.ok(step.title&&step.text&&step.image);await access(new URL('..'+step.image,import.meta.url));}}
});
