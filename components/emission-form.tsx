"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Calculator, LogIn, Upload, FileUp, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { calculateCO2Equivalent, calculateGasEmissionsByFactors } from "@/lib/emission-calculations";
import { DocumentUpload } from "@/components/document-upload";
import type { EmissionFactor, ExtractionResult, ExtractedItem } from "@/types/emission";
import type { User } from "@supabase/supabase-js";

interface EmissionFormProps {
	onEntryAdded: () => void;
	user: User | null; // Made user optional
	onBulkUploadClick?: () => void;
}

export function EmissionForm({ onEntryAdded, user, onBulkUploadClick }: EmissionFormProps) {
	const [activityType, setActivityType] = useState("");
	const [category, setCategory] = useState("");
	const [scope, setScope] = useState<1 | 2 | 3 | "">("");
	const [quantity, setQuantity] = useState("");
	const [unit, setUnit] = useState("");
	const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
	const [description, setDescription] = useState("");
	const [emissionFactor, setEmissionFactor] = useState("");
	const [co2Equivalent, setCo2Equivalent] = useState("");
	const [co2Value, setCo2Value] = useState("");
	const [ch4Value, setCh4Value] = useState("");
	const [n2oValue, setN2oValue] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const [emissionFactors, setEmissionFactors] = useState<EmissionFactor[]>([]);
	const [showOCRSection, setShowOCRSection] = useState(false);
	const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
	const [currentItemIndex, setCurrentItemIndex] = useState(0);

	const supabase = createClient();

	useEffect(() => {
		loadEmissionFactors();
	}, []);

	const loadEmissionFactors = async () => {
		try {
      const { data, error } = await supabase.from("emission_factors").select("*").order("activity_type");

			if (error) throw error;
			setEmissionFactors(data || []);
		} catch (error) {
			console.error("Error loading emission factors:", error);
		}
	};

	// Map extracted data types to activity types
	const mapDataTypeToActivityType = (dataType: string): string => {
		const mapping: Record<string, string> = {
			"Electricity": "Electricity",
			"Fuel (Petrol)": "Gasoline",
			"Fuel (Diesel)": "Diesel",
			"Transport": "Transportation",
		};
		return mapping[dataType] || dataType;
	};

	// Handle OCR extraction result
	const handleOCRExtraction = (result: ExtractionResult) => {
		setExtractedItems(result.items);
		setCurrentItemIndex(0);
		
		if (result.items.length > 0) {
			// Auto-populate with first extracted item
			const firstItem = result.items[0];
			populateFormWithExtractedItem(firstItem);
		}
	};

	// Populate form fields with extracted item data
	const populateFormWithExtractedItem = (item: ExtractedItem) => {
		const activityType = mapDataTypeToActivityType(item.dataType);
		setQuantity(item.value.toString());
		setUnit(item.unit);
		
		// Determine scope based on data type
		let selectedScope: 1 | 2 | 3 = 3; // Default to Scope 3
		if (item.dataType === "Electricity") {
			selectedScope = 2; // Scope 2 for purchased electricity
		} else if (item.dataType === "Fuel (Petrol)" || item.dataType === "Fuel (Diesel)") {
			selectedScope = 1; // Scope 1 for direct fuel combustion
		} else if (item.dataType === "Transport") {
			selectedScope = 3; // Scope 3 for transportation
		}
		
		setScope(selectedScope);
		setActivityType(activityType);
		
		// Find emission factor for this activity type and scope
		const factor = emissionFactors.find((f) => f.activity_type === activityType && f.scope === selectedScope);
		if (factor) {
			setCategory(factor.category);
			setEmissionFactor(factor.factor.toString());
		}
		
		// Add confidence note to description
		setDescription(`Extracted from document (${(item.confidence * 100).toFixed(0)}% confidence)`);
	};

	// Handle next extracted item
	const handleNextExtractedItem = () => {
		if (currentItemIndex < extractedItems.length - 1) {
			const nextIndex = currentItemIndex + 1;
			setCurrentItemIndex(nextIndex);
			populateFormWithExtractedItem(extractedItems[nextIndex]);
		}
	};

	// Handle previous extracted item
	const handlePrevExtractedItem = () => {
		if (currentItemIndex > 0) {
			const prevIndex = currentItemIndex - 1;
			setCurrentItemIndex(prevIndex);
			populateFormWithExtractedItem(extractedItems[prevIndex]);
		}
	};

	const handleActivityTypeChange = (value: string) => {
		setActivityType(value);
		const factor = emissionFactors.find((f) => f.activity_type === value);
		if (factor) {
			setCategory(factor.category);
			setUnit(factor.unit);
			setEmissionFactor(factor.factor.toString());
		}
	};

	const handleScopeChange = (value: string) => {
		const newScope = Number(value) as 1 | 2 | 3;
		setScope(newScope);
		// Reset activity type when scope changes
		setActivityType("");
		setCategory("");
		setUnit("");
		setEmissionFactor("");
	};

	const calculateEmissions = () => {
		const qty = Number.parseFloat(quantity);
		const factor = Number.parseFloat(emissionFactor);
		if (!isNaN(qty) && !isNaN(factor)) {
			const result = calculateCO2Equivalent(qty, factor);
			setCo2Equivalent(result.toFixed(2));

			const gasResults = calculateGasEmissionsByFactors(
				qty,
				factor * 0.95,
				factor * 0.03,
				factor * 0.02
			);
			setCo2Value(gasResults.co2.toFixed(4));
			setCh4Value(gasResults.ch4.toFixed(6));
			setN2oValue(gasResults.n2o.toFixed(6));
		}
	};

	useEffect(() => {
		if (quantity && emissionFactor) {
			calculateEmissions();
		}
	}, [quantity, emissionFactor]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!user) {
			setError("Please login to save emission entries. You can still use the calculator below.");
			return;
		}

		setIsLoading(true);
		setError("");

		try {
			const { error } = await supabase.from("emissions").insert({
				user_id: user.id,
				activity_type: activityType,
				category,
				scope: Number(scope),
				quantity: Number.parseFloat(quantity),
				unit,
				emission_factor: Number.parseFloat(emissionFactor),
				co2_equivalent: Number.parseFloat(co2Equivalent),
				co2: co2Value ? Number.parseFloat(co2Value) : null,
				ch4: ch4Value ? Number.parseFloat(ch4Value) : null,
				n2o: n2oValue ? Number.parseFloat(n2oValue) : null,
				date,
				description: description || null,
			});

			if (error) throw error;

			// Reset form
			setActivityType("");
			setCategory("");
			setScope("");
			setQuantity("");
			setUnit("");
			setEmissionFactor("");
			setCo2Equivalent("");
			setDescription("");
			setDate(new Date().toISOString().split("T")[0]);
			setExtractedItems([]);
			setCurrentItemIndex(0);
			setShowOCRSection(false);

			onEntryAdded();
		} catch (error: any) {
			setError(error.message || "An error occurred while saving the entry");
		} finally {
			setIsLoading(false);
		}
	};

	// Handle adding all extracted items at once
	const handleAddAllExtractedItems = async () => {
		if (!user) {
			setError("Please login to save emission entries. You can still use the calculator below.");
			return;
		}

		if (extractedItems.length === 0) {
			setError("No extracted items to add");
			return;
		}

		setIsLoading(true);
		setError("");

		try {
			const entriesToInsert = extractedItems.map((item) => {
				const activityType = mapDataTypeToActivityType(item.dataType);
				
				// Determine scope based on data type
				let selectedScope: 1 | 2 | 3 = 3;
				if (item.dataType === "Electricity") {
					selectedScope = 2;
				} else if (item.dataType === "Fuel (Petrol)" || item.dataType === "Fuel (Diesel)") {
					selectedScope = 1;
				}
				
				// Find emission factor from database
				const factor = emissionFactors.find((f) => f.activity_type === activityType && f.scope === selectedScope);
				const emissionFactorValue = factor?.factor ?? 0;
				const co2Factor = factor?.co2 ?? null;
				const ch4Factor = factor?.ch4 ?? null;
				const n2oFactor = factor?.n2o ?? null;
				let gasResults;
				if (co2Factor !== null || ch4Factor !== null || n2oFactor !== null) {
					gasResults = calculateGasEmissionsByFactors(
						item.value,
						typeof co2Factor === "number" ? co2Factor : 0,
						typeof ch4Factor === "number" ? ch4Factor : 0,
						typeof n2oFactor === "number" ? n2oFactor : 0
					);
				} else {
					gasResults = calculateGasEmissionsByFactors(
						item.value,
						emissionFactorValue * 0.95,
						emissionFactorValue * 0.03,
						emissionFactorValue * 0.02
					);
				}
				return {
					user_id: user.id,
					activity_type: activityType,
					category: factor?.category || item.dataType,
					scope: selectedScope,
					quantity: item.value,
					unit: item.unit,
					emission_factor: emissionFactorValue,
					co2_equivalent: gasResults.co2e,
					co2: gasResults.co2,
					ch4: gasResults.ch4,
					n2o: gasResults.n2o,
					date,
					description: `Extracted from document (${(item.confidence * 100).toFixed(0)}% confidence)`,
				};
			});

			const { error } = await supabase.from("emissions").insert(entriesToInsert);

			if (error) throw error;

			// Reset form
			setActivityType("");
			setCategory("");
			setScope("");
			setQuantity("");
			setUnit("");
			setEmissionFactor("");
			setCo2Equivalent("");
			setDescription("");
			setDate(new Date().toISOString().split("T")[0]);
			setExtractedItems([]);
			setCurrentItemIndex(0);
			setShowOCRSection(false);

			onEntryAdded();
		} catch (error: any) {
			setError(error.message || "An error occurred while saving the entries");
		} finally {
			setIsLoading(false);
		}
	};

	// Filter activity types based on selected scope
	const filteredActivityTypes = scope 
		? [...new Set(emissionFactors.filter(f => f.scope === scope).map(f => f.activity_type))]
		: [];

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Plus className="h-5 w-5" />
						Add New Emission Entry
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="mb-4 space-y-2">
					<div className="flex gap-2">
						<Button 
							type="button" 
							variant="outline" 
							className="flex items-center gap-2 flex-1"
							onClick={onBulkUploadClick}
						>
							<Upload className="h-4 w-4" />
							Bulk Upload Excel
						</Button>
						<Button 
							type="button" 
							variant="outline" 
							className="flex items-center gap-2 flex-1"
							onClick={() => setShowOCRSection(!showOCRSection)}
						>
							<FileUp className="h-4 w-4" />
							{showOCRSection ? "Hide" : "Extract from Document"}
						</Button>
					</div>
				</div>

				{/* OCR Section */}
				{showOCRSection && (
					<Card className="mb-6 bg-blue-50 border-blue-200">
						<CardContent className="pt-6">
							<DocumentUpload onExtractionComplete={handleOCRExtraction} />
							
							{/* Extracted Items Navigation */}
							{extractedItems.length > 0 && (
								<div className="mt-4 p-4 bg-white rounded border border-blue-200">
									<div className="flex items-center justify-between mb-3">
										<p className="text-sm font-semibold text-gray-700">
											Extracted Items: {currentItemIndex + 1} of {extractedItems.length}
										</p>
										<div className="flex gap-2">
											<Button 
												type="button" 
												variant="outline" 
												size="sm"
												onClick={handlePrevExtractedItem}
												disabled={currentItemIndex === 0}
											>
												Previous
											</Button>
											<Button 
												type="button" 
												variant="outline" 
												size="sm"
												onClick={handleNextExtractedItem}
												disabled={currentItemIndex === extractedItems.length - 1}
											>
												Next
											</Button>
										</div>
									</div>
									
									<div className="text-sm space-y-1 text-gray-600">
										<p><strong>Type:</strong> {extractedItems[currentItemIndex].dataType}</p>
										<p><strong>Value:</strong> {extractedItems[currentItemIndex].value} {extractedItems[currentItemIndex].unit}</p>
										<p><strong>Confidence:</strong> {(extractedItems[currentItemIndex].confidence * 100).toFixed(0)}%</p>
									</div>
									
									<p className="text-xs text-gray-500 mt-3">
										ℹ️ Form has been auto-populated with this extracted data. Edit as needed and click "Add Emission Entry" to save.
									</p>
								</div>
							)}
						</CardContent>
					</Card>
				)}
					{!user && (
						<Alert className="mb-4">
							<LogIn className="h-4 w-4" />
							<AlertDescription>
								You can use this calculator to estimate emissions, but you'll need to login to save entries to your dashboard.
							</AlertDescription>
						</Alert>
					)}

					{extractedItems.length > 0 && (
						<Alert className="mb-4 bg-green-50 border-green-200">
							<CheckCircle className="h-4 w-4 text-green-600" />
							<AlertDescription className="text-green-800">
								✓ Form populated with extracted document data
							</AlertDescription>
						</Alert>
					)}
					<form onSubmit={handleSubmit} className="space-y-4">
					{error && (
						<Alert variant={!user ? "default" : "destructive"}>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="date">Date</Label>
							<Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
						</div>

						<div className="space-y-2">
							<Label htmlFor="scope">Scope</Label>
							<select 
								id="scope"
								value={scope.toString()} 
								onChange={(e) => handleScopeChange(e.target.value)}
								className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							>
								<option value="">Select scope</option>
								<option value="1">Scope 1 (Direct)</option>
								<option value="2">Scope 2 (Indirect Energy)</option>
								<option value="3">Scope 3 (Other Indirect)</option>
							</select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="activityType">Activity Type</Label>
							<select 
								id="activityType"
								value={activityType} 
								onChange={(e) => handleActivityTypeChange(e.target.value)}
								required 
								disabled={!scope}
								className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
							>
								<option value="">{scope ? "Select activity type" : "Select scope first"}</option>
								{filteredActivityTypes.map((type) => {
									const unit = emissionFactors.find(f => f.activity_type === type)?.unit || '';
									return (
										<option key={type} value={type}>
											{type} {unit ? `(${unit})` : ''}
										</option>
									);
								})}
							</select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="quantity">Quantity</Label>
							<Input
								id="quantity"
								type="number"
								step="0.01"
								value={quantity}
								onChange={(e) => setQuantity(e.target.value)}
								required
							/>
						</div>

						<div className="space-y-2 col-span-2">
							<Label htmlFor="co2Equivalent">CO₂ Equivalent (kg)</Label>
							<div className="flex gap-2">
								<Input id="co2Equivalent" type="number" step="0.01" value={co2Equivalent} readOnly />
								<Button type="button" variant="outline" size="sm" onClick={calculateEmissions}>
									<Calculator className="h-4 w-4" />
								</Button>
							</div>
						</div>

						{/* Gas Breakdown Section */}
						{co2Value && (
							<div className="space-y-2 col-span-2 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
								<Label className="text-sm font-semibold text-blue-900 dark:text-blue-100">Gas Breakdown</Label>
								<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
									<div className="bg-white dark:bg-slate-800 p-3 rounded">
										<p className="text-xs text-gray-600 dark:text-gray-400">CO₂</p>
										<p className="font-semibold text-gray-900 dark:text-white">{co2Value} kg</p>
									</div>
									<div className="bg-white dark:bg-slate-800 p-3 rounded">
										<p className="text-xs text-gray-600 dark:text-gray-400">CH₄</p>
										<p className="font-semibold text-gray-900 dark:text-white">{ch4Value} kg</p>
									</div>
									<div className="bg-white dark:bg-slate-800 p-3 rounded">
										<p className="text-xs text-gray-600 dark:text-gray-400">N₂O</p>
										<p className="font-semibold text-gray-900 dark:text-white">{n2oValue} kg</p>
									</div>
								</div>
							</div>
						)}
					</div>

					<div className="space-y-2">
						<Label htmlFor="description">Description (Optional)</Label>
						<Textarea
							id="description"
							placeholder="Additional details about this emission entry..."
							value={description}
							onChange={(e) => setDescription(e.target.value)}
						/>
					</div>

					{extractedItems.length > 0 ? (
						<div className="flex gap-2">
							<Button type="submit" disabled={isLoading} className="flex-1">
								{isLoading ? "Adding Entry..." : "Add Current Entry"}
							</Button>
							<Button 
								type="button" 
								onClick={handleAddAllExtractedItems}
								disabled={isLoading}
								variant="outline"
								className="flex-1"
							>
								{isLoading ? "Adding..." : `Add All ${extractedItems.length} Items`}
							</Button>
						</div>
					) : (
						<Button type="submit" disabled={isLoading} className="w-full">
							{!user ? "Login Required to Save Entry" : isLoading ? "Adding Entry..." : "Add Emission Entry"}
						</Button>
					)}
				</form>
			</CardContent>
		</Card>
		</div>
	);
}
