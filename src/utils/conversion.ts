const poppler = require('pdf-poppler');
import * as path from 'path';
import * as fs from 'fs';


export async function convertPdfToPng(pdfFilePath: string) {
    const stagingFolder = path.join(__dirname, '../../staging');
    console.log({ pdfFilePath, stagingFolder });

    let opts = {
        format: 'png',
        out_dir: 'staging',
        out_prefix: path.basename(pdfFilePath, path.extname(pdfFilePath)),
        page: null
    }

    console.log({ opts });

    if (!fs.existsSync(pdfFilePath)) {
        console.log({ pdfFilePath });
        throw new Error(`PDF file ${pdfFilePath} does not exist in the inbound folder.`);
    }

    if (!fs.existsSync(stagingFolder)) {
        fs.mkdirSync(stagingFolder, { recursive: true });
    }

    try {
        await poppler.convert(pdfFilePath, opts);
        console.log(`PDF file ${pdfFilePath} has been successfully converted to PNG files.`);
    } catch (error) {
        console.error(`Error converting PDF file ${pdfFilePath}:`, error);
    }
}

