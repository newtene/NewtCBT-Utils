/**
 * aistudio_fix.js
 * Injected at document_start in MAIN world on aistudio.google.com
 * Intercepts Zone.js / Angular before boot so AI Studio never knows the tab is backgrounded.
 */
(function () {
  if (window.__newtcbtRafPatched) return;
  window.__newtcbtRafPatched = true;

  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeCAF = window.cancelAnimationFrame.bind(window);
  const nativeHiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  const isRealTabHidden = () => (nativeHiddenDesc ? nativeHiddenDesc.get.call(document) : false);

  // 1. Spoof Page Visibility & Focus APIs
  try {
    Object.defineProperty(Document.prototype, 'hidden', {
      get: () => false,
      configurable: true
    });
    Object.defineProperty(Document.prototype, 'visibilityState', {
      get: () => 'visible',
      configurable: true
    });
    Object.defineProperty(Document.prototype, 'webkitVisibilityState', {
      get: () => 'visible',
      configurable: true
    });
    Document.prototype.hasFocus = () => true;
    window.document.hasFocus = () => true;
  } catch (_) {}

  // 2. Block visibilitychange, blur, freeze, and pagehide listeners
  const blockedEvents = new Set([
    'visibilitychange',
    'webkitvisibilitychange',
    'blur',
    'pagehide',
    'freeze'
  ]);
  const origAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (blockedEvents.has(type) && (this === document || this === window)) {
      return;
    }
    return origAddEventListener.call(this, type, listener, options);
  };

  // 3. Patch IntersectionObserver so Angular virtual scroll / lazy turns always render in background
  if (typeof window.IntersectionObserver === 'function') {
    const NativeIO = window.IntersectionObserver;
    window.IntersectionObserver = function (callback, options) {
      const wrappedCallback = (entries, observer) => {
        if (isRealTabHidden()) {
          const forcedEntries = entries.map((entry) => {
            if (entry.isIntersecting) return entry;
            return new Proxy(entry, {
              get(target, prop) {
                if (prop === 'isIntersecting') return true;
                if (prop === 'intersectionRatio') return 1;
                const val = Reflect.get(target, prop);
                return typeof val === 'function' ? val.bind(target) : val;
              }
            });
          });
          return callback(forcedEntries, observer);
        }
        return callback(entries, observer);
      };
      return new NativeIO(wrappedCallback, options);
    };
    window.IntersectionObserver.prototype = NativeIO.prototype;
  }

  // 4. Non-throttled requestAnimationFrame queue
  const rAFQueue = new Map();
  let rAFIdCounter = 1;

  function flushRAFQueue() {
    if (rAFQueue.size === 0) return;
    const now = performance.now();
    const pending = Array.from(rAFQueue.entries());
    rAFQueue.clear();
    for (const [, cb] of pending) {
      try {
        cb(now);
      } catch (err) {
        setTimeout(() => { throw err; }, 0);
      }
    }
  }

  // Listen for unthrottled ticks from ISOLATED world (alt.js / background.js)
  window.addEventListener('__newtcbt_raf_tick', flushRAFQueue);

  // Also try creating a TrustedTypes-compliant Blob Worker ticker
  try {
    const workerCode = 'setInterval(() => postMessage(0), 45);';
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    let blobUrl = URL.createObjectURL(blob);

    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      try {
        const policy = window.trustedTypes.createPolicy('newtcbtWorkerPolicy', {
          createScriptURL: (url) => url
        });
        blobUrl = policy.createScriptURL(blobUrl);
      } catch (_) {}
    }

    const worker = new Worker(blobUrl);
    worker.onmessage = () => {
      if (isRealTabHidden()) flushRAFQueue();
    };
  } catch (_) {}

  // Override requestAnimationFrame before Zone.js captures it
  window.requestAnimationFrame = function (callback) {
    const id = ++rAFIdCounter;

    if (!isRealTabHidden()) {
      let executed = false;
      const nativeId = nativeRAF((ts) => {
        executed = true;
        rAFQueue.delete(id);
        callback(ts);
      });
      // Fallback if user switches away mid-frame before nativeRAF fires
      rAFQueue.set(id, (ts) => {
        if (!executed) {
          executed = true;
          nativeCAF(nativeId);
          callback(ts);
        }
      });
      return id;
    }

    rAFQueue.set(id, callback);
    return id;
  };

  // 5. Intercept XMLHttpRequest & Fetch for Direct Network Stream Capture
  // Completely bypasses frozen Angular DOM / Zone.js in background tabs.
  function extractModelText(str) {
    if (!str) return '';
    try {
      const data = JSON.parse(str);
      const texts = [];
      function walk(node) {
        if (!node) return;
        if (Array.isArray(node)) {
          if (node.length >= 2 && node[1] === 'model' && Array.isArray(node[0])) {
            for (const p of node[0]) {
              if (Array.isArray(p) && p.length >= 2 && typeof p[1] === 'string' && p[1]) {
                texts.push(p[1]);
              }
            }
          }
          for (const item of node) walk(item);
        } else if (typeof node === 'object') {
          if (typeof node.text === 'string' && node.text) {
            texts.push(node.text);
          }
          for (const k of Object.keys(node)) walk(node[k]);
        }
      }
      walk(data);
      if (texts.length > 0) return texts.join('');
    } catch (_) {}

    // Regex stream parser for raw chunked JSON / SSE / gRPC-Web
    // Gemini candidate parts always emit "text": "..."
    const matches = [];
    const reText = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = reText.exec(str)) !== null) {
      const raw = m[1];
      try {
        matches.push(JSON.parse(`"${raw}"`));
      } catch (_) {
        matches.push(raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
      }
    }

    if (matches.length > 0) {
      return matches.join('');
    }

    // Fallback: look for [null, "..."] (Bard / legacy format)
    const fallbackMatches = [];
    const reNull = /\[\s*null\s*,\s*"((?:[^"\\]|\\.)+)"/g;
    let m2;
    while ((m2 = reNull.exec(str)) !== null) {
      try {
        fallbackMatches.push(JSON.parse(`"${m2[1]}"`));
      } catch (_) {
        fallbackMatches.push(m2[1]);
      }
    }
    return fallbackMatches.join('');
  }

  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this._newtcbt_url = typeof url === 'string' ? url : '';
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      const url = this._newtcbt_url || '';
      if (/generatecontent/i.test(url)) {
        const emitStream = (isDone, status = 200, error = null) => {
          let raw = '';
          try {
            if (!this.responseType || this.responseType === 'text') {
              raw = this.responseText || '';
            } else if (this.responseType === 'arraybuffer' && this.response) {
              raw = new TextDecoder().decode(this.response);
            }
          } catch (_) {
            try {
              if (this.response instanceof ArrayBuffer) {
                raw = new TextDecoder().decode(this.response);
              } else if (typeof this.response === 'string') {
                raw = this.response;
              }
            } catch (_) {}
          }

          let text = '';
          try {
            text = extractModelText(raw);
          } catch (_) {}

          let effectiveError = error;
          if (!effectiveError && (status >= 400 || (raw && /\[\s*,\s*\[\s*\d+\s*,\s*"/.test(raw)) || (raw && /"error"\s*:\s*\{/i.test(raw)))) {
            effectiveError = `AI Studio Error (HTTP ${status})`;
            const grpcMatch = raw.match(/\[\s*,\s*\[\s*\d+\s*,\s*"([^"]+)"/);
            if (grpcMatch && grpcMatch[1]) {
              effectiveError = grpcMatch[1];
            } else {
              try {
                const parsed = JSON.parse(raw);
                if (parsed.error?.message) effectiveError = parsed.error.message;
              } catch (_) {}
            }
          }

          window.dispatchEvent(new CustomEvent('__newtcbt_api_stream', {
            detail: {
              text: text || '',
              done: isDone,
              status,
              error: effectiveError
            }
          }));
        };

        this.addEventListener('progress', () => emitStream(false, this.status));
        this.addEventListener('load', () => emitStream(true, this.status));
        this.addEventListener('readystatechange', () => {
          if (this.readyState === 4) emitStream(true, this.status);
        });
        this.addEventListener('error', () => emitStream(true, this.status || 0, 'Network error'));
        this.addEventListener('abort', () => emitStream(true, this.status || 0, 'Aborted'));
      }
      return origSend.apply(this, arguments);
    };
  } catch (_) {}

  // Also hook fetch in case AI Studio switches to fetch + ReadableStream
  try {
    const origFetch = window.fetch;
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      const response = await origFetch.apply(this, arguments);
      if (url && /generatecontent/i.test(url) && response && response.clone) {
        try {
          const clone = response.clone();
          const reader = clone.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';
          (async () => {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                const text = extractModelText(fullText);
                let effectiveError = null;
                if (response.status >= 400 || (fullText && /\[\s*,\s*\[\s*\d+\s*,\s*"/.test(fullText))) {
                  const grpcMatch = fullText.match(/\[\s*,\s*\[\s*\d+\s*,\s*"([^"]+)"/);
                  effectiveError = grpcMatch ? grpcMatch[1] : `AI Studio Error (HTTP ${response.status})`;
                }
                window.dispatchEvent(new CustomEvent('__newtcbt_api_stream', {
                  detail: { text: text || '', done: true, status: response.status, error: effectiveError }
                }));
                break;
              }
              fullText += decoder.decode(value, { stream: true });
              const text = extractModelText(fullText);
              if (text) {
                window.dispatchEvent(new CustomEvent('__newtcbt_api_stream', {
                  detail: { text, done: false, status: response.status }
                }));
              }
            }
          })().catch(() => {});
        } catch (_) {}
      }
      return response;
    };
  } catch (_) {}

  console.log('[NewtCBT:Fix] Background tab rAF + Visibility + Direct XHR/Fetch stream interceptor active.');
})();
