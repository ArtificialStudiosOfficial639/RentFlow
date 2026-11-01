/**
 * RentFlow - Application Core Module (js/app.js)
 * Coordinates Dashboard, Payments, TenantManager, InvoiceManager, and WhatsAppManager.
 */

(function (window) {
    'use strict';

    const PAYMENTS_STORAGE_KEY = 'rentflow_payments';
    const SETTINGS_STORAGE_KEY = 'rentflow_settings';

    // Application State
    let payments = [];
    let settings = {
        propertyName: 'Flat 4B, Sunset Apartments',
        landlordName: 'Property Owner',
        defaultRent: 1200
    };
    let currentSelectedPeriod = '';

    // Cached DOM References
    let elements = {};

    /**
     * Cache all primary DOM references
     */
    function cacheDOM() {
        elements = {
            // Navigation & Header
            navLinks: document.querySelectorAll('.sidebar-nav .nav-link'),
            contentSections: document.querySelectorAll('.content-section'),
            sidebar: document.querySelector('.sidebar'),
            sidebarToggle: document.getElementById('sidebar-toggle'),
            pageTitle: document.getElementById('page-title'),
            currentDate: document.getElementById('current-date'),
            feedbackContainer: document.getElementById('feedback-container'),

            // Summary Cards
            summaryTotalRent: document.getElementById('summary-total-rent'),
            summaryCollectedRent: document.getElementById('summary-collected-rent'),
            summaryPendingRent: document.getElementById('summary-pending-rent'),
            summaryTotalTenants: document.getElementById('summary-total-tenants'),
            monthlyOverviewContent: document.getElementById('monthly-overview-content'),

            // Modals & Buttons
            paymentModal: document.getElementById('payment-modal'),
            paymentForm: document.getElementById('payment-form'),
            paymentTenantSelect: document.getElementById('payment-tenant-select'),
            paymentMonthInput: document.getElementById('payment-month'),
            paymentAmountInput: document.getElementById('payment-amount'),
            paymentDateInput: document.getElementById('payment-date'),
            btnOpenPaymentModal: document.getElementById('btn-open-payment-modal'),
            btnRecordPaymentHeader: document.getElementById('btn-record-payment'),
            paymentModalCloseBtns: document.querySelectorAll('#payment-modal .modal-close-btn, #payment-modal .modal-cancel-btn'),

            // Tables
            paymentTableBody: document.getElementById('payment-table-body'),

            // Invoices
            invoiceSection: document.getElementById('invoice-section'),
            btnGenerateInvoice: document.getElementById('btn-generate-invoice'),
            invoicePreviewContainer: document.getElementById('invoice-preview-container'),

            // Settings
            settingsForm: document.getElementById('settings-form'),
            settingPropertyName: document.getElementById('setting-property-name'),
            settingLandlordName: document.getElementById('setting-landlord-name'),
            settingDefaultRent: document.getElementById('setting-default-rent')
        };
    }

    /**
     * Generate unique identifier for payment records
     */
    function generateId() {
        return 'pay_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    }

    /**
     * Format currency value in INR
     */
    function formatCurrency(amount) {
        const num = Number(amount);
        if (isNaN(num)) return '₹0.00';
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
    }

    /**
     * Escape strings for safe HTML rendering
     */
    function escapeHTML(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>'"]/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[char] || char));
    }

    /**
     * Display contextual user alerts in the feedback container
     */
    function showFeedback(message, type = 'info') {
        if (!elements.feedbackContainer) return;
        const alert = document.createElement('div');
        alert.className = `alert alert-${type === 'error' ? 'error' : (type === 'success' ? 'success' : 'info')}`;
        alert.textContent = message;

        elements.feedbackContainer.innerHTML = '';
        elements.feedbackContainer.appendChild(alert);

        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, 4000);
    }

    /**
     * Load settings from localStorage
     */
    function loadSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                settings = Object.assign(settings, parsed);
            }
        } catch (e) {
            console.error('Error loading settings from localStorage', e);
        }

        if (elements.settingPropertyName) elements.settingPropertyName.value = settings.propertyName;
        if (elements.settingLandlordName) elements.settingLandlordName.value = settings.landlordName;
        if (elements.settingDefaultRent) elements.settingDefaultRent.value = settings.defaultRent;
    }

    /**
     * Save settings to localStorage
     */
    function saveSettings(e) {
        if (e) e.preventDefault();
        settings.propertyName = (elements.settingPropertyName.value || '').trim() || 'Rental Property';
        settings.landlordName = (elements.settingLandlordName.value || '').trim() || 'Property Owner';
        settings.defaultRent = parseFloat(elements.settingDefaultRent.value) || 0;

        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
            showFeedback('Settings saved successfully.', 'success');
            updateDashboard();
        } catch (err) {
            showFeedback('Could not save settings.', 'error');
        }
    }

    /**
     * Load payment records safely from localStorage
     */
    function loadPayments() {
        try {
            const raw = localStorage.getItem(PAYMENTS_STORAGE_KEY);
            if (!raw) {
                payments = [];
                return;
            }
            const parsed = JSON.parse(raw);
            payments = Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.error('Corrupted payment records detected. Resetting in-memory payments.', err);
            payments = [];
            showFeedback('Corrupted payment records found. Initializing empty dataset.', 'error');
        }
    }

    /**
     * Persist payments to localStorage
     */
    function savePaymentsToStorage() {
        try {
            localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(payments));
            return true;
        } catch (err) {
            console.error('Failed to persist payment.', err);
            showFeedback('Storage quota exceeded or storage unavailable.', 'error');
            return false;
        }
    }

    /**
     * Get the active rental period in YYYY-MM format
     */
    function getCurrentPeriod() {
        if (currentSelectedPeriod) return currentSelectedPeriod;
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }

    /**
     * Convert YYYY-MM into a human-readable string (e.g. "November 2026")
     */
    function formatPeriodDisplay(periodKey) {
        if (!periodKey || !periodKey.includes('-')) return periodKey;
        const [year, month] = periodKey.split('-');
        const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    /**
     * Populate tenant selection dropdowns
     */
    function populateTenantDropdowns() {
        if (!elements.paymentTenantSelect) return;
        const tenants = window.TenantManager ? window.TenantManager.getAll() : [];
        const currentVal = elements.paymentTenantSelect.value;

        elements.paymentTenantSelect.innerHTML = '<option value="">-- Choose Tenant --</option>';
        tenants.forEach((tenant) => {
            const opt = document.createElement('option');
            opt.value = tenant.id;
            opt.textContent = `${tenant.fullName} (${formatCurrency(tenant.monthlyRent)}/mo)`;
            elements.paymentTenantSelect.appendChild(opt);
        });

        elements.paymentTenantSelect.value = currentVal;
    }

    /**
     * Calculate payments received for a given tenant during a specific period
     */
    function getTenantPaidForPeriod(tenantId, period) {
        return payments
            .filter((p) => p.tenantId === tenantId && p.rentalPeriod === period)
            .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    }

    /**
     * Core Business Logic: Calculate pending rent for a tenant in a specific period
     */
    function getTenantPeriodStatus(tenant, period) {
        const monthlyRent = Number(tenant.monthlyRent) || 0;
        const amountPaid = getTenantPaidForPeriod(tenant.id, period);
        const pendingAmount = Math.max(0, monthlyRent - amountPaid);

        let status = 'UNPAID';
        if (pendingAmount === 0 && monthlyRent > 0) {
            status = 'PAID';
        } else if (amountPaid > 0 && pendingAmount > 0) {
            status = 'PARTIAL';
        }

        return {
            tenant,
            monthlyRent,
            amountPaid,
            pendingAmount,
            status
        };
    }

    /**
     * Update top dashboard summary cards & monthly rent overview
     */
    function updateDashboard() {
        const tenants = window.TenantManager ? window.TenantManager.getAll() : [];
        const activePeriod = getCurrentPeriod();

        let totalExpectedRent = 0;
        let totalCollectedRent = 0;
        let totalPendingRent = 0;

        const tenantStatuses = tenants.map((tenant) => {
            const stat = getTenantPeriodStatus(tenant, activePeriod);
            totalExpectedRent += stat.monthlyRent;
            totalCollectedRent += stat.amountPaid;
            totalPendingRent += stat.pendingAmount;
            return stat;
        });

        if (elements.summaryTotalRent) {
            elements.summaryTotalRent.textContent = formatCurrency(totalExpectedRent);
        }
        if (elements.summaryCollectedRent) {
            elements.summaryCollectedRent.textContent = formatCurrency(totalCollectedRent);
        }
        if (elements.summaryPendingRent) {
            elements.summaryPendingRent.textContent = formatCurrency(totalPendingRent);
        }
        if (elements.summaryTotalTenants) {
            elements.summaryTotalTenants.textContent = tenants.length.toString();
        }

        renderMonthlyOverview(tenantStatuses, activePeriod);
        renderPaymentTable();
    }

    /**
     * Render the Monthly Rent Overview container on the dashboard
     */
    function renderMonthlyOverview(tenantStatuses, period) {
        if (!elements.monthlyOverviewContent) return;

        if (tenantStatuses.length === 0) {
            elements.monthlyOverviewContent.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <p>No active tenants configured.</p>
                    <button class="btn btn-primary btn-open-tenant-modal">Add Your First Tenant</button>
                </div>
            `;
            return;
        }

        elements.monthlyOverviewContent.innerHTML = '';

        tenantStatuses.forEach(({ tenant, monthlyRent, amountPaid, pendingAmount, status }) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.padding = '1.25rem';
            card.style.marginBottom = '0';

            const badgeClass = status === 'PAID' ? 'badge-success' : (status === 'PARTIAL' ? 'badge-warning' : 'badge-danger');

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                    <div>
                        <h4 style="font-weight: 600; font-size: 1.05rem;">${escapeHTML(tenant.fullName)}</h4>
                        <span class="text-muted" style="font-size: 0.85rem;">Period: ${formatPeriodDisplay(period)}</span>
                    </div>
                    <span class="badge ${badgeClass}">${status}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.5rem;">
                    <span class="text-secondary">Rent: ${formatCurrency(monthlyRent)}</span>
                    <span class="text-success">Paid: ${formatCurrency(amountPaid)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 1rem;">
                    <span class="text-secondary">Balance Due:</span>
                    <strong class="${pendingAmount > 0 ? 'text-danger' : 'text-success'}">${formatCurrency(pendingAmount)}</strong>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-secondary btn-sm btn-quick-invoice" data-tenant-id="${tenant.id}">Invoice</button>
                    <button class="btn btn-secondary btn-sm btn-quick-whatsapp" data-tenant-id="${tenant.id}" data-status="${status}">WhatsApp</button>
                </div>
            `;
            elements.monthlyOverviewContent.appendChild(card);
        });
    }

    /**
     * Render the Rent Payments table
     */
    function renderPaymentTable() {
        if (!elements.paymentTableBody) return;
        elements.paymentTableBody.innerHTML = '';

        if (payments.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" class="text-muted" style="text-align: center; padding: 2rem;">No rent payments recorded yet.</td>`;
            elements.paymentTableBody.appendChild(row);
            return;
        }

        const tenants = window.TenantManager ? window.TenantManager.getAll() : [];
        const tenantMap = new Map(tenants.map((t) => [t.id, t]));

        // Render most recent payments first
        const sortedPayments = payments.slice().reverse();

        sortedPayments.forEach((payment) => {
            const tenant = tenantMap.get(payment.tenantId);
            const tenantName = tenant ? tenant.fullName : 'Former / Unknown Tenant';
            const monthlyDue = tenant ? tenant.monthlyRent : payment.amount;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${escapeHTML(tenantName)}</strong></td>
                <td>${escapeHTML(formatPeriodDisplay(payment.rentalPeriod))}</td>
                <td>${formatCurrency(monthlyDue)}</td>
                <td class="text-success">${formatCurrency(payment.amount)}</td>
                <td><span class="badge badge-success">RECORDED</span></td>
                <td>
                    <div class="action-buttons">
                        <button type="button" class="btn btn-danger btn-sm btn-delete-payment" data-id="${payment.id}">Delete</button>
                    </div>
                </td>
            `;
            elements.paymentTableBody.appendChild(row);
        });
    }

    /**
     * Open Payment Modal
     */
    function openPaymentModal(preselectedTenantId = null) {
        if (!elements.paymentModal || !elements.paymentForm) return;

        elements.paymentForm.reset();
        populateTenantDropdowns();

        if (preselectedTenantId && elements.paymentTenantSelect) {
            elements.paymentTenantSelect.value = preselectedTenantId;
        }

        if (elements.paymentMonthInput) {
            elements.paymentMonthInput.value = getCurrentPeriod();
        }

        if (elements.paymentDateInput) {
            elements.paymentDateInput.value = new Date().toISOString().split('T')[0];
        }

        elements.paymentModal.classList.add('open');
        elements.paymentModal.setAttribute('aria-hidden', 'false');
    }

    /**
     * Close Payment Modal
     */
    function closePaymentModal() {
        if (!elements.paymentModal) return;
        elements.paymentModal.classList.remove('open');
        elements.paymentModal.setAttribute('aria-hidden', 'true');
        if (elements.paymentForm) elements.paymentForm.reset();
    }

    /**
     * Record a new rent payment
     */
    function handlePaymentFormSubmit(e) {
        e.preventDefault();

        const tenantId = elements.paymentTenantSelect.value;
        const rentalPeriod = elements.paymentMonthInput.value;
        const amount = parseFloat(elements.paymentAmountInput.value);
        const paymentDate = elements.paymentDateInput.value;

        if (!tenantId) {
            showFeedback('Please select a tenant.', 'error');
            return;
        }
        if (!rentalPeriod) {
            showFeedback('Please select a rental period.', 'error');
            return;
        }
        if (isNaN(amount) || amount <= 0) {
            showFeedback('Payment amount must be greater than zero.', 'error');
            return;
        }
        if (!paymentDate) {
            showFeedback('Please select the payment date.', 'error');
            return;
        }

        const newPayment = {
            id: generateId(),
            tenantId,
            rentalPeriod,
            amount,
            paymentDate,
            paymentMethod: 'Standard'
        };

        payments.push(newPayment);
        savePaymentsToStorage();
        closePaymentModal();
        updateDashboard();
        showFeedback('Payment recorded successfully.', 'success');
    }

    /**
     * Delete a payment record after confirmation
     */
    function deletePayment(paymentId) {
        const payment = payments.find((p) => p.id === paymentId);
        if (!payment) return;

        const confirmed = window.confirm(`Are you sure you want to delete this payment of ${formatCurrency(payment.amount)}?`);
        if (!confirmed) return;

        payments = payments.filter((p) => p.id !== paymentId);
        savePaymentsToStorage();
        updateDashboard();
        showFeedback('Payment record deleted.', 'success');
    }

    /**
     * Handle Invoice rendering and download
     */
    function triggerInvoiceAction(tenantId, action = 'preview') {
        if (!window.InvoiceManager) {
            showFeedback('Invoice module not loaded.', 'error');
            return;
        }

        const tenant = window.TenantManager ? window.TenantManager.getById(tenantId) : null;
        if (!tenant) {
            showFeedback('Tenant record not found for invoice.', 'error');
            return;
        }

        const period = getCurrentPeriod();
        const amountPaid = getTenantPaidForPeriod(tenant.id, period);

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
                monthlyRent: tenant.monthlyRent,
                additionalCharges: 0,
                previousBalance: 0
            },
            amountPaid: amountPaid
        };

        if (action === 'download') {
            window.InvoiceManager.downloadPDF(invoicePayload);
        } else {
            // Switch to Invoices view and render preview
            navigateToSection('invoice-section');
            window.InvoiceManager.renderPreview(invoicePayload, 'invoice-preview-container');
        }
    }

    /**
     * Handle WhatsApp notifications
     */
    function triggerWhatsAppAction(tenantId, status) {
        if (!window.WhatsAppManager) {
            showFeedback('WhatsApp module not loaded.', 'error');
            return;
        }

        const tenant = window.TenantManager ? window.TenantManager.getById(tenantId) : null;
        if (!tenant) {
            showFeedback('Tenant not found.', 'error');
            return;
        }

        const period = formatPeriodDisplay(getCurrentPeriod());
        const activePeriod = getCurrentPeriod();
        const amountPaid = getTenantPaidForPeriod(tenant.id, activePeriod);
        const monthlyRent = Number(tenant.monthlyRent) || 0;
        const balanceRemaining = Math.max(0, monthlyRent - amountPaid);

        let message = '';
        if (status === 'PAID') {
            message = window.WhatsAppManager.generateConfirmationMessage(tenant, {
                month: period,
                amountPaid: amountPaid,
                balanceRemaining: 0,
                paymentDate: new Date().toISOString().split('T')[0]
            });
        } else if (status === 'PARTIAL') {
            message = window.WhatsAppManager.generatePendingSummaryMessage(tenant, {
                month: period,
                amountDue: balanceRemaining
            });
        } else {
            message = window.WhatsAppManager.generateReminderMessage(tenant, {
                month: period,
                amountDue: monthlyRent
            });
        }

        // Preview message before dispatch
        const confirmed = window.confirm(`Preview message for ${tenant.fullName}:\n\n${message}\n\nProceed to WhatsApp?`);
        if (confirmed) {
            window.WhatsAppManager.openWhatsAppChat(tenant.phone, message);
        }
    }

    /**
     * SPA Tab Navigation
     */
    function navigateToSection(targetSectionId) {
        elements.contentSections.forEach((section) => {
            section.classList.toggle('active', section.id === targetSectionId);
        });

        elements.navLinks.forEach((link) => {
            const linkTarget = link.getAttribute('data-target');
            link.classList.toggle('active', linkTarget === targetSectionId);
        });

        // Update top navbar page title
        const activeLink = document.querySelector(`.sidebar-nav .nav-link[data-target="${targetSectionId}"]`);
        if (activeLink && elements.pageTitle) {
            elements.pageTitle.textContent = activeLink.textContent;
        }

        // Close sidebar on mobile upon navigation
        if (elements.sidebar && elements.sidebar.classList.contains('open')) {
            elements.sidebar.classList.remove('open');
        }
    }

    /**
     * Attach application-level event listeners
     */
    function attachEventListeners() {
        // Sidebar Navigation
        elements.navLinks.forEach((link) => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = link.getAttribute('data-target');
                if (target) navigateToSection(target);
            });
        });

        // Mobile Sidebar Toggle
        if (elements.sidebarToggle) {
            elements.sidebarToggle.addEventListener('click', () => {
                if (elements.sidebar) {
                    elements.sidebar.classList.toggle('open');
                }
            });
        }

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (
                elements.sidebar &&
                elements.sidebar.classList.contains('open') &&
                !elements.sidebar.contains(e.target) &&
                e.target !== elements.sidebarToggle
            ) {
                elements.sidebar.classList.remove('open');
            }
        });

        // Modal triggers for Payments
        if (elements.btnOpenPaymentModal) {
            elements.btnOpenPaymentModal.addEventListener('click', () => openPaymentModal());
        }
        if (elements.btnRecordPaymentHeader) {
            elements.btnRecordPaymentHeader.addEventListener('click', () => openPaymentModal());
        }
        elements.paymentModalCloseBtns.forEach((btn) => {
            btn.addEventListener('click', closePaymentModal);
        });

        // Backdrop click to close payment modal
        if (elements.paymentModal) {
            elements.paymentModal.addEventListener('click', (e) => {
                if (e.target === elements.paymentModal) closePaymentModal();
            });
        }

        // Payment Form Submission
        if (elements.paymentForm) {
            elements.paymentForm.addEventListener('submit', handlePaymentFormSubmit);
        }

        // Payment table row deletion delegation
        if (elements.paymentTableBody) {
            elements.paymentTableBody.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.btn-delete-payment');
                if (deleteBtn) {
                    const id = deleteBtn.getAttribute('data-id');
                    deletePayment(id);
                }
            });
        }

        // Monthly overview button delegation (Invoices & WhatsApp)
        if (elements.monthlyOverviewContent) {
            elements.monthlyOverviewContent.addEventListener('click', (e) => {
                const invoiceBtn = e.target.closest('.btn-quick-invoice');
                if (invoiceBtn) {
                    const tenantId = invoiceBtn.getAttribute('data-tenant-id');
                    triggerInvoiceAction(tenantId, 'preview');
                    return;
                }

                const waBtn = e.target.closest('.btn-quick-whatsapp');
                if (waBtn) {
                    const tenantId = waBtn.getAttribute('data-tenant-id');
                    const status = waBtn.getAttribute('data-status');
                    triggerWhatsAppAction(tenantId, status);
                }
            });
        }

        // Invoice Section Generate Button
        if (elements.btnGenerateInvoice) {
            elements.btnGenerateInvoice.addEventListener('click', () => {
                const tenants = window.TenantManager ? window.TenantManager.getAll() : [];
                if (tenants.length === 0) {
                    showFeedback('No tenants available to generate invoice.', 'error');
                    return;
                }
                triggerInvoiceAction(tenants[0].id, 'download');
            });
        }

        // Settings Form Submission
        if (elements.settingsForm) {
            elements.settingsForm.addEventListener('submit', saveSettings);
        }

        // Reactive integration with TenantManager
        window.addEventListener('rentflow:tenants-changed', () => {
            populateTenantDropdowns();
            updateDashboard();
        });
    }

    /**
     * Render the current formatted date in the top navbar
     */
    function renderCurrentDate() {
        if (!elements.currentDate) return;
        const now = new Date();
        elements.currentDate.textContent = now.toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    /**
     * Initialize the Application
     */
    function init() {
        cacheDOM();
        currentSelectedPeriod = getCurrentPeriod();

        renderCurrentDate();
        loadSettings();
        loadPayments();

        // Initialize tenant module
        if (window.TenantManager && typeof window.TenantManager.init === 'function') {
            window.TenantManager.init();
        }

        populateTenantDropdowns();
        attachEventListeners();
        updateDashboard();
    }

    // Initialize application when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose application namespace for external inspection or testing
    window.RentFlowApp = {
        init,
        updateDashboard,
        openPaymentModal,
        triggerInvoiceAction,
        triggerWhatsAppAction
    };

})(window);