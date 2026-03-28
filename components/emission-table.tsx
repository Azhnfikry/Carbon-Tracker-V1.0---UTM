"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Search, MoreHorizontal, Edit, Trash2, FileText, CheckSquare, Square } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { formatEmissions } from "@/lib/emission-calculations"
import type { EmissionEntry } from "@/types/emission"
import type { User } from "@supabase/supabase-js"

interface EmissionTableProps {
  entries: EmissionEntry[]
  onDataChange: () => void
  user: User | null // Made user optional
}

export function EmissionTable({ entries, onDataChange, user }: EmissionTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const supabase = createClient()

  const filteredEntries = entries.filter(
    (entry) =>
      entry.activity_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.scope.toString().includes(searchTerm.toLowerCase()) ||
      entry.quantity.toString().includes(searchTerm.toLowerCase()) ||
      entry.unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.co2_equivalent.toString().includes(searchTerm.toLowerCase()) ||
      new Date(entry.date).toLocaleDateString().toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredEntries.length && filteredEntries.length > 0) {
      setSelectedIds(new Set())
    } else {
      const allIds = new Set(filteredEntries.map((e) => e.id).filter((id) => !id.startsWith("demo-")))
      setSelectedIds(allIds)
    }
  }

  const handleDelete = async (id: string) => {
    if (!user) {
      alert("Please login to delete entries.")
      return
    }

    if (!confirm("Are you sure you want to delete this entry?")) return

    setIsLoading(true)
    try {
      const { error } = await supabase.from("emissions").delete().eq("id", id).eq("user_id", user.id)

      if (error) throw error
      onDataChange()
    } catch (error) {
      console.error("Error deleting entry:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBulkDelete = async () => {
    if (!user) {
      alert("Please login to delete entries.")
      return
    }

    if (selectedIds.size === 0) {
      alert("Please select entries to delete.")
      return
    }

    if (!confirm(`Are you sure you want to delete ${selectedIds.size} selected entries?`)) return

    setIsLoading(true)
    try {
      const idsArray = Array.from(selectedIds)
      console.log("Attempting to delete IDs:", idsArray)
      
      // Delete entries one by one to avoid issues with the in() operator
      let deletedCount = 0
      let failedCount = 0

      for (const id of idsArray) {
        try {
          const { error } = await supabase
            .from("emissions")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id)

          if (error) {
            console.error(`Failed to delete ${id}:`, error)
            failedCount++
          } else {
            deletedCount++
          }
        } catch (err) {
          console.error(`Error deleting ${id}:`, err)
          failedCount++
        }
      }

      console.log(`Deleted: ${deletedCount}, Failed: ${failedCount}`)

      if (deletedCount > 0) {
        setSelectedIds(new Set())
        onDataChange()
        alert(`Successfully deleted ${deletedCount} entries${failedCount > 0 ? `. Failed to delete ${failedCount} entries.` : "."}`)
      } else if (failedCount > 0) {
        alert("Failed to delete all selected entries. Please try again.")
      }
    } catch (error) {
      console.error("Error during bulk delete:", error)
      alert("Failed to delete entries. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const getScopeBadgeColor = (scope: number) => {
    switch (scope) {
      case 1:
        return "bg-chart-1/10 text-chart-1 border-chart-1/20"
      case 2:
        return "bg-chart-2/10 text-chart-2 border-chart-2/20"
      case 3:
        return "bg-chart-3/10 text-chart-3 border-chart-3/20"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            All Emission Entries
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {selectedIds.size > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">
              {selectedIds.size} entry{selectedIds.size > 1 ? "ies" : ""} selected
            </span>
            <Button
              onClick={handleBulkDelete}
              disabled={isLoading}
              variant="destructive"
              size="sm"
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete Selected
            </Button>
          </div>
        )}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {user && <TableHead className="w-[40px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleSelectAll}
                    className="p-0"
                  >
                    {selectedIds.size === filteredEntries.length && filteredEntries.length > 0 ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </Button>
                </TableHead>}
                <TableHead>Date</TableHead>
                <TableHead>Activity Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>CO₂e</TableHead>
                <TableHead>CO₂</TableHead>
                <TableHead>CH₄</TableHead>
                <TableHead>N₂O</TableHead>
                <TableHead>Description</TableHead>
                {user && <TableHead className="w-[50px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={user ? 12 : 11} className="text-center py-8 text-muted-foreground">
                    {searchTerm
                      ? "No entries match your search."
                      : !user
                        ? "Demo data shown. Login to see your own entries."
                        : "No emission entries found. Add your first entry!"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredEntries.map((entry) => (
                  <TableRow key={entry.id} className={selectedIds.has(entry.id) ? "bg-blue-50" : ""}>
                    {user && !entry.id.startsWith("demo-") && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSelect(entry.id)}
                          className="p-0"
                        >
                          {selectedIds.has(entry.id) ? (
                            <CheckSquare className="h-4 w-4 text-blue-600" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    )}
                    {user && entry.id.startsWith("demo-") && <TableCell></TableCell>}
                    <TableCell className="font-medium">{new Date(entry.date).toLocaleDateString()}</TableCell>
                    <TableCell>{entry.activity_type}</TableCell>
                    <TableCell>{entry.category}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getScopeBadgeColor(entry.scope)}>
                        Scope {entry.scope}
                      </Badge>
                    </TableCell>
                    <TableCell>{entry.quantity.toFixed(2)}</TableCell>
                    <TableCell>{entry.unit}</TableCell>
                    <TableCell className="font-medium">{formatEmissions(entry.co2_equivalent)}</TableCell>
                    <TableCell className="text-sm">{entry.co2 ? `${entry.co2.toFixed(4)} kg` : "-"}</TableCell>
                    <TableCell className="text-sm">{entry.ch4 ? `${entry.ch4.toFixed(6)} kg` : "-"}</TableCell>
                    <TableCell className="text-sm">{entry.n2o ? `${entry.n2o.toFixed(6)} kg` : "-"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{entry.description || "-"}</TableCell>
                    {user && (
                      <TableCell>
                        {!entry.id.startsWith("demo-") ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" disabled={isLoading}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(entry.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-xs text-muted-foreground">Demo</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
