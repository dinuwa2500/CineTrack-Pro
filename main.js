import { app, BrowserWindow, ipcMain, dialog, shell, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec, execFile } from 'child_process';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
const CONFIG_FILE = path.join(app.getPath('userData'), 'movie-marker-config.json');

// Helper to read app configuration (like history)
function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        history: [],
        defaultMode: 'db',
        customTag: ' [Finished]',
        tmdbApiKey: '',
        antiSpoilerShield: true,
        showLinkages: {},
        metadataProvider: 'tvmaze',
        ...parsed
      };
    }
  } catch (error) {
    console.error('Error reading configuration:', error);
  }
  return { 
    history: [], 
    defaultMode: 'db', 
    customTag: ' [Finished]',
    tmdbApiKey: '',
    antiSpoilerShield: true,
    showLinkages: {},
    metadataProvider: 'tvmaze'
  };
}

// Helper to write app configuration
function writeConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing configuration:', error);
  }
}

function createWindow() {
  const config = readConfig();
  const width = config.windowWidth || 1100;
  const height = config.windowHeight || 800;
  
  let x = config.windowX;
  let y = config.windowY;
  if (x !== undefined && y !== undefined) {
    const rect = { x, y, width, height };
    const display = screen.getDisplayMatching(rect);
    const displayBounds = display.bounds;
    const isVisible = (
      x >= displayBounds.x &&
      x < displayBounds.x + displayBounds.width &&
      y >= displayBounds.y &&
      y < displayBounds.y + displayBounds.height
    );
    if (!isVisible) {
      x = undefined;
      y = undefined;
    }
  }

  mainWindow = new BrowserWindow({
    title: 'CineTrack Pro',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    width: width,
    height: height,
    x: x,
    y: y,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#0f172a', // Tailwind slate-900 color for smooth load
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (config.windowMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools(); // Uncomment for debugging

  // Save window bounds and maximized state on close
  mainWindow.on('close', () => {
    const isMaximized = mainWindow.isMaximized();
    const isMinimized = mainWindow.isMinimized();
    
    // Only update if it is not minimized
    if (!isMinimized) {
      const configToUpdate = readConfig();
      configToUpdate.windowMaximized = isMaximized;
      if (!isMaximized) {
        const bounds = mainWindow.getBounds();
        configToUpdate.windowWidth = bounds.width;
        configToUpdate.windowHeight = bounds.height;
        configToUpdate.windowX = bounds.x;
        configToUpdate.windowY = bounds.y;
      }
      writeConfig(configToUpdate);
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC: Select Folder
ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// IPC: Get history and settings
ipcMain.handle('get-app-config', async () => {
  return readConfig();
});

// IPC: Save settings
ipcMain.handle('save-app-config', async (event, newConfig) => {
  const current = readConfig();
  const updated = { ...current, ...newConfig };
  writeConfig(updated);
  return updated;
});

// Video extensions to look for
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.flv', '.webm', 
  '.ts', '.m2ts', '.vob', '.mpg', '.mpeg', '.ogv', '.3gp', '.divx', 
  '.rm', '.rmvb', '.asf', '.m2v', '.iso', '.f4v', '.h264', '.hevc'
]);

// Parse season and episode from filename
function parseEpisodeDetails(filename) {
  const cleanName = path.parse(filename).name;

  // Regex patterns
  // Pattern 1: S01E02 or s01e02 or S1E2
  const s00e00 = /s(\d+)\s*e(\d+)/i.exec(cleanName);
  if (s00e00) {
    return { season: parseInt(s00e00[1], 10), episode: parseInt(s00e00[2], 10) };
  }

  // Pattern 2: 1x02 or 01x02
  const xPattern = /(\d+)\s*x\s*(\d+)/i.exec(cleanName);
  if (xPattern) {
    return { season: parseInt(xPattern[1], 10), episode: parseInt(xPattern[2], 10) };
  }

  // Pattern 3: Episode 2 or Ep 2 (assume season 1)
  const epPattern = /(?:ep|episode)\.?\s*(\d+)/i.exec(cleanName);
  if (epPattern) {
    return { season: 1, episode: parseInt(epPattern[1], 10) };
  }

  // Pattern 4: Season 2 Episode 3 or Season 2 - 03
  const seasonEpPattern = /season\s*(\d+)\s*[-_]?\s*(?:ep|episode)?\s*(\d+)/i.exec(cleanName);
  if (seasonEpPattern) {
    return { season: parseInt(seasonEpPattern[1], 10), episode: parseInt(seasonEpPattern[2], 10) };
  }

  // Pattern 5: Standalone number at the end or middle, e.g. "Show - 05" or "Show 102"
  // Let's look for numbers with leading zeros first, or numbers separated by space/dash
  const standalonePattern = /[\s\-_](\d{2,3})(?:\s|[-_.]|$)/.exec(cleanName);
  if (standalonePattern) {
    return { season: 1, episode: parseInt(standalonePattern[1], 10) };
  }

  // Default fallback if we can't extract numbers
  return { season: 1, episode: null };
}

// IPC: Scan directory recursively or flat
ipcMain.handle('scan-folder', async (event, folderPath) => {
  if (!fs.existsSync(folderPath)) {
    throw new Error('Directory does not exist');
  }

  const episodes = [];
  
  // Read Database config if it exists inside scanned folder
  const dbPath = path.join(folderPath, '.episode-tracker.json');
  let dbData = {};
  if (fs.existsSync(dbPath)) {
    try {
      dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse tracker JSON, using empty DB state', e);
    }
  }

  // Retrieve global config to check watch tags
  const globalConfig = readConfig();
  const watchTag = globalConfig.customTag || ' [Finished]';

  // Recursive scan function
  function scan(dir) {
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch (err) {
      console.warn(`Skipping directory due to read error: ${dir}`, err.message);
      return; // Skip directories we cannot read
    }

    for (const file of files) {
      const fullPath = path.join(dir, file);
      
      // Skip hidden files/directories (like .git, .episode-tracker.json, etc.)
      if (file.startsWith('.')) continue;

      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (err) {
        console.warn(`Skipping path due to stat error: ${fullPath}`, err.message);
        continue; // Skip files we cannot stat
      }

      if (stat.isDirectory()) {
        scan(fullPath);
      } else {
        const ext = path.extname(file).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          // Keep all files except empty 0-byte files
          if (stat.size <= 0) continue;

          const relativePath = path.relative(folderPath, fullPath);
          const nameWithoutExt = path.parse(file).name;
          
          // Determine if watched based on filename tag
          const hasTag = nameWithoutExt.endsWith(watchTag);
          
          // Clean filename by removing the tag for display
          let displayName = file;
          if (hasTag) {
            const index = nameWithoutExt.lastIndexOf(watchTag);
            displayName = nameWithoutExt.substring(0, index) + ext;
          }

          const parsed = parseEpisodeDetails(displayName);

          // Check watch status from DB or file tag
          const isWatchedInDb = !!dbData[relativePath] || !!dbData[file];
          const watched = hasTag || isWatchedInDb;

          // Format size nicely (support MB for smaller files)
          let sizeFormatted = '';
          if (stat.size > 1024 * 1024 * 1024) {
            sizeFormatted = (stat.size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
          } else {
            sizeFormatted = (stat.size / (1024 * 1024)).toFixed(1) + ' MB';
          }

          episodes.push({
            name: file,
            displayName: displayName,
            relativePath: relativePath,
            fullPath: fullPath,
            sizeBytes: stat.size,
            sizeFormatted: sizeFormatted,
            season: parsed.season,
            episode: parsed.episode,
            watched: watched,
            originalHasTag: hasTag
          });
        }
      }
    }
  }

  try {
    scan(folderPath);
  } catch (error) {
    console.error('Error scanning folder:', error);
    throw error;
  }

  // Update folder history in global config
  const config = readConfig();
  let history = config.history || [];
  history = history.filter(p => p !== folderPath);
  history.unshift(folderPath);
  if (history.length > 10) history = history.slice(0, 10);
  writeConfig({ ...config, history });

  return { episodes, dbMode: globalConfig.defaultMode || 'db', watchTag };
});

// Helper to find KMPlayer installation path on Windows
function getKMPlayerPath() {
  const paths = [
    'C:\\Program Files\\KMPlayer\\KMPlayer.exe',
    'C:\\Program Files (x86)\\KMPlayer\\KMPlayer.exe',
    'C:\\Program Files\\KMPlayer 64X\\KMPlayer64.exe',
    'C:\\Program Files (x86)\\KMPlayer 64X\\KMPlayer64.exe',
    path.join(process.env.LOCALAPPDATA || '', 'KMPlayer\\KMPlayer.exe')
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

// IPC: Play Episode
ipcMain.handle('play-episode', async (event, filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error('File does not exist');
  }

  const config = readConfig();
  const mediaPlayer = config.mediaPlayer || 'default';

  if (mediaPlayer === 'kmplayer') {
    const kmpPath = getKMPlayerPath();
    if (kmpPath) {
      // Secure execution without shell parameter interpolation
      execFile(kmpPath, [filePath], (err) => {
        if (err) {
          console.error('Failed to open file with KMPlayer path, falling back to system default:', err);
          shell.openPath(filePath);
        }
      });
    } else {
      execFile('kmplayer', [filePath], (err) => {
        if (err) {
          console.error('KMPlayer command not found in PATH, falling back to system default:', err);
          shell.openPath(filePath);
        }
      });
    }
  } else {
    // Native secure Electron API for opening files in system default player
    await shell.openPath(filePath);
  }

  return true;
});

// IPC: Toggle Watched
ipcMain.handle('toggle-watched', async (event, { folderPath, episode, mode, watchTag }) => {
  const { fullPath, relativePath, name, watched } = episode;
  const ext = path.extname(name);
  const nameWithoutExt = path.parse(name).name;
  
  if (!fs.existsSync(fullPath)) {
    throw new Error('File does not exist on disk');
  }

  let finalWatched = !watched;
  let newFullPath = fullPath;
  let newName = name;
  let newRelativePath = relativePath;

  if (mode === 'rename') {
    // Filesystem renaming mode
    const parentDir = path.dirname(fullPath);
    if (finalWatched) {
      // Add tag
      if (!nameWithoutExt.endsWith(watchTag)) {
        newName = nameWithoutExt + watchTag + ext;
      }
    } else {
      // Remove tag
      if (nameWithoutExt.endsWith(watchTag)) {
        newName = nameWithoutExt.slice(0, -watchTag.length) + ext;
      }
    }

    newFullPath = path.join(parentDir, newName);
    newRelativePath = path.relative(folderPath, newFullPath);

    if (fullPath !== newFullPath) {
      fs.renameSync(fullPath, newFullPath);
    }
  }

  // Database mode (save or update in local .episode-tracker.json)
  const dbPath = path.join(folderPath, '.episode-tracker.json');
  let dbData = {};
  if (fs.existsSync(dbPath)) {
    try {
      dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    } catch (e) {
      console.error('Error reading db', e);
    }
  }

  // If we are in rename mode, we also clean up or store in db for reference,
  // but in DB mode, relativePath is our key.
  if (mode === 'db') {
    if (finalWatched) {
      dbData[relativePath] = true;
    } else {
      delete dbData[relativePath];
    }
  } else {
    // In rename mode, clear the old keys in DB to avoid stale db data
    delete dbData[relativePath];
    delete dbData[newRelativePath];
  }

  fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf-8');

  return {
    success: true,
    watched: finalWatched,
    name: newName,
    fullPath: newFullPath,
    relativePath: newRelativePath
  };
});

// IPC: Bulk Watched
ipcMain.handle('bulk-toggle-watched', async (event, { folderPath, episodes, watch, mode, watchTag }) => {
  const dbPath = path.join(folderPath, '.episode-tracker.json');
  let dbData = {};
  if (fs.existsSync(dbPath)) {
    try {
      dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    } catch (e) {
      console.error('Error reading db in bulk', e);
    }
  }

  const results = [];

  for (const ep of episodes) {
    try {
      const { fullPath, relativePath, name } = ep;
      const ext = path.extname(name);
      const nameWithoutExt = path.parse(name).name;

      if (!fs.existsSync(fullPath)) continue;

      let newFullPath = fullPath;
      let newName = name;
      let newRelativePath = relativePath;

      if (mode === 'rename') {
        const parentDir = path.dirname(fullPath);
        if (watch) {
          if (!nameWithoutExt.endsWith(watchTag)) {
            newName = nameWithoutExt + watchTag + ext;
          }
        } else {
          if (nameWithoutExt.endsWith(watchTag)) {
            newName = nameWithoutExt.slice(0, -watchTag.length) + ext;
          }
        }

        newFullPath = path.join(parentDir, newName);
        newRelativePath = path.relative(folderPath, newFullPath);

        if (fullPath !== newFullPath) {
          fs.renameSync(fullPath, newFullPath);
        }
      }

      // Sync database file
      if (mode === 'db') {
        if (watch) {
          dbData[relativePath] = true;
        } else {
          delete dbData[relativePath];
        }
      } else {
        delete dbData[relativePath];
        delete dbData[newRelativePath];
      }

      results.push({
        originalFullPath: fullPath,
        name: newName,
        fullPath: newFullPath,
        relativePath: newRelativePath,
        watched: watch
      });
    } catch (err) {
      console.error('Failed to update file in bulk:', ep.name, err);
    }
  }

  fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf-8');

  return results;
});

// ==========================================================================
// METADATA SCRAPING & CACHING INTEGRATION (TVMAZE & TMDB)
// ==========================================================================

const DEFAULT_TMDB_API_KEY = '';

const CACHE_DIR = path.join(app.getPath('userData'), 'metadata-cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function getCacheFilename(folderPath) {
  const hash = crypto.createHash('md5').update(folderPath).digest('hex');
  return path.join(CACHE_DIR, `${hash}.json`);
}

function cleanShowName(folderPath) {
  const folderName = path.basename(folderPath);
  let cleanName = folderName
    // Remove brackets and parentheses content
    .replace(/\[.*?\]|\(.*?\)/g, '')
    // Replace dots, underscores, dashes with space
    .replace(/[\.\-_]/g, ' ')
    // Remove resolution patterns like 1080p, 720p, 4k, 2160p, 480p, etc.
    .replace(/\b\d{3,4}p\b/gi, '')
    // Remove standard video codec/source keywords
    .replace(/\b(x264|x265|h264|hevc|webrip|web-dl|bluray|brrip|hdtv|aac|dts|dd5\.1|ac3)\b/gi, '')
    // Remove release groups, years or season markers
    .replace(/\b(season\s*\d+|\bS\d{2}\b|S\d{1,2}|E\d{2})\b.*/gi, '')
    // Strip trailing or double spaces
    .replace(/\s+/g, ' ')
    .trim();
  
  return cleanName || folderName;
}

// TMDb fetch helper
async function fetchTMDB(endpoint, apiKey, queryParams = {}) {
  const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
  url.searchParams.append('api_key', apiKey);
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.append(key, value);
  }
  
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// TVmaze fetch helper
async function fetchTVmaze(endpoint, queryParams = {}) {
  const url = new URL(`https://api.tvmaze.com${endpoint}`);
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.append(key, value);
  }
  
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TVmaze API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// TMDb details scraper
async function scrapeShowDetails(showId, folderPath, apiKey) {
  const showData = await fetchTMDB(`/tv/${showId}`, apiKey);
  
  const metadata = {
    showId: showData.id,
    showName: showData.name,
    backdropPath: showData.backdrop_path,
    posterPath: showData.poster_path,
    seasons: {}
  };
  
  if (showData.seasons && Array.isArray(showData.seasons)) {
    for (const s of showData.seasons) {
      const sNum = s.season_number;
      try {
        const seasonData = await fetchTMDB(`/tv/${showId}/season/${sNum}`, apiKey);
        const episodesMap = {};
        
        if (seasonData.episodes && Array.isArray(seasonData.episodes)) {
          for (const ep of seasonData.episodes) {
            const directors = ep.crew
              ? ep.crew.filter(c => c.job === 'Director').map(c => c.name)
              : [];
            const guestStars = ep.guest_stars
              ? ep.guest_stars.slice(0, 5).map(g => g.name)
              : [];
              
            episodesMap[ep.episode_number] = {
              name: ep.name,
              overview: ep.overview,
              stillPath: ep.still_path,
              rating: ep.vote_average ? ep.vote_average.toFixed(1) : null,
              directors: directors,
              guestStars: guestStars
            };
          }
        }
        
        metadata.seasons[sNum] = {
          posterPath: seasonData.poster_path,
          episodes: episodesMap
        };
      } catch (err) {
        console.warn(`Failed to fetch TMDB details for Season ${sNum}:`, err.message);
      }
    }
  }
  
  const cacheFile = getCacheFilename(folderPath);
  fs.writeFileSync(cacheFile, JSON.stringify(metadata, null, 2), 'utf-8');
  return metadata;
}

// TVmaze details scraper
async function scrapeTVmazeShowDetails(showId, folderPath) {
  const showData = await fetchTVmaze(`/shows/${showId}`);
  const episodesData = await fetchTVmaze(`/shows/${showId}/episodes`);
  
  const posterUrl = showData.image ? (showData.image.original || showData.image.medium) : '';
  
  const metadata = {
    showId: showData.id,
    showName: showData.name,
    backdropPath: posterUrl,
    posterPath: posterUrl,
    seasons: {}
  };
  
  if (episodesData && Array.isArray(episodesData)) {
    for (const ep of episodesData) {
      const sNum = ep.season;
      if (!metadata.seasons[sNum]) {
        metadata.seasons[sNum] = {
          posterPath: posterUrl,
          episodes: {}
        };
      }
      
      const cleanOverview = ep.summary ? ep.summary.replace(/<\/?[^>]+(>|$)/g, '').trim() : '';
      
      metadata.seasons[sNum].episodes[ep.number] = {
        name: ep.name,
        overview: cleanOverview,
        stillPath: ep.image ? (ep.image.medium || ep.image.original) : null,
        rating: ep.rating && ep.rating.average ? ep.rating.average.toFixed(1) : null,
        directors: [],
        guestStars: []
      };
    }
  }
  
  const cacheFile = getCacheFilename(folderPath);
  fs.writeFileSync(cacheFile, JSON.stringify(metadata, null, 2), 'utf-8');
  return metadata;
}

// IPC Handlers
ipcMain.handle('fetch-show-metadata', async (event, { folderPath, forceRefresh = false }) => {
  const config = readConfig();
  const provider = config.metadataProvider || 'tvmaze';
  
  const cacheFile = getCacheFilename(folderPath);
  if (!forceRefresh && fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      return cached;
    } catch (err) {
      console.error('Failed to parse cached metadata, rescraping:', err);
    }
  }
  
  let showId = config.showLinkages?.[folderPath];
  
  if (provider === 'tvmaze') {
    if (!showId) {
      const cleanQuery = cleanShowName(folderPath);
      try {
        const searchResults = await fetchTVmaze('/search/shows', { q: cleanQuery });
        if (searchResults && searchResults.length > 0) {
          showId = searchResults[0].show.id;
          
          const updatedConfig = readConfig();
          if (!updatedConfig.showLinkages) updatedConfig.showLinkages = {};
          updatedConfig.showLinkages[folderPath] = showId;
          writeConfig(updatedConfig);
        }
      } catch (err) {
        console.error('Auto TVmaze search failed:', err);
        return null;
      }
    }
    
    if (!showId) return null;
    
    try {
      return await scrapeTVmazeShowDetails(showId, folderPath);
    } catch (err) {
      console.error('Scrape TVmaze show details failed:', err);
      return null;
    }
  } else {
    // TMDB
    const apiKey = config.tmdbApiKey || DEFAULT_TMDB_API_KEY;
    if (!apiKey) {
      return { error: 'missing_key', message: 'TMDb API Key not configured' };
    }
    
    if (!showId) {
      const cleanQuery = cleanShowName(folderPath);
      try {
        const searchResults = await fetchTMDB('/search/tv', apiKey, { query: cleanQuery });
        if (searchResults.results && searchResults.results.length > 0) {
          showId = searchResults.results[0].id;
          
          const updatedConfig = readConfig();
          if (!updatedConfig.showLinkages) updatedConfig.showLinkages = {};
          updatedConfig.showLinkages[folderPath] = showId;
          writeConfig(updatedConfig);
        }
      } catch (err) {
        console.error('Auto TMDB search failed:', err);
        if (err.message.includes('401')) {
          return { error: 'unauthorized', message: 'TMDb API key is invalid or unauthorized (Error 401)' };
        }
        return null;
      }
    }
    
    if (!showId) return null;
    
    try {
      return await scrapeShowDetails(showId, folderPath, apiKey);
    } catch (err) {
      console.error('Scrape TMDB show details failed:', err);
      if (err.message.includes('401')) {
        return { error: 'unauthorized', message: 'TMDb API key is invalid or unauthorized (Error 401)' };
      }
      return null;
    }
  }
});

ipcMain.handle('search-tmdb', async (event, query) => {
  const config = readConfig();
  const provider = config.metadataProvider || 'tvmaze';
  
  if (provider === 'tvmaze') {
    try {
      const results = await fetchTVmaze('/search/shows', { q: query });
      return results.map(item => {
        const show = item.show;
        return {
          id: show.id,
          name: show.name,
          poster_path: show.image ? (show.image.medium || show.image.original) : null,
          overview: show.summary ? show.summary.replace(/<\/?[^>]+(>|$)/g, '').trim() : '',
          first_air_date: show.premiered
        };
      });
    } catch (err) {
      console.error('TVmaze search error:', err);
      throw err;
    }
  } else {
    const apiKey = config.tmdbApiKey || DEFAULT_TMDB_API_KEY;
    if (!apiKey) {
      throw new Error('TMDB API Key is not set. Please add it in settings.');
    }
    
    try {
      const data = await fetchTMDB('/search/tv', apiKey, { query });
      return data.results || [];
    } catch (err) {
      console.error('TMDB search error:', err);
      if (err.message.includes('401')) {
        throw new Error('TMDB API error: 401 Unauthorized. Key is invalid.');
      }
      throw err;
    }
  }
});

ipcMain.handle('link-tmdb-id', async (event, { folderPath, showId }) => {
  const config = readConfig();
  const provider = config.metadataProvider || 'tvmaze';
  
  const updatedConfig = readConfig();
  if (!updatedConfig.showLinkages) updatedConfig.showLinkages = {};
  updatedConfig.showLinkages[folderPath] = parseInt(showId, 10);
  writeConfig(updatedConfig);
  
  try {
    if (provider === 'tvmaze') {
      return await scrapeTVmazeShowDetails(showId, folderPath);
    } else {
      const apiKey = config.tmdbApiKey || DEFAULT_TMDB_API_KEY;
      if (!apiKey) {
        throw new Error('TMDB API Key is not set. Please add it in settings.');
      }
      return await scrapeShowDetails(showId, folderPath, apiKey);
    }
  } catch (err) {
    console.error('Link show failed:', err);
    throw err;
  }
});

ipcMain.handle('validate-tmdb-key', async (event, apiKey) => {
  if (!apiKey) {
    return { valid: false, reason: 'Empty API Key' };
  }
  try {
    const url = `https://api.themoviedb.org/3/configuration?api_key=${apiKey}`;
    const response = await fetch(url);
    if (response.status === 200) {
      return { valid: true };
    } else if (response.status === 401) {
      return { valid: false, reason: '401 Unauthorized (Invalid Key)' };
    } else {
      return { valid: false, reason: `API returned HTTP ${response.status}` };
    }
  } catch (err) {
    return { valid: false, reason: 'Network error or TMDb API offline' };
  }
});

