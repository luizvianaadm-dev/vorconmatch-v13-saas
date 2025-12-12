// File: src/lib/reconciliation.js
// VorconMatch V14 - Reconciliation Engine (M.A.R.K. 11 V12 - Ported from Frontend)

// Helpers
// Helpers
const normalizeString = (s) => {
    if (!s) return "GENERICO";
    let str = s.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Remove common banking terms to improve matching
    str = str.replace(/\b(CARTAO|CARTOES|BCO|BANCO|S\.A|SA|LTDA|PAGAMENTO|RECEBIMENTO)\b/g, " ");
    return str.replace(/[^A-Z0-9]/g, "").trim();
};

const toCents = (val) => Math.round(val * 100);

// Subset Sum Logic
const MAX_ITERATIONS = 1000000;

function findSubsetSum(numbers, target) {
    const resultIndices = [];
    let iterations = 0;
    let found = false;

    // Greedy check first (performance optimization)
    // If exact match exists in the list
    const exactIdx = numbers.findIndex(n => Math.abs(n - target) <= 1);
    if (exactIdx !== -1) return [exactIdx];

    // If sum of all equals target
    const total = numbers.reduce((a, b) => a + b, 0);
    if (Math.abs(total - target) <= 1) return numbers.map((_, i) => i);

    function backtrack(startIndex, currentSum, currentIndices) {
        iterations++;
        if (found || iterations > MAX_ITERATIONS) return;

        if (Math.abs(currentSum - target) <= 1) {
            found = true;
            currentIndices.forEach(i => resultIndices.push(i));
            return;
        }
        if (startIndex >= numbers.length) return;

        for (let i = startIndex; i < numbers.length; i++) {
            backtrack(i + 1, currentSum + numbers[i], [...currentIndices, i]);
            if (found) return;
        }
    }

    backtrack(0, 0, []);
    return found ? resultIndices : null;
}

// Pass Logic
function runPass(pass, bankTx, asaasTx) {
    let matchesCount = 0;
    const matches = [];

    // =========================================================================
    // CYCLE 1: Direct Exact Match
    // Key: Date + Amount + Normalized Bank String
    // =========================================================================
    if (pass === 1) {
        const finIdx = {};

        // Index unmatched Financeiro items
        asaasTx.forEach(f => {
            if (!f.isReconciled) {
                const key = `${f.date.toISOString().split('T')[0]}_${toCents(f.amount)}_${normalizeString(f.bankName || '')}`;
                if (!finIdx[key]) finIdx[key] = [];
                finIdx[key].push(f);
            }
        });

        // Match unmatched Bank items against Index
        bankTx.forEach(b => {
            if (!b.isReconciled) {
                const key = `${b.date.toISOString().split('T')[0]}_${toCents(b.amount)}_${normalizeString(b.bankName || '')}`;
                const candidates = finIdx[key] || [];

                // GREEDY MATCH CHANGE:
                // If there are candidates available, pick the first one.
                // Since keys (Date + Amount + Bank) are identical, items are fungible.
                // This solves the issue where duplicate fees (e.g. 2x -5.00) were skipped by Strict Mode.

                const availableCandidate = candidates.find(c => !c.isReconciled);

                if (availableCandidate) {
                    b.isReconciled = true;
                    availableCandidate.isReconciled = true;
                    matches.push({
                        bank: b,
                        asaas: availableCandidate,
                        method: 'CYCLE_1_EXACT_GREEDY'
                    });
                    matchesCount++;
                }
            }
        });
        return { count: matchesCount, matches };
    }

    // =========================================================================
    // CYCLES 2-5: Subset Sum WITH Bank Name Exact Match
    // One Bank Item matched to Multiple Fin Items on Same Date + Same Bank Name
    // =========================================================================
    if (pass > 1 && pass < 6) {
        const finMap = {};
        asaasTx.forEach(f => {
            if (!f.isReconciled) {
                const dateStr = f.date.toISOString().split('T')[0];
                if (!finMap[dateStr]) finMap[dateStr] = [];
                finMap[dateStr].push(f);
            }
        });

        bankTx.forEach(b => {
            if (!b.isReconciled) {
                const dateStr = b.date.toISOString().split('T')[0];
                const candidates = finMap[dateStr] || [];

                // Filter by Normalized Bank Name (must match to be considered in the subset)
                const bNorm = normalizeString(b.bankName || '');
                const available = candidates.filter(c =>
                    !c.isReconciled && // available
                    !c.usedTemp && // not used in this current inner loop pass
                    normalizeString(c.bankName || '') === bNorm
                );

                if (available.length > 0) {
                    // Sort for deterministic behavior
                    available.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));

                    const targetCents = toCents(b.amount);
                    const numbers = available.map(d => toCents(d.amount));

                    const matchIndices = findSubsetSum(numbers, targetCents);

                    if (matchIndices) {
                        b.isReconciled = true;
                        matchIndices.forEach(idx => {
                            const itemFin = available[idx];
                            itemFin.isReconciled = true;
                            itemFin.usedTemp = true;

                            matches.push({
                                bank: b,
                                asaas: itemFin,
                                method: `CYCLE_${pass}_SUBSET`
                            });
                        });
                        matchesCount++;
                    }
                }
            }
        });

        // Clean up temp flags
        asaasTx.forEach(f => delete f.usedTemp);
        return { count: matchesCount, matches };
    }

    // =========================================================================
    // CYCLE 6: Date Match ONLY (Ignores Bank Name) - "Varredura Final"
    // One Bank Item matched to Multiple Fin Items on Same Date (Bank Name Ignored)
    // =========================================================================
    if (pass === 6) {
        const finMap = {};
        asaasTx.forEach(f => {
            if (!f.isReconciled) {
                const dateStr = f.date.toISOString().split('T')[0];
                if (!finMap[dateStr]) finMap[dateStr] = [];
                finMap[dateStr].push(f);
            }
        });

        // Sort pending banks by value descending (abs) to prioritize large matches
        // using a separate list of references
        const pendingBanks = bankTx.filter(b => !b.isReconciled);
        pendingBanks.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

        pendingBanks.forEach(b => {
            // Already checked !b.isReconciled in filter, but double check in case of side effects? 
            // Logic is single-threaded synchronous so filter is safe.
            const dateStr = b.date.toISOString().split('T')[0];
            // In Cycle 6, we use ALL candidates from that date, ignoring bank name
            const available = (finMap[dateStr] || []).filter(c => !c.isReconciled && !c.usedTemp);

            if (available.length > 0) {
                // Should we sort available? HTML didn't explicitly sort inside loop but we did in cycles 2-5?
                // HTML finalProcess didn't sort candidates. But let's sort to be deterministic.
                available.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));

                const targetCents = toCents(b.amount);
                const numbers = available.map(d => toCents(d.amount));
                const matchIndices = findSubsetSum(numbers, targetCents);

                if (matchIndices) {
                    b.isReconciled = true;
                    matchIndices.forEach(idx => {
                        const itemFin = available[idx];
                        itemFin.isReconciled = true;
                        itemFin.usedTemp = true; // Mark as used in this Cycle 6 pass
                        matches.push({
                            bank: b,
                            asaas: itemFin,
                            method: 'CYCLE_6_DATE_ONLY'
                        });
                    });
                    matchesCount++;
                }
            }
        });

        asaasTx.forEach(f => delete f.usedTemp);
        return { count: matchesCount, matches };
    }

    return { count: 0, matches: [] };
}

// 2-Item Split Heuristic (Ported from HTML runSequentialMatch)
function runSequentialMatch(bankTx, asaasTx) {
    let matchesCount = 0;
    const matches = [];

    // Group finance by Date + BankName
    const finByDateBank = {};
    asaasTx.forEach(f => {
        if (!f.isReconciled) {
            const key = `${f.date.toISOString().split('T')[0]}_${normalizeString(f.bankName || '')}`;
            if (!finByDateBank[key]) finByDateBank[key] = [];
            finByDateBank[key].push(f);
        }
    });

    // Identify keys where we have exactly 2 pending bank items
    const bankKeys = bankTx
        .filter(b => !b.isReconciled)
        .map(b => `${b.date.toISOString().split('T')[0]}_${normalizeString(b.bankName || '')}`);

    const uniqueKeys = [...new Set(bankKeys)];

    uniqueKeys.forEach(key => {
        const pendBanks = bankTx.filter(b =>
            !b.isReconciled &&
            `${b.date.toISOString().split('T')[0]}_${normalizeString(b.bankName || '')}` === key
        );

        if (pendBanks.length === 2) {
            const fRows = finByDateBank[key] || [];

            // If we don't have enough finance items to split, skip
            if (fRows.length < 2) return;

            // Sort banks by value descending
            pendBanks.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
            const t1 = Math.abs(toCents(pendBanks[0].amount));
            const t2 = Math.abs(toCents(pendBanks[1].amount));

            // Try explicit partition point logic from HTML
            for (let i = 0; i < fRows.length - 1; i++) {
                // Sum first part
                const sum1 = Math.abs(fRows.slice(0, i + 1).reduce((acc, r) => acc + toCents(r.amount), 0));
                // Sum second part
                const sum2 = Math.abs(fRows.slice(i + 1).reduce((acc, r) => acc + toCents(r.amount), 0));

                // Check Match Logic (Allowing strict match on cents)
                // Case A: Group 1 matches Bank 1, Group 2 matches Bank 2
                // HTML Legacy Logic used 0.5 tolerance on floats (50 cents). Replicating with 50 cents here.
                if (Math.abs(sum1 - t1) <= 50 && Math.abs(sum2 - t2) <= 50) {
                    // Match Found!
                    pendBanks[0].isReconciled = true;
                    pendBanks[1].isReconciled = true;

                    // Assign Group 1 to Bank 1
                    for (let j = 0; j <= i; j++) {
                        const f = fRows[j];
                        f.isReconciled = true;
                        matches.push({ bank: pendBanks[0], asaas: f, method: 'SEQ_SPLIT_MATCH_A' });
                    }
                    // Assign Group 2 to Bank 2
                    for (let j = i + 1; j < fRows.length; j++) {
                        const f = fRows[j];
                        f.isReconciled = true;
                        matches.push({ bank: pendBanks[1], asaas: f, method: 'SEQ_SPLIT_MATCH_A' });
                    }
                    matchesCount += 2; // Counted as 2 solved bank items (roughly)
                    return;
                }

                // Case B: Group 1 matches Bank 2, Group 2 matches Bank 1
                if (Math.abs(sum1 - t2) <= 50 && Math.abs(sum2 - t1) <= 50) {
                    // Match Found!
                    pendBanks[0].isReconciled = true;
                    pendBanks[1].isReconciled = true;

                    // Assign Group 1 to Bank 2
                    for (let j = 0; j <= i; j++) {
                        const f = fRows[j];
                        f.isReconciled = true;
                        matches.push({ bank: pendBanks[1], asaas: f, method: 'SEQ_SPLIT_MATCH_B' });
                    }
                    // Assign Group 2 to Bank 1
                    for (let j = i + 1; j < fRows.length; j++) {
                        const f = fRows[j];
                        f.isReconciled = true;
                        matches.push({ bank: pendBanks[0], asaas: f, method: 'SEQ_SPLIT_MATCH_B' });
                    }
                    matchesCount += 2;
                    return;
                }
            }
        }
    });

    return { count: matchesCount, matches };
}

function processReconciliation(rawBankData, rawAsaasData) {
    // 1. Normalize Input
    const bankTx = rawBankData.map((tx, i) => ({
        ...tx,
        amount: parseFloat(tx.amount),
        date: new Date(tx.date),
        bankName: tx.metadata['Banco/Caixa'] || tx.description || '', // Use metadata mapped from excel
        isReconciled: false,
        _originalIdx: i
    }));

    const asaasTx = rawAsaasData.map((tx, i) => ({
        ...tx,
        amount: parseFloat(tx.amount),
        date: new Date(tx.date),
        bankName: tx.metadata['Banco/Caixa'] || tx.description || '',
        isReconciled: false,
        _originalIdx: i
    }));

    let allMatches = [];
    let cycle = 1;
    let newMatches = 0;

    // 2. Run Cycles 1-5 (Strict Bank Match)
    do {
        const result = runPass(cycle, bankTx, asaasTx);
        newMatches = result.count;
        allMatches = allMatches.concat(result.matches);
        cycle++;
    } while (newMatches > 0 && cycle <= 5);

    // 2.5 Run Sequential Match (Duplicate Bank Item Heuristic)
    const seqResult = runSequentialMatch(bankTx, asaasTx);
    if (seqResult.count > 0) {
        allMatches = allMatches.concat(seqResult.matches);
    }

    // 3. Run Cycle 6 (Global Date Match - "Varredura Final" Logic)
    const resultCycle6 = runPass(6, bankTx, asaasTx);
    if (resultCycle6.count > 0) {
        allMatches = allMatches.concat(resultCycle6.matches);
    }

    // 3. Format Output
    const reconciledOutput = allMatches.map(m => ({
        bank: m.bank,
        asaas: m.asaas,
        confidence: 1.0,
        method: m.method
    }));

    const unmatched = {
        bank: bankTx.filter(t => !t.isReconciled),
        asaas: asaasTx.filter(t => !t.isReconciled)
    };

    return {
        reconciled: reconciledOutput,
        unmatched,
        totalReconciled: reconciledOutput.length,
        stats: {
            bankTotal: bankTx.length,
            asaasTotal: asaasTx.length,
            matchRate: bankTx.length > 0 ? (reconciledOutput.length / bankTx.length) : 0
        }
    };
}

module.exports = { processReconciliation };
