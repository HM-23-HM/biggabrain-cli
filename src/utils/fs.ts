import * as path from "path";
import * as fs from "fs";
import * as yaml from "js-yaml";

interface PromptsConfig {
  imageToText: string;
  generateQans: string;
  editingNotes: string;
}

const fileContents = fs.readFileSync("./configs/prompts.yaml", "utf8");
export const promptsConfig = yaml.load(fileContents) as PromptsConfig;

export type FolderNames = "inbound" | "outbound" | "staging" | "archive" | "saved";

export function getFilenames(
  folder: FolderNames = "inbound",
  fileType: "pdf" | "png"
) {
  const folderPath = path.join(__dirname, `../../${folder}`);
  if (!fs.existsSync(folderPath)) {
    throw new Error(`${folder} folder does not exist.`);
  }

  const validExtensions = [".pdf", ".png"];
  const extension = `.${fileType.toLowerCase()}`;

  if (!validExtensions.includes(extension)) {
    throw new Error(
      `Invalid file type: ${fileType}. Only 'pdf' and 'png' are allowed.`
    );
  }

  return fs
    .readdirSync(folderPath)
    .filter((file) => path.extname(file).toLowerCase() === extension);
}

export function saveToFile(filename: string, content: string, folderName: FolderNames = 'saved'): void {
    const dir = path.join(__dirname, `../../${folderName}`);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
}