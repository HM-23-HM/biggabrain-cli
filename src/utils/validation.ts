
export const fixExcessiveBackslashes = (strings: string[]): string[] => {
    const excessiveSlashRegex = /(?<=\s)\\\\\\\\(?!\s)/g;
    
    return strings.map((original) => {
        return original.replace(excessiveSlashRegex, '\\\\');
    });
};

export const fixKatexIssues  = (input: string[]) => {
    return fixExcessiveBackslashes(input);
}

