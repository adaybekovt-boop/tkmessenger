"use strict";
// server/src/redis.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRedis = void 0;
const redis_1 = require("redis");
const logger_1 = __importDefault(require("./logger"));
const redis = (0, redis_1.createClient)({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});
redis.on('error', (err) => logger_1.default.error('Redis Client Error', err));
redis.on('connect', () => logger_1.default.info('Redis Client Connected'));
const connectRedis = async () => {
    if (!redis.isOpen) {
        await redis.connect();
        logger_1.default.info('Connected to Redis');
    }
    return redis;
};
exports.connectRedis = connectRedis;
exports.default = redis;
