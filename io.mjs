import {STATUS} from './core.mjs';
export const MAX_ROWS=20000,MAX_BYTES=8*1024*1024;
export function decodeCsv(buffer,encoding='auto') {
  let text;
  if(encoding==='auto') {
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{text=new TextDecoder('windows-1251').decode(buffer);}
  } else text=new TextDecoder(encoding).decode(buffer);
  return text.replace(/^\uFEFF/,'');
}
export function csvRows(text,delimiter='') {
  const parsed=globalThis.Papa.parse(text,{delimiter,skipEmptyLines:'greedy',dynamicTyping:false});
  const errors=parsed.errors.filter(e=>e.code!=='UndetectableDelimiter');
  if(errors.length) throw new Error('CSV: '+errors[0].message+'. Проверьте разделитель и кавычки.');
  checkRows(parsed.data);
  return parsed.data;
}
function checkRows(rows) {if(rows.length>MAX_ROWS+15)throw new Error('В файле больше 20 000 строк. Разделите его на части.');if(rows.some(r=>r.length>100))throw new Error('Поддерживается до 100 столбцов. Оставьте нужные столбцы.');}
export function cellValue(cell) {
  const v=cell.value;
  if(v==null)return '';
  if(typeof v==='number' && /^0{2,}$/.test(cell.numFmt||'')) return String(v).padStart(cell.numFmt.length,'0');
  if(typeof v==='object') {
    if('formula' in v||'sharedFormula' in v)return v.result??'#Нет сохранённого результата формулы';
    if(v.richText)return v.richText.map(t=>t.text).join('');
    if(v.text!=null)return v.text;
    if(v instanceof Date)return v.toISOString().slice(0,10);
    return String(cell.text??'');
  }
  return v;
}
export async function readXlsx(buffer) {
  const book=new globalThis.ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheets=book.worksheets.filter(s=>s.state!=='veryHidden').map(sheet=>{
    if(sheet.rowCount>MAX_ROWS+15||sheet.columnCount>100)throw new Error('Лист «'+sheet.name+'» слишком большой: лимит 20 000 строк и 100 столбцов.');
    const rows=[];
    for(let r=1;r<=sheet.rowCount;r++){const line=[];for(let c=1;c<=sheet.columnCount;c++)line.push(cellValue(sheet.getCell(r,c)));rows.push(line);}
    checkRows(rows);return {name:sheet.name,rows};
  });
  if(!sheets.length)throw new Error('В книге нет доступных листов.');
  return sheets;
}
export async function exportXlsx(rows,context={}) {
  const book=new globalThis.ExcelJS.Workbook();book.creator='Сверка';
  const sheet=book.addWorksheet('Сверка',{views:[{state:'frozen',ySplit:1}]});
  sheet.columns=[{header:'Статус',key:'status',width:20},{header:'Артикул',key:'sku',width:22},{header:'Наименование',key:'name',width:42},{header:'Старая цена',key:'old',width:18},{header:'Новая цена',key:'new',width:18},{header:'Разница',key:'delta',width:18},{header:'Изменение, %',key:'percent',width:19},{header:'Строки старого',key:'oldRow',width:18},{header:'Строки нового',key:'newRow',width:18},{header:'Примечание',key:'notes',width:70}];
  for(const r of rows) sheet.addRow({...r,status:STATUS[r.status],old:r.old==null?null:r.old/100,new:r.new==null?null:r.new/100,delta:r.delta==null?null:r.delta/100,percent:r.percent==null?null:r.percent/100,notes:r.notes.join('; ')});
  for(const name of ['old','new','delta'])sheet.getColumn(name).numFmt='#,##0.00';sheet.getColumn('percent').numFmt='0.00%';sheet.getColumn('sku').numFmt='@';
  sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF154B42'}};sheet.getRow(1).height=28;
  sheet.autoFilter={from:'A1',to:'J'+sheet.rowCount};
  const info=book.addWorksheet('Об отчёте');
  info.addRows([['Сверка прайс-листов',''],['Старый файл',context.old||''],['Новый файл',context.new||''],['Время',new Date().toISOString()],['Правила','Точное сопоставление по артикулу; пробелы по краям удаляются.'],['Регистр',context.ignoreCase?'Не учитывается':'Учитывается'],['Разделитель цены',context.decimal||'auto'],['Проверка','Повторы артикулов и некорректные цены требуют ручной проверки.'],['Нулевые цены','Процент для старой нулевой цены не рассчитывается.'],['Валюты','Сравнивайте цены в одной валюте и с одинаковыми условиями НДС.'],['Строки','Номера строк соответствуют исходным файлам.']]);info.columns=[{width:25},{width:100}];
  return book.xlsx.writeBuffer();
}
