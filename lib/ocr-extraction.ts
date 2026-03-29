import { GoogleGenAI, Type } from "@google/genai";
import { calculateGasEmissionsByFactors } from "@/lib/emission-calculations";
import type { ExtractionResult } from "@/types/emission";

export const extractDataFromDocument = async (
  base64Data: string,
  mimeType: string = "image/jpeg"
): Promise<ExtractionResult> => {
  // Clean base64 string
  const cleanBase64 = base64Data.includes(",")
    ? base64Data.split(",")[1]
    : base64Data;

  // Initializing with the system provided API key
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
  
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured in environment variables");
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Analyze this document (utility bill, fuel receipt, or invoice PDF/image) and extract Scope 3 emissions data.
    
    GUIDELINES:
    1. TNB Bill (Electricity):
       - Find "Penggunaan (kWh)" or usage total.
       - Supplier: "Tenaga Nasional Berhad".
       
    2. Petronas SmartPay / Fuel Bills:
       - Look for "KUANTITI BELIAN (LTR)" or volume for different fuel types.
       - IMPORTANT: A single document may contain BOTH "Fuel (Petrol)" (often labeled as Primax 95/97) or "Fuel (Diesel)" (often labeled as Dynamic Diesel). Extract ALL that apply.
       - Supplier: "Petronas" or the specific station name.
    
    3. Other Bills:
       - Extract any relevant consumption data for Electricity, Diesel, Petrol, or Transport.

    Format the output as a JSON object with:
    - items (array of objects):
        - value (number): the numeric quantity found.
        - unit (string): 'kWh' or 'liters'.
        - dataType (string): 'Electricity', 'Fuel (Diesel)', 'Fuel (Petrol)', or 'Transport'.
        - confidence (number): score between 0 and 1.
    - supplierName (string): name of the issuer.
    - confidence (number): overall confidence score.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  value: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  dataType: {
                    type: Type.STRING,
                    enum: ["Electricity", "Fuel (Diesel)", "Fuel (Petrol)", "Transport"],
                  },
                  confidence: { type: Type.NUMBER },
                },
                required: ["value", "unit", "dataType", "confidence"],
              },
            },
            supplierName: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
          },
          required: ["items", "confidence"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No text returned from Gemini.");
    }

    const extraction = JSON.parse(resultText) as ExtractionResult;

    extraction.items = extraction.items.map((item) => {
      if (
        typeof item.co2 === "number" ||
        typeof item.ch4 === "number" ||
        typeof item.n2o === "number"
      ) {
        const co2 = typeof item.co2 === "number" ? item.co2 : 0;
        const ch4 = typeof item.ch4 === "number" ? item.ch4 : 0;
        const n2o = typeof item.n2o === "number" ? item.n2o : 0;
        return {
          ...item,
          co2,
          ch4,
          n2o,
          co2e: co2 + ch4 + n2o,
        };
      }

      const fallbackResult = calculateGasEmissionsByFactors(
        item.value,
        0,
        0,
        0
      );

      return {
        ...item,
        ...fallbackResult,
      };
    });

    return extraction;
  } catch (e: any) {
    console.error("Gemini Extraction Error:", e);

    if (e.message?.includes("400") || e.message?.includes("INVALID_ARGUMENT")) {
      throw new Error(
        "The AI was unable to process this file format or the file is too large. Please try a standard JPEG/PNG or a smaller PDF."
      );
    }

    throw new Error(e.message || "Failed to extract data from document.");
  }
};
