
/**
 * RentFlow - Application Core Module
 * js/app.js
 *
 * Coordinates:
 * Dashboard, Payments, TenantManager,
 * InvoiceManager, WhatsAppManager and Settings.
 */

(function (window, document) {
    'use strict';

    // ==========================================
    // 1. CONFIGURATION
    // ==========================================

    const PAYMENTS_STORAGE_KEY = 'rentflow_payments';
    const SETTINGS_STORAGE_KEY = 'rentflow_settings';

    const DEFAULT_SETTINGS = {
        propertyName: 'Flat 4B, Sunset Apartments',
        landlordName: 'Property Owner',
        defaultRent: 1200
    };

    let payments = [];
    let settings = { ...DEFAULT_SETTINGS };
    let currentSelectedPeriod = '';

    let elements = {};
    let initialized = false;

    // ==========================================
    // 2. GENERAL HELPERS
    // ==========================================

    function roundMoney(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    function parseMoney(value) {
        if (value === null || value === undefined || value === '') {
            return 0;
        }

        const number = Number(value);

        return Number.isFinite(number) && number >= 0
            ? roundMoney(number)
            : 0;
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(parseMoney(amount));
    }

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        })[char]);
    }

    function generateId() {
        const randomId = window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : Math.random().toString(36).slice(2);

        return 'pay_' + Date.now().toString(36) + '_' +
            randomId.replace(/-/g, '').slice(0, 12);
    }

    function getLocalDateString() {
        const now = new Date();

        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    function isValidPeriod(period) {
        if (typeof period !== 'string' ||
            !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
            return false;
        }

        return true;
    }

    function getCurrentPeriod() {
        if (isValidPeriod(currentSelectedPeriod)) {
            return currentSelectedPeriod;
        }

        const now = new Date();

        return [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0')
        ].join('-');
    }

    function formatPeriodDisplay(periodKey) {
        if (!isValidPeriod(periodKey)) {
            return 'Unknown Period';
        }

        const [year, month] = periodKey.split('-').map(Number);

        return new Date(year, month - 1, 1)
            .toLocaleDateString('en-IN', {
                month: 'long',
                year: 'numeric'
            });
    }

    function isValidDate(value) {
        if (typeof value !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return false;
        }

        const date = new Date(value + 'T00:00:00');

        return !Number.isNaN(date.getTime()) &&
            getDateString(date) === value;
    }

    function getDateString(date) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
    }

    // ==========================================
    // 3. DOM REFERENCES
    // ==========================================

    function cacheDOM() {
        elements = {
            navLinks: document.querySelectorAll(
                '.sidebar-nav .nav-link'
            ),

            contentSections: document.querySelectorAll(
                '.content-section'
            ),

            sidebar: document.querySelector('.sidebar'),
            sidebarToggle: document.getElementById('sidebar-toggle'),
            pageTitle: document.getElementById('page-title'),
            currentDate: document.getElementById('current-date'),

            feedbackContainer: document.getElementById(
                'feedback-container'
            ),

            // Dashboard
            summaryTotalRent: document.getElementById(
                'summary-total-rent'
            ),

            summaryCollectedRent: document.getElementById(
                'summary-collected-rent'
            ),

            summaryPendingRent: document.getElementById(
                'summary-pending-rent'
            ),

            summaryTotalTenants: document.getElementById(
                'summary-total-tenants'
            ),

            monthlyOverviewContent: document.getElementById(
                'monthly-overview-content'
            ),

            // Payment modal
            paymentModal: document.getElementById('payment-modal'),
            paymentForm: document.getElementById('payment-form'),

            paymentTenantSelect: document.getElementById(
                'payment-tenant-select'
            ),

            paymentMonthInput: document.getElementById(
                'payment-month'
            ),

            paymentAmountInput: document.getElementById(
                'payment-amount'
            ),

            paymentDateInput: document.getElementById(
                'payment-date'
            ),

            btnOpenPaymentModal: document.getElementById(
                'btn-open-payment-modal'
            ),

            btnRecordPaymentHeader: document.getElementById(
                'btn-record-payment'
            ),

            paymentModalCloseBtns: document.querySelectorAll(
                '#payment-modal .modal-close-btn, ' +
                '#payment-modal .modal-cancel-btn'
            ),

            // Payment table
            paymentTableBody: document.getElementById(
                'payment-table-body'
            ),

            // Invoice
            invoiceSection: document.getElementById('invoice-section'),

            btnGenerateInvoice: document.getElementById(
                'btn-generate-invoice'
            ),

            invoicePreviewContainer: document.getElementById(
                'invoice-preview-container'
            ),

            // Settings
            settingsForm: document.getElementById('settings-form'),

            settingPropertyName: document.getElementById(
                'setting-property-name'
            ),

            settingLandlordName: document.getElementById(
                'setting-landlord-name'
            ),

            settingDefaultRent: document.getElementById(
                'setting-default-rent'
            )
        };
    }

    // ==========================================
    // 4. FEEDBACK SYSTEM
    // ==========================================

    function showFeedback(message, type = 'info') {
        if (!elements.feedbackContainer) {
            console.log(message);
            return;
        }

        const alertElement = document.createElement('div');

        const allowedTypes = ['error', 'success', 'info'];

        const safeType = allowedTypes.includes(type)
            ? type
            : 'info';

        alertElement.className = `alert alert-${safeType}`;
        alertElement.textContent = message;

        elements.feedbackContainer.replaceChildren(alertElement);

        window.setTimeout(() => {
            if (alertElement.parentNode === elements.feedbackContainer) {
                alertElement.remove();
            }
        }, 4000);
    }

    // ==========================================
    // 5. SETTINGS MANAGEMENT
    // ==========================================

    function loadSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);

            if (raw) {
                const parsed = JSON.parse(raw);

                if (parsed && typeof parsed === 'object' &&
                    !Array.isArray(parsed)) {

                    settings = {
                        propertyName: String(
                            parsed.propertyName || DEFAULT_SETTINGS.propertyName
                        ).trim(),

                        landlordName: String(
                            parsed.landlordName || DEFAULT_SETTINGS.landlordName
                        ).trim(),

                        defaultRent: parseMoney(parsed.defaultRent)
                    };
                }
            }
        } catch (error) {
            console.error('Settings loading failed:', error);
        }

        if (elements.settingPropertyName) {
            elements.settingPropertyName.value = settings.propertyName;
        }

        if (elements.settingLandlordName) {
            elements.settingLandlordName.value = settings.landlordName;
        }

        if (elements.settingDefaultRent) {
            elements.settingDefaultRent.value = settings.defaultRent;
        }
    }

    function saveSettings(event) {
        if (event) {
            event.preventDefault();
        }

        if (
            !elements.settingPropertyName ||
            !elements.settingLandlordName ||
            !elements.settingDefaultRent
        ) {
            showFeedback('Settings form is incomplete.', 'error');
            return;
        }

        const propertyName = elements.settingPropertyName.value.trim();
        const landlordName = elements.settingLandlordName.value.trim();
        const defaultRent = Number(elements.settingDefaultRent.value);

        if (!propertyName || !landlordName) {
            showFeedback('Property and landlord names are required.', 'error');
            return;
        }

        if (!Number.isFinite(defaultRent) || defaultRent < 0) {
            showFeedback('Enter a valid default rent.', 'error');
            return;
        }

        const previousSettings = { ...settings };

        settings = {
            propertyName,
            landlordName,
            defaultRent: roundMoney(defaultRent)
        };

        try {
            localStorage.setItem(
                SETTINGS_STORAGE_KEY,
                JSON.stringify(settings)
            );

            showFeedback('Settings saved successfully.', 'success');
            updateDashboard();

        } catch (error) {
            settings = previousSettings;

            console.error('Settings saving failed:', error);

            showFeedback('Could not save settings.', 'error');
        }
    }

    // ==========================================
    // 6. PAYMENT STORAGE
    // ==========================================

    function loadPayments() {
        try {
            const raw = localStorage.getItem(PAYMENTS_STORAGE_KEY);

            if (!raw) {
                payments = [];
                return;
            }

            const parsed = JSON.parse(raw);

            if (!Array.isArray(parsed)) {
                throw new Error('Payment data must be an array.');
            }

            payments = parsed.filter(payment => {
                return payment &&
                    typeof payment === 'object' &&
                    typeof payment.id === 'string' &&
                    typeof payment.tenantId === 'string' &&
                    Number.isFinite(Number(payment.amount)) &&
                    Number(payment.amount) > 0;
            }).map(payment => ({
                ...payment,
                amount: roundMoney(Number(payment.amount))
            }));

        } catch (error) {
            console.error('Payment storage loading failed:', error);

            payments = [];

            showFeedback(
                'Payment records could not be loaded. Please check your stored data.',
                'error'
            );
        }
    }

    function savePaymentsToStorage() {
        try {
            localStorage.setItem(
                PAYMENTS_STORAGE_KEY,
                JSON.stringify(payments)
            );

            return true;

        } catch (error) {
            console.error('Payment storage failed:', error);

            showFeedback(
                'Payment could not be saved. Storage may be unavailable.',
                'error'
            );

            return false;
        }
    }

    // ==========================================
    // 7. TENANT & PAYMENT CALCULATIONS
    // ==========================================

    function getElapsedMonths(startDateStr, targetPeriod) {
        if (!isValidPeriod(targetPeriod)) {
            return 0;
        }

        if (!startDateStr) {
            return 1;
        }

        const startDate = new Date(startDateStr);

        if (Number.isNaN(startDate.getTime())) {
            return 1;
        }

        const [endYear, endMonth] = targetPeriod
            .split('-')
            .map(Number);

        const startYear = startDate.getFullYear();
        const startMonth = startDate.getMonth() + 1;

        const monthDifference =
            (endYear - startYear) * 12 +
            (endMonth - startMonth) + 1;

        return Math.max(0, monthDifference);
    }

    /**
     * Get all payments for one tenant up to a selected period.
     */
    function getTenantAllTimePaid(tenantId, activePeriod) {
        return roundMoney(
            payments
                .filter(payment => {
                    return (
                        payment.tenantId === tenantId &&
                        isValidPeriod(payment.rentalPeriod) &&
                        payment.rentalPeriod <= activePeriod
                    );
                })
                .reduce((total, payment) => {
                    return total + Number(payment.amount);
                }, 0)
        );
    }

    /**
     * Get payments for one particular rental period.
     */
    function getTenantPeriodPaid(tenantId, period) {
        return roundMoney(
            payments
                .filter(payment => {
                    return (
                        payment.tenantId === tenantId &&
                        payment.rentalPeriod === period
                    );
                })
                .reduce((total, payment) => {
                    return total + Number(payment.amount);
                }, 0)
        );
    }

    /**
     * Calculate cumulative rent and outstanding balance.
     */
    function calculateTenantTotalHistoricalDue(tenant, activePeriod) {
        const monthlyRent = parseMoney(tenant.monthlyRent);

        const elapsedMonths = getElapsedMonths(
            tenant.moveInDate,
            activePeriod
        );

        const totalRentExpectedSinceStart = roundMoney(
            monthlyRent * elapsedMonths
        );

        const totalPaidToDate = getTenantAllTimePaid(
            tenant.id,
            activePeriod
        );

        const totalPending = roundMoney(
            Math.max(
                0,
                totalRentExpectedSinceStart - totalPaidToDate
            )
        );

        let status = 'UNPAID';

        if (totalRentExpectedSinceStart > 0 && totalPending === 0) {
            status = 'PAID';
        } else if (totalPaidToDate > 0 && totalPending > 0) {
            status = 'PARTIAL';
        }

        return {
            tenant,
            monthlyRent,
            elapsedMonths,
            totalRentExpectedSinceStart,
            totalPaidToDate,
            totalPending,
            status
        };
    }

    /**
     * Calculate invoice balances using payment periods.
     *
     * Earlier payments are allocated to earlier rent first.
     * Any excess previous payment is carried forward as credit.
     */
    function calculateInvoiceBalances(tenant, activePeriod, calculation) {
        const previousMonths = Math.max(
            0,
            calculation.elapsedMonths - 1
        );

        const previousExpected = roundMoney(
            calculation.monthlyRent * previousMonths
        );

        const currentPeriodPaid = getTenantPeriodPaid(
            tenant.id,
            activePeriod
        );

        const previousPeriodPaid = roundMoney(
            calculation.totalPaidToDate - currentPeriodPaid
        );

        const previousBalance = roundMoney(
            Math.max(0, previousExpected - previousPeriodPaid)
        );

        const previousCredit = roundMoney(
            Math.max(0, previousPeriodPaid - previousExpected)
        );

        const amountPaid = roundMoney(
            currentPeriodPaid + previousCredit
        );

        return {
            previousExpected,
            previousPeriodPaid,
            currentPeriodPaid,
            previousBalance,
            previousCredit,
            amountPaid
        };
    }

    // ==========================================
    // 8. TENANT DROPDOWN
    // ==========================================

    function populateTenantDropdowns() {
        if (!elements.paymentTenantSelect) {
            return;
        }

        const tenants = window.TenantManager &&
            typeof window.TenantManager.getAll === 'function'
            ? window.TenantManager.getAll()
            : [];

        const previousValue = elements.paymentTenantSelect.value;

        elements.paymentTenantSelect.innerHTML =
            '<option value="">-- Choose Tenant --</option>';

        tenants.forEach(tenant => {
            const option = document.createElement('option');

            option.value = tenant.id;

            option.textContent =
                `${tenant.fullName} (${formatCurrency(tenant.monthlyRent)}/mo)`;

            elements.paymentTenantSelect.appendChild(option);
        });

        const stillExists = tenants.some(
            tenant => tenant.id === previousValue
        );

        elements.paymentTenantSelect.value = stillExists
            ? previousValue
            : '';
    }

    // ==========================================
    // 9. DASHBOARD
    // ==========================================

    function updateDashboard() {
        const tenants = window.TenantManager &&
            typeof window.TenantManager.getAll === 'function'
            ? window.TenantManager.getAll()
            : [];

        const activePeriod = getCurrentPeriod();

        let totalExpectedRent = 0;
        let totalCollectedRent = 0;
        let totalPendingRent = 0;

        const tenantStatuses = tenants.map(tenant => {
            const statistics = calculateTenantTotalHistoricalDue(
                tenant,
                activePeriod
            );

            totalExpectedRent += statistics.totalRentExpectedSinceStart;
            totalCollectedRent += statistics.totalPaidToDate;
            totalPendingRent += statistics.totalPending;

            return statistics;
        });

        if (elements.summaryTotalRent) {
            elements.summaryTotalRent.textContent =
                formatCurrency(totalExpectedRent);
        }

        if (elements.summaryCollectedRent) {
            elements.summaryCollectedRent.textContent =
                formatCurrency(totalCollectedRent);
        }

        if (elements.summaryPendingRent) {
            elements.summaryPendingRent.textContent =
                formatCurrency(totalPendingRent);
        }

        if (elements.summaryTotalTenants) {
            elements.summaryTotalTenants.textContent =
                String(tenants.length);
        }

        renderMonthlyOverview(tenantStatuses, activePeriod);
        renderPaymentTable();
    }

    // ==========================================
    // 10. MONTHLY OVERVIEW
    // ==========================================

    function renderMonthlyOverview(tenantStatuses, period) {
        const container = elements.monthlyOverviewContent;

        if (!container) {
            return;
        }

        if (tenantStatuses.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;">
                    <p>No active tenants configured.</p>

                    <button type="button"
                        class="btn btn-primary btn-open-tenant-modal">
                        Add Your First Tenant
                    </button>
                </div>
            `;

            return;
        }

        container.innerHTML = '';

        tenantStatuses.forEach(statistics => {
            const {
                tenant,
                monthlyRent,
                elapsedMonths,
                totalRentExpectedSinceStart,
                totalPaidToDate,
                totalPending,
                status
            } = statistics;

            const card = document.createElement('div');

            card.className = 'card';
            card.style.padding = '1.25rem';
            card.style.marginBottom = '0';

            const badgeClass = {
                'PAID': 'badge-success',
                'PARTIAL': 'badge-warning',
                'UNPAID': 'badge-danger'
            }[status];

            card.innerHTML = `
                <div style="
                    display:flex;
                    justify-content:space-between;
                    align-items:flex-start;
                    margin-bottom:0.75rem;
                    gap:0.5rem;
                ">
                    <div>
                        <h4 style="font-weight:600;font-size:1.05rem;">
                            ${escapeHTML(tenant.fullName)}
                        </h4>

                        <span class="text-muted" style="font-size:0.85rem;">
                            Since: ${escapeHTML(tenant.moveInDate || 'N/A')}
                            (${elapsedMonths} mos)
                        </span>
                    </div>

                    <span class="badge ${badgeClass}">
                        ${status}
                    </span>
                </div>

                <div class="rent-stat-row">
                    <span>Monthly Rate:</span>
                    <span>${formatCurrency(monthlyRent)}</span>
                </div>

                <div class="rent-stat-row">
                    <span>Total Due (${elapsedMonths} mos):</span>
                    <span>${formatCurrency(totalRentExpectedSinceStart)}</span>
                </div>

                <div class="rent-stat-row">
                    <span>Total Paid:</span>
                    <span class="text-success">
                        ${formatCurrency(totalPaidToDate)}
                    </span>
                </div>

                <div class="rent-stat-row" style="
                    border-top:1px dashed #334155;
                    padding-top:0.5rem;
                    margin-top:0.5rem;
                ">
                    <span>Remaining Balance:</span>

                    <strong class="${
                        totalPending > 0 ? 'text-danger' : 'text-success'
                    }">
                        ${formatCurrency(totalPending)}
                    </strong>
                </div>

                <div class="action-buttons">
                    <button type="button"
                        class="btn btn-secondary btn-sm btn-quick-invoice"
                        data-tenant-id="${escapeHTML(tenant.id)}">
                        Invoice
                    </button>

                    <button type="button"
                        class="btn btn-secondary btn-sm btn-quick-whatsapp"
                        data-tenant-id="${escapeHTML(tenant.id)}"
                        data-status="${status}">
                        WhatsApp
                    </button>
                </div>
            `;

            container.appendChild(card);
        });
    }

    // ==========================================
    // 11. PAYMENT TABLE
    // ==========================================

    function renderPaymentTable() {
        const container = elements.paymentTableBody;

        if (!container) {
            return;
        }

        container.innerHTML = '';

        if (payments.length === 0) {
            const row = document.createElement('tr');

            row.innerHTML = `
                <td colspan="6" class="text-muted"
                    style="text-align:center;padding:2rem;">
                    No rent payments recorded yet.
                </td>
            `;

            container.appendChild(row);
            return;
        }

        const tenants = window.TenantManager &&
            typeof window.TenantManager.getAll === 'function'
            ? window.TenantManager.getAll()
            : [];

        const tenantMap = new Map(
            tenants.map(tenant => [tenant.id, tenant])
        );

        const sortedPayments = payments.slice().reverse();

        sortedPayments.forEach(payment => {
            const tenant = tenantMap.get(payment.tenantId);

            const tenantName = tenant
                ? tenant.fullName
                : 'Former / Unknown Tenant';

            const monthlyDue = tenant
                ? tenant.monthlyRent
                : 0;

            const row = document.createElement('tr');

            row.innerHTML = `
                <td>
                    <strong>${escapeHTML(tenantName)}</strong>
                </td>

                <td>
                    ${escapeHTML(
                        formatPeriodDisplay(payment.rentalPeriod)
                    )}
                </td>

                <td>${formatCurrency(monthlyDue)}</td>

                <td class="text-success">
                    ${formatCurrency(payment.amount)}
                </td>

                <td>
                    <span class="badge badge-success">RECORDED</span>
                </td>

                <td>
                    <div class="action-buttons">
                        <button type="button"
                            class="btn btn-danger btn-sm btn-delete-payment"
                            data-id="${escapeHTML(payment.id)}">
                            Delete
                        </button>
                    </div>
                </td>
            `;

            container.appendChild(row);
        });
    }

    // ==========================================
    // 12. PAYMENT MODAL
    // ==========================================

    function openPaymentModal(preselectedTenantId = null) {
        if (!elements.paymentModal || !elements.paymentForm) {
            showFeedback('Payment modal not found.', 'error');
            return;
        }

        elements.paymentForm.reset();

        populateTenantDropdowns();

        if (preselectedTenantId && elements.paymentTenantSelect) {
            elements.paymentTenantSelect.value = preselectedTenantId;
        }

        if (elements.paymentMonthInput) {
            elements.paymentMonthInput.value = getCurrentPeriod();
        }

        if (elements.paymentDateInput) {
            elements.paymentDateInput.value = getLocalDateString();
        }

        elements.paymentModal.classList.add('open');

        elements.paymentModal.setAttribute('aria-hidden', 'false');
    }

    function closePaymentModal() {
        if (!elements.paymentModal) {
            return;
        }

        elements.paymentModal.classList.remove('open');

        elements.paymentModal.setAttribute('aria-hidden', 'true');

        if (elements.paymentForm) {
            elements.paymentForm.reset();
        }
    }

    // ==========================================
    // 13. RECORD PAYMENT
    // ==========================================

    function handlePaymentFormSubmit(event) {
        event.preventDefault();

        if (
            !elements.paymentTenantSelect ||
            !elements.paymentMonthInput ||
            !elements.paymentAmountInput ||
            !elements.paymentDateInput
        ) {
            showFeedback('Payment form is incomplete.', 'error');
            return;
        }

        const tenantId = elements.paymentTenantSelect.value;
        const rentalPeriod = elements.paymentMonthInput.value;
        const amount = Number(elements.paymentAmountInput.value);
        const paymentDate = elements.paymentDateInput.value;

        const tenants = window.TenantManager &&
            typeof window.TenantManager.getAll === 'function'
            ? window.TenantManager.getAll()
            : [];

        const tenantExists = tenants.some(
            tenant => tenant.id === tenantId
        );

        if (!tenantId || !tenantExists) {
            showFeedback('Please select a valid tenant.', 'error');
            return;
        }

        if (!isValidPeriod(rentalPeriod)) {
            showFeedback('Please select a valid rental period.', 'error');
            return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            showFeedback(
                'Payment amount must be greater than zero.',
                'error'
            );
            return;
        }

        if (!isValidDate(paymentDate)) {
            showFeedback('Please select a valid payment date.', 'error');
            return;
        }

        const newPayment = {
            id: generateId(),
            tenantId,
            rentalPeriod,
            amount: roundMoney(amount),
            paymentDate,
            paymentMethod: 'Standard'
        };

        payments.push(newPayment);

        // Never show success if storage fails.
        if (!savePaymentsToStorage()) {
            payments.pop();
            return;
        }

        closePaymentModal();
        updateDashboard();

        showFeedback('Payment recorded successfully.', 'success');
    }

    // ==========================================
    // 14. DELETE PAYMENT
    // ==========================================

    function deletePayment(paymentId) {
        const index = payments.findIndex(
            payment => payment.id === paymentId
        );

        if (index === -1) {
            showFeedback('Payment record not found.', 'error');
            return;
        }

        const payment = payments[index];

        const confirmed = window.confirm(
            `Delete payment of ${formatCurrency(payment.amount)}?`
        );

        if (!confirmed) {
            return;
        }

        const removedPayment = payments.splice(index, 1)[0];

        if (!savePaymentsToStorage()) {
            payments.splice(index, 0, removedPayment);
            return;
        }

        updateDashboard();

        showFeedback('Payment record deleted.', 'success');
    }

    // ==========================================
    // 15. INVOICE GENERATION
    // ==========================================

    function getInvoiceManager() {
        return window.InvoiceManager || window.RentFlowInvoice || null;
    }

    function triggerInvoiceAction(tenantId, action = 'preview') {
        const invoiceManager = getInvoiceManager();

        if (!invoiceManager) {
            showFeedback('Invoice module not loaded.', 'error');
            return false;
        }

        const tenantManager = window.TenantManager;

        const tenant = tenantManager &&
            typeof tenantManager.getById === 'function'
            ? tenantManager.getById(tenantId)
            : null;

        if (!tenant) {
            showFeedback('Tenant record not found.', 'error');
            return false;
        }

        const period = getCurrentPeriod();

        const calculation = calculateTenantTotalHistoricalDue(
            tenant,
            period
        );

        const balances = calculateInvoiceBalances(
            tenant,
            period,
            calculation
        );

        const invoicePayload = {
            rentalPeriod: formatPeriodDisplay(period),

            tenant: {
                id: tenant.id,
                fullName: tenant.fullName,
                phone: tenant.phone,
                email: tenant.email,
                unitNumber: settings.propertyName
            },

            landlord: {
                name: settings.landlordName,
                propertyName: settings.propertyName
            },

            charges: {
                monthlyRent: calculation.elapsedMonths > 0
                    ? calculation.monthlyRent
                    : 0,

                additionalCharges: 0,

                previousBalance: balances.previousBalance
            },

            amountPaid: balances.amountPaid
        };

        if (action === 'download') {
            if (typeof invoiceManager.downloadPDF !== 'function') {
                showFeedback('PDF generation is unavailable.', 'error');
                return false;
            }

            return invoiceManager.downloadPDF(invoicePayload);
        }

        if (typeof invoiceManager.renderPreview !== 'function') {
            showFeedback('Invoice preview is unavailable.', 'error');
            return false;
        }

        navigateToSection('invoice-section');

        return invoiceManager.renderPreview(
            invoicePayload,
            'invoice-preview-container'
        );
    }

    // ==========================================
    // 16. WHATSAPP INTEGRATION
    // ==========================================

    function triggerWhatsAppAction(tenantId, status) {
        const manager = window.WhatsAppManager;

        if (!manager) {
            showFeedback('WhatsApp module not loaded.', 'error');
            return false;
        }

        const tenant = window.TenantManager &&
            typeof window.TenantManager.getById === 'function'
            ? window.TenantManager.getById(tenantId)
            : null;

        if (!tenant) {
            showFeedback('Tenant not found.', 'error');
            return false;
        }

        const period = getCurrentPeriod();

        const calculation = calculateTenantTotalHistoricalDue(
            tenant,
            period
        );

        const periodName = formatPeriodDisplay(period);

        const messageData = {
            month: periodName,
            amountPaid: calculation.totalPaidToDate,
            amountDue: calculation.totalPending,
            balanceRemaining: calculation.totalPending,
            paymentDate: getLocalDateString()
        };

        let message = '';

        if (status === 'PAID') {
            if (typeof manager.generateConfirmationMessage !== 'function') {
                showFeedback('WhatsApp confirmation generator unavailable.', 'error');
                return false;
            }

            message = manager.generateConfirmationMessage(
                tenant,
                messageData
            );

        } else if (status === 'PARTIAL') {
            if (typeof manager.generatePendingSummaryMessage !== 'function') {
                showFeedback('WhatsApp pending message generator unavailable.', 'error');
                return false;
            }

            message = manager.generatePendingSummaryMessage(
                tenant,
                messageData
            );

        } else {
            if (typeof manager.generateReminderMessage !== 'function') {
                showFeedback('WhatsApp reminder generator unavailable.', 'error');
                return false;
            }

            message = manager.generateReminderMessage(
                tenant,
                messageData
            );
        }

        const confirmed = window.confirm(
            `Preview message for ${tenant.fullName}:\n\n` +
            `${message}\n\nProceed to WhatsApp?`
        );

        if (!confirmed) {
            return false;
        }

        if (typeof manager.openWhatsAppChat !== 'function') {
            showFeedback('WhatsApp chat function unavailable.', 'error');
            return false;
        }

        manager.openWhatsAppChat(tenant.phone, message);

        return true;
    }

    // ==========================================
    // 17. NAVIGATION
    // ==========================================

    function navigateToSection(targetSectionId) {
        if (!targetSectionId) {
            return;
        }

        elements.contentSections.forEach(section => {
            section.classList.toggle(
                'active',
                section.id === targetSectionId
            );
        });

        elements.navLinks.forEach(link => {
            const target = link.getAttribute('data-target');

            link.classList.toggle(
                'active',
                target === targetSectionId
            );
        });

        const activeLink = Array.from(elements.navLinks).find(
            link => link.getAttribute('data-target') === targetSectionId
        );

        if (activeLink && elements.pageTitle) {
            elements.pageTitle.textContent =
                activeLink.textContent.trim();
        }

        if (elements.sidebar) {
            elements.sidebar.classList.remove('open');
        }
    }

    // ==========================================
    // 18. EVENT LISTENERS
    // ==========================================

    function attachEventListeners() {

        // Sidebar navigation
        elements.navLinks.forEach(link => {
            link.addEventListener('click', event => {
                event.preventDefault();

                const target = link.getAttribute('data-target');

                if (target) {
                    navigateToSection(target);
                }
            });
        });

        // Sidebar toggle
        if (elements.sidebarToggle) {
            elements.sidebarToggle.addEventListener('click', () => {
                if (elements.sidebar) {
                    elements.sidebar.classList.toggle('open');
                }
            });
        }

        // Close sidebar when clicking outside.
        document.addEventListener('click', event => {
            if (
                !elements.sidebar ||
                !elements.sidebar.classList.contains('open')
            ) {
                return;
            }

            const clickedInsideSidebar =
                elements.sidebar.contains(event.target);

            const clickedToggle =
                elements.sidebarToggle &&
                elements.sidebarToggle.contains(event.target);

            if (!clickedInsideSidebar && !clickedToggle) {
                elements.sidebar.classList.remove('open');
            }
        });

        // Open payment modal
        if (elements.btnOpenPaymentModal) {
            elements.btnOpenPaymentModal.addEventListener(
                'click',
                () => openPaymentModal()
            );
        }

        if (elements.btnRecordPaymentHeader) {
            elements.btnRecordPaymentHeader.addEventListener(
                'click',
                () => openPaymentModal()
            );
        }

        // Close payment modal
        elements.paymentModalCloseBtns.forEach(button => {
            button.addEventListener('click', closePaymentModal);
        });

        if (elements.paymentModal) {
            elements.paymentModal.addEventListener('click', event => {
                if (event.target === elements.paymentModal) {
                    closePaymentModal();
                }
            });
        }

        // Payment submission
        if (elements.paymentForm) {
            elements.paymentForm.addEventListener(
                'submit',
                handlePaymentFormSubmit
            );
        }

        // Payment deletion (event delegation)
        if (elements.paymentTableBody) {
            elements.paymentTableBody.addEventListener('click', event => {
                const button = event.target.closest(
                    '.btn-delete-payment'
                );

                if (!button) {
                    return;
                }

                deletePayment(button.getAttribute('data-id'));
            });
        }

        // Dashboard quick actions
        if (elements.monthlyOverviewContent) {
            elements.monthlyOverviewContent.addEventListener(
                'click',
                event => {

                    const invoiceButton = event.target.closest(
                        '.btn-quick-invoice'
                    );

                    if (invoiceButton) {
                        triggerInvoiceAction(
                            invoiceButton.getAttribute('data-tenant-id'),
                            'preview'
                        );

                        return;
                    }

                    const whatsappButton = event.target.closest(
                        '.btn-quick-whatsapp'
                    );

                    if (whatsappButton) {
                        triggerWhatsAppAction(
                            whatsappButton.getAttribute('data-tenant-id'),
                            whatsappButton.getAttribute('data-status')
                        );
                    }
                }
            );
        }

        // Main invoice button
        if (elements.btnGenerateInvoice) {
            elements.btnGenerateInvoice.addEventListener('click', () => {
                const tenants = window.TenantManager &&
                    typeof window.TenantManager.getAll === 'function'
                    ? window.TenantManager.getAll()
                    : [];

                if (tenants.length === 0) {
                    showFeedback(
                        'No tenants available to generate invoice.',
                        'error'
                    );

                    return;
                }

                const selectedTenantId =
                    elements.paymentTenantSelect?.value;

                if (selectedTenantId) {
                    triggerInvoiceAction(
                        selectedTenantId,
                        'download'
                    );

                } else if (tenants.length === 1) {
                    triggerInvoiceAction(
                        tenants[0].id,
                        'download'
                    );

                } else {
                    showFeedback(
                        'Please select a tenant from the payment tenant dropdown first.',
                        'error'
                    );
                }
            });
        }

        // Settings form
        if (elements.settingsForm) {
            elements.settingsForm.addEventListener(
                'submit',
                saveSettings
            );
        }

        // Tenant manager updates
        window.addEventListener('rentflow:tenants-changed', () => {
            populateTenantDropdowns();
            updateDashboard();
        });
    }

    // ==========================================
    // 19. DATE DISPLAY
    // ==========================================

    function renderCurrentDate() {
        if (!elements.currentDate) {
            return;
        }

        elements.currentDate.textContent =
            new Date().toLocaleDateString('en-IN', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
    }

    // ==========================================
    // 20. APPLICATION INITIALIZATION
    // ==========================================

    function init() {
        if (initialized) {
            return;
        }

        initialized = true;

        cacheDOM();

        currentSelectedPeriod = getCurrentPeriod();

        renderCurrentDate();

        loadSettings();
        loadPayments();

        // Initialize tenant module first.
        if (
            window.TenantManager &&
            typeof window.TenantManager.init === 'function'
        ) {
            window.TenantManager.init();
        }

        populateTenantDropdowns();

        attachEventListeners();

        updateDashboard();

        console.log('RentFlow application initialized successfully.');
    }

    // ==========================================
    // 21. PUBLIC APPLICATION API
    // ==========================================

    window.RentFlowApp = {
        init,
        updateDashboard,
        openPaymentModal,
        closePaymentModal,
        triggerInvoiceAction,
        triggerWhatsAppAction,
        navigateToSection,
        getCurrentPeriod,
        formatCurrency,
        calculateTenantTotalHistoricalDue,
        calculateInvoiceBalances,

        // Period setter for future filtering UI.
        setSelectedPeriod(period) {
            if (!isValidPeriod(period)) {
                showFeedback('Invalid rental period.', 'error');
                return false;
            }

            currentSelectedPeriod = period;
            updateDashboard();

            return true;
        },

        getPayments() {
            return payments.map(payment => ({ ...payment }));
        },

        getSettings() {
            return { ...settings };
        }
    };

    // ==========================================
    // 22. START APPLICATION
    // ==========================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, {
            once: true
        });
    } else {
        init();
    }

})(window, document);
