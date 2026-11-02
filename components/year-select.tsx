"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface YearSelectProps {
  // "overall" or a four-digit year
  value: string
  // Years with data, newest first
  years: string[]
  onChange: (value: string) => void
}

export function YearSelect({ value, years, onChange }: YearSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-40" aria-label="Reporting period">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="overall">Overall</SelectItem>
        {years.map((year) => (
          <SelectItem key={year} value={year}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
