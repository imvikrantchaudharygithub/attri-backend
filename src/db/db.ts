import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

/** Load .env from project root (works with ts-node, dist/, and PM2 cwd quirks). */
function loadEnv(): void {
    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.join(__dirname, '../../.env'),
        path.join(__dirname, '../../../.env'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            dotenv.config({ path: p });
            return;
        }
    }
    dotenv.config();
}

loadEnv();

const connectDB = async (): Promise<void> => {
    const uri = process.env.MONGODB_URI?.trim();
    if (!uri || (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://'))) {
        console.error(
            'MONGODB_URI is missing or invalid. Set it in .env at the project root, e.g. mongodb+srv://user:pass@cluster/...'
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
