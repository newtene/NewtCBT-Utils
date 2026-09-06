/**
 * NewtCBT Companion Sidebar
 * Injected as a docked, full-height side panel into AI Studio, Gemini, and Google AI Mode
 * when running in Pinned Companion Tab mode.
 */

(function () {
  // Only inject when running as a top-level tab, never inside iframes!
  if (window.self !== window.top) {
    return;
  }

  // Only activate if the tab was launched by NewtCBT (contains &_s= session parameter or #newtcbt hash)
  const isNewtSession = window.location.search.includes('_s=') || 
                        window.location.hash.includes('newtcbt') || 
                        sessionStorage.getItem('newtcbt_companion_active') === 'true';

  if (!isNewtSession) {
    return;
  }

  try { sessionStorage.setItem('newtcbt_companion_active', 'true'); } catch (_) {}

  // Deduplicate injection
  if (document.getElementById('newtcbt-companion-root')) {
    return;
  }

  const hostname = window.location.hostname;
  const isAIStudio = hostname.includes('aistudio.google.com');
  const isGemini = hostname.includes('gemini.google.com');
  const isGoogleAI = hostname.includes('google.com') && window.location.pathname.includes('/search');

  if (!isAIStudio && !isGemini && !isGoogleAI) {
    return;
  }

  const MODEL_OPTIONS = [
    { id: 'gemini-3.8-flash', label: '3.8 Flash' },
    { id: 'gemini-3.7-flash', label: '3.7 Flash' },
    { id: 'gemini-3.6-flash', label: '3.6 Flash' },
    { id: 'gemini-3.5-flash', label: '3.5 Flash' },
    { id: 'gemini-3.1-pro-preview', label: '3.1 Pro Preview' },
    { id: 'gemini-3-flash-preview', label: '3 Flash Preview' }
  ];

  const urlParams = new URLSearchParams(window.location.search);
  let activeModel = urlParams.get('model') || 'gemini-3.8-flash';
  let currentStage = 'sylvie';

  const logoUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('logo-32.png')
    : '';

  // Create isolated container
  const root = document.createElement('div');
  root.id = 'newtcbt-companion-root';
  root.style.cssText = `
    position: fixed !important;
    top: 14px !important;
    right: 14px !important;
    width: ${isAIStudio ? '324px' : '230px'} !important;
    max-width: calc(100vw - 28px) !important;
    height: auto !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-end !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  `;

  const shadow = root.attachShadow({ mode: 'open' });

  // Stylesheet
  const style = document.createElement('style');
  style.textContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .sidebar-panel {
      pointer-events: auto;
      width: 100%;
      background: rgba(9, 9, 11, 0.94);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.04);
      display: flex;
      flex-direction: column;
      color: #e4e4e7;
      overflow: visible;
      user-select: none;
    }

    /* Header */
    .header {
      padding: 9px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(24, 24, 27, 0.65);
      border-radius: 12px 12px 0 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .brand-logo {
      width: 18px;
      height: 18px;
      border-radius: 4px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .brand-logo-fallback {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .brand-title {
      font-size: 13px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.01em;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .header-mode-label {
      font-size: 11px;
      font-weight: 600;
      color: #a1a1aa;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }

    .btn-toggle-collapse {
      background: transparent;
      border: none;
      color: #71717a;
      cursor: pointer;
      padding: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: color 0.15s, background 0.15s;
    }
    .btn-toggle-collapse:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.08);
    }

    /* Collapsible Body */
    .card-body {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: visible;
      position: relative;
    }

    /* Progress Card (Matches Generate Page Exactly) */
    .progress-card {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .progress-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1px;
    }

    .progress-label {
      font-size: 9px;
      font-weight: 500;
      color: #a1a1aa;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .progress-percent-val {
      font-size: 10px;
      font-weight: 600;
      color: #e4e4e7;
      letter-spacing: 0.08em;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .progress-track {
      width: 100%;
      height: 4px;
      background: #27272a;
      border-radius: 9999px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      width: 25%;
      background: #ffffff;
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
      border-radius: 9999px;
      transition: width 0.3s ease;
    }

    /* Actions Footer */
    .actions-footer {
      display: flex;
      flex-direction: column;
      gap: 6px;
      overflow: visible;
    }

    /* Pure red font notice text directly in the layout without any box/section */
    .retry-hint-text {
      color: #ef4444;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.35;
      padding: 0 1px;
      user-select: none;
    }

    .new-chat-tick-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      user-select: none;
      padding: 2px 1px 0 1px;
    }
    .new-chat-tick-input {
      accent-color: #ef4444;
      width: 12px;
      height: 12px;
      cursor: pointer;
      margin: 0;
    }
    .new-chat-tick-text {
      font-size: 10.5px;
      color: #a1a1aa;
      font-weight: 500;
      transition: color 0.15s;
    }
    .new-chat-tick-label:hover .new-chat-tick-text {
      color: #e4e4e7;
    }

    /* Minimalist Unified Inline Retry Control: [ Retry Step with ] [ 3.8 Flash ▾ ] (Zinc-White Theme) */
    .retry-inline-wrap {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
      height: 33px;
      background: rgba(24, 24, 27, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      transition: border-color 0.15s, background 0.15s;
    }
    .retry-inline-wrap:hover {
      border-color: rgba(255, 255, 255, 0.25);
      background: rgba(39, 39, 42, 0.85);
    }

    .retry-action-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px;
      height: 100%;
      background: transparent;
      border: none;
      color: #f4f4f5;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      user-select: none;
      transition: color 0.15s, opacity 0.15s;
      flex-shrink: 0;
    }
    .retry-action-btn:hover {
      color: #ffffff;
    }
    .retry-action-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .custom-dropdown-container {
      position: relative;
      display: flex;
      align-items: center;
      flex: 1;
      height: 100%;
      border-left: 1px solid rgba(255, 255, 255, 0.1);
      min-width: 0;
    }

    .custom-dropdown-trigger {
      width: 100%;
      height: 100%;
      padding: 0 8px 0 10px;
      background: transparent;
      border: none;
      color: #ffffff;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      outline: none;
      user-select: none;
    }
    .custom-dropdown-trigger:hover {
      color: #ffffff;
    }

    .model-selected-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 600;
      color: #ffffff;
    }

    .select-arrow {
      color: #a1a1aa;
      transition: transform 0.2s ease;
      flex-shrink: 0;
    }
    .select-arrow.open {
      transform: rotate(180deg);
    }

    .custom-dropdown-menu {
      position: absolute;
      right: 0;
      top: calc(100% + 5px);
      width: 215px;
      background: #121215;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 4px;
      box-shadow: 0 14px 35px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 2px;
      animation: fadeIn 0.15s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .dropdown-header {
      padding: 4px 8px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #71717a;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      margin-bottom: 2px;
    }

    .dropdown-options-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 200px;
      overflow-y: auto;
    }

    .dropdown-option {
      width: 100%;
      padding: 6px 8px;
      border-radius: 6px;
      background: transparent;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      text-align: left;
      transition: background 0.12s;
    }
    .dropdown-option:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .dropdown-option.selected {
      background: rgba(255, 255, 255, 0.14);
    }

    .option-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .option-label {
      font-size: 11.5px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .option-id {
      font-size: 9px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #71717a;
    }

    .option-check {
      color: #34d399;
      flex-shrink: 0;
    }

    .soln-actions-row {
      display: flex;
      align-items: center;
      gap: 7px;
      width: 100%;
    }

    .btn-retry-soln {
      width: 100%;
      height: 29px;
      padding: 0 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      color: #a1a1aa;
      transition: all 0.15s ease;
      user-select: none;
    }
    .btn-retry-soln:hover {
      background: rgba(255, 255, 255, 0.09);
      border-color: rgba(255, 255, 255, 0.16);
      color: #ffffff;
    }
    .btn-retry-soln:active {
      transform: scale(0.98);
    }
    .btn-retry-soln:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      width: 100%;
      height: 33px;
      border-radius: 8px;
      font-size: 11.5px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.25);
      background: #f4f4f5;
      color: #09090b;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      transition: all 0.15s ease;
      user-select: none;
    }
    .btn-primary:hover {
      background: #ffffff;
      box-shadow: 0 4px 14px rgba(255, 255, 255, 0.18);
    }
    .btn-primary:active {
      transform: scale(0.98);
    }
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .spinner {
      width: 12px;
      height: 12px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  shadow.appendChild(style);

  // Shell Layout
  const panel = document.createElement('div');
  panel.className = 'sidebar-panel';
  panel.id = 'companion-panel';
  panel.innerHTML = `
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        ${logoUrl ? `<img src="${logoUrl}" class="brand-logo" alt="NewtCBT" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />` : ''}
        <svg class="brand-logo-fallback" ${logoUrl ? 'style="display:none;"' : ''} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
        <span class="brand-title">${isAIStudio ? 'NewtCBT' : 'NewtCBT AI Solution'}</span>
      </div>
      <div class="header-right">
        ${isAIStudio ? `<span class="header-mode-label">Test Generation</span>` : ''}
        <button class="btn-toggle-collapse" id="btn-toggle" title="Collapse Companion">
          <svg id="toggle-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      </div>
    </div>

    <!-- Collapsible Body -->
    <div class="card-body" id="card-body">
      ${isAIStudio ? `
        <!-- Progress Bar (Matching Generate Page) -->
        <div class="progress-card">
          <div class="progress-meta">
            <span class="progress-label" id="progress-label">GENERATING</span>
            <span class="progress-percent-val" id="progress-percent-text">25%</span>
          </div>
          <div class="progress-track">
            <div class="progress-bar-fill" id="progress-bar-fill" style="width: 25%;"></div>
          </div>
        </div>
        <div class="actions-footer">
          <div class="retry-hint-text">Facing problems? Try this step with diff model</div>
          <!-- Minimalist Unified Retry Step with Custom Dropdown -->
          <div class="retry-inline-wrap">
            <button class="retry-action-btn" id="btn-retry" title="Retry current step with selected model">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                <path d="M16 21h5v-5"/>
              </svg>
              <span>Retry Step with</span>
            </button>
            <div class="custom-dropdown-container" id="dropdown-container">
              <button type="button" class="custom-dropdown-trigger" id="btn-model-trigger" title="Select Model">
                <span class="model-selected-label" id="model-selected-label">3.8 Flash</span>
                <svg class="select-arrow" id="dropdown-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div class="custom-dropdown-menu" id="model-dropdown-menu" style="display: none;">
                <div class="dropdown-header">AI Studio Models</div>
                <div class="dropdown-options-list" id="dropdown-options-list"></div>
              </div>
            </div>
          </div>
          <label class="new-chat-tick-label" title="Close current chat and open a fresh tab to retry">
            <input type="checkbox" id="chk-use-new-chat" class="new-chat-tick-input" />
            <span class="new-chat-tick-text">Use new chat for retrying this step</span>
          </label>
        </div>
      ` : `
        <button class="btn-retry-soln" id="btn-retry-soln" title="Re-paste and re-submit this question">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          <span>Retry</span>
        </button>
        <button class="btn-primary" id="btn-extract-soln">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>Add Soln to NewtCBT</span>
        </button>
      `}
    </div>
  `;

  shadow.appendChild(panel);

  function mountRoot() {
    if (document.getElementById('newtcbt-companion-root')) {
      if (document.body && root.parentNode !== document.body) {
        document.body.appendChild(root);
      }
      return;
    }
    const target = document.body || document.documentElement;
    if (target) {
      target.appendChild(root);
    }
  }

  mountRoot();

  if (!document.body) {
    document.addEventListener('DOMContentLoaded', mountRoot, { once: true });
  }

  // Elements
  const btnToggle = shadow.getElementById('btn-toggle');
  const toggleIcon = shadow.getElementById('toggle-icon');
  const cardBody = shadow.getElementById('card-body');
  const progressBarFill = shadow.getElementById('progress-bar-fill');
  const progressPercentText = shadow.getElementById('progress-percent-text');
  const progressLabel = shadow.getElementById('progress-label');
  const btnRetry = shadow.getElementById('btn-retry');
  const btnModelTrigger = shadow.getElementById('btn-model-trigger');
  const modelSelectedLabel = shadow.getElementById('model-selected-label');
  const dropdownChevron = shadow.getElementById('dropdown-chevron');
  const modelDropdownMenu = shadow.getElementById('model-dropdown-menu');
  const dropdownOptionsList = shadow.getElementById('dropdown-options-list');
  const dropdownContainer = shadow.getElementById('dropdown-container');
  const btnExtractSoln = shadow.getElementById('btn-extract-soln');
  const btnRetrySoln = shadow.getElementById('btn-retry-soln');

  let isDropdownOpen = false;

  function closeDropdown() {
    isDropdownOpen = false;
    if (modelDropdownMenu) modelDropdownMenu.style.display = 'none';
    if (dropdownChevron) dropdownChevron.classList.remove('open');
  }

  function toggleDropdown(e) {
    if (e) e.stopPropagation();
    isDropdownOpen = !isDropdownOpen;
    if (modelDropdownMenu) modelDropdownMenu.style.display = isDropdownOpen ? 'flex' : 'none';
    if (dropdownChevron) dropdownChevron.classList.toggle('open', isDropdownOpen);
  }

  if (btnModelTrigger) {
    btnModelTrigger.addEventListener('click', toggleDropdown);
  }

  // Close when clicking outside within shadow DOM or outer window
  shadow.addEventListener('click', (e) => {
    if (dropdownContainer && !e.composedPath().includes(dropdownContainer)) {
      closeDropdown();
    }
  });
  window.addEventListener('click', () => {
    closeDropdown();
  });

  function renderDropdownOptions() {
    if (!dropdownOptionsList) return;
    dropdownOptionsList.innerHTML = MODEL_OPTIONS.map(m => {
      const isSelected = m.id === activeModel;
      return `
        <button type="button" class="dropdown-option ${isSelected ? 'selected' : ''}" data-model-id="${m.id}">
          <div class="option-info">
            <span class="option-label">${m.label}</span>
            <span class="option-id">${m.id}</span>
          </div>
          ${isSelected ? `
            <svg class="option-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          ` : ''}
        </button>
      `;
    }).join('');

    dropdownOptionsList.querySelectorAll('.dropdown-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const newModel = opt.getAttribute('data-model-id');
        if (newModel) {
          updateModelSelection(newModel);
          closeDropdown();

          // Persist as default model in extension storage
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
              newtcbt_alt_model: newModel,
              newtcbt_ai_studio_model: newModel
            }, () => {
              if (chrome.runtime && chrome.runtime.lastError) {
                console.warn('[NewtCBT Storage]', chrome.runtime.lastError.message);
              }
            });
          }

          // Notify NewtCBT tabs to update their default model setting
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
              type: 'UPDATE_AI_STUDIO_MODEL',
              model: newModel
            });
          }
        }
      });
    });
  }

  function updateModelSelection(modelId) {
    activeModel = modelId;
    const found = MODEL_OPTIONS.find(m => m.id === modelId);
    if (modelSelectedLabel) {
      modelSelectedLabel.innerText = found ? found.label : modelId;
    }
    renderDropdownOptions();
  }

  // Load saved default model
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['newtcbt_alt_model', 'newtcbt_ai_studio_model'], (res) => {
      const saved = res.newtcbt_alt_model || res.newtcbt_ai_studio_model || activeModel;
      if (saved) {
        updateModelSelection(saved);
      }
    });
  } else {
    updateModelSelection(activeModel);
  }

  // Toggle Collapse
  let isCollapsed = false;
  if (btnToggle && cardBody) {
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      isCollapsed = !isCollapsed;
      cardBody.style.display = isCollapsed ? 'none' : 'flex';
      if (toggleIcon) {
        toggleIcon.innerHTML = isCollapsed 
          ? `<polyline points="6 9 12 15 18 9"></polyline>`
          : `<polyline points="18 15 12 9 6 15"></polyline>`;
      }
      btnToggle.title = isCollapsed ? 'Expand Companion' : 'Collapse Companion';
    });
  }

  // Retry Step with Selected Model (AI Studio)
  if (btnRetry) {
    btnRetry.addEventListener('click', () => {
      btnRetry.disabled = true;
      btnRetry.innerHTML = `<div class="spinner"></div><span>Retrying...</span>`;

      const chkUseNewChat = shadow.getElementById('chk-use-new-chat');
      const useNewChat = chkUseNewChat ? chkUseNewChat.checked : false;

      chrome.storage.local.get(
        ['newtcbt_alt_stage', 'newtcbt_alt_file', 'newtcbt_alt_prompt',
         'newtcbt_gem_stage', 'newtcbt_gem_file', 'newtcbt_gem_prompt',
         'newtcbt_qp_file'],
        (res) => {
          const stage = res.newtcbt_alt_stage || res.newtcbt_gem_stage || 'sylvie';
          let file = res.newtcbt_alt_file || res.newtcbt_gem_file || null;
          if (!file && (stage === 'dia' || stage === 'diagram' || stage === 'crop') && res.newtcbt_qp_file) {
            file = res.newtcbt_qp_file;
          }
          const prompt = res.newtcbt_alt_prompt || res.newtcbt_gem_prompt || '';
          const newJobId = `job_${stage}_retry_${Date.now()}`;

          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            if (useNewChat) {
              // Close current tab and open a fresh AI Studio tab configured with selected model
              chrome.runtime.sendMessage({
                type: 'RETRY_IN_NEW_TAB',
                stage,
                file,
                prompt,
                jobId: newJobId,
                model: activeModel
              }, () => {
                // Background handles closing the current tab and opening the new tab
              });
            } else {
              // Retry with selected model in the SAME conversation / tab
              chrome.runtime.sendMessage({
                type: 'START_ALT_STAGE',
                stage,
                file,
                prompt,
                jobId: newJobId,
                isRetry: true,
                model: activeModel
              }, () => {
                setTimeout(() => {
                  btnRetry.disabled = false;
                  btnRetry.innerHTML = `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                      <path d="M16 21h5v-5"/>
                    </svg>
                    <span>Retry Step with</span>
                  `;
                }, 2500);
              });
            }
          }
        }
      );
    });
  }

  // Retry Question Submission (Google AI Mode / Gemini)
  if (btnRetrySoln) {
    btnRetrySoln.addEventListener('click', () => {
      btnRetrySoln.disabled = true;
      btnRetrySoln.innerHTML = `<div class="spinner"></div><span>Retrying...</span>`;
      window.postMessage({ type: 'NEWTCBT_RETRY_SUBMISSION' }, '*');
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'TRIGGER_RETRY_SUBMISSION' }, () => {
          setTimeout(() => {
            btnRetrySoln.disabled = false;
            btnRetrySoln.innerHTML = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              <span>Retry</span>
            `;
          }, 1200);
        });
      } else {
        setTimeout(() => {
          btnRetrySoln.disabled = false;
          btnRetrySoln.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            <span>Retry</span>
          `;
        }, 1200);
      }
    });
  }

  // Extract Solution (Gemini / Google AI Mode)
  if (btnExtractSoln) {
    btnExtractSoln.addEventListener('click', () => {
      btnExtractSoln.disabled = true;
      btnExtractSoln.innerHTML = `<div class="spinner"></div><span>Extracting...</span>`;
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'TRIGGER_EXTRACT_SOLN' }, (resp) => {
          if (resp && resp.success) {
            btnExtractSoln.innerHTML = `✓ Solution Added!`;
            setTimeout(() => {
              chrome.runtime.sendMessage({ type: 'FOCUS_NEWTCBT_TAB', closeCompanion: false });
              setTimeout(() => {
                btnExtractSoln.disabled = false;
                btnExtractSoln.innerHTML = `
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>Add Soln to NewtCBT</span>
                `;
              }, 1200);
            }, 800);
          } else {
            btnExtractSoln.disabled = false;
            btnExtractSoln.innerHTML = `Retry Add Soln`;
          }
        });
      }
    });
  }

  // Update UI on extension runtime messages
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return;

      if (msg.type === 'NEWTCBT_ALT_PROGRESS' || msg.type === 'NEWTCBT_GEM_PROGRESS' || msg.type === 'ALT_STAGE_PROGRESS') {
        const stage = msg.stage || currentStage;
        currentStage = stage;

        const basePercentMap = {
          sylvie: 25,
          loki: 54,
          dia: 71,
          done: 100
        };

        const stageBase = basePercentMap[stage] || 25;
        let displayPercent = msg.percent ? Math.max(stageBase, msg.percent) : stageBase;
        displayPercent = Math.min(100, Math.max(5, displayPercent));

        if (progressBarFill) {
          progressBarFill.style.width = `${displayPercent}%`;
        }
        if (progressPercentText) {
          progressPercentText.innerText = `${displayPercent}%`;
        }
        if (progressLabel) {
          progressLabel.innerText = displayPercent >= 100 ? 'COMPLETED' : 'GENERATING';
        }
      }

      if (msg.type === 'NEWTCBT_ALT_COMPLETE' || msg.type === 'ALT_STAGE_COMPLETE') {
        const completedStage = msg.stage || currentStage;
        if (completedStage === 'dia' || completedStage === 'done' || completedStage === 'final') {
          if (progressBarFill) progressBarFill.style.width = '100%';
          if (progressPercentText) progressPercentText.innerText = '100%';
          if (progressLabel) progressLabel.innerText = 'COMPLETED';
        } else if (completedStage === 'sylvie') {
          if (progressBarFill) progressBarFill.style.width = '54%';
          if (progressPercentText) progressPercentText.innerText = '54%';
        } else if (completedStage === 'loki') {
          if (progressBarFill) progressBarFill.style.width = '71%';
          if (progressPercentText) progressPercentText.innerText = '71%';
        }
      }

      if (msg.type === 'NEWTCBT_AI_STUDIO_MODEL_UPDATED' && msg.model) {
        updateModelSelection(msg.model);
      }
    });
  }

  console.log('[NewtCBT] Companion Sidebar mounted successfully on:', hostname);
})();
