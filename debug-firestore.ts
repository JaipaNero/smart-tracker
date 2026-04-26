
import admin from "firebase-admin";
import fs from "fs";
import path from "path";

const serviceAccount = JSON.parse(fs.readFileSync("./service-account.json", "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

import { getFirestore } from "firebase-admin/firestore";
const db = getFirestore(admin.app(), "ai-studio-eda4df82-53a4-4400-baa1-4e70d58fe3dc");

async function debug() {
  console.log("Checking for users...");
  const usersSnap = await db.collection("users").get();
  console.log(`Found ${usersSnap.docs.length} user(s).`);
  
  for (const userDoc of usersSnap.docs) {
    const expensesSnap = await db.collection(`users/${userDoc.id}/expenses`).get();
    const pantrySnap = await db.collection("pantryItems").where("ownerId", "==", userDoc.id).get();
    console.log(`User ${userDoc.id}: ${expensesSnap.docs.length} expenses, ${pantrySnap.docs.length} pantry items.`);
  }
}

debug().catch(console.error);
