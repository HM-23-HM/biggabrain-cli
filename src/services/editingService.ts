import { Qans, WorkedExampleContent, QuestionFile } from "../utils/types";
import katex from "katex";
import fs from "fs";

export class EditingService {
  private static instance: EditingService;

  private constructor() {}

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

  public getJsArray(input: string): string[] {
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

  public wrapTextOutsideTex(input: string): string {
    return input.replace(
      /(?:<[^>]+>)([^<\[]+)(?=<\/[^>]+>)/g,
      (match, content) => {
        return match.replace(content, `[tex]\\text{${content.trim()}}[/tex]`);
      }
    );
  }

  public wrapTexContentWith(
    input: string,
    type: "large" | "small" | "huge" = "huge"
  ): string {
    return input.replace(/\[tex\](.*?)\[\/tex\]/g, (match, content) => {
      return `[tex]\\${type}{${content}}[/tex]`;
    });
  }

  public wrapTextWith(
    input: string,
    type: "large" | "small" | "huge" = "small"
  ): string {
    return input.replace(
      /\\text\{(.*?)\}/g,
      (match, content) => `\\${type}{\\text{${content}}}`
    );
  }

  public stripTextFunctions(input: string): string {
    return input.replace(
      /\\text\{(.*?)\}/g,
      (match, content) => `<p>${content}</p>`
    );
  }

  public stripTopmostPTags(input: string): string {
    return input.replace(/^<p>(.*?)<\/p>$/g, "$1");
  }

  public extractJsonObjects(input: string): string[] {
    const regex = /```json\s*([\s\S]*?)\s*```/g;
    const matches = [];
    let match;

    while ((match = regex.exec(input)) !== null) {
      matches.push(match[1].trim());
    }

    return matches;
  }

  public extractAndSaveJsonStrings(
    input: string,
    filename: string = "output.json"
  ): void {
    const regex = /```json\s*([\s\S]*?)\s*```/g;
    const matches: string[] = [];
    let match;

    while ((match = regex.exec(input)) !== null) {
      let cleanedJson = match[1].replace(/\n/g, "").trim();
      cleanedJson = cleanedJson.replace(/^"\{/, "{").replace(/\}"$/, "}");
      matches.push(cleanedJson);
    }

    try {
      fs.writeFileSync(filename, JSON.stringify(matches, null, 2));
      console.log(`✅ JSON strings saved successfully to ${filename}`);
    } catch (error) {
      console.error("❌ Error saving JSON strings:", error);
    }
  }

  public extractValidJsonStringsFromFile(filePath: string): string[] {
    try {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const jsonRegex = /{[\s\S]*?}/g;
      const matches = fileContent.match(jsonRegex);

      if (!matches) {
        console.error("No valid JSON objects found in the file.");
        return [];
      }

      const validJsonStrings = matches.filter((jsonString) => {
        try {
          JSON.parse(jsonString);
          return true;
        } catch {
          return false;
        }
      });

      return validJsonStrings;
    } catch (error) {
      console.error("Error reading file:", error);
      return [];
    }
  }

  public processQuestionFile(fileContent: string): QuestionFile {
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

  public removeThinkTags(input: string): string {
    return input.replace(/<think>[\s\S]*?<\/think>/g, "");
  }

  public formatKatex(html: string): string {
    return this.wrapTextWith(this.wrapTEXWith(html));
  }

  public formatHtml(html: string): string {
    return this.styleHtmlWithTailwind(this.parseKatex(this.formatKatex(html)));
  }

  public wrapTEXWith(
    input: string,
    size: "small" | "large" | "huge" = "large"
  ): string {
    return input.replace(/\[tex\](.*?)\[\/tex\]/g, (match, content) => {
      return `[tex]\\${size}{${content}}[/tex]`;
    });
  }

  public styleHtmlWithTailwind(html: string): string {
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

  public parseHtml(html: string): string {
    return html;
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
      const fileContent = fs.readFileSync(filePath, "utf-8");

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

  public processJsonTextGuideFree(fileContent: string): string {
    const withoutBackticks = fileContent
      .split("\n")
      .map((line) => (line.trim().startsWith("```") ? "," : line))
      .join("\n");

    const withoutBrackets = withoutBackticks
      .replace(/^\s*\[\s*\n/m, "")
      .replace(/\n\s*\]\s*$/m, "");

    const objects = withoutBrackets
      .split(/(?<="})\s*(?={)/)
      .map((obj) => obj.trim())
      .filter((obj) => obj.length > 0);

    const processedObjects = objects.map((obj) => {
      return obj.replace(/^\s*{/, "{").replace(/}\s*$/, "}");
    });

    const result = `[\n  ${processedObjects.join(",\n  ")}\n]`
      .replace(/,\s*,/g, ",")
      .replace(/^\[\s*,/, "[")
      .replace(/,\s*\]$/, "\n]");

    return result;
  }

  private addBrackets(str: string): string {
    if (!str || str.length === 0) return "[]";
    return "[" + str.slice(1) + "]";
  }

  public chopUpDis(fileContent: string, delimiter: string = "***"): string {
    const first = this.replaceDemtingyah(fileContent, delimiter);
    return this.replaceJsonCommas(first, `\n${delimiter}\n`);
  }

  public replaceDemtingyah(fileContent: string, delimiter: string = ","): string {
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

  public replaceJsonCommas(text: string, replacement = '\n###\n'): string {
    return text.replace(/\},\s*[\r\n\s]*\{/g, `}${replacement}{`);
  }

  public processJsonTextAgain(fileContent: string): string {
    const temp = this.replaceDemtingyah(fileContent);
    return this.addBrackets(temp);
  }

  public addBackslashToCommands(text: string): string {
    return text.replace(/(?<!\\)\\[a-zA-Z]+/g, (match) => {
      if (match === "\\n") return match;
      return "\\" + match;
    });
  }

  public correctPaidResponse(text: string): string {
    const replacements = [
      { from: "\\(", to: "[tex]" },
      { from: "(", to: "[tex]" },
      { from: "\\)", to: "[/tex]" },
      { from: ")", to: "[/tex]" },
      { from: "<tex>", to: "[tex]" },
      { from: "</tex>", to: "[/tex]" },
      { from: "<texd>", to: "[texd]" },
      { from: "</texd>", to: "[/texd]" },
      { from: "texd>", to: "texd]" },
      { from: "\\[", to: "[tex]" },
      { from: "\\]", to: "[/tex]" },
    ];

    return replacements.reduce(
      (text, { from, to }) =>
        text.replace(
          new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
          to
        ),
      text
    );
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

  public formatContent(content: string): string {
    const withOutsideTextWrapped = this.wrapTextOutsideTex(content);
    const withLargeInTexTags = this.wrapTexContentWith(withOutsideTextWrapped);
    const withSmallText = this.wrapTextWith(withLargeInTexTags);
    const parsed = this.parseKatex(withSmallText);
    return parsed;
  }

  public fixExcessiveBackslashes(strings: string[]): string[] {
    const excessiveSlashRegex = /(?<=\s)\\\\\\\\(?!\s)/g;
    
    return strings.map((original) => {
        return original.replace(excessiveSlashRegex, '\\\\');
    });
  }
}

export const getEditingService = () => EditingService.getInstance();
