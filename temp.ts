import { readFileSync } from 'fs';
import { verifyQans } from './src/utils/ai';
import path from 'path';
import { processInBatches } from './src/utils';

async function verifyQuestions() {
  try {
    // Read the questions file
    const questionsPath = path.join('inbound', 'questions', 'index.json');
    const fileContents = readFileSync(questionsPath, 'utf-8');
    const questions = JSON.parse(fileContents);
    console.log(`${questions.length} questions found`);

    const batchSize = 1; // Adjust batch size as needed
    const verificationResults = await processInBatches(
      questions,
      batchSize,
      verifyQans
    );

    console.log('Verification results:', verificationResults);
    return verificationResults;
  } catch (error) {
    console.error('Error verifying questions:', error);
    throw error;
  }
}

// Execute the verification
verifyQuestions()
  .then(() => console.log('Verification complete'))
  .catch(err => console.error('Verification failed:', err));
