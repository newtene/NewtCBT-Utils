
(function () {

  // Only run on the main Gemini /app or root, ignore telemetry / internal iframes
  if (!window.location.hostname.includes('gemini.google.com') || 
      (!window.location.pathname.startsWith('/app') && window.location.pathname !== '/')) {
    return;
  }

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

  // If not embedded in NewtCBT and not launched by NewtCBT, exit immediately
  if (!isNewtEmbedded && !isNewtTopTab) {
    return;
  }

  if (isNewtTopTab) {
    try { sessionStorage.setItem('newtcbt_companion_active', 'true'); } catch (_) {}
  }

  console.log('[GeminiScraper] Initialized on Gemini app:', window.location.href);

  let querySubmitted    = false;
  let submissionStarted = false;
  let tempChatClicked   = false;
  let tempChatAttempts  = 0;
  const MAX_TEMP_ATTEMPTS = 5;

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
      return new File([u8arr], filename, { type: mime, lastModified: Date.now() });
    } catch (e) {
      console.error('[GeminiScraper] dataURLtoFile failed:', e);
      return null;
    }
  }

  function isTempChatActive() {
    const text = document.body.textContent || '';
    if (text.includes('Welcome, stranger') || 
        text.includes("Chats won't appear in Recent") ||
        text.includes('Temporary chat is on') ||
        text.includes('Temporary chat on')) {
      return true;
    }

    const turnOffBtn = Array.from(document.querySelectorAll('button, [role="button"], a'))
      .find(el => (el.textContent || '').toLowerCase().includes('turn off temporary') ||
                  (el.getAttribute('aria-label') || '').toLowerCase().includes('turn off temporary'));
    if (turnOffBtn) return true;

    const btn = document.querySelector(
      'temp-chat-button button, [data-test-id="temp-chat-button"] button, gem-icon-button[arialabel="Temporary chat"] button, [data-test-id="temp-chat-button"], button.temp-chat-button'
    );
    if (btn) {
      if (
        btn.getAttribute('aria-pressed') === 'true' ||
        btn.getAttribute('aria-checked') === 'true' ||
        btn.classList.contains('active') ||
        btn.classList.contains('selected') ||
        (btn.getAttribute('aria-label') || '').toLowerCase().includes('turn off')
      ) {
        return true;
      }
    }

    return false;
  }

  function handleTempChatState() {
    if (tempChatClicked || isTempChatActive()) return true;

    if (tempChatAttempts >= MAX_TEMP_ATTEMPTS) {
      return true;
    }
    tempChatAttempts++;

    const tempChatSelectors = [
      '[data-test-id="temp-chat-button"]',
      'temp-chat-button',
      'button[aria-label*="temporary chat" i]',
      'button[aria-label*="incognito" i]',
      'button.temp-chat-button',
      'button[mattooltip*="temporary" i]'
    ];

    let foundBtn = null;
    for (const sel of tempChatSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        foundBtn = el;
        break;
      }
    }

    if (foundBtn) {
      console.log('[GeminiScraper] Clicking Temporary Chat button…');
      foundBtn.click();
      tempChatClicked = true;
      return true;
    }
    return true;
  }

  function insertTextIntoGeminiEditor(editor, text) {
    editor.focus();
    const p = editor.querySelector('p') || editor;
    p.innerText = text;
    editor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function getGeminiInputArea() {
    return (
      document.querySelector('input-area, rich-textarea, .input-area-container, [data-test-id="input-area"]') ||
      document.querySelector('form') ||
      null
    );
  }

  function hasGeminiImageAttachment() {
    const inputArea = getGeminiInputArea();
    if (!inputArea) return false;

    // 1. Check for real blob/media images inside the input area
    const imgs = Array.from(inputArea.querySelectorAll('img')).filter(img => {
      const src = img.src || '';
      const isBlob = src.startsWith('blob:') || src.startsWith('data:image/');
      const isGoogleMedia = src.includes('googleusercontent.com') && !src.includes('avatar') && !src.includes('photo');
      const rect = img.getBoundingClientRect();
      return (isBlob || isGoogleMedia) && rect.width > 15 && rect.height > 15;
    });
    if (imgs.length > 0) return true;

    // 2. Check for remove attachment button inside inputArea
    const removeBtn = inputArea.querySelector(
      'button[aria-label*="Remove file" i], button[aria-label*="Remove attachment" i], button[aria-label*="Remove image" i], button[aria-label*="Delete" i], [data-test-id*="remove-attachment"], [data-test-id*="remove-file"]'
    );
    if (removeBtn && removeBtn.getBoundingClientRect().width > 0) return true;

    // 3. Check for specific file chip or preview container inside inputArea with an img
    const previewChip = inputArea.querySelector(
      'uploader-file-preview-container img, .uploader-file-preview img, file-chip img, thumbnail-chip img, img.gem-attachment-style-img'
    );
    if (previewChip && previewChip.getBoundingClientRect().width > 15) return true;

    return false;
  }

  async function pasteImageIntoGeminiEditor(editor, file) {
    editor.focus();
    const dt = new DataTransfer();
    dt.items.add(file);

    if (hasGeminiImageAttachment()) return true;

    // --- Format 1: Synthetic ClipboardEvent Paste (Instant in Chrome) ---
    console.log('[GeminiScraper] Trying Format 1: ClipboardEvent Paste…');
    try {
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: dt
      });
      editor.dispatchEvent(pasteEvent);
    } catch (_) {}

    await new Promise(r => setTimeout(r, 250));
    if (hasGeminiImageAttachment()) {
      console.log('[GeminiScraper] Format 1 (Paste) succeeded ✓');
      editor.focus();
      return true;
    }

    // --- Format 2: File Input Injection via '+' button (Known to work in Firefox/Zen) ---
    console.log('[GeminiScraper] Format 1 did not attach. Trying Format 2 (File Input)…');
    let fileInput = document.querySelector('input[type="file"], input.hidden-file-input');
    if (!fileInput) {
      const inputArea = getGeminiInputArea() || document;
      const buttons = Array.from(inputArea.querySelectorAll('button, [role="button"]'));
      const uploadBtn = buttons.find(b => {
        const label = (b.getAttribute('aria-label') || '').toLowerCase();
        const tooltip = (b.getAttribute('mattooltip') || '').toLowerCase();
        const icon = (b.querySelector('mat-icon, [fonticon]')?.textContent || '').toLowerCase();
        return (
          label.includes('upload') ||
          label.includes('tools') ||
          label.includes('add') ||
          label.includes('attach') ||
          tooltip.includes('upload') ||
          tooltip.includes('tools') ||
          tooltip.includes('add') ||
          icon.includes('add') ||
          icon.includes('attach')
        );
      }) || document.querySelector(
        'button[aria-label*="Upload and tools" i], button[aria-label*="Upload" i], button[aria-label*="Add" i], button[mattooltip*="Upload" i], [data-test-id*="upload"], button.upload-button'
      );

      if (uploadBtn) {
        console.log('[GeminiScraper] Clicking Upload (+) button to mount file input…', uploadBtn);
        uploadBtn.click();
        await new Promise(r => setTimeout(r, 250));
        fileInput = document.querySelector('input[type="file"], input.hidden-file-input');
      }
    }

    if (fileInput) {
      try {
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('[GeminiScraper] Injected file into Gemini fileInput ✓');
      } catch (err) {
        console.warn('[GeminiScraper] fileInput injection error:', err);
      }
    }

    await new Promise(r => setTimeout(r, 350));
    if (hasGeminiImageAttachment()) {
      console.log('[GeminiScraper] Format 2 (File Input) succeeded ✓');
      editor.focus();
      return true;
    }

    // --- Format 3: Drag & Drop onto Editor & Input Area ---
    console.log('[GeminiScraper] Format 2 did not attach. Trying Format 3 (Drag & Drop)…');
    try {
      const targets = [editor, editor.closest('rich-textarea'), editor.closest('input-area')].filter(Boolean);
      ['dragenter', 'dragover', 'drop'].forEach(type => {
        const dropEvt = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          dataTransfer: dt
        });
        targets.forEach(t => t.dispatchEvent(dropEvt));
      });
    } catch (_) {}

    await new Promise(r => setTimeout(r, 250));
    editor.focus();
    return hasGeminiImageAttachment();
  }

  async function handleGeminiSubmission(editor, text, imageBase64, isEmbedMode) {
    if (submissionStarted) return;
    submissionStarted = true;

    editor.focus();

    if (imageBase64) {
      const file = dataURLtoFile(imageBase64, 'question.png');
      if (file) {
        await pasteImageIntoGeminiEditor(editor, file);
        console.log('[GeminiScraper] Dispatched image attach to Gemini ✓');

        // 2. Wait for image upload / attachment preview to settle
        const startUpload = Date.now();
        const checkUpload = setInterval(() => {
          const hasAttachment = hasGeminiImageAttachment();

          let isLoading = false;
          const inputArea = getGeminiInputArea();
          if (inputArea) {
            const spinner = inputArea.querySelector(
              'svg circle, .gem-attachment-loading-container, [aria-label*="Loading image" i], mat-progress-spinner, .mat-mdc-progress-spinner, [role="progressbar"], .loading'
            );
            if (spinner && (spinner.offsetParent !== null || spinner.getBoundingClientRect().width > 0)) {
              isLoading = true;
            }
          }

          const elapsed = Date.now() - startUpload;

          // When attachment is confirmed and upload spinner settled (or 6s max wait)
          if ((hasAttachment && !isLoading) || elapsed > 6000) {
            clearInterval(checkUpload);
            console.log('[GeminiScraper] Gemini image upload confirmed ✓ (elapsed:', elapsed, 'ms). Inserting text prompt…');

            // 3. Insert text prompt AFTER image upload
            insertTextIntoGeminiEditor(editor, text);

            // 4. Send message
            setTimeout(() => {
              const sendBtn = document.querySelector(
                'button[aria-label="Send message"], button[data-test-id="send-button"], button[aria-label*="Send" i]'
              );
              if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
                console.log('[GeminiScraper] Clicking Send message button with image ✓');
                sendBtn.click();
              } else {
                editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              }
              chrome.storage.local.remove(['newtcbt_gemini_query', 'newtcbt_gemini_grounding', 'newtcbt_gemini_image', 'newtcbt_gemini_embed', 'newtcbt_gemini_timestamp']);
              querySubmitted = true;
            }, 300);
          }
        }, 150);
        return;
      }
    }

    // Text only fallback
    insertTextIntoGeminiEditor(editor, text);

    setTimeout(() => {
      const sendBtn = document.querySelector(
        'button[aria-label="Send message"], button[data-test-id="send-button"], button[aria-label*="Send" i]'
      );
      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
        sendBtn.click();
      } else {
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      }
      chrome.storage.local.remove(['newtcbt_gemini_query', 'newtcbt_gemini_grounding', 'newtcbt_gemini_image', 'newtcbt_gemini_embed', 'newtcbt_gemini_timestamp']);
      querySubmitted = true;
    }, 500);
  }

  function isGeminiHeaderStable() {
    // 1. Check for the Model Picker ("Gemini Flash", "Gemini Advanced", etc.)
    const modelPicker = 
      document.querySelector('[data-test-id*="model-picker"]') ||
      document.querySelector('button[aria-label*="model" i]') ||
      document.querySelector('button[aria-label*="Select model" i]') ||
      document.querySelector('.model-picker-button') ||
      Array.from(document.querySelectorAll('button, [role="button"], span, div')).find(el => {
        const text = (el.textContent || '').trim();
        return text.startsWith('Gemini Flash') || text.startsWith('Gemini Advanced') || text.startsWith('Gemini Pro');
      });

    // 2. Check for the main hamburger / side-nav menu button
    const sideNavBtn = 
      document.querySelector('button[aria-label*="Main menu" i]') ||
      document.querySelector('button[aria-label*="Navigation menu" i]') ||
      document.querySelector('button[aria-label*="menu" i]') ||
      document.querySelector('[data-test-id="side-nav-menu-button"]') ||
      document.querySelector('mat-icon[fonticon="menu"]');

    return !!(modelPicker || sideNavBtn);
  }

  let geminiSubmitInterval = null;

  function startSubmission(query, imageBase64, isEmbedMode, isGrounding) {
    if (geminiSubmitInterval) {
      clearInterval(geminiSubmitInterval);
      geminiSubmitInterval = null;
    }
    submissionStarted = false;
    querySubmitted = false;

    if (isGrounding) {
      query = "Please perform a WEB SEARCH to find the most accurate and up-to-date information before answering.\n\n" + (query || '');
    }

    console.log('[GeminiScraper] Starting query submission. Has image:', !!imageBase64, 'Embed:', isEmbedMode);

    geminiSubmitInterval = setInterval(() => {
      if (querySubmitted || submissionStarted) {
        clearInterval(geminiSubmitInterval);
        geminiSubmitInterval = null;
        return;
      }

      // 1. Dismiss any "Not now" prompts if present
      const notNowBtn = Array.from(
        document.querySelectorAll('button, [role="button"]')
      ).find(el => el.textContent.trim().toLowerCase() === 'not now');

      if (notNowBtn) {
        notNowBtn.click();
        return;
      }

      // 2. Ensure Gemini top header (Gemini Flash / Hamburger) is mounted and stable
      const isHeaderReady = isGeminiHeaderStable();
      if (!isHeaderReady) {
        console.log('[GeminiScraper] Waiting for Gemini top header (Gemini Flash / Menu) to mount…');
        return;
      }

      handleTempChatState();

      // 3. Find Quill editor inside input area
      const richTextBox =
        document.querySelector('div.ql-editor[contenteditable="true"]') ||
        document.querySelector('rich-textarea [contenteditable="true"]') ||
        document.querySelector('[contenteditable="true"][role="textbox"]') ||
        document.querySelector('div[data-placeholder*="Ask Gemini" i][contenteditable="true"]') ||
        document.querySelector('textarea') ||
        document.querySelector('[contenteditable="true"]');

      if (!richTextBox) {
        console.log('[GeminiScraper] Waiting for rich-textarea input box…');
        return;
      }

      const promptText = query || "Solve this exam question step-by-step.";
      // Allow brief 300ms settling for Quill listeners to attach
      setTimeout(() => {
        handleGeminiSubmission(richTextBox, promptText, imageBase64, isEmbedMode);
      }, 300);
    }, 400);
  }

  function checkStorageAndRun() {
    chrome.storage.local.get(['newtcbt_gemini_query', 'newtcbt_gemini_grounding', 'newtcbt_gemini_image', 'newtcbt_gemini_embed', 'newtcbt_gemini_timestamp'], function (result) {
      // 60-second TTL freshness check to prevent executing abandoned/stale queries
      const timestamp = result.newtcbt_gemini_timestamp;
      if (timestamp && (Date.now() - timestamp > 60000)) {
        console.log('[GeminiScraper] Discarding stale Gemini query (TTL > 60s)');
        chrome.storage.local.remove(['newtcbt_gemini_query', 'newtcbt_gemini_grounding', 'newtcbt_gemini_image', 'newtcbt_gemini_embed', 'newtcbt_gemini_timestamp']);
        return;
      }

      const query = result.newtcbt_gemini_query || '';
      const imageBase64 = result.newtcbt_gemini_image || null;
      const isEmbedMode = window.self !== window.top || !!result.newtcbt_gemini_embed;

      if (!query && !imageBase64) {
        return;
      }

      startSubmission(query, imageBase64, isEmbedMode, result.newtcbt_gemini_grounding);
    });
  }

  // 1. Initial check
  checkStorageAndRun();

  // 2. Storage listener
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      const hasNewQuery = changes.newtcbt_gemini_query && typeof changes.newtcbt_gemini_query.newValue === 'string';
      const hasNewImage = changes.newtcbt_gemini_image && typeof changes.newtcbt_gemini_image.newValue === 'string';
      const hasNewTimestamp = !!changes.newtcbt_gemini_timestamp;
      if (hasNewQuery || hasNewImage || hasNewTimestamp) {
        submissionStarted = false;
        querySubmitted = false;
        checkStorageAndRun();
      }
    }
  });

  // 3. Extract solution helper (targets LATEST model response code block)
  function extractCleanGeminiSolution(onlyCodeBlock = false) {
    const modelResponses = Array.from(document.querySelectorAll('model-response'));
    if (modelResponses.length === 0) return null;

    const lastMessage = modelResponses[modelResponses.length - 1];
    const codeElements = Array.from(lastMessage.querySelectorAll('code-block code[data-test-id="code-content"], code-block pre code, code-block pre, code-block'));
    const validCodes = codeElements.filter(el => {
      const text = el.innerText ? el.innerText.trim() : '';
      return text.length > 20 && !el.closest('rich-textarea, input-area, form');
    });

    if (validCodes.length > 0) {
      const codeElement = validCodes[validCodes.length - 1]; // Pick the latest code block
      const targetCode = codeElement.querySelector('code[data-test-id="code-content"], pre code') || codeElement;
      let rawText = targetCode.innerText.replace(/Use code with caution\./gi, '').trim();
      if (rawText.startsWith('```markdown')) {
        rawText = rawText.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '');
      } else if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      return rawText.trim();
    }

    if (onlyCodeBlock) return null;

    const markdownPanel = lastMessage.querySelector('div.markdown.markdown-main-panel, div.markdown, structured-content-container, response-element');
    if (!markdownPanel) return null;

    const clone = markdownPanel.cloneNode(true);
    clone.querySelectorAll('button, [role="button"], mat-icon, gem-icon, .button-container, .tool-call-container').forEach(n => n.remove());

    let currentText = (clone.innerText || '').replace(/Use code with caution\./gi, '').trim();

    // Clean outer ```markdown ... ``` fences if returned literally
    if (currentText.startsWith('```markdown')) {
      currentText = currentText.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '');
    } else if (currentText.startsWith('```')) {
      currentText = currentText.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    if (currentText.length < 10) return null;

    const removePatterns = [
      /^AI Mode\s*/gi,
      /^Markdown\s*\n/gi,
      /^All\s+Images\s+Videos\s+News\s+More.*?\n/gi,
      /\nShare\s*\n?Export\s*\n?More\s*$/gi,
      /\nFeedback\s*$/gi,
      /\nShow more\s*$/gi,
      /If you'd like.*$/gis,
      /Let me know.*$/gis,
      /\[\d+\]/g,
      /\[\]\(.*?\)/g,
      /Show code/gi,
      /show_code/gi
    ];
    for (const pattern of removePatterns) {
      currentText = currentText.replace(pattern, '');
    }

    return currentText.replace(/\n{3,}/g, '\n\n').trim();
  }

  // 4. Follow-up formatting prompt and response extractor for "Add Soln to NewtCBT"
  async function handleExtractSolutionRequest(sendResponse) {
    // Always submit the formatting prompt to generate a fresh, pristine markdown codeblock for the current question
    console.log('[GeminiScraper] Submitting formatting prompt to Gemini…');
    const formattingPrompt = "Give this solution as it is in a single copyable markdown code block (```markdown ... ```) preserving all $ and $$ LaTeX math delimiters.";

    const editor =
      document.querySelector('div.ql-editor[contenteditable="true"]') ||
      document.querySelector('rich-textarea [contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"][role="textbox"]');

    if (!editor) {
      // If editor not found, fallback to extracting whatever is on screen
      const fallbackSoln = extractCleanGeminiSolution(true) || extractCleanGeminiSolution(false);
      if (fallbackSoln) {
        sendResponse({ success: true, text: fallbackSoln });
      } else {
        sendResponse({ success: false, error: 'Gemini editor not found.' });
      }
      return;
    }

    const initialModelResponsesCount = document.querySelectorAll('model-response').length;
    const initialLastText = extractCleanGeminiSolution(false) || '';

    insertTextIntoGeminiEditor(editor, formattingPrompt);

    await new Promise(r => setTimeout(r, 400));
    const sendBtn = document.querySelector(
      'button[aria-label="Send message"], button[data-test-id="send-button"], button[aria-label*="Send" i]'
    );
    if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
      sendBtn.click();
    } else {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }

    // Poll and wait for the new formatting response to complete
    const startTime = Date.now();
    let stableCount = 0;
    let lastText = '';
    let generationObserved = false;

    const pollInterval = setInterval(() => {
      const isGenerating = !!document.querySelector(
        'button[aria-label="Stop response"], button[aria-label*="Stop responding" i], button[aria-label*="Stop" i], button[data-test-id="stop-button"], .generating-indicator, [aria-label*="generating" i]'
      );
      if (isGenerating) {
        generationObserved = true;
      }

      const currentModelResponsesCount = document.querySelectorAll('model-response').length;
      const hasNewResponseNode = currentModelResponsesCount > initialModelResponsesCount;
      const codeBlockText = extractCleanGeminiSolution(true);
      const currentText = codeBlockText || extractCleanGeminiSolution(false);

      const isSameAsOld = (currentText === initialLastText) && !hasNewResponseNode && !generationObserved;

      if (!currentText || isGenerating || isSameAsOld) {
        stableCount = 0;
        lastText = currentText || '';
      } else if (currentText === lastText && currentText.length > 20) {
        stableCount++;
        const requiredTicks = (codeBlockText || hasNewResponseNode) ? 2 : 3;
        if (stableCount >= requiredTicks) {
          clearInterval(pollInterval);
          console.log('[GeminiScraper] Formatted solution extracted successfully ✓');
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
          sendResponse({ success: false, error: 'Timed out waiting for formatted response from Gemini.' });
        }
      }
    }, 1000);
  }

  // 5. Message listener from NewtCBT
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'EXTRACT_SOLN_NOW') {
      handleExtractSolutionRequest(sendResponse);
      return true; // Keep message channel open for async response
    }
  });

})();
