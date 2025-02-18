import { MessageContent } from "@langchain/core/messages";
import { readFileSync, writeFileSync } from "fs";
import * as path from "path";
import { processInBatches } from "./src/utils";
import {
  classifyQuestions,
  doubleCheckQans,
  expandSolutions,
  formatObjQuestions,
  generateQansWorkload,
  extractContentFromImage,
  getUnansweredQues,
} from "./src/utils/ai";
import { moveFiles } from "./src/utils/cleanup";
import { convertPdfToPng } from "./src/utils/conversion";
import { appendToFile, getFilenames, promptsConfig } from "./src/utils/fs";
import {
  processJsonText,
  processQuestionFile,
  stripLLMOutputMarkers,
} from "./src/utils/parse";
import { fixExcessiveBackslashes } from "./src/utils/validation";
import { Command } from "commander";

const inboundDir = path.join(__dirname, "inbound");
const stagingDir = path.join(__dirname, "staging");

const processDocuments = async (promptType: keyof typeof promptsConfig) => {
  // Step 1 - Read all files in the inbound directory
  const pdfFiles = getFilenames("inbound", "pdf");

  // Step 2 - Convert pdf to images
  for (const file of pdfFiles) {
    const filePath = path.join(inboundDir, file);
    await convertPdfToPng(filePath);
    console.log(`Converted ${file} to PNG`);
  }

  // Step 3 - Process images
  const imageFiles = getFilenames("staging", "png");

  const content = [];
  for (const file of imageFiles) {
    const filePath = path.join(stagingDir, file.replace(".pdf", ".png"));
    const extracted = await extractContentFromImage(
      filePath,
      promptsConfig[promptType] as string
    );
    content.push(extracted);
  }

  console.log("Extracted content saved to file");
  return content;
};

const primary = async () => {
  try {
    const questions = await processDocuments("extractObjectives");

    console.log("questions saved to file");

    // Step 4 - Generate Q&A
    const combinedQans: string[] = [];
    const maxIterations = 2; // Set the maximum number of iterations
    const batchSize = 3; // Set the batch size
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
      appendToFile("unanswered.txt", formatObjQuestions(unanswered));
    } else {
      console.log("All questions answered.");
    }

    const content = JSON.stringify(combinedQans, null, 2);
    appendToFile("combined.json", content);

    const classifiedResults = await processInBatches<string, string>(
      combinedQans,
      batchSize,
      classifyQuestions
    );
    console.log("classification complete");
    const wFixedKatex = fixExcessiveBackslashes(classifiedResults);
    console.log("katex fixed");
    const doubleChecked = await processInBatches(
      wFixedKatex,
      batchSize,
      doubleCheckQans
    );
    console.log("double check complete");

    doubleChecked.forEach((result) => {
      const parsed = stripLLMOutputMarkers(result);
      appendToFile("classified.txt", parsed, "outbound");
    });

    console.log("Classification complete.");
  } catch (err) {
    console.error("Error in main function:", err);
  } finally {
    await moveFiles();
    console.log("Files moved successfully.");
  }
};

const secondary = async () => {
  const batchSize = 3;
  const fileContents = readFileSync("outbound/classified.txt", "utf-8");
  const { validObjects } = processQuestionFile(fileContents);

  console.log(`There are ${validObjects.length} questions to expand.`);

  const expandedSolutions = await processInBatches(
    validObjects,
    batchSize,
    expandSolutions
  );
  console.log("Solutions expanded.");

  expandedSolutions.forEach((result) => {
    const parsed = stripLLMOutputMarkers(result);
    appendToFile("expandedSolutions.txt", parsed, "outbound");
  });

  console.log("Solutions appended to file.");
};

const generateObjectives = async () => {
  await processDocuments("extractObjectives");
  console.log("Objectives extracted");

  const fileContent = readFileSync("saved/imageToText.txt", "utf-8");

  const processedContent = processJsonText(fileContent);
  appendToFile("objectives.json", processedContent, "outbound");

  console.log("Files saved successfully as objectives.json");
};

const main = async () => {
  program
    .name("math-processor")
    .description("CLI to process math questions")
    .version("1.0.0");

  // Add default command
  program.action(async () => {
    try {
      await primary();
    } catch (error) {
      console.error("Error in default command:", error);
      process.exit(1);
    }
  });

  program
    .command("primary")
    .description("Run primary processing of questions")
    .action(async () => {
      try {
        await primary();
      } catch (error) {
        console.error("Error in primary command:", error);
        process.exit(1);
      }
    });

  program
    .command("secondary")
    .description("Run secondary processing of expanded solutions")
    .action(async () => {
      try {
        await secondary();
      } catch (error) {
        console.error("Error in secondary command:", error);
        process.exit(1);
      }
    });

  program
    .command("generateObjectives")
    .description("Generate objectives from images")
    .action(async () => {
      try {
        await generateObjectives();
      } catch (error) {
        console.error("Error in generateObjectives command:", error);
        process.exit(1);
      }
    });

  await program.parseAsync();
};

const program = new Command();
main();
