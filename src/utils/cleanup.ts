import * as fs from 'fs';
import * as path from 'path';

export async function moveFiles() {
    const inboundDir = path.join(__dirname, '../../inbound');
    const archiveInboundDir = path.join(__dirname, '../../archive/inbound');
    const savedDir = path.join(__dirname, '../../saved');
    const archiveDir = path.join(__dirname, '../../archive');
    const stagingDir = path.join(__dirname, '../../staging');
    const archiveStagingDir = path.join(__dirname, '../../archive/staging');

    // Ensure archive/inbound directory exists
    if (!fs.existsSync(archiveInboundDir)) {
        fs.mkdirSync(archiveInboundDir, { recursive: true });
    }

    // Ensure archive/staging directory exists
    if (!fs.existsSync(archiveStagingDir)) {
        fs.mkdirSync(archiveStagingDir, { recursive: true });
    }

    // Move files from inbound to archive/inbound
    const inboundFiles = fs.readdirSync(inboundDir);
    for (const file of inboundFiles) {
        const srcPath = path.join(inboundDir, file);
        const destPath = path.join(archiveInboundDir, file);
        fs.renameSync(srcPath, destPath);
    }

    // Move files from staging to archive/staging
    const stagingFiles = fs.readdirSync(stagingDir);
    for (const file of stagingFiles) {
        const srcPath = path.join(stagingDir, file);
        const destPath = path.join(archiveStagingDir, file);
        fs.renameSync(srcPath, destPath);
    }

    // Find the next auto-increment index for the saved/ folder
    let index = 1;
    while (fs.existsSync(path.join(archiveDir, index.toString()))) {
        index++;
    }

    const archiveSavedDir = path.join(archiveDir, index.toString(), 'saved');

    // Ensure archive/[index]/saved directory exists
    if (!fs.existsSync(archiveSavedDir)) {
        fs.mkdirSync(archiveSavedDir, { recursive: true });
    }

    // Move files from saved/ to archive/[index]/saved/
    const savedFiles = fs.readdirSync(savedDir);
    for (const file of savedFiles) {
        const oldPath = path.join(savedDir, file);
        const newPath = path.join(archiveSavedDir, file);
        fs.renameSync(oldPath, newPath);
    }
}
