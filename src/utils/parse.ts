export function parseJsonString(input: string) {
  // First, find the actual JSON content between the backticks
  const jsonMatch = input.match(/```json\n([\s\S]*?)```/);

  if (!jsonMatch || !jsonMatch[1]) {
    throw new Error("No valid JSON content found between backticks");
  }
  
  try {
    // Parse the matched content (jsonMatch[1] contains the actual JSON string)
    return JSON.parse(jsonMatch[1]);
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
  //    For brevity, we’ll do a simple replacement with a negative lookbehind for \ and ignoring
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