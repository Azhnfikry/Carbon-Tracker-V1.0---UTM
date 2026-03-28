'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Download, Filter } from 'lucide-react'
import { emissionFactors, EMISSION_SCOPES, type EmissionFactor } from '@/lib/emission-factors'

export function EmissionFactorsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedScope, setSelectedScope] = useState<string>('all')
  const [selectedSection, setSelectedSection] = useState<string>('all')

  // Get unique sections
  const sections = Array.from(new Set(emissionFactors.map(f => f.section)))

  // Filter factors
  const filteredFactors = emissionFactors.filter(factor => {
    const matchesSearch = 
      factor.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      factor.section.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesScope = selectedScope === 'all' || factor.scope === selectedScope
    const matchesSection = selectedSection === 'all' || factor.section === selectedSection

    return matchesSearch && matchesScope && matchesSection
  })

  // Group by scope and section
  const groupedFactors = filteredFactors.reduce((acc, factor) => {
    const key = `${factor.scope}|${factor.section}`
    if (!acc[key]) {
      acc[key] = {
        scope: factor.scope,
        section: factor.section,
        factors: []
      }
    }
    acc[key].factors.push(factor)
    return acc
  }, {} as Record<string, { scope: string; section: string; factors: EmissionFactor[] }>)

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['ID', 'Scope', 'Section', 'Type', 'Units', 'CO2e', 'CO2', 'CH4', 'NO2', 'Unit', 'Reference', 'Year']
    const rows = filteredFactors.map(f => [
      f.id,
      f.scope,
      f.section,
      f.type,
      f.units,
      f.co2e,
      f.co2 || '',
      f.ch4 || '',
      f.no2 || '',
      f.unit,
      f.ref,
      f.year || ''
    ])

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'emission-factors.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Emission Factors Database</h2>
          <p className="text-muted-foreground mt-1">
            Comprehensive emission factors for GHG accounting (Scope 1, 2, 3 & Offsets)
          </p>
        </div>
        <Button
          onClick={handleExportCSV}
          className="bg-green-600 hover:bg-green-700 gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Filters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="space-y-2">
            <Label>Search by Type or Section</Label>
            <Input
              placeholder="e.g., Diesel, Electricity..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Scope Filter */}
          <div className="space-y-2">
            <Label>Scope</Label>
            <select
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
            >
              <option value="all">All Scopes</option>
              <option value="Scope 1">Scope 1 (Direct)</option>
              <option value="Scope 2">Scope 2 (Indirect Energy)</option>
              <option value="Scope 3">Scope 3 (Other Indirect)</option>
              <option value="Offset">Offset</option>
            </select>
          </div>

          {/* Section Filter */}
          <div className="space-y-2">
            <Label>Section</Label>
            <select
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
            >
              <option value="all">All Sections</option>
              {sections.map(section => (
                <option key={section} value={section}>{section}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Result Count */}
        <div className="text-sm text-muted-foreground pt-2">
          Showing {filteredFactors.length} of {emissionFactors.length} factors
        </div>
      </Card>

      {/* Factors List */}
      <div className="space-y-8">
        {Object.entries(groupedFactors).map(([key, group]) => (
          <div key={key}>
            {/* Scope & Section Header */}
            <div className="mb-4 pb-3 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">{group.scope}</h3>
              <p className="text-sm text-muted-foreground">{group.section}</p>
            </div>

            {/* Factors Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.factors.map(factor => (
                <Card key={factor.id} className="p-4 space-y-3 hover:shadow-lg transition-shadow">
                  {/* Type & Units */}
                  <div>
                    <h4 className="font-semibold text-foreground text-sm leading-tight">
                      {factor.type}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Unit: <span className="font-medium">{factor.units}</span>
                    </p>
                  </div>

                  {/* Main Emission Factor */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-3">
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-muted-foreground">CO2e Emission Factor</p>
                        <p className="text-2xl font-bold text-green-600">
                          {typeof factor.co2e === 'number' ? factor.co2e.toFixed(5) : factor.co2e}
                        </p>
                        <p className="text-xs text-muted-foreground">{factor.unit}</p>
                      </div>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {factor.co2 && factor.co2 !== 'N/A' && (
                      <div className="bg-slate-100 dark:bg-slate-800 rounded p-2">
                        <p className="text-muted-foreground">CO2</p>
                        <p className="font-semibold text-foreground">
                          {typeof factor.co2 === 'number' ? factor.co2.toFixed(5) : factor.co2}
                        </p>
                      </div>
                    )}
                    {factor.ch4 && factor.ch4 !== 'N/A' && (
                      <div className="bg-slate-100 dark:bg-slate-800 rounded p-2">
                        <p className="text-muted-foreground">CH4</p>
                        <p className="font-semibold text-foreground">
                          {typeof factor.ch4 === 'number' ? factor.ch4.toFixed(5) : factor.ch4}
                        </p>
                      </div>
                    )}
                    {factor.no2 && factor.no2 !== 'N/A' && (
                      <div className="bg-slate-100 dark:bg-slate-800 rounded p-2">
                        <p className="text-muted-foreground">N2O</p>
                        <p className="font-semibold text-foreground">
                          {typeof factor.no2 === 'number' ? factor.no2.toFixed(5) : factor.no2}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Reference & Year */}
                  <div className="pt-2 border-t border-border space-y-1">
                    <p className="text-xs">
                      <span className="text-muted-foreground">Ref:</span>{' '}
                      <span className="font-medium text-foreground">{factor.ref}</span>
                    </p>
                    {factor.year && (
                      <p className="text-xs">
                        <span className="text-muted-foreground">Year:</span>{' '}
                        <span className="font-medium text-foreground">{factor.year}</span>
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredFactors.length === 0 && (
        <Alert className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            No emission factors found matching your filters. Try adjusting your search criteria.
          </AlertDescription>
        </Alert>
      )}

      {/* Info Box */}
      <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          <p className="font-semibold mb-2">About This Database</p>
          <ul className="text-sm space-y-1 list-disc list-inside">
            <li>Contains 28 comprehensive emission factors for Scope 1, 2, 3 and Offsets</li>
            <li>Based on GHG Protocol standards and latest government/international references</li>
            <li>Includes CO2, CH4, and N2O breakdowns where available</li>
            <li>References and years provided for traceability and updates</li>
            <li>Use the Export CSV button to download all factors for external tracking</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  )
}
