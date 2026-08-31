
const pendingAI = {};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const allowedDomains = ['newtcbt.in', 'gemini.google.com', 'google.com', 'localhost', '127.0.0.1'];
  const senderUrl = sender.tab ? sender.tab.url : (sender.url || '');
  const isAllowed = allowedDomains.some(domain => senderUrl.includes(domain));
  
  if (!isAllowed) {
    sendResponse({ error: 'Unauthorized request origin' });
    return false;
  }

  if (request.type === 'FETCH_YOUTUBE') {
    fetchYoutube(request.query).then(sendResponse).catch(err => sendResponse({ error: err.toString() }));
    return true;
  }

  if (request.type === 'FETCH_WEB') {
    fetchWeb(request.query).then(sendResponse).catch(err => sendResponse({ error: err.toString() }));
    return true;
  }

  if (request.type === 'FETCH_AI_ANSWER') {
    const query = request.query;
    const source = request.source || 'google';

    let url = '';
    if (source === 'gemini') {
      chrome.storage.local.set({
        newtcbt_gemini_query: query,
        newtcbt_gemini_image: request.image || null,
        newtcbt_gemini_grounding: request.grounding
      });
      url = `https://gemini.google.com/app`;
    } else {
      chrome.storage.local.set({
        newtcbt_google_ai_query: query,
        newtcbt_google_ai_image: request.image || null
      });
      if (request.image) {
        url = `https://www.google.com/search?udm=50`;
      } else {
        const encodedQuery = encodeURIComponent(query || 'JEE exam solution');
        url = `https://www.google.com/search?q=${encodedQuery}&udm=50`;
      }
    }

    chrome.tabs.create({ url, active: true }, (tab) => {
      const tabId = tab.id;

      pendingAI[tabId] = {
        sendResponse,
        timer: setTimeout(() => {
          if (pendingAI[tabId]) {
            pendingAI[tabId].sendResponse({ success: false, error: 'Google AI Mode timed out after 60 seconds.' });
            delete pendingAI[tabId];
            chrome.tabs.remove(tabId).catch(() => {});
          }
        }, 60000)
      };
    });

    return true;
  }

  if (request.type === 'PREPARE_EMBED') {
    const source = request.source || 'gemini';
    const query = request.query || 'Solve this exam question step-by-step.';
    const image = request.image || null;

    if (source === 'gemini') {
      chrome.storage.local.set({
        newtcbt_gemini_query: query,
        newtcbt_gemini_image: image,
        newtcbt_gemini_embed: true,
        newtcbt_gemini_grounding: false
      }, () => {
        sendResponse({ success: true, url: 'https://gemini.google.com/app' });
      });
    } else {
      chrome.storage.local.set({
        newtcbt_google_ai_query: query,
        newtcbt_google_ai_image: image,
        newtcbt_google_ai_embed: true
      }, () => {
        const url = image ? 'https://www.google.com/search?udm=50' : `https://www.google.com/search?udm=50&q=${encodeURIComponent(query)}`;
        sendResponse({ success: true, url });
      });
    }
    return true;
  }

  if (request.type === 'TRIGGER_EXTRACT_SOLN') {
    const tabId = sender.tab?.id;
    if (tabId) {
      if (chrome.webNavigation && chrome.webNavigation.getAllFrames) {
        chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
          const frameErr = chrome.runtime.lastError;
          if (frameErr || !frames || frames.length === 0) {
            chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_SOLN_NOW' }, (resp) => {
              const lastErr = chrome.runtime.lastError;
              sendResponse(resp || { success: false, error: lastErr?.message || 'Assistant did not respond.' });
            });
            return;
          }

          // Prioritize frames matching Gemini or Google AI Mode
          const aiFrames = frames.filter(f => f.url && (f.url.includes('gemini.google.com') || f.url.includes('google.com')));
          const candidateFrames = aiFrames.length > 0 ? aiFrames : frames.filter(f => f.frameId !== 0);
          const framesToQuery = candidateFrames.length > 0 ? candidateFrames : frames;

          let responded = false;
          let pending = framesToQuery.length;

          framesToQuery.forEach((frame) => {
            chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_SOLN_NOW' }, { frameId: frame.frameId }, (resp) => {
              const lastErr = chrome.runtime.lastError; // Read lastError so Chrome suppresses unhandled error logging
              if (!responded && resp && resp.success) {
                responded = true;
                sendResponse(resp);
              }
              pending--;
              if (pending === 0 && !responded) {
                sendResponse({ success: false, error: 'Assistant did not respond.' });
              }
            });
          });
        });
      } else {
        chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_SOLN_NOW' }, (resp) => {
          const lastErr = chrome.runtime.lastError;
          sendResponse(resp || { success: false, error: 'Assistant did not respond.' });
        });
      }
      return true;
    }
  }

  if (request.type === 'AI_SCRAPER_RESULT') {
    const tabId = sender.tab?.id;
    if (tabId && pendingAI[tabId]) {
      clearTimeout(pendingAI[tabId].timer);
      pendingAI[tabId].sendResponse(request.data);
      delete pendingAI[tabId];
      chrome.tabs.remove(tabId).catch(() => {});
    }
    return false;
  }
});

async function fetchYoutube(query) {
  try {
    const encodedQuery = encodeURIComponent(query);

    // 1. Primary: DuckDuckGo Video Search API (Fast, pure JSON, includes exact durations & all video sources)
    try {
      const initHtml = await fetch(`https://duckduckgo.com/?q=${encodedQuery}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }).then(r => r.text());

      const vqdMatch = initHtml.match(/vqd=([0-9-]+)/) || initHtml.match(/vqd=['"]([0-9-]+)['"]/);
      if (vqdMatch) {
        const vqd = vqdMatch[1];
        const videoApiUrl = `https://duckduckgo.com/v.js?l=us-en&o=json&q=${encodedQuery}&vqd=${vqd}&f=,,,&p=1`;
        const data = await fetch(videoApiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://duckduckgo.com/'
          }
        }).then(r => r.json());

        const results = data.results || [];
        if (results.length > 0) {
          const videos = [];
          for (const item of results) {
            if (videos.length >= 40) break;

            const contentUrl = item.content || '';
            const ytMatch = contentUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            const videoId = ytMatch ? ytMatch[1] : null;

            let thumbnail = item.images?.large || item.images?.medium || item.images?.small || '';
            if (videoId && (!thumbnail || thumbnail.includes('bing.net'))) {
              thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            }

            videos.push({
              videoId: videoId || '',
              title: item.title || '',
              url: contentUrl,
              thumbnail,
              duration: item.duration || '',
              author: item.uploader || item.publisher || 'Video',
              publisher: item.publisher || (videoId ? 'YouTube' : 'Web')
            });
          }

          if (videos.length > 0) {
            return { videos };
          }
        }
      }
    } catch (e) {
      console.warn('[NewtCBT-Utils] DDG Video API error, trying fallback:', e);
    }

    // 2. Secondary fallback: Direct YouTube page scraping
    try {
      const ytUrl = `https://www.youtube.com/results?search_query=${encodedQuery}`;
      const ytHtml = await fetch(ytUrl).then(r => r.text());
      const ytInitMatch = ytHtml.match(/(?:var\s+ytInitialData|window\["ytInitialData"\]|ytInitialData)\s*=\s*(\{.*?\});/s);
      if (ytInitMatch) {
        const ytData = JSON.parse(ytInitMatch[1]);
        const contents = ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
        const videos = [];
        for (const item of contents) {
          if (item.videoRenderer && videos.length < 30) {
            const vr = item.videoRenderer;
            videos.push({
              videoId: vr.videoId,
              title: vr.title?.runs?.[0]?.text || '',
              url: `https://youtube.com/watch?v=${vr.videoId}`,
              thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
              duration: vr.lengthText?.simpleText || '',
              author: vr.ownerText?.runs?.[0]?.text || '',
              publisher: 'YouTube'
            });
          }
        }
        if (videos.length > 0) return { videos };
      }
    } catch (e) {}

    return { error: 'No video results found.' };
  } catch (error) {
    return { error: error.message };
  }
}

async function fetchWeb(query) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
    const response = await fetch(url);
    const html = await response.text();

    return { html };
  } catch (error) {
    return { error: error.message };
  }
}
