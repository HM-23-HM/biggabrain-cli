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