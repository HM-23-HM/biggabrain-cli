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
      await contentService.runPrimaryWorkflow();
    } catch (error) {
      console.error("Error in default command:", error);
      process.exit(1);
    }
  });

  program
    .command("primary")
    .description("Run primary processing of questions")
    .action(async () => {
      try {
        await contentService.runPrimaryWorkflow();
      } catch (error) {
        console.error("Error in primary command:", error);
        process.exit(1);
      }
    });

  program
    .command("secondary")
    .description("Run secondary processing of expanded solutions")
    .action(async () => {
      try {
        await contentService.runSecondaryWorkflow();
      } catch (error) {
        console.error("Error in secondary command:", error);
        process.exit(1);
      }
    });

  program
    .command("generateGuides")
    .description("Generate guides from objectives")
    .action(async () => {
      try {
        await contentService.runGenerateGuidesWorkflow();
      } catch (error) {
        console.error("Error in generateGuides command:", error);
        process.exit(1);
      }
    });

  program
    .command("marketing")
    .description("Generate marketing content")
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
