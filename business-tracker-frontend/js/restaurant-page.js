(function () {
    const state = {
        mode: document.body.dataset.mode || 'manager',
        user: null,
        userData: null,
        hotelId: null,
        hotelName: '',
        orders: [],
        editingId: null,
        displayCurrency: 'LKR',
        exchangeRate: null
    };

    const auth = firebase.auth();
    const db = firebase.firestore();
    const canManage = () => state.mode === 'manager' && state.userData && state.userData.role !== 'staff';
    const canDownload = () => state.mode === 'owner' || (state.userData && state.userData.role !== 'staff');
    const byId = id => document.getElementById(id);

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[char]);
    }

    function getDisplayAmount(amount, originalCurrency) {
        const original = FinanceUtils.normalizeCurrency(originalCurrency);
        if (original === state.displayCurrency) return Number(amount || 0);
        if (!state.exchangeRate) return Number(amount || 0);
        return FinanceUtils.convertAmount(amount, original, state.displayCurrency, state.exchangeRate.rate);
    }

    function formatDisplayAmount(amount, originalCurrency) {
        const original = FinanceUtils.normalizeCurrency(originalCurrency);
        if (!state.exchangeRate && original !== state.displayCurrency) {
            return FinanceUtils.formatMoney(amount, original);
        }
        return FinanceUtils.formatMoney(getDisplayAmount(amount, original), state.displayCurrency);
    }

    async function loadRate() {
        const rateLabel = byId('exchangeRateLabel');
        try {
            state.exchangeRate = await ExchangeRateService.loadUsdToLkrRate(db);
            if (rateLabel) rateLabel.textContent = ExchangeRateService.describeRate(state.exchangeRate);
        } catch (error) {
            state.exchangeRate = null;
            if (rateLabel) {
                rateLabel.textContent = `Exchange rate unavailable: ${error.message}`;
                rateLabel.classList.add('error');
            }
        }
        renderOrders();
    }

    async function resolveHotel(user) {
        const userSnapshot = await db.collection('users').doc(user.uid).get();
        if (!userSnapshot.exists) throw new Error('User profile was not found.');
        state.userData = userSnapshot.data();

        if (state.mode === 'owner') {
            if (state.userData.role !== 'owner') throw new Error('Owner access is required.');
            state.hotelId = localStorage.getItem('selectedHotelId');
            state.hotelName = localStorage.getItem('selectedHotelName') || '';
            if (!state.hotelId) {
                window.location.href = 'owner-select-hotel.html';
                return false;
            }
        } else {
            if (!['manager', 'staff'].includes(state.userData.role)) throw new Error('Manager or staff access is required.');
            state.hotelId = state.userData.role === 'staff' ? state.userData.hotelId : user.uid;
            state.hotelName = state.userData.businessName || state.userData.hotelName || '';
            if (!state.hotelId) throw new Error('No hotel is assigned to this account.');
        }
        return true;
    }

    async function loadOrders() {
        const snapshot = await db.collection('restaurantOrders').where('hotelId', '==', state.hotelId).get();
        state.orders = [];
        snapshot.forEach(doc => state.orders.push({ id: doc.id, ...doc.data() }));
        state.orders.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.orderNumber || '').localeCompare(a.orderNumber || ''));
        renderOrders();
    }

    function filteredOrders() {
        const status = byId('statusFilter').value;
        const currency = byId('currencyFilter').value;
        const startDate = byId('startDateFilter').value;
        const endDate = byId('endDateFilter').value;
        return state.orders.filter(order => {
            if (status !== 'all' && (order.paymentStatus || 'pending') !== status) return false;
            if (!FinanceUtils.matchesOriginalCurrency(order, currency)) return false;
            if (startDate && order.date < startDate) return false;
            if (endDate && order.date > endDate) return false;
            return true;
        });
    }

    function renderOrders() {
        const tableBody = byId('restaurantTableBody');
        if (!tableBody) return;
        const filtered = filteredOrders();
        const paidTotal = filtered
            .filter(order => order.paymentStatus === 'paid')
            .reduce((sum, order) => sum + getDisplayAmount(order.totalAmount, order.currency), 0);

        byId('orderCount').textContent = String(filtered.length);
        byId('paidTotal').textContent = FinanceUtils.formatMoney(paidTotal, state.displayCurrency);

        if (!filtered.length) {
            tableBody.innerHTML = '<tr><td colspan="9" class="empty">No restaurant orders match these filters.</td></tr>';
            return;
        }

        tableBody.innerHTML = filtered.map((order, index) => {
            const items = Array.isArray(order.items) ? order.items : [];
            const itemSummary = items.map(item => `${escapeHtml(item.name)} × ${Number(item.quantity || 0)}`).join(', ');
            const actions = canManage() ? `
                <div class="row-actions">
                    <button class="btn secondary" type="button" data-action="edit" data-id="${order.id}">Edit</button>
                    <button class="btn danger" type="button" data-action="delete" data-id="${order.id}">Delete</button>
                </div>` : 'Read only';
            return `<tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(order.date || '—')}</td>
                <td><strong>${escapeHtml(order.orderNumber || order.id)}</strong><br>${escapeHtml(order.customerName || order.roomNumber || '')}</td>
                <td>${itemSummary || '—'}</td>
                <td>${FinanceUtils.normalizeCurrency(order.currency)}</td>
                <td>${formatDisplayAmount(order.totalAmount, order.currency)}</td>
                <td><span class="badge ${order.paymentStatus === 'paid' ? 'paid' : 'pending'}">${order.paymentStatus === 'paid' ? 'Paid' : 'Pending'}</span></td>
                <td>${escapeHtml(order.createdBy || '—')}</td>
                <td>${actions}</td>
            </tr>`;
        }).join('');
    }

    function addItemRow(item) {
        const container = byId('itemsContainer');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `
            <input class="item-name" type="text" placeholder="Item or menu name" value="${escapeHtml(item && item.name)}" required>
            <input class="item-quantity" type="number" min="1" step="1" value="${Number(item && item.quantity) || 1}" required>
            <input class="item-price" type="number" min="0" step="0.01" placeholder="Unit price" value="${item && Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : ''}" required>
            <button class="icon-btn remove-item" type="button" aria-label="Remove item">Remove</button>`;
        container.appendChild(row);
        updateFormTotal();
    }

    function readItems() {
        return Array.from(document.querySelectorAll('#itemsContainer .item-row')).map(row => ({
            name: row.querySelector('.item-name').value.trim(),
            quantity: Number(row.querySelector('.item-quantity').value),
            unitPrice: Number(row.querySelector('.item-price').value)
        }));
    }

    function validItems(items) {
        return items.length > 0 && items.every(item => item.name && Number.isInteger(item.quantity) && item.quantity > 0 && Number.isFinite(item.unitPrice) && item.unitPrice >= 0);
    }

    function updateFormTotal() {
        const total = FinanceUtils.calculateRestaurantTotal(readItems());
        const currency = byId('orderCurrency') ? byId('orderCurrency').value : 'LKR';
        if (byId('formTotal')) byId('formTotal').textContent = FinanceUtils.formatMoney(total, currency);
    }

    function resetForm() {
        const form = byId('restaurantForm');
        if (!form) return;
        form.reset();
        state.editingId = null;
        byId('formTitle').textContent = 'Add Restaurant Order';
        byId('submitOrderBtn').textContent = 'Save Order';
        byId('cancelEditBtn').hidden = true;
        byId('orderDate').value = new Date().toISOString().slice(0, 10);
        byId('itemsContainer').innerHTML = '';
        addItemRow();
    }

    function editOrder(id) {
        if (!canManage()) return;
        const order = state.orders.find(item => item.id === id);
        if (!order) return;
        state.editingId = id;
        byId('formTitle').textContent = 'Edit Restaurant Order';
        byId('submitOrderBtn').textContent = 'Update Order';
        byId('cancelEditBtn').hidden = false;
        byId('orderDate').value = order.date || '';
        byId('orderNumber').value = order.orderNumber || '';
        byId('customerName').value = order.customerName || '';
        byId('roomNumber').value = order.roomNumber || '';
        byId('orderCurrency').value = FinanceUtils.normalizeCurrency(order.currency);
        byId('paymentStatus').value = order.paymentStatus || 'pending';
        byId('orderNotes').value = order.notes || '';
        byId('itemsContainer').innerHTML = '';
        (Array.isArray(order.items) && order.items.length ? order.items : [{}]).forEach(addItemRow);
        updateFormTotal();
        byId('restaurantFormPanel').scrollIntoView({ behavior: 'smooth' });
    }

    async function saveOrder(event) {
        event.preventDefault();
        if (!canManage()) return;
        const items = readItems();
        if (!validItems(items)) {
            alert('Add at least one valid item with a name, quantity, and non-negative price.');
            return;
        }

        const orderId = state.editingId;
        const orderRef = orderId
            ? db.collection('restaurantOrders').doc(orderId)
            : db.collection('restaurantOrders').doc();
        const finalOrderId = orderRef.id;
        const oldOrder = orderId ? state.orders.find(order => order.id === orderId) : null;
        const now = firebase.firestore.FieldValue.serverTimestamp();
        const order = {
            hotelId: state.hotelId,
            date: byId('orderDate').value,
            orderNumber: byId('orderNumber').value.trim() || finalOrderId.slice(0, 8).toUpperCase(),
            customerName: byId('customerName').value.trim(),
            roomNumber: byId('roomNumber').value.trim(),
            items,
            totalAmount: FinanceUtils.calculateRestaurantTotal(items),
            currency: FinanceUtils.normalizeCurrency(byId('orderCurrency').value),
            paymentStatus: byId('paymentStatus').value,
            notes: byId('orderNotes').value.trim(),
            createdBy: oldOrder && oldOrder.createdBy
                ? oldOrder.createdBy
                : (state.userData.name || state.userData.username || state.user.email || 'Unknown'),
            updatedAt: now
        };
        if (!order.date || order.totalAmount <= 0) {
            alert('Enter a valid date and a total greater than zero.');
            return;
        }

        const incomeRef = db.collection('income').doc(FinanceUtils.restaurantIncomeDocumentId(finalOrderId));
        const income = FinanceUtils.buildRestaurantIncome(finalOrderId, order);
        const batch = db.batch();
        if (orderId) batch.update(orderRef, order);
        else batch.set(orderRef, { ...order, createdAt: now });
        if (income) {
            batch.set(incomeRef, { ...income, updatedAt: now, createdAt: oldOrder ? (oldOrder.createdAt || now) : now }, { merge: true });
        } else {
            batch.delete(incomeRef);
        }

        const button = byId('submitOrderBtn');
        button.disabled = true;
        try {
            await batch.commit();
            resetForm();
            await loadOrders();
            alert(`Restaurant order ${orderId ? 'updated' : 'created'} successfully.`);
        } catch (error) {
            alert(`Unable to save restaurant order: ${error.message}`);
        } finally {
            button.disabled = false;
        }
    }

    async function deleteOrder(id) {
        if (!canManage() || !confirm('Delete this restaurant order and any linked income?')) return;
        const order = state.orders.find(item => item.id === id);
        if (!order || order.hotelId !== state.hotelId) return;
        const batch = db.batch();
        batch.delete(db.collection('restaurantOrders').doc(id));
        batch.delete(db.collection('income').doc(FinanceUtils.restaurantIncomeDocumentId(id)));
        try {
            await batch.commit();
            await loadOrders();
        } catch (error) {
            alert(`Unable to delete restaurant order: ${error.message}`);
        }
    }

    function downloadReport() {
        if (!canDownload()) return;
        const orders = filteredOrders();
        if (!orders.length) return alert('No restaurant orders match the current filters.');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        doc.setFontSize(18);
        doc.text('Restaurant Orders Report', 14, 18);
        doc.setFontSize(9);
        doc.text(`Hotel: ${state.hotelName || state.hotelId}`, 14, 25);
        doc.text(ExchangeRateService.describeRate(state.exchangeRate), 14, 31);
        doc.text(`Display currency: ${state.displayCurrency}`, 14, 37);
        doc.autoTable({
            startY: 43,
            head: [['#', 'Date', 'Order', 'Customer / Room', 'Items', 'Paid Currency', `Amount (${state.displayCurrency})`, 'Payment']],
            body: orders.map((order, index) => [
                index + 1,
                order.date || '—',
                order.orderNumber || order.id,
                order.customerName || order.roomNumber || '—',
                (order.items || []).map(item => `${item.name} x${item.quantity}`).join(', '),
                FinanceUtils.normalizeCurrency(order.currency),
                getDisplayAmount(order.totalAmount, order.currency).toFixed(state.displayCurrency === 'USD' ? 2 : 0),
                order.paymentStatus || 'pending'
            ]),
            styles: { fontSize: 7 },
            headStyles: { fillColor: [85, 115, 115] }
        });
        doc.save(`restaurant-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    }

    function wireEvents() {
        ['statusFilter', 'currencyFilter', 'startDateFilter', 'endDateFilter'].forEach(id => byId(id).addEventListener('change', renderOrders));
        byId('displayCurrency').addEventListener('change', event => {
            state.displayCurrency = FinanceUtils.normalizeCurrency(event.target.value);
            renderOrders();
        });
        byId('downloadReportBtn').addEventListener('click', downloadReport);
        byId('logoutBtn').addEventListener('click', async () => {
            if (state.mode === 'owner') {
                localStorage.removeItem('selectedHotelId');
                localStorage.removeItem('selectedHotelName');
            }
            await auth.signOut();
            window.location.href = 'index.html';
        });

        const tableBody = byId('restaurantTableBody');
        tableBody.addEventListener('click', event => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            if (button.dataset.action === 'edit') editOrder(button.dataset.id);
            if (button.dataset.action === 'delete') deleteOrder(button.dataset.id);
        });

        const form = byId('restaurantForm');
        if (form) {
            form.addEventListener('submit', saveOrder);
            byId('addItemBtn').addEventListener('click', () => addItemRow());
            byId('cancelEditBtn').addEventListener('click', resetForm);
            byId('orderCurrency').addEventListener('change', updateFormTotal);
            byId('itemsContainer').addEventListener('input', updateFormTotal);
            byId('itemsContainer').addEventListener('click', event => {
                const button = event.target.closest('.remove-item');
                if (!button) return;
                if (document.querySelectorAll('#itemsContainer .item-row').length === 1) return;
                button.closest('.item-row').remove();
                updateFormTotal();
            });
            resetForm();
        }
    }

    auth.onAuthStateChanged(async user => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        state.user = user;
        try {
            const resolved = await resolveHotel(user);
            if (!resolved) return;
            if (byId('hotelName')) byId('hotelName').textContent = state.hotelName || 'Selected Hotel';
            if (!canManage() && byId('restaurantFormPanel')) byId('restaurantFormPanel').hidden = true;
            if (!canDownload()) byId('downloadReportBtn').hidden = true;
            wireEvents();
            await Promise.all([loadOrders(), loadRate()]);
        } catch (error) {
            console.error(error);
            alert(error.message);
            window.location.href = state.mode === 'owner' ? 'owner-select-hotel.html' : 'index.html';
        }
    });
})();
