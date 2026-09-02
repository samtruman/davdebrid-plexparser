import {createHash} from 'node:crypto';

const DEFAULT_TIMEOUT = 10000;

function eventId(event, files) {
  const ids = files.map(file => String(file.id ?? '')).sort().join(',');
  return createHash('sha256').update(`${event}:${ids}`).digest('hex');
}

export function normalizeWebhooks(value) {
  if(!value) return [];

  let webhooks;
  try {
    webhooks = typeof value === 'string' ? JSON.parse(value) : value;
  }catch(err){
    console.log(`Invalid WEBHOOKS configuration: ${err.message}`);
    return [];
  }

  if(!Array.isArray(webhooks)){
    console.log('Invalid WEBHOOKS configuration: expected a JSON array');
    return [];
  }

  return webhooks
    .filter(webhook => webhook && typeof webhook.url === 'string' && webhook.url.length > 0)
    .map(webhook => ({
      url: webhook.url,
      events: Array.isArray(webhook.events) && webhook.events.length > 0 ? webhook.events : ['new_files']
    }));
}

export async function dispatchWebhook(webhooks, event, payload, timeout = DEFAULT_TIMEOUT) {
  const targets = webhooks.filter(webhook => webhook.events.includes(event) || webhook.events.includes('*'));
  if(targets.length === 0) return true;

  const files = Array.isArray(payload.files) ? payload.files : [];
  const id = eventId(event, files);
  const body = JSON.stringify({
    event,
    event_id: id,
    timestamp: new Date().toISOString(),
    ...payload
  });

  const results = await Promise.allSettled(targets.map(async webhook => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DavDebrid-Webhook/1.0',
          'X-DavDebrid-Event': event,
          'X-DavDebrid-Event-ID': id
        },
        body,
        signal: controller.signal
      });

      if(!response.ok){
        throw new Error(`HTTP ${response.status}`);
      }

      console.log(`Webhook delivered: ${event} -> ${webhook.url}`);
    }finally{
      clearTimeout(timer);
    }
  }));

  const failed = results.filter(result => result.status === 'rejected');
  for(const result of failed){
    console.log(`Webhook delivery failed: ${result.reason?.message || result.reason}`);
  }

  return failed.length === 0;
}
