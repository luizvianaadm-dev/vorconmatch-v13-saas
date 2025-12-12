// File: src/lib/pdf-generator.js
const PDFDocument = require('pdfkit');

function generateReconciliationReport(results, res) {
    const doc = new PDFDocument({ margin: 50 });
    const stats = results.stats || {};

    // Helper for BRL Currency Formatting
    const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtVal = (val) => fmt.format(val);

    // Pipe directly to the response
    doc.pipe(res);

    // --- Header ---
    doc.fontSize(20).text('Relatório de Conciliação - VorconMatch V14', { align: 'left' });
    doc.moveDown();
    doc.fontSize(10).text(`Data do Relatório: ${new Date().toLocaleString('pt-BR')}`, { align: 'left' });
    doc.moveDown(2);

    // --- Executive Summary ---
    doc.fontSize(16).text('Resumo Executivo');
    doc.moveDown(0.5);

    // Columns
    const col1 = 50;
    const col2 = 230;
    const col3 = 380;
    const rowHeight = 25;

    // Headers
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('Indicador', col1, doc.y);
    doc.text('Banco', col2, doc.y);
    doc.text('Financeiro', col3, doc.y);
    doc.moveDown(1);

    doc.font('Helvetica').fontSize(11);
    const startY = doc.y;

    // Row 1: Conciliated Value (Green)
    doc.fillColor('#166534'); // Dark Green
    doc.text('Valor Conciliado:', col1, startY);
    doc.text(fmtVal(stats.bankConcVal || 0), col2, startY);
    doc.text(fmtVal(stats.finConcVal || 0), col3, startY);

    // Row 2: Conciliated Count
    doc.text('Qtd. Conciliada:', col1, startY + rowHeight);
    doc.text((stats.bankConcCount || 0).toString(), col2, startY + rowHeight);
    doc.text((stats.finConcCount || 0).toString(), col3, startY + rowHeight);

    // Row 3: Pending Value (Red)
    doc.fillColor('#991B1B'); // Dark Red
    doc.text('Valor Pendente:', col1, startY + rowHeight * 2);
    doc.text(fmtVal(stats.bankPendVal || 0), col2, startY + rowHeight * 2);
    doc.text(fmtVal(stats.finPendVal || 0), col3, startY + rowHeight * 2);

    // Row 4: Pending Count
    doc.text('Qtd. Pendente:', col1, startY + rowHeight * 3);
    doc.text((stats.bankPendCount || 0).toString(), col2, startY + rowHeight * 3);
    doc.text((stats.finPendCount || 0).toString(), col3, startY + rowHeight * 3);
    doc.fillColor('black');

    // Success Rate Highlight (Below Table)
    doc.y = startY + rowHeight * 5;
    const matchRate = parseFloat(stats.matchRate || 0).toFixed(2);
    const color = matchRate > 98 ? 'green' : (matchRate > 90 ? '#eab308' : 'red');
    doc.fontSize(14).fillColor(color).text(`Taxa de Sucesso: ${matchRate}%`, 50, doc.y, { bold: true });
    doc.fillColor('black');

    // --- Unmatched Items (Start Page 2) ---
    const pendingBank = results.unmatched && results.unmatched.bank ? results.unmatched.bank : [];
    const pendingFin = results.unmatched && results.unmatched.asaas ? results.unmatched.asaas : [];

    if (pendingBank.length > 0 || pendingFin.length > 0) {
        doc.addPage();
        doc.y = 50; // Reset Y top of page

        doc.fontSize(16).text('Detalhamento de Pendências');
        doc.moveDown(1);

        // Bank Unmatched
        if (pendingBank.length > 0) {
            doc.fontSize(14).text(`Extrato Bancário (${pendingBank.length} itens)`, { underline: true });
            doc.moveDown(0.8);

            pendingBank.forEach((tx, i) => {
                const amount = fmtVal(tx.amount);
                // Fix: manually parse YYYY-MM-DD to avoid timezone shift
                let date = 'Data N/A';
                if (tx.date && tx.date.includes('-')) {
                    const parts = tx.date.split('-'); // [2025, 04, 07]
                    date = `${parts[2]}/${parts[1]}/${parts[0]}`; // 07/04/2025
                }

                doc.fontSize(10).font('Helvetica-Bold').text(`${i + 1}. ${date} | ${amount}`, { continued: false });
                doc.font('Helvetica').fontSize(9).fillColor('#475569').text(`   ${tx.description || 'Sem descrição'}`);
                doc.fontSize(8).fillColor('#64748B').text(`   Diagnóstico: Pendente de conciliação.`);
                doc.fillColor('black').moveDown(0.8);

                if (doc.y > 700) doc.addPage();
            });
            doc.moveDown(2);
        }

        // Asaas Unmatched
        if (pendingFin.length > 0) {
            // Ensure space or new page for Financeiro
            if (doc.y > 600) doc.addPage();

            doc.fontSize(14).text(`Financeiro (${pendingFin.length} itens)`, { underline: true });
            doc.moveDown(0.8);

            pendingFin.forEach((tx, i) => {
                const amount = fmtVal(tx.amount);
                // Fix: manually parse YYYY-MM-DD
                let date = 'Data N/A';
                if (tx.date && tx.date.includes('-')) {
                    const parts = tx.date.split('-');
                    date = `${parts[2]}/${parts[1]}/${parts[0]}`;
                }

                doc.fontSize(10).font('Helvetica-Bold').text(`${i + 1}. ${date} | ${amount}`, { continued: false });
                doc.font('Helvetica').fontSize(9).fillColor('#475569').text(`   ${tx.description || 'Sem descrição'}`);
                doc.fontSize(8).fillColor('#64748B').text(`   Diagnóstico: Pendente de conciliação.`);
                doc.fillColor('black').moveDown(0.8);

                if (doc.y > 700) doc.addPage();
            });
        }
    } else {
        doc.moveDown(2);
        doc.fontSize(16).fillColor('green').text('✅ Conciliação Completa! Nenhuma pendência encontrada.', { align: 'center' });
    }

    doc.end();
}

module.exports = { generateReconciliationReport };
