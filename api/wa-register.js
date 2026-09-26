// Retired: the WhatsApp number was registered on the Cloud API on 26 Sep 2026.
// Kept as a stub so older deployments' route resolves to "gone" instead of a working form.
const gone = () => new Response('Not found', { status: 410, headers: { 'cache-control': 'no-store' } });
export const GET = gone;
export const POST = gone;
