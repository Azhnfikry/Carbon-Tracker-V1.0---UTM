import { NextRequest, NextResponse } from "next/server";
import { extractDataFromDocument } from "@/lib/ocr-extraction";

export async function POST(request: NextRequest) {
  try {
    const { base64Data, mimeType = "image/jpeg" } = await request.json();

    if (!base64Data) {
      return NextResponse.json(
        { error: "base64Data is required" },
        { status: 400 }
      );
    }

    // Validate mimeType
    const validMimeTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!validMimeTypes.includes(mimeType)) {
      return NextResponse.json(
        { error: "Invalid mimeType. Supported: image/jpeg, image/png, application/pdf" },
        { status: 400 }
      );
    }

    // Call Gemini extraction
    const result = await extractDataFromDocument(base64Data, mimeType);

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("OCR API Error:", error);

    return NextResponse.json(
      {
        error: error.message || "Failed to extract data from document",
      },
      { status: 500 }
    );
  }
}
