import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { encoding_for_model, TiktokenModel } from "tiktoken";
import { LLMConfig, TokenCounts, ImageData } from "../utils/types";

export class LLMService {
  private static instance: LLMService;
  private genAI: GoogleGenerativeAI;
  private geminiModel: any;
  private openai: OpenAI;
  private encoder: any;
  private tokenCounts: TokenCounts;

  private constructor(config: LLMConfig = {}) {
    const googleApiKey = config.googleApiKey || process.env.GOOGLE_API_KEY;
    if (!googleApiKey) {
      throw new Error("Google API key is required");
    }
    this.genAI = new GoogleGenerativeAI(googleApiKey);
    this.geminiModel = this.genAI.getGenerativeModel({
      model: config.geminiModel || "gemini-2.0-flash",
    });

    const openaiApiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error("OpenAI API key is required");
    }
    this.openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    this.encoder = encoding_for_model(
      (config.openaiModel as TiktokenModel) || "gpt-4o-mini"
    );

    this.tokenCounts = {
      free: { input: 0, output: 0 },
      paid: { input: 0, output: 0 },
    };
  }

  public static getInstance(config?: LLMConfig): LLMService {
    if (!LLMService.instance) {
      LLMService.instance = new LLMService(config);
    }
    return LLMService.instance;
  }

  public async countTokens(
    text: string,
    tier: "free" | "paid" = "free"
  ): Promise<number> {
    if (tier === "paid") {
      const tokens = this.encoder.encode(text);
      return tokens.length;
    } else {
      const result = await this.geminiModel.countTokens(text);
      return result.totalTokens;
    }
  }

  public async sendPrompt(
    prompt: string,
    waitFor: number = 5,
    maxRetries: number = 3,
    image?: ImageData,
    tier: "free" | "paid" = "free"
  ): Promise<string> {
    let attempts = 0;
    const tokenCount = await this.countTokens(prompt, tier);

    this.tokenCounts[tier].input += tokenCount;


    console.log(`Prompt: ${prompt.slice(0, 50)}...`);
    console.log(`Token count: ${tokenCount}`);
    console.log(`Tier: ${tier}`);

    while (attempts < maxRetries) {
      try {
        if (attempts > 0) {
          console.log(`Retrying prompt: ${prompt.slice(0, 50)}...`);
        }

        let output: string;

        if (tier === "free") {
          output = await this.sendGeminiPrompt(prompt, image);
        } else {
          output = await this.sendOpenAIPrompt(prompt);
        }

        const outputTokenCount = await this.countTokens(output, tier);
        if (tier === "free") {
          this.tokenCounts.free.output += outputTokenCount;
        } else {
          this.tokenCounts.paid.output += outputTokenCount;
        }

        console.log(this.tokenCounts);
        return output;
      } catch (err: any) {
        if (err.status === 429 || err.status === 503) {
          attempts++;
          console.error(
            `${
              err.status
            } Error. Attempt ${attempts} of ${maxRetries}. Retrying prompt: ${prompt.slice(
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
  }

  private async sendGeminiPrompt(
    prompt: string,
    image?: ImageData
  ): Promise<string> {
    const input = image ? [prompt, image] : prompt;
    const result = await this.geminiModel.generateContent(input);
    return result.response.text();
  }

  private async sendOpenAIPrompt(prompt: string): Promise<string> {
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });
    return completion.choices[0].message.content || "";
  }

  public getTokenCounts(): TokenCounts {
    return { ...this.tokenCounts };
  }

  public resetTokenCounts(): void {
    this.tokenCounts = {
      free: { input: 0, output: 0 },
      paid: { input: 0, output: 0 },
    };
  }

  public async processImageWithPrompt(
    imagePath: string,
    prompt: string,
    waitFor: number = 10,
    maxRetries: number = 3
  ): Promise<string> {
    const fs = await import("fs");
    const imageData = fs.readFileSync(imagePath).toString("base64");

    return this.sendPrompt(
      prompt,
      waitFor,
      maxRetries,
      {
        inlineData: { data: imageData, mimeType: "image/png" },
      },
      "free"
    );
  }
}

export const getLLMService = (config?: LLMConfig) =>
  LLMService.getInstance(config);
