import { MessageContent } from "@langchain/core/messages";
import * as path from "path";
import {
  classifyQuestions,
  doubleCheckQans,
  generateQansWorkload,
  getQuestionFromImage,
  getUnansweredQues
} from "./src/utils/chain";
import { convertPdfToPng } from "./src/utils/conversion";
import { appendToFile, appendToJsonFile, getFilenames } from "./src/utils/fs";
import { parseOrReturnString } from "./src/utils/parse";
import { moveFiles } from "./src/utils/post";

const inboundDir = path.join(__dirname, "inbound");
const stagingDir = path.join(__dirname, "staging");

async function processInBatches<T, R>(items: T[], batchSize: number, processBatch: (batch: T[]) => Promise<R>): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await processBatch(batch);
        results.push(batchResults);
    }

    return results;
}

const main = async () => {
  try {
    // Step 1 - Read all files in the inbound directory
    const pdfFiles = getFilenames("inbound", "pdf");

    // Step 2 - Convert pdf to images
    for (const file of pdfFiles) {
      const filePath = path.join(inboundDir, file);
      await convertPdfToPng(filePath);
      console.log(`Converted ${file} to PNG`);
    }

    // Step 3 - Process images to generate questions
    const imageFiles = getFilenames("staging", "png");

    const questions = [];
    for (const file of imageFiles) {
      const filePath = path.join(stagingDir, file.replace(".pdf", ".png"));
      const question = await getQuestionFromImage(filePath);
      questions.push(question);
    }
    
    console.log("questions saved to file");


    // Step 4 - Generate Q&A
    const combinedQans: string[] = [];
    const maxIterations = 2; // Set the maximum number of iterations
    const batchSize = 2; // Set the batch size
    let iterations = 0;
    let unanswered: MessageContent[] = questions;

    while (unanswered.length && iterations < maxIterations) {
      const batchPromises = [];
      for (let i = 0; i < unanswered.length; i += batchSize) {
        const batch = unanswered.slice(i, i + batchSize);
        batchPromises.push(generateQansWorkload(batch));
      }

      const batchResponses = await Promise.all(batchPromises);
      const responses = batchResponses.flat();

      unanswered = getUnansweredQues(unanswered, responses);
      combinedQans.push(...responses);

      if (unanswered.length) {
        console.log(
          `Unanswered questions after iteration ${iterations + 1}:`,
          unanswered
        );
      }

      iterations++;
    }

    if (unanswered.length) {
      console.log(
        `Some questions remain unanswered after ${maxIterations} iterations:`,
        unanswered
      );
    } else {
      console.log("All questions answered.");
    }

    const content = JSON.stringify(combinedQans, null, 2);
    appendToFile("combined.json", content);

    const classifiedResults = await processInBatches<string,string>(combinedQans, batchSize, classifyQuestions);
    const doubleChecked = await processInBatches(classifiedResults, batchSize, doubleCheckQans)

    doubleChecked.forEach((result) => {
      const parsed = parseOrReturnString(result);
      if (typeof parsed == "string") {
        appendToFile("classified.txt", parsed, "outbound");
      } else {
        appendToJsonFile("classified.json", [parsed], "outbound");
      }
    });

    console.log("Classification complete.");
  } catch (err) {
    console.error("Error in main function:", err);
  } finally {
    await moveFiles();
    console.log("Files moved successfully.");
  }
};

main();
