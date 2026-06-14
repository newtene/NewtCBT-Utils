
(function () {

  chrome.storage.local.get(['newtcbt_gemini_query', 'newtcbt_gemini_grounding'], function (result) {
    let query =
      result.newtcbt_gemini_query ||
      new URLSearchParams(window.location.hash.substring(1)).get('q');

    if (!query) {
      console.warn('[GeminiScraper] No query in storage — nothing to do.');
      return;
    }

    if (result.newtcbt_gemini_grounding) {
      query = "Please use Google Search to find the most accurate and up-to-date information before answering.\n\n" + query;
    }

    chrome.storage.local.remove(['newtcbt_gemini_query', 'newtcbt_gemini_grounding']);

    console.log('[GeminiScraper] Query:', query.slice(0, 80));

    let querySubmitted  = false;
    let scraped         = false;
    let lastText        = '';
    let stableCount     = 0;
    let tempChatClicked = false;
    let tempChatAttempts = 0;
    let isDiscoveringBtn = false;
    let discoveredBtn   = null;
    const MAX_ATTEMPTS  = 25;


    function reliableClick(el) {
      el.style.display = 'flex';
      el.style.pointerEvents = 'auto';
      el.removeAttribute('disabled');
      el.removeAttribute('aria-disabled');
      el.disabled = false;

      const innerBtn = el.querySelector('button');
      if (innerBtn) {
        innerBtn.style.pointerEvents = 'auto';
        innerBtn.removeAttribute('disabled');
        innerBtn.disabled = false;
      }

      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));

      el.focus && el.focus();

      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1
      });
      el.dispatchEvent(clickEvent);

      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      ['pointerdown', 'pointerup'].forEach(t =>
        el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y }))
      );

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
    }

    function getVisibleTempIcon() {
      const result = document.evaluate("//gem-icon[@data-test-id='temp-chat-button']", document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < result.snapshotLength; i++) {
        const node = result.snapshotItem(i);
        if (node.getBoundingClientRect().width > 0) {
          return node;
        }
      }
      return null;
    }

    function findButtonByText(phrase) {
      const lowerPhrase = phrase.toLowerCase();
      const attrEl =
        document.querySelector(`[aria-label*="${lowerPhrase}" i]`) ||
        document.querySelector(`[mattooltip*="${lowerPhrase}" i]`) ||
        document.querySelector(`[gmat-tooltip*="${lowerPhrase}" i]`) ||
        document.querySelector(`[data-tooltip*="${lowerPhrase}" i]`) ||
        document.querySelector(`[title*="${lowerPhrase}" i]`);
      if (attrEl) return attrEl;

      return (
        Array.from(document.querySelectorAll('button, [role="button"], a, div[role="button"]'))
          .find(el => el.textContent.replace(/\s+/g, ' ').toLowerCase().includes(lowerPhrase)) || null
      );
    }

    function isTempChatActive() {
      if (document.body.textContent.includes('Welcome, stranger')) return true;

      const btnWrapper = document.querySelector('gem-icon-button[data-test-id="temp-chat-button"]') || document.querySelector('[data-test-id="temp-chat-button"]');
      if (btnWrapper) {
        const checkBtn = btnWrapper.querySelector('button') || btnWrapper;
        if (
          checkBtn.getAttribute('aria-pressed') === 'true' ||
          checkBtn.getAttribute('aria-checked') === 'true' ||
          btnWrapper.classList.contains('active') ||
          btnWrapper.classList.contains('selected') ||
          checkBtn.classList.contains('active') ||
          checkBtn.classList.contains('selected')
        ) {
          return true;
        }
      }

      return !!findButtonByText('Turn off temporary');
    }


    async function doTempChatClick() {
      if (tempChatClicked || isDiscoveringBtn) return;
      isDiscoveringBtn = true;
      try {
        tempChatAttempts++;
        console.log(`[GeminiScraper] Temp chat attempt ${tempChatAttempts}/${MAX_ATTEMPTS}`);

        if (isTempChatActive()) {
          console.log('[GeminiScraper] Temp chat already active ✓');
          tempChatClicked = true;
          return;
        }

        let btnOn = document.querySelector('gem-icon-button[data-test-id="temp-chat-button"]') || document.querySelector('[data-test-id="temp-chat-button"]');

        if (!btnOn) {
          const tempIcon = getVisibleTempIcon();
          if (tempIcon) {
            btnOn = tempIcon.closest('button, [role="button"], a, gem-icon') || tempIcon;
          } else {
            btnOn = discoveredBtn || findButtonByText('temporary');
          }
        }

        if (!btnOn) {
          console.log('[GeminiScraper] Fast match failed, starting hover discovery in top-right...');
          const allBtns = Array.from(document.querySelectorAll('button, a, [role="button"], gem-icon, mat-icon, [class*="button"], [class*="icon"]'));
          const iconBtns = allBtns.filter(b => {
            const rect = b.getBoundingClientRect();
            return rect.top >= 0 && rect.top < 200 && rect.left > window.innerWidth / 2;
          });

          for (const btn of iconBtns) {
            btn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            await new Promise(r => setTimeout(r, 300));

            if (document.body.textContent.toLowerCase().includes('turn on temporary')) {
              console.log('[GeminiScraper] Discovered Temp Chat button via hover!');
              btnOn = btn;
              discoveredBtn = btn;
              btn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
              btn.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
              break;
            }
            btn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
            btn.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
          }
        }

        if (btnOn) {
          console.log('[GeminiScraper] Clicking "Turn on temporary chat"… Tag:', btnOn.tagName, 'Classes:', btnOn.className);
          reliableClick(btnOn);
        } else if (tempChatAttempts >= MAX_ATTEMPTS) {
          console.warn('[GeminiScraper] Temp chat button not found — proceeding anyway.');
          tempChatClicked = true;
        }
      } finally {
        isDiscoveringBtn = false;
      }
    }

    const submitQuery = () => {
      if (querySubmitted) return;

      const notNowBtn = Array.from(
        document.querySelectorAll('button, [role="button"]')
      ).find(el => el.textContent.trim().toLowerCase() === 'not now');

      if (notNowBtn) {
        console.log('[GeminiScraper] Dismissing overlay dialog…');
        notNowBtn.click();
        return;
      }

      if (!tempChatClicked) {
        doTempChatClick();
        return;
      }

      const richTextBox =
        document.querySelector('rich-textarea [contenteditable="true"]') ||
        document.querySelector('[contenteditable="true"][role="textbox"]')  ||
        document.querySelector('[data-placeholder*="Ask Gemini" i][contenteditable="true"]') ||
        document.querySelector('textarea') ||
        document.querySelector('[contenteditable="true"]');

      if (!richTextBox) {
        console.log('[GeminiScraper] Input box not found yet, retrying…');
        return;
      }

      console.log('[GeminiScraper] Inserting query…');
      richTextBox.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('delete',    false, null);

      const singleLineQuery = query.replace(/\n/g, ' ');
      document.execCommand('insertText', false, singleLineQuery);

      richTextBox.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));

      setTimeout(() => {
        const sendBtn =
          document.querySelector('button[aria-label="Send message"]') ||
          document.querySelector('[mattooltip="Send message"]')         ||
          document.querySelector(
            '[aria-label*="Send" i]:not([aria-label*="voice" i]):not([aria-label*="Microphone" i])'
          );

        if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
          console.log('[GeminiScraper] Clicking Send…');
          sendBtn.click();
        } else {
          console.log('[GeminiScraper] Send button not ready — pressing Enter…');
          richTextBox.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
          }));
        }
        querySubmitted = true;
      }, 600);
    };

    const scrapeResponse = () => {
      if (!querySubmitted || scraped) return;

      const messageBlocks = Array.from(document.querySelectorAll('message-content'));
      if (messageBlocks.length === 0) return;

      const lastMessage = messageBlocks[messageBlocks.length - 1];
      const codeBlock   = lastMessage.querySelector('code');
      let currentText   = (codeBlock ? codeBlock.innerText : lastMessage.innerText) || '';
      currentText = currentText.replace(/Use code with caution\./gi, '').trim();

      const text = lastMessage.innerText.trim();
      const justShowCode = text.replace(/Show code/ig, '').trim() === '';

      const isGenerating = !!document.querySelector('.generating-indicator, [aria-label*="generating" i], button[aria-label*="Stop responding" i], button[aria-label*="Stop" i]');

      if (text === '' || justShowCode || isGenerating) {
        stableCount = 0;
        lastText = text;
        return;
      }

      if (currentText.length > 20) {
        if (!isGenerating && currentText === lastText) {
          stableCount++;
          if (stableCount >= 3) {
            scraped = true;
            console.log('[GeminiScraper] Response stable ✓ Sending to background…');
            sendResult({ success: true, text: currentText });
          }
        } else {
          lastText    = currentText;
          stableCount = 0;
        }
      }
    };

    function sendResult(data) {
      chrome.runtime.sendMessage({ type: 'AI_SCRAPER_RESULT', data });
    }


    setTimeout(() => {
      const interval = setInterval(() => {
        if (scraped) { clearInterval(interval); return; }
        submitQuery();
        scrapeResponse();
      }, 1000);

      setTimeout(() => {
        if (!scraped) {
          scraped = true;
          clearInterval(interval);
          sendResult({ success: false, error: 'Gemini timed out or you need to log in to Google.' });
        }
      }, 45000);

    }, 2500);

  });

})();
