/**
 * fix-wiki-filenames.js - Batch rename wiki files to remove [ and ] characters
 * Usage: node scripts/fix-wiki-filenames.js "F:\Obsidian\wiki Test"
 */
const path = require('path');
const fs = require('fs-extra');

async function fixWikiFilenames(wikiDirPath) {
  const wikiDir = path.join(wikiDirPath, 'wiki');
  const indexPath = path.join(wikiDirPath, 'index.md');

  console.log('[fix-wiki-filenames] Starting...');
  console.log('[fix-wiki-filenames] Wiki dir:', wikiDir);
  console.log('[fix-wiki-filenames] Index path:', indexPath);

  if (!await fs.pathExists(wikiDir)) {
    console.error('[fix-wiki-filenames] Error: Wiki directory not found:', wikiDir);
    return;
  }

  // Step 1: Find all files that need renaming
  const files = await fs.readdir(wikiDir);
  const filesToRename = files.filter(file => file.includes('[') || file.includes(']'));

  if (filesToRename.length === 0) {
    console.log('[fix-wiki-filenames] ✓ No files need renaming');
    return;
  }

  console.log(`[fix-wiki-filenames] Found ${filesToRename.length} files to rename`);

  // Step 2: Rename the files
  const renamedFiles = [];
  for (const oldName of filesToRename) {
    const newName = oldName.replace(/[\[\]]/g, '');
    const oldPath = path.join(wikiDir, oldName);
    const newPath = path.join(wikiDir, newName);

    console.log(`[fix-wiki-filenames] Renaming: ${oldName} → ${newName}`);

    try {
      await fs.rename(oldPath, newPath);
      renamedFiles.push({ oldName, newName });
    } catch (e) {
      console.error(`[fix-wiki-filenames] Failed to rename ${oldName}:`, e.message);
    }
  }

  console.log(`[fix-wiki-filenames] ✓ Renamed ${renamedFiles.length} files`);

  // Step 3: Update index.md if it exists
  if (await fs.pathExists(indexPath)) {
    console.log('[fix-wiki-filenames] Updating index.md...');
    let indexContent = await fs.readFile(indexPath, 'utf-8');

    // Replace all occurrences in index.md
    for (const { oldName, newName } of renamedFiles) {
      indexContent = indexContent.split(oldName).join(newName);
    }

    // Also clean up any double [[...]] patterns
    indexContent = indexContent.replace(/\[\[wiki\/\[\[([^\]]+)\]\]_([^\]]+)\|\[\[([^\]]+)\]\]\]\]/g, (match, title, rest, title2) => {
      const cleanTitle = title.replace(/[\[\]]/g, '');
      const cleanRest = rest.replace(/[\[\]]/g, '');
      return `[[wiki/${cleanTitle}_${cleanRest}|${cleanTitle}]]`;
    });

    await fs.writeFile(indexPath, indexContent, 'utf-8');
    console.log('[fix-wiki-filenames] ✓ index.md updated');
  }

  console.log('[fix-wiki-filenames] Done!');
}

// Get wiki dir from command line or use default
const wikiDir = process.argv[2] || 'F:\\Obsidian\\wiki Test';

fixWikiFilenames(wikiDir).catch(e => {
  console.error('[fix-wiki-filenames] Error:', e);
  process.exit(1);
});
