"use client";

import type React from "react";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, Loader2, CheckCircle, XCircle, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { calculateGasEmissionsByFactors } from "@/lib/emission-calculations";
import type { User } from "@supabase/supabase-js";

interface ExtractedEmissionData {
	"Activity Type": string;
	Scope: string;
	Quantity: string;
	Unit: string;
	Date?: string;
	Year?: string;
	Month?: string;
}

interface BulkUploadProps {
	user: User | null;
	onUploadSuccess?: () => void;
}

export function BulkUpload({ user, onUploadSuccess }: BulkUploadProps) {
	const [isUploading, setIsUploading] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [fileName, setFileName] = useState("");
	const [extractedData, setExtractedData] = useState<ExtractedEmissionData[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);
	const [processingStatus, setProcessingStatus] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	const supabase = createClient();

	const normalizeValue = (value: string) =>
		value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

	const parseScopeNumber = (scopeValue: string): 1 | 2 | 3 => {
		const scopeStr = scopeValue?.toString().toLowerCase().trim() || "";
		if (scopeStr.includes("scope")) {
			const match = scopeStr.match(/\d+/);
			if (match) {
				const parsed = parseInt(match[0], 10);
				if (parsed === 1 || parsed === 2 || parsed === 3) return parsed;
			}
		}

		const directValue = parseInt(scopeValue, 10);
		if (directValue === 1 || directValue === 2 || directValue === 3) return directValue;
		return 2;
	};

	const normalizeUploadDate = (rawDate?: string, rawYear?: string, rawMonth?: string): string => {
		const buildFromYearMonth = (yearValue?: string, monthValue?: string) => {
			const year = yearValue?.trim();
			const month = monthValue?.trim();
			if (!year) return null;

			if (!month) {
				return /^\d{4}$/.test(year) ? `${year}-01-01` : null;
			}

			const monthMap: Record<string, string> = {
				"1": "01",
				"01": "01",
				jan: "01",
				january: "01",
				"2": "02",
				"02": "02",
				feb: "02",
				february: "02",
				"3": "03",
				"03": "03",
				mar: "03",
				march: "03",
				"4": "04",
				"04": "04",
				apr: "04",
				april: "04",
				"5": "05",
				"05": "05",
				may: "05",
				"6": "06",
				"06": "06",
				jun: "06",
				june: "06",
				"7": "07",
				"07": "07",
				jul: "07",
				july: "07",
				"8": "08",
				"08": "08",
				aug: "08",
				august: "08",
				"9": "09",
				"09": "09",
				sep: "09",
				sept: "09",
				september: "09",
				"10": "10",
				oct: "10",
				october: "10",
				"11": "11",
				nov: "11",
				november: "11",
				"12": "12",
				dec: "12",
				december: "12",
			};

			const monthNumber = monthMap[month.toLowerCase()];
			return /^\d{4}$/.test(year) && monthNumber ? `${year}-${monthNumber}-01` : null;
		};

		const parsedYearMonth = buildFromYearMonth(rawYear, rawMonth);
		if ((!rawDate || rawDate === "-") && parsedYearMonth) {
			return parsedYearMonth;
		}

		if (!rawDate || rawDate === "-") {
			return new Date().toISOString().split("T")[0];
		}

		const trimmed = rawDate.trim();
		const directDate = new Date(trimmed);
		if (!Number.isNaN(directDate.getTime())) {
			return directDate.toISOString().split("T")[0];
		}

		const monthMatch = trimmed.match(/^(\d{4})\s*\/\s*([A-Za-z]+)$/);
		if (monthMatch) {
			const [, year, monthName] = monthMatch;
			const parsed = new Date(`${monthName} 1, ${year}`);
			if (!Number.isNaN(parsed.getTime())) {
				return parsed.toISOString().split("T")[0];
			}
		}

		const yearMatch = trimmed.match(/^(\d{4})$/);
		if (yearMatch) {
			return `${yearMatch[1]}-01-01`;
		}

		return parsedYearMonth || new Date().toISOString().split("T")[0];
	};

	const findMatchingFactor = (activityType: string, scopeNumber: 1 | 2 | 3, factors: any[]) => {
		const normalizedActivity = normalizeValue(activityType);
		const scopedFactors = factors.filter((factor) => factor.scope === scopeNumber);

		return (
			scopedFactors.find((factor) => normalizeValue(factor.activity_type) === normalizedActivity) ||
			scopedFactors.find((factor) => normalizedActivity.includes(normalizeValue(factor.activity_type))) ||
			scopedFactors.find((factor) => normalizeValue(factor.activity_type).includes(normalizedActivity)) ||
			scopedFactors.find((factor) => {
				const factorActivity = normalizeValue(factor.activity_type);
				return normalizedActivity
					.split(" ")
					.filter((part) => part.length > 2)
					.some((part) => factorActivity.includes(part));
			})
		);
	};

	const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		// Validate file type
		const allowedTypes = [
			"text/csv",
			"application/csv",
			"application/pdf",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"application/vnd.ms-excel",
		];

		if (!allowedTypes.includes(file.type) && !file.name.endsWith(".csv")) {
			setError("Please upload a CSV, PDF, DOCX, or Excel file");
			return;
		}

		setFileName(file.name);
		setError("");
		setSuccess("");
		setExtractedData([]);

		await extractDataFromFile(file);
	};

	const extractDataFromFile = async (file: File) => {
		setIsUploading(true);
		setError("");

		try {
			const formData = new FormData();
			formData.append("file", file);

			const response = await fetch("/api/extract-emissions", {
				method: "POST",
				body: formData,
			});

			const data = await response.json();

			if (!response.ok) {
				const errorMsg = data.error || "Failed to extract emissions from file";
				const hint = data.hint ? ` ${data.hint}` : "";
				throw new Error(errorMsg + hint);
			}

			const extracted: ExtractedEmissionData[] = data.emissions || [];

			if (extracted.length === 0) {
				setError("No emission data found in the file");
				return;
			}

			setExtractedData(extracted);
			setSuccess(`Successfully extracted ${extracted.length} emission entries`);
		} catch (error) {
			setError(error instanceof Error ? error.message : "Failed to process file");
		} finally {
			setIsUploading(false);
		}
	};

	const handleBulkInsert = async () => {
		if (!user) {
			setError("Please login to save entries");
			return;
		}

		if (extractedData.length === 0) {
			setError("No data to insert");
			return;
		}

		setIsProcessing(true);
		setProcessingStatus("Processing entries...");

		try {
			// Get emission factors from database
			const { data: factors, error: factorError } = await supabase
				.from("emission_factors")
				.select("*");

			if (factorError) throw factorError;

			const factorList = factors || [];

			// Prepare entries for insertion
			const entriesToInsert = extractedData.map((item, index) => {
				setProcessingStatus(`Processing entry ${index + 1} of ${extractedData.length}...`);

				const scopeNumber = parseScopeNumber(item.Scope);
				const matchedFactor = findMatchingFactor(item["Activity Type"], scopeNumber, factorList);

				const quantity = parseFloat(item.Quantity);
				const factor = matchedFactor?.factor || 1;

								// Calculate individual gas emissions using available factors or fallback ratios
								const co2Factor = matchedFactor?.co2 ?? null;
								const ch4Factor = matchedFactor?.ch4 ?? null;
								const n2oFactor = matchedFactor?.n2o ?? null;
								let gasResults;
								if (co2Factor !== null || ch4Factor !== null || n2oFactor !== null) {
									// Use available factors, fallback to 0 if missing
									gasResults = calculateGasEmissionsByFactors(
										quantity,
										typeof co2Factor === "number" ? co2Factor : 0,
										typeof ch4Factor === "number" ? ch4Factor : 0,
										typeof n2oFactor === "number" ? n2oFactor : 0
									);
								} else {
									// Fallback to ratios if no gas-specific factors
									gasResults = calculateGasEmissionsByFactors(
										quantity,
										factor * 0.95,
										factor * 0.03,
										factor * 0.02
									);
								}

								const { co2, ch4, n2o, co2e } = gasResults;

				return {
					user_id: user.id,
					activity_type: matchedFactor?.activity_type || item["Activity Type"],
					category: matchedFactor?.category || "Unknown",
					scope: scopeNumber,
					quantity,
					unit: matchedFactor?.unit || item.Unit,
					emission_factor: factor,
					co2_equivalent: co2e,
					co2,
					ch4,
					n2o,
					date: normalizeUploadDate(item.Date, item.Year, item.Month),
					description: `Bulk uploaded from ${fileName}`,
				};
			});

			// Insert in batches of 100
			const batchSize = 100;
			let successCount = 0;

			for (let i = 0; i < entriesToInsert.length; i += batchSize) {
				const batch = entriesToInsert.slice(i, i + batchSize);
				const { error: insertError } = await supabase
					.from("emissions")
					.insert(batch);

				if (insertError) {
					throw new Error(`Batch ${Math.floor(i / batchSize) + 1}: ${insertError.message}`);
				}
				successCount += batch.length;
				setProcessingStatus(
					`Inserted ${successCount} of ${entriesToInsert.length} entries...`
				);
			}

			setSuccess(`✅ Successfully inserted ${successCount} emission entries!`);
			setExtractedData([]);
			setFileName("");
			if (fileInputRef.current) fileInputRef.current.value = "";
			onUploadSuccess?.();
		} catch (error) {
			console.error("Database insertion error:", error);
			setError(error instanceof Error ? error.message : "Failed to insert entries");
		} finally {
			setIsProcessing(false);
			setProcessingStatus("");
		}
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Upload className="h-5 w-5" />
						Bulk Upload Emissions
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* File Upload Section */}
					<div className="space-y-2">
						<label className="block text-sm font-medium">Upload Document</label>
						<div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition">
							<input
								ref={fileInputRef}
								type="file"
								accept=".csv,.pdf,.docx,.xlsx,.xls"
								onChange={handleFileChange}
								disabled={isUploading}
								className="hidden"
								id="file-upload"
							/>
							<label
								htmlFor="file-upload"
								className="cursor-pointer flex flex-col items-center gap-2"
							>
								<FileText className="h-8 w-8 text-gray-400" />
								<span className="text-sm font-medium">
									Click to upload or drag and drop
								</span>
								<span className="text-xs text-gray-500">
									CSV (recommended), PDF, DOCX, or Excel supported
								</span>
							</label>
						</div>

						{fileName && (
							<div className="flex items-center gap-2 p-3 bg-blue-50 rounded">
								<FileText className="h-4 w-4 text-blue-600" />
								<span className="text-sm text-blue-900">{fileName}</span>
							</div>
						)}
					</div>

					{/* Error Alert */}
					{error && (
						<Alert variant="destructive">
							<XCircle className="h-4 w-4" />
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					{/* Success Alert */}
					{success && (
						<Alert className="border-green-200 bg-green-50">
							<CheckCircle className="h-4 w-4 text-green-600" />
							<AlertDescription className="text-green-800">{success}</AlertDescription>
						</Alert>
					)}

					{/* Processing Status */}
					{isProcessing && (
						<Alert className="border-blue-200 bg-blue-50">
							<Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
							<AlertDescription className="text-blue-800">
								{processingStatus}
							</AlertDescription>
						</Alert>
					)}

					{/* Extracted Data Preview */}
					{extractedData.length > 0 && (
						<div className="space-y-3">
							<div className="flex justify-between items-center">
								<h3 className="font-semibold">
									Preview ({extractedData.length} entries)
								</h3>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => {
										setExtractedData([]);
										setFileName("");
										if (fileInputRef.current) fileInputRef.current.value = "";
									}}
								>
									Clear
								</Button>
							</div>

							<div className="overflow-y-auto max-h-[400px] border rounded-lg">
								<table className="w-full text-sm border-collapse">
									<thead className="sticky top-0 bg-gray-50">
										<tr className="border-b">
											<th className="text-left p-2">Activity Type</th>
											<th className="text-left p-2">Scope</th>
											<th className="text-left p-2">Quantity</th>
											<th className="text-left p-2">Unit</th>
											<th className="text-left p-2">Date</th>
										</tr>
									</thead>
									<tbody>
										{extractedData.map((item, idx) => (
											<tr key={idx} className="border-b hover:bg-gray-50">
												<td className="p-2">{item["Activity Type"]}</td>
												<td className="p-2">{item.Scope}</td>
												<td className="p-2">{item.Quantity}</td>
												<td className="p-2">{item.Unit}</td>
												<td className="p-2">{item.Date || "-"}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>

							{/* Insert Button */}
							<Button
								onClick={handleBulkInsert}
								disabled={!user || isProcessing}
								className="w-full bg-green-600 hover:bg-green-700"
							>
								{!user ? (
									"Login Required"
								) : isProcessing ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin mr-2" />
										Processing...
									</>
								) : (
									<>
										<CheckCircle className="h-4 w-4 mr-2" />
										Insert {extractedData.length} Entries
									</>
								)}
							</Button>
						</div>
					)}

					{/* Upload Button */}
					<Button
						onClick={() => fileInputRef.current?.click()}
						disabled={isUploading}
						className="w-full"
					>
						{isUploading ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin mr-2" />
								Extracting Data...
							</>
						) : (
							<>
								<Upload className="h-4 w-4 mr-2" />
								{fileName ? "Choose Different File" : "Select File"}
							</>
						)}
					</Button>
				</CardContent>
			</Card>

			{/* Instructions Card */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">How to Use Bulk Upload</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<p>
						<strong>1. Prepare Document:</strong> Create a CSV file (recommended), PDF, or Word document 
						with emission data in the following format:
					</p>
					<ul className="list-disc list-inside ml-2 space-y-1">
						<li>Column 1: Activity Type (e.g., Electricity, Diesel)</li>
						<li>Column 2: Scope (1, 2, or 3)</li>
						<li>Column 3: Quantity (number)</li>
						<li>Column 4: Unit (kWh, liters, km, etc.)</li>
					</ul>
					<p className="mt-3 text-xs text-gray-600">
						💡 <strong>Tip:</strong> CSV files work instantly. PDF/Word files require Gemini API key. 
						Excel files must be converted to CSV.
					</p>
					<p className="mt-3">
						<strong>2. Upload File:</strong> Click "Select File" and choose your prepared document (CSV, PDF, or DOCX)
					</p>
					<p>
						<strong>3. Review Data:</strong> Check the preview table to ensure all entries
						are correctly extracted
					</p>
					<p>
						<strong>4. Insert Entries:</strong> Click "Insert Entries" to add all records to
						your dashboard
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
