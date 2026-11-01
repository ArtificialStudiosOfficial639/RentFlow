
/**
 * RentFlow - Invoice Management Module
 * js/invoice.js
 *
 * Features:
 * - Invoice calculation and validation
 * - Safe HTML invoice preview
 * - PDF generation using jsPDF
 * - Overpayment / advance credit handling
 * - Dynamic PDF page management
 */

(function (window) {
    'use strict';

    // ==========================================
    // 1. CONFIGURATION & HELPERS
    // ==========================================

    const CURRENCY = 'INR';

    function cleanText(value, fallback = '') {
        if (value === null || value === undefined) {
            return fallback;
        }

        return String(value).trim() || fallback;
    }

    function roundMoney(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    /**
     * Format amount in Indian currency.
     */
    function formatINR(amount) {
        const num = Number(amount);

        if (!Number.isFinite(num)) {
            return '₹0.00';
        }

        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: CURRENCY,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
    }

    /**
     * Strictly parse non-negative monetary values.
     * Invalid values become zero.
     */
    function parseSafeNumber(value) {
        if (value === null || value === undefined || value === '') {
            return 0;
        }

        const num = typeof value === 'number'
            ? value
            : (typeof value === 'string' &&
                /^\d+(\.\d{1,2})?$/.test(value.trim())
                ? Number(value.trim())
                : NaN);

        if (!Number.isFinite(num) || num < 0) {
            return 0;
        }

        return roundMoney(num);
    }

    /**
     * Generate a unique invoice identifier.
     */
    function generateInvoiceNumber(tenantId, period) {
        const cleanPeriod = cleanText(period, 'RENT')
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 6)
            .toUpperCase();

        const shortId = cleanText(tenantId, 'GEN')
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(-4)
            .toUpperCase();

        let uniqueId;

        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            uniqueId = window.crypto.randomUUID()
                .replace(/-/g, '')
                .slice(0, 8)
                .toUpperCase();
        } else {
            uniqueId = Math.random()
                .toString(36)
                .slice(2, 10)
                .toUpperCase();
        }

        return `INV-${cleanPeriod || 'RENT'}-${shortId}-${uniqueId}`;
    }

    /**
     * Escape HTML to prevent injection.
     */
    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        })[char]);
    }

    /**
     * Format invoice date safely.
     */
    function formatDate(value) {
        const date = value ? new Date(value) : new Date();

        if (Number.isNaN(date.getTime())) {
            throw new Error('Invalid invoice issue date.');
        }

        return date.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }


    // ==========================================
    // 2. INVOICE DATA PROCESSING
    // ==========================================

    function processInvoiceModel(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('Invalid invoice payload.');
        }

        const tenant = data.tenant || {};
        const landlord = data.landlord || {};
        const charges = data.charges || {};

        if (
            typeof tenant.fullName !== 'string' ||
            !tenant.fullName.trim()
        ) {
            throw new Error('Tenant name is required to compile an invoice.');
        }

        const monthlyRent = parseSafeNumber(charges.monthlyRent);
        const additionalCharges = parseSafeNumber(charges.additionalCharges);
        const previousBalance = parseSafeNumber(charges.previousBalance);
        const amountPaid = parseSafeNumber(data.amountPaid);

        // Calculate financial values.
        const grossPayable = roundMoney(
            monthlyRent + additionalCharges + previousBalance
        );

        const balanceDue = roundMoney(
            Math.max(0, grossPayable - amountPaid)
        );

        // Handle extra payments separately.
        const advanceCredit = roundMoney(
            Math.max(0, amountPaid - grossPayable)
        );

        let paymentStatus = 'UNPAID';

        if (grossPayable > 0 && balanceDue === 0) {
            paymentStatus = 'PAID';
        } else if (amountPaid > 0 && balanceDue > 0) {
            paymentStatus = 'PARTIALLY PAID';
        }

        const issueDate = formatDate(data.issueDate);

        return {
            invoiceNumber: cleanText(
                data.invoiceNumber,
                generateInvoiceNumber(tenant.id, data.rentalPeriod)
            ),

            issueDate,

            rentalPeriod: cleanText(
                data.rentalPeriod,
                'Current Month'
            ),

            tenant: {
                fullName: cleanText(tenant.fullName),
                phone: cleanText(tenant.phone, 'N/A'),
                email: cleanText(tenant.email, 'N/A'),
                propertyAddress: cleanText(tenant.unitNumber)
            },

            landlord: {
                name: cleanText(landlord.name, 'Property Owner'),
                propertyName: cleanText(
                    landlord.propertyName,
                    'Rental Residence'
                ),
                phone: cleanText(landlord.phone)
            },

            financials: {
                monthlyRent,
                additionalCharges,

                additionalChargesDescription: cleanText(
                    charges.additionalChargesDescription,
                    'Miscellaneous / Utilities'
                ),

                previousBalance,
                grossPayable,
                amountPaid,
                balanceDue,

                // Keep totalDue for compatibility with existing code.
                totalDue: balanceDue,

                advanceCredit,
                status: paymentStatus
            }
        };
    }


    // ==========================================
    // 3. HTML INVOICE PREVIEW
    // ==========================================

    function renderPreview(
        rawInvoiceData,
        containerId = 'invoice-preview-container'
    ) {
        const container = document.getElementById(containerId);

        if (!container) {
            console.warn('Invoice preview container not found:', containerId);
            return false;
        }

        let model;

        try {
            model = processInvoiceModel(rawInvoiceData);
        } catch (error) {
            container.innerHTML = `
                <div class="empty-state">
                    <p class="text-danger">
                        ${escapeHTML(error.message)}
                    </p>
                </div>
            `;

            return false;
        }

        const financials = model.financials;

        const statusClass = {
            'PAID': 'badge-success',
            'PARTIALLY PAID': 'badge-warning',
            'UNPAID': 'badge-danger'
        }[financials.status];

        container.innerHTML = `
            <div class="invoice-box"
                style="
                    width:100%;
                    max-width:680px;
                    margin:0 auto;
                    text-align:left;
                    background:#0f172a;
                    padding:1.5rem;
                    border:1px solid #334155;
                    border-radius:0.5rem;
                    box-sizing:border-box;
                ">

                <div style="
                    display:flex;
                    justify-content:space-between;
                    border-bottom:1px solid #334155;
                    padding-bottom:1rem;
                    margin-bottom:1rem;
                    flex-wrap:wrap;
                    gap:0.75rem;
                ">
                    <div>
                        <h4 style="
                            font-size:1.25rem;
                            font-weight:700;
                            color:#f8fafc;
                        ">
                            ${escapeHTML(model.landlord.propertyName)}
                        </h4>

                        <p class="text-muted">
                            Landlord: ${escapeHTML(model.landlord.name)}
                            ${model.landlord.phone
                ? ' • ' + escapeHTML(model.landlord.phone)
                : ''}
                        </p>
                    </div>

                    <div style="text-align:right;">
                        <span class="badge ${statusClass}">
                            ${escapeHTML(financials.status)}
                        </span>

                        <p style="
                            font-size:0.85rem;
                            font-weight:600;
                            color:#94a3b8;
                            margin-top:0.25rem;
                        ">
                            ${escapeHTML(model.invoiceNumber)}
                        </p>
                    </div>
                </div>

                <div style="
                    display:grid;
                    grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
                    gap:1rem;
                    margin-bottom:1.25rem;
                    font-size:0.875rem;
                ">
                   <div>
    <strong class="text-muted">Billed To:</strong>

    <p style="color:#f8fafc;font-weight:600;">
        ${escapeHTML(model.tenant.fullName)}
    </p>

    <p class="text-muted">
        ${escapeHTML(model.tenant.phone)}
    </p>

    ${model.tenant.email !== 'N/A'
                ? `<p class="text-muted">
            ${escapeHTML(model.tenant.email)}
           </p>`
                : ''}
</div>

                    <div style="text-align:right;">
                        <p>
                            <strong class="text-muted">Rental Period:</strong>
                            <span style="color:#f8fafc;">
                                ${escapeHTML(model.rentalPeriod)}
                            </span>
                        </p>

                        <p>
                            <strong class="text-muted">Issue Date:</strong>
                            <span style="color:#f8fafc;">
                                ${escapeHTML(model.issueDate)}
                            </span>
                        </p>
                    </div>
                </div>

                <table style="
                    width:100%;
                    border-collapse:collapse;
                    margin-bottom:1.25rem;
                    font-size:0.875rem;
                ">
                    <thead>
                        <tr style="
                            border-bottom:1px solid #334155;
                            color:#94a3b8;
                        ">
                            <th style="padding:0.75rem 0;text-align:left;">
                                Description
                            </th>

                            <th style="padding:0.75rem 0;text-align:right;">
                                Amount
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        <tr>
                            <td style="padding:0.6rem 0;color:#f8fafc;">
                                Base Rent (${escapeHTML(model.rentalPeriod)})
                            </td>

                            <td style="padding:0.6rem 0;text-align:right;color:#f8fafc;">
                                ${formatINR(financials.monthlyRent)}
                            </td>
                        </tr>

                        ${financials.additionalCharges > 0 ? `
                            <tr>
                                <td style="padding:0.6rem 0;color:#f8fafc;">
                                    ${escapeHTML(financials.additionalChargesDescription)}
                                </td>

                                <td style="padding:0.6rem 0;text-align:right;color:#f8fafc;">
                                    ${formatINR(financials.additionalCharges)}
                                </td>
                            </tr>
                        ` : ''}

                        ${financials.previousBalance > 0 ? `
                            <tr>
                                <td style="padding:0.6rem 0;color:#f8fafc;">
                                    Previous Outstanding Arrears
                                </td>

                                <td style="padding:0.6rem 0;text-align:right;color:#ef4444;">
                                    ${formatINR(financials.previousBalance)}
                                </td>
                            </tr>
                        ` : ''}

                        <tr style="border-top:1px dashed #334155;">
                            <td style="padding:0.75rem 0;color:#94a3b8;">
                                <strong>Total Payable</strong>
                            </td>

                            <td style="padding:0.75rem 0;text-align:right;color:#f8fafc;">
                                <strong>${formatINR(financials.grossPayable)}</strong>
                            </td>
                        </tr>

                        <tr>
                            <td style="padding:0.6rem 0;color:#10b981;">
                                Amount Received
                            </td>

                            <td style="padding:0.6rem 0;text-align:right;color:#10b981;">
                                - ${formatINR(financials.amountPaid)}
                            </td>
                        </tr>

                        <tr style="
                            border-top:1px solid #334155;
                            font-size:1rem;
                            font-weight:700;
                        ">
                            <td style="padding:0.85rem 0;color:#f8fafc;">
                                Balance Due
                            </td>

                            <td style="
                                padding:0.85rem 0;
                                text-align:right;
                                color:${financials.balanceDue > 0
                ? '#ef4444'
                : '#10b981'};
                            ">
                                ${formatINR(financials.balanceDue)}
                            </td>
                        </tr>

                        ${financials.advanceCredit > 0 ? `
                            <tr>
                                <td style="padding:0.6rem 0;color:#38bdf8;">
                                    Advance / Excess Payment
                                </td>

                                <td style="padding:0.6rem 0;text-align:right;color:#38bdf8;">
                                    ${formatINR(financials.advanceCredit)}
                                </td>
                            </tr>
                        ` : ''}
                    </tbody>
                </table>

                <p style="
                    color:#64748b;
                    font-size:0.75rem;
                    text-align:center;
                    margin-top:1rem;
                ">
                    Generated by RentFlow
                </p>
            </div>
        `;

        return true;
    }


    // ==========================================
    // 4. PDF GENERATION
    // ==========================================

    function downloadPDF(rawInvoiceData) {

        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('PDF engine unavailable. Please check the jsPDF CDN.');
            return false;
        }

        let model;

        try {
            model = processInvoiceModel(rawInvoiceData);
        } catch (error) {
            alert('Cannot generate invoice: ' + error.message);
            return false;
        }

        try {
            const { jsPDF } = window.jspdf;

            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            const margin = 20;
            const usableWidth = pageWidth - margin * 2;

            let cursorY = 55;

            const financials = model.financials;

            /**
             * Add text with automatic line wrapping.
             */
            function addWrappedText(text, x, y, maxWidth, lineHeight = 5) {
                const lines = doc.splitTextToSize(
                    String(text),
                    maxWidth
                );

                lines.forEach(line => {
                    ensureSpace(lineHeight + 2);
                    doc.text(line, x, cursorY);
                    cursorY += lineHeight;
                });

                return lines.length;
            }

            /**
             * Add new page when required.
             */
            function ensureSpace(requiredHeight = 10) {
                if (cursorY + requiredHeight > pageHeight - 20) {
                    doc.addPage();
                    cursorY = 20;
                }
            }

            /**
             * Draw a horizontal divider.
             */
            function drawDivider(color = [220, 226, 232]) {
                doc.setDrawColor(...color);
                doc.setLineWidth(0.3);
                doc.line(
                    margin,
                    cursorY,
                    pageWidth - margin,
                    cursorY
                );
            }

            /**
             * Draw PDF table row.
             * Uses Rs. because jsPDF's standard Helvetica font
             * may not support the ₹ glyph.
             */
            function drawRow(label, amount, options = {}) {
                const {
                    bold = false,
                    color = [51, 65, 85],
                    amountColor = color,
                    fontSize = 10
                } = options;

                const labelLines = doc.splitTextToSize(
                    String(label),
                    usableWidth * 0.65
                );

                const rowHeight = Math.max(7, labelLines.length * 5 + 2);

                ensureSpace(rowHeight + 2);

                doc.setFont(
                    'helvetica',
                    bold ? 'bold' : 'normal'
                );

                doc.setFontSize(fontSize);
                doc.setTextColor(...color);

                doc.text(labelLines, margin, cursorY + 4);

                doc.setTextColor(...amountColor);

                doc.text(
                    'Rs. ' + Number(amount).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }),
                    pageWidth - margin,
                    cursorY + 4,
                    { align: 'right' }
                );

                cursorY += rowHeight;
            }

            // ----------------------------------
            // PDF HEADER
            // ----------------------------------

            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, pageWidth, 44, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(20);
            doc.setTextColor(248, 250, 252);

            doc.text('RentFlow Invoice', margin, 19);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(203, 213, 225);

            doc.text(
                doc.splitTextToSize(
                    'Property: ' + model.landlord.propertyName,
                    85
                ),
                margin,
                27
            );

            doc.text(
                doc.splitTextToSize(
                    'Landlord: ' + model.landlord.name,
                    85
                ),
                margin,
                34
            );

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(248, 250, 252);

            doc.text(
                doc.splitTextToSize(model.invoiceNumber, 65),
                pageWidth - margin,
                19,
                { align: 'right' }
            );

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(203, 213, 225);

            doc.text(
                'Date: ' + model.issueDate,
                pageWidth - margin,
                28,
                { align: 'right' }
            );

            doc.text(
                'Status: ' + financials.status,
                pageWidth - margin,
                35,
                { align: 'right' }
            );


            // ----------------------------------
            // BILLING INFORMATION
            // ----------------------------------

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(30, 41, 59);

            doc.text('Billed To', margin, cursorY);

            doc.text(
                'Rental Period',
                pageWidth - margin,
                cursorY,
                { align: 'right' }
            );

            cursorY += 7;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(51, 65, 85);

            addWrappedText(
                'Name: ' + model.tenant.fullName,
                margin,
                cursorY,
                usableWidth * 0.55
            );

            // if (model.tenant.propertyAddress) {
            //     addWrappedText(
            //         model.tenant.propertyAddress,
            //         margin,
            //         cursorY,
            //         usableWidth * 0.55
            //     );
            // }

            addWrappedText(
                'Phone: ' + model.tenant.phone,
                margin,
                cursorY,
                usableWidth * 0.55
            );

            if (model.tenant.email !== 'N/A') {
                addWrappedText(
                    'Email: ' + model.tenant.email,
                    margin,
                    cursorY,
                    usableWidth * 0.55
                );
            }

            const periodLines = doc.splitTextToSize(
                model.rentalPeriod,
                usableWidth * 0.35
            );

            doc.setFont('helvetica', 'bold');
            doc.text(
                periodLines,
                pageWidth - margin,
                62,
                { align: 'right' }
            );

            cursorY += 5;


            // ----------------------------------
            // FINANCIAL SUMMARY
            // ----------------------------------

            ensureSpace(20);

            drawDivider();
            cursorY += 7;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(30, 41, 59);

            doc.text('Invoice Breakdown', margin, cursorY);

            cursorY += 9;

            doc.setFillColor(241, 245, 249);
            doc.rect(margin, cursorY - 5, usableWidth, 9, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(71, 85, 105);

            doc.text('DESCRIPTION', margin + 2, cursorY + 1);

            doc.text(
                'AMOUNT',
                pageWidth - margin - 2,
                cursorY + 1,
                { align: 'right' }
            );

            cursorY += 10;

            drawRow(
                'Base Rent (' + model.rentalPeriod + ')',
                financials.monthlyRent
            );

            if (financials.additionalCharges > 0) {
                drawRow(
                    financials.additionalChargesDescription,
                    financials.additionalCharges
                );
            }

            if (financials.previousBalance > 0) {
                drawRow(
                    'Previous Outstanding Arrears',
                    financials.previousBalance,
                    {
                        amountColor: [220, 38, 38]
                    }
                );
            }

            cursorY += 2;
            drawDivider();
            cursorY += 7;

            drawRow(
                'Total Payable',
                financials.grossPayable,
                {
                    bold: true,
                    fontSize: 11
                }
            );

            drawRow(
                'Amount Received',
                financials.amountPaid,
                {
                    amountColor: [5, 150, 105]
                }
            );

            cursorY += 2;
            drawDivider([148, 163, 184]);
            cursorY += 8;

            drawRow(
                'BALANCE DUE',
                financials.balanceDue,
                {
                    bold: true,
                    fontSize: 13,
                    color: [30, 41, 59],
                    amountColor: financials.balanceDue > 0
                        ? [220, 38, 38]
                        : [5, 150, 105]
                }
            );

            if (financials.advanceCredit > 0) {
                drawRow(
                    'Advance / Excess Payment',
                    financials.advanceCredit,
                    {
                        amountColor: [2, 132, 199]
                    }
                );
            }


            // ----------------------------------
            // FOOTER ON ALL PAGES
            // ----------------------------------

            const totalPages = doc.internal.getNumberOfPages();

            for (let page = 1; page <= totalPages; page++) {
                doc.setPage(page);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);

                doc.text(
                    'Generated by RentFlow',
                    margin,
                    pageHeight - 10
                );

                doc.text(
                    `Page ${page} of ${totalPages}`,
                    pageWidth - margin,
                    pageHeight - 10,
                    { align: 'right' }
                );
            }

            // ----------------------------------
            // DOWNLOAD
            // ----------------------------------

            const safeName = model.tenant.fullName
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .slice(0, 40);

            const safeInvoiceNumber = model.invoiceNumber
                .replace(/[^a-zA-Z0-9_-]/g, '_');

            doc.save(
                `RentFlow_${safeName}_${safeInvoiceNumber}.pdf`
            );

            return true;

        } catch (error) {
            console.error('Invoice PDF generation failed:', error);

            alert(
                'Unable to generate PDF. Please check the console for details.'
            );

            return false;
        }
    }


    // ==========================================
    // 5. PUBLIC API
    // ==========================================

    window.RentFlowInvoice = {
        formatINR,
        parseSafeNumber,
        generateInvoiceNumber,
        processInvoiceModel,
        renderPreview,
        downloadPDF
    };

})(window);
