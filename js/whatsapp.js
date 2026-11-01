/**
 * RentFlow - WhatsApp Message Module (js/whatsapp.js)
 * Formats polite, professional rent notifications and creates
 * secure WhatsApp click-to-chat URLs for manual dispatch.
 */

(function (window) {
    'use strict';

    /**
     * Format numbers into INR currency format
     */
    function formatCurrency(amount) {
        const val = parseFloat(amount);
        if (isNaN(val)) return '₹0.00';
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(val);
    }

    /**
     * Sanitize phone number into international numeric format
     * Removes spaces, dashes, parentheses, plus signs.
     * Defaulting fallback for Indian 10-digit mobile if country code is omitted.
     */
    function sanitizePhone(rawPhone) {
        if (!rawPhone || typeof rawPhone !== 'string') return null;

        // Keep only digits
        let digits = rawPhone.replace(/\D/g, '');

        if (!digits) return null;

        // If user typed standard 10-digit Indian number without country code
        if (digits.length === 10) {
            digits = '91' + digits;
        }

        // WhatsApp requires minimum 10 to 15 digits according to E.164
        if (digits.length < 10 || digits.length > 15) {
            return null;
        }

        return digits;
    }

    /**
     * Generate rent reminder message
     */
    function generateReminderMessage(tenant, context = {}) {
        const tenantName = tenant && tenant.fullName ? tenant.fullName.trim() : 'Tenant';
        const period = context.month || 'the current period';
        const amountDue = formatCurrency(context.amountDue);

        return (
            `Dear ${tenantName},\n\n` +
            `This is a gentle reminder regarding the rent for ${period}.\n` +
            `Total Amount Due: ${amountDue}\n\n` +
            `Kindly arrange the payment at your earliest convenience. If you have already made the transfer, please disregard this message.\n\n` +
            `Thank you,\n` +
            `RentFlow Property Management`
        );
    }

    /**
     * Generate payment confirmation receipt message
     */
    function generateConfirmationMessage(tenant, context = {}) {
        const tenantName = tenant && tenant.fullName ? tenant.fullName.trim() : 'Tenant';
        const period = context.month || 'the current period';
        const amountReceived = formatCurrency(context.amountPaid);
        const balanceRemaining = formatCurrency(context.balanceRemaining);
        const paymentDate = context.paymentDate || new Date().toISOString().split('T')[0];

        let message = 
            `Dear ${tenantName},\n\n` +
            `We acknowledge receipt of your rent payment. Details below:\n\n` +
            `• Period: ${period}\n` +
            `• Amount Received: ${amountReceived}\n` +
            `• Payment Date: ${paymentDate}\n` +
            `• Remaining Balance: ${balanceRemaining}\n\n` +
            `Thank you for your prompt payment.\n\n` +
            `Warm regards,\n` +
            `RentFlow Property Management`;

        return message;
    }

    /**
     * Generate pending balance summary message
     */
    function generatePendingSummaryMessage(tenant, context = {}) {
        const tenantName = tenant && tenant.fullName ? tenant.fullName.trim() : 'Tenant';
        const pendingPeriod = context.month || 'the overdue period';
        const totalPending = formatCurrency(context.amountDue);

        return (
            `Dear ${tenantName},\n\n` +
            `According to our records, there is an outstanding balance for ${pendingPeriod}.\n` +
            `Outstanding Balance: ${totalPending}\n\n` +
            `Please review your payment records and arrange for clearance at your earliest convenience. ` +
            `Feel free to reach out if you have any questions or require clarification.\n\n` +
            `Regards,\n` +
            `RentFlow Property Management`
        );
    }

    /**
     * Construct official WhatsApp click-to-chat URL
     */
    function getWhatsAppUrl(phone, message) {
        const cleanPhone = sanitizePhone(phone);
        if (!cleanPhone) {
            return {
                success: false,
                error: 'Invalid or missing phone number. Please ensure a valid phone number with country code is provided.'
            };
        }

        if (!message || typeof message !== 'string' || !message.trim()) {
            return {
                success: false,
                error: 'Message text cannot be empty.'
            };
        }

        const encodedMessage = encodeURIComponent(message.trim());
        const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;

        return {
            success: true,
            url: url
        };
    }

    /**
     * Open WhatsApp conversation in a secure new browser tab
     * Must be called in response to direct user interaction
     */
    function openWhatsAppChat(phone, message) {
        const result = getWhatsAppUrl(phone, message);

        if (!result.success) {
            alert(result.error);
            return false;
        }

        const openedWindow = window.open(result.url, '_blank', 'noopener,noreferrer');
        if (!openedWindow) {
            alert('Pop-up blocked. Please allow pop-ups for this site to open WhatsApp.');
            return false;
        }

        return true;
    }

    // Expose public API
    window.WhatsAppManager = {
        sanitizePhone,
        generateReminderMessage,
        generateConfirmationMessage,
        generatePendingSummaryMessage,
        getWhatsAppUrl,
        openWhatsAppChat
    };

})(window);