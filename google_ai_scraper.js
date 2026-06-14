

(function() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('udm') !== '50') return;

  console.log('[AI Scraper] Script loaded. URL:', window.location.href);

  let scraped = false;
  let lastText = '';
  let stableCount = 0;
  let checkCount = 0;

  function domToMarkdown(node) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return "";

    let md = "";
    const tag = node.tagName.toLowerCase();

    for (const child of node.childNodes) {
      md += domToMarkdown(child);
    }

    if (tag === 'p' || tag === 'div') return md + "\n\n";
    if (tag === 'br') return "\n";
    if (tag === 'b' || tag === 'strong') return "**" + md.trim() + "** ";
    if (tag === 'i' || tag === 'em') return "*" + md.trim() + "* ";
    if (tag === 'a') return "[" + md.trim() + "](" + node.href + ") ";
    if (tag === 'li') return "- " + md.trim() + "\n";
    if (tag === 'ul' || tag === 'ol') return "\n" + md + "\n";
    if (tag.match(/^h[1-6]$/)) {
      const level = tag.charAt(1);
      return "#".repeat(level) + " " + md.trim() + "\n\n";
    }
    if (tag === 'code') return "`" + md.trim() + "`";
    if (tag === 'pre') return "```\n" + md.trim() + "\n```\n\n";

    return md;
  }

  const scrapeResponse = () => {
    if (scraped) return;
    checkCount++;

    let responseText = '';

    const selectorGroups = [
      '.wDYxhc', '.LLtSOc', '.mod', '.aimod-response', '.XqFnDf',
      '[data-attrid="ai"]', '[data-ai-response]',
      '#rso', '#center_col', '#res',
      '#main', '#search', '[role="main"]',
      '.kp-wholepage', '.TQc1id', '.bNg8Rb',
    ];

    for (const sel of selectorGroups) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const codeBlock = el.querySelector('code');
          let rawText = codeBlock ? codeBlock.innerText : el.innerText;

          if (rawText && rawText.length > 100) {
             console.log(`[AI Scraper] Found content via "${sel}"`);
             responseText = rawText.replace(/Use code with caution\./gi, '').trim();
             break;
          }
        }
      } catch (e) {
      }
    }

    if (responseText && responseText.length > 100) {
      if (responseText === lastText) {
        stableCount++;
      } else {
        lastText = responseText;
        stableCount = 0;
      }

      if (stableCount >= 3) {
        scraped = true;
        console.log('[AI Scraper] DONE! Sending response. Length:', responseText.length);

        let clean = responseText;

        const query = urlParams.get('q') || '';
        if (query && query.length > 10) {
          const queryIndex = clean.indexOf(query);
          if (queryIndex >= 0 && queryIndex < 300) {
            clean = clean.substring(queryIndex + query.length);
          }
        }

        const removePatterns = [
          /^AI Mode\s*/gi,
          /^All\s+Images\s+Videos\s+News\s+More.*?\n/gi,
          /\nShare\s*\n?Export\s*\n?More\s*$/gi,
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

        clean = clean.replace(/\n{3,}/g, '\n\n').trim();

        chrome.runtime.sendMessage({
          type: 'AI_SCRAPER_RESULT',
          data: { success: true, text: clean }
        });
      }
    }
  };

  setTimeout(() => {
    console.log('[AI Scraper] Starting DOM checks...');
    const interval = setInterval(() => {
      if (scraped) {
        clearInterval(interval);
        return;
      }
      scrapeResponse();
    }, 1000);
  }, 3000);

})();
