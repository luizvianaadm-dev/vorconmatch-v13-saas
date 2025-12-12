const fs = require('fs');
const { generateReconciliationReport } = require('../src/lib/pdf-generator');

// Simulate results with potential mismatches to test PDF columns
const mockResults = {
    totalReconciled: 45,
    stats: {
        bankTotal: 50,
        asaasTotal: 48,
        matchRate: 0.90
    },
    unmatched: {
        bank: [
            {
                amount: 1500.00,
                date: new Date('2025-12-10'),
                description: 'DOC ELETROPAULO - ENERGIA'
            },
            {
                amount: 320.50,
                date: new Date('2025-12-12'),
                description: 'TAR DOC TED'
            }
        ],
        asaas: [
            {
                amount: 99.90,
                date: new Date('2025-12-11'),
                description: 'Assinatura Plano Pro'
            }
        ]
    }
};

const writeStream = fs.createWriteStream('test_report.pdf');
generateReconciliationReport(mockResults, writeStream);

console.log('PDF generated at test_report.pdf');
