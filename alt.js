/**
 * NewtCBT - Google AI Studio Scraper ("alt")
 * Automates Google AI Studio Playground (https://aistudio.google.com/prompts/new_chat)
 * for the Hybrid Exam Generation pipeline.
 */

(function () {
  // Only execute when embedded inside an iframe (e.g. NewtCBT drawer), never in standalone top-level tabs
  if (window.self === window.top) {
    return;
  }

  if (!window.location.hostname.includes('aistudio.google.com') || !window.location.pathname.startsWith('/prompts')) {
    return;
  }

  console.log('[NewtCBT:Alt] AI Studio scraper initialized in embedded drawer:', window.location.href);

  // ================================================================
  // 1. STATE & DEDUPLICATION
  // ================================================================

  let altProcessing = false;
  let currentJobId = null;
  let currentStage = null;
  let activeObserverInterval = null;
  const processedJobIds = new Set();

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
    return document.querySelector('input[type="file"][data-test-upload-file-input]') ||
           document.querySelector('ms-add-media-button input[type="file"]') ||
           document.querySelector('input[type="file"].file-input');
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
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (text.includes('stop') || ariaLabel.includes('stop') || btn.querySelector('.spin, [mattooltip*="Stop" i]')) {
        return true;
      }
    }
    return !!document.querySelector('.spin.material-symbols-outlined, ms-run-button .spin, ms-chat-turn .spin, ms-chat-turn .spinner');
  }


  function checkAttachmentSettled() {
    const chip = document.querySelector('div[data-test-id="prompt-media-container"], ms-prompt-media');
    if (!chip) return false;

    const statusEl = chip.querySelector('ms-token-status span[data-test-id="status"], [data-test-id="status"]');
    const statusText = (statusEl?.innerText || '').trim().toLowerCase();

    // While uploading, AI Studio displays "Loading..."
    if (statusText.includes('loading')) {
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
    textarea.value = text;
    // Dispatch Angular reactive form events
    textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }

  // ================================================================
  // 5. DIRECT DOM MARKDOWN EXTRACTION (ZERO-CLIPBOARD)
  // ================================================================

  function getModelTurns() {
    const turns = Array.from(document.querySelectorAll('ms-chat-turn'));
    return turns.filter(t => 
      t.querySelector('.chat-turn-container.model, [data-turn-role="Model"]') && 
      !t.classList.contains('thought-activity-host')
    );
  }

  function extractAiStudioMarkdown(minModelTurnCount = 0) {
    const modelTurns = getModelTurns();
    // Multi-turn safeguard: if waiting for a new turn, do not read previous turn
    if (minModelTurnCount > 0 && modelTurns.length < minModelTurnCount) {
      return null;
    }

    // Search model turns from the latest down to minModelTurnCount (or all turns if minModelTurnCount is 0)
    const startIndex = Math.max(0, minModelTurnCount > 0 ? minModelTurnCount - 1 : 0);
    const candidateTurns = modelTurns.length > 0 ? modelTurns.slice(startIndex).reverse() : [document.body];

    for (const turn of candidateTurns) {
      // 1. PRIMARY TARGET: Find code element strictly INSIDE ms-code-block of turn
      const msCodeBlocks = Array.from(turn.querySelectorAll('ms-code-block'));
      if (msCodeBlocks.length > 0) {
        let bestCode = '';
        for (const block of msCodeBlocks) {
          const codeEl = block.querySelector('pre code') || block.querySelector('code');
          if (!codeEl) continue;

          let text = (codeEl.innerText || codeEl.textContent || '').trim();
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
        let rawText = (cmarkEl.innerText || cmarkEl.textContent || '').trim();
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
      await awaitUploadSettlementAndRun(stage, textarea, currentJobId, initialModelTurns);
    } else {
      // Text-only turn
      setPromptValue(textarea, finalPrompt);
      await triggerRunAndObserve(stage, currentJobId, initialModelTurns);
    }
  }

  async function awaitUploadSettlementAndRun(stage, textarea, jobId, initialModelTurns = 0) {
    const startTime = Date.now();
    const timeoutMs = 60000;
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

      const progress = Math.min(30, Math.floor(15 + (elapsed / timeoutMs) * 15));
      notifyAltProgress(stage, isSettled ? 'ready' : 'uploading', 0, progress, jobId);

      // Verified ready: settled chip + enabled Run button + at least 1.5s elapsed
      if (elapsed >= 1500 && isSettled && isReady) {
        stableTicks++;
        if (stableTicks >= 2) {
          hasSent = true;
          clearInterval(interval);
          console.log(`[NewtCBT:Alt] Attachment settled and Run button enabled in ${elapsed}ms ✓`);
          clickRunAndObserve(stage, runBtn, jobId, initialModelTurns);
          return;
        }
      } else {
        stableTicks = 0;
      }

      if (elapsed >= timeoutMs) {
        if (!hasSent) {
          hasSent = true;
          clearInterval(interval);
          console.warn('[NewtCBT:Alt] Settlement timed out, attempting Run click anyway...');
          const btn = findRunButton();
          if (btn) clickRunAndObserve(stage, btn, jobId, initialModelTurns);
          else notifyAltError(stage, 'Run button not found after settlement timeout.', jobId);
        }
      }
    }, 250);
  }

  function clickRunAndObserve(stage, runBtn, jobId, initialModelTurns = 0) {
    notifyAltProgress(stage, 'submitting', 0, 35, jobId);
    console.log('[NewtCBT:Alt] Clicking Run button ✓');
    runBtn.click();

    const minModelTurns = initialModelTurns + 1;
    setTimeout(() => {
      observeAiStudioStreaming(stage, jobId, minModelTurns);
    }, 800);
  }

  async function triggerRunAndObserve(stage, jobId, initialModelTurns = 0) {
    await new Promise(r => setTimeout(r, 400));
    const runBtn = findRunButton();
    if (runBtn && !isRunButtonDisabled(runBtn)) {
      clickRunAndObserve(stage, runBtn, jobId, initialModelTurns);
    } else {
      setTimeout(() => {
        const btn = findRunButton();
        if (btn) clickRunAndObserve(stage, btn, jobId, initialModelTurns);
        else notifyAltError(stage, 'Could not trigger Run button.', jobId);
      }, 800);
    }
  }

  function observeAiStudioStreaming(stage, jobId, minModelTurnCount = 0) {
    console.log(`[NewtCBT:Alt] Observing streaming for ${stage} (jobId: ${jobId}, minModelTurns: ${minModelTurnCount})...`);

    if (activeObserverInterval) {
      clearInterval(activeObserverInterval);
      activeObserverInterval = null;
    }

    const startTime = Date.now();
    let stableTicks = 0;
    let lastLength = 0;
    let everGenerating = false;
    const isAnswerKey = (stage === 'sylvie' || stage === 'ans' || stage === 'key');
    const isDiaStage = (stage === 'dia' || stage === 'diagram' || stage === 'crop');
    const targetChars = isAnswerKey ? 2500 : isDiaStage ? 4000 : 25000;
    const minLength = isAnswerKey ? 40 : isDiaStage ? 25 : 120;
    const maxTimeoutMs = isAnswerKey ? 120000 : isDiaStage ? 180000 : 360000;

    const interval = setInterval(() => {
      const isGen = isGeneratingActive();
      if (isGen) {
        everGenerating = true;
      }

      const rawPayload = extractAiStudioMarkdown(minModelTurnCount) || '';
      const curLen = rawPayload.length;

      // Progress computation
      if (curLen > 0) {
        const pct = Math.min(95, Math.floor(35 + (curLen / targetChars) * 60));
        notifyAltProgress(stage, 'streaming', curLen, pct, jobId);
      }

      // Completion detection:
      // Once generation has run (or stopped) and length is sufficient
      if (everGenerating || curLen >= minLength) {
        if (!isGen && curLen >= minLength) {
          if (curLen === lastLength) {
            stableTicks++;
            if (stableTicks >= 3) { // Stable for 1.5 seconds after generation ends
              clearInterval(interval);
              activeObserverInterval = null;
              console.log(`[NewtCBT:Alt] Extraction complete for ${stage} (${curLen} chars) ✓`);
              notifyAltProgress(stage, 'complete', curLen, 100, jobId);
              notifyAltComplete(stage, rawPayload, jobId, true);
              altProcessing = false;
              return;
            }
          } else {
            stableTicks = 0;
            lastLength = curLen;
          }
        } else {
          stableTicks = 0;
          lastLength = curLen;
        }
      }

      // Safeguard timeout
      if (Date.now() - startTime > maxTimeoutMs) {
        clearInterval(interval);
        activeObserverInterval = null;
        if (curLen >= minLength) {
          console.warn(`[NewtCBT:Alt] Reached timeout but extracted partial payload (${curLen} chars).`);
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
      ['newtcbt_alt_stage', 'newtcbt_alt_file', 'newtcbt_alt_prompt', 'newtcbt_alt_job_id', 'newtcbt_alt_timestamp',
       'newtcbt_gem_stage', 'newtcbt_gem_file', 'newtcbt_gem_prompt', 'newtcbt_gem_job_id', 'newtcbt_gem_timestamp'],
      (res) => {
        const jobId = res.newtcbt_alt_job_id || res.newtcbt_gem_job_id;
        const timestamp = res.newtcbt_alt_timestamp || res.newtcbt_gem_timestamp;
        if (jobId && timestamp && (Date.now() - timestamp < 300000)) {
          const stage = res.newtcbt_alt_stage || res.newtcbt_gem_stage || 'text';
          const file = res.newtcbt_alt_file || res.newtcbt_gem_file || null;
          const prompt = res.newtcbt_alt_prompt || res.newtcbt_gem_prompt || '';
          executeAltStage(stage, file, prompt, jobId);
        }
      }
    );
  }

})();
