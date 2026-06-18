/**
 * Security messaging for API key / credential input.
 *
 * Context (security task H3): API keys are transmitted in plaintext JSON from
 * the renderer to the local Express server over the loopback interface. The
 * server requires the plaintext key to route requests to the upstream provider
 * (see `server/index.ts` multi-provider routing), so a fully client-side-only
 * key design is deferred (see PR notes). Until then we surface a clear,
 * honest warning to the user about what happens to the key they enter.
 */

export const API_KEY_TRANSPORT_WARNING =
  'Your key is sent to the local app server over the loopback interface and stored encrypted on this device. ' +
  'It is not sent anywhere else, but anyone with access to this machine (or browser DevTools) could observe it in transit. ' +
  'Use a dedicated, scope-limited key where possible.'
