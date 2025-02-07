import { readFileSync } from 'fs';
import path from 'path';
import { performTempAction } from './src/utils/ai';
import { processInBatches } from './src/utils';
import { appendToFile } from './src/utils/fs';
import { parseJsonString } from './src/utils/parse';
import { countObjects } from './src/utils';

async function processQuestionsToH3Sections() {
    try {
        // Read the questions file
        const questionsPath = path.join('inbound', 'questions', 'index.json');
        const fileContents = readFileSync(questionsPath, 'utf-8');
        
        // Remove the outer array brackets and split by object
        const content = fileContents.trim().slice(1, -1);
        const questions = content
            .split(/}\s*,\s*{/)
            .map((obj, index, array) => {
                // Add back the curly braces
                if (index === 0) return obj + '}';
                if (index === array.length - 1) return '{' + obj;
                return '{' + obj + '}';
            });


        // Process in batches of 3
        const batchSize = 3;
        const updatedQuestions = await processInBatches(
            questions,
            batchSize,
            performTempAction
        );

        // Parse and append each result
        updatedQuestions.forEach(result => {
            try {
                const parsed = parseJsonString(result);
                appendToFile('updatedDisplay.txt', JSON.stringify(parsed, null, 2));
            } catch (error) {
                console.error('Error parsing result:', error);
                appendToFile('updatedDisplayFailed.txt', result);
            }
        });

        console.log('Questions processed and saved to updatedDisplay.txt');
    } catch (error) {
        console.error('Error processing questions:', error);
        throw error;
    }
}

function countQuestionsInFile() {
  try {
    const questionsPath = path.join('inbound', 'questions', 'index.json');
    const fileContents = readFileSync(questionsPath, 'utf-8');
    const count = countObjects(fileContents);
    console.log(`Found ${count} questions in index.json`);
  } catch (error) {
    console.error('Error reading questions file:', error);
  }
}

// Execute the function
countQuestionsInFile();
