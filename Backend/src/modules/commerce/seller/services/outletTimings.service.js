import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { invalidateCache } from '../../../../middleware/cache.js';
import { SellerOutletTimings } from '../models/outletTimings.model.js';
import { Seller } from '../models/seller.model.js';
import { getSellerLocalTimeParts } from '../../../../utils/timezone.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const normalizeDay = (value) => {
    const v = String(value || '').trim();
    if (!v) return null;
    const exact = DAY_NAMES.find((d) => d.toLowerCase() === v.toLowerCase());
    if (exact) return exact;
    const abbr = v.slice(0, 3).toLowerCase();
    const match = DAY_NAMES.find((d) => d.toLowerCase().startsWith(abbr));
    return match || null;
};

const normalizeTime = (value, fallback) => {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    // Accept "HH:mm" or "H:mm"
    const m = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return fallback;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return fallback;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const defaultTimings = () =>
    DAY_NAMES.map((day) => ({
        day,
        isOpen: true,
        openingTime: '09:00',
        closingTime: '22:00'
    }));

const toClientShape = (doc) => {
    const timings = Array.isArray(doc?.timings) ? doc.timings : [];
    const map = {};
    for (const day of DAY_NAMES) {
        const found = timings.find((t) => normalizeDay(t?.day) === day);
        const isOpen = found ? found.isOpen !== false : true;
        map[day] = {
            isOpen,
            openingTime: isOpen ? normalizeTime(found?.openingTime, '09:00') : '',
            closingTime: isOpen ? normalizeTime(found?.closingTime, '22:00') : ''
        };
    }
    return map;
};

export async function getOutletTimingsForSeller(sellerId) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(String(sellerId))) {
        throw new ValidationError('Invalid store id');
    }
    const doc = await SellerOutletTimings.findOne({ sellerId }).select('timings updatedAt').lean();
    if (!doc) return { outletTimings: toClientShape({ timings: defaultTimings() }) };
    return { outletTimings: toClientShape(doc) };
}

export async function upsertOutletTimingsForSeller(sellerId, outletTimings) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(String(sellerId))) {
        throw new ValidationError('Invalid store id');
    }
    if (!outletTimings || typeof outletTimings !== 'object' || Array.isArray(outletTimings)) {
        throw new ValidationError('outletTimings must be an object keyed by day name');
    }

    const timings = DAY_NAMES.map((day) => {
        const src = outletTimings[day] && typeof outletTimings[day] === 'object' ? outletTimings[day] : {};
        const isOpen = src.isOpen !== false;
        return {
            day,
            isOpen,
            openingTime: isOpen ? normalizeTime(src.openingTime, '09:00') : '',
            closingTime: isOpen ? normalizeTime(src.closingTime, '22:00') : ''
        };
    });

    const doc = await SellerOutletTimings.findOneAndUpdate(
        { sellerId },
        { $set: { timings } },
        { upsert: true, new: true, setDefaultsOnInsert: true, projection: 'timings updatedAt' }
    ).lean();

    const { dayName: currentDayName } = getSellerLocalTimeParts(new Date());
    const todayData = timings.find(t => t.day === currentDayName) || timings.find(t => t.isOpen) || timings[0];

    if (todayData) {
        await Seller.findByIdAndUpdate(sellerId, {
            $set: {
                openingTime: todayData.openingTime,
                closingTime: todayData.closingTime,
                openDays: timings.filter(t => t.isOpen).map(t => t.day)
            }
        });
    }

    // Invalidate public caches so changes reflect immediately for users
    void invalidateCache('sellers:*');
    void invalidateCache('seller_detail:*');
    void invalidateCache('seller_timings:*');

    return { outletTimings: toClientShape(doc) };
}

export async function getOutletTimingsMapForSellers(sellerIds = [], options = {}) {
    const ids = [
        ...new Set(
            (sellerIds || [])
                .map((id) => String(id || '').trim())
                .filter((id) => mongoose.Types.ObjectId.isValid(id))
        )
    ];

    if (!ids.length) return new Map();

    const useDefaults = options?.useDefaults !== false;
    const defaultShape = toClientShape({ timings: defaultTimings() });
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const docs = await SellerOutletTimings.find({ sellerId: { $in: objectIds } })
        .select('sellerId timings')
        .lean();

    const map = useDefaults ? new Map(ids.map((id) => [id, defaultShape])) : new Map();
    for (const doc of docs) {
        map.set(String(doc.sellerId), toClientShape(doc));
    }
    return map;
}

export async function attachOutletTimingsToSellers(sellers = [], options = {}) {
    if (!Array.isArray(sellers) || sellers.length === 0) return sellers;

    const useDefaults = options?.useDefaults !== false;
    const map = await getOutletTimingsMapForSellers(
        sellers.map((r) => r._id || r.id || r.sellerId),
        { useDefaults },
    );

    return sellers.map((r) => {
        const key = String(r._id || r.id || r.sellerId || '');
        return {
            ...r,
            outletTimings: map.get(key) || null
        };
    });
}

