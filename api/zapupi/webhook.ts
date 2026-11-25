import axios from "axios";
import getFirebaseAdmin from "./lib/firebase-admin";

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

  console.log("[ZapUPI Webhook] Route hit");
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!req.body || typeof req.body !== 'object') {
    console.error("[ZapUPI Webhook] Invalid request body");
    return res.status(400).json({ success: false, error: "Invalid body" });
  }

  let db: any = null;
  let FieldValueObj: any = null;
  try {
    const admin = getFirebaseAdmin();
    db = admin.db;
    FieldValueObj = admin.FieldValue;
  } catch (adminErr: any) {
    console.warn("[ZapUPI Webhook] Firebase Admin init notice:", adminErr?.message);
  }

  try {
    const { 
      status, 
      order_id, 
      amount, 
      pay_amount, 
      txn_id, 
      utr 
    } = req.body;

    const orderIdFinal = order_id || req.body.orderId || req.body.client_order_id;
    const amountFinal = pay_amount || amount || req.body.amount || req.body.order_amount;
    const statusFinal = status || req.body.orderStatus || req.body.order_status;
    const transactionId = txn_id || req.body.tx_id || req.body.txn_id || orderIdFinal;
    const utrFinal = utr || req.body.bank_ref_num || '';

    if (!orderIdFinal) {
      console.warn("[ZapUPI Webhook] Missing order_id in payload");
      return res.status(400).json({ success: false, error: "Missing order_id" });
    }

    if (!db || !FieldValueObj) {
      console.warn("[ZapUPI Webhook] Firestore DB unavailable, returning 200");
      return res.status(200).send("OK - DB Unavailable");
    }

    const transRef = db.collection('transactions').doc(orderIdFinal);
    const transDoc = await transRef.get();
    
    if (!transDoc.exists) {
      console.warn(`[ZapUPI Webhook] Order not found in DB: ${orderIdFinal}. Returning 200.`);
      return res.status(200).send("OK - Order Not Found");
    }

    const transData = transDoc.data() || {};
    if (transData.status === 'completed') {
      console.log(`[ZapUPI Webhook] Order ${orderIdFinal} already completed`);
      return res.status(200).send("OK - Already Processed");
    }

    const userId = transData.userId;
    const expectedAmount = transData.amount;

    let isVerified = false;
    let apiVerifiedAmount = 0;
    let apiKey = process.env.ZAPUPI_API_KEY;
    try {
      const configDoc = await db.collection('paymentSettings').doc('zapupi').get();
      if (configDoc.exists && configDoc.data()?.isActive) {
        apiKey = configDoc.data()?.apiKey || apiKey;
      }
    } catch (e) {}

    if (!apiKey) {
      return res.status(500).json({ success: false, error: "Gateway API key unconfigured" });
    }

    const rawStatus = String(statusFinal || '').toLowerCase();
    const isBodySuccess = ['success', 'completed', 'paid', 'transaction successful'].includes(rawStatus);

    if (isBodySuccess) {
      const apiBase = (process.env.ZAPUPI_BASE_URL || "https://pay.zapupi.com").replace(/\/$/, "");
      const hosts = [apiBase, "https://pay.zapupi.com", "https://api.zapupi.com"].filter(Boolean);
      const paths = ["/api/get_order", "/api/get-order", "/api/v2/get_order", "/api/v1/get_order"];
      
      outer: for (const host of hosts) {
        for (const path of paths) {
          const verifyUrl = `${host}${path}`;
          try {
            const verifyRes = await axios.post(verifyUrl, {
              zap_key: apiKey,
              api_key: apiKey,
              order_id: orderIdFinal
            }, { 
              headers: { 'Content-Type': 'application/json' },
              timeout: 8000 
            });

            const vData = verifyRes.data || {};
            const vStatus = String(vData.status || vData.order_status || vData.orderStatus || '').toLowerCase();
            const vMsg = String(vData.msg || vData.message || vData.status_msg || '').toLowerCase();

            if (['success', 'completed', 'paid', 'transaction successful'].includes(vStatus) || vMsg.includes('success')) {
              isVerified = true;
              apiVerifiedAmount = Number(vData.amount || vData.order_amount || vData.pay_amount || 0);
              break outer;
            }
          } catch (err) {}
        }
      }
    }

    if (isVerified) {
      const verifiedAmount = (expectedAmount && Number(expectedAmount) > 0)
        ? Number(expectedAmount)
        : Number(apiVerifiedAmount || amountFinal || 0);

      if (!userId || !Number.isFinite(verifiedAmount) || verifiedAmount <= 0) {
        return res.status(400).json({ success: false, error: "Invalid order metadata" });
      }

      await db.runTransaction(async (t: any) => {
        const freshTransDoc = await t.get(transRef);
        if (freshTransDoc.exists && freshTransDoc.data()?.status === 'completed') return;

        const userRef = db.collection('users').doc(userId);
        const userDoc = await t.get(userRef);
        if (!userDoc.exists) throw new Error("User not found");

        t.update(transRef, {
          status: 'completed',
          paymentId: transactionId,
          utr: utrFinal,
          updatedAt: FieldValueObj.serverTimestamp()
        });

        t.update(userRef, {
          'wallet.deposit': FieldValueObj.increment(verifiedAmount),
          'stats.totalDeposited': FieldValueObj.increment(verifiedAmount)
        });
      });
    } else if (['failed', 'failure', 'canceled', 'cancelled'].includes(rawStatus)) {
      await db.runTransaction(async (t: any) => {
        const freshTransDoc = await t.get(transRef);
        if (freshTransDoc.exists && freshTransDoc.data()?.status !== 'completed') {
          t.update(transRef, { status: 'failed', updatedAt: FieldValueObj.serverTimestamp() });
        }
      });
    }

    return res.status(200).send("OK");
  } catch (error: any) {
    console.error("[ZapUPI Webhook] Fatal Error:", error.message);
    return res.status(500).send("Internal Server Error");
  }
}
