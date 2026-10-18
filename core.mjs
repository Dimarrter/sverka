export const STATUS = {up:'Подорожало',down:'Подешевело',added:'Новый товар',removed:'Нет в новом',same:'Без изменений',review:'Проверить'};

export function parsePrice(value, mode='auto') {
  if (typeof value === 'number') return check(value);
  if (value == null || String(value).trim()==='') return {error:'Цена не указана'};
  let s=String(value).normalize('NFKC').trim().replace(/\s/g,'').replace(/(?:₽|руб\.?|RUB|USD|EUR|\$|€)$/i,'').replace(/^(?:₽|\$|€)/,'');
  if (!/^[+]?\d[\d.,]*$/.test(s)) return {error:'Не удалось прочитать цену'};
  s=s.replace(/^\+/,'');
  const comma=s.includes(','), dot=s.includes('.');
  let decimal;
  if (mode==='comma') decimal=',';
  else if (mode==='dot') decimal='.';
  else if (comma && dot) decimal=s.lastIndexOf(',')>s.lastIndexOf('.')?',':'.';
  else if (comma||dot) {
    const sep=comma?',':'.', pieces=s.split(sep);
    if(pieces.length===2 && pieces[1].length<=2) decimal=sep;
    else return {error:'Неоднозначный разделитель цены: выберите запятую или точку'};
  }
  if(decimal) {
    const parts=s.split(decimal);
    if(parts.length>2 || (parts.length===2 && !/^\d{1,2}$/.test(parts[1]))) return {error:'Цена должна содержать не более двух знаков после разделителя'};
    const thousands=decimal===','?'.':',';
    if(parts[0].includes(thousands) && !new RegExp('^\\d{1,3}(?:\\'+thousands+'\\d{3})+$').test(parts[0])) return {error:'Некорректная группировка разрядов'};
    s=parts[0].split(thousands).join('')+(parts.length===2?'.'+parts[1]:'');
  }
  return check(Number(s));
}
function check(n) {
  if(!Number.isFinite(n)||n<0||n>1e12) return {error:'Цена вне допустимого диапазона (от 0 до 1 трлн)'};
  const cents=Math.round(n*100);
  if(Math.abs(n*100-cents)>0.001) return {error:'Цена содержит больше двух знаков после запятой'};
  return {cents};
}
export function keyOf(value, ignoreCase=false) {
  let s=String(value??'').normalize('NFC').trim();
  return ignoreCase?s.toLocaleUpperCase('ru'):s;
}
export function buildIndex(rows, map, options={}) {
  const index=new Map(), missing=[];
  for(let i=map.header+1;i<rows.length;i++) {
    const row=rows[i]||[];
    if(row.every(v=>v==null||String(v).trim()==='')) continue;
    const raw=row[map.sku], sku=keyOf(raw,options.ignoreCase);
    const item={sku,name:String(row[map.name]??''),row:i+1,...parsePrice(row[map.price],options.decimal)};
    if(typeof raw==='number' && Math.abs(raw)>=1e14) item.error='Длинный числовой артикул: проверьте точность в исходном XLSX';
    if(!sku) { missing.push({...item,error:'Нет артикула'}); continue; }
    if(!index.has(sku)) index.set(sku,[]);
    index.get(sku).push(item);
  }
  return {index,missing};
}
export function compare(oldRows,newRows,oldMap,newMap,options={}) {
  const before=buildIndex(oldRows,oldMap,options), after=buildIndex(newRows,newMap,options), result=[];
  for(const sku of new Set([...before.index.keys(),...after.index.keys()])) {
    const a=before.index.get(sku)||[], b=after.index.get(sku)||[], x=a[0],y=b[0];
    const out={sku,name:y?.name||x?.name||'',old:x?.cents??null,new:y?.cents??null,delta:null,percent:null,oldRow:a.map(v=>v.row).join(', '),newRow:b.map(v=>v.row).join(', '),notes:[]};
    if(a.length>1) out.notes.push('Повтор артикула в старом файле, строки '+out.oldRow);
    if(b.length>1) out.notes.push('Повтор артикула в новом файле, строки '+out.newRow);
    for(const [items,label] of [[a,'старый'],[b,'новый']]) for(const item of items) if(item.error) out.notes.push(`${label}, строка ${item.row}: ${item.error}`);
    if(out.notes.length) {out.status='review'; if(a.length>1) out.old=null; if(b.length>1) out.new=null;}
    else if(!x) out.status='added';
    else if(!y) out.status='removed';
    else {out.delta=y.cents-x.cents; out.percent=x.cents===0?null:100*out.delta/x.cents; out.status=out.delta>0?'up':out.delta<0?'down':'same';if(x.cents===0 && out.delta!==0) out.notes.push('Процент не рассчитан: старая цена равна нулю');}
    result.push(out);
  }
  for(const [items,label] of [[before.missing,'Старый'],[after.missing,'Новый']]) for(const x of items) result.push({sku:'',name:x.name,old:null,new:null,delta:null,percent:null,oldRow:label==='Старый'?String(x.row):'',newRow:label==='Новый'?String(x.row):'',status:'review',notes:[`${label} файл, строка ${x.row}: нет артикула`]});
  return result;
}
export function summary(rows) {const s=Object.fromEntries(Object.keys(STATUS).map(k=>[k,0]));for(const row of rows)s[row.status]++;return s;}
export function guessHeader(rows) {
  let best=0,score=-1;
  rows.slice(0,15).forEach((r,i)=>{const s=r.reduce((n,c)=>n+(/артикул|sku|код товара|ean|barcode/i.test(String(c))?3:0)+(/цена|price|стоимость/i.test(String(c))?3:0)+(/наименование|название|товар|name/i.test(String(c))?1:0),0);if(s>score){score=s;best=i;}});
  return best;
}
export function guessMap(row,header=0) {
  const find=re=>row.findIndex(x=>re.test(String(x)));
  const sku=find(/артикул|sku|код товара|ean|barcode/i),price=find(/цена|price|стоимость/i),name=find(/наименование|название|name|описание/i);
  return {header,sku:sku>=0?sku:0,price:price>=0?price:Math.min(2,row.length-1),name:name>=0?name:-1};
}
