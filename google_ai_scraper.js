
(function() {
  const urlParams = new URLSearchParams(window.location.search);
  const isAIMode = urlParams.get('udm') === '50';
  if (!isAIMode) return;

  const isEmbed = window.self !== window.top;
  const isNewtEmbedded = isEmbed && (
    window.location.hash.includes('newtcbt') || 
    (document.referrer && (document.referrer.includes('newtcbt.in') || document.referrer.includes('localhost') || document.referrer.includes('127.0.0.1')))
  );
  const isNewtTopTab = !isEmbed && (
    window.location.hash.includes('newtcbt') || 
    window.location.search.includes('_s=') || 
    sessionStorage.getItem('newtcbt_companion_active') === 'true'
  );

  // Must be embedded in NewtCBT or launched by NewtCBT
  if (!isNewtEmbedded && !isNewtTopTab) {
    return;
  }

  if (isNewtTopTab) {
    try { sessionStorage.setItem('newtcbt_companion_active', 'true'); } catch (_) {}
  }

  console.log('[AI Scraper] Script loaded for Google AI Mode. URL:', window.location.href);

  let imagePasted = false;
  let imageUploadInProgress = false;
  let querySubmitted = false;
  let submissionStarted = false;

  function dataURLtoFile(dataurl, filename = 'question.png') {
    try {
      const arr = dataurl.split(',');
      const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/png';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], filename, { type: mime });
    } catch (e) {
      console.error('[AI Scraper] Failed to convert dataURL to File:', e);
      return null;
    }
  }

  function pasteImageToInput(inputEl, dataUrl) {
    const file = dataURLtoFile(dataUrl);
    if (!file) {
      console.error('[AI Scraper] Failed to convert dataUrl to File');
      return false;
    }

    inputEl.focus();
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      const pasteEvt = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: dt
      });
      inputEl.dispatchEvent(pasteEvt);
      if (inputEl.parentElement) {
        inputEl.parentElement.dispatchEvent(pasteEvt);
      }
      window.dispatchEvent(pasteEvt);
      console.log('[AI Scraper] Dispatched image paste event to Google AI ✓');
      return true;
    } catch (e) {
      console.error('[AI Scraper] Image paste failed:', e);
      return false;
    }
  }

  let submitInterval = null;
  let lastSubmissionPayload = { query: '', imageBase64: '', isEmbedMode: false };

  function findActiveGoogleAIInput() {
    const candidates = Array.from(document.querySelectorAll(
      'textarea.ITIRGe, textarea[placeholder*="Ask anything" i], textarea[aria-label*="Ask anything" i], [data-xid*="input"] textarea, [data-xid*="input"] input, .PMoW3b textarea, textarea[role="textbox"], textarea, input[placeholder*="Ask anything" i]'
    ));

    for (const el of candidates) {
      if (!el) continue;
      if (el.closest('.pHpOfb, .r1PmQe, [data-scope-id="turn"]')) continue;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (
        rect.width > 80 &&
        rect.height > 15 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
      ) {
        return el;
      }
    }
    return null;
  }

  function isInputInteractive(inputEl) {
    if (!inputEl) return false;
    inputEl.focus();
    const isFocused = document.activeElement === inputEl;
    const isDocReady = document.readyState === 'interactive' || document.readyState === 'complete';
    return isFocused && isDocReady && !inputEl.disabled;
  }

  function waitForGoogleAIUpload(inputEl, imageBase64, callback) {
    const startTime = Date.now();
    let circleSeen = false;

    const interval = setInterval(() => {
      const inputPlate = inputEl.closest('div[data-xid*="input-plate"], form, .WvcQpb, .VdsLEf, .UAbVe') || inputEl.parentElement?.parentElement || document;
      const circleEl = inputPlate.querySelector('svg circle, circle');
      
      const isCircleVisible = circleEl && circleEl.getBoundingClientRect().width > 0;
      const elapsed = Date.now() - startTime;

      if (isCircleVisible) {
        circleSeen = true;
      }

      // Circle was seen and is now hidden/gone
      if (circleSeen && !isCircleVisible) {
        clearInterval(interval);
        console.log('[AI Scraper] Circle hidden! Triggering send now ✓ (elapsed:', elapsed, 'ms)');
        callback();
        return;
      }

      // Thumbnail preview is mounted and no circle is visible after 600ms
      const preview = document.querySelector(
        'img[src^="blob:"], [aria-label*="attachment" i], [aria-label*="image" i], div[data-xid] img, .AypGw, [aria-label*="Remove" i], [data-xid*="input-plate"] img'
      );
      if (preview && !isCircleVisible && elapsed > 600) {
        clearInterval(interval);
        console.log('[AI Scraper] Upload settled & circle gone! Triggering send now ✓');
        callback();
        return;
      }

      // Fallback timeout after 4 seconds
      if (elapsed > 4000) {
        clearInterval(interval);
        console.log('[AI Scraper] Upload wait timeout fallback! Triggering send now');
        callback();
      }
    }, 50);
  }

  function insertPromptText(inputEl, query) {
    console.log('[AI Scraper] Inserting prompt into Google AI input immediately…');
    inputEl.focus();
    const text = query || "Solve this exam question step-by-step.";
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set ||
                         Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(inputEl, text);
    } else {
      inputEl.value = text;
    }
    inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function triggerSend(inputEl) {
    console.log('[AI Scraper] Triggering Google AI send…');
    inputEl.focus();

    const sendBtn =
      document.querySelector('button[data-xid="input-plate-send-button"]') ||
      document.querySelector('button[aria-label="Send"]') ||
      document.querySelector('button.OEueve') ||
      document.querySelector('div.plllbd') ||
      document.querySelector('.plllbd') ||
      document.querySelector('button[aria-label*="Submit" i]');

    if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
      console.log('[AI Scraper] Clicking Google AI Send button ✓');
      sendBtn.click();
    } else {
      console.log('[AI Scraper] Dispatching Enter key fallback to input…');
      inputEl.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
      }));
    }

    querySubmitted = true;
    chrome.storage.local.remove(['newtcbt_google_ai_query', 'newtcbt_google_ai_image', 'newtcbt_google_ai_embed', 'newtcbt_google_ai_timestamp']);
  }

  function startGoogleAISubmission(query, imageBase64, isEmbedMode) {
    if (submitInterval) {
      clearInterval(submitInterval);
      submitInterval = null;
    }
    lastSubmissionPayload = { query, imageBase64, isEmbedMode };
    submissionStarted = true;
    querySubmitted = false;
    imagePasted = false;
    imageUploadInProgress = false;

    console.log('[AI Scraper] Starting Google AI submission. Image:', !!imageBase64, 'Embed:', isEmbedMode);

    submitInterval = setInterval(() => {
      if (querySubmitted) {
        clearInterval(submitInterval);
        submitInterval = null;
        return;
      }

      const inputEl = findActiveGoogleAIInput();
      if (!inputEl) return;

      // Confirmed interactive check
      if (!isInputInteractive(inputEl)) return;

      clearInterval(submitInterval);
      submitInterval = null;

      if (imageBase64 && !imagePasted) {
        imagePasted = true;
        imageUploadInProgress = true;
        pasteImageToInput(inputEl, imageBase64);

        // Immediately insert the prompt into the textarea without waiting for upload
        setTimeout(() => {
          insertPromptText(inputEl, query);
        }, 60);

        // Wait for upload circle to finish, then send immediately
        waitForGoogleAIUpload(inputEl, imageBase64, () => {
          imageUploadInProgress = false;
          triggerSend(inputEl);
        });
      } else if (!imageBase64) {
        insertPromptText(inputEl, query);
        setTimeout(() => triggerSend(inputEl), 100);
      }
    }, 150);
  }

  function checkStorageAndRun() {
    chrome.storage.local.get(['newtcbt_google_ai_query', 'newtcbt_google_ai_image', 'newtcbt_google_ai_embed', 'newtcbt_google_ai_timestamp'], function (result) {
      // 60-second TTL freshness check to prevent executing abandoned/stale queries
      const timestamp = result.newtcbt_google_ai_timestamp;
      if (timestamp && (Date.now() - timestamp > 60000)) {
        console.log('[AI Scraper] Discarding stale Google AI query (TTL > 60s)');
        chrome.storage.local.remove(['newtcbt_google_ai_query', 'newtcbt_google_ai_image', 'newtcbt_google_ai_embed', 'newtcbt_google_ai_timestamp']);
        return;
      }

      const query = result.newtcbt_google_ai_query || '';
      const imageBase64 = result.newtcbt_google_ai_image || null;
      const isEmbedMode = window.self !== window.top || !!result.newtcbt_google_ai_embed;

      if (!query && !imageBase64) {
        return;
      }

      startGoogleAISubmission(query, imageBase64, isEmbedMode);
    });
  }

  // 1. Initial check
  checkStorageAndRun();

  // 2. Storage listener
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      const hasNewQuery = changes.newtcbt_google_ai_query && typeof changes.newtcbt_google_ai_query.newValue === 'string';
      const hasNewImage = changes.newtcbt_google_ai_image && typeof changes.newtcbt_google_ai_image.newValue === 'string';
      const hasNewTimestamp = !!changes.newtcbt_google_ai_timestamp;
      if (hasNewQuery || hasNewImage || hasNewTimestamp) {
        submissionStarted = false;
        querySubmitted = false;
        imagePasted = false;
        imageUploadInProgress = false;
        checkStorageAndRun();
      }
    }
  });

  // 3. Extract solution helper (VERIFIED DOM: div.r1PmQe pre code / div.Zkbeff)
  function extractCleanGoogleAISolution(onlyCodeBlock = false) {
    // 1. Check for verified Google AI Mode code block elements (div.pHpOfb pre code / div.r1PmQe pre code)
    const codeBlocks = Array.from(document.querySelectorAll(
      'div.pHpOfb pre code, div.pHpOfb pre, .pHpOfb pre code, .pHpOfb pre, div.pHpOfb, div.r1PmQe pre code, div.r1PmQe pre, div.r1PmQe, [jscontroller*="HP6Sjf"] pre code, pre code, pre'
    ));
    const validBlocks = codeBlocks.filter(el => {
      // Must not be inside input plate or textarea
      if (el.closest('form, [data-xid*="input-plate"], textarea, .ITIRGe, input-plate, .PMoW3b')) return false;
      const txt = el.innerText ? el.innerText.trim() : '';
      return txt.length > 20 && !txt.includes('Transcribing...') && !txt.includes('Add files, tools') && !txt.includes('MicrophoneStop');
    });

    if (validBlocks.length > 0) {
      const lastBlock = validBlocks[validBlocks.length - 1];
      // Target the pre/code directly for 100% clean code text without headers
      const targetCode = lastBlock.querySelector('pre code, pre, code') || lastBlock;
      let clean = targetCode.innerText.replace(/Use code with caution\./gi, '').trim();

      // Clean outer ```markdown ... ``` fences if returned literally
      if (clean.startsWith('```markdown')) {
        clean = clean.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '');
      } else if (clean.startsWith('```')) {
        clean = clean.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      return clean.trim();
    }

    if (onlyCodeBlock) return null;

    // 2. If no code block, extract from verified turn container (div.Zkbeff, div.mZJni[data-container-id="main-col"])
    const turnContainers = Array.from(document.querySelectorAll('div.Zkbeff, div.mZJni[data-container-id="main-col"], div.CKgc1d[data-scope-id="turn"]'));
    let bestContainer = null;
    for (let i = turnContainers.length - 1; i >= 0; i--) {
      const el = turnContainers[i];
      if (el.closest('[data-xid*="input-plate"], form, textarea, input-plate, .PMoW3b')) continue;
      const txt = el.innerText ? el.innerText.trim() : '';
      if (txt.length > 40 && !txt.includes('Transcribing...') && !txt.includes('Add files, tools')) {
        bestContainer = el;
        break;
      }
    }

    if (!bestContainer) return null;

    // Clone element to safely remove all buttons, headings, and toolbar noise
    const clone = bestContainer.cloneNode(true);
    clone.querySelectorAll('button, [role="button"], form, input, textarea, svg, [data-xid*="input-plate"], .PMoW3b, h3.MheKwc, .P8PNlb').forEach(n => n.remove());

    let clean = clone.innerText || '';
    clean = clean.replace(/Generative AI is experimental\./gi, '').replace(/Use code with caution\./gi, '').trim();

    // Clean outer ```markdown ... ``` fences if returned literally
    if (clean.startsWith('```markdown')) {
      clean = clean.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    // Strip conversation transcript header / user echo from Google AI
    clean = clean.replace(/^(?:conversation:.*?\n|You sent:.*?\n|and said:.*?\n|Solve this exam question[^\n]*\n*)+/gi, '').trim();
    clean = clean.replace(/^conversation:\s*/gi, '').trim();
    clean = clean.replace(/^You sent:[\s\S]*?and said:[\s\S]*?Solve this exam question step-by-step\.?\s*/gi, '').trim();
    clean = clean.replace(/^(?:Solve this exam question step-by-step\.?\s*)+/gi, '').trim();
    clean = clean.replace(/^Give this solution as it is in a single copyable markdown[\s\S]*?\n*/gi, '').trim();
    clean = clean.replace(/Transcribing\.\.\.[\s\S]*$/gi, '').trim();

    const removePatterns = [
      /^AI Mode\s*/gi,
      /^AI Overview\s*/gi,
      /^Markdown\s*\n/gi,
      /\nShare\s*$/gi,
      /\nFeedback\s*$/gi,
      /\nShow more\s*$/gi,
      /If you'd like.*$/gis,
      /Let me know.*$/gis,
      /\[\d+\]/g,
      /\[\]\(.*?\)/g
    ];
    for (const pattern of removePatterns) {
      clean = clean.replace(pattern, '');
    }
    return clean.replace(/\n{3,}/g, '\n\n').trim();
  }

  // 4. Follow-up formatting prompt and response extractor for "Add Soln to NewtCBT"
  async function handleExtractSolutionRequest(sendResponse) {
    // Always submit the formatting prompt to generate a fresh, pristine markdown codeblock for the current question
    console.log('[AI Scraper] Submitting formatting prompt to Google AI…');
    const formattingPrompt = "Give this solution as it is in a single copyable markdown code block (```markdown ... ```) preserving all $ and $$ LaTeX math delimiters.";

    const textarea =
      document.querySelector('textarea.ITIRGe') ||
      document.querySelector('textarea[placeholder*="Ask anything" i]') ||
      document.querySelector('textarea[role="textbox"]') ||
      document.querySelector('textarea');

    if (!textarea) {
      const fallbackSoln = extractCleanGoogleAISolution(true) || extractCleanGoogleAISolution(false);
      if (fallbackSoln) {
        sendResponse({ success: true, text: fallbackSoln });
      } else {
        sendResponse({ success: false, error: 'Google AI input textarea not found.' });
      }
      return;
    }

    const initialLastText = extractCleanGoogleAISolution(false) || '';

    textarea.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(textarea, formattingPrompt);
    } else {
      textarea.value = formattingPrompt;
    }
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(r => setTimeout(r, 400));
    const sendBtn =
      document.querySelector('button[data-xid="input-plate-send-button"]') ||
      document.querySelector('button[aria-label="Send"]') ||
      document.querySelector('button.OEueve') ||
      document.querySelector('div.plllbd') ||
      document.querySelector('.plllbd') ||
      document.querySelector('button[aria-label*="Submit" i]');

    if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
      sendBtn.click();
    } else {
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
      }));
    }

    // Poll for updated codeblock response
    const startTime = Date.now();
    let stableCount = 0;
    let lastText = '';
    let generationObserved = false;

    const pollInterval = setInterval(() => {
      const codeBlockText = extractCleanGoogleAISolution(true);
      const currentText = codeBlockText || extractCleanGoogleAISolution(false);
      const spinner = document.querySelector('mat-spinner, .mat-mdc-progress-spinner, [aria-label*="Loading" i], [role="progressbar"]');
      const isSpinning = spinner && spinner.offsetParent !== null;

      if (isSpinning) {
        generationObserved = true;
      }

      const isSameAsOld = (currentText === initialLastText) && !generationObserved;

      if (!currentText || isSpinning || isSameAsOld) {
        stableCount = 0;
        lastText = currentText || '';
      } else if (currentText === lastText && currentText.length > 20) {
        stableCount++;
        const requiredTicks = codeBlockText ? 2 : 3;
        if (stableCount >= requiredTicks) {
          clearInterval(pollInterval);
          console.log('[AI Scraper] Google AI formatted solution extracted ✓');
          sendResponse({ success: true, text: currentText });
        }
      } else {
        lastText = currentText;
        stableCount = 0;
      }

      if (Date.now() - startTime > 45000) {
        clearInterval(pollInterval);
        if (lastText && lastText.length > 20) {
          sendResponse({ success: true, text: lastText });
        } else {
          sendResponse({ success: false, error: 'Timed out waiting for formatted response from Google AI.' });
        }
      }
    }, 1000);
  }

  // 5. Message listener from NewtCBT and Companion Sidebar
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'EXTRACT_SOLN_NOW') {
      handleExtractSolutionRequest(sendResponse);
      return true; // Keep message channel open for async response
    }
    if (msg.type === 'RETRY_SUBMISSION') {
      console.log('[AI Scraper] Received manual RETRY_SUBMISSION request');
      chrome.storage.local.get(['newtcbt_google_ai_query', 'newtcbt_google_ai_image', 'newtcbt_google_ai_embed'], function (res) {
        const q = res.newtcbt_google_ai_query || lastSubmissionPayload.query || 'Solve this exam question step-by-step.';
        const img = res.newtcbt_google_ai_image || lastSubmissionPayload.imageBase64 || null;
        const isEmbed = res.newtcbt_google_ai_embed || lastSubmissionPayload.isEmbedMode || false;
        querySubmitted = false;
        submissionStarted = false;
        imagePasted = false;
        imageUploadInProgress = false;
        startGoogleAISubmission(q, img, isEmbed);
        sendResponse({ success: true });
      });
      return true;
    }
  });

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'NEWTCBT_RETRY_SUBMISSION') {
      console.log('[AI Scraper] Received window NEWTCBT_RETRY_SUBMISSION');
      chrome.storage.local.get(['newtcbt_google_ai_query', 'newtcbt_google_ai_image', 'newtcbt_google_ai_embed'], function (res) {
        const q = res.newtcbt_google_ai_query || lastSubmissionPayload.query || 'Solve this exam question step-by-step.';
        const img = res.newtcbt_google_ai_image || lastSubmissionPayload.imageBase64 || null;
        const isEmbed = res.newtcbt_google_ai_embed || lastSubmissionPayload.isEmbedMode || false;
        querySubmitted = false;
        submissionStarted = false;
        imagePasted = false;
        imageUploadInProgress = false;
        startGoogleAISubmission(q, img, isEmbed);
      });
    }
  });

})();
