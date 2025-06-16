import * as fs from "fs";
import * as path from "path";
import { ContentType, MessageContent, Qans, WorkedExampleContent } from "../utils/types";
import { EditingService, getEditingService } from "./editingService";
import { FileService, getFileService } from "./fileService";
import { LLMService, getLLMService } from "./llmService";

export class ContentService {
  private static instance: ContentService;
  private llmService: LLMService;
  private fileService: FileService;
  private editingService: EditingService;

  private constructor() {
    this.llmService = getLLMService();
    this.fileService = getFileService();
    this.editingService = getEditingService();
  }

  public static getInstance(): ContentService {
    if (!ContentService.instance) {
      ContentService.instance = new ContentService();
    }
    return ContentService.instance;
  }

  /** Joins an array of strings into a single string.
   * Each question is on a new line.
   */
  private joinStrings(strings: string[]): string {
    return strings.join("\n");
  }

  /** Joins an array of objects into a single string.
   * Each object is converted to a string using JSON.stringify.
   * Each string is on a new line.
   */
  private joinObjects(objects: any[]): string {
    const int = objects.map((object) => JSON.stringify(object));
    return int.join("\n");
  }

  /** Processes an array of items in batches with the supplied
   *  callback function.
   */
  private async processInBatches<T, R>(
    items: T[],
    batchSize: number,
    processBatch: (batch: T[]) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await processBatch(batch);
      console.log(`Batch ${Math.floor(i / batchSize) + 1} processed`);
      results.push(batchResults);
    }

    return results;
  }

  /** Extracts the objectives from the syllabus and 
   * returns them as an array of strings.
   */
  private async extractObjectivesFromSyllabus(): Promise<string[]> {
    const imagePaths = await this.fileService.convertSyllabusToImages();

    const content = [];
    for (const filePath of imagePaths) {
      const extracted = await this.extractContentFromImage(
        filePath,
        this.fileService.promptsConfig.extractObjectives
      );
      content.push(extracted);
    }

    console.log("Extracted content from syllabus");
    return content;
  }

  /** Generates Questions, Answers, Notes, and Solutions (Qans)
   * based on the objectives extracted from the syllabus.
   */
  public async runQansWorkflow(): Promise<void> {
    try {
      const objectives = await this.extractObjectivesFromSyllabus();
      console.log("objectives saved to file");

      const combinedQans = await this.generateQansFromObjectives(objectives);
      await this.classifyQans(combinedQans);

    } catch (err) {
      console.error("Error in primary workflow:", err);
      throw err;
    } finally {
      await this.fileService.archiveFiles();
      console.log("Files moved successfully.");
    }
  }

  private async generateQansFromObjectives(objectives: MessageContent[]): Promise<string[]> {
    const combinedQans: string[] = [];
    const maxIterations = 2;
    const batchSize = 3;
    let iterations = 0;
    let unanswered: MessageContent[] = objectives;

    while (unanswered.length && iterations < maxIterations) {
      const responses = await this.processInBatches(
        unanswered,
        batchSize,
        this.generateQans.bind(this)
      );
      unanswered = this.getUnansweredQuestions(unanswered, responses);
      combinedQans.push(...responses);

      if (unanswered.length) {
        console.log(
          `Unanswered questions after iteration ${iterations + 1}:`,
          unanswered
        );
      }

      iterations++;
    }

    await this.saveUnansweredQuestions(unanswered, maxIterations);
    await this.saveQans(combinedQans);

    return combinedQans;
  }

  private async saveUnansweredQuestions(unanswered: MessageContent[], maxIterations: number): Promise<void> {
    if (unanswered.length) {
      console.log(
        `Some questions remain unanswered after ${maxIterations} iterations:`,
        unanswered
      );
      this.fileService.appendToFile("unanswered.txt", this.joinObjects(unanswered));
    } else {
      console.log("All questions answered.");
    }
  }

  private async saveQans(combinedQans: string[]): Promise<void> {
    const content = JSON.stringify(combinedQans, null, 2);
    this.fileService.appendToFile("combined.json", content);
  }

  private async classifyQans(combinedQans: string[]): Promise<void> {
    const batchSize = 3;

    const classifiedResults = await this.processInBatches(
      combinedQans,
      batchSize,
      this.classifyQuestions.bind(this)
    );
    console.log("classification complete");
    
    const corrected = await this.correctQans(classifiedResults, batchSize);
    await this.saveClassifiedQans(corrected);
  }

  private async correctQans(classifiedResults: string[], batchSize: number): Promise<string[]> {
    const wFixedKatex = this.editingService.fixExcessiveBackslashes(classifiedResults);
    console.log("katex fixed");
    
    const doubleChecked = await this.processInBatches(
      wFixedKatex,
      batchSize,
      this.doubleCheckQans.bind(this)
    );
    console.log("double check complete");

    return doubleChecked;
  }

  private async saveClassifiedQans(results: string[]): Promise<void> {
    results.forEach((result) => {
      const parsed = this.editingService.stripLLMOutputMarkers(result);
      this.fileService.appendToFile("classified.txt", parsed, "outbound");
    });
  }

  /** Adds more detail to the solutions initially provided in the 
   * Qans. */
  public async runExpandSolutionsWorkflow(): Promise<void> {
    const validObjects = await this.readClassifiedQans();
    await this.expandAndSaveSolutions(validObjects);
  }

  private async readClassifiedQans(): Promise<string[]> {
    const fileContents = this.fileService.readFile("outbound/classified.txt");
    const { validObjects } = this.editingService.splitQuestionFile(fileContents);
    
    console.log(`There are ${validObjects.length} questions to expand.`);
    return validObjects;
  }

  private async expandAndSaveSolutions(validObjects: string[]): Promise<void> {
    const batchSize = 3;
    
    const expandedSolutions = await this.processInBatches(
      validObjects,
      batchSize,
      this.expandSolutions.bind(this)
    );
    console.log("Solutions expanded.");

    expandedSolutions.forEach((result) => {
      const parsed = this.editingService.stripLLMOutputMarkers(result);
      this.fileService.appendToFile("expandedSolutions.txt", parsed, "outbound");
    });

    console.log("Expanded solutions appended to file.");
  }

  public async runLessonsAndPracticeWorkflow(): Promise<void> {
    await this.extractObjectivesFromSyllabus();
    console.log("Objectives extracted from syllabus");

    const objectivesText = this.fileService.readFile("saved/imageToText.txt");

    const jsonObjectives = this.editingService.cleanObjectivesFile(objectivesText);
    this.fileService.appendToFile("objectives.json", jsonObjectives, "outbound");
    console.log("Objectives appended to objectives.json");

    const objectives: string[] = this.editingService.getObjectsFromFile("outbound/objectives.json");

    await this.generateLessonsFromObjectives(objectives);
    console.log("Lessons generated");

    await this.generatePracticeFromObjectives(objectives);
    console.log("Practice problems generated");

    const lessonsContent = this.fileService.readFile("outbound/lessons.txt");
    const practiceContent = this.fileService.readFile("outbound/practice.txt");

    await this.editingService.correctLessonsOrPractice(lessonsContent, 'lessons');
    await this.editingService.correctLessonsOrPractice(practiceContent, 'practice');
  }

  public async runMarketingWorkflow(): Promise<void> {
    const sourceMaterial = await this.generateMarketingSourceMaterial();
    await this.fileService.generateMarketingImages(sourceMaterial);
  }

  private async generateMarketingSourceMaterial(): Promise<{ [K in ContentType]: (string | WorkedExampleContent)[] }> {
    console.log("Generating source material for marketing images");
    const sourceMaterial: { [K in ContentType]: (string | WorkedExampleContent)[] } = {
      Quizzes: [],
      "Exam Tips": [],
      "Motivational Quote": [],
      "Worked Example": [],
    };

    sourceMaterial.Quizzes = await this.generateQuizzes();
    console.log("Quizzes generated");
    sourceMaterial["Exam Tips"] = await this.generateExamTips();
    console.log("Exam tips generated");
    sourceMaterial["Motivational Quote"] = await this.generateMotivationalQuotes();
    console.log("Motivational quotes generated");
    
    const workedExamples = this.generateWorkedExamples();
    console.log("Worked examples generated");
    sourceMaterial["Worked Example"].push(...workedExamples);

    return sourceMaterial;
  }

  private async generateQuizzes(): Promise<string[]> {
    const prompt = this.fileService.promptsConfig.marketing.quizzes;
    const response = await this.llmService.sendPrompt(prompt);
    return this.editingService.convertLLMResponseToJsArray(response);
  }

  private async generateExamTips(): Promise<string[]> {
    const prompt = this.fileService.promptsConfig.marketing.examPrepTips;
    const response = await this.llmService.sendPrompt(prompt);
    return this.editingService.convertLLMResponseToJsArray(response);
  }

  private async generateMotivationalQuotes(): Promise<string[]> {
    const prompt = this.fileService.promptsConfig.marketing.motivation;
    const response = await this.llmService.sendPrompt(prompt);
    return this.editingService.convertLLMResponseToJsArray(response);
  }

  private async generateLessonsFromObjectives(objectives: string[]): Promise<void> {
    console.log(`Starting to generate lessons for ${objectives.length} objectives...`);

    for (const obj of objectives) {
      const lesson = await this.generateLessons(obj);
      this.fileService.appendToFile("lessons.txt", lesson, "outbound");
      console.log(`Completed lesson for objective`);
    }

    console.log("All lessons generated successfully!");
  }

  private async generatePracticeFromObjectives(objectives: string[]): Promise<void> {
    console.log(`Starting to generate practice problems for ${objectives.length} objectives...`);

    for (const obj of objectives) {
      const practice = await this.generatePractice(obj);
      this.fileService.appendToFile("practice.txt", practice, "outbound");
      console.log(`Completed practice problems for objective`);
    }

    console.log("All practice problems generated successfully!");
  }

  private async generateLessons(objective: string): Promise<string> {
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

  private async generatePractice(objective: string): Promise<string> {
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

  private async extractContentFromImage(
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

  private getUnansweredQuestions(
    questions: MessageContent[],
    workloadResponse: any[]
  ): MessageContent[] {
    if (questions.length === workloadResponse.length) return [];
    const unanswered = questions.length - workloadResponse.length;
    return questions.slice(-unanswered);
  }

  private generateWorkedExamples(): WorkedExampleContent[] {
    const questionsPath = path.join("inbound", "questions", "worked.jsonc");
    const file = this.fileService.readFile(questionsPath);
    const parsed: { content: string; questionId: string }[] = [];
    const questions = (JSON.parse(file) as Qans[]).map(qans => this.editingService.addQuestionId(qans));
    questions.forEach((obj) => {
      parsed.push(...this.editingService.extractQuestionAndSolution(obj));
    });
    const formatted = parsed.map((item) => ({
      questionId: item.questionId,
      content: this.editingService.formatHtml(item.content),
    }));
    return formatted;
  }

  private async classifyQuestions(questions: string[]): Promise<string> {
    const formattedQuestions = this.editingService.joinStrings(questions);
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

  private async doubleCheckQans(qans: string[]): Promise<string> {
    return this.llmService.sendPrompt(
      `${
        this.fileService.promptsConfig.doubleCheck
      }\n\nQuestions\n${this.editingService.joinObjects(qans)}`
    );
  }

  private async expandSolutions(qans: string[]): Promise<string> {
    const formattedQans = this.editingService.joinStrings(qans);
    return this.llmService.sendPrompt(
      `Questions\n${formattedQans}\nInstructions:\n${this.fileService.promptsConfig.expandSolution}\n\Editing notes:\n${this.fileService.promptsConfig.editingNotes}\n${this.fileService.promptsConfig.editingNotesQans}`
    );
  }

  private async generateQans(questions: MessageContent[]): Promise<string> {
    const formattedQuestions = this.editingService.joinStrings(questions);
    this.fileService.appendToFile("formattedQuestions.txt", formattedQuestions);
    console.log("formattedQuestions saved to file");

    const qansPrompt = `${formattedQuestions}\n${this.fileService.promptsConfig.generateQans}\n${this.fileService.promptsConfig.editingNotes}\n${this.fileService.promptsConfig.editingNotesQans}`;

    const response = await this.llmService.sendPrompt(qansPrompt);
    this.fileService.appendToFile("qansResponse.txt", response);
    console.log("qansResponse saved to file");

    return response;
  }
}

export const getContentService = () => ContentService.getInstance();
