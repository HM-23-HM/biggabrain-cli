import * as fs from "fs";
import path from "path";
import { stripLLMOutputMarkers } from "./parse";

export async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  processBatch: (batch: T[]) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(
        items.length / batchSize
      )}`
    );
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

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") {
        if (depth === 0) {
          count++;
        }
        depth++;
      } else if (char === "}") {
        depth--;
      }
    }
  }

  return count;
}

export function combineJsonFiles(outputPath: string): void {
  try {
    // Read successful objects
    const displayPath = path.join("saved", "updatedDisplay.txt");
    const displayContent = fs.readFileSync(displayPath, "utf-8");
    const successfulObjects = displayContent.split("}{").map((obj, i, arr) => {
      if (i === 0) return obj + "}";
      if (i === arr.length - 1) return "{" + obj;
      return "{" + obj + "}";
    });

    // Read and parse failed objects
    const failedPath = path.join("saved", "updatedDisplayFailed.txt");
    const failedContent = fs.readFileSync(failedPath, "utf-8");
    const cleanedContent = stripLLMOutputMarkers(failedContent);
    const failedObjects = cleanedContent
      .split("```json")
      .filter(Boolean)
      .map((obj) => {
        // Extract just the JSON object part
        const match = obj.match(/\{[\s\S]*\}/);
        return match ? match[0] : "";
      })
      .filter((obj) => obj); // Remove any empty strings

    // Combine all objects into array string with proper formatting
    const combinedContent =
      "[\n  " +
      [...successfulObjects, ...failedObjects]
        .join(",\n  ")
        .replace(/\}\s*\{/g, "},\n  {") +
      "\n]";

    // Write to new file
    fs.writeFileSync(outputPath, combinedContent);
    const objectCount = countObjects(combinedContent);
    console.log(`Combined ${objectCount} objects into ${outputPath}`);
  } catch (error) {
    console.error("Error combining files:", error);
    throw error;
  }
}

export function saveValidJson(outputPath: string): void {
  try {
    // Read successful objects
    const displayPath = path.join("saved", "updatedDisplay.txt");
    const displayContent = fs.readFileSync(displayPath, "utf-8");
    const successfulObjects = displayContent
      .split(/(?<=\})\s*,?\s*(?=\{)/) // Split on boundaries between objects
      .map((obj) => obj.trim()); // Trim any extra whitespace

    // Combine all objects into array string with proper formatting
    const combinedContent = "[\n  " + successfulObjects.join(",\n  ") + "\n]";

    // Write to new file
    fs.writeFileSync(outputPath, combinedContent);
    console.log(`Saved valid objects into ${outputPath}`);
  } catch (error) {
    console.error("Error saving valid JSON:", error);
    throw error;
  }
}

export function saveInvalidJson(outputPath: string): void {
  try {
    // Read failed objects
    const failedPath = path.join("saved", "updatedDisplayFailed.txt");
    const failedContent = fs.readFileSync(failedPath, "utf-8");
    const cleanedContent = stripLLMOutputMarkers(failedContent);

    // Extract JSON objects and format them
    const failedObjects = cleanedContent
      .split("```json")
      .filter(Boolean)
      .map((obj) => {
        const match = obj.match(/\{[\s\S]*\}/);
        return match ? match[0].trim() : "";
      })
      .filter((obj) => obj);

    // Combine into array string with proper formatting
    const combinedContent = "[  " + failedObjects.join(",") + "]";
    const stripped = (combinedContent.replace(/json/ig, ",")).replace(/\\n/g, "")

    // Write to new file
    fs.writeFileSync(outputPath, stripped);
    console.log(`Saved invalid objects into ${outputPath}`);
  } catch (error) {
    console.error("Error saving invalid JSON:", error);
    throw error;
  }
}
