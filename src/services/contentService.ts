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

  private formatStringQuestions(questions: MessageContent[]): string {
    return questions.join("\n");
  }

  private formatObjQuestions(questions: any[]): string {
    const int = questions.map((question) => JSON.stringify(question));
    return int.join("\n");
  }

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
      await this.classifyAndEditQans(combinedQans);

    } catch (err) {
      console.error("Error in primary workflow:", err);
      throw err;
    } finally {
      await this.fileService.moveFiles();
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
      const responses = await this.processQansBatch(unanswered, batchSize);
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
    await this.saveCombinedQans(combinedQans);

    return combinedQans;
  }

  private async processQansBatch(unanswered: MessageContent[], batchSize: number): Promise<string[]> {
    const batchPromises = [];
    for (let i = 0; i < unanswered.length; i += batchSize) {
      const batch = unanswered.slice(i, i + batchSize);
      batchPromises.push(this.generateQans(batch));
    }

    const batchResponses = await Promise.all(batchPromises);
    return batchResponses.flat();
  }

  private async saveUnansweredQuestions(unanswered: MessageContent[], maxIterations: number): Promise<void> {
    if (unanswered.length) {
      console.log(
        `Some questions remain unanswered after ${maxIterations} iterations:`,
        unanswered
      );
      this.fileService.appendToFile("unanswered.txt", this.formatObjQuestions(unanswered));
    } else {
      console.log("All questions answered.");
    }
  }

  private async saveCombinedQans(combinedQans: string[]): Promise<void> {
    const content = JSON.stringify(combinedQans, null, 2);
    this.fileService.appendToFile("combined.json", content);
  }

  private async classifyAndEditQans(combinedQans: string[]): Promise<void> {
    const batchSize = 3;

    const classifiedResults = await this.processInBatches(
      combinedQans,
      batchSize,
      this.classifyQuestions.bind(this)
    );
    console.log("classification complete");
    
    const edited = await this.editAndDoubleCheckResults(classifiedResults, batchSize);
    await this.saveFinalResults(edited);
  }

  private async editAndDoubleCheckResults(classifiedResults: string[], batchSize: number): Promise<string[]> {
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

  private async saveFinalResults(results: string[]): Promise<void> {
    results.forEach((result) => {
      const parsed = this.editingService.stripLLMOutputMarkers(result);
      this.fileService.appendToFile("classified.txt", parsed, "outbound");
    });
  }

  /** Adds more detail to the solutions initially provided in the 
   * Qans. */
  public async runExpandSolutionsWorkflow(): Promise<void> {
    const validObjects = await this.readClassifiedQuestions();
    await this.expandAndSaveSolutions(validObjects);
  }

  private async readClassifiedQuestions(): Promise<string[]> {
    const fileContents = this.fileService.readFile("outbound/classified.txt");
    const { validObjects } = this.editingService.processQuestionFile(fileContents);
    
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

    await this.correctLessons();
    await this.correctPractice();
  }

  public async runMarketingWorkflow(): Promise<void> {
    const sourceMaterial = await this.generateSourceMaterial();
    await this.fileService.generateMarketingImages(sourceMaterial);
  }

  private async generateSourceMaterial(): Promise<{ [K in ContentType]: (string | WorkedExampleContent)[] }> {
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
    return this.editingService.getJsArray(response);
  }

  private async generateExamTips(): Promise<string[]> {
    const prompt = this.fileService.promptsConfig.marketing.examPrepTips;
    const response = await this.llmService.sendPrompt(prompt);
    return this.editingService.getJsArray(response);
  }

  private async generateMotivationalQuotes(): Promise<string[]> {
    const prompt = this.fileService.promptsConfig.marketing.motivation;
    const response = await this.llmService.sendPrompt(prompt);
    return this.editingService.getJsArray(response);
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

  private async correctLessons(): Promise<void> {
    const delimiter = "*****";
    
    const originalLessonContent = this.fileService.readFile("outbound/lessons.txt");
    const segmentedLessons = await this.segmentContent(originalLessonContent, delimiter, "segmentedLessons.txt", "lessons");
    
    const correctedLessons = await this.correctAndSaveContent(segmentedLessons, "correctedLessons.txt", "lessons");
    await this.formatAndSaveAsJson(correctedLessons, "correctedLessons.json");
  }

  private async correctPractice(): Promise<void> {
    const delimiter = "*****";
    
    const practiceContent = this.fileService.readFile("outbound/practice.txt");
    const segmentedPractice = await this.segmentContent(practiceContent, delimiter, "segmentedPractice.txt", "practice");
    
    const correctedPractice = await this.correctAndSaveContent(segmentedPractice, "correctedPractice.txt", "practice");
    await this.formatAndSaveAsJson(correctedPractice, "correctedPractice.json");
  }

  private async segmentContent(content: string, delimiter: string, outputFile: string, contentType: string): Promise<string[]> {
    const segmentedContent = this.editingService.chopUpDis(content, delimiter);
    this.fileService.appendToFile(outputFile, segmentedContent);

    const segmentedList = segmentedContent.split(delimiter).filter(Boolean);
    console.log(`There are ${segmentedList.length} segmented ${contentType}`);

    return segmentedList;
  }

  private async correctAndSaveContent(segmentedList: string[], outputFile: string, contentType: string): Promise<string[]> {
    const correctedContent = await this.processInBatches(
      segmentedList,
      3,
      this.correctTex.bind(this)
    );
    console.log(`There are ${correctedContent.length} corrected ${contentType}`);
    this.fileService.appendToFile(outputFile, correctedContent.join("\n"));

    return correctedContent;
  }

  private async formatAndSaveAsJson(correctedContent: string[], outputFile: string): Promise<void> {
    const formattedContent = this.editingService.removeBackticksFromJson(
      this.editingService.escapeKatexCommands(correctedContent.join("\n"))
    );
    this.fileService.appendToFile(outputFile, formattedContent, "outbound");
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

  private async classifyQuestions(questions: string[]): Promise<string> {
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

  private async doubleCheckQans(qans: string[]): Promise<string> {
    return this.llmService.sendPrompt(
      `${
        this.fileService.promptsConfig.doubleCheck
      }\n\nQuestions\n${this.formatObjQuestions(qans)}`
    );
  }

  private async expandSolutions(qans: string[]): Promise<string> {
    const formattedQans = this.formatStringQuestions(qans);
    return this.llmService.sendPrompt(
      `Questions\n${formattedQans}\nInstructions:\n${this.fileService.promptsConfig.expandSolution}\n\Editing notes:\n${this.fileService.promptsConfig.editingNotes}\n${this.fileService.promptsConfig.editingNotesQans}`
    );
  }

  private async correctTex(content: string[]): Promise<string> {
    const formatted = this.formatStringQuestions(content);
    return this.llmService.sendPrompt(
      `${this.fileService.promptsConfig.correctTex}\n${formatted}`
    );
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
    const file = fs.readFileSync(questionsPath, "utf-8");
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
}

export const getContentService = () => ContentService.getInstance();
