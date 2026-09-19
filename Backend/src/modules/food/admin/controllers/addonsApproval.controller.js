import mongoose from 'mongoose';
import * as adminService from '../services/admin.service.js';
import { validateAddonAdminListQuery, validateAddonRejectDto } from '../validators/addonApproval.validator.js';

export async function getSellerAddons(req, res, next) {
    try {
        const query = validateAddonAdminListQuery(req.query || {});
        const data = await adminService.getSellerAddonsAdmin(query);
        res.status(200).json({ success: true, message: 'Store add-ons fetched successfully', data });
    } catch (error) {
        next(error);
    }
}

export async function approveSellerAddon(req, res, next) {
    try {
        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid add-on id' });
        }
        const updated = await adminService.approveSellerAddon(id);
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Add-on not found' });
        }
        res.status(200).json({ success: true, message: 'Add-on approved successfully', data: { addon: updated } });
    } catch (error) {
        next(error);
    }
}

export async function rejectSellerAddon(req, res, next) {
    try {
        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid add-on id' });
        }
        const { reason } = validateAddonRejectDto(req.body || {});
        const updated = await adminService.rejectSellerAddon(id, reason);
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Add-on not found' });
        }
        res.status(200).json({ success: true, message: 'Add-on rejected successfully', data: { addon: updated } });
    } catch (error) {
        next(error);
    }
}

export async function updateSellerAddon(req, res, next) {
    try {
        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid add-on id' });
        }
        const updated = await adminService.updateSellerAddonAdmin(id, req.body || {});
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Add-on not found' });
        }
        res.status(200).json({ success: true, message: 'Add-on updated successfully', data: { addon: updated } });
    } catch (error) {
        next(error);
    }
}
