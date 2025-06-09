import * as path from "path";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { Syllabus, Prompts } from "../utils/types";

export type FolderNames = "inbound" | "outbound" | "staging" | "archive" | "saved";

export class FileService {
  private static instance: FileService;
  private _promptsConfig: Prompts;
  private _syllabusConfig: Syllabus;

  private constructor() {
    const promptFileContents = fs.readFileSync("./configs/prompts.yaml", "utf8");
    const sylFileContents = fs.readFileSync("./configs/syllabus.yaml", "utf8");
    this._promptsConfig = yaml.load(promptFileContents) as Prompts;
    this._syllabusConfig = yaml.load(sylFileContents) as Syllabus;
  }

  public static getInstance(): FileService {
    if (!FileService.instance) {
      FileService.instance = new FileService();
    }
    return FileService.instance;
  }

  public get promptsConfig(): Prompts {
    return this._promptsConfig;
  }

  public get syllabusConfig(): Syllabus {
    return this._syllabusConfig;
  }

  public getFilenames(folder: FolderNames = "inbound", fileType: "pdf" | "png"): string[] {
    const folderPath = path.join(__dirname, `../../${folder}`);
    if (!fs.existsSync(folderPath)) {
      throw new Error(`${folder} folder does not exist.`);
    }

    const validExtensions = [".pdf", ".png"];
    const extension = `.${fileType.toLowerCase()}`;

    if (!validExtensions.includes(extension)) {
      throw new Error(`Invalid file type: ${fileType}. Only 'pdf' and 'png' are allowed.`);
    }

    return fs
      .readdirSync(folderPath)
      .filter((file) => path.extname(file).toLowerCase() === extension);
  }

  public saveToFile(filename: string, content: string, folderName: FolderNames = "saved"): void {
    const dir = path.join(__dirname, `../../${folderName}`);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content, "utf8");
  }

  public appendToFile(filename: string, content: string, folderName: string = "saved"): void {
    const dir = path.join(__dirname, `../../${folderName}`);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, filename);

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "", "utf8");
    }

    fs.appendFileSync(filePath, content, "utf8");
  }

  public appendToJsonFile(filename: string, content: object[], folderName: string = "saved"): void {
    const dir = path.join(__dirname, `../../${folderName}`);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, filename);

    let existingContent: object[] = [];

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

    if (!Array.isArray(content)) {
      existingContent.push(content);
    } else {
      existingContent.push(...content);
    }

    fs.writeFileSync(filePath, JSON.stringify(existingContent, null, 2), "utf8");
  }

  public copyFileToJson(filePath: string): void {
    try {
      const dir = path.dirname(filePath);
      const basename = path.basename(filePath, path.extname(filePath));
      
      const newPath = path.join(dir, `${basename}.json`);
      
      fs.copyFileSync(filePath, newPath);
      
      console.log(`File copied successfully to ${newPath}`);
    } catch (error) {
      console.error('Error copying file:', error);
    }
  }

  public readFileAsBase64(filePath: string): string {
    return fs.readFileSync(filePath).toString("base64");
  }
}

export const getFileService = () => FileService.getInstance();
