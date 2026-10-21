
const pendingAI = {};
let activeCompanionTabId = null;
let activeNewtCbtTabId = null;

let activeSidepanelPort = null;
let attachedDebuggerTabId = null;

function hasChromeSidePanel() {
  return Boolean(typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.open === 'function');
}

function lockTabForeground(tabId) {
  if (!tabId || typeof chrome === 'undefined' || !chrome.debugger || typeof chrome.debugger.sendCommand !== 'function') return;
  chrome.debugger.sendCommand({ tabId }, 'Page.enable', {}, () => {
    if (chrome.runtime.lastError) {}
  });
  chrome.debugger.sendCommand({ tabId }, 'Page.setWebLifecycleState', { state: 'active' }, () => {
    if (chrome.runtime.lastError) {}
  });
  chrome.debugger.sendCommand({ tabId }, 'Emulation.setFocusEmulationEnabled', { enabled: true }, () => {
    if (chrome.runtime.lastError) {}
  });
  chrome.debugger.sendCommand({ tabId }, 'Network.enable', {}, () => {
    if (chrome.runtime.lastError) {}
  });
}

function detachDebugger(tabId) {
  const targetId = tabId || attachedDebuggerTabId;
  const doDetach = (tid) => {
    if (!tid || typeof chrome === 'undefined' || !chrome.debugger || typeof chrome.debugger.detach !== 'function') return;
    try {
      chrome.debugger.detach({ tabId: tid }, () => {
        if (chrome.runtime.lastError) {}
      });
    } catch (_) {}
    if (attachedDebuggerTabId === tid) {
      attachedDebuggerTabId = null;
    }
    chrome.storage.local.remove(['newtcbt_attached_debugger_tab_id']);
  };

  if (targetId) {
    doDetach(targetId);
  } else {
    chrome.storage.local.get(['newtcbt_attached_debugger_tab_id'], (res) => {
      if (res?.newtcbt_attached_debugger_tab_id) {
        doDetach(res.newtcbt_attached_debugger_tab_id);
      }
    });
  }
}

function attachDebugger(tabId, retries = 3) {
  if (!tabId || typeof chrome === 'undefined' || !chrome.debugger || typeof chrome.debugger.attach !== 'function') return;
  if (attachedDebuggerTabId && attachedDebuggerTabId !== tabId) {
    detachDebugger(attachedDebuggerTabId);
  }
  if (attachedDebuggerTabId === tabId) {
    lockTabForeground(tabId);
    return;
  }
  try {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || '';
        console.warn(`[NewtCBT] chrome.debugger.attach (retries left: ${retries}):`, msg);
        if (msg.includes('Another debugger') || msg.includes('already attached')) {
          attachedDebuggerTabId = tabId;
          chrome.storage.local.set({ newtcbt_attached_debugger_tab_id: tabId });
          lockTabForeground(tabId);
          return;
        }
        if (retries > 0) {
          setTimeout(() => attachDebugger(tabId, retries - 1), 600);
        }
        return;
      }
      attachedDebuggerTabId = tabId;
      chrome.storage.local.set({ newtcbt_attached_debugger_tab_id: tabId });
      console.log('[NewtCBT:Debugger] Active foreground state lock acquired on tab:', tabId);
      lockTabForeground(tabId);
    });
  } catch (err) {
    console.warn('[NewtCBT] Exception in attachDebugger:', err);
    if (retries > 0) {
      setTimeout(() => attachDebugger(tabId, retries - 1), 600);
    }
  }
}

if (typeof chrome !== 'undefined' && chrome.debugger && chrome.debugger.onDetach) {
  chrome.debugger.onDetach.addListener((source, reason) => {
    if (source && (source.tabId === attachedDebuggerTabId || source.tabId)) {
      console.log('[NewtCBT] Debugger detached from tab', source.tabId, 'Reason:', reason);
      if (attachedDebuggerTabId === source.tabId) {
        attachedDebuggerTabId = null;
      }
      chrome.storage.local.remove(['newtcbt_attached_debugger_tab_id']);
    }
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel') {
    activeSidepanelPort = port;
    chrome.storage.local.set({
      newtcbt_companion_is_sidepanel: true,
      newtcbt_sidepanel_is_open: true,
      newtcbt_sidepanel_closed_by_user: false
    });
    port.onDisconnect.addListener(() => {
      activeSidepanelPort = null;
      chrome.storage.local.set({
        newtcbt_companion_is_sidepanel: false,
        newtcbt_sidepanel_is_open: false,
        newtcbt_sidepanel_closed_by_user: true
      });
      if (activeNewtCbtTabId) {
        chrome.tabs.sendMessage(activeNewtCbtTabId, {
          type: 'NEWTCBT_SIDEPANEL_CLOSED'
        }).catch(() => {});
      } else {
        chrome.tabs.query({ url: ['*://*.newtcbt.in/*', '*://localhost/*'] }, (tabs) => {
          if (tabs && tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'NEWTCBT_SIDEPANEL_CLOSED'
            }).catch(() => {});
          }
        });
      }
    });
  }
});

// Configure Chrome Side Panel behavior on boot
if (typeof chrome !== 'undefined' && chrome.sidePanel) {
  if (typeof chrome.sidePanel.setPanelBehavior === 'function') {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
  if (typeof chrome.sidePanel.setOptions === 'function') {
    chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true }).catch(() => {});
  }
}

// Handle extension action click (Chrome opens sidepanel, Firefox/other focuses/opens pinned companion tab)
const actionObj = (typeof browser !== 'undefined' && (browser.action || browser.browserAction)) || (typeof chrome !== 'undefined' && chrome.action);
if (actionObj && typeof actionObj.onClicked?.addListener === 'function') {
  actionObj.onClicked.addListener((tab) => {
    if (hasChromeSidePanel()) {
      const winId = tab?.windowId;
      chrome.sidePanel.open(winId ? { windowId: winId } : {}).catch(() => {});
    } else {
      chrome.storage.local.get(['newtcbt_active_companion_tab_id'], (res) => {
        const cTabId = res?.newtcbt_active_companion_tab_id || activeCompanionTabId;
        if (cTabId) {
          chrome.tabs.update(cTabId, { active: true }, () => {
            if (chrome.runtime.lastError) {
              chrome.tabs.create({ url: 'https://aistudio.google.com/prompts/new_chat', pinned: true });
            }
          });
        } else {
          chrome.tabs.create({ url: 'https://aistudio.google.com/prompts/new_chat', pinned: true });
        }
      });
    }
  });
}

// Restore active tab IDs from storage on service worker boot
chrome.storage.local.get(['newtcbt_active_companion_tab_id', 'newtcbt_active_newtcbt_tab_id', 'newtcbt_attached_debugger_tab_id'], (res) => {
  if (res?.newtcbt_active_companion_tab_id) activeCompanionTabId = res.newtcbt_active_companion_tab_id;
  if (res?.newtcbt_active_newtcbt_tab_id) activeNewtCbtTabId = res.newtcbt_active_newtcbt_tab_id;
  if (res?.newtcbt_attached_debugger_tab_id) attachedDebuggerTabId = res.newtcbt_attached_debugger_tab_id;
});

chrome.tabs.onRemoved.addListener((closedTabId) => {
  if (attachedDebuggerTabId === closedTabId) {
    attachedDebuggerTabId = null;
    chrome.storage.local.remove(['newtcbt_attached_debugger_tab_id']);
  }
  if (activeCompanionTabId === closedTabId) {
    activeCompanionTabId = null;
    chrome.storage.local.remove(['newtcbt_active_companion_tab_id']);
  }
  if (activeNewtCbtTabId === closedTabId) {
    activeNewtCbtTabId = null;
    chrome.storage.local.remove(['newtcbt_active_newtcbt_tab_id']);
  }
  if (pendingAI[closedTabId]) {
    clearTimeout(pendingAI[closedTabId].timer);
    try {
      pendingAI[closedTabId].sendResponse({ success: false, error: 'AI tab was closed before response could be received.' });
    } catch (_) {}
    delete pendingAI[closedTabId];
  }
});

// Re-assert active foreground lock on companion navigation / reload completion
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeCompanionTabId && changeInfo.status === 'complete') {
    chrome.storage.local.get(['newtcbt_companion_use_debugger', 'newtcbt_attached_debugger_tab_id'], (res) => {
      if (res?.newtcbt_companion_use_debugger && (attachedDebuggerTabId === tabId || res?.newtcbt_attached_debugger_tab_id === tabId)) {
        lockTabForeground(tabId);
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const allowedDomains = ['newtcbt.in', 'gemini.google.com', 'google.com', 'aistudio.google.com', 'localhost', '127.0.0.1'];
  const senderUrl = sender.tab ? sender.tab.url : (sender.url || '');
  const isExtensionOrigin = sender.id === chrome.runtime.id;
  const isAllowed = isExtensionOrigin || allowedDomains.some(domain => senderUrl.includes(domain));
  
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

  // Focus Companion tab/sidepanel from NewtCBT
  if (request.type === 'FOCUS_COMPANION_TAB' || request.type === 'OPEN_SIDEPANEL') {
    const focusTabById = (tabId) => {
      chrome.tabs.update(tabId, { active: true }, () => {
        if (chrome.runtime.lastError) {}
      });
      chrome.tabs.get(tabId, (tab) => {
        if (!chrome.runtime.lastError && tab && tab.windowId) {
          chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
        }
      });
    };

    const isExplicitSidepanel = request.companionMode === 'sidepanel' || request.mode === 'sidepanel' || request.type === 'OPEN_SIDEPANEL';

    chrome.storage.local.get(['newtcbt_companion_is_sidepanel', 'newtcbt_active_companion_tab_id', 'newtcbt_sidepanel_url'], (res) => {
      const isSidepanelMode = isExplicitSidepanel || !!res?.newtcbt_companion_is_sidepanel;

      if (isSidepanelMode && hasChromeSidePanel()) {
        chrome.storage.local.set({ newtcbt_companion_is_sidepanel: true });
        const callerWindowId = sender.tab?.windowId;
        const openOptions = callerWindowId ? { windowId: callerWindowId } : {};
        if (callerWindowId) {
          chrome.sidePanel.open(openOptions).then(() => {
            sendResponse({ success: true, sidePanel: true });
          }).catch((err) => {
            console.warn('[NewtCBT] chrome.sidePanel.open error in FOCUS_COMPANION_TAB:', err);
            sendResponse({ success: false, error: err?.message || String(err) });
          });
        } else {
          chrome.windows.getCurrent((win) => {
            const wId = win?.id;
            chrome.sidePanel.open(wId ? { windowId: wId } : {}).then(() => {
              sendResponse({ success: true, sidePanel: true });
            }).catch((err) => {
              console.warn('[NewtCBT] chrome.sidePanel.open error in FOCUS_COMPANION_TAB:', err);
              sendResponse({ success: false, error: err?.message || String(err) });
            });
          });
        }
        return;
      }

      // Otherwise focus pinned tab
      const targetTabId = activeCompanionTabId || res?.newtcbt_active_companion_tab_id;
      if (targetTabId) {
        chrome.tabs.get(targetTabId, (tab) => {
          if (!chrome.runtime.lastError && tab) {
            activeCompanionTabId = targetTabId;
            focusTabById(targetTabId);
            sendResponse({ success: true, tabId: targetTabId });
          } else {
            chrome.tabs.query({ url: '*://aistudio.google.com/*' }, (tabs) => {
              if (tabs && tabs.length > 0) {
                activeCompanionTabId = tabs[tabs.length - 1].id;
                focusTabById(activeCompanionTabId);
                sendResponse({ success: true, tabId: activeCompanionTabId });
              } else {
                sendResponse({ success: false, error: 'No companion tab found' });
              }
            });
          }
        });
      } else {
        chrome.tabs.query({ url: '*://aistudio.google.com/*' }, (tabs) => {
          if (tabs && tabs.length > 0) {
            activeCompanionTabId = tabs[tabs.length - 1].id;
            focusTabById(activeCompanionTabId);
            sendResponse({ success: true, tabId: activeCompanionTabId });
          } else {
            sendResponse({ success: false, error: 'No companion tab found' });
          }
        });
      }
    });
    return true;
  }

  // Live update debugging mode preference from NewtCBT
  if (request.type === 'SET_USE_DEBUGGER') {
    const enabled = !!request.useDebugger;
    chrome.storage.local.set({ newtcbt_companion_use_debugger: enabled });
    if (enabled) {
      if (activeCompanionTabId) {
        attachDebugger(activeCompanionTabId);
      } else {
        chrome.storage.local.get(['newtcbt_active_companion_tab_id'], (res) => {
          if (res?.newtcbt_active_companion_tab_id) {
            attachDebugger(res.newtcbt_active_companion_tab_id);
          }
        });
      }
    } else {
      detachDebugger();
    }
    sendResponse({ success: true, useDebugger: enabled });
    return false;
  }

  // Launch or reuse an AI Studio companion (Chrome Side Panel if sidepanel mode, or pinned tab if pinned mode)
  if (request.type === 'LAUNCH_PINNED_STAGE') {
    if (sender.tab?.id) {
      activeNewtCbtTabId = sender.tab.id;
      chrome.storage.local.set({ newtcbt_active_newtcbt_tab_id: activeNewtCbtTabId });
    }
    const model = request.model || 'gemini-3.8-flash';
    const forceNewChat = !!request.forceNewChat;
    const companionMode = request.companionMode || request.mode || 'pinned';
    const useDebugger = !!request.useDebugger;
    const timestamp = Date.now();
    const targetUrl = `https://aistudio.google.com/prompts/new_chat?model=${encodeURIComponent(model)}&_s=${timestamp}#newtcbt_companion=1`;

    const openOrReuseTab = () => {
      chrome.storage.local.set({
        newtcbt_companion_is_sidepanel: false,
        newtcbt_companion_use_debugger: useDebugger
      });

      const createPinnedTab = () => {
        chrome.tabs.create({
          url: targetUrl,
          pinned: true,
          active: false
        }, (newTab) => {
          activeCompanionTabId = newTab ? newTab.id : null;
          if (activeCompanionTabId) {
            chrome.storage.local.set({ newtcbt_active_companion_tab_id: activeCompanionTabId });
            if (useDebugger) {
              attachDebugger(activeCompanionTabId);
            } else {
              detachDebugger(activeCompanionTabId);
            }
          }
          sendResponse({ success: true, tabId: activeCompanionTabId, reused: false, sidePanel: false });
        });
      };

      const checkAndReuse = (tabId) => {
        chrome.tabs.get(tabId, (existingTab) => {
          if (!chrome.runtime.lastError && existingTab) {
            activeCompanionTabId = tabId;
            chrome.storage.local.set({ newtcbt_active_companion_tab_id: tabId });
            if (useDebugger) {
              attachDebugger(tabId);
            } else {
              detachDebugger(tabId);
            }
            if (forceNewChat) {
              chrome.tabs.update(tabId, { url: targetUrl }, () => {
                sendResponse({ success: true, tabId, reused: true, sidePanel: false });
              });
            } else {
              sendResponse({ success: true, tabId, reused: true, sidePanel: false });
            }
            return;
          }
          findOpenAiStudioTab();
        });
      };

      const findOpenAiStudioTab = () => {
        chrome.tabs.query({ url: '*://aistudio.google.com/*' }, (tabs) => {
          if (!chrome.runtime.lastError && tabs && tabs.length > 0) {
            const existing = tabs[tabs.length - 1];
            activeCompanionTabId = existing.id;
            chrome.storage.local.set({ newtcbt_active_companion_tab_id: existing.id });
            if (useDebugger) {
              attachDebugger(existing.id);
            } else {
              detachDebugger(existing.id);
            }
            if (forceNewChat) {
              chrome.tabs.update(existing.id, { url: targetUrl }, () => {
                sendResponse({ success: true, tabId: existing.id, reused: true, sidePanel: false });
              });
            } else {
              sendResponse({ success: true, tabId: existing.id, reused: true, sidePanel: false });
            }
            return;
          }
          createPinnedTab();
        });
      };

      if (activeCompanionTabId) {
        checkAndReuse(activeCompanionTabId);
      } else {
        chrome.storage.local.get(['newtcbt_active_companion_tab_id'], (res) => {
          if (res && res.newtcbt_active_companion_tab_id) {
            checkAndReuse(res.newtcbt_active_companion_tab_id);
          } else {
            findOpenAiStudioTab();
          }
        });
      }
    };

    // 1. Native Side Panel mode (Chrome Side Panel API):
    const isChromeSidePanel = hasChromeSidePanel();
    const isSidePanelAvailable = isChromeSidePanel;

    if (companionMode === 'sidepanel' && isSidePanelAvailable) {
      const callerWindowId = sender.tab?.windowId;
      const callerTabId = sender.tab?.id;

      // Close any active pinned tab when switching to sidepanel mode
      if (activeCompanionTabId) {
        chrome.tabs.remove(activeCompanionTabId).catch(() => {});
        activeCompanionTabId = null;
        chrome.storage.local.remove(['newtcbt_active_companion_tab_id']);
      }
      detachDebugger();

      // When forceNewChat is false, preserve existing multi-turn chat session
      if (!forceNewChat && activeSidepanelPort) {
        chrome.storage.local.set({
          newtcbt_sidepanel_session_mode: 'generate'
        });
        try {
          activeSidepanelPort.postMessage({ type: 'SET_SIDEPANEL_MODE', mode: 'generate' });
        } catch (_) {}
        sendResponse({ success: true, sidePanel: true, reused: true });
        return true;
      }

      // Check via chrome.runtime.getContexts if available
      const checkAndOpenSidePanel = async () => {
        if (isChromeSidePanel && !forceNewChat && chrome.runtime && typeof chrome.runtime.getContexts === 'function') {
          try {
            const contexts = await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] });
            if (contexts && contexts.length > 0) {
              chrome.storage.local.set({
                newtcbt_sidepanel_session_mode: 'generate'
              });
              sendResponse({ success: true, sidePanel: true, reused: true });
              return;
            }
          } catch (_) {}
        }

        // Side panel needs to load new chat or open for the first time
        chrome.storage.local.set({
          newtcbt_sidepanel_url: targetUrl,
          newtcbt_companion_is_sidepanel: true,
          newtcbt_sidepanel_session_mode: 'generate'
        });

        if (activeSidepanelPort) {
          try {
            activeSidepanelPort.postMessage({ type: 'UPDATE_SIDEPANEL_URL', url: targetUrl, mode: 'generate' });
          } catch (_) {}
          chrome.runtime.sendMessage({
            type: 'UPDATE_SIDEPANEL_URL',
            url: targetUrl,
            mode: 'generate'
          }).catch(() => {});
          sendResponse({ success: true, sidePanel: true, reused: true });
          return;
        }

        chrome.runtime.sendMessage({
          type: 'UPDATE_SIDEPANEL_URL',
          url: targetUrl,
          mode: 'generate'
        }).catch(() => {});

        if (isChromeSidePanel) {
          const openSidePanel = (winId) => {
            const options = winId ? { windowId: winId } : (callerTabId ? { tabId: callerTabId } : {});
            chrome.sidePanel.open(options).then(() => {
              sendResponse({ success: true, sidePanel: true, reused: false });
            }).catch((err) => {
              console.warn('[NewtCBT] chrome.sidePanel.open failed, stopping generation:', err);
              sendResponse({ success: false, error: 'Side panel could not be opened: ' + (err?.message || err) });
            });
          };

          if (callerWindowId) {
            openSidePanel(callerWindowId);
          } else {
            chrome.windows.getCurrent((win) => {
              openSidePanel(win?.id);
            });
          }
        }
      };

      checkAndOpenSidePanel();
      return true;
    }

    // 2. Pinned Tab mode (or fallback if sidePanel is not available)
    if (activeSidepanelPort) {
      try {
        activeSidepanelPort.postMessage({ type: 'CLOSE_SIDEPANEL' });
      } catch (_) {}
    }
    chrome.storage.local.set({ newtcbt_companion_is_sidepanel: false, newtcbt_sidepanel_is_open: false });

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
    const companionMode = request.companionMode || request.mode || (request.isPinned ? 'pinned' : 'sidepanel');
    const isChromeSidePanel = hasChromeSidePanel();
    const isSidePanelAvailable = isChromeSidePanel;
    const isPinned = companionMode === 'pinned' || (!isSidePanelAvailable && !!request.isPinned);

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

      // Native Side Panel mode (Chrome Side Panel API):
      if (companionMode === 'sidepanel' && isSidePanelAvailable) {
        chrome.storage.local.set({
          newtcbt_sidepanel_url: targetUrl,
          newtcbt_companion_is_sidepanel: true,
          newtcbt_sidepanel_session_mode: 'solution'
        });

        if (activeSidepanelPort) {
          try {
            activeSidepanelPort.postMessage({ type: 'UPDATE_SIDEPANEL_URL', url: targetUrl, mode: 'solution' });
          } catch (_) {}
          chrome.runtime.sendMessage({
            type: 'UPDATE_SIDEPANEL_URL',
            url: targetUrl,
            mode: 'solution'
          }).catch(() => {});
          sendResponse({ success: true, url: targetUrl, sidePanel: true, reused: true });
          return;
        }

        chrome.runtime.sendMessage({
          type: 'UPDATE_SIDEPANEL_URL',
          url: targetUrl,
          mode: 'solution'
        }).catch(() => {});

        if (isChromeSidePanel) {
          const callerWindowId = sender.tab?.windowId;
          const callerTabId = sender.tab?.id;
          const options = callerWindowId ? { windowId: callerWindowId } : (callerTabId ? { tabId: callerTabId } : {});
          chrome.sidePanel.open(options).then(() => {
            sendResponse({ success: true, url: targetUrl, sidePanel: true, reused: false });
          }).catch((err) => {
            console.warn('[NewtCBT] chrome.sidePanel.open failed in PREPARE_EMBED:', err);
            sendResponse({ success: false, error: 'Side panel could not be opened: ' + (err?.message || err) });
          });
        }
        return;
      }

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
        chrome.tabs.create({ url: targetUrl, pinned: false, active: true }, (tab) => {
          activeCompanionTabId = tab ? tab.id : null;
          sendResponse({ success: true, url: targetUrl, tabId: tab?.id, isPinned: false, reused: false });
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
    if (activeSidepanelPort) {
      try {
        activeSidepanelPort.postMessage({ type: 'RETRY_SUBMISSION' });
      } catch (_) {}
    }
    const targetTabId = sender.tab?.id || activeCompanionTabId;
    if (targetTabId) {
      chrome.tabs.sendMessage(targetTabId, { type: 'RETRY_SUBMISSION' }, (resp) => {
        sendResponse(resp || { success: true });
      });
      return true;
    }
    sendResponse({ success: true });
    return false;
  }

  if (request.type === 'TRIGGER_EXTRACT_SOLN') {
    if (activeSidepanelPort) {
      try {
        activeSidepanelPort.postMessage({ type: 'EXTRACT_SOLN_NOW' });
      } catch (_) {}
    }

    const senderTabId = sender.tab?.id;
    let targetTabId = senderTabId;

    // If extract requested from NewtCBT tab, query active companion tab if one is open
    if (activeCompanionTabId && senderTabId !== activeCompanionTabId) {
      targetTabId = activeCompanionTabId;
    }

    if (targetTabId) {
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

    sendResponse({ success: true, pendingSidePanel: true });
    return true;
  }

  if (request.type === 'AI_SOLUTION_EXTRACTED') {
    if (request.text) {
      broadcastToNewtCBTTabs({
        type: 'NEWTCBT_EXTRACTED_SOLN_RESULT',
        success: true,
        text: request.text
      });
    }
    sendResponse && sendResponse({ success: true });
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

    if (request.stage === 'loki' && request.file) {
      stagePayload.newtcbt_qp_file = request.file;
    }

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

    // If running in a companion tab/sidepanel and final/diagram stage completed or requested, switch focus back to NewtCBT and CLOSE the companion
    if (request.stage === 'dia' || request.stage === 'final' || request.closeCompanion || request.returnFocus) {
      if (activeNewtCbtTabId) {
        chrome.tabs.update(activeNewtCbtTabId, { active: true }).catch(() => {});
      } else {
        chrome.tabs.query({ url: ['*://*.newtcbt.in/*', '*://localhost/*'] }, (tabs) => {
          if (tabs && tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { active: true }).catch(() => {});
          }
        });
      }
      if (request.stage === 'dia' || request.stage === 'final' || request.closeCompanion) {
        // Close Side Panel if open
        chrome.storage.local.remove(['newtcbt_sidepanel_url', 'newtcbt_companion_is_sidepanel', 'newtcbt_sidepanel_session_mode']);
        chrome.runtime.sendMessage({ type: 'CLOSE_SIDEPANEL' }).catch(() => {});
        detachDebugger();

        if (activeCompanionTabId) {
          chrome.tabs.remove(activeCompanionTabId).catch(() => {});
          activeCompanionTabId = null;
          chrome.storage.local.remove(['newtcbt_active_companion_tab_id']);
        } else {
          chrome.tabs.query({ url: '*://aistudio.google.com/*' }, (tabs) => {
            if (tabs && tabs.length > 0) {
              chrome.tabs.remove(tabs.map(t => t.id)).catch(() => {});
            }
          });
        }
      }
    }

    sendResponse({ success: true });
    return false;
  }

  // Explicitly close companion tab/sidepanel from NewtCBT
  if (request.type === 'CLOSE_COMPANION_TAB') {
    if (request.returnFocus !== false && activeNewtCbtTabId) {
      chrome.tabs.update(activeNewtCbtTabId, { active: true }).catch(() => {});
    }

    detachDebugger();

    // Do NOT close sidepanel if this is an interim stage transition
    if (request.interim !== true) {
      chrome.storage.local.remove(['newtcbt_sidepanel_url', 'newtcbt_companion_is_sidepanel', 'newtcbt_sidepanel_is_open', 'newtcbt_sidepanel_session_mode']);
      if (activeSidepanelPort) {
        try { activeSidepanelPort.postMessage({ type: 'CLOSE_SIDEPANEL' }); } catch (_) {}
      }
      chrome.runtime.sendMessage({ type: 'CLOSE_SIDEPANEL' }).catch(() => {});
    }

    if (activeCompanionTabId) {
      chrome.tabs.remove(activeCompanionTabId).catch(() => {});
      activeCompanionTabId = null;
      chrome.storage.local.remove(['newtcbt_active_companion_tab_id']);
    } else {
      chrome.tabs.query({ url: '*://aistudio.google.com/*' }, (tabs) => {
        if (tabs && tabs.length > 0) {
          chrome.tabs.remove(tabs.map(t => t.id)).catch(() => {});
        }
      });
    }
    sendResponse({ success: true });
    return false;
  }

  // Retry active step in a brand new chat (in sidepanel iframe if in sidepanel mode, or new tab in fallback)
  if (request.type === 'RETRY_IN_NEW_TAB') {
    const model = request.model || 'gemini-3.8-flash';
    const stage = request.stage || 'sylvie';
    const prompt = request.prompt || '';
    let file = request.file || null;
    const jobId = request.jobId || ('job_' + stage + '_retry_' + Date.now());
    const oldTabId = sender.tab?.id || activeCompanionTabId;

    const doRetry = (effectiveFile) => {
      const stagePayload = {
        newtcbt_alt_stage: stage,
        newtcbt_alt_file: effectiveFile,
        newtcbt_alt_prompt: prompt,
        newtcbt_alt_job_id: jobId,
        newtcbt_alt_timestamp: Date.now(),
        newtcbt_alt_is_retry: true,
        newtcbt_alt_model: model,
        newtcbt_gem_stage: stage,
        newtcbt_gem_prompt: prompt,
        newtcbt_gem_job_id: jobId,
        newtcbt_gem_timestamp: Date.now(),
        newtcbt_gem_is_retry: true,
        newtcbt_gem_model: model
      };

      chrome.storage.local.set(stagePayload, () => {
        const timestamp = Date.now();
        const targetUrl = `https://aistudio.google.com/prompts/new_chat?model=${encodeURIComponent(model)}&_s=${timestamp}#newtcbt_companion=1`;

        chrome.storage.local.get(['newtcbt_companion_is_sidepanel'], (res) => {
          if ((activeSidepanelPort || res?.newtcbt_companion_is_sidepanel) && hasChromeSidePanel()) {
            chrome.storage.local.set({
              newtcbt_sidepanel_url: targetUrl,
              newtcbt_sidepanel_session_mode: 'generate'
            });
            if (activeSidepanelPort) {
              try { activeSidepanelPort.postMessage({ type: 'UPDATE_SIDEPANEL_URL', url: targetUrl, mode: 'generate' }); } catch (_) {}
            }
            chrome.runtime.sendMessage({
              type: 'UPDATE_SIDEPANEL_URL',
              url: targetUrl,
              mode: 'generate'
            }).catch(() => {});
            sendResponse({ success: true, sidePanel: true });
            return;
          }

          // Fallback: update existing tab or create pinned tab
          if (activeCompanionTabId) {
            chrome.tabs.update(activeCompanionTabId, { url: targetUrl }, () => {
              chrome.storage.local.get(['newtcbt_companion_use_debugger'], (dRes) => {
                if (dRes?.newtcbt_companion_use_debugger) {
                  attachDebugger(activeCompanionTabId);
                }
              });
              sendResponse({ success: true, tabId: activeCompanionTabId, sidePanel: false });
            });
          } else {
            chrome.tabs.create({
              url: targetUrl,
              pinned: true,
              active: false
            }, (newTab) => {
              activeCompanionTabId = newTab ? newTab.id : null;
              if (oldTabId && oldTabId !== activeCompanionTabId) {
                chrome.tabs.remove(oldTabId).catch(() => {});
              }
              if (activeCompanionTabId) {
                chrome.storage.local.set({ newtcbt_active_companion_tab_id: activeCompanionTabId });
                chrome.storage.local.get(['newtcbt_companion_use_debugger'], (dRes) => {
                  if (dRes?.newtcbt_companion_use_debugger) {
                    attachDebugger(activeCompanionTabId);
                  }
                });
              }
              sendResponse({ success: true, tabId: activeCompanionTabId, sidePanel: false });
            });
          }
        });
      });
    };

    if (!file && (stage === 'dia' || stage === 'diagram' || stage === 'crop')) {
      chrome.storage.local.get(['newtcbt_qp_file', 'newtcbt_alt_file'], (res) => {
        const fallbackFile = res?.newtcbt_qp_file || res?.newtcbt_alt_file || null;
        doRetry(fallbackFile);
      });
    } else {
      doRetry(file);
    }
    return true;
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
    const url = `https://www.youtube.com/results?search_query=${encodedQuery}`;
    const response = await fetch(url);
    const html = await response.text();

    const ytInitDataMatch = html.match(/(?:var\s+ytInitialData|window\["ytInitialData"\]|ytInitialData)\s*=\s*(\{.*?\});/s)
      || html.match(/var ytInitialData = (\{.*?\});/);
    if (!ytInitDataMatch) return { error: "Failed to parse YouTube page." };

    const ytData = JSON.parse(ytInitDataMatch[1]);
    const contents = ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

    const videos = [];
    for (const item of contents) {
      if (item.videoRenderer && videos.length < 20) {
        const vr = item.videoRenderer;
        videos.push({
          videoId: vr.videoId,
          title: vr.title?.runs?.[0]?.text || "",
          url: `https://youtube.com/watch?v=${vr.videoId}`,
          thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
          duration: vr.lengthText?.simpleText || "",
          author: vr.ownerText?.runs?.[0]?.text || "",
          publisher: 'YouTube'
        });
      }
    }

    if (videos.length === 0) {
      return { error: 'No video results found.' };
    }

    return { videos };
  } catch (error) {
    return { error: error.message };
  }
}

async function fetchWeb(query) {
  try {
    // 1. Remove characters that break search (\, {}, $)
    const cleanQ = (query || '')
      .replace(/[\\{}$]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);

    if (!cleanQ) {
      return { error: 'Question text is empty or image-only.' };
    }

    // 2. Primary: v3.0.2 direct DuckDuckGo HTML GET (Clean GET, works natively in Firefox)
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQ)}`;
      const response = await fetch(url);
      const html = await response.text();
      if (html && html.includes('result__body') && !html.includes('anomaly-modal')) {
        return { html };
      }
    } catch (e) {
      console.warn('[NewtCBT-Utils] DDG HTML GET error, trying fallback:', e);
    }

    // 3. Fallback: DuckDuckGo Lite POST
    try {
      const response = await fetch('https://lite.duckduckgo.com/lite/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `q=${encodeURIComponent(cleanQ)}`
      });

      const html = await response.text();
      if (html && (html.includes('result-link') || html.includes('result__body'))) {
        return { html };
      }
    } catch (e) {
      console.warn('[NewtCBT-Utils] DDG Lite POST error, trying fallback:', e);
    }

    // 4. Fallback: DuckDuckGo HTML POST
    try {
      const fallbackResponse = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `q=${encodeURIComponent(cleanQ)}`
      });

      const fallbackHtml = await fallbackResponse.text();
      if (fallbackHtml && !fallbackHtml.includes('anomaly-modal')) {
        return { html: fallbackHtml };
      }
    } catch (e) {
      console.warn('[NewtCBT-Utils] DDG HTML POST error:', e);
    }

    return { error: 'No web results found or search temporarily throttled.' };
  } catch (error) {
    return { error: error.message };
  }
}

