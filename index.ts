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
  generateLessonForObjective,
  generatePracticeForObjective,
  correctTex,
} from "./src/utils/ai";
import { moveFiles } from "./src/utils/cleanup";
import { convertPdfToPng } from "./src/utils/conversion";
import {
  appendToFile,
  copyFileToJson,
  getFilenames,
  promptsConfig,
} from "./src/utils/fs";
import {
  addBackslashToCommands,
  chopUpDis,
  correctPaidResponse,
  getObjectsFromFile,
  processJsonTextAgain,
  processJsonTextGuideFree,
  processJsonTextObjectives,
  processQuestionFile,
  replaceDemtingyah,
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

async function generateLessons(objectives: string[]) {
  try {
    console.log(
      `Starting to generate lessons for ${objectives.length} objectives...`
    );

    // Process each objective
    for (const obj of objectives) {
      // Combine objective and explanatory notes for context

      const lesson = await generateLessonForObjective(obj);

      appendToFile("lessons.txt", lesson, "outbound");

      console.log(`Completed lesson for objective`);
    }

    console.log("All lessons generated successfully!");
  } catch (error) {
    console.error("Error generating lessons:", error);
  }
}

async function generatePractice(objectives: string[]) {
  try {
    console.log(
      `Starting to generate practice problems for ${objectives.length} objectives...`
    );

    // Process each objective
    for (const obj of objectives) {
      const practice = await generatePracticeForObjective(obj);

      appendToFile("practice.txt", practice, "outbound");

      console.log(`Completed practice problems for objective`);
    }

    console.log("All practice problems generated successfully!");
  } catch (error) {
    console.error("Error generating practice problems:", error);
  }
}

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

const generateGuides = async () => {
  // await processDocuments("extractObjectives");
  // console.log("Objectives extracted");

  // const fileContent = readFileSync("saved/imageToText.txt", "utf-8");

  // const processedContent = processJsonTextObjectives(fileContent);
  // appendToFile("objectives.json", processedContent, "outbound");

  // console.log("Files saved successfully as objectives.json");
  // const objectives: string[] = getObjectsFromFile("outbound/objectives.json");

  // // await generateLessons(objectives);
  // // console.log("Lessons generated");

    // await generatePractice(objectives);
  // console.log("Practice problems generated");

  const delimiter = "*****"
  
  // const originalLessonContent = readFileSync("outbound/lessons.txt", "utf-8");

  // const segmentedLessons = chopUpDis(originalLessonContent, delimiter);
  // appendToFile("segmentedLessons.txt", segmentedLessons)

  // const segLessonsList = segmentedLessons.split(delimiter).filter(Boolean);
  // console.log(`There are ${segLessonsList.length} segmented lessons`);
  // segLessonsList.forEach((lesson, index) => console.log(`${index}:${lesson.length}`))

  // const correctedLessons = await processInBatches(segLessonsList,3,correctTex)
  // console.log(`There are ${correctedLessons.length} corrected lessons`);
  // appendToFile("correctedLessons.txt", correctedLessons.join('\n'))

  // const formattedLessons = processJsonTextAgain(addBackslashToCommands(correctedLessons.join('\n')))
  // appendToFile("correctedLessons.json", formattedLessons, "outbound");

  const practiceContent = readFileSync("outbound/practice.txt", "utf-8");

  const segmentedPractice = chopUpDis(practiceContent, delimiter);
  appendToFile("segmentedPractice.txt", segmentedPractice)

  const segPracticeList = segmentedPractice.split(delimiter).filter(Boolean);
  console.log(`There are ${segPracticeList.length} segmented practice`);
  segPracticeList.forEach((lesson, index) => console.log(`${index}:${lesson.length}`))

  const correctedPractice = await processInBatches(segPracticeList,3,correctTex)
  console.log(`There are ${correctedPractice.length} corrected practice`);
  appendToFile("correctedPractice.txt", correctedPractice.join('\n'));

  const formattedPractice = processJsonTextAgain(addBackslashToCommands(correctedPractice.join('\n')))
  appendToFile("correctedPractice.json", formattedPractice, "outbound");
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
    .command("generateGuides")
    .description("Generate guides from objectives")
    .action(async () => {
      try {
        await generateGuides();
      } catch (error) {
        console.error("Error in generateObjectives command:", error);
        process.exit(1);
      }
    });

  await program.parseAsync();
};

const program = new Command();
main();

export function saveInvalidJson(outputPath: string): void {
  try {
    const failedPath = path.join("saved", "updatedDisplayFailed.txt");
    const failedContent = readFileSync(failedPath, "utf-8");
    const cleanedContent = stripLLMOutputMarkers(failedContent);

    // Extract JSON objects and format them
    const failedObjects = cleanedContent
      .split("```json")
      .filter(Boolean)
      .map((obj) => {
        const match = obj.match(/\{[\s\S]*?\}/); // Non-greedy match
        return match ? match[0].trim().replace(/\\/g, "\\\\") : ""; // Escape backslashes
      })
      .filter((obj) => obj);

    // Combine into array string with proper formatting
    const combinedContent = "[\n  " + failedObjects.join(",\n  ") + "\n]";

    writeFileSync(outputPath, combinedContent);
    console.log(`Saved invalid objects into ${outputPath}`);
  } catch (error) {
    console.error("Error saving invalid JSON:", error);
    throw error;
  }
}
