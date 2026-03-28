"use client";

import { useState } from "react";
import { DocumentUpload } from "@/components/document-upload";
import { ExtractionResult } from "@/types/emission";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OCRTestPage() {
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            OCR Document Extraction
          </h1>
          <p className="text-gray-600">
            Extract emissions data from utility bills, fuel receipts, and invoices using AI
          </p>
        </div>

        {/* Document Upload */}
        <DocumentUpload
          onExtractionComplete={(result) => {
            setExtraction(result);
          }}
        />

        {/* Extracted Data Display */}
        {extraction && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Extraction Results</CardTitle>
              <CardDescription>Data extracted from your document</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="bg-gray-50 p-4 rounded-lg">
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(extraction, null, 2)}
                </pre>
              </div>

              {/* Emissions Table */}
              {extraction.items && extraction.items.length > 0 && (
                <div className="overflow-x-auto mt-4">
                  <table className="min-w-full text-xs border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-2 py-1 border">#</th>
                        <th className="px-2 py-1 border">Type</th>
                        <th className="px-2 py-1 border">Value</th>
                        <th className="px-2 py-1 border">Unit</th>
                        <th className="px-2 py-1 border">CO2e</th>
                        <th className="px-2 py-1 border">CO2</th>
                        <th className="px-2 py-1 border">CH4</th>
                        <th className="px-2 py-1 border">N2O</th>
                        <th className="px-2 py-1 border">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extraction.items.map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-2 py-1 border text-center">{idx + 1}</td>
                          <td className="px-2 py-1 border">{item.dataType}</td>
                          <td className="px-2 py-1 border">{item.value}</td>
                          <td className="px-2 py-1 border">{item.unit}</td>
                          <td className="px-2 py-1 border">{item.co2e !== undefined ? item.co2e : '-'}</td>
                          <td className="px-2 py-1 border">{item.co2 !== undefined ? item.co2 : '-'}</td>
                          <td className="px-2 py-1 border">{item.ch4 !== undefined ? item.ch4 : '-'}</td>
                          <td className="px-2 py-1 border">{item.n2o !== undefined ? item.n2o : '-'}</td>
                          <td className="px-2 py-1 border">{item.confidence !== undefined ? (item.confidence * 100).toFixed(1) + '%' : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded border border-blue-200">
                  <p className="text-sm text-gray-600">Items Extracted</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {extraction.items.length}
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded border border-green-200">
                  <p className="text-sm text-gray-600">Confidence</p>
                  <p className="text-2xl font-bold text-green-600">
                    {(extraction.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card className="mt-8 bg-amber-50 border-amber-200">
          <CardHeader>
            <CardTitle className="text-lg">Instructions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              <strong>Supported Documents:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>TNB Electricity Bills (kWh consumption)</li>
              <li>Petronas Fuel Receipts (Petrol & Diesel)</li>
              <li>Other utility bills and invoices</li>
            </ul>
            <p className="mt-4">
              <strong>Requirements:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>File size: Max 10MB</li>
              <li>Format: JPEG, PNG, or PDF</li>
              <li>Quality: Clear, readable document</li>
              <li>Google API Key required in environment</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
