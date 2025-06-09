import { MessageContent } from "@langchain/core/messages";
import { ContentService, getContentService } from "../services/contentService";
import { getLLMService } from "../services/llmService";


const contentService = getContentService();
const llmService = getLLMService();

export const extractContentFromImage = async (
  imagePath: string, 
  prompt: string
): Promise<string> => {
  return contentService.extractContentFromImage(imagePath, prompt);
};

export const countTokens = async (text: string, tier: "free" | "paid" = "free"): Promise<number> => {
  return llmService.countTokens(text, tier);
};

export const formatObjQuestions = (questions: any[]): string => {
  const int = questions.map((question) => JSON.stringify(question));
  return int.join("\n");
};

export const generateQansWorkload = async (questions: MessageContent[]): Promise<string> => {
  return contentService.generateQans(questions);
};

export const getUnansweredQues = (
  questions: MessageContent[],
  workloadResponse: any[]
): MessageContent[] => {
  return contentService.getUnansweredQuestions(questions, workloadResponse);
};

export const classifyQuestions = async (questions: string[]): Promise<string> => {
  return contentService.classifyQuestions(questions);
};

export const doubleCheckQans = async (qans: string[]): Promise<string> => {
  return contentService.doubleCheckQans(qans);
};

export const expandSolutions = async (qans: string[]): Promise<string> => {
  return contentService.expandSolutions(qans);
};

export const generateLessonForObjective = async (objective: string): Promise<string> => {
  return contentService.generateLessons(objective);
};

export const generatePracticeForObjective = async (objective: string): Promise<string> => {
  return contentService.generatePractice(objective);
};

export const formatLessonTemp = async (lesson: string): Promise<string> => {
  return contentService.formatLesson(lesson);
};

export const correctTex = async (content: string[]): Promise<string> => {
  return contentService.correctTex(content);
};

export { ContentService, getContentService };

