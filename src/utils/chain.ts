import { HumanMessage, MessageContent } from "@langchain/core/messages";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import fs from "fs";
import { promptsConfig, saveToFile } from "./fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseJsonString } from "./parse";
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });


export const sendPrompt = async (
  prompt: string,
  waitFor: number = 10, // default wait time in minutes
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
        console.log(err, true);
        console.log(
          `${err.status} Error. Attempt ${attempts} of ${maxRetries}. Retrying in ${waitFor} minutes...`,
          true
        );
        await new Promise((resolve) =>
          setTimeout(resolve, waitFor * 60 * 1000)
        );
      } else {
        console.log(err, true);
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
  saveToFile("imageToText.txt", content);
  console.log("imageToText saved to file");
  return content;
};

const formatQuestions = (questions: MessageContent[]) => {
  return questions.join("\n");
};

export const generateQansWorkload = async (questions: MessageContent[]) => {
  const formattedQuestions = formatQuestions(questions);
  saveToFile("formattedQuestions.txt", formattedQuestions);
  console.log("formattedQuestions saved to file");

  const qansPrompt = `${formattedQuestions}\n${promptsConfig.generateQans}\n${promptsConfig.editingNotes}`;
  saveToFile("qansPrompt.txt", qansPrompt);
  console.log("qansPrompt saved to file");

  const response = await sendPrompt(qansPrompt);
  saveToFile("qansResponse.txt", response);
  console.log("qansResponse saved to file");
  
  const parsedJson = parseJsonString(response);
  saveToFile("parsedJson.txt", JSON.stringify(parsedJson, null, 2));
  console.log("parsedJson saved to file");

  return parsedJson;
};

export const getUnansweredQues = (
  questions: MessageContent[],
  workloadResponse: any[]
) => {
  if(questions.length === workloadResponse.length) return [];
  const unanswered = questions.length - workloadResponse.length;
  return questions.slice(-unanswered);
};