"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, MoreHorizontal, Edit, Trash2, FileText, CheckSquare, Square, Users, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { formatEmissions } from "@/lib/emission-calculations"
import type { EmissionEntry, StudentCountEntry } from "@/types/emission"
import type { User } from "@supabase/supabase-js"

interface EmissionTableProps {
  entries: EmissionEntry[]
  studentEntries: StudentCountEntry[]
  onDataChange: () => void
  user: User | null // Made user optional
}

export function EmissionTable({ entries, studentEntries, onDataChange, user }: EmissionTableProps) {
  const [activeTable, setActiveTable] = useState("emissions")
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [studentForm, setStudentForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    students: "",
    description: "",
  })
  const supabase = createClient()

  const filteredStudentEntries = studentEntries.filter(
    (entry) =>
      entry.students.toString().includes(searchTerm.toLowerCase()) ||
      entry.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      new Date(entry.date).toLocaleDateString().toLowerCase().includes(searchTerm.toLowerCase()),
  )

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

  const handleAddStudentEntry = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) {
      alert("Please login to add student counts.")
      return
    }

    const students = Number(studentForm.students)
    if (!studentForm.date || !Number.isFinite(students) || students < 0) {
      alert("Please enter a valid date and student number.")
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase.from("student_counts").insert([
        {
          user_id: user.id,
          date: studentForm.date,
          students: Math.round(students),
          description: studentForm.description || null,
        },
      ])

      if (error) throw error
      setStudentForm({
        date: new Date().toISOString().slice(0, 10),
        students: "",
        description: "",
      })
      onDataChange()
    } catch (error) {
      console.error("Error adding student count:", error)
      alert("Failed to add student count. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteStudentEntry = async (id: string) => {
    if (!user) {
      alert("Please login to delete student counts.")
      return
    }

    if (!confirm("Are you sure you want to delete this student count?")) return

    setIsLoading(true)
    try {
      const { error } = await supabase.from("student_counts").delete().eq("id", id).eq("user_id", user.id)

      if (error) throw error
      onDataChange()
    } catch (error) {
      console.error("Error deleting student count:", error)
      alert("Failed to delete student count. Please try again.")
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="flex items-center gap-2">
            {activeTable === "emissions" ? <FileText className="h-5 w-5" /> : <Users className="h-5 w-5" />}
            {activeTable === "emissions" ? "All Emission Entries" : "Student Numbers"}
          </CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Tabs
              value={activeTable}
              onValueChange={(value) => {
                setActiveTable(value)
                setSearchTerm("")
                setSelectedIds(new Set())
              }}
            >
              <TabsList>
                <TabsTrigger value="emissions">GHG Entries</TabsTrigger>
                <TabsTrigger value="students">Students</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={activeTable === "emissions" ? "Search entries..." : "Search student records..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activeTable === "students" && user && (
          <form
            onSubmit={handleAddStudentEntry}
            className="mb-4 grid grid-cols-1 gap-3 rounded-lg border bg-muted/20 p-4 md:grid-cols-[180px_180px_1fr_auto]"
          >
            <Input
              type="date"
              value={studentForm.date}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, date: e.target.value }))}
              aria-label="Student count date"
              required
            />
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="Students"
              value={studentForm.students}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, students: e.target.value }))}
              aria-label="Number of students"
              required
            />
            <Input
              placeholder="Description"
              value={studentForm.description}
              onChange={(e) => setStudentForm((prev) => ({ ...prev, description: e.target.value }))}
              aria-label="Student count description"
            />
            <Button type="submit" disabled={isLoading}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </form>
        )}

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
        {activeTable === "students" ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Description</TableHead>
                  {user && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudentEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={user ? 4 : 3} className="text-center py-8 text-muted-foreground">
                      {searchTerm
                        ? "No student records match your search."
                        : !user
                          ? "Demo student data shown. Login to manage your own student counts."
                          : "No student records found. Add your first student count."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStudentEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{new Date(entry.date).toLocaleDateString()}</TableCell>
                      <TableCell>{entry.students.toLocaleString()}</TableCell>
                      <TableCell className="max-w-[360px] truncate">{entry.description || "-"}</TableCell>
                      {user && (
                        <TableCell>
                          {!entry.id.startsWith("demo-") ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isLoading}
                              onClick={() => handleDeleteStudentEntry(entry.id)}
                              aria-label="Delete student count"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
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
        ) : (
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
        )}
      </CardContent>
    </Card>
  )
}
