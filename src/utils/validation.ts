

function checkKatexSyntax(strings: string[]): { valid: string[]; invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];
  
    // Regex to extract everything inside [tex]...[/tex]
    const texBlockRegex = /\[tex\](.*?)\[\/tex\]/g;
  
    // Regex to match LaTeX commands with a single backslash
    const singleSlashCommandRegex = /(^|[^\\])\\(?!\\)(frac|sqrt|vec|text)/;
  
    // Regex to match LaTeX commands with more than two backslashes
    const excessiveSlashCommandRegex = /\\{3,}(frac|sqrt|vec|text)/;
  
    // Extended list of KaTeX commands and environments to check for
    const katexCommands = [
      'frac', 'sqrt', 'vec', 'text', 'mathbb', 'mathbf', 'textbf', 'mathrm', 'textrm',
      'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota',
      'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau',
      'upsilon', 'phi', 'chi', 'psi', 'omega',
      'sum', 'prod', 'int', 'oint', 'partial', 'nabla', 'infty', 'rightarrow',
      'leftarrow', 'Rightarrow', 'Leftarrow', 'implies', 'leftrightarrow',
      'begin', 'end', 'left', 'right', 'bigg', 'Bigg', 'big', 'Big',
      'overline', 'underline', 'widehat', 'widetilde', 'overleftarrow', 'overrightarrow'
    ].join('|');
  
    // Regex to detect latex commands, environments, or `$` usage outside [tex] blocks
    const outsideTexCommandsRegex = new RegExp(`\\$|\\\\(${katexCommands})|\\\\\\[|\\\\\\]|\\\\\\(|\\\\\\)|\\\\begin|\\\\end`, 'i');
  
    // Regex to detect common mathematical notation outside [tex] blocks
    const unenclosedMathRegex = /(?<!\\)[_^]|[≠≤≥±×÷∫∑∏√∞∈∉∪∩⊂⊃⊆⊇∀∃∄]|\b\d+\/\d+\b|\(\d+\)|_{.*?}|\^{.*?}|\b[a-zA-Z]\d+\b|\b\d+[a-zA-Z]\b|[πθ∅∇∂]|\b[xyz]\s*=|->\s*[xyz]|\b[xyz]\s*[<>]=?/;
  
    // Regex to detect common KaTeX environments and delimiters
    const katexEnvironmentRegex = /\\begin\{.*?\}|\\end\{.*?\}|\\\[|\\\]|\\\(|\\\)/;
  
    for (const str of strings) {
      // Extract [tex] blocks
      const texBlocks = [...str.matchAll(texBlockRegex)].map((m) => m[1] ?? '');
  
      // Remove [tex]...[/tex] sections from the original string so we can check the remainder
      const outsideTex = str.replace(texBlockRegex, '');
  
      // Check if anything outside [tex]...[/tex] has:
      // 1. LaTeX commands or $ delimiters
      // 2. Mathematical notation
      // 3. KaTeX environments and delimiters
      if (
        outsideTexCommandsRegex.test(outsideTex) || 
        unenclosedMathRegex.test(outsideTex) || 
        katexEnvironmentRegex.test(outsideTex)
      ) {
        invalid.push(str);
        continue;
      }
  
      // Within each tex block, check for single backslash or excessive backslashes
      let isValid = true;
      for (const block of texBlocks) {
        if (singleSlashCommandRegex.test(block) || excessiveSlashCommandRegex.test(block)) {
          isValid = false;
          break;
        }
      }
  
      if (isValid) {
        valid.push(str);
      } else {
        invalid.push(str);
      }
    }
  
    return { valid, invalid };
  }

export const validateClassifiedResults  = (classified: string[]) => {
    return checkKatexSyntax(classified);
}