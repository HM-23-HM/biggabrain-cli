import * as path from "path";
import { convertPdfToPng } from "./src/utils/conversion";
import { getPdfFilenames } from "./src/utils/fs";

const inboundDir = path.join(__dirname, "inbound");

const files = getPdfFilenames();
files.forEach((file) => {
  const filePath = path.join(inboundDir, file);
  convertPdfToPng(filePath)
    .then(() => console.log(`Converted ${file} to PNG`))
    .catch((err) => console.error(`Error converting ${file}:`, err));
});
