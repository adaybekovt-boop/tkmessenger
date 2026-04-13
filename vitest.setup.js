import { webcrypto } from 'node:crypto';
import 'fake-indexeddb/auto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

