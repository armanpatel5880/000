import { getApps, initializeApp, getApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

const DEFAULT_FIREBASE_CONFIG = {
  projectId: "ap-tournament--app",
  appId: "1:921827987292:web:cb7994b713894a0f2c3b99",
  apiKey: "AIzaSyDFWfogPn4opCPbQVauBwHEemZsG_rVYyg",
  authDomain: "ap-tournament--app.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-77efbb54-a595-4a00-a189-15e356a65ecc",
  storageBucket: "ap-tournament--app.firebasestorage.app",
  messagingSenderId: "921827987292"
};

export function getFirebaseAdmin() {
  let firebaseConfig: any = { ...DEFAULT_FIREBASE_CONFIG };

  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const fileData = JSON.parse(fs.readFileSync(configPath, "utf8"));
      firebaseConfig = { ...firebaseConfig, ...fileData };
    }
  } catch (e) {}

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const projectId = 
    process.env.GOOGLE_CLOUD_PROJECT || 
    process.env.FIREBASE_PROJECT_ID || 
    firebaseConfig.projectId || 
    "ap-tournament--app";

  const databaseId = 
    process.env.FIRESTORE_DATABASE_ID || 
    firebaseConfig.firestoreDatabaseId || 
    "ai-studio-77efbb54-a595-4a00-a189-15e356a65ecc";

  let app: any;
  if (getApps().length === 0) {
    try {
      if (serviceAccountKey) {
        let parsedKey = serviceAccountKey;
        if (typeof serviceAccountKey === "string" && (serviceAccountKey.startsWith("{") || serviceAccountKey.startsWith("["))) {
          parsedKey = JSON.parse(serviceAccountKey);
        }
        app = initializeApp({
          credential: cert(parsedKey),
          projectId: projectId
        });
      } else {
        app = initializeApp({ projectId: projectId });
      }
    } catch (error: any) {
      try {
        app = initializeApp({ projectId: projectId });
      } catch (e2: any) {
        app = getApps()[0] || null;
      }
    }
  } else {
    app = getApp();
  }

  let db: any;
  try {
    db = getFirestore(app, databaseId);
  } catch (err) {
    try {
      db = getFirestore(app);
    } catch (e3) {}
  }
  
  return { app, db, databaseId, FieldValue };
}

export default getFirebaseAdmin;
