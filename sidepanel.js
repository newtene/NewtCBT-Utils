/**
 * NewtCBT Side Panel Controller
 * Loads Google AI Studio inside Chrome Side Panel and handles stage transitions.
 */
(function () {
  const frame = document.getElementById('companion-frame');
  const overlay = document.getElementById('loading-overlay');
  let hideOverlayTimeout = null;

  function showOverlay() {
    if (overlay) {
      overlay.classList.remove('hidden');
      if (hideOverlayTimeout) clearTimeout(hideOverlayTimeout);
      hideOverlayTimeout = setTimeout(() => {
        if (overlay) overlay.classList.add('hidden');
      }, 15000);
    }
  }

  function hideOverlay() {
    if (hideOverlayTimeout) {
      clearTimeout(hideOverlayTimeout);
      hideOverlayTimeout = null;
    }
    if (overlay) overlay.classList.add('hidden');
  }

  function loadUrl(url) {
    if (!url || typeof url !== 'string') return;
    if (frame && frame.src !== url) {
      showOverlay();
      frame.src = url;
    }
  }

  if (frame) {
    frame.addEventListener('load', () => {
      hideOverlay();
    });
  }

  // Connect persistent port with background service worker to signal sidepanel presence
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.connect === 'function') {
    try {
      const port = chrome.runtime.connect({ name: 'sidepanel' });
      port.onMessage.addListener((msg) => {
        if (!msg) return;
        if (msg.type === 'UPDATE_SIDEPANEL_URL' && msg.url) {
          loadUrl(msg.url);
        }
        if (msg.type === 'CLOSE_SIDEPANEL') {
          if (frame) frame.src = 'about:blank';
          try { window.close(); } catch (_) {}
        }
      });
    } catch (_) {}
  }

  // Check initial URL stored by background.js
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['newtcbt_sidepanel_url'], (res) => {
      if (res && res.newtcbt_sidepanel_url) {
        loadUrl(res.newtcbt_sidepanel_url);
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.newtcbt_sidepanel_url?.newValue) {
        loadUrl(changes.newtcbt_sidepanel_url.newValue);
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === 'UPDATE_SIDEPANEL_URL' && msg.url) {
        loadUrl(msg.url);
      }
      if (msg.type === 'CLOSE_SIDEPANEL') {
        if (frame) frame.src = 'about:blank';
        try {
          window.close();
        } catch (_) {}
      }
    });
  }
})();
