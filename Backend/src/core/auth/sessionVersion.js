import { Seller } from '../../modules/commerce/seller/models/seller.model.js';

/**
 * Seller accounts are shared: the owner and staff sign in with one phone number,
 * so a seller may be signed in on this many devices at once. The next login
 * signs out the oldest one.
 */
export const MAX_SELLER_SESSIONS = 5;

export const SESSION_REVOKED_MESSAGE =
    'You have been signed out because this account was used on another device';

/**
 * Is a token carrying `presented` still a live session for `doc`?
 *
 * - Tokens issued before versioning shipped carry no version at all; those are
 *   accepted until the account next logs in (unchanged from before).
 * - SELLER: valid while the version is one of the seller's sessionVersions. A
 *   seller whose sessionVersions is empty has not logged in since multi-device
 *   shipped (or was just revoked, which also bumps tokenVersion), so the old
 *   single-device equality rule applies.
 * - Every other role: must equal the stored tokenVersion (single device).
 */
export const isSessionVersionValid = (role, doc, presented) => {
    if (presented === undefined || presented === null) return true;
    const version = Number(presented);
    if (role === 'SELLER') {
        const live = Array.isArray(doc?.sessionVersions) ? doc.sessionVersions : [];
        if (live.length > 0) return live.some((v) => Number(v) === version);
    }
    return version === (Number(doc?.tokenVersion) || 0);
};

/**
 * Opens a new seller session and returns its version.
 *
 * One atomic update-pipeline: increments tokenVersion and appends the new value
 * to sessionVersions, keeping the newest MAX_SELLER_SESSIONS. Because the server
 * computes both from the same document state, two simultaneous logins get
 * distinct versions and both land in the list.
 */
export const addSellerSession = async (sellerId) => {
    const updated = await Seller.findOneAndUpdate(
        { _id: sellerId },
        [
            { $set: { tokenVersion: { $add: [{ $ifNull: ['$tokenVersion', 0] }, 1] } } },
            {
                $set: {
                    sessionVersions: {
                        $slice: [
                            { $concatArrays: [{ $ifNull: ['$sessionVersions', []] }, ['$tokenVersion']] },
                            -MAX_SELLER_SESSIONS,
                        ],
                    },
                },
            },
        ],
        { new: true },
    )
        .select('tokenVersion')
        .lean();
    return Number(updated?.tokenVersion) || 0;
};

/**
 * Signs a seller out on every device: bumps tokenVersion (so the empty-list
 * equality fallback rejects every versioned token) and clears sessionVersions.
 */
export const revokeAllSellerSessions = async (sellerId) => {
    await Seller.updateOne(
        { _id: sellerId },
        { $inc: { tokenVersion: 1 }, $set: { sessionVersions: [] } },
    );
};

/** Frees one seller session slot (single-device logout). */
export const removeSellerSession = async (sellerId, version) => {
    if (version === undefined || version === null) return;
    await Seller.updateOne(
        { _id: sellerId },
        { $pull: { sessionVersions: Number(version) } },
    );
};
