// ==========================================================================
// STATE MANAGEMENT
// ==========================================================================
let state = {
  activeFolderPath: '',
  episodes: [],
  dbMode: 'db', // 'db' or 'rename'
  watchTag: ' [Finished]',
  mediaPlayer: 'default', // 'default' or 'kmplayer'
  activeFilter: 'all', // 'all', 'watched', 'unwatched'
  searchQuery: '',
  collapsedSeasons: new Set(),
  history: [],
};

// ==========================================================================
// DOM ELEMENTS
// ==========================================================================
const el = {
  // Navigation
  btnDashboard: document.getElementById('btn-dashboard'),
  btnSettingsNav: document.getElementById('btn-settings-nav'),
  recentFoldersList: document.getElementById('recent-folders-list'),
  
  // Views
  welcomeView: document.getElementById('welcome-view'),
  dashboardView: document.getElementById('dashboard-view'),
  settingsView: document.getElementById('settings-view'),
  
  // Header / Browse
  folderPathInput: document.getElementById('folder-path-input'),
  btnBrowse: document.getElementById('btn-browse'),
  btnWelcomeBrowse: document.getElementById('btn-welcome-browse'),
  
  // Dashboard Header Stats
  tvShowTitle: document.getElementById('tv-show-title'),
  tvShowPath: document.getElementById('tv-show-path'),
  statTotalEpisodes: document.getElementById('stat-total-episodes'),
  statWatched: document.getElementById('stat-watched'),
  statUnwatched: document.getElementById('stat-unwatched'),
  statPercent: document.getElementById('stat-percent'),
  progressRingFill: document.querySelector('.progress-ring-fill'),
  
  // Search & Filter
  episodeSearch: document.getElementById('episode-search'),
  filterTabs: document.querySelectorAll('.filter-tab'),
  btnRefresh: document.getElementById('btn-refresh'),
  modeBadge: document.getElementById('mode-badge'),
  
  // Bulk Actions
  btnMarkAllWatched: document.getElementById('btn-mark-all-watched'),
  btnClearAllWatched: document.getElementById('btn-clear-all-watched'),
  
  // Seasons Wrapper
  seasonsContainer: document.getElementById('seasons-container'),
  
  // Settings Form
  cardModeDb: document.getElementById('card-mode-db'),
  cardModeRename: document.getElementById('card-mode-rename'),
  radioModeDb: document.getElementById('mode-db'),
  radioModeRename: document.getElementById('mode-rename'),
  customTagInput: document.getElementById('custom-tag-input'),
  customTagGroup: document.getElementById('custom-tag-group'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  
  // Media Player settings UI
  cardPlayerDefault: document.getElementById('card-player-default'),
  cardPlayerKmplayer: document.getElementById('card-player-kmplayer'),
  radioPlayerDefault: document.getElementById('player-default'),
  radioPlayerKmplayer: document.getElementById('player-kmplayer'),
  
  // Overlay Utilities
  loader: document.getElementById('loader'),
  loaderText: document.getElementById('loader-text'),
  toast: document.getElementById('toast'),
};

// ==========================================================================
// TOAST NOTIFICATIONS
// ==========================================================================
let toastTimeout;
function showToast(message, type = 'info') {
  clearTimeout(toastTimeout);
  el.toast.textContent = message;
  el.toast.className = 'toast';
  el.toast.classList.add(type);
  el.toast.classList.remove('hidden');
  
  toastTimeout = setTimeout(() => {
    el.toast.classList.add('hidden');
  }, 3000);
}

// ==========================================================================
// LOADER UTILITIES
// ==========================================================================
function showLoader(text = 'Loading...') {
  el.loaderText.textContent = text;
  el.loader.classList.remove('hidden');
}

function hideLoader() {
  el.loader.classList.add('hidden');
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================
async function init() {
  try {
    // Load config from main process
    const config = await window.api.getAppConfig();
     state.history = config.history || [];
    state.dbMode = config.defaultMode || 'db';
    state.watchTag = config.customTag || ' [Finished]';
    state.mediaPlayer = config.mediaPlayer || 'default';
    
    // Sync settings form
    syncSettingsForm();
    renderRecentFolders();
    
    // Attach Event Listeners
    attachListeners();
  } catch (error) {
    console.error('Failed to initialize app settings:', error);
  }
}

// Sync UI inputs with state variables
function syncSettingsForm() {
  if (state.dbMode === 'db') {
    el.radioModeDb.checked = true;
    el.cardModeDb.classList.add('active');
    el.cardModeRename.classList.remove('active');
    el.customTagGroup.classList.add('hidden');
  } else {
    el.radioModeRename.checked = true;
    el.cardModeRename.classList.add('active');
    el.cardModeDb.classList.remove('active');
    el.customTagGroup.classList.remove('hidden');
  }
  el.customTagInput.value = state.watchTag;
  
  // Sync media player options
  if (state.mediaPlayer === 'kmplayer') {
    el.radioPlayerKmplayer.checked = true;
    el.cardPlayerKmplayer.classList.add('active');
    el.cardPlayerDefault.classList.remove('active');
  } else {
    el.radioPlayerDefault.checked = true;
    el.cardPlayerDefault.classList.add('active');
    el.cardPlayerKmplayer.classList.remove('active');
  }
  
  // Update mode badge
  el.modeBadge.textContent = state.dbMode === 'db' 
    ? 'Mode: Database Tracker' 
    : `Mode: Physical Renaming (${state.watchTag.trim()})`;
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================
function attachListeners() {
  // Folder browsing
  el.btnBrowse.addEventListener('click', handleBrowse);
  el.btnWelcomeBrowse.addEventListener('click', handleBrowse);
  el.btnRefresh.addEventListener('click', () => {
    if (state.activeFolderPath) {
      scanFolder(state.activeFolderPath);
    }
  });

  // Search & Filter
  el.episodeSearch.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    renderDashboard();
  });

  el.filterTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      el.filterTabs.forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      state.activeFilter = e.target.dataset.filter;
      renderDashboard();
    });
  });

  // Settings UI Radio Clicks
  el.cardModeDb.addEventListener('click', () => {
    el.radioModeDb.checked = true;
    el.cardModeDb.classList.add('active');
    el.cardModeRename.classList.remove('active');
    el.customTagGroup.classList.add('hidden');
  });

  el.cardModeRename.addEventListener('click', () => {
    el.radioModeRename.checked = true;
    el.cardModeRename.classList.add('active');
    el.cardModeDb.classList.remove('active');
    el.customTagGroup.classList.remove('hidden');
  });

  // Media Player Card clicks
  el.cardPlayerDefault.addEventListener('click', () => {
    el.radioPlayerDefault.checked = true;
    el.cardPlayerDefault.classList.add('active');
    el.cardPlayerKmplayer.classList.remove('active');
  });

  el.cardPlayerKmplayer.addEventListener('click', () => {
    el.radioPlayerKmplayer.checked = true;
    el.cardPlayerKmplayer.classList.add('active');
    el.cardPlayerDefault.classList.remove('active');
  });

  // Save settings
  el.btnSaveSettings.addEventListener('click', saveSettings);

  // Navigation Switch
  el.btnDashboard.addEventListener('click', () => {
    switchView('dashboard');
  });

  el.btnSettingsNav.addEventListener('click', () => {
    switchView('settings');
  });

  // Bulk Actions
  el.btnMarkAllWatched.addEventListener('click', () => handleBulkWatch(true));
  el.btnClearAllWatched.addEventListener('click', () => handleBulkWatch(false));
}

// Navigation switcher
function switchView(viewName) {
  el.btnDashboard.classList.remove('active');
  el.btnSettingsNav.classList.remove('active');
  el.dashboardView.classList.add('hidden');
  el.settingsView.classList.add('hidden');
  el.welcomeView.classList.add('hidden');

  if (viewName === 'dashboard') {
    el.btnDashboard.classList.add('active');
    if (state.activeFolderPath) {
      el.dashboardView.classList.remove('hidden');
    } else {
      el.welcomeView.classList.remove('hidden');
    }
  } else if (viewName === 'settings') {
    el.btnSettingsNav.classList.add('active');
    el.settingsView.classList.remove('hidden');
  }
}

// ==========================================================================
// BUSINESS LOGIC: FOLDER SCAN & REFRESH
// ==========================================================================
async function handleBrowse() {
  const selectedPath = await window.api.selectFolder();
  if (selectedPath) {
    el.folderPathInput.value = selectedPath;
    await scanFolder(selectedPath);
  }
}

async function scanFolder(folderPath) {
  showLoader('Scanning files and loading metadata...');
  try {
    state.activeFolderPath = folderPath;
    const result = await window.api.scanFolder(folderPath);
    state.episodes = result.episodes;
    state.dbMode = result.dbMode;
    state.watchTag = result.watchTag;
    
    // Auto collapse/expand setup
    // Find the first season containing unwatched episodes and expand it; collapse others by default.
    // This is helpful for directories with 500+ episodes.
    state.collapsedSeasons.clear();
    const seasonsMap = groupEpisodesBySeason(state.episodes);
    const sortedSeasons = Object.keys(seasonsMap).map(Number).sort((a,b) => a - b);
    
    let firstUnwatchedSeason = null;
    for (const s of sortedSeasons) {
      const hasUnwatched = seasonsMap[s].some(ep => !ep.watched);
      if (hasUnwatched && firstUnwatchedSeason === null) {
        firstUnwatchedSeason = s;
      } else {
        state.collapsedSeasons.add(s);
      }
    }
    
    // If all seasons are watched, expand the last season
    if (firstUnwatchedSeason === null && sortedSeasons.length > 0) {
      state.collapsedSeasons.delete(sortedSeasons[sortedSeasons.length - 1]);
    }

    // Refresh history
    const config = await window.api.getAppConfig();
    state.history = config.history || [];
    renderRecentFolders();
    
    syncSettingsForm();
    switchView('dashboard');
    renderDashboard();
    showToast('Folder scanned successfully!', 'success');
  } catch (error) {
    console.error('Scan error:', error);
    showToast('Failed to scan folder: ' + error.message, 'error');
  } finally {
    hideLoader();
  }
}

function renderRecentFolders() {
  el.recentFoldersList.innerHTML = '';
  if (state.history.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-recent';
    li.textContent = 'No folders scanned yet';
    el.recentFoldersList.appendChild(li);
    return;
  }

  state.history.forEach(folderPath => {
    const li = document.createElement('li');
    li.className = 'recent-item';
    li.textContent = pathBasename(folderPath);
    li.title = folderPath;
    li.addEventListener('click', () => {
      el.folderPathInput.value = folderPath;
      scanFolder(folderPath);
    });
    el.recentFoldersList.appendChild(li);
  });
}

// Utility to get directory name
function pathBasename(pathStr) {
  // Handles both Windows and Unix paths
  const parts = pathStr.split(/[\\/]/);
  return parts[parts.length - 1] || pathStr;
}

// Group array of episodes by season number
function groupEpisodesBySeason(episodes) {
  const map = {};
  episodes.forEach(ep => {
    const season = ep.season || 1;
    if (!map[season]) map[season] = [];
    map[season].push(ep);
  });
  
  // Sort episodes within seasons by episode number, fallback to alphabetical display name
  for (const season in map) {
    map[season].sort((a, b) => {
      if (a.episode !== null && b.episode !== null) {
        return a.episode - b.episode;
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }
  
  return map;
}

// ==========================================================================
// RENDERING DASHBOARD DATA
// ==========================================================================
function renderDashboard() {
  // Title & Path
  el.tvShowTitle.textContent = pathBasename(state.activeFolderPath);
  el.tvShowPath.textContent = state.activeFolderPath;

  // Compute overall stats
  const totalCount = state.episodes.length;
  const watchedCount = state.episodes.filter(ep => ep.watched).length;
  const unwatchedCount = totalCount - watchedCount;
  const percent = totalCount > 0 ? Math.round((watchedCount / totalCount) * 100) : 0;

  // Update text stats
  el.statTotalEpisodes.textContent = totalCount;
  el.statWatched.textContent = watchedCount;
  el.statUnwatched.textContent = unwatchedCount;
  el.statPercent.textContent = `${percent}%`;

  // Update SVG progress ring (circumference is 314.15)
  const offset = 314.15 - (314.15 * percent) / 100;
  el.progressRingFill.style.strokeDashoffset = offset;

  // Filter episodes
  let filtered = state.episodes.filter(ep => {
    // Search filter
    const matchesSearch = ep.displayName.toLowerCase().includes(state.searchQuery) ||
                          ep.name.toLowerCase().includes(state.searchQuery) ||
                          `s${String(ep.season).padStart(2,'0')}`.includes(state.searchQuery) ||
                          `e${String(ep.episode).padStart(2,'0')}`.includes(state.searchQuery);
    
    if (!matchesSearch) return false;

    // Tab filter
    if (state.activeFilter === 'watched') return ep.watched;
    if (state.activeFilter === 'unwatched') return !ep.watched;
    return true;
  });

  // Render season groups
  renderSeasons(filtered);
}

function renderSeasons(episodesList) {
  el.seasonsContainer.innerHTML = '';
  const seasonsMap = groupEpisodesBySeason(episodesList);
  const sortedSeasons = Object.keys(seasonsMap).map(Number).sort((a, b) => a - b);

  if (sortedSeasons.length === 0) {
    el.seasonsContainer.innerHTML = `
      <div class="welcome-card" style="margin: 0 auto; max-width: 100%;">
        <p>No episodes match your search or filter criteria.</p>
      </div>
    `;
    return;
  }

  sortedSeasons.forEach(seasonNum => {
    const seasonEps = seasonsMap[seasonNum];
    const total = seasonEps.length;
    const watched = seasonEps.filter(ep => ep.watched).length;
    const progressPercent = total > 0 ? Math.round((watched / total) * 100) : 0;
    const isCollapsed = state.collapsedSeasons.has(seasonNum);

    const card = document.createElement('div');
    card.className = `season-card ${isCollapsed ? 'collapsed' : ''}`;
    card.dataset.season = seasonNum;

    // Header Structure
    const header = document.createElement('div');
    header.className = 'season-header';
    header.innerHTML = `
      <div class="season-title-group">
        <svg class="season-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        <span class="season-title">Season ${seasonNum}</span>
        <span class="season-badge">${total} ${total === 1 ? 'episode' : 'episodes'}</span>
      </div>
      <div class="season-progress-container">
        <div class="progress-bar-bg">
          <div class="progress-bar-fill ${progressPercent === 100 ? 'finished' : ''}" style="width: ${progressPercent}%;"></div>
        </div>
        <span class="season-progress-text">${watched}/${total} Done</span>
      </div>
    `;

    // Accordion click toggle
    header.addEventListener('click', () => {
      if (state.collapsedSeasons.has(seasonNum)) {
        state.collapsedSeasons.delete(seasonNum);
        card.classList.remove('collapsed');
      } else {
        state.collapsedSeasons.add(seasonNum);
        card.classList.add('collapsed');
      }
    });

    // Episodes Panel Grid
    const panel = document.createElement('div');
    panel.className = 'season-episodes';
    
    const grid = document.createElement('div');
    grid.className = 'episodes-grid';

    seasonEps.forEach(ep => {
      const epCard = document.createElement('div');
      epCard.className = `episode-card ${ep.watched ? 'watched' : ''}`;
      
      const epCode = ep.episode !== null 
        ? `S${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')}` 
        : `Ep. Unknown`;

      // Episode structure
      epCard.innerHTML = `
        <div class="episode-info">
          <span class="ep-tag">${epCode}</span>
          <span class="ep-name" title="${ep.displayName}">${ep.displayName}</span>
          <span class="ep-meta">${ep.sizeFormatted}</span>
        </div>
        <div class="episode-actions">
          <button class="play-trigger" title="Play Episode">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Play
          </button>
          
          <label class="checkbox-container">
            <input type="checkbox" ${ep.watched ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
        </div>
      `;

      // Play event
      epCard.querySelector('.play-trigger').addEventListener('click', async () => {
        try {
          showToast(`Opening file: ${ep.displayName}...`);
          await window.api.playEpisode(ep.fullPath);
        } catch (err) {
          showToast('Failed to play file: ' + err.message, 'error');
        }
      });

      // Checkbox watched toggle
      const checkbox = epCard.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', async () => {
        try {
          const res = await window.api.toggleWatched({
            folderPath: state.activeFolderPath,
            episode: ep,
            mode: state.dbMode,
            watchTag: state.watchTag
          });

          if (res.success) {
            // Update local state entry
            const index = state.episodes.findIndex(item => item.fullPath === ep.fullPath);
            if (index !== -1) {
              state.episodes[index].watched = res.watched;
              state.episodes[index].name = res.name;
              state.episodes[index].fullPath = res.fullPath;
              state.episodes[index].relativePath = res.relativePath;
            }

            // Sync visual UI
            ep.watched = res.watched;
            ep.name = res.name;
            ep.fullPath = res.fullPath;
            ep.relativePath = res.relativePath;
            
            if (res.watched) {
              epCard.classList.add('watched');
              showToast(`Marked Finished: ${ep.displayName}`, 'success');
            } else {
              epCard.classList.remove('watched');
              showToast(`Marked Unwatched: ${ep.displayName}`);
            }

            renderDashboard(); // Re-render stats and update layout
          }
        } catch (err) {
          checkbox.checked = !checkbox.checked; // Revert checkbox UI state on error
          showToast('Failed to update: ' + err.message, 'error');
        }
      });

      grid.appendChild(epCard);
    });

    panel.appendChild(grid);
    card.appendChild(header);
    card.appendChild(panel);
    el.seasonsContainer.appendChild(card);
  });
}

// ==========================================================================
// BULK OPERATIONS
// ==========================================================================
async function handleBulkWatch(watch) {
  if (!state.activeFolderPath || state.episodes.length === 0) return;

  // Filter episodes matching the current view to act on
  let targetEps = state.episodes.filter(ep => {
    // Search filter match
    const matchesSearch = ep.displayName.toLowerCase().includes(state.searchQuery) ||
                          ep.name.toLowerCase().includes(state.searchQuery);
    if (!matchesSearch) return false;

    // Tab filter match
    if (state.activeFilter === 'watched') return ep.watched;
    if (state.activeFilter === 'unwatched') return !ep.watched;
    return true;
  });

  // Filter out files already in target state to prevent excessive I/O
  targetEps = targetEps.filter(ep => ep.watched !== watch);

  if (targetEps.length === 0) {
    showToast('No episodes need updates.', 'info');
    return;
  }

  const confirmMsg = watch 
    ? `Are you sure you want to mark all ${targetEps.length} matched episodes as watched?`
    : `Are you sure you want to clear progress for all ${targetEps.length} matched episodes?`;
  
  if (!confirm(confirmMsg)) return;

  showLoader(watch ? 'Marking files as finished...' : 'Clearing file progress...');
  
  try {
    const results = await window.api.bulkToggleWatched({
      folderPath: state.activeFolderPath,
      episodes: targetEps,
      watch: watch,
      mode: state.dbMode,
      watchTag: state.watchTag
    });

    // Update local state with the bulk results
    results.forEach(res => {
      const idx = state.episodes.findIndex(item => item.fullPath === res.originalFullPath);
      if (idx !== -1) {
        state.episodes[idx].watched = res.watched;
        state.episodes[idx].name = res.name;
        state.episodes[idx].fullPath = res.fullPath;
        state.episodes[idx].relativePath = res.relativePath;
      }
    });

    renderDashboard();
    showToast(`Bulk update complete: ${results.length} files modified.`, 'success');
  } catch (err) {
    console.error('Bulk update error', err);
    showToast('Bulk update failed: ' + err.message, 'error');
  } finally {
    hideLoader();
  }
}

// ==========================================================================
// CONFIGURATION & SETTINGS LOGIC
// ==========================================================================
async function saveSettings() {
  const mode = el.radioModeDb.checked ? 'db' : 'rename';
  const tag = el.customTagInput.value;
  const player = el.radioPlayerDefault.checked ? 'default' : 'kmplayer';
  
  if (!tag && mode === 'rename') {
    showToast('Renaming mode requires a finished tag suffix!', 'error');
    return;
  }

  showLoader('Saving configurations...');
  try {
    const updated = await window.api.saveAppConfig({
      defaultMode: mode,
      customTag: tag,
      mediaPlayer: player
    });

    state.dbMode = updated.defaultMode;
    state.watchTag = updated.customTag;
    state.mediaPlayer = updated.mediaPlayer || 'default';

    syncSettingsForm();
    showToast('Configuration saved successfully!', 'success');

    // If there is an active path, rescan automatically to re-sync views
    if (state.activeFolderPath) {
      await scanFolder(state.activeFolderPath);
    } else {
      switchView('dashboard');
    }
  } catch (err) {
    showToast('Failed to save configuration: ' + err.message, 'error');
  } finally {
    hideLoader();
  }
}

// Run app init
init();
