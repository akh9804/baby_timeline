import { loadEnvFile } from 'node:process';

loadEnvFile('/Users/kwanghoonahn/Desktop/baby_timeline/.env');
await import('../dist/server/server.js');
