
export interface EmissionFactor {
  id: string;
  scope: string;
  section: string;
  type: string;
  units: string;
  co2e: number | string;
  co2?: number | string;
  ch4?: number | string;
  no2?: number | string;
  unit: string;
  ref: string;
  year?: string | number;
}

export const EMISSION_SCOPES: any[] = [
  {
    id: 1,
    name: "Scope 1 (Direct)",
    description: "Direct GHG emissions from sources owned or controlled by the organization",
    color: "#ef4444",
  },
  {
    id: 2,
    name: "Scope 2 (Indirect Energy)",
    description: "Indirect GHG emissions from purchased electricity, steam, heating and cooling",
    color: "#f97316",
  },
  {
    id: 3,
    name: "Scope 3 (Other Indirect)",
    description: "All other indirect GHG emissions in the value chain",
    color: "#3b82f6",
  },
  {
    id: 4,
    name: "Offset",
    description: "Carbon offsets from green spaces and environmental initiatives",
    color: "#22c55e",
  },
]

export const EMISSION_CATEGORIES: any[] = [
  {
    id: "energy",
    name: "Energy",
    description: "Electricity, gas, and other energy consumption",
    defaultUnit: "kWh",
    defaultEmissionFactor: 0.5, // kg CO2e per kWh
  },
  {
    id: "transportation",
    name: "Transportation",
    description: "Vehicle fuel consumption and travel",
    defaultUnit: "km",
    defaultEmissionFactor: 0.2, // kg CO2e per km
  },
  {
    id: "waste",
    name: "Waste",
    description: "Waste generation and disposal",
    defaultUnit: "kg",
    defaultEmissionFactor: 0.5, // kg CO2e per kg
  },
  {
    id: "water",
    name: "Water",
    description: "Water consumption and treatment",
    defaultUnit: "L",
    defaultEmissionFactor: 0.001, // kg CO2e per L
  },
  {
    id: "materials",
    name: "Materials",
    description: "Raw materials and supplies",
    defaultUnit: "kg",
    defaultEmissionFactor: 1.5, // kg CO2e per kg
  },
]

export const emissionFactors: EmissionFactor[] = [
  {
    id: "1",
    scope: "Scope 1",
    section: "Stationary Combustion",
    type: "Natural Gas (Sm3 or BTU)",
    units: "MMBTU",
    co2e: 53.11450,
    co2: 53.06000,
    ch4: 0.00100,
    no2: 0.00010,
    unit: "kg/MMBTU",
    ref: "PA Emission Factors for Greenhouse Gas Inventories",
    year: 2018
  },
  {
    id: "2",
    scope: "Scope 1",
    section: "Stationary Combustion",
    type: "Diesel (Litre or BTU)",
    units: "Litre",
    co2e: 2.66155,
    co2: 2.62818,
    ch4: 0.00001,
    no2: 0.00012,
    unit: "Litre",
    ref: "BIES 2025",
    year: 2025
  },
  {
    id: "3",
    scope: "Scope 1",
    section: "Stationary Combustion",
    type: "LPG (kg or BTU)",
    units: "kg",
    co2e: 61.95300,
    co2: 61.71000,
    ch4: 0.00300,
    no2: 0.00060,
    unit: "kg/MMBTU",
    ref: "PA Emission Factors for Greenhouse Gas Inventories",
    year: 2018
  },
  {
    id: "4",
    scope: "Scope 1",
    section: "Mobile Combustion",
    type: "Petrol (Litre)",
    units: "Litre",
    co2e: 2.30154,
    co2: 2.28819,
    ch4: 0.00865,
    no2: 0.00470,
    unit: "Litre",
    ref: "GHG Protocol 2024",
    year: 2024
  },
  {
    id: "5",
    scope: "Scope 1",
    section: "Mobile Combustion",
    type: "Diesel (Litre)",
    units: "Litre",
    co2e: 2.91440,
    co2: 2.90999,
    ch4: 0.00232,
    no2: 0.00210,
    unit: "Litre",
    ref: "GHG Protocol 2024",
    year: 2024
  },
  {
    id: "6",
    scope: "Scope 1",
    section: "Water Treatment",
    type: "Water (m3)",
    units: "m3",
    co2e: 0.17088,
    co2: "N/A",
    ch4: "N/A",
    no2: "N/A",
    unit: "m3",
    ref: "GHG Protocol 2025 Condensed Set",
    year: 2025
  },
  {
    id: "7",
    scope: "Scope 1",
    section: "Refrigerant",
    type: "Refrigerant R22",
    units: "unit",
    co2e: 1760,
    co2: "N/A",
    ch4: "N/A",
    no2: "N/A",
    unit: "Kg",
    ref: "GHG Protocol 2025 Condensed Set",
    year: 2025
  },
  {
    id: "8",
    scope: "Scope 1",
    section: "Refrigerant",
    type: "Refrigerant R410",
    units: "unit",
    co2e: 1924,
    unit: "Kg",
    ref: "GHG Protocol 2025 Condensed Set",
    year: 2025
  },
  {
    id: "9",
    scope: "Scope 1",
    section: "Refrigerant",
    type: "Refrigerant R32",
    units: "unit",
    co2e: 677,
    unit: "Kg",
    ref: "GHG Protocol 2025 Condensed Set",
    year: 2025
  },
  {
    id: "10",
    scope: "Scope 1",
    section: "Refrigerant",
    type: "Refrigerant R123",
    units: "unit",
    co2e: 79,
    unit: "Kg",
    ref: "GHG Protocol 2025 Condensed Set",
    year: 2025
  },
  {
    id: "11",
    scope: "Scope 1",
    section: "Livestock",
    type: "Horse (number of head)",
    units: "head",
    co2e: 0.789,
    unit: "USD",
    ref: "Exiobase Australia",
    year: 2021
  },
  {
    id: "12",
    scope: "Scope 1",
    section: "Livestock",
    type: "Cattle (number of head)",
    units: "head",
    co2e: 12.673,
    unit: "Eur",
    ref: "Exiobase Australia",
    year: 2021
  },
  {
    id: "13",
    scope: "Scope 1",
    section: "Livestock",
    type: "Goat (number of head)",
    units: "head",
    co2e: 0.789,
    unit: "USD",
    ref: "Exiobase Australia",
    year: 2021
  },
  {
    id: "14",
    scope: "Scope 1",
    section: "Livestock",
    type: "Sheep (number of head)",
    units: "head",
    co2e: 0.789,
    unit: "USD",
    ref: "Exiobase Australia",
    year: 2021
  },
  {
    id: "15",
    scope: "Scope 1",
    section: "Livestock",
    type: "Poultry (number of head)",
    units: "head",
    co2e: 2.3946,
    unit: "Eur",
    ref: "Exiobase Australia",
    year: 2021
  },
  {
    id: "16",
    scope: "Scope 2",
    section: "Electricity",
    type: "Total Electricity Bill (kWh)",
    units: "Kwh",
    co2e: 0.774,
    unit: "Kwh",
    ref: "Malaysia Energy Comission (2023)",
    year: 2023
  },
  {
    id: "17",
    scope: "Scope 2",
    section: "Electricity",
    type: "Total Solar Generation (kWh)",
    units: "Kwh",
    co2e: 0.774,
    unit: "Kwh",
    ref: "Malaysia Energy Comission (2023)",
    year: 2023
  },
  {
    id: "18",
    scope: "Scope 2",
    section: "Electricity",
    type: "Total Solar Injected to Grid (kWh)",
    units: "Kwh",
    co2e: 0.774,
    unit: "Kwh",
    ref: "Malaysia Energy Comission (2023)",
    year: 2023
  },
  {
    id: "19",
    scope: "Scope 2",
    section: "Electricity",
    type: "Total Green Electricity Tarif Purchased (kWh)",
    units: "Kwh",
    co2e: 0.774,
    unit: "Kwh",
    ref: "Malaysia Energy Comission (2023)",
    year: 2023
  },
  {
    id: "20",
    scope: "Scope 3",
    section: "Waste (Solid)",
    type: "Solid Waste (Landfill)",
    units: "Kg",
    co2e: 520.335,
    unit: "Tonne",
    ref: "GHG Protocol 2025 Condensed Set",
    year: 2025
  },
  {
    id: "21",
    scope: "Scope 3",
    section: "Waste (Solid)",
    type: "Food Waste",
    units: "Kg",
    co2e: 655.987,
    unit: "Tonne",
    ref: "GHG Protocol 2025 Condensed Set",
    year: 2025
  },
  {
    id: "22",
    scope: "Scope 3",
    section: "Waste (Solid)",
    type: "Kitar Semula",
    units: "Kg",
    co2e: 90,
    unit: "Tonne",
    ref: "EPA",
    year: 2021
  },
  {
    id: "23",
    scope: "Scope 3",
    section: "Waste (Solid)",
    type: "Sisa Landskap",
    units: "Kg",
    co2e: 646.607,
    unit: "Tonne",
    ref: "GHG Protocol 2025 Condensed Set",
    year: 2025
  },
  {
    id: "24",
    scope: "Scope 3",
    section: "Water Supply",
    type: "Total Water Purchased (m3)",
    units: "m3",
    co2e: 0.1776,
    unit: "m3",
    ref: "GHG Protocol 2025 Condensed Set",
    year: 2025
  },
  {
    id: "25",
    scope: "Offset",
    section: "Green Space",
    type: "Inland Forest (Acre)",
    units: "Acre",
    co2e: "TBD",
    unit: "Acre",
    ref: "Pending",
    year: 2025
  },
  {
    id: "26",
    scope: "Offset",
    section: "Green Space",
    type: "Palm Oil Area (acre)",
    units: "Acre",
    co2e: "TBD",
    unit: "Acre",
    ref: "Pending",
    year: 2025
  },
  {
    id: "27",
    scope: "Offset",
    section: "Green Space",
    type: "Cocoa Area (acre)",
    units: "Acre",
    co2e: "TBD",
    unit: "Acre",
    ref: "Pending",
    year: 2025
  },
  {
    id: "28",
    scope: "Offset",
    section: "Green Space",
    type: "Rubber Area (acre)",
    units: "Acre",
    co2e: "TBD",
    unit: "Acre",
    ref: "Pending",
    year: 2025
  }
];
