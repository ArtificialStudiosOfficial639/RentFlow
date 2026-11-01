/**
 * RentFlow - Tenant Management Module (js/tenant.js)
 * Manages tenant data, validation, local persistence, and table rendering.
 */

(function (window) {
    'use strict';

    const STORAGE_KEY = 'rentflow_tenants';

    // In-memory tenant store
    let tenants = [];

    // Cached DOM elements
    let elements = {};

    /**
     * Cache required DOM elements for tenant operations
     */
    function cacheDOM() {
        elements = {
            tableBody: document.getElementById('tenant-table-body'),
            searchInput: document.getElementById('tenant-search'),
            modal: document.getElementById('tenant-modal'),
            modalTitle: document.getElementById('tenant-modal-title'),
            form: document.getElementById('tenant-form'),
            idInput: document.getElementById('tenant-id'),
            nameInput: document.getElementById('tenant-name'),
            phoneInput: document.getElementById('tenant-phone'),
            emailInput: document.getElementById('tenant-email'),
            leaseStartInput: document.getElementById('tenant-lease-start'),
            rentInput: document.getElementById('tenant-monthly-rent'),
            openModalBtns: document.querySelectorAll('.btn-open-tenant-modal, #btn-open-tenant-modal'),
            closeModalBtns: document.querySelectorAll('#tenant-modal .modal-close-btn, #tenant-modal .modal-cancel-btn'),
            feedbackContainer: document.getElementById('feedback-container')
        };
    }

    /**
     * Safely load tenants from localStorage
     * Handles missing, empty, or corrupted JSON
     */
    function loadTenants() {
        try {
            const rawData = localStorage.getItem(STORAGE_KEY);
            if (!rawData) {
                tenants = [];
                return;
            }
            const parsed = JSON.parse(rawData);
            if (Array.isArray(parsed)) {
                tenants = parsed;
            } else {
                tenants = [];
            }
        } catch (error) {
            console.error('Failed to parse tenants from localStorage. Initializing empty dataset.', error);
            tenants = [];
            showFeedback('Corrupted tenant data detected. Resetting tenant store.', 'error');
        }
    }

    /**
     * Persist tenants array to localStorage
     */
    function saveTenantsToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tenants));
            window.dispatchEvent(new CustomEvent('rentflow:tenants-changed', { detail: { tenants } }));
            return true;
        } catch (error) {
            console.error('Failed to save tenants to localStorage.', error);
            showFeedback('Storage quota exceeded or storage unavailable.', 'error');
            return false;
        }
    }

    /**
     * Generate a collision-free UUID-like string
     */
    function generateUUID() {
        return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
    }

    /**
     * Show UI alerts in the feedback container
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
     * Validate tenant form inputs
     */
    function validateTenant(data) {
        if (!data.fullName || data.fullName.trim().length === 0) {
            return { valid: false, message: 'Full name is required.' };
        }
        if (!data.phone || data.phone.trim().length === 0) {
            return { valid: false, message: 'Valid phone number is required.' };
        }
        if (!data.moveInDate || data.moveInDate.trim().length === 0) {
            return { valid: false, message: 'Move-in / lease start date is required.' };
        }
        const numericRent = Number(data.monthlyRent);
        if (isNaN(numericRent) || numericRent <= 0) {
            return { valid: false, message: 'Monthly rent must be a positive number.' };
        }
        return { valid: true };
    }

    /**
     * Open Tenant Modal for Add or Edit
     */
    function openModal(tenantId = null) {
        if (!elements.modal || !elements.form) return;

        elements.form.reset();

        if (tenantId) {
            const tenant = getById(tenantId);
            if (!tenant) {
                showFeedback('Tenant not found.', 'error');
                return;
            }
            if (elements.modalTitle) elements.modalTitle.textContent = 'Edit Tenant Information';
            if (elements.idInput) elements.idInput.value = tenant.id;
            if (elements.nameInput) elements.nameInput.value = tenant.fullName || '';
            if (elements.phoneInput) elements.phoneInput.value = tenant.phone || '';
            if (elements.emailInput) elements.emailInput.value = tenant.email || '';
            if (elements.leaseStartInput) elements.leaseStartInput.value = tenant.moveInDate || '';
            if (elements.rentInput) elements.rentInput.value = tenant.monthlyRent || '';
        } else {
            if (elements.modalTitle) elements.modalTitle.textContent = 'Add New Tenant';
            if (elements.idInput) elements.idInput.value = '';
        }

        elements.modal.classList.add('open');
        elements.modal.setAttribute('aria-hidden', 'false');
    }

    /**
     * Close Tenant Modal
     */
    function closeModal() {
        if (!elements.modal) return;
        elements.modal.classList.remove('open');
        elements.modal.setAttribute('aria-hidden', 'true');
        if (elements.form) elements.form.reset();
    }

    /**
     * Render the tenants table body
     */
    function renderTable(dataset = tenants) {
        if (!elements.tableBody) return;

        elements.tableBody.innerHTML = '';

        if (!dataset || dataset.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" class="text-muted" style="text-align: center; padding: 2rem;">No tenant records found.</td>`;
            elements.tableBody.appendChild(row);
            return;
        }

        dataset.forEach((tenant) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${escapeHTML(tenant.fullName)}</strong></td>
                <td>${escapeHTML(tenant.phone)}</td>
                <td>${tenant.email ? escapeHTML(tenant.email) : '<span class="text-muted">N/A</span>'}</td>
                <td>${escapeHTML(tenant.moveInDate)}</td>
                <td>$${Number(tenant.monthlyRent).toFixed(2)}</td>
                <td>
                    <div class="action-buttons">
                        <button type="button" class="btn btn-secondary btn-sm btn-edit-tenant" data-id="${tenant.id}">Edit</button>
                        <button type="button" class="btn btn-danger btn-sm btn-delete-tenant" data-id="${tenant.id}">Delete</button>
                    </div>
                </td>
            `;
            elements.tableBody.appendChild(row);
        });

        attachRowActionListeners();
    }

    /**
     * Attach edit and delete events to table buttons
     */
    function attachRowActionListeners() {
        const editBtns = elements.tableBody.querySelectorAll('.btn-edit-tenant');
        editBtns.forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                openModal(id);
            });
        });

        const deleteBtns = elements.tableBody.querySelectorAll('.btn-delete-tenant');
        deleteBtns.forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                deleteTenant(id);
            });
        });
    }

    /**
     * Add or update a tenant
     */
    function save(tenantData) {
        const validation = validateTenant(tenantData);
        if (!validation.valid) {
            showFeedback(validation.message, 'error');
            return false;
        }

        const isUpdate = Boolean(tenantData.id && tenantData.id.trim().length > 0);

        if (isUpdate) {
            const index = tenants.findIndex((t) => t.id === tenantData.id);
            if (index === -1) {
                showFeedback('Cannot update: Tenant ID not found.', 'error');
                return false;
            }
            tenants[index] = {
                ...tenants[index],
                fullName: tenantData.fullName.trim(),
                phone: tenantData.phone.trim(),
                email: (tenantData.email || '').trim(),
                moveInDate: tenantData.moveInDate,
                monthlyRent: parseFloat(tenantData.monthlyRent)
            };
            showFeedback('Tenant updated successfully.', 'success');
        } else {
            const newTenant = {
                id: generateUUID(),
                fullName: tenantData.fullName.trim(),
                phone: tenantData.phone.trim(),
                email: (tenantData.email || '').trim(),
                moveInDate: tenantData.moveInDate,
                monthlyRent: parseFloat(tenantData.monthlyRent)
            };
            tenants.push(newTenant);
            showFeedback('Tenant added successfully.', 'success');
        }

        saveTenantsToStorage();
        renderTable();
        return true;
    }

    /**
     * Delete tenant after explicit confirmation
     */
    function deleteTenant(id) {
        const tenant = getById(id);
        if (!tenant) {
            showFeedback('Tenant not found.', 'error');
            return;
        }

        const confirmed = window.confirm(`Are you sure you want to delete ${tenant.fullName}? This action cannot be undone.`);
        if (!confirmed) return;

        tenants = tenants.filter((t) => t.id !== id);
        saveTenantsToStorage();
        renderTable();
        showFeedback('Tenant removed successfully.', 'success');
    }

    /**
     * Perform live search across tenant records
     */
    function handleSearch(event) {
        const query = (event.target.value || '').toLowerCase().trim();
        if (!query) {
            renderTable(tenants);
            return;
        }

        const filtered = tenants.filter((tenant) => {
            const nameMatch = tenant.fullName && tenant.fullName.toLowerCase().includes(query);
            const phoneMatch = tenant.phone && tenant.phone.toLowerCase().includes(query);
            const emailMatch = tenant.email && tenant.email.toLowerCase().includes(query);
            return nameMatch || phoneMatch || emailMatch;
        });

        renderTable(filtered);
    }

    /**
     * Form submit event handler
     */
    function handleFormSubmit(event) {
        event.preventDefault();

        const formData = {
            id: elements.idInput ? elements.idInput.value : '',
            fullName: elements.nameInput ? elements.nameInput.value : '',
            phone: elements.phoneInput ? elements.phoneInput.value : '',
            email: elements.emailInput ? elements.emailInput.value : '',
            moveInDate: elements.leaseStartInput ? elements.leaseStartInput.value : '',
            monthlyRent: elements.rentInput ? elements.rentInput.value : 0
        };

        const success = save(formData);
        if (success) {
            closeModal();
        }
    }

    /**
     * Attach application-level DOM listeners
     */
    function attachListeners() {
        if (elements.searchInput) {
            elements.searchInput.addEventListener('input', handleSearch);
        }

        if (elements.form) {
            elements.form.addEventListener('submit', handleFormSubmit);
        }

        elements.openModalBtns.forEach((btn) => {
            btn.addEventListener('click', () => openModal());
        });

        elements.closeModalBtns.forEach((btn) => {
            btn.addEventListener('click', closeModal);
        });

        // Close on backdrop click
        if (elements.modal) {
            elements.modal.addEventListener('click', (e) => {
                if (e.target === elements.modal) {
                    closeModal();
                }
            });
        }
    }

    /**
     * Safe HTML string escaping
     */
    function escapeHTML(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>'"]/g, (tag) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag));
    }

    /**
     * Public accessor: Retrieve tenant by ID
     */
    function getById(id) {
        return tenants.find((t) => t.id === id) || null;
    }

    /**
     * Public accessor: Retrieve all tenants
     */
    function getAll() {
        return tenants.map((tenant) => ({ ...tenant }));
    }

    /**
     * Initialize Module
     */
    function init() {
        cacheDOM();
        loadTenants();
        attachListeners();
        renderTable();
    }

    // Expose public API to window namespace
    window.TenantManager = {
        init,
        getAll,
        getById,
        save,
        delete: deleteTenant,
        renderTable,
        openModal,
        closeModal
    };

})(window);