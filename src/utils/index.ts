export async function processInBatches<T, R>(
    items: T[],
    batchSize: number,
    processBatch: (batch: T[]) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];
  
    for (let i = 0; i < items.length; i += batchSize) {
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(items.length / batchSize)}`);
      const batch = items.slice(i, i + batchSize);
      const batchResults = await processBatch(batch);
      console.log(`Batch ${Math.floor(i / batchSize) + 1} processed`);
      console.log({ batchResults });
      results.push(batchResults);
    }
  
    return results;
  }

export function countObjects(content: string): number {
  let count = 0;
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  // Skip the opening [ bracket
  for (let i = 1; i < content.length - 1; i++) {
    const char = content[i];

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
      if (char === '{') {
        if (depth === 0) {
          count++;
        }
        depth++;
      } else if (char === '}') {
        depth--;
      }
    }
  }

  return count;
}