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

  // Equalizer elements
  const eqToggle = document.getElementById('eq-toggle');
  const eqFlatBtn = document.getElementById('eq-flat-btn');
  const eqPanel = document.getElementById('eq-panel');
  const eqPreset = document.getElementById('eq-preset');
  const eqCustomGroup = document.getElementById('eq-custom-group');
  const eqRenameBtn = document.getElementById('eq-rename-btn');
  const eqDeleteBtn = document.getElementById('eq-delete-btn');
  const eqSaveBtn = document.getElementById('eq-save-btn');
  const eqResetBtn = document.getElementById('eq-reset-btn');
  const eqBands = [
    document.getElementById('eq-band-0'),
    document.getElementById('eq-band-1'),
    document.getElementById('eq-band-2'),
    document.getElementById('eq-band-3'),
    document.getElementById('eq-band-4')
  ];

  // Modal elements
  const eqSaveModal = document.getElementById('eq-save-modal');
  const eqPresetNameInput = document.getElementById('eq-preset-name');
  const eqSaveConfirm = document.getElementById('eq-save-confirm');
  const eqSaveCancel = document.getElementById('eq-save-cancel');

  const eqRenameModal = document.getElementById('eq-rename-modal');
  const eqRenameCurrent = document.getElementById('eq-rename-current');
  const eqRenameInput = document.getElementById('eq-rename-input');
  const eqRenameConfirm = document.getElementById('eq-rename-confirm');
  const eqRenameCancel = document.getElementById('eq-rename-cancel');

  const eqDeleteModal = document.getElementById('eq-delete-modal');
  const eqDeleteName = document.getElementById('eq-delete-name');
  const eqDeleteConfirm = document.getElementById('eq-delete-confirm');
  const eqDeleteCancel = document.getElementById('eq-delete-cancel');

  let countdownInterval = null;
  let currentVideoId = null;
  let customPresets = {};
  let selectedCustomPresetId = null;

  // Preview state for EQ (preview-only workflow)
  let previewBands = [0, 0, 0, 0, 0];
  let previewPreset = 'Flat';
  let hasUnsavedChanges = false;

  // Built-in presets (mirrored from content.js)
  const BUILTIN_PRESETS = {
    'Flat': [0, 0, 0, 0, 0],
    'Bass Boost': [6, 4, 0, 0, 0],
    'Treble Boost': [0, 0, 0, 4, 6],
    'Vocal': [-2, 0, 4, 2, -1],
    'Electronic': [5, 2, -2, 2, 5],
    'Rock': [4, 2, -1, 2, 4],
    'Jazz': [3, 0, 2, 3, 4]
  };

  // Initialize
  loadSettings();
  checkTimerStatus();
  initEqualizer();

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
    chrome.storage.local.get(['ambientEnabled', 'animatedEnabled', 'shiftUpEnabled', 'reducedSizeEnabled', 'eqEnabled'], (data) => {
      ambientToggle.checked = data.ambientEnabled !== false; // default true
      animatedToggle.checked = data.animatedEnabled === true; // default false
      shiftUpToggle.checked = data.shiftUpEnabled === true; // default false
      reducedSizeToggle.checked = data.reducedSizeEnabled === true; // default false
      
      // Set EQ toggle state from storage and show/hide panel accordingly
      const eqEnabled = data.eqEnabled !== false; // default true
      eqToggle.checked = eqEnabled;
      eqPanel.classList.toggle('hidden', !eqEnabled);
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

  // ============================================
  // EQUALIZER FUNCTIONS
  // ============================================

  function initEqualizer() {
    console.log('[YTM-Ext:Popup] initEqualizer called');
    loadCustomPresets();

    // Toggle handler
    eqToggle.addEventListener('change', () => {
      sendEqMessage({ type: 'toggle', enabled: eqToggle.checked }, (response) => {
        if (response?.state) {
          updateEqUI(response.state);
        }
      });
    });

    // FLAT button handler
    eqFlatBtn.addEventListener('click', () => {
      previewBands = [0, 0, 0, 0, 0];
      previewPreset = 'Flat';
      sendEqMessage({ type: 'flat' });
    });

    // Preset handler
    eqPreset.addEventListener('change', () => {
      const value = eqPreset.value;
      if (value.startsWith('custom_')) {
        const id = value.replace('custom_', '');
        const customPreset = customPresets[id];
        if (customPreset) {
          previewBands = [...customPreset.bands];
          previewPreset = customPreset.name;
          updatePreviewUI();
          applyCustomPreset(id);
        }
      } else if (BUILTIN_PRESETS[value]) {
        previewBands = [...BUILTIN_PRESETS[value]];
        previewPreset = value;
        sendEqMessage({ type: 'applyPreset', preset: value });
      }
      updatePresetButtons();
    });

    // Save button handler (opens modal)
    eqSaveBtn.addEventListener('click', () => {
      showModal(eqSaveModal);
      eqPresetNameInput.value = '';
      eqPresetNameInput.focus();
    });

    // Rename button handler (opens modal)
    eqRenameBtn.addEventListener('click', () => {
      if (!selectedCustomPresetId || !customPresets[selectedCustomPresetId]) return;
      showModal(eqRenameModal);
      eqRenameCurrent.textContent = `Current: ${customPresets[selectedCustomPresetId].name}`;
      eqRenameInput.value = customPresets[selectedCustomPresetId].name;
      eqRenameInput.focus();
    });

    // Delete button handler (opens modal)
    eqDeleteBtn.addEventListener('click', () => {
      if (!selectedCustomPresetId || !customPresets[selectedCustomPresetId]) return;
      showModal(eqDeleteModal);
      eqDeleteName.textContent = `Delete "${customPresets[selectedCustomPresetId].name}"?`;
    });

    // Reset button handler
    eqResetBtn.addEventListener('click', () => {
      if (!currentVideoId) return;
      sendEqMessage({ type: 'resetSong', videoId: currentVideoId }, (response) => {
        if (response?.state) {
          updateEqUI(response.state);
        }
        updateResetButtonState();
      });
    });

    // Band slider handlers
    eqBands.forEach((slider, index) => {
      slider.addEventListener('input', () => {
        const gain = parseInt(slider.value, 10);
        const valueDisplay = document.getElementById(`eq-value-${index}`);
        if (valueDisplay) {
          valueDisplay.textContent = gain > 0 ? `+${Math.round(gain)}` : Math.round(gain);
        }
        previewBands[index] = gain;
        previewPreset = 'Custom';
        sendEqMessage({ type: 'setBand', band: index, gain });
      });
    });

    // Modal handlers - Save
    eqSaveConfirm.addEventListener('click', () => {
      const name = eqPresetNameInput.value.trim();
      if (!name) return;
      const bands = eqBands.map(b => parseInt(b.value, 10));
      const applyTo = document.querySelector('input[name="eq-apply-to"]:checked').value;
      sendEqMessage({ type: 'saveCustomPreset', name, bands, applyTo, videoId: currentVideoId }, (response) => {
        if (response?.id) {
          loadCustomPresets(() => {
            eqPreset.value = `custom_${response.id}`;
            previewPreset = name;
            updatePresetButtons();
          });
        }
        hasUnsavedChanges = false;
        updatePreviewUI();
        hideModal(eqSaveModal);
      });
    });

    eqSaveCancel.addEventListener('click', () => {
      hideModal(eqSaveModal);
    });

    // Modal handlers - Rename
    eqRenameConfirm.addEventListener('click', () => {
      const newName = eqRenameInput.value.trim();
      if (!newName || !selectedCustomPresetId) return;
      sendEqMessage({ type: 'renameCustomPreset', id: selectedCustomPresetId, name: newName }, () => {
        loadCustomPresets(() => {
          eqPreset.value = `custom_${selectedCustomPresetId}`;
          updatePresetButtons();
        });
        hideModal(eqRenameModal);
      });
    });

    eqRenameCancel.addEventListener('click', () => {
      hideModal(eqRenameModal);
    });

    // Modal handlers - Delete
    eqDeleteConfirm.addEventListener('click', () => {
      if (!selectedCustomPresetId) return;
      sendEqMessage({ type: 'deleteCustomPreset', id: selectedCustomPresetId }, () => {
        selectedCustomPresetId = null;
        loadCustomPresets(() => {
          eqPreset.value = 'Flat';
          updatePresetButtons();
        });
        hideModal(eqDeleteModal);
      });
    });

    eqDeleteCancel.addEventListener('click', () => {
      hideModal(eqDeleteModal);
    });

    // Initialize audio engine and load state
    sendEqMessage({ type: 'init' }, (response) => {
      console.log('[YTM-Ext:Popup] init response:', response);
      if (response?.state) {
        console.log('[YTM-Ext:Popup] state.preset:', response.state.preset, 'state.bands:', response.state.bands);
        updateEqUI(response.state);
        // Sync preview state from actual EQ state
        if (response.state.bands && response.state.bands.length === 5) {
          previewBands = [...response.state.bands];
        } else {
          previewBands = [0, 0, 0, 0, 0];
        }
        if (response.state.preset) {
          previewPreset = response.state.preset;
        }
        hasUnsavedChanges = false;
        currentVideoId = response.state.videoId;
        updateResetButtonState();
        updatePreviewUI();
      } else {
        // Don't hide panel - show based on toggle state
        console.log('[YTM-Ext:Popup] init returned null, keeping panel visible');
      }
    });

    // Periodic state sync for song changes - only sync bands, not preset
    setInterval(() => {
      sendEqMessage({ type: 'getState' }, (response) => {
        if (response?.state && response.state.bands && response.state.bands.length === 5) {
          // Only update slider positions, NOT the preset dropdown
          response.state.bands.forEach((gain, i) => {
            if (eqBands[i]) {
              eqBands[i].value = gain;
              const valueDisplay = document.getElementById(`eq-value-${i}`);
              if (valueDisplay) {
                valueDisplay.textContent = gain > 0 ? `+${Math.round(gain)}` : Math.round(gain);
              }
            }
          });
          previewBands = [...response.state.bands];
        }
      });
    }, 500);
  }

  function loadCustomPresets(callback) {
    sendEqMessage({ type: 'getCustomPresets' }, (response) => {
      customPresets = response?.presets || {};
      populateCustomPresets();
      if (callback) callback();
    });
  }

  function populateCustomPresets() {
    eqCustomGroup.innerHTML = '';
    for (const [id, preset] of Object.entries(customPresets)) {
      const option = document.createElement('option');
      option.value = `custom_${id}`;
      option.textContent = preset.name;
      eqCustomGroup.appendChild(option);
    }
  }

  function applyCustomPreset(id) {
    sendEqMessage({ type: 'applyCustomPreset', id }, (response) => {
      if (response?.state) {
        updateEqUI(response.state);
      }
    });
  }

  function updatePresetButtons() {
    const value = eqPreset.value;
    console.log('[YTM-Ext:Popup] updatePresetButtons value:', value);
    
    // Save button - always enabled
    eqSaveBtn.disabled = false;
    
    // Reset button - handled separately via updateResetButtonState()
    
    // Rename and Delete buttons logic:
    // - Built-in presets (Flat, Bass Boost, etc.): visible but disabled
    // - "Custom" (unsaved): visible but disabled  
    // - custom_xxx (saved custom): enabled
    if (value.startsWith('custom_')) {
      selectedCustomPresetId = value.replace('custom_', '');
      eqRenameBtn.disabled = false;
      eqDeleteBtn.disabled = false;
      console.log('[YTM-Ext:Popup] Saved custom preset - enable rename/delete');
    } else {
      selectedCustomPresetId = null;
      // Built-in presets and "Custom" value - visible but disabled
      eqRenameBtn.disabled = true;
      eqDeleteBtn.disabled = true;
      console.log('[YTM-Ext:Popup] Built-in or Custom - disable rename/delete');
    }
  }

  function showModal(modal) {
    modal.classList.remove('hidden');
  }

  function hideModal(modal) {
    modal.classList.add('hidden');
  }

  function updatePreviewUI() {
    previewBands.forEach((gain, i) => {
      if (eqBands[i]) {
        eqBands[i].value = gain;
        const valueDisplay = document.getElementById(`eq-value-${i}`);
        if (valueDisplay) {
          valueDisplay.textContent = gain > 0 ? `+${Math.round(gain)}` : Math.round(gain);
        }
      }
    });

    // Find the preset in dropdown
    if (eqPreset.querySelector(`option[value="${previewPreset}"]`)) {
      eqPreset.value = previewPreset;
    } else {
      for (const [id, preset] of Object.entries(customPresets)) {
        if (preset.name === previewPreset) {
          eqPreset.value = `custom_${id}`;
          break;
        }
      }
    }
    updatePresetButtons();
  }

  function updateEqUI(state) {
    if (!state) return;

    console.log('[YTM-Ext:Popup] updateEqUI called with preset:', state.preset);

    eqToggle.checked = state.enabled;
    eqPanel.classList.toggle('hidden', !state.enabled);

    if (state.bands && state.bands.length === 5) {
      state.bands.forEach((gain, i) => {
        if (eqBands[i]) {
          eqBands[i].value = gain;
          const valueDisplay = document.getElementById(`eq-value-${i}`);
          if (valueDisplay) {
            valueDisplay.textContent = gain > 0 ? `+${Math.round(gain)}` : Math.round(gain);
          }
        }
      });
    }

    if (state.preset) {
      console.log('[YTM-Ext:Popup] Looking for preset:', state.preset);
      if (eqPreset.querySelector(`option[value="${state.preset}"]')) {
        console.log('[YTM-Ext:Popup] Found in dropdown, setting value to:', state.preset);
        eqPreset.value = state.preset;
      } else {
        console.log('[YTM-Ext:Popup] Not in dropdown, checking custom presets');
        for (const [id, preset] of Object.entries(customPresets)) {
          if (preset.name === state.preset) {
            console.log('[YTM-Ext:Popup] Found custom preset, setting to custom_', id);
            eqPreset.value = `custom_${id}`;
            break;
          }
        }
      }
      updatePresetButtons();
    }
  }

  function updateResetButtonState() {
    if (!currentVideoId) {
      eqResetBtn.disabled = true;
      return;
    }

    sendEqMessage({ type: 'hasCustomEQ', videoId: currentVideoId }, (response) => {
      if (response?.hasCustom) {
        eqResetBtn.disabled = false;
      } else {
        eqResetBtn.disabled = true;
      }
    });
  }

  function sendEqMessage(message, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.url?.includes('music.youtube.com')) {
        callback(null);
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { action: 'EQ', ...message }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('EQ message error:', chrome.runtime.lastError);
          callback(null);
          return;
        }
        callback(response);
      });
    });
  }
});
