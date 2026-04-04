import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const connectDB = async (): Promise<void> => {
    try {
        await mongoose.connect(String(process?.env?.MONGODB_URI || ''), {
            dbName: process.env.MONGODB_USERNAME ,
            // useNewUrlParser: true,
            // useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,  // 5 seconds
            socketTimeoutMS: 45000,         // 45 seconds
            connectTimeoutMS: 30000,
        });
        console.log('MongoDB connected',process?.env?.MONGODB_URI);
    } catch (error) {
        console.log(process?.env?.MONGODB_USERNAME,'===',process?.env?.MONGODB_URI)
        console.error('Error connecting to MongoDB:', (error as Error).message );
        process.exit(1); // Exit process with failure
    }
};

export default connectDB;
