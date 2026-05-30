export interface EmissionEntry {
  id: string
  activity_type: string
  category: string
  scope: 1 | 2 | 3
  quantity: number
  unit: string
  emission_factor?: number
  emissionFactor: number
  co2_equivalent: number
  co2Equivalent?: number
  co2?: number
  ch4?: number
  n2o?: number
  date: string
  description?: string
  user_id?: string
}

export interface EmissionSummary {
  totalEmissions: number
  scope1: number
  scope2: number
  scope3: number
  byCategory: Record<string, number>
}

export interface StudentCountEntry {
  id: string
  date: string
  students: number
  description?: string
  user_id?: string
  created_at?: string
}

export interface EmissionFactor {
	id: string;
	activity_type: string;
	category: string;
	scope: 1 | 2 | 3;
	unit: string;
	factor: number;
	co2?: number;
	ch4?: number;
	n2o?: number;
	source?: string;
	region?: string;
	year?: number;
}

export interface Profile {
  id: string
  full_name?: string
  job_title?: string
  email?: string
  company_name?: string
  industry?: string
  created_at: string
  updated_at: string
}

// OCR Extraction Types
export type DataType = "Electricity" | "Fuel (Diesel)" | "Fuel (Petrol)" | "Transport"

export interface ExtractedItem {
  value: number
  unit: string
  dataType: DataType
  confidence: number
  co2e?: number
  co2?: number
  ch4?: number
  n2o?: number
}

export interface ExtractionResult {
  items: ExtractedItem[]
  supplierName?: string
  confidence: number
  reasoning?: string
}
