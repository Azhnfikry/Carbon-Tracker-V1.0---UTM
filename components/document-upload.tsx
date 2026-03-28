"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExtractionResult } from "@/types/emission";

interface DocumentUploadProps {
  onExtractionComplete?: (result: ExtractionResult) => void;
}

export function DocumentUpload({ onExtractionComplete }: DocumentUploadProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      setError("Please upload a JPEG, PNG, or PDF file");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64String = e.target?.result as string;

          // Call OCR API
          const response = await fetch("/api/ocr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              base64Data: base64String,
              mimeType: file.type,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to extract data");
          }

          const extractionResult = (await response.json()) as ExtractionResult;
          setResult(extractionResult);
          setSuccess(`Successfully extracted data from ${file.name}`);

          if (onExtractionComplete) {
            onExtractionComplete(extractionResult);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to process file");
        } finally {
          setIsLoading(false);
        }
      };

      reader.onerror = () => {
        setError("Failed to read file");
        setIsLoading(false);
      };

      reader.readAsDataURL(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process file");
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Document Upload (OCR)</CardTitle>
        <CardDescription>
          Upload utility bills, fuel receipts, or invoices to extract emissions data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
            className="hidden"
          />
          <p className="text-sm text-gray-600">
            Drag and drop your file here, or click to browse
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Supported: JPEG, PNG, PDF (Max 10MB)
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success Alert */}
        {success && (
          <Alert className="bg-green-50 border-green-200">
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="ml-2 text-sm text-gray-600">Processing document...</p>
          </div>
        )}

        {/* Results */}
        {result && !isLoading && (
          <div className="space-y-3">
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              {result.supplierName && (
                <p className="text-sm">
                  <strong>Supplier:</strong> {result.supplierName}
                </p>
              )}
              <p className="text-sm">
                <strong>Overall Confidence:</strong>{" "}
                {(result.confidence * 100).toFixed(0)}%
              </p>

              {result.reasoning && (
                <p className="text-xs text-gray-600">
                  <strong>Notes:</strong> {result.reasoning}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Extracted Data:</p>
              {result.items.map((item, idx) => (
                <div key={idx} className="bg-blue-50 p-3 rounded border border-blue-200">
                  <p className="text-sm">
                    <strong>{item.dataType}:</strong> {item.value} {item.unit}
                  </p>
                  <p className="text-xs text-gray-600">
                    Confidence: {(item.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResult(null);
                setSuccess(null);
              }}
            >
              Upload Another File
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
