import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import "dotenv/config";

// Database ID constant from the unified blueprint
const FIRESTORE_DB_ID = "ai-studio-eda4df82-53a4-4400-baa1-4e70d58fe3dc";

/**
 * Shared Firebase Admin Initialization
 * Logic handles both Cloud Functions environment and Local Script execution.
 */
if (!admin.apps.length) {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json";
    
    // Attempt to locate service account for local context
    let absolutePath = path.resolve(serviceAccountPath);
    if (!fs.existsSync(absolutePath)) {
        // Try one level up if called from a subdirectory like scripts/ or functions/
        absolutePath = path.resolve(path.join("..", serviceAccountPath));
    }

    if (fs.existsSync(absolutePath)) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(fs.readFileSync(absolutePath, "utf8")))
        });
        console.log(`✅ Firebase Admin initialized from: ${absolutePath}`);
    } else {
        // Fallback for Cloud Functions managed environment (secrets/env vars)
        admin.initializeApp();
        console.log("✅ Firebase Admin initialized via default credentials.");
    }
}

// Export the unified database instance pointing to the named ai-studio DB
export const db = getFirestore(FIRESTORE_DB_ID);
console.log(`✅ Successfully connected to Named Database: [${FIRESTORE_DB_ID}]`);

/**
 * Standardized User Identification (Lazy Resolver)
 * Dynamically retrieves the UID at runtime to ensure compatibility with
 * Firebase Secrets injection during Cloud Function execution blocks.
 */
export function getAppUserUid() {
    const uid = process.env.APP_USER_UID || process.env.FIREBASE_USER_ID;
    
    if (!uid) {
        console.error("❌ RUNTIME ERROR: APP_USER_UID is missing from the current execution context.");
        console.error("If running locally, check your .env. If in Cloud, check your Secrets config.");
        throw new Error("Missing mandatory APP_USER_UID");
    }
    
    return uid;
}
