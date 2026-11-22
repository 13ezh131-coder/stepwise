// Local search: no API keys, network requests or paid model calls.
const groups = [
  ['steam','стим'], ['macbook','макбук','макбуке','макбука','mac','мак','macos'],
  ['windows','виндовс','виндоус','винда'], ['docker','докер'],
  ['компьютер','компьютера','компьютере','пк','pc'],
  ['ноутбук','ноутбука','ноутбуке','laptop'],
  ['монитор','монитора','монитору','мониторе','экран','дисплей','display'],
  ['клавиатура','клавиатуру','клавиатуры','keyboard'],
  ['телефон','телефона','смартфон','смартфона','phone'],
  ['фото','фотография','фотографии','фотографий','снимки','снимков'],
  ['резервная','резервную','бэкап','бекап','backup'],
  ['установить','устанавливаем','установка','установке','скачать','загрузить','инсталляция'],
  ['собрать','собираем','сборка','соберите'],
  ['подключить','подключаем','подключение','подсоединить'],
  ['очистить','очищаем','очистка','почистить','чистка'],
  ['готовить','готовим','приготовить','сделать'],
  ['учеба','учебе','учебный','учебные','обучение'],
  ['контрольная','контрольной','экзамен','экзамену','тест'],
  ['йогурт','йогуртом','йогурта'], ['овсянка','овсянку','овсяные'],
  ['растения','растениями','растений','цветы','цветами'],
  ['видеозвонок','видеозвонком','видеозвонку','видеосвязь','созвон','звонок'],
  ['инструкция','инструкции','руководство','туториал','tutorial']
];
const normalize = value => String(value||'').normalize('NFKC').toLowerCase().replaceAll('ё','е');
const words = value => normalize(value).match(/[\p{L}\p{N}]+/gu)||[];
const aliases = new Map(groups.flatMap((group,index)=>group.map(word=>[word,'@'+index])));
const stops = new Set(['как','на','в','во','с','со','и','а','к','по','для','из','это','мне','мой','свою','the','a','to','on','how']);
const keyboard = Object.fromEntries([..."qwertyuiop[]asdfghjkl;'zxcvbnm,."].map((letter,i)=>[letter,[...'йцукенгшщзхъфывапролджэячсмитьбю'][i]]));
function distance(a,b){
  if(Math.abs(a.length-b.length)>2)return 3;
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}
  return row[b.length];
}
function match(q,word,expand=true){
  if(q===word)return 1;
  if(aliases.has(q)&&aliases.get(q)===aliases.get(word))return .95;
  if(expand&&aliases.has(word)){const group=groups[Number(aliases.get(word).slice(1))];const value=Math.max(...group.map(alias=>match(q,alias,false)))*.9;if(value)return value;}
  if(q.length>=4&&q.length===word.length){for(let i=0;i<q.length-1;i++){if(q.slice(0,i)+q[i+1]+q[i]+q.slice(i+2)===word)return .65;}}
  if(q.length>=3&&word.startsWith(q))return .85;
  if(q.length>=5&&word.length>=5&&q.slice(0,Math.min(6,q.length-1,word.length-1))===word.slice(0,Math.min(6,q.length-1,word.length-1)))return .75;
  if(q.length>=4&&word.length>=4){const d=distance(q,word);if(d<= (q.length>=8?2:1))return .6;}
  return 0;
}
function score(guide,tokens){
  const fields=[[guide.title,5],[guide.category,2],[guide.description,2],[guide.outcome,1],[(guide.materials||[]).join(' '),1],[(guide.steps||[]).map(s=>s.title+' '+s.text+' '+(s.tip||'')).join(' '),.7]];
  const indexed=fields.map(([value,weight])=>[words(value),weight]);
  let total=0;
  for(const token of tokens){let best=0;for(const [terms,weight] of indexed)for(const word of terms)best=Math.max(best,match(token,word)*weight);if(!best)return 0;total+=best;}
  return total;
}
export function searchGuides(guides,query){
  const tokens=words(String(query||'').slice(0,300)).filter(x=>!stops.has(x)).slice(0,15);
  if(!tokens.length)return guides;
  const corrected=words(normalize(query).replace(/[a-z\[\];',.]/g,c=>keyboard[c]||c)).filter(x=>!stops.has(x)).slice(0,15);
  return guides.map((guide,index)=>({guide,index,score:Math.max(score(guide,tokens),corrected.length?score(guide,corrected)*.8:0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.guide);
}
