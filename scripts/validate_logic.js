const XLSX = require('xlsx');
const path = require('path');
const { processReconciliation } = require('../src/lib/reconciliation');

function readExcel(filename) {
    const filePath = path.join(__dirname, '../test_data', filename);
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
}

// Map Excel columns to Engine format
function mapData(rows, sourceName) {
    return rows.map((row, index) => {
        // Generate ID if missing (using source prefix + index)
        const id = row['Codigo Conciliacao'] || `${sourceName}-${index}`;

        return {
            amount: parseFloat(row['Valor'] || 0),
            date: new Date(row['Data']),
            description: row['Descricao'] || '',
            id: id,
            metadata: {
                originalRow: index + 2, // 1-based + header
                centroCusto: row['Centro de Custo'],
                empresa: row['EMPRESA']
            }
        };
    });
}

async function runValidation() {
    console.log('--- Loading Test Files ---');

    // File 1: Banco
    console.log('Reading Banco file...');
    const bancoRaw = readExcel('TESTE - BANCO Full VORCON MATCH V8.xlsx');
    const bancoClean = mapData(bancoRaw, 'BANCO');
    console.log(`Loaded ${bancoClean.length} bank transactions.`);

    // File 2: Financeiro
    console.log('Reading Financeiro file...');
    const finRaw = readExcel('TESTE - FINANCEIRO VORCON MATCH V8.xlsx');
    const finClean = mapData(finRaw, 'FIN');
    console.log(`Loaded ${finClean.length} financial transactions.`);

    console.log('\n--- Running Reconciliation Engine (M.A.R.K. 11 V12) ---');
    const startTime = Date.now();

    // Run Logic
    const results = processReconciliation(bancoClean, finClean);

    const duration = Date.now() - startTime;

    console.log(`\nReconciliation completed in ${duration}ms`);
    console.log('--- Results ---');
    console.log(`Total Matches: ${results.totalReconciled}`);
    console.log(`Unmatched Bank: ${results.unmatched.bank.length}`);
    console.log(`Unmatched Fin: ${results.unmatched.asaas.length}`); // Engine calls it 'asaas' generically
    console.log(`Match Rate: ${(results.stats.matchRate * 100).toFixed(2)}%`);

    // Sample Unmatched to understand why
    if (results.unmatched.bank.length > 0) {
        console.log('\n[Sample Unmatched Bank]');
        console.table(results.unmatched.bank.slice(0, 5).map(t => ({
            Val: t.amount,
            Date: t.date.toISOString().split('T')[0],
            Desc: t.description.substring(0, 30)
        })));
    }
}

runValidation().catch(err => console.error(err));
