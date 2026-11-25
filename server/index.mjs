/** Phase 3 backend: a thin local proxy between the dashboard and Amazon SP-API.
 *  Zero dependencies — Node 20 built-in fetch + http. Run: npm run server
 *  (reads LWA_* from .env via node --env-file). SP-API needs no AWS SigV4 since
 *  Nov 2023; the LWA access token in x-amz-access-token is the whole auth story. */
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 3001);
// India rides the EU region; set SPAPI_SANDBOX=1 (with sandbox LWA creds) for canned-data testing
const SPAPI = process.env.SPAPI_SANDBOX
  ? 'https://sandbox.sellingpartnerapi-eu.amazon.com'
  : 'https://sellingpartnerapi-eu.amazon.com';
const MARKETPLACE_ID = 'A21TJRUUN4KGV'; // amazon.in

const CLIENT_ID = process.env.LWA_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.LWA_CLIENT_SECRET ?? '';
const REFRESH_TOKEN = process.env.LWA_REFRESH_TOKEN ?? '';

/** LWA access token, cached until shortly before expiry */
let tokenCache = { token: '', expiresAt: 0 };

async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`LWA ${res.status}: ${body.error_description ?? body.error ?? 'token exchange failed'}`);
  tokenCache = { token: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return tokenCache.token;
}

async function spapi(path, params) {
  const url = new URL(SPAPI + path);
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'x-amz-access-token': await accessToken() } });
  const body = await res.json();
  if (!res.ok) {
    const msg = body.errors?.map((e) => e.message).join('; ') ?? res.statusText;
    throw new Error(`SP-API ${res.status}: ${msg}`);
  }
  return body;
}

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/api/status') {
      if (!CLIENT_ID || !CLIENT_SECRET) return json(res, 200, { state: 'setup', detail: 'LWA_CLIENT_ID / LWA_CLIENT_SECRET missing in .env' });
      if (!REFRESH_TOKEN) return json(res, 200, { state: 'authorize', detail: 'LWA_REFRESH_TOKEN missing — self-authorize the app in Developer Central' });
      // probe the exact permission the inbox needs: a minimal Orders call.
      // always 200 — an SP-API failure is still a valid status answer, not a proxy error
      try {
        await spapi('/orders/v0/orders', {
          MarketplaceIds: MARKETPLACE_ID,
          CreatedAfter: new Date(Date.now() - 3600 * 1000).toISOString(),
        });
        return json(res, 200, { state: 'connected', marketplaces: [MARKETPLACE_ID] });
      } catch (err) {
        return json(res, 200, { state: 'error', error: err.message });
      }
    }

    if (url.pathname === '/api/orders') {
      const createdAfter = url.searchParams.get('createdAfter')
        ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const data = await spapi('/orders/v0/orders', {
        MarketplaceIds: MARKETPLACE_ID,
        CreatedAfter: createdAfter,
        OrderStatuses: url.searchParams.get('statuses') ?? 'Unshipped,PartiallyShipped',
      });
      const orders = (data.payload?.Orders ?? []).map((o) => ({
        orderId: o.AmazonOrderId,
        purchaseDate: o.PurchaseDate,
        status: o.OrderStatus,
        itemsShipped: o.NumberOfItemsShipped,
        itemsUnshipped: o.NumberOfItemsUnshipped,
        latestShipDate: o.LatestShipDate,
        isPrime: o.IsPrime,
      }));
      return json(res, 200, { orders });
    }

    const itemsMatch = url.pathname.match(/^\/api\/orders\/([A-Z0-9-]+)\/items$/i);
    if (itemsMatch) {
      const data = await spapi(`/orders/v0/orders/${itemsMatch[1]}/orderItems`);
      const items = (data.payload?.OrderItems ?? []).map((it) => ({
        itemId: it.OrderItemId,
        asin: it.ASIN,
        title: it.Title,
        qty: it.QuantityOrdered,
        // the same customization zip the seller downloads by hand from Customization Info
        customizedUrl: it.BuyerInfo?.BuyerCustomizedInfo?.CustomizedURL,
      }));
      return json(res, 200, { items });
    }

    if (url.pathname === '/api/customization') {
      const target = url.searchParams.get('url') ?? '';
      const host = (() => { try { return new URL(target).hostname; } catch { return ''; } })();
      // only fetch Amazon-hosted zips — this endpoint must not be an open proxy
      if (!/(\.amazon\.(com|in)|\.amazonaws\.com)$/.test(host)) return json(res, 400, { error: 'refusing non-Amazon URL' });
      const zip = await fetch(target);
      if (!zip.ok) return json(res, 502, { error: `download failed: ${zip.status}` });
      res.writeHead(200, { 'content-type': 'application/zip' });
      res.end(Buffer.from(await zip.arrayBuffer()));
      return;
    }

    json(res, 404, { error: 'not found' });
  } catch (err) {
    json(res, 502, { state: 'error', error: err.message });
  }
});

server.listen(PORT, () => console.log(`SP-API proxy on http://localhost:${PORT} (marketplace ${MARKETPLACE_ID})`));
