export interface Qans {
  question: string;
  answer: string;
  notes: string;
  solution: string;
  section?: number;
}

export interface Prompts {
  classify: string;
  correctness: string;
  correctTex: string;
  doubleCheck: string;
  editingNotes: string;
  editingNotesLesson: string;
  editingNotesPractice: string;
  editingNotesQans: string;
  expandSolution: string;
  extractObjectives: string;
  generateLesson: string;
  generatePractice: string;
  generateQans: string;
  imageToText: string;
  marketing: {
    quizzes: string;
    examPrepTips: string;
    motivation: string;
  };
}

export interface Syllabus {
  sections: string[];
}

export interface LLMConfig {
  googleApiKey?: string;
  openaiApiKey?: string;
  geminiModel?: string;
  openaiModel?: string;
}

export interface TokenCounts {
  free: {
    input: number;
    output: number;
  };
  paid: {
    input: number;
    output: number;
  };
}

export interface ImageData {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

export interface QuestionFile {
  content: string;
  validObjects: string[];
  invalidObjects: string[];
}

export type FolderNames = "inbound" | "outbound" | "staging" | "archive" | "saved";

export type ContentType =
  | "Motivational Quote"
  | "Exam Tips"
  | "Worked Example"
  | "Quizzes";

export type MultipleChoice = {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
};

export type WorkedExampleContent = { 
  questionId: string; 
  content: string; 
};
  