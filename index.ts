import * as path from "path";
import { convertPdfToPng } from "./src/utils/conversion";
import { getFilenames } from "./src/utils/fs";
import { getQuestionFromImage } from "./src/utils/chain";

// const inboundDir = path.join(__dirname, "inbound");
const stagingDir = path.join(__dirname, "staging");

const paths = getFilenames('staging', 'png');
getQuestionFromImage(path.join(stagingDir, paths[0]));
// files.forEach((file) => {
//   const filePath = path.join(inboundDir, file);
//   convertPdfToPng(filePath)
//     .then(() => console.log(`Converted ${file} to PNG`))
//     .catch((err) => console.error(`Error converting ${file}:`, err));
// });
