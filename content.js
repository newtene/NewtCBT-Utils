
window.postMessage({ type: 'NEWTCBT_EXTENSION_READY' }, '*');

window.addEventListener('message', function(event) {
  if (event.source !== window) return;

  const allowedOrigins = ['https://newtcbt.vercel.app', 'https://buildtopia.fun'];
  if (!allowedOrigins.includes(event.origin) && !event.origin.endsWith('.buildtopia.fun')) {
    return;
  }

  if (event.data.type && event.data.type === 'PING_NEWTCBT_EXTENSION') {
    window.postMessage({ type: 'NEWTCBT_EXTENSION_READY' }, '*');
  }

  if (event.data.type && event.data.type === 'NEWTCBT_YOUTUBE_SEARCH') {
    chrome.runtime.sendMessage(
      { type: 'FETCH_YOUTUBE', query: event.data.query },
      (response) => {
        window.postMessage({ type: 'NEWTCBT_YOUTUBE_RESULTS', response }, '*');
      }
    );
  }

  if (event.data.type && event.data.type === 'NEWTCBT_WEB_SEARCH') {
    chrome.runtime.sendMessage(
      { type: 'FETCH_WEB', query: event.data.query },
      (response) => {
        if (response.error) {
          window.postMessage({ type: 'NEWTCBT_WEB_RESULTS', response: { error: response.error } }, '*');
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

        window.postMessage({ type: 'NEWTCBT_WEB_RESULTS', response: { results } }, '*');
      }
    );
  }

  if (event.data.type && event.data.type === 'NEWTCBT_AI_SEARCH') {
    chrome.runtime.sendMessage(
      {
        type: 'FETCH_AI_ANSWER',
        query: event.data.query,
        source: event.data.source || 'google',
        grounding: event.data.grounding || false
      },
      (response) => {
        window.postMessage({
          type: 'DDG_AI_RESULT',
          success: response?.success || false,
          text: response?.text || '',
          error: response?.error || 'No response from AI.'
        }, '*');
      }
    );
  }
});
