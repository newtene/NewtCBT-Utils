/**
 * NewtCBT Side Panel Controller
 * Loads Companion Assistant (Google AI Studio, Gemini, Google AI) inside Side Panel
 * and handles companion actions ("Retry step" and "Add solution to NewtCBT").
 */
(function () {
  const frame = document.getElementById('companion-frame');
  const overlay = document.getElementById('loading-overlay');
  const idleState = document.getElementById('idle-state');
  const btnLaunchAiStudio = document.getElementById('btn-launch-aistudio');
  const btnRetry = document.getElementById('btn-retry');
  const btnAddSolution = document.getElementById('btn-add-solution');
  const txtAddSoln = document.getElementById('txt-add-soln');
  const btnClose = document.getElementById('btn-close');

  let currentUrl = '';
  let hideOverlayTimeout = null;
  let isExtracting = false;
  let sessionMode = 'generate'; // 'solution' | 'hint' | 'generate'

  function updateTopbarVisibility(mode) {
    if (mode) sessionMode = mode;
    const isAiStudio = (currentUrl && currentUrl.includes('aistudio.google.com')) || 
                       (frame && frame.src && frame.src.includes('aistudio.google.com'));
    const topbar = document.getElementById('topbar');
    if (!topbar) return;

    if (sessionMode === 'generate' || isAiStudio) {
      topbar.classList.add('hidden');
      return;
    }

    if (sessionMode === 'hint') {
      topbar.classList.remove('hidden');
      if (btnRetry) btnRetry.style.display = '';
      if (btnAddSolution) btnAddSolution.style.display = 'none';
    } else if (sessionMode === 'solution') {
      topbar.classList.remove('hidden');
      if (btnRetry) btnRetry.style.display = '';
      if (btnAddSolution) btnAddSolution.style.display = '';
    } else {
      topbar.classList.add('hidden');
    }
  }

  function showIdleState() {
    hideOverlay();
    updateTopbarVisibility('generate');
    if (idleState) idleState.classList.remove('hidden');
    if (frame && frame.src !== 'about:blank') {
      frame.src = 'about:blank';
    }
  }

  function showOverlay() {
    if (idleState) idleState.classList.add('hidden');
    if (overlay) {
      overlay.classList.remove('hidden');
      if (hideOverlayTimeout) clearTimeout(hideOverlayTimeout);
      hideOverlayTimeout = setTimeout(() => {
        if (overlay) overlay.classList.add('hidden');
      }, 10000);
    }
  }

  function hideOverlay() {
    if (hideOverlayTimeout) {
      clearTimeout(hideOverlayTimeout);
      hideOverlayTimeout = null;
    }
    if (overlay) overlay.classList.add('hidden');
  }

  function loadUrl(url, mode) {
    if (!url || typeof url !== 'string' || url === 'about:blank') {
      showIdleState();
      return;
    }
    if (idleState) idleState.classList.add('hidden');
    currentUrl = url;

    // AI Studio is strictly for test generation and must never display the solution topbar
    let effectiveMode = mode;
    if (url.includes('aistudio.google.com')) {
      effectiveMode = 'generate';
    } else if (!effectiveMode) {
      if (sessionMode === 'hint') {
        effectiveMode = 'hint';
      } else if (url.includes('gemini.google.com') || (url.includes('google.com') && url.includes('/search'))) {
        effectiveMode = 'solution';
      } else {
        effectiveMode = 'generate';
      }
    }

    updateTopbarVisibility(effectiveMode);

    if (frame && frame.src !== url) {
      showOverlay();
      frame.src = url;
    }
  }

  if (frame) {
    frame.addEventListener('load', () => {
      hideOverlay();
    });
    frame.addEventListener('error', () => {
      hideOverlay();
    });
  }

  if (btnLaunchAiStudio) {
    btnLaunchAiStudio.addEventListener('click', () => {
      const studioUrl = 'https://aistudio.google.com/prompts/new_chat?model=gemini-3.8-flash#newtcbt_companion=1';
      chrome.storage.local.set({
        newtcbt_sidepanel_url: studioUrl,
        newtcbt_sidepanel_session_mode: 'generate'
      });
      loadUrl(studioUrl, 'generate');
    });
  }

  // 1. Retry step button handler (for AI solutions in Gemini / Google AI Mode)
  if (btnRetry) {
    btnRetry.addEventListener('click', () => {
      btnRetry.disabled = true;
      btnRetry.innerHTML = `
        <div class="spinner"></div>
        <span>Retrying...</span>
      `;

      // Post message to embedded iframe
      try {
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage({ type: 'RETRY_SUBMISSION' }, '*');
        }
      } catch (_) {}

      // Tell background service worker to trigger retry submission
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'TRIGGER_RETRY_SUBMISSION' }, () => {
          if (chrome.runtime.lastError) {}
        });
      }

      setTimeout(() => {
        btnRetry.disabled = false;
        btnRetry.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          <span>Retry step</span>
        `;
      }, 1500);
    });
  }

  // 2. Add solution to NewtCBT button handler
  function handleSolutionExtracted(text) {
    if (!text) return;
    isExtracting = false;
    if (btnAddSolution) {
      btnAddSolution.classList.add('btn-success');
      btnAddSolution.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Solution Added ✓</span>
      `;
      setTimeout(() => {
        btnAddSolution.classList.remove('btn-success');
        btnAddSolution.disabled = false;
        btnAddSolution.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span id="txt-add-soln">Add solution to NewtCBT</span>
        `;
      }, 2500);
    }

    // Broadcast to background so NewtCBT tab receives NEWTCBT_EXTRACTED_SOLN_RESULT
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'AI_SOLUTION_EXTRACTED',
        text,
        success: true
      }).catch(() => {});
    }
  }

  if (btnAddSolution) {
    btnAddSolution.addEventListener('click', () => {
      if (isExtracting) return;
      isExtracting = true;
      btnAddSolution.disabled = true;
      btnAddSolution.innerHTML = `
        <div class="spinner"></div>
        <span>Extracting...</span>
      `;

      // 1. Post to iframe
      try {
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage({ type: 'EXTRACT_SOLN_NOW' }, '*');
        }
      } catch (_) {}

      // 2. Ask background service worker
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'TRIGGER_EXTRACT_SOLN' }, (resp) => {
          if (resp && resp.success && resp.text) {
            handleSolutionExtracted(resp.text);
          }
        });
      }

      // Timeout fallback if extraction takes longer than 15s
      setTimeout(() => {
        if (isExtracting) {
          isExtracting = false;
          btnAddSolution.disabled = false;
          btnAddSolution.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span id="txt-add-soln">Add solution to NewtCBT</span>
          `;
        }
      }, 15000);
    });
  }

  // 3. Close sidebar
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      showIdleState();
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            newtcbt_sidepanel_url: '',
            newtcbt_sidepanel_session_mode: 'generate'
          });
        }
        window.close();
      } catch (err) {
        console.warn('[NewtCBT] Could not close sidepanel window:', err);
      }
    });
  }

  // 4. Listen to postMessage from iframe
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'EXTRACT_SOLN_RESULT') {
      if (e.data.success && e.data.text) {
        handleSolutionExtracted(e.data.text);
      } else {
        isExtracting = false;
        if (btnAddSolution) {
          btnAddSolution.disabled = false;
          btnAddSolution.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span id="txt-add-soln">Retry Add Soln</span>
          `;
        }
      }
    }
  });

  // 5. Connect persistent port with background service worker to signal sidepanel presence
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.connect === 'function') {
    try {
      const port = chrome.runtime.connect({ name: 'sidepanel' });
      port.onMessage.addListener((msg) => {
        if (!msg) return;
        if (msg.type === 'UPDATE_SIDEPANEL_URL' && msg.url) {
          const mode = msg.url.includes('aistudio.google.com') ? 'generate' : (msg.mode || sessionMode || 'solution');
          loadUrl(msg.url, mode);
        }
        if (msg.type === 'SET_SIDEPANEL_MODE' && msg.mode) {
          updateTopbarVisibility(msg.mode);
        }
        if (msg.type === 'EXTRACT_SOLN_NOW') {
          if (btnAddSolution && !isExtracting) {
            btnAddSolution.click();
          } else {
            try {
              if (frame && frame.contentWindow) {
                frame.contentWindow.postMessage({ type: 'EXTRACT_SOLN_NOW' }, '*');
              }
            } catch (_) {}
          }
        }
        if (msg.type === 'RETRY_SUBMISSION') {
          try {
            if (frame && frame.contentWindow) {
              frame.contentWindow.postMessage({ type: 'RETRY_SUBMISSION' }, '*');
            }
          } catch (_) {}
        }
        if (msg.type === 'CLOSE_SIDEPANEL') {
          showIdleState();
          try { window.close(); } catch (_) {}
        }
      });
    } catch (_) {}
  }

  // Check initial URL and session mode stored by background.js
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['newtcbt_sidepanel_url', 'newtcbt_sidepanel_session_mode'], (res) => {
      const url = res?.newtcbt_sidepanel_url;
      let mode = res?.newtcbt_sidepanel_session_mode;
      if (url && url.includes('aistudio.google.com')) {
        mode = 'generate';
      } else if (!mode && url) {
        mode = (url.includes('gemini.google.com') || (url.includes('google.com') && url.includes('/search'))) ? 'solution' : 'generate';
      }
      if (url && url !== 'about:blank') {
        loadUrl(url, mode);
      } else {
        showIdleState();
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        const newUrl = changes.newtcbt_sidepanel_url?.newValue;
        const newMode = changes.newtcbt_sidepanel_session_mode?.newValue;
        if (newUrl) {
          const effectiveMode = newUrl.includes('aistudio.google.com') ? 'generate' : (newMode || sessionMode);
          loadUrl(newUrl, effectiveMode);
        } else if (newMode) {
          updateTopbarVisibility(newMode);
        }
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === 'UPDATE_SIDEPANEL_URL' && msg.url) {
        const mode = msg.url.includes('aistudio.google.com') ? 'generate' : (msg.mode || sessionMode || 'solution');
        loadUrl(msg.url, mode);
      }
      if (msg.type === 'SET_SIDEPANEL_MODE' && msg.mode) {
        updateTopbarVisibility(msg.mode);
      }
      if (msg.type === 'NEWTCBT_EXTRACTED_SOLN_RESULT' && msg.success && msg.text) {
        handleSolutionExtracted(msg.text);
      }
      if (msg.type === 'CLOSE_SIDEPANEL') {
        showIdleState();
        try {
          window.close();
        } catch (_) {}
      }
    });
  }
})();
