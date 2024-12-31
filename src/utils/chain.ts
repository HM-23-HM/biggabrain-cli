import { GoogleGenerativeAI } from "@google/generative-ai";
import { MessageContent } from "@langchain/core/messages";
import fs from "fs";
import { appendToFile, promptsConfig, syllabusConfig } from "./fs";
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export interface Qans {
  question: string;
  answer: string;
  notes: string;
  solution: string;
  section?: number
}

export const sendPrompt = async (
  prompt: string,
  waitFor: number = 5, // default wait time in minutes
  maxRetries: number = 3,
  image?: { inlineData: { data: string; mimeType: string } } // maximum number of retries
): Promise<string> => {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      if (attempts > 0) {
        console.log(`Retrying...`);
      }
      const input = image ? [prompt, image] : prompt;
      const result = await model.generateContent(input);
      return result.response.text();
    } catch (err: any) {
      if (err.status === 429 || err.status === 503) {
        attempts++;
        console.error(
          `${err.status} Error. Attempt ${attempts} of ${maxRetries}. Retrying in ${waitFor} minutes...`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, waitFor * 60 * 1000)
        );
      } else {
        console.error(err);
        throw err;
      }
    }
  }

  throw new Error(
    `Failed to generate content after ${maxRetries} attempts due to rate limiting or service unavailability.`
  );
};
export const getQuestionFromImage = async (imagePath: string) => {
  const image = fs.readFileSync(imagePath).toString("base64");

  const content = await sendPrompt(promptsConfig.imageToText, 10, 3, { inlineData: { data: image, mimeType: "image/png" } });
  appendToFile("imageToText.txt", content);
  return content;
};

const formatStringQuestions = (questions: MessageContent[]) => {
  return questions.join("\n");
};

export const formatObjQuestions = (questions: any[]) => {
  const int = questions.map(question => JSON.stringify(question))
  return int.join('\n')
}

export const generateQansWorkload = async (questions: MessageContent[]) => {
  const formattedQuestions = formatStringQuestions(questions);
  appendToFile("formattedQuestions.txt", formattedQuestions);
  console.log("formattedQuestions saved to file");

  const qansPrompt = `${formattedQuestions}\n${promptsConfig.generateQans}\n${promptsConfig.editingNotes}`;

  const response = await sendPrompt(qansPrompt);
  appendToFile("qansResponse.txt", response);
  console.log("qansResponse saved to file");
  
  // const parsedJson = parseJsonString(response);
  // saveToFile("parsedJson.txt", JSON.stringify(parsedJson, null, 2));
  // console.log("parsedJson saved to file");

  return response;
};

export const getUnansweredQues = (
  questions: MessageContent[],
  workloadResponse: any[]
) => {
  if(questions.length === workloadResponse.length) return [];
  const unanswered = questions.length - workloadResponse.length;
  return questions.slice(-unanswered);
};

export const classifyQuestions = async (questions: string[]) => {
  const formattedQuestions = formatStringQuestions(questions);
  const content = await sendPrompt(`${promptsConfig.classify}\nSections\n${syllabusConfig.sections.join("\n")}\nQuestions\n${formattedQuestions}`);
  appendToFile("classifiedQuestions.txt", content);
  return content;
}

export const doubleCheckQans = async (qans: string[]) => {
  return sendPrompt(`${promptsConfig.doubleCheck}\n\nQuestions\n${formatObjQuestions(qans)}`);
}