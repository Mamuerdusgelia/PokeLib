/** Reject accidental privileged keys before exposing any browser configuration. */
export function publicSupabaseConfig(url: string, key: string) {
  url = url.trim();
  key = key.trim();
  if (!url && !key) return { url: '', key: '' };
  if (!url || !key)
    throw Error('Configure both Supabase URL and public publishable key.');
  let endpoint: URL;
  try {
    endpoint = new URL(url);
  } catch {
    throw Error('Invalid Supabase URL.');
  }
  if (
    endpoint.protocol !== 'https:' &&
    !(
      endpoint.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(endpoint.hostname)
    )
  )
    throw Error('Supabase requires an HTTPS URL.');
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key);
  if (!publicKey && key.split('.').length === 3) {
    try {
      const segment = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(segment));
      publicKey = payload.role === 'anon';
    } catch {
      publicKey = false;
    }
  }
  if (!publicKey)
    throw Error(
      'Use a Supabase publishable key or legacy anon key. Secret and service-role keys are rejected.',
    );
  return { url: endpoint.origin, key };
}
