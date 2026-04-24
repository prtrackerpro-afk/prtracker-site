/**
 * Standalone validator for Meta CAPI + GA4 Measurement Protocol credentials.
 *
 * Reads .env directly (no dotenv dependency). Fires:
 *   - one Purchase to Meta CAPI with `test_event_code` (shows up in Events
 *     Manager → Test Events, does NOT count as a real conversion)
 *   - one purchase to GA4's /debug/mp/collect (validates schema, does NOT
 *     record)
 *
 * Run: `node scripts/test-tracking.mjs` from Site/.
 */

import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf-8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
    .filter(([, v]) => v),
);

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function testCapi() {
  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = env.META_PIXEL_ID;
  if (!token || !pixelId) {
    console.error("❌ META_CAPI_ACCESS_TOKEN or META_PIXEL_ID missing in .env");
    return false;
  }

  // Meta exige um `test_event_code` específico gerado na tela Events Manager
  // → Eventos de teste. Passe como CLI arg: `node scripts/test-tracking.mjs TEST46563`.
  // Sem arg, gera um random (mas o evento não aparecerá no painel).
  const testEventCode = process.argv[2] || "TEST_" + Date.now().toString(36).toUpperCase();
  const eventId = `test-purchase-${Date.now()}`;

  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: "https://prtracker.com.br/obrigado",
        action_source: "website",
        user_data: {
          em: [sha256("contato@prtracker.com.br")],
          ph: [sha256("5551982061914")],
          country: [sha256("br")],
          external_id: [sha256("00000000000")],
        },
        custom_data: {
          currency: "BRL",
          value: 1.0,
          content_ids: ["deadlift-set"],
          content_type: "product",
          num_items: 1,
          order_id: "test-order",
        },
      },
    ],
    test_event_code: testEventCode,
  };

  const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(
    token,
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("❌ Meta CAPI:", res.status, data);
    return false;
  }

  console.log("✅ Meta CAPI test event sent");
  console.log("   events_received:", data.events_received);
  console.log("   fbtrace_id:", data.fbtrace_id);
  console.log("   test_event_code:", testEventCode);
  console.log("   event_id:", eventId);
  console.log(
    "   → Events Manager → Testar eventos → procure pelo código acima\n",
  );
  return true;
}

async function testGa4() {
  const secret = env.GA4_API_SECRET;
  const measurementId = env.GA4_MEASUREMENT_ID;
  if (!secret || !measurementId) {
    console.error("❌ GA4_API_SECRET or GA4_MEASUREMENT_ID missing in .env");
    return false;
  }

  const transactionId = `test-${Date.now()}`;
  const body = {
    client_id: `${Date.now()}.${Math.floor(Date.now() / 1000)}`,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: transactionId,
          currency: "BRL",
          value: 1.0,
          items: [
            {
              item_id: "deadlift-set",
              item_name: "Deadlift Set",
              quantity: 1,
              price: 1.0,
            },
          ],
        },
      },
    ],
  };

  const debugUrl = `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(
    measurementId,
  )}&api_secret=${encodeURIComponent(secret)}`;

  const res = await fetch(debugUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("❌ GA4 MP debug:", res.status, data);
    return false;
  }

  const messages = data.validationMessages ?? [];
  if (messages.length > 0) {
    console.error("❌ GA4 MP validation errors:", messages);
    return false;
  }

  console.log("✅ GA4 MP schema valid (debug endpoint OK)");
  console.log("   transaction_id:", transactionId);
  console.log("   measurement_id:", measurementId);
  console.log(
    "   → Debug endpoint NÃO grava — quando o webhook MP rodar com evento real, vai pra GA4 Realtime\n",
  );
  return true;
}

const ok1 = await testCapi();
const ok2 = await testGa4();
process.exit(ok1 && ok2 ? 0 : 1);
