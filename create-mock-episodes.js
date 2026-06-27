import fs from 'fs';
import path from 'path';

const mockDir = path.join(process.cwd(), 'mock-tv-show');

if (!fs.existsSync(mockDir)) {
  fs.mkdirSync(mockDir);
}

// 1.1 MB buffer to make files pass the size filter
const sizeBytes = 1.1 * 1024 * 1024;
const buffer = Buffer.alloc(sizeBytes);

const seasons = [
  { num: 1, count: 25, titles: ['Pilot', 'The Beginning', 'Deep Water', 'Rising Storm', 'Lost and Found', 'The Trap', 'Outbreak', 'Shadows', 'The Alliance', 'Underground', 'Secrets', 'Treason', 'The Escape', 'Survival', 'New Horizon', 'The Stand', 'Ambush', 'Broken Chains', 'Reckoning', 'The Cure', 'Aftermath', 'Exile', 'Return', 'Judgment', 'Season Finale'] },
  { num: 2, count: 22, titles: ['New Threat', 'Dark Days', 'Infiltration', 'Rescue Mission', 'The Vault', 'Double Cross', 'The Signal', 'Blackout', 'Conspiracy', 'Interrogation', 'The Hatch', 'Captured', 'Decoy', 'Pursuit', 'Sanctuary', 'Betrayal', 'The Lab', 'Gridlock', 'Fallout', 'Redemption', 'The Confrontation', 'Cliffhanger'] },
  { num: 3, count: 24, titles: ['The Aftermath', 'Rebuilding', 'The Stranger', 'Vigilante', 'Sabotage', 'The Warning', 'Locked Down', 'High Voltage', 'The Runaway', 'Ghost Town', 'Outcast', 'The Message', 'Cold Case', 'Under Fire', 'The Negotiation', 'Breakout', 'Showdown', 'The Hive', 'Tornado', 'Critical State', 'Echoes', 'The Last Stand', 'Departure', 'Resolution'] }
];

console.log('Generating mock TV show folder with ~70 episodes...');

seasons.forEach(season => {
  const seasonDir = path.join(mockDir, `Season ${season.num}`);
  if (!fs.existsSync(seasonDir)) {
    fs.mkdirSync(seasonDir);
  }

  for (let i = 1; i <= season.count; i++) {
    const epNum = String(i).padStart(2, '0');
    const sNum = String(season.num).padStart(2, '0');
    const title = season.titles[i - 1] || `Episode ${i}`;
    const filename = `Adventure.Show.S${sNum}E${epNum}.${title}.mp4`;
    const filePath = path.join(seasonDir, filename);

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, buffer);
    }
  }
});

console.log(`Successfully generated mock TV show at: ${mockDir}`);
console.log('You can now scan this directory in the application to test it!');
