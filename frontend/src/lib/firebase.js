import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

let app = null;
let db = null;
let auth = null;

export async function getFirebase() {
  if (app && db && auth) {
    return { app, db, auth };
  }

  try {
    const res = await fetch("/api/config");
    if (!res.ok) {
      throw new Error(`Failed to load Firebase config: ${res.statusText}`);
    }
    const config = await res.json();

    app = getApps().length === 0 ? initializeApp(config) : getApp();
    // CRITICAL: Initialize Firestore with the custom database ID from config
    db = getFirestore(app, config.firestoreDatabaseId || "(default)");
    auth = getAuth(app);

    return { app, db, auth };
  } catch (error) {
    console.error("Error initializing Firebase:", error);
    throw error;
  }
}

export function getDb() {
  if (!db) {
    return getFirestore();
  }
  return db;
}

export function getFirebaseAuth() {
  if (!auth) {
    return getAuth();
  }
  return auth;
}

