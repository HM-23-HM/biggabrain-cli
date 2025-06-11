import { MessageContent } from "@langchain/core/messages";
import { LLMService, getLLMService } from "./llmService";
import { FileService, getFileService } from "./fileService";
import { EditingService, getEditingService } from "./editingService";
import { Qans, ContentType, WorkedExampleContent } from "../utils/types";
import * as path from "path";
import * as fs from "fs";

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

  public async extractSyllabusContent(): Promise<string[]> {
    const imagePaths = await this.fileService.convertSyllabusToImages();

    const content = [];
    for (const filePath of imagePaths) {
      const extracted = await this.extractContentFromImage(
        filePath,
        this.fileService.promptsConfig.extractObjectives as string
      );
      content.push(extracted);
    }

    console.log("Extracted content from syllabus");
    return content;
  }

  public async runQansWorkflow(): Promise<void> {
    try {
      const objectives = await this.extractSyllabusContent();
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

  public async runSecondaryWorkflow(): Promise<void> {
    const batchSize = 3;
    const fileContents = this.fileService.readFile("outbound/classified.txt");
    const { validObjects } = this.editingService.processQuestionFile(fileContents);

    console.log(`There are ${validObjects.length} questions to expand.`);

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

    console.log("Solutions appended to file.");
  }

  public async runGenerateGuidesWorkflow(): Promise<void> {
    await this.extractSyllabusContent();
    console.log("Objectives extracted");

    const fileContent = this.fileService.readFile("saved/imageToText.txt");

    const processedContent = this.editingService.processJsonTextObjectives(fileContent);
    this.fileService.appendToFile("objectives.json", processedContent, "outbound");

    console.log("Files saved successfully as objectives.json");
    const objectives: string[] = this.editingService.getObjectsFromFile("outbound/objectives.json");

    await this.generateLessonsFromObjectives(objectives);
    console.log("Lessons generated");

    await this.generatePracticeFromObjectives(objectives);
    console.log("Practice problems generated");

    await this.processGeneratedContent();
  }

  public async runMarketingWorkflow(): Promise<void> {
    console.log("Generating source material");
    
    const sourceMaterial: { [K in ContentType]: (string | WorkedExampleContent)[] } = {
      Quizzes: [],
      "Exam Tips": [],
      "Motivational Quote": [],
      "Worked Example": [],
    };

    sourceMaterial.Quizzes = await this.generateQuizzes();
    sourceMaterial["Exam Tips"] = await this.generateExamTips();
    sourceMaterial["Motivational Quote"] = await this.generateMotivationalQuotes();
    
    const workedExamples = this.generateWorkedExamples();
    console.log("Worked examples generated");
    sourceMaterial["Worked Example"].push(...workedExamples);

    console.log("Source material generated");
    await this.fileService.generateMarketingImages(sourceMaterial);
    console.log("Marketing content generated");
  }

  public async generateQuizzes(): Promise<string[]> {
    const prompt = this.fileService.promptsConfig.marketing.quizzes;
    const response = await this.llmService.sendPrompt(prompt);
    return this.editingService.getJsArray(response);
  }

  public async generateExamTips(): Promise<string[]> {
    const prompt = this.fileService.promptsConfig.marketing.examPrepTips;
    const response = await this.llmService.sendPrompt(prompt);
    return this.editingService.getJsArray(response);
  }

  public async generateMotivationalQuotes(): Promise<string[]> {
    const prompt = this.fileService.promptsConfig.marketing.motivation;
    const response = await this.llmService.sendPrompt(prompt);
    return this.editingService.getJsArray(response);
  }

  public async generateMarketingContentByType(contentType: ContentType): Promise<string[] | WorkedExampleContent[]> {
    switch (contentType) {
      case "Quizzes":
        return this.generateQuizzes();
      case "Exam Tips":
        return this.generateExamTips();
      case "Motivational Quote":
        return this.generateMotivationalQuotes();
      case "Worked Example":
        return this.generateWorkedExamples();
      default:
        throw new Error(`Unknown content type: ${contentType}`);
    }
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

  private async processGeneratedContent(): Promise<void> {
    const delimiter = "*****";

    const originalLessonContent = this.fileService.readFile("outbound/lessons.txt");
    const segmentedLessons = this.editingService.chopUpDis(originalLessonContent, delimiter);
    this.fileService.appendToFile("segmentedLessons.txt", segmentedLessons);

    const segLessonsList = segmentedLessons.split(delimiter).filter(Boolean);
    console.log(`There are ${segLessonsList.length} segmented lessons`);
    segLessonsList.forEach((lesson, index) =>
      console.log(`${index}:${lesson.length}`)
    );

    const correctedLessons = await this.processInBatches(
      segLessonsList,
      3,
      this.correctTex.bind(this)
    );
    console.log(`There are ${correctedLessons.length} corrected lessons`);
    this.fileService.appendToFile("correctedLessons.txt", correctedLessons.join("\n"));

    const formattedLessons = this.editingService.processJsonTextAgain(
      this.editingService.addBackslashToCommands(correctedLessons.join("\n"))
    );
    this.fileService.appendToFile("correctedLessons.json", formattedLessons, "outbound");

    const practiceContent = this.fileService.readFile("outbound/practice.txt");
    const segmentedPractice = this.editingService.chopUpDis(practiceContent, delimiter);
    this.fileService.appendToFile("segmentedPractice.txt", segmentedPractice);

    const segPracticeList = segmentedPractice.split(delimiter).filter(Boolean);
    console.log(`There are ${segPracticeList.length} segmented practice`);
    segPracticeList.forEach((lesson, index) =>
      console.log(`${index}:${lesson.length}`)
    );

    const correctedPractice = await this.processInBatches(
      segPracticeList,
      3,
      this.correctTex.bind(this)
    );
    console.log(`There are ${correctedPractice.length} corrected practice`);
    this.fileService.appendToFile("correctedPractice.txt", correctedPractice.join("\n"));

    const formattedPractice = this.editingService.processJsonTextAgain(
      this.editingService.addBackslashToCommands(correctedPractice.join("\n"))
    );
    this.fileService.appendToFile("correctedPractice.json", formattedPractice, "outbound");
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

  public generateWorkedExamples(): WorkedExampleContent[] {
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
