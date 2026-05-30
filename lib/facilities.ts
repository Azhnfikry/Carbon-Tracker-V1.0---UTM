export type FacilityOption = {
  value: string
  label: string
}

type CompanyFacilityInfo = {
  facility_count?: string | number | null
  facility_address_line_1?: string | null
  facility_postcode?: string | null
  facility_state?: string | null
  facility_2_address_line_1?: string | null
  facility_2_postcode?: string | null
  facility_2_state?: string | null
}

const formatFacilityLabel = (
  facilityName: string,
  address?: string | null,
  postcode?: string | null,
  state?: string | null
) => {
  const details = [address, postcode, state].filter(Boolean).join(", ")
  return details ? `${facilityName} - ${details}` : facilityName
}

export function buildFacilityOptions(companyInfo?: CompanyFacilityInfo | null): FacilityOption[] {
  if (!companyInfo) {
    return [{ value: "Facility 1", label: "Facility 1" }]
  }

  const options: FacilityOption[] = [
    {
      value: "Facility 1",
      label: formatFacilityLabel(
        "Facility 1",
        companyInfo.facility_address_line_1,
        companyInfo.facility_postcode,
        companyInfo.facility_state
      ),
    },
  ]

  if (companyInfo.facility_count?.toString() === "2") {
    options.push({
      value: "Facility 2",
      label: formatFacilityLabel(
        "Facility 2",
        companyInfo.facility_2_address_line_1,
        companyInfo.facility_2_postcode,
        companyInfo.facility_2_state
      ),
    })
  }

  return options
}

