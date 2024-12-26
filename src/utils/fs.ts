import * as path from 'path';
import * as fs from 'fs';

export function getPdfFilenames() {
    const inboundFolder = path.join(__dirname, '../../inbound');
    if (!fs.existsSync(inboundFolder)) {
        throw new Error('Inbound folder does not exist.');
    }

    return fs.readdirSync(inboundFolder).filter(file => path.extname(file).toLowerCase() === '.pdf');
}
