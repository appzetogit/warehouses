/**
 * ShippingProvider interface definition.
 * All courier implementations (Shiprocket, Delhivery, Mock) must conform to this interface.
 */
export class ShippingProvider {
    /**
     * Check if a destination pincode is serviceable.
     * @param {string} pincode
     * @param {number} [weightGrams]
     * @returns {Promise<{ serviceable: boolean, estimatedDays?: number, couriers?: string[] }>}
     */
    async checkServiceability(pincode, weightGrams) {
        throw new Error('checkServiceability must be implemented');
    }

    /**
     * Calculate shipping rate.
     * @param {{ originPincode: string, destPincode: string, weightGrams: number, dimensions?: { length: number, width: number, height: number } }} params
     * @returns {Promise<{ rate: number, currency: string, courierName?: string }>}
     */
    async calculateRate(params) {
        throw new Error('calculateRate must be implemented');
    }

    /**
     * Create shipment and generate AWB.
     * @param {Object} orderData - Child order payload
     * @returns {Promise<{ shipmentId: string, awb: string, courierName: string, labelUrl?: string, etd?: Date }>}
     */
    async createShipment(orderData) {
        throw new Error('createShipment must be implemented');
    }

    /**
     * Request courier pickup.
     * @param {string} shipmentId
     * @returns {Promise<{ success: boolean, pickupToken?: string }>}
     */
    async requestPickup(shipmentId) {
        throw new Error('requestPickup must be implemented');
    }

    /**
     * Cancel an existing shipment.
     * @param {string} shipmentId
     * @returns {Promise<{ success: boolean, message?: string }>}
     */
    async cancelShipment(shipmentId) {
        throw new Error('cancelShipment must be implemented');
    }

    /**
     * Track an active shipment by AWB.
     * @param {string} awb
     * @returns {Promise<{ currentStatus: string, trackingEvents: Array<{ status: string, activity: string, location: string, timestamp: Date }> }>}
     */
    async trackShipment(awb) {
        throw new Error('trackShipment must be implemented');
    }
}
