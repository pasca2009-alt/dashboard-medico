// Cloudflare Worker: proxy protetto tra la Dashboard Medico e l'API di Anthropic.
//
// Variabili da impostare nel Worker (Settings → Variables and Secrets):
//   ANTHROPIC_API_KEY  (Secret)  la chiave API Anthropic
//   APP_TOKEN          (Secret)  una password lunga a tua scelta; la stessa va inserita
//                                nella dashboard da ✏️ Modifica → 🔑 Chiave accesso AI
//   ALLOWED_ORIGINS    (Text, facoltativa) origini ammesse separate da virgola,
//                                es. "https://miosito.pages.dev,null" ("null" = file aperto dal PC)

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 16000;
const MAX_BODY_BYTES = 400_000;
const EFFORTS = ['low', 'medium', 'high'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const originOk = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': originOk && origin ? origin : (allowed[0] || '*'),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const reply = (status, obj) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    const fail = (status, message) => reply(status, { error: { type: 'proxy_error', message } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return fail(405, 'Metodo non consentito');
    if (!originOk) return fail(403, 'Origine non consentita');
    if (!env.ANTHROPIC_API_KEY || !env.APP_TOKEN) return fail(500, 'Worker non configurato');
    if (!safeEqual(request.headers.get('X-App-Token') || '', env.APP_TOKEN)) return fail(401, 'Chiave di accesso mancante o errata');

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail(413, 'Richiesta troppo grande');
    let input;
    try { input = JSON.parse(raw); } catch { return fail(400, 'JSON non valido'); }
    if (!Array.isArray(input.messages) || input.messages.length === 0) return fail(400, 'messages mancante');

    // Costruisce la richiesta da zero: modello, limiti e strumenti li decide il Worker,
    // non il browser, così la chiave non può essere usata per altro.
    const effort = EFFORTS.includes(input.output_config?.effort) ? input.output_config.effort : 'high';
    // Il system prompt (con il profilo clinico) è uguale per tutte le domande: lo marchiamo
    // per la cache, così dalla seconda domanda in poi costa circa il 90% in meno.
    // Il contesto della sezione va in un blocco separato dopo il punto di cache.
    const system = [];
    if (typeof input.system === 'string' && input.system) {
      system.push({ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } });
    }
    if (typeof input.system_context === 'string' && input.system_context) {
      system.push({ type: 'text', text: input.system_context.slice(0, 2000) });
    }
    const body = {
      model: MODEL,
      max_tokens: Math.min(Number(input.max_tokens) || MAX_TOKENS, MAX_TOKENS),
      system: system.length ? system : undefined,
      // Cache automatica anche della conversazione: le domande successive nella stessa chat
      // riutilizzano i messaggi precedenti invece di pagarli di nuovo per intero
      cache_control: { type: 'ephemeral' },
      messages: input.messages,
      output_config: { effort },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
      // Se i filtri di sicurezza bloccano una domanda, l'API riprova su un altro modello
      fallbacks: 'default',
      // Streaming: la risposta arriva a pezzi, così Cloudflare non chiude la
      // connessione dopo 100 secondi di attesa (errore 524)
      stream: true,
    };

    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify(body),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  },
};

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
