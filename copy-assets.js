import fs from 'fs';
import path from 'path';

const assetsDir = path.join(process.cwd(), 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: { recursive: true } });
}

const dashboardSrc = 'C:\\Users\\DINUWA\\.gemini\\antigravity-ide\\brain\\59fa2bc8-7e7e-4788-8447-de156cca66e8\\cinetrack_dashboard_screenshot_1782542836235.png';
const settingsSrc = 'C:\\Users\\DINUWA\\.gemini\\antigravity-ide\\brain\\59fa2bc8-7e7e-4788-8447-de156cca66e8\\cinetrack_settings_screenshot_1782542884673.png';

fs.copyFileSync(dashboardSrc, path.join(assetsDir, 'dashboard-preview.png'));
fs.copyFileSync(settingsSrc, path.join(assetsDir, 'settings-preview.png'));

console.log('Successfully copied screenshots to assets folder!');
