import { MessageContent } from "@langchain/core/messages";
import { LLMService, getLLMService } from "./llmService";
import { FileService, getFileService } from "./fileService";

export class ContentService {
  private static instance: ContentService;
  private llmService: LLMService;
  private fileService: FileService;

  private constructor() {
    this.llmService = getLLMService();
    this.fileService = getFileService();
  }

  public static getInstance(): ContentService {
    if (!ContentService.instance) {
      ContentService.instance = new ContentService();
    }
    return ContentService.instance;
  }

  private formatStringQuestions(questions: MessageContent[]): string {
    return questions.join("\n");
  }

  private formatObjQuestions(questions: any[]): string {
    const int = questions.map((question) => JSON.stringify(question));
    return int.join("\n");
  }

  public async generateQans(questions: MessageContent[]): Promise<string> {
    const formattedQuestions = this.formatStringQuestions(questions);
    this.fileService.appendToFile("formattedQuestions.txt", formattedQuestions);
    console.log("formattedQuestions saved to file");

    const qansPrompt = `${formattedQuestions}\n${this.fileService.promptsConfig.generateQans}\n${this.fileService.promptsConfig.editingNotes}\n${this.fileService.promptsConfig.editingNotesQans}`;

    const response = await this.llmService.sendPrompt(qansPrompt);
    this.fileService.appendToFile("qansResponse.txt", response);
    console.log("qansResponse saved to file");

    return response;
  }

  public async generateLessons(objective: string): Promise<string> {
    const response = await this.llmService.sendPrompt(
      `${this.fileService.promptsConfig.generateLesson}\n${objective}\n${this.fileService.promptsConfig.editingNotes}\n${this.fileService.promptsConfig.editingNotesLesson}`,
      10,
      3,
      undefined,
      "paid"
    );

    this.fileService.appendToFile("lessonResponse.txt", response);
    console.log("lessonResponse saved to file");

    return response;
  }

  public async generatePractice(objective: string): Promise<string> {
    const response = await this.llmService.sendPrompt(
      `Objective\n${objective}\n${this.fileService.promptsConfig.generatePractice}\n${this.fileService.promptsConfig.editingNotes}\n${this.fileService.promptsConfig.editingNotesPractice}`,
      10,
      3,
      undefined,
      "paid"
    );

    this.fileService.appendToFile("practiceResponse.txt", response);
    console.log("practiceResponse saved to file");

    return response;
  }

  public async classifyQuestions(questions: string[]): Promise<string> {
    const formattedQuestions = this.formatStringQuestions(questions);
    const content = await this.llmService.sendPrompt(
      `${
        this.fileService.promptsConfig.classify
      }\nSections\n${this.fileService.syllabusConfig.sections.join(
        "\n"
      )}\nQuestions\n${formattedQuestions}`
    );
    this.fileService.appendToFile("classifiedQuestions.txt", content);
    return content;
  }

  public async doubleCheckQans(qans: string[]): Promise<string> {
    return this.llmService.sendPrompt(
      `${
        this.fileService.promptsConfig.doubleCheck
      }\n\nQuestions\n${this.formatObjQuestions(qans)}`
    );
  }

  public async expandSolutions(qans: string[]): Promise<string> {
    const formattedQans = this.formatStringQuestions(qans);
    return this.llmService.sendPrompt(
      `Questions\n${formattedQans}\nInstructions:\n${this.fileService.promptsConfig.expandSolution}\n\Editing notes:\n${this.fileService.promptsConfig.editingNotes}\n${this.fileService.promptsConfig.editingNotesQans}`
    );
  }

  public async formatLesson(lesson: string): Promise<string> {
    const formatInstructions = `Format the lesson below based on the following editing notes`;
    return this.llmService.sendPrompt(
      `${formatInstructions}\nLesson\n${lesson}\nEditing notes\n${this.fileService.promptsConfig.editingNotes}\n${this.fileService.promptsConfig.editingNotesLesson}`
    );
  }

  public async correctTex(content: string[]): Promise<string> {
    const formatted = this.formatStringQuestions(content);
    return this.llmService.sendPrompt(
      `${this.fileService.promptsConfig.correctTex}\n${formatted}`
    );
  }

  public async extractContentFromImage(
    imagePath: string,
    prompt: string
  ): Promise<string> {
    const content = await this.llmService.processImageWithPrompt(
      imagePath,
      prompt,
      10,
      3
    );
    this.fileService.appendToFile("imageToText.txt", content);
    return content;
  }

  public getUnansweredQuestions(
    questions: MessageContent[],
    workloadResponse: any[]
  ): MessageContent[] {
    if (questions.length === workloadResponse.length) return [];
    const unanswered = questions.length - workloadResponse.length;
    return questions.slice(-unanswered);
  }
}

export const getContentService = () => ContentService.getInstance();
