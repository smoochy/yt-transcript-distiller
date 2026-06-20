import { createProvider } from './providers/index.js';
import { exportToGitHub } from './github-export.js';

// --- SCRIPT INITIALIZATION AND GUARDS ---
// This ensures the script doesn't run multiple times on a single page,
// which can happen with YouTube's dynamic navigation.
(function() {
  if (window.hasTranscriptCopier) {
    return;
  }
  window.hasTranscriptCopier = true;

  console.log("YouTube Transcript Copier initializing...");

  // --- SUPPORTED LANGUAGES (alphabetical by English name) ---
  const LANGUAGES = [
    { code: 'ar', label: chrome.i18n.getMessage('lang_ar') },
    { code: 'zh', label: chrome.i18n.getMessage('lang_zh') },
    { code: 'en', label: chrome.i18n.getMessage('lang_en') },
    { code: 'fr', label: chrome.i18n.getMessage('lang_fr') },
    { code: 'de', label: chrome.i18n.getMessage('lang_de') },
    { code: 'hi', label: chrome.i18n.getMessage('lang_hi') },
    { code: 'ja', label: chrome.i18n.getMessage('lang_ja') },
    { code: 'ko', label: chrome.i18n.getMessage('lang_ko') },
    { code: 'pt', label: chrome.i18n.getMessage('lang_pt') },
    { code: 'ru', label: chrome.i18n.getMessage('lang_ru') },
    { code: 'es', label: chrome.i18n.getMessage('lang_es') },
  ];

  // Detect browser language code, fallback to 'en'
  function detectBrowserLang() {
    const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return LANGUAGES.find(l => l.code === lang) ? lang : 'en';
  }

  // --- DEFAULT DISTILLER PROMPT ---
  const DEFAULT_DISTILLER_PROMPT = chrome.i18n.getMessage('default_prompt');

  // --- DEFAULT SETTINGS ---
  const defaultSettings = {
    includeTitle: true,
    includeUrl: true,
    includeTimestamps: true,
    useParagraphs: false,
    theme: 'dark',
  };

  // --- PROVIDER SETTINGS LOADER ---
  async function loadProviderSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get([
        'provider', 'geminiApiKey', 'openaiApiKey', 'openaiModel',
        'openrouterApiKey', 'openrouterModel',
        'distillerPrompt', 'distillerLang',
        'postComment', 'showInPopup',
        'githubExportEnabled', 'githubPat', 'githubRepo', 'githubSubfolder', 'githubFormat',
      ], resolve);
    });
  }

  async function migrateSettingsIfNeeded() {
    const local = await chrome.storage.local.get(['provider']);
    if (local.provider) return;
    const sync = await new Promise(r => chrome.storage.sync.get(['geminiApiKey', 'distillerPrompt', 'distillerLang'], r));
    if (!sync.geminiApiKey) return;
    await chrome.storage.local.set({
      provider: 'gemini',
      geminiApiKey: sync.geminiApiKey,
      distillerPrompt: sync.distillerPrompt ?? '',
      distillerLang: sync.distillerLang ?? detectBrowserLang(),
    });
  }

  // --- ROBUSTNESS VARIABLES ---
  let observer = null;
  let retryCount = 0;
  const MAX_RETRIES = 5; // Increased from 3
  let lastUrl = window.location.href;
  let isInjected = false;
  let injectionAttempts = 0;
  let urlChangeTimeout = null;

  // --- ADBLOCKER RESISTANCE STRATEGIES ---

  // Generate randomized class names to avoid detection
  function generateRandomClass() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Use randomized IDs and classes
  const randomContainerId = `yt-${generateRandomClass()}`;
  const randomButtonClass = `btn-${generateRandomClass()}`;
  const randomCopyBtnId = `copy-${generateRandomClass()}`;
  const randomSettingsBtnId = `settings-${generateRandomClass()}`;

  // --- ENHANCED URL CHANGE DETECTION ---
  function detectUrlChange() {
	  const currentUrl = window.location.href;
	  if (lastUrl !== currentUrl) {
		console.log("YouTube Transcript Copier: URL changed, cleaning up and reinitializing...");
		lastUrl = currentUrl;

		// Clean up existing button and observers
		const existingContainer = document.getElementById(randomContainerId);
		if (existingContainer) {
		  existingContainer.remove();
		}

		// Disconnect protection observer
		if (window.transcriptProtectionObserver) {
		  window.transcriptProtectionObserver.disconnect();
		  window.transcriptProtectionObserver = null;
		}

		// Reset state
		isInjected = false;
		retryCount = 0;
		injectionAttempts = 0;

		// Clear any existing timeout
		if (urlChangeTimeout) {
		  clearTimeout(urlChangeTimeout);
		}

		// Use progressive delays for better reliability
		urlChangeTimeout = setTimeout(() => {
		  initializeExtension();
		}, 1000); // Slightly increased delay
	  }
	}

  // --- BETTER TARGET DETECTION ---
  function findTargetContainer() {
    // Multiple selectors to try, combining Old and New UI injection points
    const selectors = [
      '#owner #subscribe-button',
      '#subscribe-button',
      'ytd-subscribe-button-renderer',
      '[aria-label*="Subscribe"]',
      '#owner .ytd-video-owner-renderer',
      '#owner',
      '#menu-container ytd-menu-renderer', // Old UI action menu fallback
      '#top-level-buttons-computed'        // Old UI like/dislike row fallback
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`YouTube Transcript Copier: Found target using selector: ${selector}`);
        return element;
      }
    }

    return null;
  }

  // --- WAIT FOR ELEMENT WITH TIMEOUT ---
  // --- WAIT FOR ELEMENT WITH TIMEOUT ---
  function waitForElement(selector, timeout = 4000) {
    return new Promise((resolve) => {
      const existingElement = document.querySelector(selector);
      if (existingElement) return resolve(existingElement);

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  async function scrapeTranscriptFromDOM() {
    console.log("[Transcript Debug] Starting DOM scrape fallback...");

    // 1. Expand the description if the button is hidden inside it
    const expander = document.querySelector('tp-yt-paper-button#expand, #expand-theme, #description-inline-expander');
    if (expander && expander.offsetParent !== null) {
      console.log("[Transcript Debug] Clicking description expander...");
      expander.click();
      await new Promise(r => setTimeout(r, 400));
    }

    // 2. Find and click the "Show transcript" button (Combined Old & New selectors)
    const buttonSelectors = [
      'button[aria-label*="show transcript" i]',
      'ytd-video-description-transcript-section-renderer button',
      '#primary-button button'
    ];

    let targetButton = null;
    for (const sel of buttonSelectors) {
      targetButton = document.querySelector(sel);
      if (targetButton && targetButton.offsetParent !== null) break;
    }

    if (targetButton) {
      console.log("[Transcript Debug] Found transcript button, clicking it...");
      targetButton.click();
    } else {
      console.error("[Transcript Debug] Could not find 'Show transcript' button.");
      return null;
    }

    console.log("[Transcript Debug] Waiting for transcript segments to load...");
    const segmentSelector = 'ytd-transcript-segment-renderer, transcript-segment-view-model';
    const found = await waitForElement(segmentSelector, 10000);

    if (!found) {
      console.error(`[Transcript Debug] Timeout! '${segmentSelector}' never appeared.`);
      return null;
    }

    console.log("[Transcript Debug] Segments found. Beginning scroll-and-scrape...");

    const segmentsMap = new Map();

    // Find the actual scrollable window inside the panel
    const scrollContainer = document.querySelector('ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"] #content')
                            || document.querySelector('ytd-engagement-panel-section-list-renderer[target-id*="transcript" i] #content')
                            || document.querySelector(segmentSelector).closest('#content, #contents');

    let unchangedCount = 0;
    let lastCount = 0;

    // 3. Loop to continuously scroll and scrape
    for (let i = 0; i < 150; i++) {
        const currentSegments = document.querySelectorAll(segmentSelector);

        currentSegments.forEach(seg => {
            // Combined Old & New timestamp selectors
            let timestamp = seg.querySelector('.segment-timestamp, [class*="Timestamp"]')?.textContent?.trim() || "";

            let text = "";
            // Combined Old & New text formatting selectors
            const textSpan = seg.querySelector('.yt-core-attributed-string, .segment-text, yt-formatted-string');
            if (textSpan) {
                text = textSpan.textContent.trim();
            } else {
                // Fallback for transitional UIs
                const spans = Array.from(seg.querySelectorAll('span')).filter(s =>
                    !s.className.includes('Timestamp') && !s.className.includes('A11yLabel')
                );
                text = spans.map(s => s.textContent).join(' ').trim();
            }

            if (text) {
                segmentsMap.set(timestamp + text, { timestamp, text });
            }
        });

        // Trigger the scroll to load the next batch of DOM elements
        if (scrollContainer) {
            scrollContainer.scrollBy(0, 800);
        } else {
            currentSegments[currentSegments.length - 1].scrollIntoView({ block: 'end' });
        }

        await new Promise(r => setTimeout(r, 250));

        if (segmentsMap.size === lastCount) {
            unchangedCount++;
            if (unchangedCount >= 4) break;
        } else {
            unchangedCount = 0;
        }
        lastCount = segmentsMap.size;
    }

    console.log(`[Transcript Debug] Scrape complete. Found ${segmentsMap.size} unique lines.`);

    // 4. Return formatted data
    return Array.from(segmentsMap.values()).map(data => {
        return {
            transcriptSegmentRenderer: {
                startTimeText: { simpleText: data.timestamp },
                snippet: { runs: [{ text: data.text }] }
            }
        };
    });
  }

  function applyThemeToUI(theme) {
    // Auto-detect from YouTube's own dark/light mode if not explicitly passed
    if (!theme) {
      const ytDark = document.documentElement.getAttribute('dark') !== null
                  || document.querySelector('html[dark]') !== null
                  || window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme = ytDark ? 'dark' : 'light';
    }
    const container = document.getElementById(randomContainerId);
    if (container) container.setAttribute('data-theme', theme);

    const modal = document.querySelector('.modal-content-transcript');
    if (modal) modal.setAttribute('data-theme', theme);
  }

  // --- ADBLOCKER-RESISTANT STYLING ---
  function createResistantStyles() {
    const existingStyle = document.getElementById('yt-transcript-styles');
    if (existingStyle) {
      existingStyle.remove();
    }

    const style = document.createElement('style');
    style.id = 'yt-transcript-styles';
    style.textContent = `
      /* Theme Variables - Defaults to Dark */
      #${randomContainerId}[data-theme="dark"] .${randomButtonClass},
      .modal-content-transcript[data-theme="dark"] {
        --yt-trans-bg: rgba(255, 255, 255, 0.1);
        --yt-trans-bg-hover: rgba(255, 255, 255, 0.2);
        --yt-trans-text: #f1f1f1;
        --yt-trans-border: rgba(255, 255, 255, 0.2);
        --yt-trans-modal-bg: #212121;
        --yt-trans-icon: #f1f1f1;
      }

      #${randomContainerId}[data-theme="light"] .${randomButtonClass},
      .modal-content-transcript[data-theme="light"] {
        --yt-trans-bg: rgba(0, 0, 0, 0.05);
        --yt-trans-bg-hover: rgba(0, 0, 0, 0.1);
        --yt-trans-text: #0f0f0f;
        --yt-trans-border: rgba(0, 0, 0, 0.1);
        --yt-trans-modal-bg: #ffffff;
        --yt-trans-icon: #0f0f0f;
      }

      #${randomContainerId} {
        display: flex;
        margin-left: 8px;
        align-items: center;
        position: relative;
        z-index: 1;
      }

      .${randomButtonClass} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 36px;
        padding: 0 16px;
        font-size: 14px;
        font-weight: 500;
        font-family: "Roboto", "Arial", sans-serif;
        border: none;
        cursor: pointer;
        background-color: var(--yt-trans-bg, rgba(255, 255, 255, 0.1));
        color: var(--yt-trans-text, #f1f1f1);
        transition: background-color .3s;
        outline: none;
        text-decoration: none;
        user-select: none;
      }

      .${randomButtonClass}:hover {
        background-color: var(--yt-trans-bg-hover, rgba(255, 255, 255, 0.2));
      }

      #${randomCopyBtnId} {
        border-radius: 18px 0 0 18px;
        padding-right: 12px;
      }

      #${randomSettingsBtnId} {
        border-radius: 0 18px 18px 0;
        padding: 0 10px;
        border-left: 1px solid var(--yt-trans-border, rgba(255, 255, 255, 0.2));
      }

      #${randomSettingsBtnId} svg {
        width: 20px;
        height: 20px;
        fill: var(--yt-trans-icon, #f1f1f1);
      }

      .modal-overlay-transcript {
        position: fixed;
        inset: 0;
        background-color: rgba(0, 0, 0, 0.6);
        z-index: 2500;
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .modal-content-transcript {
        background-color: var(--yt-trans-modal-bg, #212121);
        color: var(--yt-trans-text, #f1f1f1);
        padding: 24px;
        border-radius: 12px;
        width: 90%;
        max-width: 450px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        font-family: "Roboto", "Arial", sans-serif;
      }

      .modal-content-transcript h2 {
        margin-top: 0;
        margin-bottom: 24px;
        font-size: 20px;
      }

      .setting-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        min-height: 24px;
      }

      .setting-item label {
        font-size: 16px;
        padding-right: 16px;
      }

      .custom-toggle {
        appearance: none;
        width: 40px;
        height: 20px;
        background-color: #ccc;
        border-radius: 10px;
        position: relative;
        cursor: pointer;
        transition: background-color 0.2s ease-in-out;
      }

      .custom-toggle::before {
        content: '';
        position: absolute;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background-color: white;
        top: 2px;
        left: 2px;
        transition: transform 0.2s ease-in-out;
      }

      .custom-toggle:checked {
        background-color: #3ea6ff;
      }

      .custom-toggle:checked::before {
        transform: translateX(20px);
      }
    `;
    document.head.appendChild(style);
  }

  // --- CORE UI INJECTION WITH ENHANCED RELIABILITY ---
  async function injectButton() {
    injectionAttempts++;
    console.log(`YouTube Transcript Copier: Injection attempt ${injectionAttempts}`);

    // Check if our button is already on the page
    if (document.getElementById(randomContainerId)) {
      console.log("YouTube Transcript Copier: Button already exists");
      isInjected = true;
      return true;
    }

    // Wait for the target container to be available
    console.log("YouTube Transcript Copier: Waiting for target container...");
    const targetContainer = await waitForElement('#owner #subscribe-button', 8000);

    // If the element wasn't found by the specific selector, try the alternatives
    if (!targetContainer) {
      console.log("YouTube Transcript Copier: Target container not found, trying alternative selectors");
      const altTarget = findTargetContainer();
      if (!altTarget) {
        console.log("YouTube Transcript Copier: No suitable target found");
        return false;
      }
      return await injectIntoTarget(altTarget);
    }

    return await injectIntoTarget(targetContainer);
  }

  async function injectIntoTarget(targetContainer) {
    // Safety Guard: Ensure target and its parent exist before proceeding
    if (!targetContainer || !targetContainer.parentNode) {
      console.log("YouTube Transcript Copier: Target or parent missing, skipping injection");
      return false;
    }
    try {
      // Create styles first
      createResistantStyles();

      // Create the main container with randomized ID
      const container = document.createElement('div');
      container.id = randomContainerId;

      getSettings().then(() => {
        applyThemeToUI();
      });

      // Add attributes that make it look like a legitimate YouTube component
      container.setAttribute('data-yt-extension', 'transcript-copier');
      container.setAttribute('role', 'group');
      container.setAttribute('aria-label', 'Transcript tools');

      // --- Create the "Copy Transcript" part of the button ---
      const copyButton = document.createElement('button');
      copyButton.id = randomCopyBtnId;
      copyButton.className = randomButtonClass;
      copyButton.textContent = 'Transcript Distiller';
      copyButton.setAttribute('aria-label', 'Copy video transcript to clipboard');
      copyButton.setAttribute('type', 'button');
      copyButton.addEventListener('click', handleCopyClick);

      // --- Create the "Settings" gear part of the button ---
      const settingsButton = document.createElement('button');
      settingsButton.id = randomSettingsBtnId;
      settingsButton.className = randomButtonClass;
      settingsButton.title = 'Transcript Settings';
      settingsButton.setAttribute('aria-label', 'Open transcript settings');
      settingsButton.setAttribute('type', 'button');

      // Use inline SVG to avoid external resource blocking
      settingsButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
        <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
      </svg>`;
      settingsButton.addEventListener('click', openSettingsModal);

      // Add both parts to the container
      container.appendChild(copyButton);
      container.appendChild(settingsButton);



      // Insert using multiple strategies for maximum resistance
      // Strategy 1: Normal insertion
      targetContainer.parentNode.insertBefore(container, targetContainer.nextSibling);

      // Strategy 2: Force visibility with important styles
      container.style.cssText = 'display: flex !important; visibility: visible !important; opacity: 1 !important; position: relative !important;';

      // Strategy 3: Add mutation observer to detect and counter removal
      if (window.transcriptProtectionObserver) {
		  window.transcriptProtectionObserver.disconnect();
		}

		// Strategy 3: Add mutation observer to detect removal (but don't auto-reinject to avoid duplicates)
		window.transcriptProtectionObserver = new MutationObserver((mutations) => {
		  mutations.forEach((mutation) => {
			if (mutation.type === 'childList') {
			  mutation.removedNodes.forEach((node) => {
				if (node === container || (node.contains && node.contains(container))) {
				  console.log("Transcript button removed, marking for re-injection on next check");
				  isInjected = false;
				}
			  });
			}
		  });
		});

		window.transcriptProtectionObserver.observe(targetContainer.parentNode, {
		  childList: true,
		  subtree: false  // Changed from true to false to reduce overhead
		});

      console.log("Transcript Copier: Button injected successfully with adblocker resistance.");
      isInjected = true;
      return true;

    } catch (error) {
      console.error("Failed to inject button:", error);
      return false;
    }
  }

  // --- STORAGE FALLBACK SYSTEM ---
	const STORAGE_KEY = 'yt-transcript-settings';

	// Make getSettings an async function for better control over async operations
	async function getSettings() {
	  // This helper function wraps the storage API call in a Promise with a timeout
	  // to prevent hanging if the API call doesn't respond or throws.
	  function getStoragePromise(api) {
		return new Promise(async (resolve, reject) => {
		  // Set a timeout to reject the promise if storage API doesn't respond
		  const timeoutId = setTimeout(() => reject(new Error("Storage operation timed out")), 500); // 500ms timeout

		  try {
			// Use the API's 'get' method. The callback 'result' will be the settings.
			api.get(defaultSettings, (result) => {
			  clearTimeout(timeoutId); // Clear timeout if callback is called
			  if (chrome.runtime.lastError) { // Check for errors reported by the browser API
				reject(chrome.runtime.lastError);
			  } else {
				resolve(result); // Resolve with the retrieved settings
			  }
			});
		  } catch (e) {
			clearTimeout(timeoutId);
			reject(e); // Catch any synchronous errors during the API call setup
		  }
		});
	  }

	  // 1. Try browser.storage.sync (or chrome.storage.sync for compatibility)
	  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
		try {
		  const storedSettings = await getStoragePromise(chrome.storage.sync);
		  // Merge with default settings to ensure all keys are present
		  return { ...defaultSettings, ...storedSettings };
		} catch (e) {
		  console.warn("YouTube Transcript Copier: Chrome storage error or timeout, falling back to localStorage:", e);
		  // Continue to localStorage fallback if chrome.storage fails
		}
	  }

	  // 2. Fallback to localStorage
	  try {
		const stored = localStorage.getItem(STORAGE_KEY);
		const settings = stored ? JSON.parse(stored) : {}; // Parse to object, then merge
		return { ...defaultSettings, ...settings }; // Ensure defaults are merged
	  } catch (e) {
		console.warn("YouTube Transcript Copier: localStorage error, using default settings:", e);
		return defaultSettings; // Return default settings if localStorage also fails
	  }
	}

	// Function to set settings (similar robustness needed)
	function setSettings(settings) {
	  // 1. Try browser.storage.sync (or chrome.storage.sync)
	  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
		try {
		  chrome.storage.sync.set(settings, () => {
			if (chrome.runtime.lastError) {
			  console.warn("YouTube Transcript Copier: Error setting Chrome storage:", chrome.runtime.lastError);
			  // Fallback to localStorage if setting sync storage fails
			  try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
			  } catch (e) {
				console.warn("YouTube Transcript Copier: localStorage not available, settings will not persist:", e);
			  }
			}
		  });
		  return; // Exit if sync storage attempt is made
		} catch (e) {
		  console.warn("YouTube Transcript Copier: Error accessing Chrome storage for set, falling back to localStorage:", e);
		  // Continue to localStorage fallback
		}
	  }

	  // 2. Fallback to localStorage
	  try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	  } catch (e) {
		console.warn("YouTube Transcript Copier: localStorage not available, settings will not persist:", e);
	  }
	}

  function openSettingsModal() {
    if (document.querySelector('.modal-overlay-transcript')) return;

    applyThemeToUI();
    const isDark = (document.getElementById(randomContainerId)?.getAttribute('data-theme') !== 'light');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay-transcript';

    const modal = document.createElement('div');
    modal.className = 'modal-content-transcript';
    modal.setAttribute('data-theme', isDark ? 'dark' : 'light');

    // Build modal via DOM (no innerHTML) to satisfy AMO linter
    const h2 = document.createElement('h2');
    h2.textContent = chrome.i18n.getMessage('modal_title');
    modal.appendChild(h2);

    // --- API Key section ---
    const apiSection = document.createElement('div');
    apiSection.className = 'setting-item';
    apiSection.style.cssText = 'flex-direction:column; align-items:flex-start; gap:6px;';

    const apiLabel = document.createElement('label');
    apiLabel.htmlFor = 'td-api-key';
    apiLabel.style.fontSize = '14px';
    apiLabel.textContent = chrome.i18n.getMessage('lbl_apikey') + ' ';
    const apiLink = document.createElement('a');
    apiLink.href = 'https://aistudio.google.com/app/apikey';
    apiLink.target = '_blank';
    apiLink.style.cssText = 'margin-left:8px; font-size:12px; color:#3ea6ff; text-decoration:none;';
    apiLink.textContent = chrome.i18n.getMessage('lbl_apikey_link');
    apiLabel.appendChild(apiLink);
    apiSection.appendChild(apiLabel);

    const apiRow = document.createElement('div');
    apiRow.style.cssText = 'display:flex; gap:6px; width:100%;';
    const apiInput = document.createElement('input');
    apiInput.type = 'password';
    apiInput.id = 'td-api-key';
    apiInput.placeholder = 'AIza…';
    apiInput.autocomplete = 'off';
    apiInput.spellcheck = false;
    apiInput.style.cssText = 'flex:1; background:var(--yt-trans-bg); border:1px solid var(--yt-trans-border); border-radius:6px; color:var(--yt-trans-text); font-size:13px; padding:7px 10px; outline:none;';
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'td-toggle-key';
    toggleBtn.style.cssText = 'background:var(--yt-trans-bg); border:1px solid var(--yt-trans-border); border-radius:6px; color:var(--yt-trans-text); font-size:12px; padding:7px 10px; cursor:pointer; white-space:nowrap;';
    toggleBtn.textContent = chrome.i18n.getMessage('btn_show');
    apiRow.appendChild(apiInput);
    apiRow.appendChild(toggleBtn);
    apiSection.appendChild(apiRow);
    modal.appendChild(apiSection);

    // --- Language section ---
    const langSection = document.createElement('div');
    langSection.className = 'setting-item';
    langSection.style.cssText = 'flex-direction:column; align-items:flex-start; gap:6px; margin-top:12px;';
    const langLabel = document.createElement('label');
    langLabel.htmlFor = 'td-lang';
    langLabel.style.fontSize = '14px';
    langLabel.textContent = chrome.i18n.getMessage('lbl_lang');
    const langSelect = document.createElement('select');
    langSelect.id = 'td-lang';
    langSelect.style.cssText = 'width:100%; background:var(--yt-trans-bg); border:1px solid var(--yt-trans-border); border-radius:6px; color:var(--yt-trans-text); font-size:13px; padding:7px 10px; outline:none; cursor:pointer;';
    LANGUAGES.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = l.label;
      langSelect.appendChild(opt);
    });
    langSection.appendChild(langLabel);
    langSection.appendChild(langSelect);
    modal.appendChild(langSection);

    // --- Prompt section ---
    const promptSection = document.createElement('div');
    promptSection.className = 'setting-item';
    promptSection.style.cssText = 'flex-direction:column; align-items:flex-start; gap:6px; margin-top:12px;';
    const promptHeader = document.createElement('div');
    promptHeader.style.cssText = 'display:flex; justify-content:space-between; align-items:center; width:100%;';
    const promptLabel = document.createElement('label');
    promptLabel.htmlFor = 'td-prompt';
    promptLabel.style.fontSize = '14px';
    promptLabel.textContent = chrome.i18n.getMessage('lbl_prompt');
    const resetBtn = document.createElement('button');
    resetBtn.id = 'td-reset-prompt';
    resetBtn.style.cssText = 'background:none; border:1px solid var(--yt-trans-border); border-radius:5px; color:#aaa; font-size:11px; padding:3px 8px; cursor:pointer;';
    resetBtn.textContent = chrome.i18n.getMessage('btn_reset');
    promptHeader.appendChild(promptLabel);
    promptHeader.appendChild(resetBtn);
    const promptArea = document.createElement('textarea');
    promptArea.id = 'td-prompt';
    promptArea.rows = 4;
    promptArea.spellcheck = false;
    promptArea.style.cssText = 'width:100%; box-sizing:border-box; background:var(--yt-trans-bg); border:1px solid var(--yt-trans-border); border-radius:6px; color:var(--yt-trans-text); font-size:13px; padding:7px 10px; outline:none; resize:vertical; font-family:Roboto,Arial,sans-serif; line-height:1.5;';
    promptSection.appendChild(promptHeader);
    promptSection.appendChild(promptArea);
    modal.appendChild(promptSection);

    // --- Buttons row ---
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; justify-content:flex-end; gap:8px; margin-top:16px;';
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'td-cancel';
    cancelBtn.style.cssText = 'background:var(--yt-trans-bg); border:1px solid var(--yt-trans-border); border-radius:6px; color:var(--yt-trans-text); font-size:14px; padding:8px 16px; cursor:pointer;';
    cancelBtn.textContent = chrome.i18n.getMessage('btn_cancel');
    const saveBtn = document.createElement('button');
    saveBtn.id = 'td-save';
    saveBtn.style.cssText = 'background:#3ea6ff; border:none; border-radius:6px; color:#000; font-size:14px; font-weight:600; padding:8px 16px; cursor:pointer;';
    saveBtn.textContent = chrome.i18n.getMessage('btn_save');
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    modal.appendChild(btnRow);

    const statusDiv = document.createElement('div');
    statusDiv.id = 'td-status';
    statusDiv.style.cssText = 'text-align:right; font-size:12px; color:#4ade80; margin-top:6px; min-height:16px;';
    modal.appendChild(statusDiv);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Load current values — hide API section if key already set
    chrome.storage.sync.get(['geminiApiKey', 'distillerPrompt', 'distillerLang', 'invalidKey'], (r) => {
      const hasKey = !!(r.geminiApiKey && r.geminiApiKey.trim());
      const keyInvalid = !!(r.invalidKey);

      // Show API section only if no key set, or key was marked invalid
      if (hasKey && !keyInvalid) {
        apiSection.style.display = 'none';
      } else {
        apiSection.style.display = '';
        document.getElementById('td-api-key').value = r.geminiApiKey || '';
        if (keyInvalid) {
          const warn = document.createElement('div');
          warn.style.cssText = 'color:#f87171; font-size:12px; margin-top:4px;';
          warn.textContent = chrome.i18n.getMessage('err_key_invalid') || '⚠ API Key ungültig – bitte neu eingeben.';
          apiSection.appendChild(warn);
        }
      }

      document.getElementById('td-prompt').value = r.distillerPrompt || DEFAULT_DISTILLER_PROMPT;
      document.getElementById('td-lang').value = r.distillerLang || detectBrowserLang();
    });

    // Reset prompt to default
    document.getElementById('td-reset-prompt').addEventListener('click', () => {
      document.getElementById('td-prompt').value = DEFAULT_DISTILLER_PROMPT;
    });

    // Toggle show/hide key
    document.getElementById('td-toggle-key').addEventListener('click', () => {
      const inp = document.getElementById('td-api-key');
      const btn = document.getElementById('td-toggle-key');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      btn.textContent = inp.type === 'password' ? chrome.i18n.getMessage('btn_show') : chrome.i18n.getMessage('btn_hide');
    });

    // Close on overlay click or cancel
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('td-cancel').addEventListener('click', () => overlay.remove());

    // Save
    document.getElementById('td-save').addEventListener('click', () => {
      const keyInput = document.getElementById('td-api-key');
      const existingKey = !!(keyInput.closest('div') && apiSection.style.display === 'none');
      const prompt = document.getElementById('td-prompt').value.trim() || DEFAULT_DISTILLER_PROMPT;
      const lang   = document.getElementById('td-lang').value || detectBrowserLang();
      const status = document.getElementById('td-status');

      // If API section hidden, save without touching the key
      if (apiSection.style.display === 'none') {
        chrome.storage.sync.set({ distillerPrompt: prompt, distillerLang: lang }, () => {
          if (chrome.runtime.lastError) {
            status.style.color = '#f87171';
            status.textContent = chrome.i18n.getMessage('msg_save_error');
          } else {
            status.style.color = '#4ade80';
            status.textContent = chrome.i18n.getMessage('msg_saved');
            setTimeout(() => overlay.remove(), 800);
          }
        });
        return;
      }

      const key = keyInput.value.trim();
      if (!key) {
        status.style.color = '#f87171';
        status.textContent = chrome.i18n.getMessage('msg_no_key');
        return;
      }

      chrome.storage.sync.set({ geminiApiKey: key, distillerPrompt: prompt, distillerLang: lang, invalidKey: false }, () => {
        if (chrome.runtime.lastError) {
          status.style.color = '#f87171';
          status.textContent = chrome.i18n.getMessage('msg_save_error');
        } else {
          status.style.color = '#4ade80';
          status.textContent = chrome.i18n.getMessage('msg_saved');
          setTimeout(() => overlay.remove(), 800);
        }
      });
    });
  }

  // --- COMMENT FIELD INJECTION LOGIC ---
  async function injectTextIntoCommentField(text) {
    // 1. Scroll to comments section to trigger lazy loading
    const commentsSection = document.querySelector('#comments');
    if (!commentsSection) {
      throw new Error(chrome.i18n.getMessage('err_no_comments'));
    }
    commentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await new Promise(r => setTimeout(r, 1200));

    // 2. Find and click the comment input placeholder to activate it
    const placeholder = await waitForElement(
      '#simplebox-placeholder, ytd-comment-simplebox-renderer #placeholder-area',
      6000
    );
    if (!placeholder) {
      throw new Error(chrome.i18n.getMessage('err_no_field'));
    }
    placeholder.click();
    await new Promise(r => setTimeout(r, 800));

    // 3. Find the actual contenteditable field that appears after clicking
    const editor = await waitForElement(
      '#contenteditable-root, ytd-comment-simplebox-renderer [contenteditable="true"]',
      5000
    );
    if (!editor) {
      throw new Error(chrome.i18n.getMessage('err_no_editor'));
    }

    editor.focus();
    await new Promise(r => setTimeout(r, 200));

    // 4. Clear existing content
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);

    // 5. Write full text to clipboard, then paste — bypasses execCommand length limits
    await navigator.clipboard.writeText(text);

    // Synthetic paste event: YouTube's editor handles this natively without truncation
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer()
    });
    pasteEvent.clipboardData.setData('text/plain', text);
    editor.dispatchEvent(pasteEvent);

    await new Promise(r => setTimeout(r, 150));

    // 6. Verify something landed — if paste event was swallowed, fall back to execCommand chunks
    if (!editor.textContent.trim()) {
      console.warn("[Distiller] Paste event swallowed, trying execCommand fallback...");
      const CHUNK = 500;
      for (let i = 0; i < text.length; i += CHUNK) {
        document.execCommand('insertText', false, text.slice(i, i + CHUNK));
        await new Promise(r => setTimeout(r, 30));
      }
    }

    // 7. Fire input event so YouTube's internal state updates
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  }

  // --- USAGE STATISTICS PING ---
  async function pingStats(langResponse, langBrowser, langUi) {
    try {
      await fetch('https://marsgasse.com/api/addon-stats.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addon:         'yt-transcript-distiller',
          action:        'distill',
          lang_response: langResponse,
          lang_browser:  langBrowser,
          lang_ui:       langUi,
        }),
      });
    } catch (e) {
      // Fire-and-forget – Fehler ignorieren
    }
  }

  // --- GEMINI API CALL ---
  async function callGeminiApi(apiKey, prompt, transcriptText) {
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
      contents: [{
        parts: [{
          text: `${prompt}\n\n${transcriptText}`
        }]
      }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) {
        chrome.storage.sync.set({ invalidKey: true });
      }
      throw new Error(`Gemini API Fehler: ${msg}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini hat keine verwertbare Antwort zurückgegeben.");
    return text.trim();
  }

  // --- MAIN DISTILLER LOGIC ---
  const AMO_LINK = 'addons.mozilla.org/addon/youtube-transcript-distiller';

  // --- FOOTER TEXT BY RESPONSE LANGUAGE ---
  const FOOTER_BY_LANG = {
    'en': `boiled down by Transcript Distiller\n${AMO_LINK}`,
    'de': `Eingedampft mit Transcript Distiller\n${AMO_LINK}`,
    'fr': `condensé par Transcript Distiller\n${AMO_LINK}`,
    'es': `resumido por Transcript Distiller\n${AMO_LINK}`,
    'pt': `destilado por Transcript Distiller\n${AMO_LINK}`,
    'ru': `сжато с помощью Transcript Distiller\n${AMO_LINK}`,
    'ar': `مُلخَّص بواسطة Transcript Distiller\n${AMO_LINK}`,
    'zh': `由 Transcript Distiller 提炼\n${AMO_LINK}`,
    'hi': `Transcript Distiller द्वारा सारांशित\n${AMO_LINK}`,
    'ja': `Transcript Distillerで要約\n${AMO_LINK}`,
    'ko': `Transcript Distiller로 요약됨\n${AMO_LINK}`,
  };

  function getFooterForLang(langCode) {
    return FOOTER_BY_LANG[langCode] || FOOTER_BY_LANG['en'];
  }

  // --- QUOTA COUNTDOWN ON BUTTON ---
  function startQuotaCountdown(copyButton, originalText, seconds) {
    let remaining = Math.ceil(seconds);
    copyButton.disabled = false; // Button bleibt klickbar

    const tick = () => {
      if (remaining <= 0) {
        copyButton.textContent = originalText;
        return;
      }
      copyButton.textContent = `⏳ ${remaining}s`;
      remaining--;
      setTimeout(tick, 1000);
    };
    tick();
  }

  // --- PARSE RETRY SECONDS FROM GEMINI ERROR MESSAGE ---
  function parseRetrySeconds(message) {
    const match = message.match(/retry in ([\d.]+)s/i);
    return match ? parseFloat(match[1]) : null;
  }

  async function handleCopyClick() {
    const copyButton = document.getElementById(randomCopyBtnId);
    const originalText = 'Transcript Distiller';

    copyButton.disabled = true;
    let langCode = 'en';

    try {
      // 1. Migrate legacy sync settings on first run
      await migrateSettingsIfNeeded();

      // 2. Load provider settings from local storage
      copyButton.textContent = chrome.i18n.getMessage('btn_fetching');
      const providerSettings = await loadProviderSettings();

      // Build prompt with language instruction (same logic as upstream)
      const lang = providerSettings.distillerLang || detectBrowserLang();
      langCode = lang;
      const langEntry = LANGUAGES.find(l => l.code === lang);
      const langName = langEntry ? langEntry.label.split(' — ')[0].trim() : 'English';
      const prompt = providerSettings.distillerPrompt || DEFAULT_DISTILLER_PROMPT;
      const userPrompt = `${prompt}\n\nRespond exclusively in ${langName}.`;

      // 3. Transkript holen
      copyButton.textContent = chrome.i18n.getMessage('btn_fetching');
      const transcriptObj = await getTranscriptDict(window.location.href);
      if (!transcriptObj || !transcriptObj.transcript.length) {
        throw new Error(chrome.i18n.getMessage('err_no_transcript'));
      }

      // 4. Transkript formatieren
      const transcriptText = transcriptObj.transcript
        .map(([, text]) => text)
        .join(' ');

      // 5. Summarize with selected provider
      copyButton.textContent = chrome.i18n.getMessage('btn_thinking');
      const provider = await createProvider(providerSettings);
      const summary = await provider.summarize(transcriptText, userPrompt);

      // Footer in der gewählten Antwortsprache
      const finalText = `${summary}\n\n${getFooterForLang(langCode)}`;

      // 6a. GitHub export (non-blocking, errors shown as button title)
      if (providerSettings.githubExportEnabled && providerSettings.githubPat && providerSettings.githubRepo) {
        const videoId = new URL(window.location.href).searchParams.get('v') ?? 'unknown';
        const date = new Date().toISOString().split('T')[0];
        exportToGitHub({
          pat: providerSettings.githubPat,
          repo: providerSettings.githubRepo,
          subfolder: providerSettings.githubSubfolder || '',
          format: providerSettings.githubFormat || 'markdown',
          videoId,
          title: document.title.replace(' - YouTube', '').trim(),
          url: window.location.href,
          date,
          provider: providerSettings.provider || 'gemini',
          model: providerSettings.openrouterModel || providerSettings.openaiModel || 'gemini-2.5-flash',
          summary,
          transcript: transcriptText,
        }).catch(err => {
          console.error('GitHub export failed:', err);
          const btn = document.getElementById(randomCopyBtnId);
          if (btn) btn.title = `GitHub export failed: ${err.message}`;
        });
      }

      // 6b. Post comment (conditional on postComment setting)
      if (providerSettings.postComment !== false) {
        copyButton.textContent = chrome.i18n.getMessage('btn_injecting');
        await injectTextIntoCommentField(finalText);
      }

      // Statistik-Ping nur wenn Telemetrie aktiviert (default: an)
      chrome.storage.sync.get(['telemetryEnabled'], (r) => {
        if (r.telemetryEnabled !== false) {
          pingStats(langCode, navigator.language || 'unknown', chrome.i18n.getUILanguage() || 'unknown');
        }
      });

      copyButton.textContent = chrome.i18n.getMessage('btn_done');

    } catch (err) {
      console.error("Transcript Distiller Fehler:", err);

      // Quota-Fehler: Countdown anzeigen
      const retrySeconds = parseRetrySeconds(err.message);
      if (retrySeconds) {
        alert(`Transcript Distiller:\n\n${err.message}`);
        startQuotaCountdown(copyButton, originalText, retrySeconds);
        return; // finally überspringen
      }

      copyButton.textContent = chrome.i18n.getMessage('btn_error');
      alert(`Transcript Distiller:\n\n${err.message}`);
    } finally {
      setTimeout(() => {
        copyButton.textContent = originalText;
        copyButton.disabled = false;
      }, 3000);
    }
  }

  // --- ROBUST JSON EXTRACTOR ---
  function extractJsonVariable(content, variableName) {
      const prefix = `var ${variableName} =`;
      const startIndex = content.indexOf(prefix);
      if (startIndex === -1) return null;

      let braceStart = content.indexOf('{', startIndex);
      if (braceStart === -1) return null;

      let balance = 0;
      let inString = false;
      let escape = false;

      // Walk through characters to find the matching closing brace
      for (let i = braceStart; i < content.length; i++) {
        const char = content[i];

        if (escape) { escape = false; continue; }
        if (char === '\\') { escape = true; continue; }
        if (char === '"') { inString = !inString; continue; }

        if (!inString) {
           if (char === '{') balance++;
           else if (char === '}') {
              balance--;
              if (balance === 0) {
                 try {
                    return JSON.parse(content.substring(braceStart, i + 1));
                 } catch (e) { return null; }
              }
           }
        }
      }
      return null;
  }

  // --- TRANSCRIPT FETCHING LOGIC (VIDEOS ONLY) ---
  async function getTranscriptDict(videoUrl) {
      // The try/catch was removed here so the actual error bubbles up to handleCopyClick
      const { title, ytData } = await resolveYouTubeData(videoUrl);
      const segments = await getTranscriptItems(ytData);

      if (!segments || !segments.length) {
          throw new Error("No transcript segments found.");
      }

      const transcript = segments.map(item => getSegmentData(item));
      return { title, transcript };
  }

  async function resolveYouTubeData(videoUrl) {
      console.log(`[Transcript Debug] Resolving data for URL: ${videoUrl}`);

      let ytData = window.ytInitialData;
      if (ytData) console.log("[Transcript Debug] Found ytInitialData in global window object.");

      if (!ytData) {
          console.log("[Transcript Debug] Global object missing, scanning script tags...");
          const scripts = document.getElementsByTagName('script');
          for (let script of scripts) {
              if (script.textContent.includes('var ytInitialData =')) {
                  ytData = extractJsonVariable(script.textContent, 'ytInitialData');
                  if (ytData) {
                      console.log("[Transcript Debug] Successfully extracted ytInitialData from script tag.");
                      break;
                  }
              }
          }
      }

      if (!ytData) {
          console.log("[Transcript Debug] Script tag scan failed, fetching raw HTML fallback...");
          try {
              const html = await fetch(videoUrl).then(res => res.text());
              ytData = extractJsonFromHtml(html, "ytInitialData");
              console.log(ytData ? "[Transcript Debug] HTML fetch succeeded." : "[Transcript Debug] HTML fetch returned null.");
          } catch (e) {
              console.warn("[Transcript Debug] Fetch fallback failed:", e);
          }
      }

      const domTitle = document.querySelector("#title h1")?.textContent?.trim() ||
                       document.querySelector("h1.ytd-watch-metadata")?.textContent?.trim();

      const title = domTitle ||
                    ytData?.videoDetails?.title ||
                    document.querySelector('meta[name="title"]')?.content ||
                    document.title.replace(" - YouTube", "") ||
                    "Unknown Title";

      console.log(`[Transcript Debug] Resolved Title: "${title}"`);
      return { title, ytData };
  }

  function getSegmentData(item) {
      const seg = item?.transcriptSegmentRenderer;
      if (!seg) return ["", ""];
      const timestamp = seg.startTimeText?.simpleText || "";
      const text = seg.snippet?.runs?.map(r => r.text).join("") || "";
      return [timestamp, text];
  }

  async function getTranscriptItems(ytData) {
    console.log("[Transcript Debug] Attempting to fetch transcript items...");

    // STRATEGY 1: Try the API first
    try {
      console.log("[Transcript Debug] Strategy 1: Attempting internal API fetch...");
      const stringified = JSON.stringify(ytData);
      const paramMatch = stringified.match(/"getTranscriptEndpoint":\s*{\s*"params":\s*"([^"]+)"/);
      const continuationParams = paramMatch ? paramMatch[1] : null;

      if (continuationParams) {
        console.log("[Transcript Debug] Found continuationParams:", continuationParams);

        const apiKey = document.documentElement.innerHTML.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
        const clientVersion = document.documentElement.innerHTML.match(/"clientVersion":"([^"]+)"/)?.[1] || "2.20260306.01.00";

        if (!apiKey) {
           console.warn("[Transcript Debug] Could not find INNERTUBE_API_KEY in document.");
        } else {
          console.log(`[Transcript Debug] Using dynamically found clientVersion: ${clientVersion}`);

          // Added hl, gl, and userAgent to prevent 400 Bad Request errors
          const body = {
            context: {
              client: {
                clientName: "WEB",
                clientVersion: clientVersion,
                hl: "en",
                gl: "US",
                userAgent: navigator.userAgent
              }
            },
            params: continuationParams
          };

          const res = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });

          if (!res.ok) {
             console.warn(`[Transcript Debug] API returned ${res.status} ${res.statusText}`);
          } else {
             const json = await res.json();
             const items = json.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments;

             if (items && items.length > 0) {
               console.log(`[Transcript Debug] Strategy 1 Success: Retrieved ${items.length} items from API.`);
               return items;
             } else {
               console.warn("[Transcript Debug] API returned successful response, but no segments were found in the JSON.", json);
             }
          }
        }
      } else {
         console.warn("[Transcript Debug] getTranscriptEndpoint params not found in ytData.");
      }
    } catch (e) {
      console.warn("[Transcript Debug] API Strategy failed completely:", e);
    }

    console.log("[Transcript Debug] API Strategy failed or returned empty. Falling back to DOM Scrape.");

    // STRATEGY 2: Scrape the UI
    const domItems = await scrapeTranscriptFromDOM();
    if (domItems) return domItems;

    throw new Error("Transcript panel not available. Try opening the transcript manually, then click the button again.");
  }

  function extractJsonFromHtml(html, key) {
    const regexes = [
      new RegExp(`window\\["${key}"\\]\\s*=\\s*({[\\s\\S]+?})\\s*;`),
      new RegExp(`var ${key}\\s*=\\s*({[\\s\\S]+?})\\s*;`),
      new RegExp(`${key}\\s*=\\s*({[\\s\\S]+?})\\s*;`)
    ];

    for (const regex of regexes) {
      const match = html.match(regex);
      if (match && match[1]) {
        try { return JSON.parse(match[1]); } catch (e) {}
      }
    }
    // Final check: look at global window (works if not in strict isolation)
    if (window[key]) return window[key];
    return null;
  }

  // --- ENHANCED OBSERVER LOGIC WITH AUTO-RECOVERY ---
  function setupObserver() {
	  // Disconnect existing observer if it exists
	  if (observer) {
		observer.disconnect();
	  }

	  let lastCheckTime = 0;
	  const CHECK_THROTTLE = 1000; // Only check once per second

	  observer = new MutationObserver((mutations) => {
		const now = Date.now();

		// Check for URL changes first (always do this)
		detectUrlChange();

		// Throttle the injection checks to prevent rapid-fire attempts
		if (now - lastCheckTime < CHECK_THROTTLE) {
		  return;
		}
		lastCheckTime = now;

		// Only try to inject if we haven't successfully injected yet
		if (!isInjected) {
		  // Check for any of our potential target containers
		  if (findTargetContainer()) {
			injectButton().then(success => {
			  if (success) {
				retryCount = 0;
			  }
			});
		  }
		}

		// Check if our button was removed (YouTube navigation can remove elements)
		if (isInjected && !document.getElementById(randomContainerId)) {
		  console.log("YouTube Transcript Copier: Button was removed, marking for re-injection");
		  isInjected = false;
		}
	  });

	  // Start observing with robust configuration
	  try {
		observer.observe(document.body, {
		  childList: true,
		  subtree: true,
		  attributes: false,
		  attributeOldValue: false,
		  characterData: false,
		  characterDataOldValue: false
		});
		console.log("YouTube Transcript Copier: Observer started successfully");
	  } catch (error) {
		console.error("YouTube Transcript Copier: Failed to start observer:", error);
		setTimeout(setupObserver, 2000);
	  }
	}

  // --- INITIALIZATION WITH PROGRESSIVE RETRY LOGIC ---
  async function initializeExtension() {
    console.log("YouTube Transcript Copier: Initializing extension...");

    const success = await injectButton();
    if (success) {
      console.log("YouTube Transcript Copier: Immediate injection successful");
      retryCount = 0;
    } else {
      console.log("YouTube Transcript Copier: Immediate injection failed, setting up observer and retry logic");
    }

    setupObserver();

    // Progressive retry with increasing delays
    const retryDelays = [2000, 4000, 6000, 8000, 10000];

    const retryInterval = setInterval(async () => {
      if (!isInjected && retryCount < MAX_RETRIES) {
        const delay = retryDelays[retryCount] || 10000;
        console.log(`YouTube Transcript Copier: Retry attempt ${retryCount + 1}/${MAX_RETRIES} (delay: ${delay}ms)`);

        const success = await injectButton();
        if (success) {
          clearInterval(retryInterval);
          retryCount = 0;
        } else {
          retryCount++;
        }
      } else if (retryCount >= MAX_RETRIES) {
        console.log("YouTube Transcript Copier: Max retries reached, will try again on next page change");
        clearInterval(retryInterval);
      } else if (isInjected) {
        clearInterval(retryInterval);
      }
    }, 2000);
  }

  // --- ENHANCED PAGE VISIBILITY HANDLING ---
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isInjected) {
      console.log("YouTube Transcript Copier: Page became visible, checking injection status");
      setTimeout(initializeExtension, 500);
    }
  });

  // --- PERIODIC HEALTH CHECK WITH ADBLOCKER DETECTION ---
  setInterval(() => {
    if (isInjected && !document.getElementById(randomContainerId)) {
      console.log("YouTube Transcript Copier: Health check failed (possible adblocker interference), reinitializing");
      isInjected = false;
      injectionAttempts = 0;
      initializeExtension();
    }
  }, 30000);

  // --- READY STATE HANDLING ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initializeExtension, 1200);
    });
  } else {
    setTimeout(initializeExtension, 1200);
  }

})();
