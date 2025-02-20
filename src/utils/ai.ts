import { GoogleGenerativeAI } from "@google/generative-ai";
import { MessageContent } from "@langchain/core/messages";
import fs from "fs";
import { appendToFile, promptsConfig, syllabusConfig } from "./fs";
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
import axios from "axios";
import { removeThinkTags } from "./parse";
import OpenAI from "openai";
import { encoding_for_model } from 'tiktoken';

export interface Qans {
  question: string;
  answer: string;
  notes: string;
  solution: string;
  section?: number;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY as string,
});

// Get the tokenizer for your specific model
const encoder = encoding_for_model('gpt-4o-mini');

const tokenCounts = { 
  free: {
    input: 0,
    output: 0,
  },
  paid: {
    input: 0,
    output: 0,
  }
}

export const sendPrompt = async (
  prompt: string,
  waitFor: number = 5, // default wait time in minutes
  maxRetries: number = 3,
  image?: { inlineData: { data: string; mimeType: string } }, // maximum number of retries
  tier: "free" | "paid" = "free"
): Promise<string> => {
  let attempts = 0;
  const tokenCount = await countTokens(prompt, tier);
  if (tier === "free") {
    tokenCounts.free.input += tokenCount;
  } else {
    tokenCounts.paid.input += tokenCount;
  }
  console.log(`Prompt: ${prompt.slice(0, 50)}...`);
  console.log(`Token count: ${tokenCount}`);
  console.log(`Tier: ${tier}`);

  while (attempts < maxRetries) {
    try {
      if (attempts > 0) {
        console.log(`Retrying prompt: ${prompt.slice(0, 50)}...`);
      }

      if (tier === "free") {
        const input = image ? [prompt, image] : prompt;
        const result = await model.generateContent(input);
        const output = result.response.text();
        tokenCounts.free.output += await countTokens(output, tier);
        console.log(tokenCounts);
        return output;
      } else {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini", 
          messages: [{ role: "user", content: prompt }],
        });
        const output = completion.choices[0].message.content || "";
        tokenCounts.paid.output += await countTokens(output, tier);
        console.log(tokenCounts);
        return output;
      }
    } catch (err: any) {
      if (err.status === 429 || err.status === 503) {
        attempts++;
        console.error(
          `${err.status} Error. Attempt ${attempts} of ${maxRetries}. Retrying prompt: ${prompt.slice(
            0,
            50
          )}... in ${waitFor} minutes...`
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

export const extractContentFromImage = async (
  imagePath: string, 
  prompt: string
) => {
  const image = fs.readFileSync(imagePath).toString("base64");
  const content = await sendPrompt(prompt, 10, 3, {
    inlineData: { data: image, mimeType: "image/png" },
  });
  appendToFile("imageToText.txt", content);
  return content;
};

const formatStringQuestions = (questions: MessageContent[]) => {
  return questions.join("\n");
};

export const formatObjQuestions = (questions: any[]) => {
  const int = questions.map((question) => JSON.stringify(question));
  return int.join("\n");
};

export const generateQansWorkload = async (questions: MessageContent[]) => {
  const formattedQuestions = formatStringQuestions(questions);
  appendToFile("formattedQuestions.txt", formattedQuestions);
  console.log("formattedQuestions saved to file");

  const qansPrompt = `${formattedQuestions}\n${promptsConfig.generateQans}\n${promptsConfig.editingNotes}\n${promptsConfig.editingNotesQans}`;

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
  if (questions.length === workloadResponse.length) return [];
  const unanswered = questions.length - workloadResponse.length;
  return questions.slice(-unanswered);
};

export const classifyQuestions = async (questions: string[]) => {
  const formattedQuestions = formatStringQuestions(questions);
  const content = await sendPrompt(
    `${promptsConfig.classify}\nSections\n${syllabusConfig.sections.join(
      "\n"
    )}\nQuestions\n${formattedQuestions}`
  );
  appendToFile("classifiedQuestions.txt", content);
  return content;
};

export const doubleCheckQans = async (qans: string[]) => {
  return sendPrompt(
    `${promptsConfig.doubleCheck}\n\nQuestions\n${formatObjQuestions(qans)}`
  );
};

export const expandSolutions = async (qans: string[]) => {
  const formattedQans = formatStringQuestions(qans);
  return sendPrompt(
    `Questions\n${formattedQans}\nInstructions:\n${promptsConfig.expandSolution}\n\Editing notes:\n${promptsConfig.editingNotes}\n${promptsConfig.editingNotesQans}`
  );
};

export const sendOllamaPrompt = async (prompt: string) => {
  const response = await axios.post(
    "http://127.0.0.1:11434/api/generate",
    {
      model: "deepseek-r1:1.5b",
      prompt,
      stream: false,
    },
    {
      timeout: 1200000,
      headers: {
        "Content-Type": "application/json",
        Connection: "keep-alive",
      },
    }
  );
  return response.data.response;
};

/**
 * Verify the correctness of the answers to the questions.
 * Return the corrected objects with the relevant fields updated.
 * @param qans
 * @returns
 */
export const verifyQans = async (qans: string[]) => {
  const formattedQans = formatObjQuestions(qans);
  const response = await sendOllamaPrompt(
    `Instructions:\n${promptsConfig.correctness}\nQuestions\n${formattedQans}\n`
  );
  return removeThinkTags(response);
};

export const performTempAction = async (qans: string[]) => {
  return "";
};

export const generateLessonForObjective = async (objective: string) => {
  return sendPrompt(
    `${promptsConfig.generateLesson}\n${objective}\n${promptsConfig.editingNotes}\n${promptsConfig.editingNotesLesson}`
  );
};

export const generatePracticeForObjective = async (objective: string) => {
  return sendPrompt(
    `Objective\n${objective}\n${promptsConfig.generatePractice}\n${promptsConfig.editingNotes}\n${promptsConfig.editingNotesPractice}`
  ,10,3,undefined,'paid');
};

export const formatLessonTemp = async (lesson: string) => {
  const formatInstructions = `Format the lesson below based on the following editing notes`
  return sendPrompt(
    `${formatInstructions}\nLesson\n${lesson}\nEditing notes\n${promptsConfig.editingNotes}\n${promptsConfig.editingNotesLesson}`
  );
};

export const countTokens = async (text: string, tier: "free" | "paid" = "free") => {
  if (tier === "paid") {
    const tokens = encoder.encode(text)
    return tokens.length
  } else {
    const result = await model.countTokens(text);
    return result.totalTokens;
  }
}
