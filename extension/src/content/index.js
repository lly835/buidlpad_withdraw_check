const TARGETS = [
  {
    selector: 'span.font-medium.font-mono.text-sm',
    mode: 'static',
    getAddress: (element) => element.textContent?.trim() ?? '',
  },
  {
    selector: 'input[name="address"]',
    mode: 'dynamic',
    getAddress: (element) => element.value?.trim() ?? '',
  },
];

const STATUS_CLASS = 'withdraw-check-indicator';
const STYLE_ID = 'withdraw-check-style';
const inputTimers = new WeakMap();

function injectStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${STATUS_CLASS} {
      display: inline-flex;
      align-items: center;
      font-size: 12px;
      font-weight: 500;
      margin-left: 8px;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid transparent;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .${STATUS_CLASS}[data-variant="loading"] {
      color: #1f2937;
      border-color: #d1d5db;
      background: #f3f4f6;
    }
    .${STATUS_CLASS}[data-variant="success"] {
      color: #065f46;
      border-color: #34d399;
      background: #d1fae5;
    }
    .${STATUS_CLASS}[data-variant="error"] {
      color: #991b1b;
      border-color: #f87171;
      background: #fee2e2;
    }
  `;
  document.head.appendChild(style);
}

function createIndicator(element) {
  const existing = element.parentElement?.querySelector(`.${STATUS_CLASS}`);
  if (existing) {
    return existing;
  }

  const indicator = document.createElement('span');
  indicator.className = STATUS_CLASS;
  indicator.dataset.variant = 'loading';
  indicator.textContent = '校验中...';
  element.insertAdjacentElement('afterend', indicator);
  return indicator;
}

function updateIndicator(indicator, variant, message) {
  indicator.dataset.variant = variant;
  indicator.textContent = message;
}

function messageForFailure(response) {
  if (!response) {
    return '地址校验失败';
  }

  if (response.reason === 'bad_status') {
    return '后端请求失败';
  }

  if (response.reason === 'network_error') {
    return '校验时网络错误';
  }

  if (response.reason === 'invalid_json' || response.reason === 'unexpected_payload') {
    return '后端返回无效数据';
  }

  return '地址未授权';
}

function handleResponse(element, response) {
  const indicator = createIndicator(element);

  if (response?.ok === true && response.status === 'found') {
    updateIndicator(indicator, 'success', '地址在名单里');
    return;
  }

  if (response?.status === 'not_found') {
    updateIndicator(indicator, 'error', '地址不在名单里');
    return;
  }

  if (response?.status === 'error') {
    updateIndicator(indicator, 'error', '后端返回错误');
    return;
  }

  updateIndicator(indicator, 'error', messageForFailure(response));
}

function handleFailure(element, message) {
  const indicator = createIndicator(element);
  updateIndicator(indicator, 'error', message);
}

function checkAddress(element, config) {
  const address = config.getAddress(element);

  if (!address) {
    if (config.mode === 'dynamic') {
      const indicator = createIndicator(element);
      updateIndicator(indicator, 'error', '请输入地址');
    }
    return;
  }

  if (element.dataset.withdrawCheckInProgress === 'true') {
    return;
  }

  if (config.mode !== 'dynamic' && element.dataset.withdrawCheckComplete === 'true') {
    return;
  }

  if (config.mode === 'dynamic' && element.dataset.withdrawCheckLastAddress === address) {
    return;
  }

  element.dataset.withdrawCheckInProgress = 'true';
  injectStyles();
  const indicator = createIndicator(element);
  updateIndicator(indicator, 'loading', '校验中...');

  chrome.runtime.sendMessage({ type: 'CHECK_ADDRESS', address }, (response) => {
    element.dataset.withdrawCheckInProgress = 'false';
    element.dataset.withdrawCheckLastAddress = address;

    if (chrome.runtime.lastError) {
      handleFailure(element, '地址校验失败');
      if (config.mode !== 'dynamic') {
        element.dataset.withdrawCheckComplete = 'true';
      }
      return;
    }

    handleResponse(element, response);

    if (config.mode !== 'dynamic') {
      element.dataset.withdrawCheckComplete = 'true';
    }
  });
}

function scheduleInputCheck(element, config) {
  const existing = inputTimers.get(element);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    inputTimers.delete(element);
    checkAddress(element, config);
  }, 400);

  inputTimers.set(element, timer);
}

function bindInput(element, config) {
  if (element.dataset.withdrawCheckBound === 'true') {
    return;
  }

  element.dataset.withdrawCheckBound = 'true';

  element.addEventListener('input', () => scheduleInputCheck(element, config));
  element.addEventListener('blur', () => checkAddress(element, config));

  checkAddress(element, config);
}

function bindStatic(element, config) {
  if (element.dataset.withdrawCheckBound === 'true') {
    return;
  }

  element.dataset.withdrawCheckBound = 'true';
  checkAddress(element, config);
}

function bindElement(element, config) {
  if (config.mode === 'dynamic') {
    bindInput(element, config);
  } else {
    bindStatic(element, config);
  }
}

function scan(root = document) {
  for (const config of TARGETS) {
    const elements = root.querySelectorAll(config.selector);
    if (!elements.length) {
      continue;
    }
    elements.forEach((element) => bindElement(element, config));
  }
}

function observe() {
  scan();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        scan(node);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observe, { once: true });
} else {
  observe();
}
