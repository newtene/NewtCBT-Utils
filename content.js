
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
        const doc = parser.parseFromString(response.html, 'text/html');

        const results = [];
        const resultElements = doc.querySelectorAll('.result__body');

        for (let i = 0; i < Math.min(resultElements.length, 5); i++) {
          const el = resultElements[i];
          const titleEl = el.querySelector('.result__title .result__a');
          const snippetEl = el.querySelector('.result__snippet');
          const urlEl = el.querySelector('.result__url');

          if (titleEl && urlEl) {
            results.push({
              title: titleEl.textContent.trim(),
              url: urlEl.getAttribute('href'),
              snippet: snippetEl ? snippetEl.textContent.trim() : '',
              domain: urlEl.textContent.trim()
            });
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
        source: event.data.source || 'gemini'
      },
      (response) => {
        window.postMessage({
          type: 'NEWTCBT_EMBED_READY',
          success: response?.success || false,
          url: response?.url || ''
        }, window.location.origin);
      }
    );
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
        isRetry: !!event.data.isRetry
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
      msg.type === 'NEWTCBT_ALT_ERROR'
    ) {
      window.postMessage(msg, window.location.origin);
      sendResponse && sendResponse({ relayed: true });
    }
  });
}

