import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import * as handlebars from "handlebars";
import * as puppeteer from "puppeteer";
import * as util from "util";
import { v4 as uuidv4 } from "uuid";
const poppler = require('pdf-poppler');
import { Syllabus, Prompts, FolderNames, ContentType, MultipleChoice, WorkedExampleContent } from "../utils/types";

export class FileService {
  private static instance: FileService;
  private _promptsConfig: Prompts;
  private _syllabusConfig: Syllabus;

  private contentTemplateMap: Record<ContentType, string> = {
    "Motivational Quote": "post",
    "Exam Tips": "post",
    "Worked Example": "workedExample",
    Quizzes: "quiz",
  };

  private contentColorMap: Record<ContentType, string> = {
    "Motivational Quote": "#B4A9EF",
    "Exam Tips": "#ADEBD1",
    "Worked Example": "#2D3142",
    Quizzes: "#F1B4A1",
  };

  private constructor() {
    const promptFileContents = fs.readFileSync("./prompts/main.yaml", "utf8");
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

  public readFile(filePath: string): string {
    return fs.readFileSync(filePath, "utf-8");
  }

  private generateHtmlFilename(type: ContentType, workedExample?: WorkedExampleContent): string {
    return type === 'Worked Example' ? `${type}-${workedExample?.questionId ?? ""}-${uuidv4()}.html` : `${type}-${uuidv4()}.html`;
  }

  private async generateHtml(
    type: ContentType,
    quote: string | MultipleChoice | WorkedExampleContent,
    filename: string
  ): Promise<void> {
    const templatePath = path.resolve("", `./templates/${this.contentTemplateMap[type]}.html`);
    const templateSource = fs.readFileSync(templatePath, "utf-8");
    const template = handlebars.compile(templateSource);

    const logoPath = path.resolve("", "./assets/logo.svg");
    const commonConfig = {
      backgroundColor: this.contentColorMap[type],
      logoPath,
    };

    let templateConfig: any = { quote, ...commonConfig };

    switch(type){
      case 'Worked Example':
        const _temp = quote as WorkedExampleContent;
        templateConfig = {
          quote: _temp.content,
          questionId: _temp.questionId,
          ...commonConfig
        }
        break;
      case 'Quizzes':
        templateConfig = { ...(quote as MultipleChoice), ...commonConfig };
        break;
    }

    const html = template(templateConfig);
    const writeFile = util.promisify(fs.writeFile);
    const htmlOutputPath = path.resolve("", "posts", "html", filename);
    await writeFile(htmlOutputPath, html);
  }

  private async generatePngFromHtml(htmlFilename: string): Promise<void> {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("file://" + path.resolve("", "posts", "html", htmlFilename));
    const outputPath = path.resolve("", "posts", "png", htmlFilename.replace(".html", ".png"));
    await page.screenshot({ path: outputPath, fullPage: true });
    await browser.close();
  }

  private async cleanupHtml(): Promise<void> {
    const htmlFilesPath = path.resolve("", "posts", "html");
    const files = fs.readdirSync(htmlFilesPath);
    for (const file of files) {
      fs.unlinkSync(path.join(htmlFilesPath, file));
    }
    console.log("html files cleaned up");
  }

  private async generateImagesForSources(
    sources: (string | WorkedExampleContent)[],
    type: ContentType
  ): Promise<void> {
    for (const quote of sources) {
      const filename = type === 'Worked Example' ? this.generateHtmlFilename(type, quote as WorkedExampleContent) : this.generateHtmlFilename(type);
      await this.generateHtml(type, quote, filename);
      await this.generatePngFromHtml(filename);
    }
  }

  public async generateMarketingImages(sourceMaterial: {
    [K in ContentType]: (string | WorkedExampleContent)[];
  }): Promise<void> {
    console.log(`Generating images for marketing`);
    for (const key in sourceMaterial) {
      const sources = sourceMaterial[key as keyof typeof sourceMaterial];
      if (sources.length > 0) {
        await this.generateImagesForSources(sources, key as ContentType);
      }
    }
    console.log(`Cleaning up HTML files`);
    await this.cleanupHtml();
    console.log(`Marketing images generated and html files cleaned up`);
  }

  public async convertPdfToPng(pdfFilePath: string): Promise<void> {
    const stagingFolder = path.join(__dirname, '../../staging');

    let opts = {
        format: 'png',
        out_dir: 'staging',
        out_prefix: path.basename(pdfFilePath, path.extname(pdfFilePath)),
        page: null
    }

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

  public async moveFiles(): Promise<void> {
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

  public async convertSyllabusToImages(): Promise<string[]> {
    const inboundDir = path.join(__dirname, "../../inbound");
    const stagingDir = path.join(__dirname, "../../staging");

    const pdfFiles = this.getFilenames("inbound", "pdf");
    for (const file of pdfFiles) {
      const filePath = path.join(inboundDir, file);
      await this.convertPdfToPng(filePath);
      console.log(`Converted ${file} to PNG`);
    }

    const imageFiles = this.getFilenames("staging", "png");
    const imagePaths = imageFiles.map(file => {
      return path.join(stagingDir, file.replace(".pdf", ".png"));
    });

    return imagePaths;
  }
}

export const getFileService = () => FileService.getInstance();
