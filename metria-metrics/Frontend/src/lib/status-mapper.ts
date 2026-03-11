/**
 * Utility to map English status strings from various APIs to Spanish display text.
 * This ensures consistency across the platform without breaking backend logic.
 */

export const mapStatus = (status: string | null | undefined): string => {
  if (!status) return "N/A";

  const statusMap: Record<string, string> = {
    // Integration / Connection Statuses
    "Connected": "Conectado",
    "Disconnected": "Desconectado",
    "Disconnected (Error)": "Error de Conexión",
    "active": "Activa",
    "Active": "Activa",
    "inactive": "Inactivo",
    "inactivo": "Inactivo",
    "Paused": "Pausada",
    "Deleted": "Eliminada",

    // Order / Financial Statuses (Shopify)
    "paid": "Pagado",
    "Pagado": "Pagado",
    "pending": "Pendiente",
    "authorized": "Autorizado",
    "partially_paid": "Pago Parcial",
    "refunded": "Reembolsado",
    "Reembolsado": "Reembolsado",
    "voided": "Anulado",
    "partially_refunded": "Reembolso Parcial",

    // Fulfillment Statuses
    "fulfilled": "Completado",
    "unfulfilled": "Pendiente",
    "partial": "Parcial",
    "restocked": "Reabastecido",

    // Logistics Statuses (Dropi/Custom)
    "Entregado": "Entregado",
    "En Tránsito": "En Tránsito",
    "Devuelto": "Devuelto",
    "Pendiente": "Pendiente",
    "Cargando...": "Cargando...",

    // User / Account Statuses
    "Activo": "Activo",
    "Pendiente Invitación": "Pendiente",
    "Viewer": "Visualizador",
    "Operador de Logística": "Operador Logístico",
    "Admin": "Admin",
    "Super Admin": "Super Admin",

    // HTTP / Sys Logs Status
    "200 OK": "200 OK",
    "500 Error": "500 Error",
    "Error": "Error",
    "Success": "Éxito"
  };

  return statusMap[status] || status;
};

/**
 * Returns a CSS class color based on status for consistent UI.
 */
export const getStatusColorClass = (status: string | null | undefined): string => {
  const s = status?.toLowerCase() || "";
  
  // High priority negative statuses (handle disconnected before connected)
  if (s.includes("error") || s.includes("refunded") || s.includes("reembolsado") || s.includes("devuelto") || s.includes("deleted") || s.includes("eliminada") || s.includes("voided") || s.includes("anulado") || s.includes("disconnected") || s.includes("desconectado")) {
    return "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20";
  }

  // Positive statuses
  if (s.includes("paid") || s.includes("pagado") || s.includes("connected") || s.includes("conectado") || s.includes("active") || s.includes("activa") || s.includes("entregado") || s.includes("success") || s.includes("activo")) {
    return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20";
  }
  
  // Warning/Pending statuses
  if (s.includes("pending") || s.includes("pendiente") || s.includes("paused") || s.includes("pausada") || s.includes("transito") || s.includes("partial") || s.includes("parcial")) {
    return "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20";
  }
  
  return "bg-muted text-muted-foreground border-transparent";
};
