
window.postMessage({ type: 'NEWTCBT_EXTENSION_READY' }, window.location.origin);

function safeSendMessage(message, callback) {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(message, (response) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          console.warn('[NewtCBT-Utils] Runtime message warning:', lastErr.message);
          callback && callback({ error: lastErr.message });
          return;
        }
        callback && callback(response);
      });
      return true;
    }
  } catch (e) {
    console.warn('[NewtCBT-Utils] Extension context error:', e);
  }
  callback && callback({ error: 'Extension context invalidated. Please reload the page.' });
  return false;
}

window.addEventListener('message', function(event) {
  if (event.source !== window) return;

  const origin = event.origin || '';
  const isAllowedOrigin = 
    origin === 'https://newtcbt.in' ||
    origin === 'http://newtcbt.in' ||
    origin.endsWith('.newtcbt.in') ||
    origin.includes('localhost');

  if (!isAllowedOrigin) {
    return;
  }

  if (event.data.type && event.data.type === 'PING_NEWTCBT_EXTENSION') {
    window.postMessage({ type: 'NEWTCBT_EXTENSION_READY' }, window.location.origin);
  }

  if (event.data.type && event.data.type === 'NEWTCBT_YOUTUBE_SEARCH') {
    safeSendMessage(
      { type: 'FETCH_YOUTUBE', query: event.data.query },
      (response) => {
        window.postMessage({ type: 'NEWTCBT_YOUTUBE_RESULTS', response: response || {} }, window.location.origin);
      }
    );
  }

  if (event.data.type && event.data.type === 'NEWTCBT_WEB_SEARCH') {
    safeSendMessage(
      { type: 'FETCH_WEB', query: event.data.query },
      (response) => {
        if (!response || response.error) {
          window.postMessage({ type: 'NEWTCBT_WEB_RESULTS', response: { error: response?.error || 'Failed to fetch web results' } }, window.location.origin);
          return;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(response.html || '', 'text/html');
        const results = [];

        // Helper to unwrap DDG tracking redirects to destination URLs
        const cleanUrl = (rawUrl) => {
          if (!rawUrl) return '';
          try {
            if (rawUrl.includes('uddg=')) {
              const u = new URL(rawUrl, 'https://duckduckgo.com');
              const uddg = u.searchParams.get('uddg');
              if (uddg) return decodeURIComponent(uddg);
            }
            if (rawUrl.startsWith('//')) return 'https:' + rawUrl;
            return rawUrl;
          } catch (_) {
            return rawUrl;
          }
        };

        const getDomain = (urlStr) => {
          try {
            return new URL(urlStr).hostname.replace(/^www\./, '');
          } catch (_) {
            return '';
          }
        };

        // 1. Primary: Standard DuckDuckGo HTML (.result__body) as in v3.0.2
        const resultElements = doc.querySelectorAll('.result__body');
        if (resultElements && resultElements.length > 0) {
          for (let i = 0; i < Math.min(resultElements.length, 6); i++) {
            const el = resultElements[i];
            const titleEl = el.querySelector('.result__title .result__a') || el.querySelector('.result__a');
            const snippetEl = el.querySelector('.result__snippet');
            const urlEl = el.querySelector('.result__url');

            const rawHref = titleEl?.getAttribute('href') || urlEl?.getAttribute('href');
            const title = titleEl ? titleEl.textContent.trim() : '';
            const url = cleanUrl(rawHref);

            if (title && url) {
              results.push({
                title,
                url,
                snippet: snippetEl ? snippetEl.textContent.trim() : '',
                domain: getDomain(url) || (urlEl ? urlEl.textContent.trim() : '')
              });
            }
          }
        }

        // 2. Fallback: Parse DuckDuckGo Lite layout (<a class='result-link'>)
        if (results.length === 0) {
          const liteLinks = doc.querySelectorAll('a.result-link');
          if (liteLinks && liteLinks.length > 0) {
            for (let i = 0; i < Math.min(liteLinks.length, 6); i++) {
              const linkEl = liteLinks[i];
              const rawHref = linkEl.getAttribute('href');
              const title = linkEl.textContent.trim();
              const url = cleanUrl(rawHref);

              let snippet = '';
              const row = linkEl.closest('tr');
              if (row && row.nextElementSibling) {
                const snipEl = row.nextElementSibling.querySelector('.result-snippet');
                if (snipEl) snippet = snipEl.textContent.trim();
              }

              if (title && url && !url.includes('duckduckgo.com/y.js')) {
                results.push({
                  title,
                  url,
                  snippet,
                  domain: getDomain(url)
                });
              }
            }
          }
        }

        window.postMessage({ type: 'NEWTCBT_WEB_RESULTS', response: { results } }, window.location.origin);
      }
    );
  }

  if (event.data.type && event.data.type === 'NEWTCBT_AI_SEARCH') {
    safeSendMessage(
      {
        type: 'FETCH_AI_ANSWER',
        query: event.data.query,
        image: event.data.image || null,
        source: event.data.source || 'google',
        grounding: event.data.grounding || false
      },
      (response) => {
        window.postMessage({
          type: 'DDG_AI_RESULT',
          success: response?.success || false,
          text: response?.text || '',
          error: response?.error || 'No response from AI.'
        }, window.location.origin);
      }
    );
  }

  if (event.data.type && event.data.type === 'NEWTCBT_PREPARE_EMBED') {
    safeSendMessage(
      {
        type: 'PREPARE_EMBED',
        query: event.data.query,
        image: event.data.image || null,
        source: event.data.source || 'gemini',
        isPinned: !!event.data.isPinned
      },
      (response) => {
        window.postMessage({
          type: 'NEWTCBT_EMBED_READY',
          success: response?.success || false,
          url: response?.url || '',
          isPinned: !!response?.isPinned,
          tabId: response?.tabId
        }, window.location.origin);
      }
    );
  }

  if (event.data.type && event.data.type === 'NEWTCBT_LAUNCH_PINNED_STAGE') {
    safeSendMessage(
      {
        type: 'LAUNCH_PINNED_STAGE',
        model: event.data.model || 'gemini-3.8-flash'
      },
      (response) => {
        window.postMessage({
          type: 'NEWTCBT_PINNED_STAGE_LAUNCHED',
          success: response?.success || false,
          tabId: response?.tabId,
          reused: !!response?.reused
        }, window.location.origin);
      }
    );
  }

  if (event.data.type && event.data.type === 'NEWTCBT_FOCUS_PINNED_TAB') {
    safeSendMessage({ type: 'FOCUS_COMPANION_TAB' });
  }

  if (event.data.type && event.data.type === 'NEWTCBT_CLOSE_COMPANION_TAB') {
    safeSendMessage({ type: 'CLOSE_COMPANION_TAB' });
  }

  if (event.data.type && event.data.type === 'NEWTCBT_EXTRACT_SOLN') {
    safeSendMessage(
      { type: 'TRIGGER_EXTRACT_SOLN' },
      (response) => {
        window.postMessage({
          type: 'NEWTCBT_EXTRACTED_SOLN_RESULT',
          success: response?.success || false,
          text: response?.text || '',
          error: response?.error || 'Could not extract solution from assistant.'
        }, window.location.origin);
      }
    );
  }

  if (event.data.type && (event.data.type === 'NEWTCBT_START_ALT_STAGE' || event.data.type === 'NEWTCBT_START_GEM_STAGE')) {
    safeSendMessage(
      {
        type: 'START_ALT_STAGE',
        stage: event.data.stage,
        file: event.data.file || null,
        prompt: event.data.prompt || '',
        jobId: event.data.jobId || ('job_' + Date.now()),
        isRetry: !!event.data.isRetry,
        model: event.data.model || 'gemini-3.8-flash'
      },
      (response) => {
        if (response && response.error) {
          window.postMessage({
            type: 'NEWTCBT_ALT_COMPLETE',
            stage: event.data.stage,
            result: '',
            jobId: event.data.jobId,
            success: false,
            error: response.error
          }, window.location.origin);
          window.postMessage({
            type: 'NEWTCBT_GEM_COMPLETE',
            stage: event.data.stage,
            result: '',
            jobId: event.data.jobId,
            success: false,
            error: response.error
          }, window.location.origin);
        }
      }
    );
  }
});

// Forward background runtime messages to client window
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;

    if (
      msg.type === 'NEWTCBT_GEM_PROGRESS' ||
      msg.type === 'NEWTCBT_ALT_PROGRESS' ||
      msg.type === 'NEWTCBT_GEM_COMPLETE' ||
      msg.type === 'NEWTCBT_ALT_COMPLETE' ||
      msg.type === 'NEWTCBT_GEM_ERROR' ||
      msg.type === 'NEWTCBT_ALT_ERROR' ||
      msg.type === 'NEWTCBT_AI_STUDIO_MODEL_UPDATED' ||
      msg.type === 'NEWTCBT_EXTRACTED_SOLN_RESULT'
    ) {
      window.postMessage(msg, window.location.origin);
      sendResponse && sendResponse({ relayed: true });
    }
  });
}

