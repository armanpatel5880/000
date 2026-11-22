import { getApps, initializeApp, getApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { Cashfree } from "cashfree-pg";

// Embedded default fallback config for serverless environments
const DEFAULT_FIREBASE_CONFIG = {
  projectId: "khel-galli-49b03",
  appId: "1:975078214004:web:7eb2b340d559ed4ae34421",
  apiKey: "AIzaSyCaMCsb7uh_O4JIhxp5ElxVRXf9KXYbQb8",
  authDomain: "khel-galli-49b03.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-77efbb54-a595-4a00-a189-15e356a65ecc",
  storageBucket: "khel-galli-49b03.firebasestorage.app",
  messagingSenderId: "975078214004"
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
    "khel-galli-49b03";

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

export default async function handler(req: any, res: any) {
  // CORS support
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let db: any = null;
  let FieldValueObj: any = null;
  try {
    const admin = getFirebaseAdmin();
    db = admin.db;
    FieldValueObj = admin.FieldValue;
  } catch (adminErr: any) {
    console.warn("[Cashfree Webhook] Firebase Admin init notice:", adminErr?.message);
  }

  try {
    const signature = req.headers["x-webhook-signature"] as string;
    const timestamp = req.headers["x-webhook-timestamp"] as string;
    const rawBody = req.body?.__rawBody || JSON.stringify(req.body);

    if (!signature || !timestamp) {
      return res.status(400).json({ success: false, error: "Missing webhook headers" });
    }

    let clientId = process.env.CASHFREE_CLIENT_ID;
    let clientSecret = process.env.CASHFREE_CLIENT_SECRET;
    let isProdEnv = process.env.CASHFREE_ENV === "PRODUCTION";

    if (db) {
      try {
        const configDoc = await db.collection('paymentSettings').doc('cashfree').get();
        if (configDoc.exists && configDoc.data()?.isActive) {
          clientId = configDoc.data()?.apiKey || clientId;
          clientSecret = configDoc.data()?.secretKey || clientSecret;
          isProdEnv = configDoc.data()?.isProduction ?? isProdEnv;
        }
      } catch (e) {}
    }

    if (!clientId || !clientSecret) {
       return res.status(400).json({ success: false, error: "Gateway unconfigured" });
    }
    
    const { data: eventData, type } = req.body || {};
    const orderId = eventData?.order?.order_id;
    
    const isProd = isProdEnv || (clientId && !clientId.includes('TEST'));

    (Cashfree as any).XClientId = clientId;
    (Cashfree as any).XClientSecret = clientSecret;
    (Cashfree as any).XEnvironment = isProd ? (Cashfree as any).Environment.PRODUCTION : (Cashfree as any).Environment.SANDBOX;

    try {
      (Cashfree as any).PGVerifyWebhookSignature(signature, rawBody, timestamp);
    } catch (err) {
      console.warn("[Cashfree Webhook] Signature verification failed");
      return res.status(401).json({ success: false, error: "Invalid signature" });
    }
    
    if (!orderId) return res.status(200).send("OK");

    if (!db || !FieldValueObj) {
      return res.status(503).send("DB Unavailable");
    }

    const payloadUserId = eventData?.customer_details?.customer_id;
    const payloadAmount = Number(eventData?.payment?.payment_amount ?? eventData?.order?.order_amount ?? 0);
    const paymentId = eventData?.payment?.cf_payment_id || orderId;

    const transRef = db.collection('transactions').doc(orderId);

    if (type === "PAYMENT_SUCCESS_WEBHOOK") {
      await db.runTransaction(async (t: any) => {
        const transDoc = await t.get(transRef);
        if (transDoc.exists && transDoc.data()?.status === 'completed') return;

        const storedData = transDoc.exists ? transDoc.data() : null;
        const userId = storedData?.userId || payloadUserId;
        if (!userId || typeof userId !== 'string') {
          throw new Error("Missing userId in Cashfree webhook");
        }

        const creditAmount = (storedData?.amount && Number(storedData.amount) > 0)
          ? Number(storedData.amount)
          : payloadAmount;
        if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
          throw new Error("Invalid deposit amount");
        }

        const userRef = db.collection('users').doc(userId);
        const userDoc = await t.get(userRef);
        if (!userDoc.exists) {
          throw new Error(`User ${userId} not found`);
        }

        t.set(transRef, {
          userId: userId,
          type: 'deposit',
          amount: creditAmount,
          status: 'completed',
          title: 'Deposit via Cashfree',
          paymentId: paymentId,
          gateway: 'cashfree',
          updatedAt: FieldValueObj.serverTimestamp(),
          createdAt: storedData?.createdAt || FieldValueObj.serverTimestamp()
        }, { merge: true });

        t.update(userRef, {
          'wallet.deposit': FieldValueObj.increment(creditAmount),
          'stats.totalDeposited': FieldValueObj.increment(creditAmount)
        });
      });
    } else {
      const nextStatus = type === "PAYMENT_FAILED_WEBHOOK" ? 'failed' : 
                         (type === "PAYMENT_USER_DROPPED_WEBHOOK" ? 'abandoned' : 'pending');

      await db.runTransaction(async (t: any) => {
        const transDoc = await t.get(transRef);
        if (transDoc.exists && transDoc.data()?.status === 'completed') return;

        const existingData = transDoc.exists ? transDoc.data() : null;
        const userId = existingData?.userId || payloadUserId;
        if (!userId) return;

        t.set(transRef, {
          userId: userId,
          type: 'deposit',
          amount: (existingData?.amount && Number(existingData.amount) > 0) ? Number(existingData.amount) : (Number.isFinite(payloadAmount) ? payloadAmount : 0),
          status: nextStatus,
          title: `Deposit ${nextStatus} via Cashfree`,
          paymentId: paymentId,
          gateway: 'cashfree',
          updatedAt: FieldValueObj.serverTimestamp(),
          createdAt: existingData?.createdAt || FieldValueObj.serverTimestamp()
        }, { merge: true });
      });
    }

    res.status(200).send("OK");
  } catch (error: any) {
    console.error("[Cashfree Webhook] Error:", error.message);
    res.status(500).send("Internal Error");
  }
}
