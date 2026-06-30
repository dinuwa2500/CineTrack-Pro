const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolder: (path) => ipcRenderer.invoke('scan-folder', path),
  playEpisode: (filePath) => ipcRenderer.invoke('play-episode', filePath),
  toggleWatched: (args) => ipcRenderer.invoke('toggle-watched', args),
  bulkToggleWatched: (args) => ipcRenderer.invoke('bulk-toggle-watched', args),
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  saveAppConfig: (config) => ipcRenderer.invoke('save-app-config', config),
  fetchShowMetadata: (args) => ipcRenderer.invoke('fetch-show-metadata', args),
  searchTmdb: (query) => ipcRenderer.invoke('search-tmdb', query),
  linkTmdbId: (args) => ipcRenderer.invoke('link-tmdb-id', args),
  validateTmdbKey: (apiKey) => ipcRenderer.invoke('validate-tmdb-key', apiKey),
});
