"use client"

import * as React from "react"
import { Download, FileText, Table, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDateRangeStore } from "@/store/useDateRangeStore"
import { format } from "date-fns"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import html2canvas from "html2canvas"
import { usePathname } from "next/navigation"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const CLIENT_NAME = "ClienteDemo" // Se puede cambiar o traer del auth store global en el futuro

export function ExportButton() {
    const { date } = useDateRangeStore()
    const pathname = usePathname()
    const [isExporting, setIsExporting] = React.useState(false)

    const startStr = date?.from ? format(date.from, "yyyy-MM-dd") : "inicio"
    const endStr = date?.to ? format(date.to, "yyyy-MM-dd") : "fin"

    // Determinar contexto basado en la ruta actual
    const getContextInfo = () => {
        if (pathname?.includes("/finances")) return { title: "Finanzas E-commerce", slug: "finances" }
        if (pathname?.includes("/logistics")) return { title: "Logística y Operaciones", slug: "logistics" }
        if (pathname?.includes("/marketing")) return { title: "Marketing y Ads", slug: "marketing" }
        if (pathname?.includes("/sales")) return { title: "Canales de Venta", slug: "sales" }
        return { title: "Centro de Control (Dashboard)", slug: "dashboard" }
    }

    const { title, slug } = getContextInfo()
    const filename = `Metria_${CLIENT_NAME}_${slug}_${startStr}_al_${endStr}`

    // Determinar data simulada basado en la ruta actual (idealmente viene de store global o DB)
    const getContextData = () => {
        if (slug === "finances") {
            return [
                { id: "SHOP-PLAN", categoria: "Suscripción", monto: "$39.00" },
                { id: "HOG-001-A", categoria: "Alertas Margen", monto: "18%" },
            ]
        }
        if (slug === "logistics") {
            return [
                { guia: "DRP-9812", estado: "Entregado", cliente: "Ana Martínez", ciudad: "Bogotá", recaudo: "$45.00" },
                { guia: "DRP-9813", estado: "En Tránsito", cliente: "Carlos Gómez", ciudad: "Medellín", recaudo: "$120.00" },
            ]
        }
        if (slug === "marketing") {
            return [
                { campana: "Retargeting DCO", estado: "Activado", spend: "$450.00", roas: "3.2x" },
                { campana: "Broad UGC", estado: "Activado", spend: "$1,200.00", roas: "1.8x" },
            ]
        }
        if (slug === "sales") {
            return [
                { orden: "#1042", cliente: "María Gómez", estado: "Pagado", envio: "Preparando", total: "$45.00" },
                { orden: "#1041", cliente: "Juan Pérez", estado: "Pendiente", envio: "No preparado", total: "$120.00" },
            ]
        }
        // Dashboard genérico
        return [
            { fecha: startStr, tipo: "Ventas", valor: 4000, costo: 1200, roas: 3.3 },
            { fecha: endStr, tipo: "Ventas", valor: 4500, costo: 1400, roas: 3.2 }
        ]
    }

    const triggerDownload = (blob: Blob, ext: string) => {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${filename}.${ext}`
        a.style.display = "none"
        document.body.appendChild(a)

        // Evadir Next.js
        const event = new MouseEvent("click", {
            view: window,
            bubbles: true,
            cancelable: true
        })
        a.dispatchEvent(event)

        setTimeout(() => {
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        }, 150)
    }

    const handleExportCSV = () => {
        const data = getContextData()
        if (data.length === 0) return

        const csvRows = []
        const headers = Object.keys(data[0])
        csvRows.push(headers.join(","))

        for (const row of data) {
            const values = headers.map(header => {
                const val = row[header as keyof typeof row]
                const escaped = ('' + val).replace(/"/g, '\\"')
                return `"${escaped}"`
            })
            csvRows.push(values.join(","))
        }

        const csvString = csvRows.join("\n")
        const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" })
        triggerDownload(blob, "csv")
    }

    const handleExportPDF = async () => {
        setIsExporting(true)
        try {
            // 1. Inicializar documento PDF
            const doc = new jsPDF({ orientation: "landscape", unit: "px", format: [1280, 800] })

            // 2. Título principal
            doc.setFontSize(24)
            doc.setTextColor(20, 30, 40)
            doc.text(`Reporte: ${title} - ${CLIENT_NAME}`, 30, 40)
            doc.setFontSize(14)
            doc.setTextColor(100, 110, 120)
            doc.text(`Periodo: ${startStr} al ${endStr}`, 30, 60)

            // 3. Capturar DOM Element (<main id="dashboard-content">)
            const targetElement = document.getElementById("dashboard-content")

            if (targetElement) {
                // Clonar estilos ocultos temporalmente si es necesario, 
                // html2canvas soporta la vista tal cual está renderizada.
                const canvas = await html2canvas(targetElement, {
                    scale: 2, // Mejor resolución para PDF
                    useCORS: true,
                    backgroundColor: null, // Mantener fondo transparente/blanco
                    logging: false
                })

                const imgData = canvas.toDataURL('image/png')

                // Configurar dimensiones para que calce bien en horizontal (landscape mode)
                // doc.internal.pageSize.getWidth() es approx 1280 (porque lo forzamos arriba)
                const pdfWidth = doc.internal.pageSize.getWidth() - 60 // 30px margen x 2
                // Calcular altura respetando aspect ratio
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width

                // Agregar la imagen de los gráficos justo debajo del título (margen Y 80)
                doc.addImage(imgData, 'PNG', 30, 80, pdfWidth, pdfHeight)
            } else {
                // Fallback a tabla si por alguna razón no se encontró el DOM.
                const data = getContextData()
                if (data.length > 0) {
                    const head = [Object.keys(data[0]).map(k => k.toUpperCase())]
                    const body = data.map(item => Object.values(item).map(v => String(v)))
                    autoTable(doc, {
                        startY: 80,
                        head: head,
                        body: body,
                        theme: "grid",
                        headStyles: { fillColor: [41, 128, 185] },
                    })
                }
            }

            // 4. Transformar a Blob y disparar descarga nativa evadiendo Next.js
            const pdfBlob = doc.output("blob")
            triggerDownload(pdfBlob, "pdf")

        } catch (error) {
            console.error("Error generating PDF:", error)
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="default"
                    disabled={isExporting}
                    className="bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-all font-medium min-w-[120px]"
                >
                    {isExporting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Download className="mr-2 h-4 w-4" />
                    )}
                    {isExporting ? "Generando..." : "Exportar"}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
                <DropdownMenuItem onClick={handleExportCSV} className="cursor-pointer">
                    <Table className="mr-2 h-4 w-4" />
                    <span>Exportar CSV</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
                    <FileText className="mr-2 h-4 w-4" />
                    <span>Exportar PDF</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
