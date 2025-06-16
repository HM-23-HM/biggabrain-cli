import { Qans, WorkedExampleContent, QuestionFile } from "../utils/types";
import katex from "katex";
import fs from "fs";
import { FileService, getFileService } from "./fileService";
import { LLMService, getLLMService } from "../services/llmService";

//TODO: Find a way to reduce the number of editing methods needed.
export class EditingService {
  private static instance: EditingService;
  private fileService: FileService;
  private llmService: LLMService;

  private constructor() {
    this.fileService = getFileService();
    this.llmService = getLLMService();
  }

  public static getInstance(): EditingService {
    if (!EditingService.instance) {
      EditingService.instance = new EditingService();
    }
    return EditingService.instance;
  }

  public stripLLMOutputMarkers(content: string): string {
    const regex = /(?<=\s)```|^```(\w+)?/g;
    return content.replace(regex, "");
  }

  public convertLLMResponseToJsArray(input: string): string[] {
    return JSON.parse(this.stripLLMOutputMarkers(input));
  }

  public extractQuestionAndSolution(
    obj: Qans & { questionId: string }
  ): WorkedExampleContent[] {
    const result = [];

    if (obj.question) {
      result.push({
        content: `<p>${obj.question.trim()}</p>`,
        questionId: obj.questionId,
      });
    }

    if (obj.solution) {
      const steps = obj.solution.match(/<h3>.*?<\/h3>.*?(?=<h3>|$)/g);
      if (steps) {
        result.push(
          ...steps.map((step) => ({
            content: step.trim(),
            questionId: obj.questionId,
          }))
        );
      }
    }

    return result;
  }


  /** Wraps text (not TeX) with a size modifier. */
  private wrapTextWith(
    input: string,
    type: "large" | "small" | "huge" = "small"
  ): string {
    return input.replace(
      /\\text\{(.*?)\}/g,
      (match, content) => `\\${type}{\\text{${content}}}`
    );
  }

  /** Splits a question file into valid and invalid objects. */
  public splitQuestionFile(fileContent: string): QuestionFile {
    const result: QuestionFile = {
      content: fileContent,
      validObjects: [],
      invalidObjects: [],
    };

    const objects = fileContent.split("json\n");

    for (let i = 1; i < objects.length; i++) {
      let obj = objects[i].trim();
      const startBrace = obj.indexOf("{");
      const lastBrace = obj.lastIndexOf("}");

      if (startBrace === -1 || lastBrace === -1) {
        continue;
      }

      const jsonString = obj.substring(startBrace, lastBrace + 1);

      if (this.isCompleteObject(jsonString)) {
        result.validObjects.push(jsonString);
      } else {
        result.invalidObjects.push(jsonString);
      }
    }

    return result;
  }

  private isCompleteObject(jsonString: string): boolean {
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") braceCount++;
        if (char === "}") braceCount--;

        if (braceCount < 0) return false;
      }
    }

    return braceCount === 0;
  }

  private formatKatex(html: string): string {
    return this.wrapTextWith(this.wrapTEXWith(html));
  }

  public formatHtml(html: string): string {
    return this.styleHtmlWithTailwind(this.parseKatex(this.formatKatex(html)));
  }

  private wrapTEXWith(
    input: string,
    size: "small" | "large" | "huge" = "large"
  ): string {
    return input.replace(/\[tex\](.*?)\[\/tex\]/g, (match, content) => {
      return `[tex]\\${size}{${content}}[/tex]`;
    });
  }

  private styleHtmlWithTailwind(html: string): string {
    const pLiShared = "text-4xl mx-auto my-8";
    const listShared = "list-inside mb-4 pl-20";
    const allShared =
      "font-playfair text-[#F3F4F7] tracking-[0.5px] space-x-[2px] leading-[1.6]";

    const styledHtml = html
      .replace(/<h3>/g, `<h3 class="${allShared} text-5xl mb-8 font-semibold">`)
      .replace(
        /<h4>/g,
        `<h4 class="${allShared} text-2xl font-semibold mt-6 mb-3 text-blue-600">`
      )
      .replace(/<p>/g, `<p class="${pLiShared} ${allShared}">`)
      .replace(/<ul>/g, `<ul class="list-disc ${listShared} ${allShared}">`)
      .replace(/<ol>/g, `<ol class="list-decimal ${listShared} ${allShared}">`)
      .replace(/<li>/g, `<li class="${pLiShared} ${allShared}">`)
      .replace(/<strong>/g, '<strong class="font-bold text-gray-900">')
      .replace(/<em>/g, '<em class="italic text-gray-800">')
      .replace(/<mark>/g, '<mark class="bg-yellow-200 px-1 rounded">')
      .replace(
        /<code>/g,
        '<code class="bg-gray-100 px-2 py-1 rounded font-mono text-sm">'
      )
      .replace(/<a /g, '<a class="text-blue-600 hover:underline" ');

    return styledHtml;
  }

  /** Cleans the objectives text by removing backticks and misplaced brackets
   * to ensure that the objectives are in a valid JSON format. */
  public cleanObjectivesFile(fileContent: string): string {
    const withoutBackticks = fileContent
      .split("\n")
      .filter((line) => !line.trim().startsWith("```"))
      .join("\n");

    const withoutBrackets = withoutBackticks.replace(/^\s*\[|\]\s*$/gm, "");

    const objects = withoutBrackets
      .split(/\n\s*}\s*,?\s*\n\s*{/)
      .map((obj) => obj.trim())
      .filter((obj) => obj.length > 0)
      .map((obj) => (obj.startsWith("{") ? obj : `{${obj}`))
      .map((obj) => (obj.endsWith("}") ? obj : `${obj}}`));

    return `[\n  ${objects.join(",\n  ")}\n]`;
  }

  public getObjectsFromFile(filePath: string): string[] {
    try {
      const fileContent = this.fileService.readFile(filePath);

      try {
        const parsed = JSON.parse(fileContent);
        if (Array.isArray(parsed)) {
          return parsed.map((obj) => JSON.stringify(obj, null, 2));
        }
      } catch (parseError) {
        const objectRegex = /{[^{}]*}/g;
        const matches = fileContent.match(objectRegex);
        if (matches) {
          return matches.map((obj) => {
            try {
              return JSON.stringify(JSON.parse(obj), null, 2);
            } catch {
              return obj;
            }
          });
        }
      }

      return [];
    } catch (error) {
      console.error("Error reading file:", error);
      return [];
    }
  }

  private addSquareBrackets(str: string): string {
    if (!str || str.length === 0) return "[]";
    return "[" + str.slice(1) + "]";
  }

  public chopUpDis(fileContent: string, delimiter: string = "***"): string {
    const first = this.removeTripleBackticks(fileContent, delimiter);
    return this.replaceJsonCommas(first, `\n${delimiter}\n`);
  }

  private removeTripleBackticks(fileContent: string, delimiter: string = ","): string {
    return fileContent
      .split("\n")
      .map((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine === "```") return "";
        if (trimmedLine === "```json") return delimiter;
        if (trimmedLine === "``````json") return delimiter;
        if (
          trimmedLine.startsWith("```") &&
          !trimmedLine.match(/^(```json|``````json)$/)
        )
          return "";
        if (
          trimmedLine.includes("```json") &&
          !trimmedLine.match(/^(```json|``````json)$/)
        )
          return delimiter;
        if (trimmedLine === "[" || trimmedLine === "]") return "";
        return line;
      })
      .join("\n");
  }

  private replaceJsonCommas(text: string, replacement = '\n###\n'): string {
    return text.replace(/\},\s*[\r\n\s]*\{/g, `}${replacement}{`);
  }

  private removeBackticksFromJson(fileContent: string): string {
    const temp = this.removeTripleBackticks(fileContent);
    return this.addSquareBrackets(temp);
  }

  public escapeKatexCommands(text: string): string {
    return text.replace(/(?<!\\)\\[a-zA-Z]+/g, (match) => {
      if (match === "\\n") return match;
      return "\\" + match;
    });
  }

  public parseKatex(source: string): string {
    source = source.replace(/\[tex\](.*?)\[\/tex\]/g, (match, p1) => {
      try {
        return katex.renderToString(p1, {
          throwOnError: false,
          displayMode: false
        });
      } catch (error) {
        console.error('KaTeX rendering error:', error);
        return match;
      }
    });
    
    source = source.replace(/\[texd\](.*?)\[\/texd\]/g, (match, p1) => {
      try {
        const content = p1.replace(/\\begin{equation}/g, '\\begin{equation*}')
                         .replace(/\\end{equation}/g, '\\end{equation*}');
        return katex.renderToString(content, {
          throwOnError: false,
          displayMode: true
        });
      } catch (error) {
        console.error('KaTeX rendering error:', error);
        return match;
      }
    });
    
    return source;
  }

  public getRandomLetter(): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    return alphabet[randomIndex];
  }

  public addQuestionId(qans: Qans): Qans & { questionId: string } {
    return { ...qans, questionId: this.getRandomLetter() };
  }

  public fixExcessiveBackslashes(strings: string[]): string[] {
    const excessiveSlashRegex = /(?<=\s)\\\\\\\\(?!\s)/g;
    
    return strings.map((original) => {
        return original.replace(excessiveSlashRegex, '\\\\');
    });
  }

  /** Joins an array of strings into a single string.
   * Each string is on a new line.
   */
  public joinStrings(strings: string[]): string {
    return strings.join("\n");
  }

  /** Joins an array of objects into a single string.
   * Each object is converted to a string using JSON.stringify.
   * Each string is on a new line.
   */
  public joinObjects(objects: any[]): string {
    const int = objects.map((object) => JSON.stringify(object));
    return int.join("\n");
  }

  /** Generic function to correct content (lessons or practice problems)
   * @param content The content to correct
   * @param contentType The type of content ('lessons' or 'practice')
   */
  public async correctLessonsOrPractice(
    content: string,
    contentType: 'lessons' | 'practice'
  ): Promise<void> {
    const delimiter = "*****";
    
    const segmentedContent = await this.segmentContent(content, delimiter, `segmented${contentType}.txt`, contentType);
    const correctedContent = await this.correctAndSaveContent(segmentedContent, `corrected${contentType}.txt`, contentType);
    await this.formatAndSaveAsJson(correctedContent, `corrected${contentType}.json`);
  }

  /** Segments content using a delimiter and saves it to a file */
  private async segmentContent(
    content: string,
    delimiter: string,
    outputFile: string,
    contentType: string
  ): Promise<string[]> {
    const segmentedContent = this.chopUpDis(content, delimiter);
    this.fileService.appendToFile(outputFile, segmentedContent);

    const segmentedList = segmentedContent.split(delimiter).filter(Boolean);
    console.log(`There are ${segmentedList.length} segmented ${contentType}`);

    return segmentedList;
  }

  /** Corrects content in batches and saves it to a file */
  private async correctAndSaveContent(
    segmentedList: string[],
    outputFile: string,
    contentType: string
  ): Promise<string[]> {
    const batchSize = 3;
    const correctedContent: string[] = [];

    for (let i = 0; i < segmentedList.length; i += batchSize) {
      const batch = segmentedList.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(content => this.correctTex(content))
      );
      correctedContent.push(...batchResults);
      console.log(`Batch ${Math.floor(i / batchSize) + 1} processed`);
    }

    console.log(`There are ${correctedContent.length} corrected ${contentType}`);
    this.fileService.appendToFile(outputFile, correctedContent.join("\n"));

    return correctedContent;
  }

  /** Formats content as JSON and saves it to a file */
  private async formatAndSaveAsJson(
    correctedContent: string[],
    outputFile: string
  ): Promise<void> {
    const formattedContent = this.removeBackticksFromJson(
      this.escapeKatexCommands(correctedContent.join("\n"))
    );
    this.fileService.appendToFile(outputFile, formattedContent, "outbound");
  }

  /** Corrects TeX syntax in content using LLM */
  private async correctTex(content: string): Promise<string> {
    return this.llmService.sendPrompt(
      `${this.fileService.promptsConfig.correctTex}\n${content}`
    );
  }
}

export const getEditingService = () => EditingService.getInstance();
