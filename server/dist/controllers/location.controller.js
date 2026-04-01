"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateVisibility = exports.findNearby = exports.updateMyLocation = void 0;
const location_service_1 = require("../services/location.service");
const updateMyLocation = async (req, res) => {
    const userId = req.user.userId;
    const { lat, lng } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(400).json({ error: 'Lat/lng must be numbers' });
    }
    await (0, location_service_1.updateLocation)(userId, lat, lng);
    res.status(200).json({ status: 'ok' });
};
exports.updateMyLocation = updateMyLocation;
const findNearby = async (req, res) => {
    const { lat, lng, radius = 5 } = req.query;
    const users = await (0, location_service_1.getNearbyUsers)(Number(lat), Number(lng), Number(radius));
    res.json(users);
};
exports.findNearby = findNearby;
const updateVisibility = async (req, res) => {
    const userId = req.user.userId;
    const { isVisible } = req.body;
    await (0, location_service_1.setVisibility)(userId, isVisible);
    res.status(200).json({ status: 'ok' });
};
exports.updateVisibility = updateVisibility;
