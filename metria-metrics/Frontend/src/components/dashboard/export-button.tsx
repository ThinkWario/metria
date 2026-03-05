"use client"

import * as React from "react"
import { Download, FileText, Table } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDateRangeStore } from "@/store/useDateRangeStore"
import { format } from "date-fns"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const CLIENT_NAME = "ClienteDemo" // Se puede cambiar o traer del auth store global en el futuro

export function ExportButton() {
    const { date } = useDateRangeStore()

    const startStr = date?.from ? format(date.from, "yyyy-MM-dd") : "inicio"
    const endStr = date?.to ? format(date.to, "yyyy-MM-dd") : "fin"
    const filename = `Metria_${CLIENT_NAME}_${startStr}_al_${endStr}`

    // Data mock (Esto debería venir idealmente de un hook de fetch / store)
    const mockData = React.useMemo(() => [
        { fecha: startStr, tipo: "Ventas", valor: 4000, costo: 1200, roas: 3.3 },
        { fecha: endStr, tipo: "Ventas", valor: 4500, costo: 1400, roas: 3.2 }
    ], [startStr, endStr])

    const { csvUrl, pdfUrl } = React.useMemo(() => {
        // --- Generar CSV Data URL ---
        const csvRows = []
        const headers = Object.keys(mockData[0])
        csvRows.push(headers.join(","))

        for (const row of mockData) {
            const values = headers.map(header => {
                const val = row[header as keyof typeof row]
                const escaped = ('' + val).replace(/"/g, '\\"')
                return `"${escaped}"`
            })
            csvRows.push(values.join(","))
        }

        const csvString = csvRows.join("\n")
        const csvUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csvString)}`

        // --- Generar PDF Data URL ---
        const doc = new jsPDF({ orientation: "landscape" })
        doc.setFontSize(18)
        doc.text(`Reporte de Métricas - ${CLIENT_NAME}`, 14, 22)
        doc.setFontSize(11)
        doc.setTextColor(100)
        doc.text(`Periodo: ${startStr} al ${endStr}`, 14, 30)

        const head = [["Fecha", "Tipo", "Valor ($)", "Costo ($)", "ROAS"]]
        const body = mockData.map(item => [
            item.fecha,
            item.tipo,
            `$${item.valor}`,
            `$${item.costo}`,
            `${item.roas}x`
        ])

        autoTable(doc, {
            startY: 40,
            head: head,
            body: body,
            theme: "grid",
            headStyles: { fillColor: [41, 128, 185] },
        })

        const pdfUrl = doc.output("datauristring")

        return { csvUrl, pdfUrl }
    }, [mockData, startStr, endStr])

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="default"
                    className="bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-all font-medium"
                >
                    <Download className="mr-2 h-4 w-4" />
                    Exportar
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
                <DropdownMenuItem asChild className="cursor-pointer">
                    <a href={csvUrl} download={`${filename}.csv`} className="flex items-center w-full">
                        <Table className="mr-2 h-4 w-4" />
                        <span>Exportar CSV</span>
                    </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer">
                    <a href={pdfUrl} download={`${filename}.pdf`} className="flex items-center w-full">
                        <FileText className="mr-2 h-4 w-4" />
                        <span>Exportar PDF</span>
                    </a>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
