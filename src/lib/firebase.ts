import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { initializeFirestore, collection, doc, setDoc, updateDoc, getDoc, getDocs, onSnapshot, query, deleteDoc, where, writeBatch, addDoc, arrayUnion, arrayRemove, getDocFromServer, orderBy, limit, increment, or } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with the named "ai-studio" database instance
// This bridges the final gap between the UI and the Cloud!
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, "ai-studio-eda4df82-53a4-4400-baa1-4e70d58fe3dc");

export const auth = getAuth();
export const googleProvider = new GoogleAuthProvider();

// Connection Test as per integration guidelines
async function testConnection() {
  try {
    // Try to get a non-existent doc from server to force networking
    await getDocFromServer(doc(db, 'system', 'connection_test'));
    console.log("Firestore connection verified.");
  } catch (error) {
    if (error instanceof Error) {
      console.error("Firestore connectivity issue:", error.message);
      if (error.message.includes('the client is offline')) {
        console.error("The app is struggling to reach the Firebase backend. Please check if Firestore is provisioned in the console.");
      }
    }
  }
}
testConnection();

export { signInWithPopup, signOut, onAuthStateChanged, getDocFromServer };
export { collection, doc, setDoc, updateDoc, getDoc, getDocs, onSnapshot, query, deleteDoc, where, writeBatch, addDoc, arrayUnion, arrayRemove, orderBy, limit, increment, or };
export type { User };
