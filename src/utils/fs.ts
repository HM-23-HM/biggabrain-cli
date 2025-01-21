import * as path from "path";
import * as fs from "fs";
import * as yaml from "js-yaml";

interface PromptsConfig {
  imageToText: string;
  expandSolution: string;
  generateQans: string;
  editingNotes: string;
  classify: string;
  doubleCheck: string;
  marketing: {
    quizzes: string;
    examPrepTips: string;
    motivation: string;
  }
}

interface SyllabusConfig {
  sections: string[];
}

const promptFileContents = fs.readFileSync("./configs/prompts.yaml", "utf8");
const sylFileContents = fs.readFileSync("./configs/syllabus.yaml", "utf8");
export const promptsConfig = yaml.load(promptFileContents) as PromptsConfig;
export const syllabusConfig = yaml.load(sylFileContents) as SyllabusConfig;

export type FolderNames =
  | "inbound"
  | "outbound"
  | "staging"
  | "archive"
  | "saved";

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

export function saveToFile(
  filename: string,
  content: string,
  folderName: FolderNames = "saved"
): void {
  const dir = path.join(__dirname, `../../${folderName}`);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, "utf8");
}

export function appendToFile(
  filename: string,
  content: string,
  folderName: string = "saved"
): void {
  const dir = path.join(__dirname, `../../${folderName}`);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, filename);

  // Create the file if it doesn't exist
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "", "utf8");
  }

  fs.appendFileSync(filePath, content, "utf8");
}

export function appendToJsonFile(
  filename: string,
  content: object[],
  folderName: string = "saved"
): void {
  const dir = path.join(__dirname, `../../${folderName}`);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, filename);

  let existingContent: object[] = [];

  // Check if the file exists and is not empty
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    const fileContent = fs.readFileSync(filePath, "utf8");
    try {
      existingContent = JSON.parse(fileContent);
      if (!Array.isArray(existingContent)) {
        throw new Error("Existing content is not an array");
      }
    } catch (error) {
      console.error("Error parsing existing JSON content:", error);
    }
  }

  // Append new content to the existing content
  if (!Array.isArray(content)) {
    existingContent.push(content);
  } else {
    existingContent.push(...content);
  }

  // Write the updated content back to the file
  fs.writeFileSync(filePath, JSON.stringify(existingContent, null, 2), "utf8");
}
