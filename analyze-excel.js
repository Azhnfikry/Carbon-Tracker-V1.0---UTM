const XLSX = require('xlsx');
const fs = require('fs');

const filePath = 'C:\\Users\\N O\\Desktop\\Aethera\\UTM GHG Emission Pilot Project\\Template UTM Data .xlsx';
const buffer = fs.readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: 'buffer' });

console.log('=== EXCEL FILE STRUCTURE ===');
console.log('Sheet names:', workbook.SheetNames);
console.log('Active sheet:', workbook.SheetNames[0]);
console.log();

const ws = workbook.Sheets[workbook.SheetNames[0]];
const jsonData = XLSX.utils.sheet_to_json(ws);

console.log('Total rows with data:', jsonData.length);
console.log();

if (jsonData.length > 0) {
  console.log('Column headers:');
  Object.keys(jsonData[0]).forEach((key, i) => {
    console.log(`  ${i + 1}. ${key}`);
  });
  
  console.log();
  console.log('First 3 rows of data:');
  jsonData.slice(0, 3).forEach((row, idx) => {
    console.log(`Row ${idx + 1}:`, JSON.stringify(row, null, 2));
  });
}
