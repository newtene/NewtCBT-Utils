
const pendingAI = {};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const allowedDomains = ['newtcbt.vercel.app', 'buildtopia.fun', 'gemini.google.com', 'google.com'];
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
        newtcbt_gemini_grounding: request.grounding
      });
      url = `https://gemini.google.com/app`;
    } else {
      const encodedQuery = encodeURIComponent(query);
      url = `https://www.google.com/search?q=${encodedQuery}&udm=50`;
    }

    chrome.tabs.create({ url, active: false, pinned: true }, (tab) => {
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
    const url = `https://www.youtube.com/results?search_query=${encodedQuery}`;
    const response = await fetch(url);
    const html = await response.text();

    const ytInitDataMatch = html.match(/var ytInitialData = (\{.*?\});/);
    if (!ytInitDataMatch) return { error: "Failed to parse YouTube page." };

    const ytData = JSON.parse(ytInitDataMatch[1]);
    const contents = ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents[0]?.itemSectionRenderer?.contents || [];

    const videos = [];
    for (const item of contents) {
      if (item.videoRenderer && videos.length < 4) {
        const vr = item.videoRenderer;
        videos.push({
          videoId: vr.videoId,
          title: vr.title?.runs?.[0]?.text || "",
          url: `https://youtube.com/watch?v=${vr.videoId}`,
          thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
          duration: vr.lengthText?.simpleText || "",
          author: vr.ownerText?.runs?.[0]?.text || ""
        });
      }
    }

    return { videos };
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
