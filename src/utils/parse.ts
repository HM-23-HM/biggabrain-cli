import { Qans } from "./ai";
import { parseKatex, WorkedExampleContent } from "./marketing";
import fs from "fs";

export function parseJsonString(input: string) {
  try {
    const stripped = stripLLMOutputMarkers(input)
    return JSON.parse(stripped)
  } catch (error) {
    console.error("Error parsing JSON: " + error, true);
    throw new Error("Invalid JSON string");
  }
}

export function stripJsonMarkers(content: string): string {
  return content.replace(/```json/g, "").replace(/```/g, "");
}

export function stripLLMOutputMarkers(content: string): string {
  const regex = /(?<=\s)```|^```(\w+)?/g
  return content.replace(regex, "")
}

export function parseOrReturnString(input: string): object | string {
    try {
        const parsedJson = parseJsonString(input);
        return parsedJson;
    } catch (error) {
        return input;
    }
}

/**
 * Corrects KaTeX syntax in strings to ensure proper escaping and formatting for JSON representation.
 * 
 * This function fixes common KaTeX syntax issues:
 * - Ensures all math expressions are wrapped in [tex]...[/tex] tags
 * - Normalizes LaTeX command escaping (e.g., \\frac instead of \frac or \\\\frac)
 * - Handles matrix line breaks correctly (requires four backslashes in JSON)
 * - Escapes currency symbols outside math mode
 * - Wraps standalone LaTeX commands in [tex] tags
 * 
 * @param strings - Array of strings containing KaTeX expressions
 * @returns Array of strings with corrected KaTeX syntax
 * 
 * @example
 * // Corrects over-escaped commands
 * fixKatexSyntax(["[tex]\\\\\\\\frac{1}{2}[/tex]"]) 
 * // Returns: ["[tex]\\frac{1}{2}[/tex]"]
 * 
 * @example
 * // Fixes matrix line breaks
 * fixKatexSyntax(["[tex]\\begin{pmatrix} 1 \\ 2 \\end{pmatrix}[/tex]"])
 * // Returns: ["[tex]\\begin{pmatrix} 1 \\\\ 2 \\end{pmatrix}[/tex]"]
 * 
 * @example
 * // Escapes currency symbols
 * fixKatexSyntax(["The cost is $50"])
 * // Returns: ["The cost is \\$50"]
 * 
 * @example
 * // Wraps naked LaTeX commands
 * fixKatexSyntax(["\\frac{1}{2}"])
 * // Returns: ["[tex]\\frac{1}{2}[/tex]"]
 */
export  function fixKatexSyntax(jsonStrings: string[]): string[] {
  // Regexes for common KaTeX patterns/repairs
  // ------------------------------------------------
  // 1) Identify common KaTeX commands that need two backslashes:
  //    \frac -> \\frac, \sqrt -> \\sqrt, \vec -> \\vec, \text -> \\text, etc.
  //    We'll capture a single backslash followed by a recognized command.
  //    Then we replace with two backslashes.
  const singleSlashCommands = /\[tex\]([^[]*?)\\(frac|sqrt|vec|text|begin|end)\b/g;

  // 2) Inside [tex], fix matrix line breaks:
  //    If we see `\\` (two backslashes) that might be a line break;
  //    it needs to become `\\\\` in JSON to ensure KaTeX sees `\\`.
  //    This excludes commands like \\frac, so we do a negative lookahead for known commands.
  const matrixBreaks = /\[tex\]([^[]*?)(?<!\\)(\\)(?!frac|sqrt|vec|text|begin|end)(?! )/g;

  // 3) Currency symbols outside of math mode: replace `$` with `\\$` unless it's inside [tex].
  //    We'll do a quick pass on anything outside [tex] blocks.
  //    A naive approach: strip out [tex]...[/tex] temporarily, fix $ in the remainder, then reinsert.
  //    For brevity, we'll do a simple replacement with a negative lookbehind for \ and ignoring
  //    anything inside [tex].
  const dollarSignOutsideMath = /(?<!\\)\$/g;

  // 4) We might do additional fixes if needed, such as ensuring everything is in [tex]...[/tex],
  //    but that can be very context-specific and might require more advanced parsing.

  return jsonStrings.map((original) => {
    let fixed = original;

    // --- Fix single backslash commands INSIDE [tex]...[/tex] to have exactly two backslashes ---
    fixed = fixed.replace(singleSlashCommands, (match, inner, cmd) => {
      // match looks like: [tex] ... \frac
      // We only want to turn `\` into `\\`, so final is `[tex] ... \\frac`
      return match.replace(`\\${cmd}`, `\\\\${cmd}`);
    });

    // --- Fix matrix line breaks INSIDE [tex]...[/tex] (two -> four) ---
    // This pattern uses a capturing group for [tex], plus another for the text inside it.
    // We replace single occurrences of `\\` with `\\\\` if they appear to be line breaks.
    // (We skip known commands by negative lookahead in the outer regex.)
    fixed = fixed.replace(matrixBreaks, (_match, groupBefore, slash) => {
      // groupBefore is everything before the slash, slash is `\`.
      // We turn it into `\\\\`.
      return `[tex]${groupBefore}\\\\`;
    });

    // --- Fix currency symbols OUTSIDE of math mode ---
    // We'll do a pass that splits the string by [tex]...[/tex], fixes $ outside, then recombines.
    const texRegexGlobal = /\[tex\][\s\S]*?\[\/tex\]/g;
    let lastIndex = 0;
    let newString = '';
    let match: RegExpExecArray | null;

    while ((match = texRegexGlobal.exec(fixed)) !== null) {
      // Everything before this [tex] block
      const outsideChunk = fixed.slice(lastIndex, match.index);
      const insideTex = match[0];

      // Replace $ -> \\$ in the outside chunk
      const replacedOutside = outsideChunk.replace(dollarSignOutsideMath, '\\$');
      newString += replacedOutside + insideTex;
      lastIndex = texRegexGlobal.lastIndex;
    }
    // Final chunk after last [tex] block
    const remainingOutside = fixed.slice(lastIndex).replace(dollarSignOutsideMath, '\\$');
    newString += remainingOutside;

    fixed = newString;

    return fixed;
  });
}

export const getJsArray = (input: string): string[] => {
  return JSON.parse(stripLLMOutputMarkers(input));
};

export function extractQuestionAndSolution(obj: Qans & { questionId: string }): WorkedExampleContent[] {
  const result = [];
  
  // Add the question as the first string
  if (obj.question) {
    result.push({ content: `<p>${obj.question.trim()}</p>`, questionId: obj.questionId });
  }
  
  // Extract steps from the solution
  if (obj.solution) {
    // Match all solution steps starting with <h3>
    const steps = obj.solution.match(/<h3>.*?<\/h3>.*?(?=<h3>|$)/g);
    if (steps) {
      result.push(...(steps.map(step => ({ content: step.trim(), questionId: obj.questionId }))));
    }
  }
  
  return result;
}

export function wrapTextOutsideTex(input: string): string {
  // Use a regex to find all strings outside [tex]...[/tex] and wrap them in \text{}
  return input.replace(/(?:<[^>]+>)([^<\[]+)(?=<\/[^>]+>)/g, (match, content) => {
    return match.replace(content, `[tex]\\text{${content.trim()}}[/tex]`);
  });
}

export function wrapTexContentWith(input: string, type: "large" | "small" | "huge" = "huge"): string {
  return input.replace(/\[tex\](.*?)\[\/tex\]/g, (match, content) => {
    return `[tex]\\${type}{${content}}[/tex]`;
  });
}

export function wrapTextWith(input: string, type: "large" | "small" | "huge" = "small"): string {
  // Match all \text{...} tags and wrap them with \small{}
  return input.replace(/\\text\{(.*?)\}/g, (match, content) => `\\${type}{\\text{${content}}}`);
}

export function stripTextFunctions(input: string): string {
  // Match \text{} and capture the content inside {}
  return input.replace(/\\text\{(.*?)\}/g, (match, content) => `<p>${content}</p>`);
}

export function stripTopmostPTags(input: string): string {
  // Use a regular expression to match top-level <p> tags and their closing counterparts
  return input.replace(/^<p>(.*?)<\/p>$/g, '$1');
}

/**
 * Extracts JSON objects from a string that are wrapped in ```json...``` tags.
 * 
 * @param input - The string containing JSON objects.
 * @returns An array of JSON objects extracted from the input string.
 */
export function extractJsonObjects(input: string): string[] {
  const regex = /```json\s*([\s\S]*?)\s*```/g;
  const matches = [];
  let match;

  while ((match = regex.exec(input)) !== null) {
      matches.push(match[1].trim()); // Extract JSON content and trim whitespace
  }

  return matches;
}

export function extractAndSaveJsonStrings(input: string, filename: string = 'output.json'): void {
  const regex = /```json\s*([\s\S]*?)\s*```/g;
  const matches: string[] = [];
  let match;

  while ((match = regex.exec(input)) !== null) {
      let cleanedJson = match[1].replace(/\n/g, '').trim(); // Remove newlines and trim spaces
      cleanedJson = cleanedJson.replace(/^"\{/, '{').replace(/\}"$/, '}'); // Remove surrounding quotes
      matches.push(cleanedJson);
  }

  try {
      fs.writeFileSync(filename, JSON.stringify(matches, null, 2)); // Save cleaned JSON strings as an array
      console.log(`✅ JSON strings saved successfully to ${filename}`);
  } catch (error) {
      console.error("❌ Error saving JSON strings:", error);
  }
}

export function extractValidJsonStringsFromFile(filePath: string): string[] {
  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");

    // Match objects starting with `{` and ending with `}`
    const jsonRegex = /{[\s\S]*?}/g;
    const matches = fileContent.match(jsonRegex);

    if (!matches) {
        console.error("No valid JSON objects found in the file.");
        return [];
    }

    // Filter out malformed JSON by checking if parsing succeeds
    const validJsonStrings = matches.filter(jsonString => {
        try {
            JSON.parse(jsonString); // Test parsing but do not store the parsed object
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

type QuestionFile = {
  content: string;
  validObjects: string[];
  invalidObjects: string[];
};

export const processQuestionFile = (fileContent: string): QuestionFile => {
  const result: QuestionFile = {
    content: fileContent,
    validObjects: [],
    invalidObjects: []
  };

  // Split the content by "json" marker
  const objects = fileContent.split('json\n');
  
  // Skip the first element as it might be empty or contain other text
  for (let i = 1; i < objects.length; i++) {
    let obj = objects[i].trim();
    
    // Find the start and end of the JSON-like object
    const startBrace = obj.indexOf('{');
    const lastBrace = obj.lastIndexOf('}');
    
    if (startBrace === -1 || lastBrace === -1) {
      continue; // Skip if not a proper JSON-like structure
    }

    // Extract the potential JSON object
    const jsonString = obj.substring(startBrace, lastBrace + 1);

    // Add to appropriate array based on completeness
    if (isCompleteObject(jsonString)) {
      result.validObjects.push(jsonString);
    } else {
      result.invalidObjects.push(jsonString);
    }
  }

  return result;
};

const isCompleteObject = (jsonString: string): boolean => {
  // Count opening and closing braces
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;

      // If braces become unbalanced negatively, it's incomplete
      if (braceCount < 0) return false;
    }
  }

  // Object is complete if braces are balanced
  return braceCount === 0;
};

/**
 * Removes all content between <think></think> tags, including the tags themselves.
 * 
 * @param input - The string containing potential <think> tags
 * @returns The string with all <think> content removed
 * 
 * @example
 * removeThinkTags("Hello <think>this will be removed</think> World")
 * // Returns: "Hello World"
 * 
 * @example
 * removeThinkTags("No tags here")
 * // Returns: "No tags here"
 */
export function removeThinkTags(input: string): string {
  return input.replace(/<think>[\s\S]*?<\/think>/g, '');
}

const formatKatex = (html: string) => {
  return wrapTextWith(wrapTEXWith((html)));
};

export function formatHtml(html: string): string {
  return styleHtmlWithTailwind(parseKatex(formatKatex(html)))
}

export function wrapTEXWith(input: string, size: 'small' | 'large' | 'huge' = 'large'): string {
  return input.replace(/\[tex\](.*?)\[\/tex\]/g, (match, content) => {
    return `[tex]\\${size}{${content}}[/tex]`;
  });
}

export function styleHtmlWithTailwind(html: string) {
  // Add Tailwind classes to HTML elements
  
  const pLiShared = 'text-4xl mx-auto my-8';
  const listShared = 'list-inside mb-4 pl-20';
  const allShared = 'font-playfair text-[#F3F4F7] tracking-[0.5px] space-x-[2px] leading-[1.6]';
  
  const styledHtml = html
    .replace(/<h3>/g, `<h3 class="${allShared} text-5xl mb-8 font-semibold">`)
    .replace(/<h4>/g, `<h4 class="${allShared} text-2xl font-semibold mt-6 mb-3 text-blue-600">`)
    .replace(/<p>/g, `<p class="${pLiShared} ${allShared}">`)
    .replace(/<ul>/g, `<ul class="list-disc ${listShared} ${allShared}">`) // Indented list with bullets
    .replace(/<ol>/g, `<ol class="list-decimal ${listShared} ${allShared}">`) // Indented list with numbers
    .replace(/<li>/g, `<li class="${pLiShared} ${allShared}">`)
    .replace(/<strong>/g, '<strong class="font-bold text-gray-900">')
    .replace(/<em>/g, '<em class="italic text-gray-800">')
    .replace(/<mark>/g, '<mark class="bg-yellow-200 px-1 rounded">')
    .replace(/<code>/g, '<code class="bg-gray-100 px-2 py-1 rounded font-mono text-sm">')
    .replace(/<a /g, '<a class="text-blue-600 hover:underline" ');

  return styledHtml;
}

export function parseHtml(html: string) {
  return html
}

/**
 * For parsing objectives from a text file (generate objectives)
 * @param fileContent 
 * @returns 
 */
export function processJsonTextObjectives(fileContent: string): string {
  // 1. Remove lines starting with ```
  const withoutBackticks = fileContent
    .split('\n')
    .filter(line => !line.trim().startsWith('```'))
    .join('\n');

  // 2. Remove all square brackets at the start/end of arrays
  const withoutBrackets = withoutBackticks.replace(/^\s*\[|\]\s*$/gm, '');

  // 3. Split into objects and recombine with proper formatting
  const objects = withoutBrackets
    .split(/\n\s*}\s*,?\s*\n\s*{/)  // Split between objects
    .map(obj => obj.trim())  // Trim whitespace
    .filter(obj => obj.length > 0)  // Remove empty strings
    .map(obj => obj.startsWith('{') ? obj : `{${obj}`)  // Ensure starts with {
    .map(obj => obj.endsWith('}') ? obj : `${obj}}`);   // Ensure ends with }

  // Combine objects with commas and wrap in square brackets
  return `[\n  ${objects.join(',\n  ')}\n]`;
}

/** This function is used to return objects from a file that 
 * throw an error when parsed by JSON.parse(). The result is
 * an array of strings.
 */
export function getObjectsFromFile(filePath: string): string[] {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // Try parsing as JSON first
    try {
      const parsed = JSON.parse(fileContent);
      if (Array.isArray(parsed)) {
        // Convert each object back to a string with proper formatting
        return parsed.map(obj => JSON.stringify(obj, null, 2));
      }
    } catch (parseError) {
      // If JSON.parse fails, try regex approach
      const objectRegex = /{[^{}]*}/g;
      const matches = fileContent.match(objectRegex);
      if (matches) {
        return matches.map(obj => {
          try {
            // Try to parse and re-stringify to ensure valid JSON
            return JSON.stringify(JSON.parse(obj), null, 2);
          } catch {
            // If parsing fails, return the original string
            return obj;
          }
        });
      }
    }

    // If no objects found, return empty array
    return [];

  } catch (error) {
    console.error('Error reading file:', error);
    return [];
  }
}

export function processJsonTextLessons(fileContent: string): string {
  // 1. Remove backtick lines and replace with commas
  const withoutBackticks = fileContent
    .split('\n')
    .map(line => line.trim().startsWith('```') ? ',' : line)
    .join('\n');

  // 2. Remove outer square brackets and their newlines
  const withoutBrackets = withoutBackticks
    .replace(/^\s*\[\s*\n/m, '')    // Remove opening bracket and its newline
    .replace(/\n\s*\]\s*$/m, '');   // Remove closing bracket and its newline

  // 3. Split into objects and clean them up, being careful with LaTeX
  const objects = withoutBrackets
    .split(/(?<="})\s*(?={)/)  // Split only after object's closing quote+brace
    .map(obj => obj.trim())
    .filter(obj => obj.length > 0);

  // 4. Clean up objects without modifying their content
  const processedObjects = objects.map(obj => {
    // Only clean up the outer structure
    return obj
      .replace(/^\s*{/, '{')
      .replace(/}\s*$/, '}');
  });

  // 5. Join objects with commas and wrap in brackets
  const result = `[\n  ${processedObjects.join(',\n  ')}\n]`
    .replace(/,\s*,/g, ',')      // Remove double commas
    .replace(/^\[\s*,/, '[')     // Remove leading comma
    .replace(/,\s*\]$/, '\n]');  // Remove trailing comma

  return result;
}

