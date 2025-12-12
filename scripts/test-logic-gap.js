const { processReconciliation } = require('../src/lib/reconciliation');

// Mock Data mimicking the "Split 2 Items" scenario
// Bank: 2 items on same day/bank. -1000 and -500.
// Fin: 4 items. -200, -800 (sums to -1000). -300, -200 (sums to -500).
// Cycles 1-5 might match lazily. runSequentialMatch is strict about 2-to-N splitting.

const bankData = [
    { id: 'B1', date: '2023-01-01', amount: -1000, description: 'Pgto A', metadata: { 'Banco/Caixa': 'ITAU' } },
    { id: 'B2', date: '2023-01-01', amount: -500, description: 'Pgto B', metadata: { 'Banco/Caixa': 'ITAU' } }
];

const finData = [
    { id: 'F1', date: '2023-01-01', amount: -200, description: 'Parc 1', metadata: { 'Banco/Caixa': 'ITAU' } },
    { id: 'F2', date: '2023-01-01', amount: -800, description: 'Parc 2', metadata: { 'Banco/Caixa': 'ITAU' } }, // Matches B1
    { id: 'F3', date: '2023-01-01', amount: -300, description: 'Parc 3', metadata: { 'Banco/Caixa': 'ITAU' } },
    { id: 'F4', date: '2023-01-01', amount: -200, description: 'Parc 4', metadata: { 'Banco/Caixa': 'ITAU' } }, // Matches B2
];

console.log("Running Reconciliation...");
const result = processReconciliation(bankData, finData);

console.log(`Matches Found: ${result.reconciled.length}`);
result.reconciled.forEach(m => {
    console.log(`Matched ${m.bank.id} (${m.bank.amount}) with ${m.asaas.id} (${m.asaas.amount}) via ${m.method}`);
});

if (result.reconciled.length === 4) {
    console.log("SUCCESS: All items matched.");
} else {
    console.log("FAILURE: Incomplete matching.");
}
