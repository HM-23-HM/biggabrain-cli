import * as path from 'path';
import * as fs from 'fs';

export function getPdfFilenames(folder: string = 'inbound') {
    const folderPath = path.join(__dirname, `../../${folder}`);
    if (!fs.existsSync(folderPath)) {
        throw new Error(`${folder} folder does not exist.`);
    }

    return fs.readdirSync(folderPath).filter(file => path.extname(file).toLowerCase() === '.pdf');
}
