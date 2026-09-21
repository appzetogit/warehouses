import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockShippingProvider } from '../src/modules/commerce/delivery/services/shipping/mockShipping.provider.js';

test('MockShippingProvider checks pincode serviceability', async () => {
    const provider = new MockShippingProvider();

    const valid = await provider.checkServiceability('560001');
    assert.equal(valid.serviceable, true);
    assert.equal(valid.estimatedDays, 3);
    assert.ok(valid.couriers.includes('MockExpress'));

    const invalid = await provider.checkServiceability('000000');
    assert.equal(invalid.serviceable, false);

    const short = await provider.checkServiceability('123');
    assert.equal(short.serviceable, false);
});

test('MockShippingProvider calculates rates based on weight', async () => {
    const provider = new MockShippingProvider({ defaultRate: 60 });
    const standard = await provider.calculateRate({ originPincode: '560001', destPincode: '110001', weightGrams: 500 });
    assert.equal(standard.rate, 60);

    const heavy = await provider.calculateRate({ originPincode: '560001', destPincode: '110001', weightGrams: 2000 });
    assert.equal(heavy.rate, 90);
});

test('MockShippingProvider handles shipment creation, tracking, pickup and cancellation', async () => {
    const provider = new MockShippingProvider();

    const shipment = await provider.createShipment({
        orderId: 'ORD-1234',
        originPincode: '560001',
        destPincode: '400001',
    });
    assert.ok(shipment.shipmentId.startsWith('MOCK-SHIP-'));
    assert.ok(shipment.awb.startsWith('AWB'));
    assert.equal(shipment.courierName, 'MockExpress');
    assert.ok(shipment.labelUrl.includes(shipment.awb));

    const tracking = await provider.trackShipment(shipment.awb);
    assert.equal(tracking.currentStatus, 'manifested');
    assert.equal(tracking.trackingEvents.length, 1);

    const pickup = await provider.requestPickup(shipment.shipmentId);
    assert.equal(pickup.success, true);
    assert.ok(pickup.pickupToken.startsWith('PK-'));

    const cancellation = await provider.cancelShipment(shipment.shipmentId);
    assert.equal(cancellation.success, true);
});
