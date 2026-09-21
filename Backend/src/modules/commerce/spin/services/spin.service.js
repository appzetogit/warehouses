import crypto from 'crypto';
import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import { getSellerTimezone } from '../../../../utils/timezone.js';
import { creditCoins, getCoinBalance } from '../../coins/services/coin.service.js';
import { SpinCampaign, SpinResult, SpinBudget, DEFAULT_SPIN_SEGMENTS } from '../models/spin.model.js';

const toOid = (id, what = 'id') => {
    const s = String(id || '');
    if (!mongoose.Types.ObjectId.isValid(s)) throw new ValidationError(`Invalid ${what}`);
    return new mongoose.Types.ObjectId(s);
};

/**
 * The store's calendar day, not the server's: a server on UTC would otherwise
 * reset everyone's daily spin at 5:30 in the morning in India.
 */
const storeDay = (at = new Date()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: getSellerTimezone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

/** When the store's next day begins, as a real instant. */
function nextStoreDayStart(at = new Date()) {
    const today = storeDay(at);
    // Step forward in hours until the store-local date changes; at most 25 steps.
    let t = new Date(Math.floor(at.getTime() / 3600000) * 3600000);
    while (storeDay(t) === today) t = new Date(t.getTime() + 3600000);
    return t;
}

export async function getActiveCampaign() {
    let campaign = await SpinCampaign.findOne({ isActive: true }).lean();
    if (!campaign) {
        campaign = (await SpinCampaign.create({
            title: 'Daily Lucky Wheel',
            isActive: true,
            segments: DEFAULT_SPIN_SEGMENTS,
            dailyLimit: 1,
        })).toObject();
    }
    return campaign;
}

export async function getSpinStatus(userId) {
    const user = toOid(userId, 'user id');
    const campaign = await getActiveCampaign();
    const spinsToday = await SpinResult.countDocuments({ userId: user, day: storeDay() });
    const dailyLimit = campaign.dailyLimit || 1;
    const coinBalance = await getCoinBalance(user).catch(() => ({ usable: 0 }));

    return {
        canSpin: spinsToday < dailyLimit,
        spinsRemaining: Math.max(0, dailyLimit - spinsToday),
        dailyLimit,
        nextSpinAt: nextStoreDayStart(),
        segments: campaign.segments,
        coinBalance: coinBalance.usable,
    };
}

function pickSegmentIndex(segments) {
    const weights = segments.map((s) => Math.max(1, Number(s.weight) || 1));
    const total = weights.reduce((a, b) => a + b, 0);
    // Chosen on the server with a CSPRNG; the app only animates to the answer.
    const roll = crypto.randomInt(0, total);
    let cumulative = 0;
    for (let i = 0; i < weights.length; i++) {
        cumulative += weights[i];
        if (roll < cumulative) return i;
    }
    return weights.length - 1;
}

/**
 * Takes `coins` from this month's budget, or returns false if it would go over.
 * The check and the draw-down are one conditional update.
 */
async function drawFromBudget(campaign, coins, at = new Date()) {
    const budget = Number(campaign.monthlyCoinBudget) || 0;
    if (budget <= 0) return true;
    const month = storeDay(at).slice(0, 7);
    await SpinBudget.updateOne(
        { campaignId: campaign._id, month },
        { $setOnInsert: { used: 0 } },
        { upsert: true }
    ).catch((err) => { if (err?.code !== 11000) throw err; });
    const res = await SpinBudget.updateOne(
        { campaignId: campaign._id, month, used: { $lte: budget - coins } },
        { $inc: { used: coins } }
    );
    return res.modifiedCount === 1;
}

/**
 * One spin. The daily limit is enforced by claiming a numbered slot for the
 * store-local day under a unique index, so rapid or scripted taps cannot spin
 * more than the limit. The result is recorded before any coins move, and the
 * credit is keyed to the spin, so a retry never pays twice.
 */
export async function playSpin(userId, { ip = '' } = {}) {
    const user = toOid(userId, 'user id');
    const campaign = await getActiveCampaign();
    const dailyLimit = campaign.dailyLimit || 1;
    const day = storeDay();
    const segments = campaign.segments?.length ? campaign.segments : DEFAULT_SPIN_SEGMENTS;

    let index = pickSegmentIndex(segments);
    let segment = segments[index];

    // Over budget: land on a no-prize segment rather than pay out.
    if (segment.type === 'coins' && segment.value > 0 && !(await drawFromBudget(campaign, segment.value))) {
        const blank = segments.findIndex((s) => s.type === 'none');
        index = blank >= 0 ? blank : index;
        segment = blank >= 0 ? segments[blank] : { ...segment, type: 'none', value: 0, label: 'Better Luck' };
    }

    const spinId = new mongoose.Types.ObjectId();
    const pays = segment.type === 'coins' && segment.value > 0;
    let result = null;
    const taken = await SpinResult.countDocuments({ userId: user, day });
    for (let seq = taken + 1; seq <= dailyLimit && !result; seq++) {
        try {
            result = await SpinResult.create({
                _id: spinId,
                userId: user,
                campaignId: campaign._id,
                segmentWon: { id: segment.id, label: segment.label, type: segment.type, value: segment.value },
                rewardRef: pays ? `spin:${spinId}` : null,
                coinsAwarded: pays ? segment.value : 0,
                ip,
                day,
                seq,
            });
        } catch (err) {
            if (err?.code !== 11000) throw err;
            // Another spin took this slot a moment ago; try the next one.
        }
    }
    if (!result) {
        // Give back any budget drawn for a spin that never happened.
        if (pays && Number(campaign.monthlyCoinBudget) > 0) {
            await SpinBudget.updateOne({ campaignId: campaign._id, month: day.slice(0, 7) }, { $inc: { used: -segment.value } });
        }
        throw new ValidationError('You have already used your daily spin. Come back tomorrow!');
    }

    if (pays) {
        try {
            await creditCoins({
                userId: user,
                amount: segment.value,
                source: 'spin',
                refId: `spin:${spinId}`,
                spendablePercent: 100,
                note: `Won on ${campaign.title || 'the wheel'} (${segment.label})`,
            });
            await SpinResult.updateOne({ _id: spinId }, { $set: { rewardStatus: 'credited' } });
        } catch (err) {
            logger.error(`[spin] crediting ${segment.value} coins for spin ${spinId} failed: ${err?.message || err}`);
            await SpinResult.updateOne({ _id: spinId }, { $set: { rewardStatus: 'failed' } });
            throw err;
        }
    }

    const balance = await getCoinBalance(user).catch(() => ({ usable: 0 }));
    return {
        winningIndex: index,
        segment,
        coinsAwarded: pays ? segment.value : 0,
        balance: balance.usable,
        spinsRemaining: Math.max(0, dailyLimit - result.seq),
    };
}
