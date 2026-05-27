
import { GoogleGenAI, Type } from "@google/genai/web";

export class AIService {
  /**
   * Generates a "Smart Processing Strategy" based on document context.
   * Following guidelines:
   * 1. Create a new GoogleGenAI instance within the method to ensure fresh API key usage.
   * 2. Use the direct .text property from GenerateContentResponse instead of a method call.
   * 3. Use Type from @google/genai for responseSchema to ensure structured JSON output.
   */
  async analyzeDocumentContext(toolName: string, fileName: string, studentCount: number): Promise<string[]> {
    // Graceful fallback if no API key is present (common in local EXE builds)
    if (!process.env.API_KEY) {
      console.warn("AI Service: No API Key found, using fallback strategy.");
      return ["Initializing parallel rendering", "Applying security layers", "Finalizing batch export"];
    }

    try {
      // Instantiate AI client inside method to pick up potentially updated API keys
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `You are the backend engine of InfinityPDF. 
        Tool: ${toolName}
        Input File: ${fileName}
        Task: Process for ${studentCount} recipients.
        Provide a brief 3-step technical processing strategy for the logs. 
        Keep each step under 10 words. 
        Format: JSON array of strings.`,
        config: {
          responseMimeType: "application/json",
          // Enforce a JSON array of strings response structure
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
          },
        }
      });

      // Use the .text property directly as per latest SDK guidelines
      const text = response.text || "[]";
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map(item => String(item));
      }
      return ["Initializing parallel rendering", "Applying security layers", "Finalizing batch export"];
    } catch (e) {
      console.warn("AI Service Error:", e);
      // Provide fallback strategy if parsing fails
      return ["Initializing parallel rendering", "Applying security layers", "Finalizing batch export"];
    }
  }

  /**
   * Generates a personalized processing ID or metadata for a specific recipient.
   * Following guidelines:
   * 1. Create a new GoogleGenAI instance within the method.
   * 2. Use the direct .text property from GenerateContentResponse.
   */
  async generateRecipientToken(recipientName: string): Promise<string> {
    // Instantiate AI client inside method to pick up potentially updated API keys
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a short unique 8-character hex processing token for ${recipientName}. Only return the token.`,
    });
    // Use the .text property directly as per latest SDK guidelines
    const text = response.text?.trim();
    return text || Math.random().toString(16).substring(2, 10);
  }
}

export const aiService = new AIService();
