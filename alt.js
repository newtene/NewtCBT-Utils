/**
 * NewtCBT - Google AI Studio Scraper ("alt")
 * Automates Google AI Studio Playground (https://aistudio.google.com/prompts/new_chat)
 * for the Hybrid Exam Generation pipeline.
 */

(function () {
  if (!window.location.hostname.includes('aistudio.google.com') || !window.location.pathname.startsWith('/prompts')) {
    return;
  }

  const isEmbed = window.self !== window.top;
  const isNewtEmbedded = isEmbed && (
    window.location.hash.includes('newtcbt') || 
    window.location.search.includes('_s=') ||
    (document.referrer && (
      document.referrer.includes('newtcbt.in') || 
      document.referrer.includes('localhost') || 
      document.referrer.includes('127.0.0.1') ||
      document.referrer.includes('chrome-extension://') ||
      document.referrer.includes('moz-extension://')
    )) ||
    sessionStorage.getItem('newtcbt_companion_mode') === 'true'
  );
  const isNewtSession = !isEmbed && (
    window.location.search.includes('_s=') || 
    window.location.hash.includes('newtcbt') || 
    window.name === 'newtcbt_companion_tab' ||
    sessionStorage.getItem('newtcbt_companion_mode') === 'true'
  );

  // If not embedded in NewtCBT and not launched by NewtCBT, exit immediately
  if (!isNewtEmbedded && !isNewtSession) {
    return;
  }

  if (isNewtSession || isNewtEmbedded) {
    try { sessionStorage.setItem('newtcbt_companion_mode', 'true'); } catch (_) {}
  }

  // Start an ISOLATED world Web Worker ticker (exempt from page Trusted Types) to pump aistudio_fix.js
  try {
    const tickBlob = new Blob(['setInterval(() => postMessage(0), 45);'], { type: 'application/javascript' });
    const tickWorker = new Worker(URL.createObjectURL(tickBlob));
    tickWorker.onmessage = () => {
      window.dispatchEvent(new CustomEvent('__newtcbt_raf_tick'));
    };
  } catch (_) {
    setInterval(() => {
      window.dispatchEvent(new CustomEvent('__newtcbt_raf_tick'));
    }, 50);
  }

  console.log('[NewtCBT:Alt] AI Studio scraper initialized on:', window.location.href);

  // ================================================================
  // CLEAN UPPER PANEL & PERSISTENT NEWTCBT STATUS IN EXISTING SURFACE
  // ================================================================
  function setupCleanCompanionHeader() {
    try {
      // Remove any lingering legacy banner
      const oldBanner = document.getElementById('newtcbt-companion-banner');
      if (oldBanner) oldBanner.remove();

      if (!document.getElementById('newtcbt-clean-header-style')) {
        const style = document.createElement('style');
        style.id = 'newtcbt-clean-header-style';
        style.textContent = `
          /* Strip bloat buttons and tokens from Google AI Studio top bar */
          button[aria-label*="menu" i],
          button[aria-label*="navigation" i],
          button[aria-label*="new" i],
          button[aria-label*="more" i],
          button[aria-label*="settings" i],
          button[aria-label*="tune" i],
          button[aria-label*="parameters" i],
          header .mat-mdc-icon-button,
          ms-header button,
          ms-header ms-share-prompt,
          ms-header .compare-button,
          ms-header .overflow-menu-wrapper,
          ms-header button[data-test-clear],
          ms-header .token-container,
          ms-header ms-token-count,
          ms-header .v3-token-count-value,
          ms-header .token-count-container,
          ms-header .xap-inline-dialog,
          ms-header span[class*="token-count"],
          ms-header [class*="token-container"] {
            display: none !important;
          }

          /* Hide default 'Playground' text */
          ms-header .page-title h1.mode-title,
          ms-header h1.mode-title {
            display: none !important;
          }

          /* Transform the existing ms-header surface (pinned to left, solid obsidian) */
          ms-header {
            padding: 8px 12px 6px !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            justify-content: flex-start !important;
            background: #0d0d12 !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
            min-height: 48px !important;
            box-sizing: border-box !important;
            width: 100% !important;
          }

          ms-header .toolbar-left {
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            justify-content: flex-start !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }

          ms-header .title-tokencount-container {
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            justify-content: flex-start !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            gap: 4px !important;
          }

          ms-header .page-title {
            margin: 0 !important;
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: flex-start !important;
            text-align: left !important;
            width: 100% !important;
          }

          /* Brand element in existing header surface (left aligned) */
          .newtcbt-header-brand {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 7px !important;
            margin: 0 !important;
            padding: 0 !important;
            text-align: left !important;
            flex-shrink: 0 !important;
          }

          .newtcbt-header-brand img {
            width: 18px !important;
            height: 18px !important;
            border-radius: 4px !important;
            display: block !important;
            margin: 0 !important;
          }

          .newtcbt-header-brand .title {
            font-size: 13px !important;
            font-weight: 600 !important;
            color: #f4f4f5 !important;
            letter-spacing: -0.01em !important;
            white-space: nowrap !important;
            text-align: left !important;
          }

          /* Note badge and text in existing header surface - ZERO BORDER */
          .newtcbt-header-note {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 6px !important;
            background: rgba(245, 158, 11, 0.12) !important;
            border: none !important;
            outline: none !important;
            border-radius: 4px !important;
            padding: 3px 8px !important;
            margin: 2px 0 0 0 !important;
            max-width: 100% !important;
            box-shadow: none !important;
          }

          .newtcbt-header-note .badge {
            font-size: 9px !important;
            font-weight: 700 !important;
            text-transform: uppercase !important;
            background: rgba(245, 158, 11, 0.24) !important;
            color: #fbbf24 !important;
            border: none !important;
            outline: none !important;
            border-radius: 3px !important;
            padding: 1px 4px !important;
            line-height: 1.2 !important;
            flex-shrink: 0 !important;
          }

          .newtcbt-header-note .text {
            font-size: 11px !important;
            color: #d4d4d8 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }
        `;
        (document.head || document.documentElement).appendChild(style);
      }

      const updateExistingSurface = () => {
        const legacyBanner = document.getElementById('newtcbt-companion-banner');
        if (legacyBanner) legacyBanner.remove();

        const header = document.querySelector('ms-header');
        if (!header) return;

        // Clean any token count DOM nodes
        const tokenEls = header.querySelectorAll('.token-container, ms-token-count, .v3-token-count-value, .token-count-container');
        tokenEls.forEach(el => el.remove());

        const logoUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
          ? chrome.runtime.getURL('logo-32.png')
          : '';

        const pageTitle = header.querySelector('.page-title');
        if (pageTitle && !pageTitle.querySelector('.newtcbt-header-brand')) {
          const brand = document.createElement('div');
          brand.className = 'newtcbt-header-brand';
          brand.innerHTML = `
            ${logoUrl ? `<img src="${logoUrl}" alt="Newt" />` : ''}
            <span class="title">NewtCBT generating test</span>
          `;
          pageTitle.prepend(brand);
        }

        const container = header.querySelector('.title-tokencount-container') || header.querySelector('.toolbar-left') || header;
        if (container && !header.querySelector('.newtcbt-header-note')) {
          const note = document.createElement('div');
          note.className = 'newtcbt-header-note';
          note.title = 'Note - dont close the panel it will stop generation.';
          note.innerHTML = `
            <span class="badge">NOTE</span>
            <span class="text">dont close the panel it will stop generation.</span>
          `;
          container.appendChild(note);
        }
      };

      updateExistingSurface();

      const observer = new MutationObserver(() => {
        updateExistingSurface();
      });

      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      } else {
        window.addEventListener('DOMContentLoaded', () => {
          updateExistingSurface();
          if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
          }
        }, { once: true });
      }
    } catch (e) {
      console.warn('[NewtCBT:Alt] Failed to attach to companion header surface:', e);
    }
  }

  setupCleanCompanionHeader();

  // ================================================================
  // 1. STATE & DEDUPLICATION
  // ================================================================

  let altProcessing = false;
  let currentJobId = null;
  let currentStage = null;
  let activeObserverInterval = null;
  const processedJobIds = new Set();

  // Direct network stream state (received from aistudio_fix.js XHR/Fetch hook)
  let latestStreamText = '';
  let streamIsDone = false;
  let streamError = null;

  window.addEventListener('__newtcbt_api_stream', (e) => {
    const detail = e.detail || {};
    if (typeof detail.text === 'string' && detail.text.length > 0) {
      latestStreamText = detail.text;
    }
    if (detail.done) {
      if (latestStreamText.length > 0 || detail.error) {
        streamIsDone = true;
      }
      if (detail.error) streamError = detail.error;
    }
  });

  function dataURLtoFile(dataurl, filename = 'document.pdf', mimeType = null) {
    try {
      if (!dataurl) return null;
      let mime = mimeType;
      let bstr;
      if (dataurl.includes(',')) {
        const arr = dataurl.split(',');
        mime = mime || (arr[0].match(/:(.*?);/) || [])[1] || 'application/pdf';
        bstr = atob(arr[1]);
      } else {
        mime = mime || 'application/pdf';
        bstr = atob(dataurl);
      }
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], filename, { type: mime, lastModified: Date.now() });
    } catch (e) {
      console.error('[NewtCBT:Alt] dataURLtoFile failed:', e);
      return null;
    }
  }

  // ================================================================
  // 3. MESSAGING HELPERS
  // ================================================================

  function notifyAltProgress(stage, status, length = 0, percent = 0, jobId = null) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'ALT_STAGE_PROGRESS',
        stage,
        status,
        length,
        percent,
        jobId: jobId || currentJobId
      }, () => {
        if (chrome.runtime.lastError) {}
      });
    }
  }

  function notifyAltComplete(stage, result, jobId = null, success = true) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'ALT_STAGE_COMPLETE',
        stage,
        result,
        jobId: jobId || currentJobId,
        success
      }, () => {
        if (chrome.runtime.lastError) {}
      });
    }
  }

  function notifyAltError(stage, error, jobId = null) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'ALT_STAGE_ERROR',
        stage,
        error: typeof error === 'string' ? error : (error?.message || 'AI Studio automation error'),
        jobId: jobId || currentJobId
      }, () => {
        if (chrome.runtime.lastError) {}
      });
    }
  }

  // ================================================================
  // 4. DOM AUTOMATION HELPERS
  // ================================================================

  function findPromptTextarea() {
    return document.querySelector('textarea[aria-label="Enter a prompt"]') ||
           document.querySelector('ms-prompt-box textarea[formcontrolname="promptText"]') ||
           document.querySelector('ms-prompt-box textarea') ||
           document.querySelector('textarea.cdk-textarea-autosize') ||
           document.querySelector('textarea[placeholder*="prompt" i]') ||
           document.querySelector('textarea[placeholder*="Start typing" i]') ||
           document.querySelector('.prompt-box-container textarea') ||
           document.querySelector('ms-prompt-editor textarea') ||
           document.querySelector('textarea');
  }

  function findFileInput() {
    const promptBox = document.querySelector('ms-prompt-box');
    if (promptBox) {
      const input = promptBox.querySelector('input[type="file"][data-test-upload-file-input], ms-add-media-button input[type="file"], input[type="file"]');
      if (input) return input;
    }
    return document.querySelector('input[type="file"][data-test-upload-file-input]') ||
           document.querySelector('ms-add-media-button input[type="file"]') ||
           document.querySelector('input[type="file"].file-input') ||
           document.querySelector('input[type="file"]');
  }

  function findRunButton() {
    return document.querySelector('ms-run-button button.ctrl-enter-submits') ||
           document.querySelector('ms-run-button button') ||
           document.querySelector('button.ctrl-enter-submits');
  }

  function isRunButtonDisabled(btn) {
    if (!btn) return true;
    return btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('disabled');
  }

  function isGeneratingActive() {
    const btn = findRunButton();
    if (btn) {
      const text = (btn.textContent || btn.innerText || '').trim().toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (text.includes('stop') || ariaLabel.includes('stop') || btn.querySelector('.spin, [mattooltip*="Stop" i]')) {
        return true;
      }
    }
    return !!document.querySelector('.spin.material-symbols-outlined, ms-run-button .spin, ms-chat-turn .spin, ms-chat-turn .spinner');
  }


  function checkAttachmentSettled() {
    const promptBox = document.querySelector('ms-prompt-box');
    const chip = promptBox 
      ? promptBox.querySelector('div[data-test-id="prompt-media-container"], ms-prompt-media')
      : document.querySelector('div[data-test-id="prompt-media-container"], ms-prompt-media');
    if (!chip) return false;

    // Check for active loading spinner
    const spinner = chip.querySelector('mat-spinner, mat-progress-spinner, .loading, [data-test-id="spinner"], .spin');
    if (spinner) return false;

    const statusEl = chip.querySelector('ms-token-status span[data-test-id="status"], [data-test-id="status"]');
    const statusText = (statusEl?.textContent || statusEl?.innerText || '').trim().toLowerCase();

    // While uploading, AI Studio displays "Loading..." or "Uploading..."
    if (statusText.includes('loading') || statusText.includes('uploading')) {
      return false;
    }

    return true;
  }

  function injectFileViaDataTransfer(fileInput, fileObj) {
    if (!fileInput || !fileObj) return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(fileObj);
      fileInput.files = dt.files;

      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      console.log(`[NewtCBT:Alt] Attached file "${fileObj.name}" via fileInput DataTransfer ✓`);
      return true;
    } catch (err) {
      console.warn('[NewtCBT:Alt] fileInput DataTransfer failed, trying fallback:', err);
      return false;
    }
  }

  function injectFileViaDropOrPaste(textarea, fileObj) {
    if (!fileObj) return false;
    const dt = new DataTransfer();
    dt.items.add(fileObj);

    // 1. Drop on prompt box
    try {
      const dropTarget = document.querySelector('ms-prompt-box .dragging-overlay') ||
                         document.querySelector('ms-prompt-box') ||
                         textarea;
      dropTarget.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
      dropTarget.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      dropTarget.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      console.log('[NewtCBT:Alt] Dispatched DragDrop fallback ✓');
    } catch (e) {}

    // 2. Paste on textarea
    try {
      textarea.focus();
      textarea.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      }));
      console.log('[NewtCBT:Alt] Dispatched ClipboardEvent fallback ✓');
    } catch (e) {}
  }

  function setPromptValue(textarea, text) {
    textarea.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(textarea, text);
    } else {
      textarea.value = text;
    }
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, composed: true }));
    textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }

  // ================================================================
  // 5. DIRECT DOM MARKDOWN EXTRACTION (ZERO-CLIPBOARD)
  // ================================================================

  function getModelTurns() {
    const turns = Array.from(document.querySelectorAll('ms-chat-turn'));
    return turns.filter(t => {
      const hasModelClass = t.classList.contains('model') || 
                            !!t.querySelector('.chat-turn-container.model, [data-turn-role="Model"], ms-response-header');
      const isUser = t.classList.contains('user') || 
                     !!t.querySelector('.chat-turn-container.user, [data-turn-role="User"]');
      const isThought = t.classList.contains('thought-activity-host');
      return (hasModelClass || !isUser) && !isThought;
    });
  }

  function isPayloadValidForStage(payload, stage) {
    if (!payload || typeof payload !== 'string') return false;
    const len = payload.length;
    if (stage === 'loki') {
      if (len < 120) return false;
      const hasStructure = /(?:^|[\n\r↵⏎])\s*#{1,4}\s+[A-Za-z]/m.test(payload) || 
                           /\[(?:OPTIONS|CH:|DIAGRAM|DIFF:)/i.test(payload) ||
                           /(?:^|[\n\r↵⏎])\s*[1-9]\d{0,2}[\.\)]\s+[\s\S]*?(?:\([A-D1-4]\)|\[OPTIONS\]|\$)/m.test(payload);
      const stripped = payload.replace(/[↵⏎\s]+/g, ' ').trim();
      const isPureAnsKey = /^(?:(?:Q\.?\s*\d+|\d{1,3}[\.\:\)])\s*[\(\[]?[A-D1-4][\)\]]?\s*)+$/im.test(stripped) ||
                           (!payload.includes('OPTIONS') && !payload.includes('$') && !payload.includes('#') && !/(?:\([A-D]\).*?\([A-D]\))/s.test(payload) && !/(?:[A-D]\).*?[A-D]\))/s.test(payload));
      return hasStructure && !isPureAnsKey;
    }
    if (stage === 'dia') {
      if (len < 20) return false;
      return /^\s*\[\s*\{/m.test(payload) || /^\s*\{\s*"/m.test(payload) || (/"questionNumber"/i.test(payload) && /"box/i.test(payload)) || /"diagrams"\s*:\s*\[/i.test(payload);
    }
    if (stage === 'sylvie' || stage === 'ans' || stage === 'key') {
      if (len < 20) return false;
      return /(?:^|[\n\r↵⏎])\s*(?:(?:Q\.?\s*\d+|\d{1,3}[\.\:\)])\s*[\(\[]?[A-D1-4][\)\]]?)/im.test(payload) || 
             /"answers"/i.test(payload) || 
             /^\s*[\{\[]/m.test(payload) ||
             /===QUESTION/i.test(payload) ||
             /\[ANS\]/i.test(payload);
    }
    return len >= 20;
  }

  function extractAiStudioMarkdown(minModelTurnCount = 0) {
    const modelTurns = getModelTurns();
    // Multi-turn safeguard: if waiting for a new turn, do not read previous turn
    if (minModelTurnCount > 0 && modelTurns.length < minModelTurnCount) {
      return null;
    }

    // Search model turns from the latest down to minModelTurnCount (never document.body if minModelTurnCount > 0)
    const startIndex = Math.max(0, minModelTurnCount > 0 ? minModelTurnCount - 1 : 0);
    const candidateTurns = modelTurns.length > 0 
      ? modelTurns.slice(startIndex).reverse() 
      : (minModelTurnCount === 0 ? [document.body] : []);

    for (const turn of candidateTurns) {
      // 1. PRIMARY TARGET: Find code element strictly INSIDE ms-code-block of turn
      const msCodeBlocks = Array.from(turn.querySelectorAll('ms-code-block'));
      if (msCodeBlocks.length > 0) {
        let bestCode = '';
        for (const block of msCodeBlocks) {
          const codeEl = block.querySelector('pre code') || block.querySelector('code');
          if (!codeEl) continue;

          let text = (codeEl.textContent || codeEl.innerText || '').trim();
          text = text.replace(/^```(?:markdown|json|text)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
          text = text.replace(/^(?:code\s*\n\s*)?(?:Markdown|JSON|Text)\s*\n\s*download\s*\n\s*content_copy\s*\n\s*(?:expand_less|expand_more)\s*\n?/i, '').trim();

          if (text.length > bestCode.length) {
            bestCode = text;
          }
        }
        if (bestCode.length > 20) {
          return bestCode;
        }
      }

      // 2. Fallback: CommonMark node container inside turn
      const cmarkEl = turn.querySelector('ms-cmark-node');
      if (cmarkEl) {
        let rawText = (cmarkEl.textContent || cmarkEl.innerText || '').trim();
        rawText = rawText.replace(/^```(?:markdown|json|text)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
        if (rawText.length > 20) {
          return rawText;
        }
      }
    }

    return null;
  }

  // ================================================================
  // 6. EXECUTION LIFECYCLE
  // ================================================================

  async function executeAltStage(stage, fileData, promptOverride, jobId, isRetry = false) {
    const activeJobId = jobId || ('job_' + Date.now());

    if (activeObserverInterval) {
      clearInterval(activeObserverInterval);
      activeObserverInterval = null;
    }

    if (isRetry) {
      console.log(`[NewtCBT:Alt] Retrying stage: ${stage} (jobId: ${activeJobId})`);
      altProcessing = false;
      processedJobIds.delete(activeJobId);
    } else {
      if (processedJobIds.has(activeJobId)) {
        console.log('[NewtCBT:Alt] Job already processed, ignoring duplicate:', activeJobId);
        return;
      }
      if (altProcessing && currentJobId === activeJobId) {
        console.log('[NewtCBT:Alt] Stage already in progress for jobId:', activeJobId);
        return;
      }
    }

    altProcessing = true;
    currentJobId = activeJobId;
    currentStage = stage;
    processedJobIds.add(activeJobId);

    console.log(`[NewtCBT:Alt] Executing stage: ${stage} (jobId: ${currentJobId})`);
    notifyAltProgress(stage, 'initializing', 0, 5, currentJobId);

    // 1. Check if generation is ALREADY active on the page!
    if (isGeneratingActive()) {
      console.log(`[NewtCBT:Alt] Generation already active for ${stage} (jobId: ${currentJobId}). Transitioning directly to streaming observer!`);
      notifyAltProgress(stage, 'streaming', 100, 35, currentJobId);
      observeAiStudioStreaming(stage, currentJobId, getModelTurns().length);
      return;
    }

    // 2. Locate Editor with retry loop (waiting for Angular hydration)
    let textarea = null;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (isGeneratingActive()) {
        console.log(`[NewtCBT:Alt] Generation started in parallel, transitioning directly to observer...`);
        notifyAltProgress(stage, 'streaming', 100, 35, currentJobId);
        observeAiStudioStreaming(stage, currentJobId, getModelTurns().length);
        return;
      }
      textarea = findPromptTextarea();
      if (textarea) break;
      await new Promise(r => setTimeout(r, 400));
    }

    if (!textarea) {
      if (isGeneratingActive()) {
        console.log(`[NewtCBT:Alt] Generation active, transitioning to observer.`);
        observeAiStudioStreaming(stage, currentJobId, getModelTurns().length);
        return;
      }

      // If this frame does not even have ms-prompt-box or app-root, it's an auxiliary frame!
      if (!document.querySelector('ms-prompt-box, app-root, ms-chat-session')) {
        console.log('[NewtCBT:Alt] Auxiliary frame without ms-prompt-box. Suppressing error silently.');
        altProcessing = false;
        return;
      }

      const isAuthWall = 
        window.location.hostname.includes('accounts.google.com') ||
        (document.body.innerText || '').includes('Sign in') ||
        (document.body.innerText || '').includes('Google AI Studio');

      if (isAuthWall) {
        console.error('[NewtCBT:Alt] User is not authenticated in Google AI Studio.');
        notifyAltError(stage, 'GOOGLE_AUTH_REQUIRED: Please sign in to Google AI Studio first.', currentJobId);
      } else {
        console.error('[NewtCBT:Alt] Could not find AI Studio prompt textarea.');
        notifyAltError(stage, 'AI Studio textarea element not found.', currentJobId);
      }
      altProcessing = false;
      return;
    }

    // 3. Prepare File Object
    let fileObj = null;
    if (fileData) {
      const defaultName = (stage === 'sylvie' || stage === 'ans' || stage === 'key')
        ? 'answer_key.pdf'
        : 'question_paper.pdf';

      if (typeof fileData === 'string') {
        fileObj = dataURLtoFile(fileData, defaultName);
      } else if (typeof fileData === 'object') {
        const rawBase64 = fileData.base64 || fileData.data || fileData.url || '';
        const name = fileData.name || defaultName;
        const mime = fileData.mimeType || fileData.type || 'application/pdf';
        fileObj = dataURLtoFile(rawBase64, name, mime);
      }
    }

    // 4. Prompt strictly provided from frontend
    const finalPrompt = promptOverride || '';
    const initialModelTurns = getModelTurns().length;

    // 5. Attach File if provided
    if (fileObj) {
      notifyAltProgress(stage, 'uploading_file', 0, 15, currentJobId);

      const fileInput = findFileInput();
      let attached = false;
      if (fileInput) {
        attached = injectFileViaDataTransfer(fileInput, fileObj);
      }
      if (!attached) {
        injectFileViaDropOrPaste(textarea, fileObj);
      }

      // Pre-insert prompt text
      setTimeout(() => {
        setPromptValue(textarea, finalPrompt);
      }, 300);

      // Wait for settlement
      await awaitUploadSettlementAndRun(stage, textarea, currentJobId, initialModelTurns, finalPrompt);
    } else {
      // Text-only turn
      setPromptValue(textarea, finalPrompt);
      await triggerRunAndObserve(stage, currentJobId, initialModelTurns, textarea);
    }
  }

  async function awaitUploadSettlementAndRun(stage, textarea, jobId, initialModelTurns = 0, expectedPrompt = '') {
    const startTime = Date.now();
    const timeoutMs = 120000; // 2 minutes for large multi-page PDFs
    let stableTicks = 0;
    let hasSent = false;

    console.log('[NewtCBT:Alt] Waiting for file attachment settlement and Run button...');

    const interval = setInterval(() => {
      if (hasSent) {
        clearInterval(interval);
        return;
      }

      const elapsed = Date.now() - startTime;
      const isSettled = checkAttachmentSettled();
      const runBtn = findRunButton();
      const isReady = runBtn && !isRunButtonDisabled(runBtn);

      // Keep prompt populated if Angular wiped it during attachment initialization
      if (expectedPrompt && textarea && (!textarea.value || textarea.value.length < 10)) {
        setPromptValue(textarea, expectedPrompt);
      }

      const progress = Math.min(30, Math.floor(15 + (elapsed / timeoutMs) * 15));
      notifyAltProgress(stage, isSettled ? 'ready' : 'uploading', 0, progress, jobId);

      // Click ONLY when actually ready (Run button is fully enabled and attachment is settled)
      if (isSettled && isReady) {
        stableTicks++;
        if (stableTicks >= 2) { // Stable for 500ms
          hasSent = true;
          clearInterval(interval);
          console.log(`[NewtCBT:Alt] Attachment settled and Run button enabled in ${elapsed}ms ✓`);
          clickRunAndObserve(stage, runBtn, jobId, initialModelTurns, textarea);
          return;
        }
      } else {
        stableTicks = 0;
      }

      if (elapsed >= timeoutMs) {
        if (!hasSent) {
          hasSent = true;
          clearInterval(interval);
          console.warn('[NewtCBT:Alt] Settlement reached timeout, attempting Run click...');
          const btn = findRunButton();
          if (btn) clickRunAndObserve(stage, btn, jobId, initialModelTurns, textarea);
          else notifyAltError(stage, 'Run button not found after settlement timeout.', jobId);
        }
      }
    }, 250);
  }

  function clickRunAndObserve(stage, runBtn, jobId, initialModelTurns = 0, textarea = null) {
    notifyAltProgress(stage, 'submitting', 0, 35, jobId);
    console.log('[NewtCBT:Alt] Dispatching Run button click events ✓');

    // Reset stream state immediately BEFORE clicking Run so we don't miss or prematurely wipe chunks
    latestStreamText = '';
    streamIsDone = false;
    streamError = null;

    try {
      runBtn.focus();
      runBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
      runBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      runBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
      runBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    } catch (_) {}
    runBtn.click();

    // Safety net for background tabs: if Angular didn't register click after 700ms, dispatch Ctrl+Enter on textarea
    setTimeout(() => {
      if (!isGeneratingActive() && !latestStreamText && textarea) {
        console.log('[NewtCBT:Alt] Generation not detected after click; firing Ctrl+Enter backup on textarea...');
        try {
          textarea.focus();
          textarea.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            ctrlKey: true,
            bubbles: true,
            cancelable: true
          }));
        } catch (_) {}
      }
    }, 700);

    const minModelTurns = initialModelTurns + 1;
    observeAiStudioStreaming(stage, jobId, minModelTurns);
  }

  async function triggerRunAndObserve(stage, jobId, initialModelTurns = 0, textarea = null) {
    const startTime = Date.now();
    const timeoutMs = 30000;
    const interval = setInterval(() => {
      const runBtn = findRunButton();
      if (runBtn && !isRunButtonDisabled(runBtn)) {
        clearInterval(interval);
        clickRunAndObserve(stage, runBtn, jobId, initialModelTurns, textarea);
        return;
      }
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        const btn = findRunButton();
        if (btn) clickRunAndObserve(stage, btn, jobId, initialModelTurns, textarea);
        else notifyAltError(stage, 'Could not trigger Run button.', jobId);
      }
    }, 250);
  }

  function cleanAiStudioPayload(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    let text = rawText.trim();

    // 1. Extract content from all closed code blocks (markdown / json / text)
    // Strips all leading/trailing/interleaved thoughts from models with thinking enabled
    const codeBlockRegex = /```(?:markdown|json|text)?\s*([\s\S]*?)```/gi;
    const blocks = [];
    let match;
    let lastEnd = 0;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      const code = match[1].trim();
      if (code.length > 10) {
        blocks.push(code);
      }
      lastEnd = match.index + match[0].length;
    }

    // 2. Check for unclosed code block after last closed block (streaming in progress)
    const remaining = text.slice(lastEnd);
    const unclosedMatch = remaining.match(/```(?:markdown|json|text)?\s*([\s\S]+)$/i);
    if (unclosedMatch && unclosedMatch[1].trim().length > 10) {
      blocks.push(unclosedMatch[1].trim());
    }

    if (blocks.length > 0) {
      return blocks.join('\n\n');
    }

    // 3. Fallback if model output raw text without code fences:
    // ONLY match if it contains verified exam structure (never conversational thinking)
    const sylvieDelimIdx = text.search(/(?:^|[\n\r↵⏎])\s*===QUESTION\s*\d*===/m);
    if (sylvieDelimIdx >= 0) {
      return text.slice(sylvieDelimIdx).trim();
    }

    const secIdx = text.search(/(?:^|[\n\r↵⏎])\s*#{1,3}\s+[A-Za-z]/m);
    if (secIdx >= 0) {
      return text.slice(secIdx).trim();
    }

    const qWithOptsIdx = text.search(/(?:^|[\n\r↵⏎])\s*[1-9]\d{0,2}[\.\)]\s+[\s\S]*?(?:[\n\r↵⏎]\s*\[OPTIONS\]|[\n\r↵⏎]\s*[A-D]\)|[\n\r↵⏎]\s*\([A-D]\)|\[CH:|\[DIAGRAM|\[DIFF:)/im);
    if (qWithOptsIdx >= 0) {
      return text.slice(qWithOptsIdx).trim();
    }

    // Answer key fallback: e.g. "1. A" or "1: (B)" or "Q1. A"
    const ansIdx = text.search(/(?:^|[\n\r↵⏎])\s*(?:Q\.?\s*\d+|\d{1,3}[\.\:\)])\s*[\(\[]?([A-D1-4])[\)\]]?(?:\s*$|\s+(?=[^a-z]|$))/im);
    if (ansIdx >= 0) {
      return text.slice(ansIdx).trim();
    }

    // JSON array fallback for diagram stage: e.g. [ { "questionNumber": 1 ...
    const jsonArrIdx = text.search(/^\s*\[\s*\{\s*"/m);
    if (jsonArrIdx >= 0) {
      return text.slice(jsonArrIdx).trim();
    }

    // If there are NO code blocks and NO verified exam structures,
    // the text is pure reasoning/thinking tokens! Return empty string.
    return '';
  }

  function observeAiStudioStreaming(stage, jobId, minModelTurnCount = 0) {
    console.log(`[NewtCBT:Alt] Observing streaming for ${stage} (jobId: ${jobId}, minModelTurns: ${minModelTurnCount})...`);

    if (activeObserverInterval) {
      clearInterval(activeObserverInterval);
      activeObserverInterval = null;
    }

    // Only reset stream state if generation is not active or if current stream does not match stage
    if (!isGeneratingActive() && (!latestStreamText || !isPayloadValidForStage(latestStreamText, stage))) {
      latestStreamText = '';
      streamIsDone = false;
      streamError = null;
    }

    const startTime = Date.now();
    let domStableTicks = 0;
    let streamStableTicks = 0;
    let lastDomLen = 0;
    let lastStreamLen = 0;
    let everGenerating = false;
    const isAnswerKey = (stage === 'sylvie' || stage === 'ans' || stage === 'key');
    const isDiaStage = (stage === 'dia' || stage === 'diagram' || stage === 'crop');
    const targetChars = isAnswerKey ? 2500 : isDiaStage ? 4000 : 25000;
    const minLength = isAnswerKey ? 40 : isDiaStage ? 25 : 120;
    const maxTimeoutMs = 1200000; // 20 minutes synchronized with frontend

    const interval = setInterval(() => {
      const isDomGen = isGeneratingActive();
      const domPayload = extractAiStudioMarkdown(minModelTurnCount) || '';

      // Clean thought tokens from both direct network stream and DOM
      const cleanStreamPayload = cleanAiStudioPayload(latestStreamText);
      const cleanDomPayload = cleanAiStudioPayload(domPayload);

      const hasStreamData = cleanStreamPayload && cleanStreamPayload.length >= minLength;
      const hasDomData = cleanDomPayload && cleanDomPayload.length >= minLength;

      const rawPayload = (cleanStreamPayload && cleanStreamPayload.length >= cleanDomPayload.length)
        ? cleanStreamPayload
        : cleanDomPayload;
      const curLen = rawPayload.length;

      if (isDomGen || (latestStreamText && latestStreamText.length > 0)) {
        everGenerating = true;
      }

      // Progress computation
      if (curLen > 0) {
        const pct = Math.min(95, Math.floor(35 + (curLen / targetChars) * 60));
        notifyAltProgress(stage, 'streaming', curLen, pct, jobId);
      }

      // Check stream error
      if (streamError && !curLen) {
        clearInterval(interval);
        activeObserverInterval = null;
        console.error(`[NewtCBT:Alt] Network stream error for ${stage}:`, streamError);
        notifyAltError(stage, `Network error from AI Studio: ${streamError}`, jobId);
        altProcessing = false;
        return;
      }

      // Check DOM error indicators (e.g. snackbars, alert banners, turn error icons)
      const snackbar = document.querySelector('mat-snack-bar-container, .mat-mdc-snack-bar-container, [role="alert"]');
      const snackbarText = (snackbar?.textContent || '').trim();
      const lastTurn = document.querySelector('ms-chat-turn:last-of-type');
      const lastTurnText = (lastTurn?.textContent || '').toLowerCase();
      const hasTurnErrorIcon = !!document.querySelector('ms-chat-turn mat-icon.error, ms-chat-turn [data-test-id*="error"]');

      const isDomError = (snackbarText && /internal error|permission|overloaded|please try again|quota exceeded/i.test(snackbarText)) ||
                         (lastTurnText && /an internal error has occurred|caller does not have permission|model is overloaded/i.test(lastTurnText)) ||
                         (hasTurnErrorIcon && !isDomGen && !curLen);

      if (isDomError && !curLen) {
        clearInterval(interval);
        activeObserverInterval = null;
        const errMsg = snackbarText || 'AI Studio Error: Internal error encountered';
        console.error(`[NewtCBT:Alt] DOM error detected for ${stage}:`, errMsg);
        notifyAltError(stage, errMsg, jobId);
        altProcessing = false;
        return;
      }

      // ─── PATH 1: DIRECT NETWORK STREAM COMPLETION (BACKGROUND TAB FAST-PATH) ───
      // If network stream provided substantial content:
      if (hasStreamData) {
        if (cleanStreamPayload.length === lastStreamLen) {
          streamStableTicks++;
        } else {
          streamStableTicks = 0;
          lastStreamLen = cleanStreamPayload.length;
        }

        // Completion requirements:
        // 1. MUST NOT cut off while AI Studio is actively generating (Stop button is visible)
        // 2. Either the HTTP stream finished (streamIsDone) OR generation ended (!isDomGen) and payload has been stable
        // 3. Must have actually engaged generation (everGenerating || streamIsDone)
        // 4. Must be structurally valid for the current stage (never pure answer keys for Loki)
        const isNetworkComplete = streamIsDone && (!isDomGen || streamStableTicks >= 2);
        const isSettledAfterStop = !isDomGen && streamStableTicks >= 8; // 4s stable AFTER Stop button disappears

        if ((isNetworkComplete || isSettledAfterStop) && (everGenerating || streamIsDone) && isPayloadValidForStage(cleanStreamPayload, stage)) {
          clearInterval(interval);
          activeObserverInterval = null;
          const finalPayload = (cleanDomPayload && cleanDomPayload.length > cleanStreamPayload.length && isPayloadValidForStage(cleanDomPayload, stage))
            ? cleanDomPayload
            : cleanStreamPayload;
          console.log(`[NewtCBT:Alt] Direct network stream complete for ${stage} (${finalPayload.length} chars, streamIsDone: ${streamIsDone}) ✓`);
          notifyAltProgress(stage, 'complete', finalPayload.length, 100, jobId);
          notifyAltComplete(stage, finalPayload, jobId, true);
          altProcessing = false;
          return;
        }
      }

      // ─── PATH 2: DOM COMPLETION (FALLBACK IF STREAM INTERCEPTOR HAD NO DATA) ───
      // ONLY used if network stream did NOT produce content.
      // Must wait until DOM generation spinner/Stop button is completely gone (!isDomGen)
      // AND text length has remained completely stable for 2 seconds (4 ticks)
      // AND must be structurally valid for stage.
      if (!hasStreamData && hasDomData && !isDomGen) {
        if (cleanDomPayload.length === lastDomLen) {
          domStableTicks++;
          if (domStableTicks >= 4 && (everGenerating || streamIsDone) && isPayloadValidForStage(cleanDomPayload, stage)) {
            clearInterval(interval);
            activeObserverInterval = null;
            console.log(`[NewtCBT:Alt] DOM Extraction complete for ${stage} (${cleanDomPayload.length} chars) ✓`);
            notifyAltProgress(stage, 'complete', cleanDomPayload.length, 100, jobId);
            notifyAltComplete(stage, cleanDomPayload, jobId, true);
            altProcessing = false;
            return;
          }
        } else {
          domStableTicks = 0;
          lastDomLen = cleanDomPayload.length;
        }
      } else {
        domStableTicks = 0;
        lastDomLen = cleanDomPayload.length;
      }

      // Safeguard timeout
      if (Date.now() - startTime > maxTimeoutMs) {
        clearInterval(interval);
        activeObserverInterval = null;
        if (curLen >= minLength && isPayloadValidForStage(rawPayload, stage)) {
          console.warn(`[NewtCBT:Alt] Reached timeout but extracted valid partial payload (${curLen} chars).`);
          notifyAltComplete(stage, rawPayload, jobId, true);
        } else {
          console.error(`[NewtCBT:Alt] Timed out waiting for response from AI Studio.`);
          notifyAltError(stage, `Timed out waiting for response from AI Studio.`, jobId);
        }
        altProcessing = false;
      }
    }, 500);

    activeObserverInterval = interval;
  }

  // ================================================================
  // 7. MESSAGE & STORAGE LISTENERS
  // ================================================================

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg) return;

      if (msg.type === 'START_ALT_STAGE' || msg.type === 'START_GEM_STAGE_DIRECT') {
        const stage = msg.stage || 'text';
        executeAltStage(stage, msg.file, msg.prompt, msg.jobId, !!msg.isRetry);
        sendResponse && sendResponse({ success: true, stage, jobId: msg.jobId });
        return true;
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        const newJobId = changes.newtcbt_alt_job_id?.newValue || changes.newtcbt_gem_job_id?.newValue;
        if (newJobId && newJobId !== currentJobId) {
          chrome.storage.local.get(
            ['newtcbt_alt_stage', 'newtcbt_alt_file', 'newtcbt_alt_prompt', 'newtcbt_alt_job_id', 'newtcbt_alt_is_retry',
             'newtcbt_gem_stage', 'newtcbt_gem_file', 'newtcbt_gem_prompt', 'newtcbt_gem_job_id', 'newtcbt_gem_is_retry'],
            (res) => {
              const stage = res.newtcbt_alt_stage || res.newtcbt_gem_stage || 'text';
              const file = res.newtcbt_alt_file || res.newtcbt_gem_file || null;
              const prompt = res.newtcbt_alt_prompt || res.newtcbt_gem_prompt || '';
              const jobId = res.newtcbt_alt_job_id || res.newtcbt_gem_job_id;
              const isRetry = !!(res.newtcbt_alt_is_retry || res.newtcbt_gem_is_retry);
              if (jobId && jobId !== currentJobId) {
                executeAltStage(stage, file, prompt, jobId, isRetry);
              }
            }
          );
        }
      }
    });

    // Check storage on boot
    chrome.storage.local.get(
      ['newtcbt_alt_stage', 'newtcbt_alt_file', 'newtcbt_alt_prompt', 'newtcbt_alt_job_id', 'newtcbt_alt_timestamp', 'newtcbt_alt_is_retry',
       'newtcbt_gem_stage', 'newtcbt_gem_file', 'newtcbt_gem_prompt', 'newtcbt_gem_job_id', 'newtcbt_gem_timestamp', 'newtcbt_gem_is_retry'],
      (res) => {
        const jobId = res.newtcbt_alt_job_id || res.newtcbt_gem_job_id;
        const timestamp = res.newtcbt_alt_timestamp || res.newtcbt_gem_timestamp;
        if (jobId && timestamp && (Date.now() - timestamp < 300000)) {
          const stage = res.newtcbt_alt_stage || res.newtcbt_gem_stage || 'text';
          const file = res.newtcbt_alt_file || res.newtcbt_gem_file || null;
          const prompt = res.newtcbt_alt_prompt || res.newtcbt_gem_prompt || '';
          const isRetry = !!(res.newtcbt_alt_is_retry || res.newtcbt_gem_is_retry);
          executeAltStage(stage, file, prompt, jobId, isRetry);
        }
      }
    );
  }

})();
