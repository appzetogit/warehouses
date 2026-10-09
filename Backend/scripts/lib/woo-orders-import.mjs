/**
 * Pure mapping from the old thewarehousess.com WooCommerce orders (as read out
 * of the database by scripts/woo-orders-extract.py) to Warehouses orders and
 * customer accounts. No database access here; scripts/import-woocommerce-orders.mjs
 * does the writing.
 */
import { cleanName, normaliseAttribute } from './woo-import.mjs';

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const money = (v) => Math.round(num(v) * 100) / 100;

/** "+91 98765-43210" -> "9876543210": the 10 digits the app signs in with. */
export function phone10(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : '';
}

const INDIAN_STATES = {
    AN: 'Andaman and Nicobar Islands', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar',
    CH: 'Chandigarh', CT: 'Chhattisgarh', CG: 'Chhattisgarh', DN: 'Dadra and Nagar Haveli', DD: 'Daman and Diu', DL: 'Delhi',
    GA: 'Goa', GJ: 'Gujarat', HR: 'Haryana', HP: 'Himachal Pradesh', JK: 'Jammu and Kashmir', JH: 'Jharkhand',
    KA: 'Karnataka', KL: 'Kerala', LA: 'Ladakh', LD: 'Lakshadweep', MP: 'Madhya Pradesh', MH: 'Maharashtra',
    MN: 'Manipur', ML: 'Meghalaya', MZ: 'Mizoram', NL: 'Nagaland', OR: 'Odisha', OD: 'Odisha', PY: 'Puducherry',
    PB: 'Punjab', RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu', TS: 'Telangana', TG: 'Telangana', TR: 'Tripura',
    UK: 'Uttarakhand', UT: 'Uttarakhand', UP: 'Uttar Pradesh', WB: 'West Bengal',
};

export const stateName = (code) => INDIAN_STATES[String(code || '').trim().toUpperCase()] || String(code || '').trim();

const fullName = (a = {}) => [a.first_name, a.last_name].map((s) => String(s || '').trim()).filter(Boolean).join(' ');

/**
 * Old status -> ours. Orders left "processing" on the old site (cash on
 * delivery, months old) come in as delivered: the owner chose that, as they
 * were fulfilled but never closed there.
 */
export function mapStatus(wooStatus) {
    const s = String(wooStatus || '').replace(/^wc-/, '');
    switch (s) {
        case 'completed':
            return { orderStatus: 'delivered', note: 'Completed on the old website' };
        case 'processing':
            return { orderStatus: 'delivered', note: 'Was "Processing" on the old website; imported as delivered' };
        case 'refunded':
            return { orderStatus: 'cancelled_by_admin', note: 'Refunded on the old website', refunded: true };
        case 'cancelled':
            return { orderStatus: 'cancelled_by_admin', note: 'Cancelled on the old website' };
        default:
            return { orderStatus: 'cancelled_by_admin', note: `"${s || 'unknown'}" on the old website; imported as cancelled` };
    }
}

/** The size (or other option) a line was bought in, tidied like the catalogue's. */
export function lineAttributes(attrs = {}) {
    const out = [];
    for (const [key, raw] of Object.entries(attrs || {})) {
        const name = String(key).replace(/^pa_/, '');
        if (!/^(size|colou?r)$/i.test(name) || raw == null || raw === '') continue;
        out.push(normaliseAttribute(name, String(raw).replace(/-/g, ' ')));
    }
    // "size" and "pa_size" can both be present; keep one of each name.
    return out.filter((a, i) => out.findIndex((b) => b.name === a.name) === i);
}

/**
 * One old order -> our Order fields.
 *
 * @param wooOrder        an entry of woo-orders.json
 * @param ctx.userId      the customer's account
 * @param ctx.sellerId    the store the orders belong to
 * @param ctx.productFor  (wooProductId) -> { _id, image, categoryId, categoryName, variants } | null
 */
export function mapOrder(wooOrder, { userId, sellerId, productFor = () => null } = {}) {
    const o = wooOrder;
    const status = mapStatus(o.status);
    const created = new Date(`${String(o.createdAtGmt).replace(' ', 'T')}Z`);
    const finishedRaw = o.dateCompletedGmt || o.updatedAtGmt || o.createdAtGmt;
    const finished = new Date(`${String(finishedRaw).replace(' ', 'T')}Z`);

    const lines = (o.items || []).filter((i) => i.type === 'line_item');
    const items = lines.map((line) => {
        const qty = Math.max(1, Math.round(num(line.qty)) || 1);
        const product = productFor(line.productId);
        const attributes = lineAttributes(line.attrs);
        const variantName = attributes.map((a) => a.value).join(' / ');
        const variant = product && attributes.length
            ? (product.variants || []).find((v) => attributes.every((a) => (v.attributes || []).some((x) => x.name === a.name && String(x.value).toLowerCase() === String(a.value).toLowerCase())))
            : null;
        return {
            itemId: product ? String(product._id) : `woo-${line.productId || 'item'}`,
            name: cleanName(line.name),
            variantId: variant ? String(variant._id) : '',
            variantName,
            variantAttributes: attributes,
            price: money(num(line.lineSubtotal) / qty),
            variantPrice: money(num(line.lineSubtotal) / qty),
            quantity: qty,
            image: product?.image || '',
            categoryId: product?.categoryId || null,
            categoryName: product?.categoryName || '',
        };
    });

    const subtotal = money(lines.reduce((s, l) => s + num(l.lineSubtotal), 0));
    const lineDiscount = lines.reduce((s, l) => s + Math.max(0, num(l.lineSubtotal) - num(l.lineTotal)), 0);
    const feeDiscount = (o.items || []).filter((i) => i.type === 'fee').reduce((s, f) => s + Math.max(0, -num(f.lineTotal)), 0);
    const deliveryFee = money((o.items || []).filter((i) => i.type === 'shipping').reduce((s, sh) => s + num(sh.cost), 0) || num(o.shippingTotal));
    const coupon = (o.items || []).find((i) => i.type === 'coupon');
    const total = money(o.total);

    const ship = String(o.shipping?.address_1 || '').trim() ? o.shipping : o.billing;
    const customerPhone = phone10(o.billing?.phone || o.shipping?.phone);
    const name = fullName(ship) || fullName(o.billing) || 'Customer';

    const method = String(o.paymentMethod || '').toLowerCase() === 'cod' ? 'cash' : 'razorpay';
    const paymentStatus = status.refunded
        ? 'refunded'
        : status.orderStatus === 'delivered'
            ? 'paid'
            : (o.transactionId ? 'paid' : 'failed');

    const payment = {
        method,
        status: paymentStatus,
        ...(o.transactionId ? { razorpay: { paymentId: String(o.transactionId) } } : {}),
        ...(status.refunded ? { refund: { status: 'processed', amount: total, processedAt: finished } } : {}),
    };

    const isCancelled = status.orderStatus.startsWith('cancelled');
    return {
        order_id: `WH-${o.id}`,
        userId,
        sellerId,
        fulfilmentMode: 'standard',
        items,
        deliveryAddress: {
            label: 'Home',
            name,
            fullName: name,
            street: String(ship?.address_1 || '').trim() || '-',
            additionalDetails: String(ship?.address_2 || '').trim(),
            city: String(ship?.city || '').trim() || '-',
            state: stateName(ship?.state) || '-',
            zipCode: String(ship?.postcode || '').trim(),
            phone: customerPhone,
        },
        customerName: name,
        customerPhone,
        pricing: {
            subtotal,
            tax: money(o.tax),
            deliveryFee,
            discount: money(lineDiscount + feeDiscount),
            couponCode: coupon ? String(coupon.name || '').toUpperCase() : null,
            total,
            currency: o.currency || 'INR',
        },
        payment,
        orderStatus: status.orderStatus,
        note: String(o.customerNote || '').trim(),
        ...(isCancelled ? { cancellationReason: status.note, cancelledBy: 'admin', cancelledAt: finished } : {}),
        acceptanceDeadlineAt: null,
        statusHistory: [
            { at: created, byRole: 'SYSTEM', to: 'created', note: 'Placed on the old website' },
            { at: finished, byRole: 'SYSTEM', from: 'created', to: status.orderStatus, note: status.note },
        ],
        createdAt: created,
        updatedAt: finished,
        legacy: { source: 'woocommerce', orderId: o.id, status: o.status },
    };
}

/** Customer accounts to create or reuse, one per phone number, from the orders. */
export function customersFromOrders(orders = []) {
    const byPhone = new Map();
    for (const o of [...orders].sort((a, b) => String(a.createdAtGmt).localeCompare(String(b.createdAtGmt)))) {
        const phone = phone10(o.billing?.phone || o.shipping?.phone);
        if (!phone) continue;
        const prev = byPhone.get(phone);
        // The latest order's name and email win; an empty one never overwrites.
        byPhone.set(phone, {
            phone,
            name: fullName(o.billing) || prev?.name || '',
            email: String(o.billing?.email || o.email || '').trim().toLowerCase() || prev?.email || '',
            firstOrderAt: prev?.firstOrderAt || o.createdAtGmt,
            orders: (prev?.orders || 0) + 1,
        });
    }
    return [...byPhone.values()];
}
