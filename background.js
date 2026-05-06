// Background Service Worker - Sleep Timer + Lyrics

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'START_TIMER':
      startTimer(message.duration, message.tabId, sendResponse);
      return true;

    case 'CANCEL_TIMER':
      cancelTimer(sendResponse);
      return true;

    case 'GET_TIMER_STATUS':
      getTimerStatus(sendResponse);
      return true;

    case 'FETCH_LYRICS':
      fetchLyrics(message.title, message.artist, message.duration).then(sendResponse);
      return true;
  }
});

// Lyrics fetcher - LRCLIB API (matches by video duration to pick correct version)
async function fetchLyrics(title, artist, duration) {
  const durationKey = duration != null ? Math.round(duration) : 'any';
  const cacheKey = `lyrics_${title}_${artist}_${durationKey}`.toLowerCase().replace(/\s+/g, '_');

  // Check cache first
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) {
    return cached[cacheKey];
  }

  try {
    const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const results = await response.json();
    if (!Array.isArray(results)) return null;

    // Filter to results that have synced lyrics
    const synced = results.filter(r => r.syncedLyrics);
    if (synced.length === 0) return null;

    let best;
    if (duration != null) {
      // Pick result whose duration is closest to the video's duration
      best = synced.reduce((a, b) => {
        const diffA = Math.abs((a.duration || 0) - duration);
        const diffB = Math.abs((b.duration || 0) - duration);
        return diffA <= diffB ? a : b;
      });
    } else {
      // No duration available, fall back to first result
      best = synced[0];
    }

    const lyrics = best.syncedLyrics;
    await chrome.storage.local.set({ [cacheKey]: lyrics });
    return lyrics;
  } catch (error) {
    console.error('LRCLIB fetch error:', error);
  }

  return null;
}

function startTimer(duration, tabId, sendResponse) {
  const endTime = Date.now() + duration;

  chrome.storage.local.set({
    sleepTimer: {
      active: true,
      endTime: endTime,
      tabId: tabId,
      duration: duration
    }
  });

  chrome.alarms.create('sleepTimer', { when: endTime });

  sendResponse({ success: true, endTime: endTime });
}

function cancelTimer(sendResponse) {
  chrome.alarms.clear('sleepTimer');
  chrome.storage.local.remove('sleepTimer');
  sendResponse({ success: true });
}

function getTimerStatus(sendResponse) {
  chrome.storage.local.get('sleepTimer', (data) => {
    if (data.sleepTimer?.active && data.sleepTimer.endTime > Date.now()) {
      sendResponse({
        active: true,
        endTime: data.sleepTimer.endTime,
        tabId: data.sleepTimer.tabId
      });
    } else {
      chrome.storage.local.remove('sleepTimer');
      sendResponse({ active: false });
    }
  });
}

// Handle alarm firing
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sleepTimer') {
    chrome.storage.local.get('sleepTimer', (data) => {
      if (data.sleepTimer?.tabId) {
        chrome.scripting.executeScript({
          target: { tabId: data.sleepTimer.tabId },
          func: () => {
            const btn = document.querySelector('ytmusic-player-bar #play-pause-button button');
            if (btn && btn.getAttribute('aria-label')?.toLowerCase().includes('pause')) {
              btn.click();
            }
          }
        }).catch(err => console.error('Sleep timer: failed to pause', err));
      }
      chrome.storage.local.remove('sleepTimer');
    });
  }
});

// Handle tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get('sleepTimer', (data) => {
    if (data.sleepTimer?.tabId === tabId) {
      chrome.alarms.clear('sleepTimer');
      chrome.storage.local.remove('sleepTimer');
    }
  });
});

// Handle navigation away from YouTube Music
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    chrome.storage.local.get('sleepTimer', (data) => {
      if (data.sleepTimer?.tabId === tabId) {
        if (!tab.url.includes('music.youtube.com')) {
          chrome.alarms.clear('sleepTimer');
          chrome.storage.local.remove('sleepTimer');
        }
      }
    });
  }
});
