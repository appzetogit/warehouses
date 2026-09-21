import { ShippingProvider } from './shippingProvider.interface.js';

export class MockShippingProvider extends ShippingProvider {
    constructor(options = {}) {
        super();
        this.name = 'mock';
        this.defaultRate = options.defaultRate || 50;
        this.shipments = new Map();
    }

    async checkServiceability(pincode, weightGrams = 500) {
        const pin = String(pincode || '').trim();
        // Disallow known invalid pincodes or 000000
        if (!pin || pin.length !== 6 || pin === '000000') {
            return { serviceable: false, estimatedDays: 0, couriers: [] };
        }
        return {
            serviceable: true,
            estimatedDays: 3,
            couriers: ['MockExpress', 'MockSurface'],
        };
    }

    async calculateRate({ originPincode, destPincode, weightGrams = 500 }) {
        const rate = weightGrams > 1000 ? this.defaultRate * 1.5 : this.defaultRate;
        return {
            rate,
            currency: 'INR',
            courierName: 'MockExpress',
        };
    }

    async createShipment(orderData) {
        const shipmentId = `MOCK-SHIP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const awb = `AWB${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const etd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        const record = {
            shipmentId,
            awb,
            courierName: 'MockExpress',
            labelUrl: `https://shipping.mock/labels/${awb}.pdf`,
            etd,
            status: 'manifested',
            trackingHistory: [
                {
                    status: 'manifested',
                    activity: 'Shipment data manifested with courier',
                    location: 'Origin Facility',
                    timestamp: new Date(),
                },
            ],
        };
        this.shipments.set(awb, record);
        return {
            shipmentId,
            awb,
            courierName: record.courierName,
            labelUrl: record.labelUrl,
            etd: record.etd,
        };
    }

    async requestPickup(shipmentId) {
        return { success: true, pickupToken: `PK-${Date.now()}` };
    }

    async cancelShipment(shipmentId) {
        return { success: true, message: 'Shipment cancelled with mock courier' };
    }

    async trackShipment(awb) {
        const record = this.shipments.get(awb);
        if (!record) {
            return {
                currentStatus: 'in_transit',
                trackingEvents: [
                    {
                        status: 'in_transit',
                        activity: 'Package in transit to delivery hub',
                        location: 'Sorting Hub',
                        timestamp: new Date(),
                    },
                ],
            };
        }
        return {
            currentStatus: record.status,
            trackingEvents: record.trackingHistory,
        };
    }
}

export const defaultShippingProvider = new MockShippingProvider();
