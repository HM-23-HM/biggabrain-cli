import { MessageContent } from "@langchain/core/messages";
import * as path from "path";
import { generateQansWorkload, getQuestionFromImage, getUnansweredQues } from "./src/utils/chain";
import { convertPdfToPng } from "./src/utils/conversion";
import { getFilenames, saveToFile } from "./src/utils/fs";

const inboundDir = path.join(__dirname, "inbound");
const stagingDir = path.join(__dirname, "staging");

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
            const filePath = path.join(stagingDir, file.replace('.pdf', '.png'));
            const question = await getQuestionFromImage(filePath);
            questions.push(question);
        }

        // Step 4 - Generate Q&A
        const combinedQans = [];
        const maxIterations = 2; // Set the maximum number of iterations
        let iterations = 0;
        let unanswered: MessageContent[] = questions;

        while (unanswered.length && iterations < maxIterations) {
            const response = await generateQansWorkload(unanswered);
            console.log({ responsess: response });
            unanswered = getUnansweredQues(unanswered, response);

            combinedQans.push(...response);

            if (unanswered.length) {
                console.log(`Unanswered questions after iteration ${iterations + 1}:`, unanswered);
            }

            iterations++;
        }

        if (unanswered.length) {
            console.log(`Some questions remain unanswered after ${maxIterations} iterations:`, unanswered);
        } else {
            console.log('All questions answered.');
        }

        // Step 5 - Save Q&A to file
        const content = JSON.stringify(combinedQans, null, 2);
        saveToFile('combined.txt', content);
    } catch (err) {
        console.error('Error in main function:', err);
    }
};

main();