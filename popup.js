document.addEventListener('DOMContentLoaded', () => {
  // Settings elements
  const ambientToggle = document.getElementById('ambient-toggle');
  const animatedToggle = document.getElementById('animated-toggle');
  const shiftUpToggle = document.getElementById('shift-up-toggle');
  const reducedSizeToggle = document.getElementById('reduced-size-toggle');

  // Sleep timer elements
  const statusBadge = document.getElementById('status-badge');
  const countdownSection = document.getElementById('countdown-section');
  const countdownDisplay = document.getElementById('countdown');
  const buttonsSection = document.getElementById('buttons-section');
  const cancelSection = document.getElementById('cancel-section');
  const cancelBtn = document.getElementById('cancel-btn');
  const errorSection = document.getElementById('error-section');
  const timeButtons = document.querySelectorAll('.time-btn');

  let countdownInterval = null;

  // Initialize
  loadSettings();
  checkTimerStatus();

  // Settings event listeners
  ambientToggle.addEventListener('change', () => {
    chrome.storage.local.set({ ambientEnabled: ambientToggle.checked });
  });

  animatedToggle.addEventListener('change', () => {
    chrome.storage.local.set({ animatedEnabled: animatedToggle.checked });
  });

  shiftUpToggle.addEventListener('change', () => {
    chrome.storage.local.set({ shiftUpEnabled: shiftUpToggle.checked });
  });

  reducedSizeToggle.addEventListener('change', () => {
    chrome.storage.local.set({ reducedSizeEnabled: reducedSizeToggle.checked });
  });

  // Sleep timer event listeners
  timeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const minutes = parseInt(btn.dataset.minutes, 10);
      startTimer(minutes);
    });
  });

  cancelBtn.addEventListener('click', cancelTimer);

  // Load settings from storage
  function loadSettings() {
    chrome.storage.local.get(['ambientEnabled', 'animatedEnabled', 'shiftUpEnabled', 'reducedSizeEnabled'], (data) => {
      ambientToggle.checked = data.ambientEnabled !== false; // default true
      animatedToggle.checked = data.animatedEnabled === true; // default false
      shiftUpToggle.checked = data.shiftUpEnabled === true; // default false
      reducedSizeToggle.checked = data.reducedSizeEnabled === true; // default false
    });
  }

  function checkTimerStatus() {
    chrome.runtime.sendMessage({ action: 'GET_TIMER_STATUS' }, (response) => {
      if (chrome.runtime.lastError) {
        showInactiveState();
        return;
      }

      if (response?.active) {
        showActiveState(response.endTime);
      } else {
        showInactiveState();
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const isYTMusic = tabs[0]?.url?.includes('music.youtube.com');
        if (!isYTMusic && !response?.active) {
          showError();
        }
      });
    });
  }

  function startTimer(minutes) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.url?.includes('music.youtube.com')) {
        showError();
        return;
      }

      chrome.runtime.sendMessage({
        action: 'START_TIMER',
        duration: minutes * 60 * 1000,
        tabId: tab.id
      }, (response) => {
        if (response?.success) {
          showActiveState(response.endTime);
        }
      });
    });
  }

  function cancelTimer() {
    chrome.runtime.sendMessage({ action: 'CANCEL_TIMER' }, () => {
      showInactiveState();
    });
  }

  function showActiveState(endTime) {
    statusBadge.classList.remove('hidden');
    countdownSection.classList.remove('hidden');
    cancelSection.classList.remove('hidden');
    buttonsSection.classList.add('hidden');
    errorSection.classList.add('hidden');

    startCountdownDisplay(endTime);
  }

  function showInactiveState() {
    statusBadge.classList.add('hidden');
    countdownSection.classList.add('hidden');
    cancelSection.classList.add('hidden');
    buttonsSection.classList.remove('hidden');
    errorSection.classList.add('hidden');

    timeButtons.forEach(btn => btn.disabled = false);

    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function showError() {
    buttonsSection.classList.add('hidden');
    errorSection.classList.remove('hidden');
  }

  function startCountdownDisplay(endTime) {
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }

    function updateDisplay() {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        showInactiveState();
        return;
      }

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      countdownDisplay.textContent =
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    updateDisplay();
    countdownInterval = setInterval(updateDisplay, 1000);
  }
});
