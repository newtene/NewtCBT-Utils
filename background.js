
const pendingAI = {};
let activeCompanionTabId = null;
let activeNewtCbtTabId = null;

chrome.tabs.onRemoved.addListener((closedTabId) => {
  if (activeCompanionTabId === closedTabId) {
    activeCompanionTabId = null;
  }
  if (activeNewtCbtTabId === closedTabId) {
    activeNewtCbtTabId = null;
  }
  if (pendingAI[closedTabId]) {
    clearTimeout(pendingAI[closedTabId].timer);
    try {
      pendingAI[closedTabId].sendResponse({ success: false, error: 'AI tab was closed before response could be received.' });
    } catch (_) {}
    delete pendingAI[closedTabId];
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const allowedDomains = ['newtcbt.in', 'gemini.google.com', 'google.com', 'aistudio.google.com', 'localhost', '127.0.0.1'];
  const senderUrl = sender.tab ? sender.tab.url : (sender.url || '');
  const isAllowed = allowedDomains.some(domain => senderUrl.includes(domain));
  
  if (!isAllowed) {
    sendResponse({ error: 'Unauthorized request origin' });
    return false;
  }

  // Focus NewtCBT tab from Companion
  if (request.type === 'FOCUS_NEWTCBT_TAB') {
    const focusTab = (tabId) => {
      chrome.tabs.update(tabId, { active: true }, () => {
        if (chrome.runtime.lastError) {}
      });
      chrome.tabs.get(tabId, (tab) => {
        if (!chrome.runtime.lastError && tab && tab.windowId) {
          chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
        }
      });
    };

    if (activeNewtCbtTabId) {
      chrome.tabs.get(activeNewtCbtTabId, (tab) => {
        if (!chrome.runtime.lastError && tab) {
          focusTab(activeNewtCbtTabId);
        } else {
          chrome.tabs.query({ url: ['*://*.newtcbt.in/*', '*://localhost/*'] }, (tabs) => {
            if (tabs && tabs.length > 0) {
              activeNewtCbtTabId = tabs[0].id;
              focusTab(tabs[0].id);
            }
          });
        }
      });
    } else {
      chrome.tabs.query({ url: ['*://*.newtcbt.in/*', '*://localhost/*'] }, (tabs) => {
        if (tabs && tabs.length > 0) {
          activeNewtCbtTabId = tabs[0].id;
          focusTab(tabs[0].id);
        }
      });
    }

    if (request.closeCompanion && sender.tab?.id) {
      chrome.tabs.remove(sender.tab.id).catch(() => {});
      if (activeCompanionTabId === sender.tab.id) activeCompanionTabId = null;
    }
    sendResponse({ success: true });
    return false;
  }

  // Focus Companion tab from NewtCBT
  if (request.type === 'FOCUS_COMPANION_TAB') {
    if (activeCompanionTabId) {
      chrome.tabs.update(activeCompanionTabId, { active: true }, () => {
        if (chrome.runtime.lastError) {}
      });
      chrome.tabs.get(activeCompanionTabId, (tab) => {
        if (!chrome.runtime.lastError && tab && tab.windowId) {
          chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
        }
      });
    }
    sendResponse({ success: true });
    return false;
  }

  // Launch or reuse a pinned AI Studio companion tab for Hybrid Exam Generation
  if (request.type === 'LAUNCH_PINNED_STAGE') {
    if (sender.tab?.id) {
      activeNewtCbtTabId = sender.tab.id;
    }
    const model = request.model || 'gemini-3.8-flash';
    const timestamp = Date.now();
    const targetUrl = `https://aistudio.google.com/prompts/new_chat?model=${encodeURIComponent(model)}&_s=${timestamp}#newtcbt_companion=1`;

    const openOrReuseTab = () => {
      if (activeCompanionTabId) {
        chrome.tabs.get(activeCompanionTabId, (existingTab) => {
          if (!chrome.runtime.lastError && existingTab) {
            chrome.tabs.update(activeCompanionTabId, { active: true }, () => {
              sendResponse({ success: true, tabId: activeCompanionTabId, reused: true });
            });
            return;
          }
          createNewPinnedTab();
        });
      } else {
        createNewPinnedTab();
      }
    };

    const createNewPinnedTab = () => {
      chrome.tabs.create({
        url: targetUrl,
        pinned: true,
        active: true
      }, (newTab) => {
        activeCompanionTabId = newTab ? newTab.id : null;
        sendResponse({ success: true, tabId: activeCompanionTabId, reused: false });
      });
    };

    openOrReuseTab();
    return true;
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

    const timestamp = Date.now();
    let url = '';
    if (source === 'gemini') {
      chrome.storage.local.set({
        newtcbt_gemini_query: query,
        newtcbt_gemini_image: request.image || null,
        newtcbt_gemini_grounding: request.grounding,
        newtcbt_gemini_timestamp: timestamp
      }, () => {
        if (chrome.runtime.lastError) console.warn('[NewtCBT Storage]', chrome.runtime.lastError.message);
      });
      url = `https://gemini.google.com/app#newtcbt`;
    } else {
      chrome.storage.local.set({
        newtcbt_google_ai_query: query,
        newtcbt_google_ai_image: request.image || null,
        newtcbt_google_ai_timestamp: timestamp
      }, () => {
        if (chrome.runtime.lastError) console.warn('[NewtCBT Storage]', chrome.runtime.lastError.message);
      });
      if (request.image) {
        url = `https://www.google.com/search?udm=50#newtcbt`;
      } else {
        const encodedQuery = encodeURIComponent(query || 'JEE exam solution');
        url = `https://www.google.com/search?q=${encodedQuery}&udm=50#newtcbt`;
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
    const isPinned = !!request.isPinned;

    if (sender.tab?.id) {
      activeNewtCbtTabId = sender.tab.id;
    }

    const timestamp = Date.now();
    const geminiUrl = 'https://gemini.google.com/app#newtcbt';
    const googleUrl = image 
      ? 'https://www.google.com/search?udm=50#newtcbt' 
      : `https://www.google.com/search?udm=50&q=${encodeURIComponent(query)}#newtcbt`;
    const targetUrl = source === 'gemini' ? geminiUrl : googleUrl;

    const storagePayload = source === 'gemini' ? {
      newtcbt_gemini_query: query,
      newtcbt_gemini_image: image,
      newtcbt_gemini_embed: !isPinned,
      newtcbt_gemini_grounding: false,
      newtcbt_gemini_timestamp: timestamp
    } : {
      newtcbt_google_ai_query: query,
      newtcbt_google_ai_image: image,
      newtcbt_google_ai_embed: !isPinned,
      newtcbt_google_ai_timestamp: timestamp
    };

    chrome.storage.local.set(storagePayload, () => {
      if (chrome.runtime.lastError) console.warn('[NewtCBT Storage]', chrome.runtime.lastError.message);

      if (!isPinned) {
        sendResponse({
          success: true,
          url: targetUrl
        });
        return;
      }

      const activateAndSend = (tabId, reused = false) => {
        activeCompanionTabId = tabId;
        chrome.tabs.update(tabId, { active: true }, (tab) => {
          if (chrome.runtime.lastError) {}
          if (tab && tab.windowId) {
            chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
          }
          sendResponse({ success: true, url: targetUrl, tabId, isPinned: true, reused });
        });
      };

      const createNewTab = () => {
        chrome.tabs.create({ url: targetUrl, pinned: true, active: true }, (tab) => {
          activeCompanionTabId = tab ? tab.id : null;
          sendResponse({ success: true, url: targetUrl, tabId: tab?.id, isPinned: true, reused: false });
        });
      };

      if (activeCompanionTabId) {
        chrome.tabs.get(activeCompanionTabId, (existingTab) => {
          if (!chrome.runtime.lastError && existingTab) {
            const currentUrl = existingTab.url || '';
            const matchesSource = source === 'gemini'
              ? currentUrl.includes('gemini.google.com')
              : currentUrl.includes('google.com/search');

            if (matchesSource) {
              activateAndSend(activeCompanionTabId, true);
            } else {
              chrome.tabs.update(activeCompanionTabId, { url: targetUrl, active: true }, () => {
                activateAndSend(activeCompanionTabId, true);
              });
            }
            return;
          }
          createNewTab();
        });
      } else {
        createNewTab();
      }
    });

    return true;
  }

  if (request.type === 'TRIGGER_RETRY_SUBMISSION') {
    const targetTabId = sender.tab?.id || activeCompanionTabId;
    if (targetTabId) {
      chrome.tabs.sendMessage(targetTabId, { type: 'RETRY_SUBMISSION' }, (resp) => {
        sendResponse(resp || { success: true });
      });
      return true;
    }
    sendResponse({ success: false });
    return false;
  }

  if (request.type === 'TRIGGER_EXTRACT_SOLN') {
    const senderTabId = sender.tab?.id;
    let targetTabId = senderTabId;

    // If extract requested from NewtCBT tab, query active companion tab if one is open
    if (activeCompanionTabId && senderTabId !== activeCompanionTabId) {
      targetTabId = activeCompanionTabId;
    }

    queryTabForSolution(targetTabId, (resp) => {
      if (resp && resp.success && resp.text) {
        broadcastToNewtCBTTabs({
          type: 'NEWTCBT_EXTRACTED_SOLN_RESULT',
          success: true,
          text: resp.text
        });
      }
      sendResponse(resp || { success: false, error: 'Assistant did not respond.' });
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

  if (request.type === 'UPDATE_AI_STUDIO_MODEL') {
    const model = request.model || 'gemini-3.8-flash';
    chrome.storage.local.set({
      newtcbt_alt_model: model,
      newtcbt_ai_studio_model: model
    }, () => {
      broadcastToNewtCBTTabs({
        type: 'NEWTCBT_AI_STUDIO_MODEL_UPDATED',
        model
      });
      broadcastToAIStudioFrames({
        type: 'NEWTCBT_AI_STUDIO_MODEL_UPDATED',
        model
      });
      sendResponse({ success: true, model });
    });
    return true;
  }

  if (request.type === 'START_ALT_STAGE' || request.type === 'START_GEM_STAGE') {
    // If starting a fresh run, clean up previous bulky image/file caches
    if (request.stage === 'sylvie' || request.stage === 'text') {
      try {
        chrome.storage.local.remove(['newtcbt_gem_file', 'newtcbt_gemini_image', 'newtcbt_google_ai_image']);
      } catch (_) {}
    }

    const stagePayload = {
      newtcbt_alt_stage: request.stage || 'text',
      newtcbt_alt_file: request.file || null,
      newtcbt_alt_prompt: request.prompt || '',
      newtcbt_alt_job_id: request.jobId || ('job_' + Date.now()),
      newtcbt_alt_timestamp: Date.now(),
      newtcbt_alt_is_retry: !!request.isRetry,
      newtcbt_alt_model: request.model || 'gemini-3.8-flash',
      newtcbt_gem_stage: request.stage || 'text',
      newtcbt_gem_prompt: request.prompt || '',
      newtcbt_gem_job_id: request.jobId || ('job_' + Date.now()),
      newtcbt_gem_timestamp: Date.now(),
      newtcbt_gem_is_retry: !!request.isRetry,
      newtcbt_gem_model: request.model || 'gemini-3.8-flash'
    };

    chrome.storage.local.set(stagePayload, () => {
      if (chrome.runtime.lastError) {
        console.warn('[NewtCBT Storage]', chrome.runtime.lastError.message);
      }
      broadcastToAIStudioFrames({
        type: 'START_ALT_STAGE',
        stage: stagePayload.newtcbt_alt_stage,
        file: stagePayload.newtcbt_alt_file,
        prompt: stagePayload.newtcbt_alt_prompt,
        jobId: stagePayload.newtcbt_alt_job_id,
        isRetry: !!request.isRetry,
        model: stagePayload.newtcbt_alt_model
      });
      sendResponse({ success: true, jobId: stagePayload.newtcbt_alt_job_id });
    });
    return true;
  }

  if (request.type === 'ALT_STAGE_PROGRESS' || request.type === 'GEM_STAGE_PROGRESS') {
    broadcastToNewtCBTTabs({
      type: 'NEWTCBT_GEM_PROGRESS',
      stage: request.stage,
      status: request.status,
      length: request.length || 0,
      percent: request.percent || 0,
      jobId: request.jobId
    });
    broadcastToNewtCBTTabs({
      type: 'NEWTCBT_ALT_PROGRESS',
      stage: request.stage,
      status: request.status,
      length: request.length || 0,
      percent: request.percent || 0,
      jobId: request.jobId
    });
    broadcastToAIStudioFrames({
      type: 'NEWTCBT_ALT_PROGRESS',
      stage: request.stage,
      status: request.status,
      length: request.length || 0,
      percent: request.percent || 0,
      jobId: request.jobId
    });
    sendResponse({ success: true });
    return false;
  }

  if (request.type === 'ALT_STAGE_COMPLETE' || request.type === 'GEM_STAGE_COMPLETE') {
    chrome.storage.local.set({
      newtcbt_last_gem_result: {
        stage: request.stage,
        result: request.result || '',
        jobId: request.jobId,
        success: request.success !== false,
        error: request.error || null,
        timestamp: Date.now()
      }
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[NewtCBT Storage]', chrome.runtime.lastError.message);
      }
    });

    broadcastToNewtCBTTabs({
      type: 'NEWTCBT_GEM_COMPLETE',
      stage: request.stage,
      result: request.result || '',
      jobId: request.jobId,
      success: request.success !== false,
      error: request.error || null
    });
    broadcastToNewtCBTTabs({
      type: 'NEWTCBT_ALT_COMPLETE',
      stage: request.stage,
      result: request.result || '',
      jobId: request.jobId,
      success: request.success !== false,
      error: request.error || null
    });
    broadcastToAIStudioFrames({
      type: 'NEWTCBT_ALT_COMPLETE',
      stage: request.stage,
      result: request.result || '',
      jobId: request.jobId,
      success: request.success !== false,
      error: request.error || null
    });

    // If running in a companion tab and final stage completed or requested, switch focus back to NewtCBT
    if (activeNewtCbtTabId && (request.stage === 'dia' || request.stage === 'final' || request.returnFocus)) {
      chrome.tabs.update(activeNewtCbtTabId, { active: true }).catch(() => {});
      if (activeCompanionTabId && request.closeCompanion) {
        chrome.tabs.remove(activeCompanionTabId).catch(() => {});
        activeCompanionTabId = null;
      }
    }

    sendResponse({ success: true });
    return false;
  }

  if (request.type === 'ALT_STAGE_ERROR' || request.type === 'GEM_STAGE_ERROR') {
    broadcastToNewtCBTTabs({
      type: 'NEWTCBT_GEM_ERROR',
      stage: request.stage,
      error: request.error || 'Stage failed',
      jobId: request.jobId
    });
    broadcastToNewtCBTTabs({
      type: 'NEWTCBT_ALT_ERROR',
      stage: request.stage,
      error: request.error || 'Stage failed',
      jobId: request.jobId
    });
    broadcastToAIStudioFrames({
      type: 'NEWTCBT_ALT_ERROR',
      stage: request.stage,
      error: request.error || 'Stage failed',
      jobId: request.jobId
    });
    sendResponse({ success: true });
    return false;
  }
});

function broadcastToAIStudioFrames(payload) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.url && (tab.url.includes('aistudio.google.com') || tab.url.includes('gemini.google.com'))) {
        chrome.tabs.sendMessage(tab.id, payload, () => {
          if (chrome.runtime.lastError) {}
        });
      }
      if (tab.url && (tab.url.includes('newtcbt.in') || tab.url.includes('localhost'))) {
        if (chrome.webNavigation && chrome.webNavigation.getAllFrames) {
          chrome.webNavigation.getAllFrames({ tabId: tab.id }, (frames) => {
            if (frames && frames.length) {
              frames.forEach((f) => {
                if (f.frameId !== 0 && f.url && (f.url.includes('aistudio.google.com') || f.url.includes('gemini.google.com'))) {
                  chrome.tabs.sendMessage(tab.id, payload, { frameId: f.frameId }, () => {
                    if (chrome.runtime.lastError) {}
                  });
                }
              });
            }
          });
        }
      }
    });
  });
}

function broadcastToNewtCBTTabs(payload) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.url && (tab.url.includes('newtcbt.in') || tab.url.includes('localhost'))) {
        chrome.tabs.sendMessage(tab.id, payload, () => {
          if (chrome.runtime.lastError) {}
        });
      }
    });
  });
}

function queryTabForSolution(targetTabId, callback) {
  if (!targetTabId) {
    callback({ success: false, error: 'No active AI tab found.' });
    return;
  }
  if (chrome.webNavigation && chrome.webNavigation.getAllFrames) {
    chrome.webNavigation.getAllFrames({ tabId: targetTabId }, (frames) => {
      const frameErr = chrome.runtime.lastError;
      if (frameErr || !frames || frames.length === 0) {
        chrome.tabs.sendMessage(targetTabId, { type: 'EXTRACT_SOLN_NOW' }, (resp) => {
          const lastErr = chrome.runtime.lastError;
          callback(resp || { success: false, error: lastErr?.message || 'Assistant did not respond.' });
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
        chrome.tabs.sendMessage(targetTabId, { type: 'EXTRACT_SOLN_NOW' }, { frameId: frame.frameId }, (resp) => {
          const lastErr = chrome.runtime.lastError; // Read lastError so Chrome suppresses unhandled error logging
          if (!responded && resp && resp.success) {
            responded = true;
            callback(resp);
          }
          pending--;
          if (pending === 0 && !responded) {
            callback({ success: false, error: 'Assistant did not respond.' });
          }
        });
      });
    });
  } else {
    chrome.tabs.sendMessage(targetTabId, { type: 'EXTRACT_SOLN_NOW' }, (resp) => {
      const lastErr = chrome.runtime.lastError;
      callback(resp || { success: false, error: lastErr?.message || 'Assistant did not respond.' });
    });
  }
}

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
