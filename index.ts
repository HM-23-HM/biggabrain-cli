import { Command } from "commander";
import { getContentService } from "./src/services/contentService";

const contentService = getContentService();

const main = async () => {
  const program = new Command();
  
  program
    .name("math-processor")
    .description("CLI to process math questions")
    .version("1.0.0");

  program.action(async () => {
    try {
      await contentService.runQansWorkflow();
    } catch (error) {
      console.error("Error in default command:", error);
      process.exit(1);
    }
  });

  program
    .command("qans")
    .description("Generates questions, answers, notes, and solutions (Qans) from syllabus objectives")
    .action(async () => {
      try {
        await contentService.runQansWorkflow();
      } catch (error) {
        console.error("Error in qans command:", error);
        process.exit(1);
      }
    });

  program
    .command("expand")
    .description("Expands the solutions of the previously generated Qans")
    .action(async () => {
      try {
        await contentService.runExpandSolutionsWorkflow();
      } catch (error) {
        console.error("Error in expand command:", error);
        process.exit(1);
      }
    });

  program
    .command("lp")
    .description("Generates lessons and practice problems from objectives")
    .action(async () => {
      try {
        await contentService.runLessonsAndPracticeWorkflow();
      } catch (error) {
        console.error("Error in lp command:", error);
        process.exit(1);
      }
    });

  program
    .command("marketing")
    .description("Generates marketing images")
    .action(async () => {
      try {
        await contentService.runMarketingWorkflow();
      } catch (error) {
        console.error("Error in marketing command:", error);
        process.exit(1);
      }
    });

  await program.parseAsync();
};

main();
