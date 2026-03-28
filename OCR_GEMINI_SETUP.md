# ✅ Gemini OCR Extraction - Setup & Usage

## 🚀 Quick Start

### 1. **Set Environment Variable**
Add your Google API key to your `.env.local` file:

```env
GOOGLE_API_KEY=your_google_api_key_here
```

### 2. **Test the Feature**
Run the development server and navigate to:
```
http://localhost:3000/ocr-test
```

### 3. **Features Implemented**

#### Backend Components
- ✅ **`/lib/ocr-extraction.ts`** - Gemini OCR extraction logic
- ✅ **`/app/api/ocr/route.ts`** - API endpoint for document processing
- ✅ **`/types/emission.ts`** - Updated with OCR extraction types

#### Frontend Components
- ✅ **`/components/document-upload.tsx`** - Drag-and-drop file upload
- ✅ **`/app/ocr-test/page.tsx`** - Test page for OCR feature

## 📋 What Gets Extracted

### Electricity Bills (TNB)
- **Field**: "Penggunaan (kWh)" or similar
- **Extracted**: kWh usage value
- **Scope**: Scope 3 (purchased electricity)

### Fuel Receipts (Petronas)
- **Fields**: "KUANTITI BELIAN (LTR)" 
- **Extracted**: 
  - Fuel (Petrol) - Primax 95/97
  - Fuel (Diesel) - Dynamic Diesel
- **Scope**: Scope 3 (business travel fuel)

### Other Documents
- Generic utility bills
- Invoice data
- Transport receipts

## 🔌 API Endpoint

### POST `/api/ocr`

**Request:**
```json
{
  "base64Data": "data:image/jpeg;base64,...",
  "mimeType": "image/jpeg"
}
```

**Response:**
```json
{
  "items": [
    {
      "value": 250,
      "unit": "kWh",
      "dataType": "Electricity",
      "confidence": 0.95
    }
  ],
  "supplierName": "Tenaga Nasional Berhad",
  "confidence": 0.95,
  "reasoning": "Clear electricity bill found"
}
```

## 📝 Types

### `ExtractionResult`
```typescript
interface ExtractionResult {
  items: ExtractedItem[]
  supplierName?: string
  confidence: number
  reasoning?: string
}
```

### `ExtractedItem`
```typescript
interface ExtractedItem {
  value: number
  unit: string
  dataType: "Electricity" | "Fuel (Diesel)" | "Fuel (Petrol)" | "Transport"
  confidence: number
}
```

## 🧪 Testing Checklist

- [ ] Upload PNG file to OCR test page
- [ ] Upload JPEG file to OCR test page
- [ ] Upload PDF file to OCR test page
- [ ] Verify data extraction accuracy
- [ ] Check confidence scores
- [ ] Test error handling (invalid file type)
- [ ] Test error handling (file too large)
- [ ] Verify API responses in browser network tab

## 🔐 Environment Setup

### Get Google API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable **Gemini API** (or Google Generative AI)
4. Create an API key (not OAuth)
5. Add to `.env.local`:
   ```
   GOOGLE_API_KEY=your_key_here
   ```

### Package Dependencies
The required packages are already installed:
```json
"@google/genai": "^1.37.0"
```

## 🚨 Error Handling

The component gracefully handles:
- Invalid file types → Shows error message
- Files > 10MB → Shows size error
- API failures → Shows user-friendly error
- Gemini API errors → Catches and logs

## 📊 Integration with Emission Form

To integrate with your emission form:

```typescript
import { DocumentUpload } from "@/components/document-upload";

export function EmissionForm() {
  const handleExtractionComplete = (result: ExtractionResult) => {
    // Map extracted data to form fields
    result.items.forEach(item => {
      // Update form with: quantity, unit, dataType
    });
  };

  return (
    <DocumentUpload onExtractionComplete={handleExtractionComplete} />
  );
}
```

## 🎯 Next Steps

1. ✅ Test the OCR feature at `/ocr-test`
2. ✅ Integrate with emission form
3. ✅ Add OCR upload button to dashboard
4. ✅ Connect extracted data to emission calculations
5. ✅ Deploy to production with Google API key

---

**Status**: ✅ Ready for testing and integration
