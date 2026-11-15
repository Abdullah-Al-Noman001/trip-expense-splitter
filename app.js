// ---- Engine: Core logic separated from UI ----
    const Engine = {
        roundTwo: (v) => Math.round((v + Number.EPSILON) * 100) / 100,
        
        calculate: (people, expenses) => {
            const balances = {};
            people.forEach(p => {
                balances[p.id] = { 
                    id: p.id,
                    name: p.name, 
                    paid: 0, 
                    share: 0,
                    balance: 0
                };
            });
            
            expenses.forEach(exp => {
                if (balances[exp.paidBy]) {
                    balances[exp.paidBy].paid += exp.amount;
                }
                const splitAmong = exp.splitAmong || [];
                if (splitAmong.length > 0) {
                    const perPerson = exp.amount / splitAmong.length;
                    splitAmong.forEach(id => {
                        if (balances[id]) {
                            balances[id].share += perPerson;
                        }
                    });
                }
            });
            
            Object.values(balances).forEach(b => {
                b.balance = Engine.roundTwo(b.paid - b.share);
            });
            return balances;
        },
        
        computeSettlements: (people, expenses) => {
            const balances = Engine.calculate(people, expenses);
            const balanceArray = Object.values(balances);
            const debtors = balanceArray.filter(b => b.balance < -0.005).map(b => ({ ...b }));
            const creditors = balanceArray.filter(b => b.balance > 0.005).map(b => ({ ...b }));
            
            debtors.sort((a, b) => a.balance - b.balance);
            creditors.sort((a, b) => b.balance - a.balance);
            
            const transactions = [];
            let i = 0, j = 0;
            while (i < debtors.length && j < creditors.length) {
                const d = debtors[i];
                const c = creditors[j];
                const amount = Math.min(Math.abs(d.balance), c.balance);
                if (amount > 0.001) {
                    transactions.push({ 
                        from: d.name, 
                        fromId: d.id,
                        to: c.name, 
                        toId: c.id,
                        amount: Engine.roundTwo(amount) 
                    });
                }
                d.balance += amount;
                c.balance -= amount;
                if (Math.abs(d.balance) < 0.005) i++;
                if (Math.abs(c.balance) < 0.005) j++;
            }
            return transactions;
        }
    };

    // ---- State Management ----
    const STORAGE_KEY = 'expense-splitter:data';
    const THEME_KEY = 'expense-splitter:theme';
    
    let state = {
        tripName: 'My Trip',
        people: [],
        expenses: []
    };
    let darkMode = false;
    let expenseFormOpen = false;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
    }

    function isValidImport(value) {
        if (!value || typeof value !== 'object' || !Array.isArray(value.people) || !Array.isArray(value.expenses)) return false;
        const ids = new Set();
        if (!value.people.every(person => person && typeof person.id === 'string' && /^[\w-]+$/.test(person.id) &&
            !ids.has(person.id) && (ids.add(person.id), typeof person.name === 'string' && person.name.trim()))) return false;
        return value.expenses.every(expense => expense && typeof expense.id === 'string' && /^[\w-]+$/.test(expense.id) &&
            typeof expense.description === 'string' && Number.isFinite(expense.amount) && expense.amount > 0 &&
            ids.has(expense.paidBy) && Array.isArray(expense.splitAmong) && expense.splitAmong.length > 0 &&
            expense.splitAmong.every(id => ids.has(id)));
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (!isValidImport(parsed)) throw new Error('Saved data has an invalid format.');
                state = parsed;
                if (!state.people) state.people = [];
                if (!state.expenses) state.expenses = [];
                if (!state.tripName) state.tripName = 'My Trip';
            }
        } catch (_) {}
        
        // Load theme preference
        try {
            const theme = localStorage.getItem(THEME_KEY);
            if (theme === 'dark') {
                darkMode = true;
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                darkMode = false;
                document.documentElement.removeAttribute('data-theme');
            }
        } catch (_) {}
    }
    
    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_) {}
    }
    
    // ---- toggleTheme with multiple approaches for GitHub Pages ----
    function toggleTheme() {
        darkMode = !darkMode;
        if (darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            try {
                localStorage.setItem(THEME_KEY, 'dark');
            } catch (_) {}
        } else {
            document.documentElement.removeAttribute('data-theme');
            try {
                localStorage.removeItem(THEME_KEY);
            } catch (_) {}
        }
        render();
    }
    
    // Expose toggleTheme globally (multiple ways for GitHub Pages)
    window.toggleTheme = toggleTheme;
    window.toggleThemeHandler = toggleTheme;

    function generateId() { 
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); 
    }

    // ---- Custom Modal System ----
    function showModal(options) {
        return new Promise((resolve) => {
            const { title, message, inputLabel, inputType = 'text', confirmText = 'Confirm', cancelText = 'Cancel' } = options;
            
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal">
                    <h3>${escapeHtml(title)}</h3>
                    <p>${escapeHtml(message)}</p>
                    ${inputLabel ? `<input type="${escapeHtml(inputType)}" id="modalInput" placeholder="${escapeHtml(inputLabel)}" autofocus />` : ''}
                    <div class="modal-actions">
                        ${cancelText ? `<button class="cancel" onclick="this.closest('.modal-overlay').remove(); window._modalResolve(null);">${cancelText}</button>` : ''}
                        <button class="confirm" onclick="const val = document.getElementById('modalInput')?.value || true; this.closest('.modal-overlay').remove(); window._modalResolve(val);">${confirmText}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            
            // Store resolve function
            window._modalResolve = resolve;
            
            // Focus input if exists
            const input = document.getElementById('modalInput');
            if (input) {
                setTimeout(() => input.focus(), 100);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const val = input.value;
                        overlay.remove();
                        window._modalResolve(val);
                    }
                    if (e.key === 'Escape') {
                        overlay.remove();
                        window._modalResolve(null);
                    }
                });
            }
            
            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                    window._modalResolve(null);
                }
            });
        });
    }

    // ---- UI Actions (exposed to window) ----
    window.addPerson = async function() {
        const name = await showModal({
            title: 'Add Person',
            message: 'Enter the name of the person joining this trip:',
            inputLabel: 'Name',
            confirmText: 'Add',
            cancelText: 'Cancel'
        });
        
        if (!name || name.trim() === '') return;
        if (state.people.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
            await showModal({
                title: 'Duplicate Name',
                message: 'A person with this name already exists. Please use a different name.',
                confirmText: 'OK',
                cancelText: ''
            });
            return;
        }
        state.people.push({ 
            id: generateId(), 
            name: name.trim() 
        });
        saveState();
        render();
    };

    window.editPerson = async function(id) {
        const person = state.people.find(p => p.id === id);
        if (!person) return;
        
        const newName = await showModal({
            title: 'Edit Person',
            message: 'Update the name:',
            inputLabel: person.name,
            confirmText: 'Save',
            cancelText: 'Cancel'
        });
        
        if (!newName || newName.trim() === '') return;
        if (state.people.some(p => p.id !== id && p.name.toLowerCase() === newName.trim().toLowerCase())) {
            await showModal({
                title: 'Duplicate Name',
                message: 'A person with this name already exists.',
                confirmText: 'OK',
                cancelText: ''
            });
            return;
        }
        person.name = newName.trim();
        saveState();
        render();
    };

    window.removePerson = async function(id) {
        const person = state.people.find(p => p.id === id);
        if (!person) return;
        
        const usedInExpenses = state.expenses.some(e => 
            e.paidBy === id || (e.splitAmong && e.splitAmong.includes(id))
        );
        
        if (usedInExpenses) {
            const response = await showModal({
                title: 'Remove Person',
                message: `"${person.name}" is referenced in expenses. Remove them from all expenses?`,
                confirmText: 'Yes, Remove',
                cancelText: 'Cancel'
            });
            if (!response) return;
            
            state.expenses = state.expenses.filter(e => {
                if (e.paidBy === id) return false;
                if (e.splitAmong) {
                    e.splitAmong = e.splitAmong.filter(pid => pid !== id);
                }
                return true;
            });
        } else {
            const response = await showModal({
                title: 'Remove Person',
                message: `Remove "${person.name}" from the trip?`,
                confirmText: 'Remove',
                cancelText: 'Cancel'
            });
            if (!response) return;
        }
        
        state.people = state.people.filter(p => p.id !== id);
        saveState();
        render();
    };

    window.toggleExpenseForm = function() {
        expenseFormOpen = !expenseFormOpen;
        render();
    };

    window.addExpense = async function() {
        const desc = document.getElementById('expDesc')?.value?.trim();
        const amountRaw = document.getElementById('expAmount')?.value?.trim();
        const payerId = document.getElementById('expPayer')?.value;
        
        if (!desc) {
            await showModal({
                title: 'Missing Description',
                message: 'Please enter a description for this expense.',
                confirmText: 'OK',
                cancelText: ''
            });
            return;
        }
        if (!amountRaw || parseFloat(amountRaw) <= 0) {
            await showModal({
                title: 'Invalid Amount',
                message: 'Please enter a positive amount.',
                confirmText: 'OK',
                cancelText: ''
            });
            return;
        }
        
        const amount = Engine.roundTwo(parseFloat(amountRaw));
        if (isNaN(amount) || amount <= 0) {
            await showModal({
                title: 'Invalid Amount',
                message: 'Please enter a valid number.',
                confirmText: 'OK',
                cancelText: ''
            });
            return;
        }
        
        const checkboxes = document.querySelectorAll('#splitCheckboxes input[type="checkbox"]:checked');
        const splitAmong = Array.from(checkboxes).map(cb => cb.value);
        
        if (splitAmong.length < 1) {
            await showModal({
                title: 'No Split',
                message: 'Select at least one person to split with.',
                confirmText: 'OK',
                cancelText: ''
            });
            return;
        }
        
        if (!state.people.some(p => p.id === payerId)) {
            await showModal({
                title: 'Invalid Payer',
                message: 'Please select a valid payer.',
                confirmText: 'OK',
                cancelText: ''
            });
            return;
        }
        
        const expense = {
            id: generateId(),
            description: desc,
            amount: amount,
            paidBy: payerId,
            splitAmong: splitAmong,
            date: new Date().toISOString().slice(0,10)
        };
        
        state.expenses.push(expense);
        saveState();
        
        // Clear form
        const descInput = document.getElementById('expDesc');
        const amountInput = document.getElementById('expAmount');
        if (descInput) descInput.value = '';
        if (amountInput) amountInput.value = '';
        
        // Close form on mobile
        expenseFormOpen = false;
        render();
    };

    window.deleteExpense = async function(id) {
        const response = await showModal({
            title: 'Delete Expense',
            message: 'Are you sure you want to delete this expense?',
            confirmText: 'Delete',
            cancelText: 'Cancel'
        });
        if (!response) return;
        
        state.expenses = state.expenses.filter(e => e.id !== id);
        saveState();
        render();
    };

    window.exportData = function() {
        const data = JSON.stringify(state, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `expenses-${state.tripName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    window.importData = function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const imported = JSON.parse(e.target.result);
                if (!isValidImport(imported)) {
                    showModal({
                        title: 'Invalid File',
                        message: 'The file format is invalid. Missing people or expenses.',
                        confirmText: 'OK',
                        cancelText: ''
                    });
                    return;
                }
                showModal({
                    title: 'Import Data',
                    message: `This will replace ALL current data with ${imported.people.length} people and ${imported.expenses.length} expenses. Continue?`,
                    confirmText: 'Import',
                    cancelText: 'Cancel'
                }).then((confirmed) => {
                    if (confirmed) {
                        state = imported;
                        if (!state.tripName) state.tripName = 'My Trip';
                        saveState();
                        render();
                    }
                });
            } catch (err) {
                showModal({
                    title: 'Import Error',
                    message: 'Error reading file: ' + err.message,
                    confirmText: 'OK',
                    cancelText: ''
                });
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset file input
    };

    window.resetAll = async function() {
        const response = await showModal({
            title: '⚠️ Reset All Data',
            message: 'This will permanently delete ALL data (people and expenses). This cannot be undone!',
            confirmText: 'Yes, Delete Everything',
            cancelText: 'Cancel'
        });
        if (!response) return;
        
        state.people = [];
        state.expenses = [];
        state.tripName = 'My Trip';
        saveState();
        render();
    };

    // ---- Render ----
    function render() {
        const app = document.getElementById('app');
        const { people, expenses, tripName } = state;
        const balances = Engine.calculate(people, expenses);
        const settlements = Engine.computeSettlements(people, expenses);
        const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
        
        // Create a map for quick name lookup
        const nameMap = {};
        people.forEach(p => nameMap[p.id] = p.name);

        let html = `
            <div class="app">
                <div class="card">
                    <div class="flex-between">
                        <h1>🧾 ${escapeHtml(tripName)}</h1>
                        <div style="display:flex; gap:0.5rem; align-items:center;">
                            <button class="theme-toggle" type="button" aria-label="Switch to ${darkMode ? 'light' : 'dark'} theme" onclick="toggleTheme()">${darkMode ? '☀️' : '🌙'}</button>
                            <button class="danger" onclick="window.resetAll()">Reset All</button>
                        </div>
                    </div>
                    <div class="flex-row" style="margin-top:0.2rem;">
                        <span class="text-muted">${people.length} people · ${expenses.length} expenses · total $${totalExpenses.toFixed(2)}</span>
                    </div>
                </div>

                <!-- People -->
                <div class="card">
                    <div class="flex-between">
                        <h2>👥 People</h2>
                        <span class="badge">${people.length}</span>
                    </div>
                    <div class="flex-row" style="margin-bottom:0.5rem;">
                        <button class="primary" onclick="window.addPerson()">Add Person</button>
                    </div>
                    <div class="pill-group">
                        ${people.map(p => `
                            <span class="pill">
                                ${escapeHtml(p.name)}
                                <button class="edit" type="button" aria-label="Edit ${escapeHtml(p.name)}" onclick="window.editPerson('${p.id}')">✎</button>
                                <button class="remove" type="button" aria-label="Remove ${escapeHtml(p.name)}" onclick="window.removePerson('${p.id}')">✕</button>
                            </span>
                        `).join('')}
                        ${people.length === 0 ? '<span class="text-muted">Add at least 2 people</span>' : ''}
                    </div>
                </div>

                <!-- Add Expense (Collapsible) -->
                <div class="card">
                    <div class="collapse-header" role="button" tabindex="0" aria-expanded="${expenseFormOpen}" onclick="window.toggleExpenseForm()" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); window.toggleExpenseForm(); }">
                        <h2>➕ Add Expense</h2>
                        <span>${expenseFormOpen ? '▼' : '▶'}</span>
                    </div>
                    <div class="collapse-content ${expenseFormOpen ? 'open' : ''}">
                        <div class="flex-row" style="flex-wrap:wrap; gap:0.4rem 0.6rem; margin-top:0.5rem;">
                            <input type="text" id="expDesc" placeholder="Description" style="flex:1; min-width:100px;" />
                            <input type="number" id="expAmount" placeholder="0.00" step="0.01" style="width:110px;" />
                            <select id="expPayer" style="min-width:80px;">
                                ${people.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}
                                ${people.length === 0 ? '<option value="">—</option>' : ''}
                            </select>
                        </div>
                        <div class="checkbox-group" id="splitCheckboxes" style="margin:0.4rem 0 0.2rem;">
                            ${people.map(p => `
                                <label><input type="checkbox" value="${escapeHtml(p.id)}" checked /> ${escapeHtml(p.name)}</label>
                            `).join('')}
                            ${people.length === 0 ? '<span class="text-muted">Add people first</span>' : ''}
                        </div>
                        <button class="primary" onclick="window.addExpense()" ${people.length < 2 ? 'disabled' : ''}>Add expense</button>
                    </div>
                </div>

                <!-- Expense list -->
                <div class="card">
                    <div class="flex-between">
                        <h2>📋 Expenses</h2>
                        <span class="badge">${expenses.length}</span>
                    </div>
                    ${expenses.length === 0 ? '<div class="empty-state">No expenses yet.</div>' : `
                    <div style="overflow-x:auto;">
                        <table>
                            <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Paid by</th><th>Split</th><th></th></tr></thead>
                            <tbody>
                                ${expenses.slice().reverse().map(exp => `
                                    <tr class="expense-row">
                                        <td style="white-space:nowrap;">${exp.date || ''}</td>
                                        <td>${escapeHtml(exp.description)}</td>
                                        <td>$${exp.amount.toFixed(2)}</td>
                                        <td>${escapeHtml(nameMap[exp.paidBy] || 'Unknown')}</td>
                                        <td>${escapeHtml((exp.splitAmong || []).map(id => nameMap[id] || '?').join(', '))}</td>
                                        <td class="actions">
                                            <button type="button" aria-label="Delete ${escapeHtml(exp.description)}" onclick="window.deleteExpense('${exp.id}')" class="danger" style="padding:0.1rem 0.6rem;">✕</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    `}
                </div>

                <!-- Balance summary -->
                <div class="card">
                    <h2>⚖️ Balances</h2>
                    ${people.length === 0 ? '<div class="empty-state">No people</div>' : `
                    <div style="overflow-x:auto;">
                        <table>
                            <thead><tr><th>Person</th><th>Paid</th><th>Fair share</th><th>Balance</th></tr></thead>
                            <tbody>
                                ${Object.values(balances).map(b => {
                                    const cls = b.balance > 0.005 ? 'text-green' : (b.balance < -0.005 ? 'text-red' : '');
                                    return `<tr><td><strong>${escapeHtml(b.name)}</strong></td><td>$${b.paid.toFixed(2)}</td><td>$${b.share.toFixed(2)}</td><td class="${cls}">$${b.balance.toFixed(2)}</td></tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    `}
                </div>

                <!-- Settlement plan -->
                <div class="card" style="border-left:6px solid var(--accent);">
                    <h2>🔄 Settlement plan</h2>
                    ${settlements.length === 0 ? '<div class="empty-state">✨ Everyone is settled up!</div>' : 
                        settlements.map(t => `
                            <div class="settlement-card">
                                <span><strong>${escapeHtml(t.from)}</strong> <span class="arrow">➜</span> <strong>${escapeHtml(t.to)}</strong></span>
                                <span class="text-large">$${t.amount.toFixed(2)}</span>
                            </div>
                        `).join('')
                    }
                </div>

                <!-- Export/Import at the bottom -->
                <div class="card">
                    <div class="flex-between">
                        <h2>💾 Data Management</h2>
                    </div>
                    <div class="flex-row">
                        <button class="secondary" onclick="window.exportData()">📤 Export Data</button>
                        <label class="file-label" for="importFile">📥 Import Data</label>
                        <input type="file" id="importFile" class="import-input" accept=".json" onchange="window.importData(event)" />
                        <span class="text-muted" style="font-size:0.8rem;">Backup or restore your data</span>
                    </div>
                </div>
            </div>
        `;
        app.innerHTML = html;
    }

    // ---- Init ----
    loadState();
    render();

