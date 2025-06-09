import { MessageContent } from "@langchain/core/messages";
import fs from "fs";
import { appendToFile, promptsConfig, syllabusConfig } from "./fs";
import { LLMService, getLLMService } from "../services/llmService";

export interface Qans {
  question: string;
  answer: string;
  notes: string;
  solution: string;
  section?: number;
}

const llmService = getLLMService();

export const sendPrompt = async (
  prompt: string,
  waitFor: number = 5,
  maxRetries: number = 3,
  image?: { inlineData: { data: string; mimeType: string } },
  tier: "free" | "paid" = "free"
): Promise<string> => {
  return llmService.sendPrompt(prompt, waitFor, maxRetries, image, tier);
};

export const extractContentFromImage = async (
  imagePath: string, 
  prompt: string
): Promise<string> => {
  const content = await llmService.processImageWithPrompt(imagePath, prompt, 10, 3);
  appendToFile("imageToText.txt", content);
  return content;
};

export const countTokens = async (text: string, tier: "free" | "paid" = "free"): Promise<number> => {
  return llmService.countTokens(text, tier);
};

const formatStringQuestions = (questions: MessageContent[]): string => {
  return questions.join("\n");
};

export const formatObjQuestions = (questions: any[]): string => {
  const int = questions.map((question) => JSON.stringify(question));
  return int.join("\n");
};

export const generateQansWorkload = async (questions: MessageContent[]): Promise<string> => {
  const formattedQuestions = formatStringQuestions(questions);
  appendToFile("formattedQuestions.txt", formattedQuestions);
  console.log("formattedQuestions saved to file");

  const qansPrompt = `${formattedQuestions}\n${promptsConfig.generateQans}\n${promptsConfig.editingNotes}\n${promptsConfig.editingNotesQans}`;

  const response = await sendPrompt(qansPrompt);
  appendToFile("qansResponse.txt", response);
  console.log("qansResponse saved to file");

  return response;
};

export const getUnansweredQues = (
  questions: MessageContent[],
  workloadResponse: any[]
): MessageContent[] => {
  if (questions.length === workloadResponse.length) return [];
  const unanswered = questions.length - workloadResponse.length;
  return questions.slice(-unanswered);
};

export const classifyQuestions = async (questions: string[]): Promise<string> => {
  const formattedQuestions = formatStringQuestions(questions);
  const content = await sendPrompt(
    `${promptsConfig.classify}\nSections\n${syllabusConfig.sections.join(
      "\n"
    )}\nQuestions\n${formattedQuestions}`
  );
  appendToFile("classifiedQuestions.txt", content);
  return content;
};

export const doubleCheckQans = async (qans: string[]): Promise<string> => {
  return sendPrompt(
    `${promptsConfig.doubleCheck}\n\nQuestions\n${formatObjQuestions(qans)}`
  );
};

export const expandSolutions = async (qans: string[]): Promise<string> => {
  const formattedQans = formatStringQuestions(qans);
  return sendPrompt(
    `Questions\n${formattedQans}\nInstructions:\n${promptsConfig.expandSolution}\n\Editing notes:\n${promptsConfig.editingNotes}\n${promptsConfig.editingNotesQans}`
  );
};

export const generateLessonForObjective = async (objective: string): Promise<string> => {
  return sendPrompt(
    `${promptsConfig.generateLesson}\n${objective}\n${promptsConfig.editingNotes}\n${promptsConfig.editingNotesLesson}`,
    10,
    3,
    undefined,
    'paid'
  );
};

export const generatePracticeForObjective = async (objective: string): Promise<string> => {
  return sendPrompt(
    `Objective\n${objective}\n${promptsConfig.generatePractice}\n${promptsConfig.editingNotes}\n${promptsConfig.editingNotesPractice}`,
    10,
    3,
    undefined,
    'paid'
  );
};

export const formatLessonTemp = async (lesson: string): Promise<string> => {
  const formatInstructions = `Format the lesson below based on the following editing notes`;
  return sendPrompt(
    `${formatInstructions}\nLesson\n${lesson}\nEditing notes\n${promptsConfig.editingNotes}\n${promptsConfig.editingNotesLesson}`
  );
};

export const correctTex = async (content: string[]): Promise<string> => {
  const formatted = formatStringQuestions(content);
  return sendPrompt(`${promptsConfig.correctTex}\n${formatted}`);
};

export { LLMService, getLLMService };
