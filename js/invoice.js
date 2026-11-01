/**
 * RentFlow - Invoice Management Module (js/invoice.js)
 * Responsible for calculating invoice totals, rendering previews,
 * and generating downloadable PDF invoices using jsPDF.
 */

(function (window) {
    'use strict';

    /**
     * Format a numeric amount to INR currency format
     * Example: 25000 -> ₹25,000.00
     */
    function formatINR(amount) {
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
     * Safely parse and sanitize numbers
     */
    function parseSafeNumber(val) {
        const num = parseFloat(val);
        return isNaN(num) || num < 0 ? 0 : num;
    }

    /**
     * Generate a structured, reproducible invoice number
     */
    function generateInvoiceNumber(tenantId, period) {
        const cleanPeriod = (period || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
        const shortId = (tenantId || 'GEN').replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
        const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
        return `INV-${cleanPeriod || 'RENT'}-${shortId}-${timestamp}`;
    }

    /**
     * Validate and normalize raw invoice input data
     */
    function processInvoiceModel(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid invoice payload.');
        }

        const tenant = data.tenant || {};
        if (!tenant.fullName || !tenant.fullName.trim()) {
            throw new Error('Tenant name is required to compile an invoice.');
        }

        const landlord = data.landlord || {};
        const charges = data.charges || {};

        const monthlyRent = parseSafeNumber(charges.monthlyRent);
        const additionalCharges = parseSafeNumber(charges.additionalCharges);
        const previousBalance = parseSafeNumber(charges.previousBalance);
        const amountPaid = parseSafeNumber(data.amountPaid);

        const grossPayable = monthlyRent + additionalCharges + previousBalance;
        const totalDue = Math.max(0, grossPayable - amountPaid);

        let paymentStatus = 'UNPAID';
        if (totalDue === 0 && grossPayable > 0) {
            paymentStatus = 'PAID';
        } else if (amountPaid > 0 && totalDue > 0) {
            paymentStatus = 'PARTIALLY PAID';
        }

        const issueDate = data.issueDate ? new Date(data.issueDate).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }) : new Date().toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        return {
            invoiceNumber: data.invoiceNumber || generateInvoiceNumber(tenant.id, data.rentalPeriod),
            issueDate: issueDate,
            rentalPeriod: data.rentalPeriod || 'Current Month',
            tenant: {
                fullName: tenant.fullName.trim(),
                phone: tenant.phone ? tenant.phone.trim() : 'N/A',
                email: tenant.email ? tenant.email.trim() : 'N/A',
                unitNumber: tenant.unitNumber ? tenant.unitNumber.trim() : 'Unit - Standard'
            },
            landlord: {
                name: landlord.name ? landlord.name.trim() : 'Property Owner',
                propertyName: landlord.propertyName ? landlord.propertyName.trim() : 'Rental Residence',
                phone: landlord.phone ? landlord.phone.trim() : ''
            },
            financials: {
                monthlyRent,
                additionalCharges,
                additionalChargesDescription: charges.additionalChargesDescription || 'Miscellaneous / Utilities',
                previousBalance,
                grossPayable,
                amountPaid,
                totalDue,
                status: paymentStatus
            }
        };
    }

    /**
     * Escape plain text to safe HTML
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
     * Render an accessible HTML invoice preview in the target container
     */
    function renderPreview(rawInvoiceData, containerId = 'invoice-preview-container') {
        const container = document.getElementById(containerId);
        if (!container) return;

        let model;
        try {
            model = processInvoiceModel(rawInvoiceData);
        } catch (err) {
            container.innerHTML = `
                <div class="empty-state">
                    <p class="text-danger">${escapeHTML(err.message)}</p>
                </div>
            `;
            return;
        }

        const statusClass = model.financials.status === 'PAID'
            ? 'badge-success'
            : (model.financials.status === 'PARTIALLY PAID' ? 'badge-warning' : 'badge-danger');

        container.innerHTML = `
            <div class="invoice-box" style="width: 100%; max-width: 680px; margin: 0 auto; text-align: left; background: #0f172a; padding: 1.5rem; border: 1px solid #334155; border-radius: 0.5rem;">
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 1rem; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
                    <div>
                        <h4 style="font-size: 1.25rem; font-weight: 700; color: #f8fafc;">${escapeHTML(model.landlord.propertyName)}</h4>
                        <p class="text-muted" style="font-size: 0.85rem;">Landlord: ${escapeHTML(model.landlord.name)} ${model.landlord.phone ? '• ' + escapeHTML(model.landlord.phone) : ''}</p>
                    </div>
                    <div style="text-align: right;">
                        <span class="badge ${statusClass}">${escapeHTML(model.financials.status)}</span>
                        <p style="font-size: 0.85rem; font-weight: 600; color: #94a3b8; margin-top: 0.25rem;">${escapeHTML(model.invoiceNumber)}</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem; font-size: 0.875rem;">
                    <div>
                        <strong class="text-muted">Billed To:</strong>
                        <p style="color: #f8fafc; font-weight: 600;">${escapeHTML(model.tenant.fullName)}</p>
                        <p class="text-muted">${escapeHTML(model.tenant.unitNumber)}</p>
                        <p class="text-muted">${escapeHTML(model.tenant.phone)}</p>
                    </div>
                    <div style="text-align: right;">
                        <p><strong class="text-muted">Rental Period:</strong> <span style="color: #f8fafc;">${escapeHTML(model.rentalPeriod)}</span></p>
                        <p><strong class="text-muted">Issue Date:</strong> <span style="color: #f8fafc;">${escapeHTML(model.issueDate)}</span></p>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.25rem; font-size: 0.875rem;">
                    <thead>
                        <tr style="border-bottom: 1px solid #334155; color: #94a3b8;">
                            <th style="padding: 0.5rem 0; text-align: left;">Description</th>
                            <th style="padding: 0.5rem 0; text-align: right;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding: 0.5rem 0; color: #f8fafc;">Base Rent (${escapeHTML(model.rentalPeriod)})</td>
                            <td style="padding: 0.5rem 0; text-align: right; color: #f8fafc;">${formatINR(model.financials.monthlyRent)}</td>
                        </tr>
                        ${model.financials.additionalCharges > 0 ? `
                        <tr>
                            <td style="padding: 0.5rem 0; color: #f8fafc;">${escapeHTML(model.financials.additionalChargesDescription)}</td>
                            <td style="padding: 0.5rem 0; text-align: right; color: #f8fafc;">${formatINR(model.financials.additionalCharges)}</td>
                        </tr>` : ''}
                        ${model.financials.previousBalance > 0 ? `
                        <tr>
                            <td style="padding: 0.5rem 0; color: #f8fafc;">Previous Arrears / Balance</td>
                            <td style="padding: 0.5rem 0; text-align: right; color: #ef4444;">${formatINR(model.financials.previousBalance)}</td>
                        </tr>` : ''}
                        <tr style="border-top: 1px dashed #334155;">
                            <td style="padding: 0.5rem 0; font-weight: 600; color: #94a3b8;">Total Payable</td>
                            <td style="padding: 0.5rem 0; text-align: right; font-weight: 600; color: #f8fafc;">${formatINR(model.financials.grossPayable)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 0.5rem 0; color: #10b981;">Amount Received</td>
                            <td style="padding: 0.5rem 0; text-align: right; color: #10b981;">- ${formatINR(model.financials.amountPaid)}</td>
                        </tr>
                        <tr style="border-top: 1px solid #334155; font-size: 1rem; font-weight: 700;">
                            <td style="padding: 0.75rem 0; color: #f8fafc;">Balance Due</td>
                            <td style="padding: 0.75rem 0; text-align: right; color: ${model.financials.totalDue > 0 ? '#ef4444' : '#10b981'};">
                                ${formatINR(model.financials.totalDue)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Build and trigger download of a formatted PDF invoice using jsPDF
     */
    function downloadPDF(rawInvoiceData) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            console.error('jsPDF library is not loaded on window.');
            alert('PDF generation engine unavailable. Please verify internet connectivity or CDN.');
            return false;
        }

        let model;
        try {
            model = processInvoiceModel(rawInvoiceData);
        } catch (err) {
            alert('Cannot generate invoice: ' + err.message);
            return false;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        const usableWidth = pageWidth - (margin * 2);
        let cursorY = 25;

        // Header Background Banner
        doc.setFillColor(15, 23, 42); // Navy #0f172a
        doc.rect(0, 0, pageWidth, 42, 'F');

        // Brand & Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(248, 250, 252);
        doc.text('RentFlow Invoice', margin, 20);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(`Property: ${model.landlord.propertyName}`, margin, 27);
        doc.text(`Landlord: ${model.landlord.name} ${model.landlord.phone ? ' | ' + model.landlord.phone : ''}`, margin, 33);

        // Invoice Metadata Right-aligned
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(248, 250, 252);
        doc.text(model.invoiceNumber, pageWidth - margin, 20, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184);
        doc.text(`Date: ${model.issueDate}`, pageWidth - margin, 27, { align: 'right' });
        doc.text(`Status: ${model.financials.status}`, pageWidth - margin, 33, { align: 'right' });

        cursorY = 55;

        // Tenant & Billing Information Section
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text('Billed To', margin, cursorY);
        doc.text('Rental Period Details', pageWidth - margin, cursorY, { align: 'right' });

        cursorY += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);

        // Clean Tenant multi-lines
        const tenantText = [
            `Name: ${model.tenant.fullName}`,
            `Unit: ${model.tenant.unitNumber}`,
            `Phone: ${model.tenant.phone}`,
            `Email: ${model.tenant.email}`
        ];
        doc.text(tenantText, margin, cursorY);

        const periodDetails = [
            `Rental Period: ${model.rentalPeriod}`,
            `Payment Currency: INR`
        ];
        doc.text(periodDetails, pageWidth - margin, cursorY, { align: 'right' });

        cursorY += 28;

        // Table Header
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, cursorY, usableWidth, 9, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text('ITEM / DESCRIPTION', margin + 3, cursorY + 6);
        doc.text('AMOUNT (INR)', pageWidth - margin - 3, cursorY + 6, { align: 'right' });

        cursorY += 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);

        // Row Item: Base Rent
        const lineItems = [
            { desc: `Monthly Rent (${model.rentalPeriod})`, amt: formatINR(model.financials.monthlyRent) }
        ];

        if (model.financials.additionalCharges > 0) {
            lineItems.push({
                desc: model.financials.additionalChargesDescription,
                amt: formatINR(model.financials.additionalCharges)
            });
        }

        if (model.financials.previousBalance > 0) {
            lineItems.push({
                desc: 'Previous Outstanding Arrears',
                amt: formatINR(model.financials.previousBalance)
            });
        }

        lineItems.forEach((item) => {
            doc.text(item.desc, margin + 3, cursorY + 5);
            doc.text(item.amt, pageWidth - margin - 3, cursorY + 5, { align: 'right' });
            cursorY += 8;
            doc.setDrawColor(226, 232, 240);
            doc.line(margin, cursorY, pageWidth - margin, cursorY);
        });

        cursorY += 6;

        // Financial Summary Box
        const summaryX = pageWidth - margin - 75;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(71, 85, 105);

        doc.text('Gross Amount:', summaryX, cursorY);
        doc.text(formatINR(model.financials.grossPayable), pageWidth - margin - 3, cursorY, { align: 'right' });
        cursorY += 6;

        doc.text('Amount Received:', summaryX, cursorY);
        doc.setTextColor(16, 185, 129); // Green
        doc.text(`- ${formatINR(model.financials.amountPaid)}`, pageWidth - margin - 3, cursorY, { align: 'right' });
        cursorY += 7;

        // Total Due Highlight
        doc.setDrawColor(203, 213, 225);
        doc.line(summaryX, cursorY - 1, pageWidth - margin, cursorY - 1);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text('Total Amount Due:', summaryX, cursorY + 4);

        if (model.financials.totalDue > 0) {
            doc.setTextColor(220, 38, 38); // Red
        } else {
            doc.setTextColor(16, 185, 129); // Green
        }
        doc.text(formatINR(model.financials.totalDue), pageWidth - margin - 3, cursorY + 4, { align: 'right' });

        // Footer & Disclaimer
        const footerY = 275;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
            'This is a system-generated rent invoice by RentFlow. No signature is required.',
            pageWidth / 2,
            footerY,
            { align: 'center' }
        );

        // Trigger browser save
        const sanitizedFileName = `Invoice_${model.invoiceNumber}.pdf`;
        doc.save(sanitizedFileName);
        return true;
    }

    // Export public module API
    window.InvoiceManager = {
        formatINR: formatINR,
        processInvoiceModel: processInvoiceModel,
        renderPreview: renderPreview,
        downloadPDF: downloadPDF
    };

})(window);