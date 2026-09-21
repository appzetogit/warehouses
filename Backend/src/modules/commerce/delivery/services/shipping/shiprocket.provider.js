import { ShippingProvider } from './shippingProvider.interface.js';
import { logger } from '../../../../../utils/logger.js';

/**
 * Shiprocket: one API in front of Delhivery, Blue Dart, Xpressbees, Ekart and
 * others, with the courier picked per shipment by price or speed. Chosen over a
 * single courier's API so coverage is not limited to one network's pincodes.
 *
 * Needs SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD (an API user from the Shiprocket
 * panel) and SHIPROCKET_PICKUP_LOCATION (the pickup nickname set up there).
 */
const BASE = process.env.SHIPROCKET_BASE_URL || 'https://apiv2.shiprocket.in/v1/external';
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000; // tokens last 10 days

const STATUS_MAP = {
    'PICKUP SCHEDULED': 'manifested',
    'PICKED UP': 'picked_up',
    'IN TRANSIT': 'in_transit',
    'OUT FOR DELIVERY': 'out_for_delivery',
    DELIVERED: 'delivered',
    CANCELED: 'cancelled',
    CANCELLED: 'cancelled',
    RTO: 'returned',
    'RTO DELIVERED': 'returned',
};

const kg = (grams) => Math.max(0.1, (Number(grams) || 500) / 1000);

export class ShiprocketProvider extends ShippingProvider {
    constructor({ email, password, pickupLocation, fetchImpl } = {}) {
        super();
        this.name = 'shiprocket';
        this.email = email;
        this.password = password;
        this.pickupLocation = pickupLocation || 'Primary';
        this.fetch = fetchImpl || globalThis.fetch;
        this.token = null;
        this.tokenAt = 0;
    }

    async authToken() {
        if (this.token && Date.now() - this.tokenAt < TOKEN_TTL_MS) return this.token;
        const res = await this.fetch(`${BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: this.email, password: this.password }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.token) throw new Error(`Shiprocket login failed: ${body.message || res.status}`);
        this.token = body.token;
        this.tokenAt = Date.now();
        return this.token;
    }

    async call(method, path, payload) {
        const token = await this.authToken();
        const res = await this.fetch(`${BASE}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: payload ? JSON.stringify(payload) : undefined,
        });
        const body = await res.json().catch(() => ({}));
        if (res.status === 401) this.token = null;
        if (!res.ok) throw new Error(`Shiprocket ${path} failed: ${body.message || res.status}`);
        return body;
    }

    async couriersFor(originPincode, destPincode, weightGrams) {
        const q = new URLSearchParams({
            pickup_postcode: String(originPincode || process.env.SHIPROCKET_DEFAULT_PICKUP_PINCODE || ''),
            delivery_postcode: String(destPincode || ''),
            weight: String(kg(weightGrams)),
            cod: '0',
        });
        const body = await this.call('GET', `/courier/serviceability/?${q}`);
        return body?.data?.available_courier_companies || [];
    }

    async checkServiceability(pincode, weightGrams = 500, originPincode) {
        const list = await this.couriersFor(originPincode, pincode, weightGrams);
        return {
            serviceable: list.length > 0,
            estimatedDays: list.length ? Math.min(...list.map((c) => Number(c.estimated_delivery_days) || 99)) : 0,
            couriers: list.map((c) => c.courier_name),
        };
    }

    async calculateRate({ originPincode, destPincode, weightGrams = 500 }) {
        const list = await this.couriersFor(originPincode, destPincode, weightGrams);
        if (!list.length) throw new Error('No courier serves this pincode');
        const cheapest = list.reduce((a, b) => (Number(b.rate) < Number(a.rate) ? b : a));
        return { rate: Number(cheapest.rate), currency: 'INR', courierName: cheapest.courier_name };
    }

    /**
     * Creates the order in Shiprocket, assigns an AWB (Shiprocket picks the
     * courier by the account's rules), then asks for a pickup and a label.
     */
    async createShipment(o) {
        const addr = o.deliveryAddress || {};
        const items = (o.items || []).map((i, n) => ({
            name: i.name,
            sku: i.sku || `${i.itemId || 'item'}-${n}`,
            units: Number(i.quantity) || 1,
            selling_price: Number(i.price) || 0,
        }));
        const created = await this.call('POST', '/orders/create/adhoc', {
            order_id: String(o.orderId),
            order_date: new Date().toISOString().slice(0, 16).replace('T', ' '),
            pickup_location: this.pickupLocation,
            billing_customer_name: o.customerName || addr.fullName || addr.name || 'Customer',
            billing_last_name: '',
            billing_address: [addr.street, addr.additionalDetails].filter(Boolean).join(', '),
            billing_city: addr.city,
            billing_pincode: String(addr.zipCode || o.destPincode || ''),
            billing_state: addr.state,
            billing_country: 'India',
            billing_email: o.customerEmail || '',
            billing_phone: String(o.customerPhone || addr.phone || '').replace(/\D/g, '').slice(-10),
            shipping_is_billing: true,
            order_items: items,
            payment_method: o.paymentMethod === 'cash' ? 'COD' : 'Prepaid',
            sub_total: Number(o.subTotal) || items.reduce((s, i) => s + i.selling_price * i.units, 0),
            length: 20,
            breadth: 15,
            height: 10,
            weight: kg(o.weightGrams),
        });
        const shipmentId = created.shipment_id;
        const assigned = await this.call('POST', '/courier/assign/awb', { shipment_id: shipmentId });
        const awbData = assigned?.response?.data || {};
        if (!awbData.awb_code) throw new Error(`Shiprocket could not assign a courier: ${assigned?.message || 'no AWB'}`);
        await this.requestPickup(shipmentId).catch((err) => logger.warn(`Shiprocket pickup for ${shipmentId}: ${err.message}`));
        const label = await this.call('POST', '/courier/generate/label', { shipment_id: [shipmentId] }).catch(() => ({}));
        return {
            shipmentId: String(shipmentId),
            providerOrderId: String(created.order_id || ''),
            awb: awbData.awb_code,
            courierName: awbData.courier_name || 'Shiprocket',
            labelUrl: label?.label_url || '',
            etd: awbData.etd ? new Date(awbData.etd) : null,
            provider: this.name,
        };
    }

    async requestPickup(shipmentId) {
        const body = await this.call('POST', '/courier/generate/pickup', { shipment_id: [shipmentId] });
        return { success: true, pickupToken: body?.response?.pickup_token_number || null };
    }

    /** Takes the Shiprocket order id (`providerOrderId`), not the shipment id. */
    async cancelShipment(providerOrderId) {
        await this.call('POST', '/orders/cancel', { ids: [providerOrderId] });
        return { success: true, message: 'Shipment cancelled with Shiprocket' };
    }

    async trackShipment(awb) {
        const body = await this.call('GET', `/courier/track/awb/${encodeURIComponent(awb)}`);
        const data = body?.tracking_data || {};
        const raw = String(data.shipment_track?.[0]?.current_status || '').toUpperCase();
        return {
            currentStatus: STATUS_MAP[raw] || (raw ? raw.toLowerCase().replace(/\s+/g, '_') : 'in_transit'),
            trackingEvents: (data.shipment_track_activities || []).map((a) => ({
                status: String(a['sr-status-label'] || a.status || '').toLowerCase(),
                activity: a.activity,
                location: a.location,
                timestamp: a.date ? new Date(a.date) : null,
            })),
        };
    }
}
