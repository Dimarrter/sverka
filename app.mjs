import {STATUS,compare,summary,guessHeader,guessMap} from './core.mjs';
import {MAX_BYTES,decodeCsv,csvRows,readXlsx,exportXlsx} from './io.mjs';
const $=id=>document.getElementById(id), state={old:null,new:null}, tokens={old:0,new:0};
let report=[],filter='all',limit=50;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const money=n=>n==null?'—':format.format(n/100);
const plural=(n,one,few,many)=>n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many;
const sideTitle=s=>s==='old'?'Старый прайс':'Новый прайс';
function message(text,good=false){$('message').hidden=!text;$('message').textContent=text;$('message').className='message'+(good?' success':'');}
function invalidate(){report=[];$('results').hidden=true;syncButton();}
function syncButton(){$('compare').disabled=!state.old||!state.new||!!state.old.loading||!!state.new.loading;}
function options(values,current){return values.map(([value,label])=>`<option value="${esc(value)}"${String(value)===String(current)?' selected':''}>${esc(label)}</option>`).join('');}
function activeRows(s){return s.sheets[s.sheet].rows;}
function setMap(s){const rows=activeRows(s);const header=guessHeader(rows);s.map=guessMap(rows[header]||[],header);}
function card(side){
  const s=state[side], node=document.querySelector(`[data-card="${side}"]`),title=sideTitle(side);
  const head=`<div class="card-head"><strong><span class="step-num">${side==='old'?'A':'B'}</span>${title}</strong>${s?`<button class="clear-file" data-clear="${side}" aria-label="Убрать ${title.toLowerCase()}">Убрать ×</button>`:''}</div>`;
  if(!s||s.loading){node.innerHTML=head+`<label class="dropzone" data-drop="${side}"><svg class="upload-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 27H5V5h15l7 7v5M19 5v8h8M12 24l5-5 5 5m-5-5v12"/></svg><span class="drop-title">${s?.loading?'Читаем файл…':'<b>Выберите файл</b> или перетащите сюда'}</span><span class="drop-sub">.xlsx или .csv · до 8 МБ</span><input type="file" accept=".xlsx,.csv" aria-label="Загрузить ${title.toLowerCase()}"${s?.loading?' disabled':''}></label>`;bindFile(side,node);return;}
  const rows=activeRows(s),header=rows[s.map.header]||[],labels=header.map((x,i)=>[i,`${String.fromCharCode(65+i%26)} · ${String(x||'Столбец '+(i+1)).slice(0,65)}`]);
  const mapSelect=(key,label,extra=[])=>`<label>${label}<select data-map="${key}" aria-label="${label} — ${title.toLowerCase()}">${options([...extra,...labels],s.map[key])}</select></label>`;
  node.innerHTML=head+`<div class="file-info"><span class="file-type">${s.csv?'CSV':'XLSX'}</span><div><p class="file-name">${esc(s.name)}</p><p class="file-meta">${Math.max(0,rows.length-s.map.header-1).toLocaleString('ru')} строк после заголовка${s.demo?' · пример':''}</p></div></div><div class="mapping"><div class="map-top"><label>Лист<select data-sheet aria-label="Лист — ${title.toLowerCase()}">${options(s.sheets.map((x,i)=>[i,x.name]),s.sheet)}</select></label><label>Строка заголовков<input data-header type="number" min="1" max="${Math.max(1,rows.length)}" value="${s.map.header+1}" aria-label="Строка заголовков — ${title.toLowerCase()}"></label></div>${s.csv?`<div class="csv-options"><label>Кодировка<select data-encoding aria-label="Кодировка — ${title.toLowerCase()}">${options([['auto','Автоматически'],['utf-8','UTF-8'],['windows-1251','Windows-1251']],s.encoding)}</select></label><label>Разделитель CSV<select data-delimiter aria-label="Разделитель CSV — ${title.toLowerCase()}">${options([['','Автоматически'],[';','Точка с запятой'],[',','Запятая'],['\t','Табуляция']],s.delimiter)}</select></label></div>`:''}<div class="map-cols">${mapSelect('sku','Артикул')}${mapSelect('price','Цена')}${mapSelect('name','Наименование',[[-1,'Не использовать']])}</div><div class="mini-wrap"><table class="mini" aria-label="Первые строки — ${title.toLowerCase()}"><thead><tr><th>Строка</th>${header.slice(0,5).map((x,i)=>`<th>${esc(x||'Столбец '+(i+1))}</th>`).join('')}</tr></thead><tbody>${rows.slice(s.map.header+1,s.map.header+4).map((row,i)=>`<tr><td>${s.map.header+i+2}</td>${header.slice(0,5).map((_,c)=>`<td title="${esc(row[c])}">${esc(row[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  node.querySelector('[data-clear]').onclick=()=>{tokens[side]++;state[side]=null;card(side);invalidate();message('');};
  node.querySelector('[data-sheet]').onchange=e=>{s.sheet=Number(e.target.value);setMap(s);card(side);invalidate();};
  node.querySelector('[data-header]').onchange=e=>{const n=Number(e.target.value);if(!Number.isInteger(n)||n<1||n>rows.length){e.target.value=s.map.header+1;return;}s.map=guessMap(rows[n-1]||[],n-1);card(side);invalidate();};
  for(const select of node.querySelectorAll('[data-map]'))select.onchange=e=>{s.map[e.target.dataset.map]=Number(e.target.value);invalidate();};
  for(const type of ['encoding','delimiter']){const el=node.querySelector(`[data-${type}]`);if(el)el.onchange=async e=>{const value=e.target.value;await loadFile(side,s.file,{encoding:type==='encoding'?value:s.encoding,delimiter:type==='delimiter'?value:s.delimiter});};}
}
function bindFile(side,node){
  const input=node.querySelector('input[type=file]'),drop=node.querySelector('[data-drop]');
  input.onchange=()=>{if(input.files[0])loadFile(side,input.files[0]);};
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag');};drop.ondragleave=()=>drop.classList.remove('drag');
  drop.ondrop=e=>{e.preventDefault();drop.classList.remove('drag');const files=e.dataTransfer.files;if(files.length!==1){message('Перетащите один файл в каждую карточку.');return;}loadFile(side,files[0]);};
  node.querySelector('[data-clear]')?.addEventListener('click',()=>{tokens[side]++;state[side]=null;card(side);invalidate();});
}
async function loadFile(side,file,settings={}){
  const token=++tokens[side];state[side]={loading:true};card(side);invalidate();message('');
  try{
    if(file.size>MAX_BYTES)throw new Error('Размер файла больше 8 МБ. Уменьшите файл или разделите его на части.');
    if(!/\.(xlsx|csv)$/i.test(file.name))throw new Error('Выберите XLSX или CSV. Старый XLS сначала сохраните в формате XLSX.');
    const buffer=await file.arrayBuffer(),csv=/\.csv$/i.test(file.name),encoding=settings.encoding||'auto',delimiter=settings.delimiter||'';
    const sheets=csv?[{name:'CSV',rows:csvRows(decodeCsv(buffer,encoding),delimiter)}]:await readXlsx(buffer);
    if(token!==tokens[side])return;
    if(!sheets.some(s=>s.rows.some(row=>row.some(x=>String(x??'').trim()))))throw new Error('Файл пустой. Нужна строка заголовков и хотя бы один товар.');
    const s={file,name:file.name,csv,encoding,delimiter,sheets,sheet:0};setMap(s);state[side]=s;card(side);syncButton();
  }catch(error){if(token!==tokens[side])return;state[side]=null;card(side);syncButton();message(sideTitle(side)+': '+(error.message||'Не удалось прочитать файл. Для XLSX попробуйте пересохранить его в Excel.'));}
}
function validateMap(s){const m=s.map;if(m.sku===m.price)throw new Error(sideTitle(s===state.old?'old':'new')+': артикул и цена должны быть в разных столбцах.');if(activeRows(s).length<=m.header+1)throw new Error('После заголовков нет строк с товарами.');if(activeRows(s).length-m.header-1>20000)throw new Error('После заголовка больше 20 000 строк. Разделите файл на части.');}
function runComparison(){
  try{validateMap(state.old);validateMap(state.new);report=compare(activeRows(state.old),activeRows(state.new),state.old.map,state.new.map,{ignoreCase:$('ignore-case').checked,decimal:$('decimal').value});
    if(!report.length)throw new Error('В выбранных листах нет товаров. Проверьте строку заголовков.');
    filter='all';limit=50;$('search').value='';message('');renderResults();$('results').hidden=false;$('results-title').focus({preventScroll:true});$('results').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){message(e.message);}
}
function renderResults(){
  const counts=summary(report),cfg=[['up','Подорожало'],['down','Подешевело'],['added','Новых'],['removed','Исчезло'],['same','Без изменений'],['review','Проверить']];
  $('counts').innerHTML=cfg.map(([key,label])=>`<button class="count" data-status="${key}" aria-label="Показать: ${label}, ${counts[key]}"><b>${counts[key].toLocaleString('ru')}</b><span>${label}</span></button>`).join('');
  for(const b of $('counts').querySelectorAll('button'))b.onclick=()=>{filter=b.dataset.status;limit=50;renderTable();};
  $('result-description').textContent=`${state.old.name} → ${state.new.name} · ${report.length.toLocaleString('ru')} ${plural(report.length,'позиция','позиции','позиций')}`;
  $('review-note').hidden=counts.review===0;$('review-note').textContent=`Позиций для проверки: ${counts.review}. Повторы артикулов и строки с ошибками не участвуют в расчёте изменения цены. Подробности и номера строк есть в отчёте.`;
  renderTable();
}
function renderTable(){
  const choices=[['all','Все'],['up','Подорожало'],['down','Подешевело'],['added','Новые'],['removed','Исчезли'],['review','Проверить'],['same','Без изменений']];
  $('filters').innerHTML=choices.map(([key,label])=>`<button class="filter" data-filter="${key}" aria-pressed="${filter===key}">${label}</button>`).join('');
  for(const b of $('filters').querySelectorAll('button'))b.onclick=()=>{filter=b.dataset.filter;limit=50;renderTable();};
  const query=$('search').value.toLocaleLowerCase('ru').trim(),rows=report.filter(r=>(filter==='all'||r.status===filter)&&(!query||`${r.sku} ${r.name}`.toLocaleLowerCase('ru').includes(query)));
  $('rows').innerHTML=rows.slice(0,limit).map(r=>`<tr><td><span class="sku">${esc(r.sku||'Без артикула')}</span><span class="product">${esc(r.name)}</span></td><td><span class="badge ${r.status}">${esc(STATUS[r.status])}</span></td><td class="num">${money(r.old)}</td><td class="num">${money(r.new)}</td><td class="num ${r.delta>0?'delta-up':r.delta<0?'delta-down':''}">${r.delta>0?'+':''}${money(r.delta)}</td><td class="num">${r.percent==null?'—':(r.percent>0?'+':'')+format.format(r.percent)+'%'}</td><td class="row-note">${esc(r.notes.join('; ')||'')}</td></tr>`).join('');
  $('empty').hidden=rows.length!==0;$('more').hidden=rows.length<=limit;$('row-count').textContent=`Показано ${Math.min(rows.length,limit)} из ${rows.length}`;
}
function download(buffer,name,type){const url=URL.createObjectURL(new Blob([buffer],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function saveReport(){const b=$('download');b.disabled=true;b.textContent='Готовим файл…';try{const buffer=await exportXlsx(report,{old:state.old.name,new:state.new.name,ignoreCase:$('ignore-case').checked,decimal:$('decimal').value});download(buffer,'sverka-'+new Date().toISOString().slice(0,10)+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}catch(e){message('Не удалось создать отчёт: '+e.message);}finally{b.disabled=false;b.textContent='Скачать отчёт .xlsx ↓';}}
const demoOld=[['Артикул','Наименование','Цена'],['00125','Бумага офисная, 500 л.','1 250,00'],['00210','Ручки шариковые, 50 шт.','800'],['P-003','Папка архивная','0'],['00400','Блокнот A5','350'],['00500','Маркеры, набор','480'],['D-01','Файлы-вкладыши, 100 шт.','230'],['D-01','Файлы-вкладыши, 100 шт.','250'],['B-01','Скобы для степлера','500']];
const demoNew=[['Артикул','Наименование','Цена'],['00400','Блокнот A5','350'],['00125','Бумага офисная, 500 л.','1 375,00'],['00210','Ручки шариковые, 50 шт.','720'],['P-003','Папка архивная','150'],['00600','Клей-карандаш','120'],['D-01','Файлы-вкладыши, 100 шт.','260'],['B-01','Скобы для степлера','по запросу'],['','Товар без артикула','50']];
function demo(){tokens.old++;tokens.new++;for(const [side,rows] of [['old',demoOld],['new',demoNew]]){const s={name:side==='old'?'прайс_сентябрь.xlsx':'прайс_октябрь.xlsx',sheets:[{name:'Товары',rows}],sheet:0,demo:true,csv:false};setMap(s);state[side]=s;card(side);}$('ignore-case').checked=false;$('decimal').value='auto';syncButton();runComparison();}
$('files').innerHTML='<article class="file-card" data-card="old"></article><article class="file-card" data-card="new"></article>';card('old');card('new');
$('compare').onclick=runComparison;$('demo').onclick=demo;$('download').onclick=saveReport;$('more').onclick=()=>{limit+=50;renderTable();};$('search').oninput=()=>{limit=50;renderTable();};$('ignore-case').onchange=invalidate;$('decimal').onchange=invalidate;
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
if(new URLSearchParams(location.search).has('demo'))demo();
