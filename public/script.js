```
// M.A.R.K. 11 V12 RECONCILIATION ENGINE
// VorconMatch V14

const API_BASE_URL = '/api';

// ==================== UTILS ====================
// Logic has been moved to Backend (src/lib/reconciliation.js)

// ==================== UI ====================
function displaySubscriptionInfo(planData) {
    const statusClass = planData.plan === 'trial' ? 'status-trial' : new Date(planData.expiresAt) < new Date() ? 'status-expired' : 'status-active';
    document.getElementById('subscription-info').innerHTML = `
    < p > <strong>Plano:</strong> ${ planData.plan.toUpperCase() }</p >
    <p><strong>Status:</strong> <span class="status-badge ${statusClass}">${planData.status}</span></p>
    <p><strong>Vence em:</strong> ${new Date(planData.expiresAt).toLocaleDateString('pt-BR')}</p>
    <p><strong>Limite de Transações:</strong> ${planData.transactionLimit || 'Ilimitado'}</p>
`;
}

function displayReconciliationResults(result) {
    const total = result.reconciled.length + result.unmatched.bank.length + result.unmatched.asaas.length;
    const percentage = total > 0 ? (result.reconciled.length / total) * 100 : 0;

    document.getElementById('reconciliation-status').innerHTML = `
    < p > <strong>Status:</strong> Conciliação Completa</p >
    <p><strong>Taxa de Sucesso:</strong> ${percentage.toFixed(2)}%</p>
    <p><strong>Transações Conciliadas:</strong> ${result.totalReconciled}</p>
    <p><strong>Não Encontradas:</strong> ${result.unmatched.bank.length + result.unmatched.asaas.length}</p>
`;

    // Simplificado para exibição
    const sample = result.reconciled.slice(0, 3).map(m =>
        `Bank: ${ m.bank.amount } | Asaas: ${ m.asaas.amount } (Conf: ${(m.confidence * 100).toFixed(0)}%)`
    ).join('\n');

    document.getElementById('reconciliation-results').innerHTML = `
    < h4 > Detalhes da Conciliação(Amostra)</h4 >
        <pre>${sample}</pre>
    <button id="btn-pdf" style="margin-top:10px; padding:10px; background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer;">
        📄 Baixar Relatório PDF
    </button>
`;

    document.getElementById('btn-pdf').onclick = () => handleDownloadPDF(result);
}

// ==================== ACTIONS ====================
async function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(firstSheet);
            resolve(json);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function normalizeUploadData(rows, sourceName) {
    // Tenta adaptar as colunas do Excel do usuário para o formato do sistema
    return rows.map((row, index) => {
        const amount = parseFloat(row['Valor'] || row['amount'] || row['valor'] || 0);
        const dateRaw = row['Data'] || row['date'] || row['data'];
        let dateObj = new Date(dateRaw);
        
        // Fallback para datas inválidas
        if (isNaN(dateObj)) dateObj = new Date();

        return {
            id: row['Codigo Conciliacao'] || row['id'] || `${ sourceName } -${ index } `,
            amount: amount,
            date: dateObj,
            description: row['Descricao'] || row['description'] || row['descricao'] || '',
            metadata: row
        };
    });
}

async function handleFileUploadReconciliation() {
    const bankInput = document.getElementById('bankFile');
    const asaasInput = document.getElementById('asaasFile');
    const statusDiv = document.getElementById('reconciliation-status');

    if (!bankInput.files[0] || !asaasInput.files[0]) {
        alert('Por favor, selecione os dois arquivos (Banco e Financeiro).');
        return;
    }

    try {
        statusDiv.innerHTML = '<p>Lendo arquivos...</p>';
        
        const bankRaw = await readExcelFile(bankInput.files[0]);
        const asaasRaw = await readExcelFile(asaasInput.files[0]);

        statusDiv.innerHTML = '<p>Processando no servidor...</p>';

        const bankClean = normalizeUploadData(bankRaw, 'BANK');
        const asaasClean = normalizeUploadData(asaasRaw, 'ASAAS');

        const reconcileResponse = await fetch(`${ API_BASE_URL }/reconcile`, {
method: 'POST',
    headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
    bankStatement: bankClean,
    asaasStatement: asaasClean
})
        });

if (!reconcileResponse.ok) throw new Error('Falha na API: ' + reconcileResponse.statusText);

const result = await reconcileResponse.json();
displayReconciliationResults(result);

    } catch (error) {
    console.error(error);
    statusDiv.innerHTML = `<p style="color:red">Erro: ${error.message}</p>`;
}
}

async function handleDownloadPDF(results) {
    try {
        const response = await fetch(`${API_BASE_URL} /report/pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ results })
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'relatorio-conciliacao.pdf';
            document.body.appendChild(a); // Req for Firefox
            a.click();
            a.remove();
        } else {
            alert('Erro ao gerar PDF');
        }
    } catch (err) {
        console.error(err);
        alert('Erro ao baixar relatório');
    }
}

async function handleRenovarAssinatura() {
    const btn = document.getElementById('btn-renovar');
    const originalText = btn.innerText;

    try {
        btn.innerText = 'Processando...';
        btn.disabled = true;

        // Cria uma cobrança real no Asaas via Backend
        // Exemplo: Plano Pro, R$ 99.00
        const response = await fetch(`${API_BASE_URL} /billing/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customerId: 'cus_000000000000', // TODO: Pegar do usuário logado ou input
                amount: 99.00,
                plan: 'pro',
                paymentMethod: 'PIX'
            })
        });

        const data = await response.json();

        if (response.ok) {
            alert(`Cobrança criada com sucesso via Asaas!\nID: ${data.id} \nLink: ${data.invoiceUrl} `);
            if (data.invoiceUrl) window.open(data.invoiceUrl, '_blank');
        } else {
            console.error(data);
            alert('Erro ao criar cobrança: ' + (data.error || 'Erro desconhecido'));
        }

    } catch (error) {
        console.error('Erro de rede:', error);
        alert('Falha na comunicação com o servidor.');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// ==================== INIT ====================
async function initializeApp() {
    try {
        document.getElementById('reconciliation-status').innerHTML = '<p>Inicializando VorconMatch V14...</p>';

        // Check Health
        try {
            const health = await fetch(`${API_BASE_URL}/health`).then(r => r.json());
            console.log('Backend Health:', health);
        } catch (e) {
            console.warn('Backend offline ou inacessível');
        }

        // Demo data (Mantido para mostrar a UI funcionando enquanto não há DB)
        const planData = {
            plan: 'premium',
            status: 'ativo',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            transactionLimit: 5000
        };

        displaySubscriptionInfo(planData);

        // Demo reconciliation logic calling BACKEND API
        const bankTx = [
            { id: 1, data: '2025-12-01', valor: 1000 },
            { id: 2, data: '2025-12-02', valor: 2500 }
        ];

        const asaasTx = [
            { id: 'A1', data: '2025-12-01', valor: 1000 },
            { id: 'A2', data: '2025-12-02', valor: 2500 }
        ];

        try {
            const reconcileResponse = await fetch(`${API_BASE_URL}/reconcile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bankStatement: bankTx,
                    asaasStatement: asaasTx
                })
            });

            if (!reconcileResponse.ok) throw new Error('Falha na API de conciliação');

            const result = await reconcileResponse.json();
            displayReconciliationResults(result);

        } catch (apiError) {
            console.error('Erro na conciliação via API:', apiError);
            document.getElementById('reconciliation-status').innerHTML += '<br><small style="color:red">Erro no motor: ' + apiError.message + '</small>';
        }

        // Bind Actions
        // Nota: O botão btn-renovar precisa existir no HTML
        const renewBtn = document.querySelector('button[onclick*="Renovar"]');
        if (renewBtn) {
            renewBtn.id = 'btn-renovar';
            renewBtn.onclick = handleRenovarAssinatura; // Override onclick
            renewBtn.type = 'button'; // Prevent form submit if any
        }

    } catch (error) {
        console.error('Erro:', error);
        document.getElementById('reconciliation-status').innerHTML = '<p style="color: red;">Erro ao inicializar: ' + error.message + '</p>';
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
```
