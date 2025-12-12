const XLSX = require('xlsx');
const path = require('path');

const files = [
    'TESTE - BANCO Full VORCON MATCH V8.xlsx',
    'TESTE - FINANCEIRO VORCON MATCH V8.xlsx'
];

files.forEach(file => {
    try {
        const workbook = XLSX.readFile(path.join(__dirname, '../test_data', file));
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Array of arrays

        console.log(`\n=== File: ${file} ===`);
        if (data.length > 0) {
            console.log('Headers:', data[0]);
            console.log('First Row:', data[1]);
        } else {
            console.log('Empty file');
        }
    } catch (err) {
        console.error(`Error reading ${file}:`, err.message);
    }
});
