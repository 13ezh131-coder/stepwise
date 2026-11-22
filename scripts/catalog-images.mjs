import { readFile, writeFile, mkdir } from 'node:fs/promises';
const pools = {
  'Компьютеры':['1496181133206-80ce9b88a853','1517336714731-489689fd1ca8','1519389950473-47ba0277781c'],
  'Мониторы и периферия':['1527443224154-c4a3942d3acf','1587829741301-dc798b83add3','1527864550417-7fd91fc51a46'],
  'Техника и гаджеты':['1511707171634-5f897ff02aa9','1512499617640-c74ae3a79d37','1516321318423-f06f85e504b3'],
  'Кухня и выпечка':['1490645935967-10de6ba17061','1512621776951-a57141f2eefd','1505253758473-96b7015fcd40'],
  'Дом и быт':['1494438639946-1ebd1d20bf85','1484154218962-a197022b5858','1416879595882-3373a0480b5b'],
  'Учёба и навыки':['1455390582262-044cdead277a','1434030216411-0b793f4b4173','1513258496099-48168024aec0']
};
await mkdir('assets/editorial',{recursive:true});
await Promise.all(Object.values(pools).flat().map(async id=>{
  const response=await fetch(`https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1000&q=78`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error(`Image failed: ${id}, ${response.status}`);
  await writeFile(`assets/editorial/${id}.jpg`,Buffer.from(await response.arrayBuffer()));
}));
const path='data/catalog.json',catalog=JSON.parse(await readFile(path,'utf8'));
for(const guide of catalog){
  const pool=pools[guide.category];
  guide.coverImage=`/assets/editorial/${pool[0]}.jpg`;
  guide.steps.forEach((step,index)=>{
    step.image=`/assets/editorial/${pool[index%pool.length]}.jpg`;
    step.imageAlt=`Тематическая иллюстрация: ${step.title}`;
    step.imageCredit='Unsplash · тематическая иллюстрация, не снимок конкретного действия';
  });
}
await writeFile(path,JSON.stringify(catalog,null,2)+'\n');
console.log(`${catalog.length} guides, ${catalog.reduce((n,g)=>n+g.steps.length,0)} illustrated steps, 18 local photos`);
