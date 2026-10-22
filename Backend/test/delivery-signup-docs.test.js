/**
 * Rider sign-up documents: Aadhaar and licence as before; PAN, RC and bank
 * details optional; a selfie stored when sent. The payload older app builds
 * send (no RC, no bank, no selfie) must keep working.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// Keep uploads off the disk: every image "uploads" to a URL naming its folder.
mock.module(new URL('../src/services/cloudinary.service.js', import.meta.url).href, {
    namedExports: {
        uploadImageBuffer: async (_buffer, folder) => `/uploads/${folder}/test.webp`,
        uploadImageBufferDetailed: async () => ({ url: '/uploads/x.webp', secure_url: '/uploads/x.webp', public_id: 'x', path: 'x', filename: 'x' }),
    },
});

const { startApp, stopApp, callForm, ok } = await import('./helpers/app.js');

let db;
before(async () => { db = await startApp(); });
after(stopApp);

const image = () => new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });

let seq = 0;
const basics = () => {
    seq += 1;
    return {
        name: 'Ravi Kumar',
        phone: `98765${String(10000 + seq).slice(-5)}`,
        address: '12 Main Road',
        city: 'Pune',
        state: 'Maharashtra',
        vehicleType: 'bike',
        vehicleNumber: `MH12AB${String(1000 + seq)}`,
        drivingLicenseNumber: 'MH1220110012345',
        aadharNumber: '123456789012',
    };
};

const register = (fields, files = []) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const f of files) form.append(f, image(), `${f}.png`);
    return callForm('POST', '/delivery/register', { form });
};
const stored = (phone) => db.collection('delivery_partners').findOne({ phone });

test('the payload the app sends today still registers (PAN given, no RC/bank/selfie)', async () => {
    const fields = { ...basics(), panNumber: 'ABCDE1234F' };
    ok(await register(fields, ['profilePhoto', 'aadharPhoto', 'panPhoto', 'drivingLicensePhoto']), 'legacy signup', 201);
    const p = await stored(fields.phone);
    assert.equal(p.status, 'pending');
    assert.equal(p.panNumber, 'ABCDE1234F');
    assert.equal(p.panPhoto, '/uploads/delivery/pan/test.webp');
    assert.equal(p.aadharPhoto, '/uploads/delivery/aadhar/test.webp');
    assert.equal(p.drivingLicensePhoto, '/uploads/delivery/license/test.webp');
    assert.equal(p.selfiePhoto, undefined);
    assert.equal(p.rcNumber, undefined);
    assert.equal(p.bankAccountNumber, undefined);
});

test('PAN, RC and bank can all be left out; a selfie is stored', async () => {
    const fields = { ...basics(), panNumber: '', rcNumber: '', bankAccountNumber: '', bankIfscCode: '' };
    ok(await register(fields, ['profilePhoto', 'aadharPhoto', 'drivingLicensePhoto', 'selfiePhoto']), 'no PAN', 201);
    const p = await stored(fields.phone);
    assert.ok(!p.panNumber);
    assert.equal(p.panPhoto, undefined);
    assert.equal(p.selfiePhoto, '/uploads/delivery/selfie/test.webp');
    assert.equal(p.rcNumber, undefined);
    assert.equal(p.bankIfscCode, undefined);
});

test('all six documents plus RC number and bank details are stored', async () => {
    const fields = {
        ...basics(),
        panNumber: 'ABCDE1234F',
        rcNumber: 'mh 12 ab 1234',
        bankAccountHolderName: 'Ravi Kumar',
        bankAccountNumber: '123456789012',
        bankIfscCode: 'sbin0012345',
        bankName: 'State Bank of India',
    };
    const files = ['profilePhoto', 'aadharPhoto', 'panPhoto', 'drivingLicensePhoto', 'rcPhoto', 'selfiePhoto'];
    ok(await register(fields, files), 'full signup', 201);
    const p = await stored(fields.phone);
    assert.equal(p.rcNumber, 'MH12AB1234');
    assert.equal(p.rcPhoto, '/uploads/delivery/rc/test.webp');
    assert.equal(p.selfiePhoto, '/uploads/delivery/selfie/test.webp');
    assert.equal(p.bankAccountHolderName, 'Ravi Kumar');
    assert.equal(p.bankAccountNumber, '123456789012');
    assert.equal(p.bankIfscCode, 'SBIN0012345');
    assert.equal(p.bankName, 'State Bank of India');
});

test('bank details, once started, must be complete and well-formed', async () => {
    const badIfsc = await register({ ...basics(), bankAccountNumber: '123456789012', bankIfscCode: 'SBIN12345' }, ['aadharPhoto']);
    assert.equal(badIfsc.status, 400);
    assert.match(badIfsc.body.message, /IFSC/);

    const shortAccount = await register({ ...basics(), bankAccountNumber: '1234', bankIfscCode: 'SBIN0012345' }, ['aadharPhoto']);
    assert.equal(shortAccount.status, 400);
    assert.match(shortAccount.body.message, /Account number/);

    const half = await register({ ...basics(), bankAccountHolderName: 'Ravi Kumar' }, ['aadharPhoto']);
    assert.equal(half.status, 400);
    assert.match(half.body.message, /IFSC/);

    const badRc = await register({ ...basics(), rcNumber: 'AB' }, ['aadharPhoto']);
    assert.equal(badRc.status, 400);
    assert.match(badRc.body.message, /RC/);
});
