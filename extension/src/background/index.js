let configPromise;

async function loadConfig() {
  if (!configPromise) {
    configPromise = fetch(chrome.runtime.getURL('config.json')).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load config.json: ${response.status}`);
      }
      return response.json();
    });
  }
  return configPromise;
}

async function checkAddress(address) {
  const config = await loadConfig();
  if (!config.apiBaseUrl) {
    throw new Error('Missing apiBaseUrl in config.json');
  }

  let requestUrl;
  try {
    requestUrl = new URL(config.apiBaseUrl);
  } catch (error) {
    throw new Error(`Invalid apiBaseUrl: ${error.message}`);
  }

  requestUrl.searchParams.set('address', address);

  let response;
  try {
    response = await fetch(requestUrl.toString(), { method: 'GET' });
  } catch (error) {
    return {
      ok: false,
      reason: 'network_error',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: 'bad_status',
      status: response.status,
    };
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid_json',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (!['found', 'not_found', 'error'].includes(data.status)) {
    return {
      ok: false,
      reason: 'unexpected_payload',
      payload: data,
    };
  }

  return {
    ok: data.status === 'found',
    status: data.status,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'CHECK_ADDRESS' && typeof message.address === 'string') {
    checkAddress(message.address)
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error('Address check failed', error);
        sendResponse({ ok: false, reason: 'unexpected_error', message: error.message });
      });
    return true; // Keep message channel open for async response
  }
  return undefined;
});
