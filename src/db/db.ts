import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

/**
 * Load .env from every path that exists, later files override earlier (fixes PM2 cwd=/root
 * picking up an empty /root/.env before the project's attri-backend/.env).
 */
function loadEnv(): void {
    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.join(__dirname, '../../.env'),
        path.join(__dirname, '../../../.env'),
    ];
    const seen = new Set<string>();
    for (const p of candidates) {
        const resolved = path.resolve(p);
        if (seen.has(resolved) || !fs.existsSync(resolved)) continue;
        seen.add(resolved);
        dotenv.config({ path: resolved, override: true });
        console.log(`[env] loaded ${resolved}`);
    }
}

/** Normalize URI: BOM, quotes, whitespace. */
function normalizeUri(raw: string | undefined): string {
    if (!raw) return '';
    return raw
        .replace(/^\uFEFF/, '')
        .trim()
        .replace(/^["']|["']$/g, '');
}

/**
 * Resolve Mongo connection string from env. Supports DATABASE_URL (many hosts), MONGODB_URI,
 * or building from MONGODB_USER + MONGODB_PASSWORD + MONGODB_CLUSTER_HOST.
 */
function resolveMongoUri(): string | null {
    const fromDirect =
        normalizeUri(process.env.MONGODB_URI) ||
        normalizeUri(process.env.DATABASE_URL) ||
        normalizeUri(process.env.MONGODB_CONNECTION_STRING);

    if (
        fromDirect &&
        (fromDirect.startsWith('mongodb://') || fromDirect.startsWith('mongodb+srv://'))
    ) {
        return fromDirect;
    }

    const user =
        process.env.MONGODB_USER?.trim() ||
        process.env.MONGODB_ATLAS_USER?.trim();
    const pass = process.env.MONGODB_PASSWORD?.trim();
    const host = process.env.MONGODB_CLUSTER_HOST?.trim() || process.env.MONGODB_HOST?.trim();

    if (user && pass && host && !host.includes('://')) {
        const safeHost = host.replace(/^\/+/, '');
        return `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${safeHost}`;
    }

    return null;
}

loadEnv();

const connectDB = async (): Promise<void> => {
    const uri = resolveMongoUri();
    if (!uri) {
        console.error(
            'No valid MongoDB URI. Set MONGODB_URI (or DATABASE_URL), or set MONGODB_USER + MONGODB_PASSWORD + MONGODB_CLUSTER_HOST in .env'
        );
        process.exit(1);
    }

    try {
        const options: mongoose.ConnectOptions = {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,
        };
        const dbName = process.env.MONGODB_DB_NAME?.trim();
        if (dbName) {
            options.dbName = dbName;
        }

        await mongoose.connect(uri, options);
        console.log('MongoDB connected');
    } catch (error) {
        console.error('Error connecting to MongoDB:', (error as Error).message);
        process.exit(1);
    }
};

export default connectDB;
