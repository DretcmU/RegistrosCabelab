import { db, functions } from "./firebase.js";
import { getDocs, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {ocultarLoading, mostrarLoading} from "./extras.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const obtenerRegistroConFirmas = httpsCallable(functions, "obtenerRegistroConFirmas");
const enviarPDFBackend = httpsCallable(functions, "enviarReportePDF");

async function cargarImagenGIT(url) {
  const res = await fetch(url);
  const blob = await res.blob();

  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}


window.sendPDF = async (docId, toEmail) => {
  mostrarLoading("Enviando PDF...");
  try{
    await enviarPDFBackend({docId, toEmail});
      alert("✅ PDF enviado");      

  }catch (err) {
    
    console.error(err);
    alert("❌ Error al enviar el PDF");
  }
  
  ocultarLoading();
}

window.exportarPDF = async (docId) => {
  try{
    mostrarLoading("Exportando a PDF...");

    const result = await obtenerRegistroConFirmas({ docId });
    const d = result.data;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    // ===== LOGO IZQUIERDA =====
    let urlLogo = "https://raw.githubusercontent.com/DretcmU/RegistrosCabelab/b14272afab90b283aa9b311901c85650f399d31d/logo_cabelab.png";
    const logo = await cargarImagenGIT(urlLogo);
    pdf.addImage(logo, "PNG", 10, 5, 70, 22);

    // ===== EMPRESA DERECHA =====
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("CABELAB S.A.C. - SERVICIO AUTORIZADO ESAB", 110, 10);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Av. Venezuela 866 - Urb. Santa Isabel La Perla", 110, 15);
    pdf.text("AREQUIPA - PERÚ", 110, 20);
    pdf.text("ventas@cabelab.com | +51 919007755", 110, 25);

    // ===== TITULO CENTRO =====
    const nro = 1000 + d.nro_formato;
    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    pdf.text(`FORMATO DE RECEPCIÓN N° ${nro}`, 105, 35, { align: "center" });

    // ===== DATOS CLIENTE =====
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);

    let y = 45;
    const fechaObj = new Date(d.fecha);
    const diaMesAnio = fechaObj.toLocaleDateString(); // Formato local: dd/mm/yyyy
    const horaMin = fechaObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); // Formato: hh:mm

    pdf.text(`Fecha: ${diaMesAnio}, Hora: ${horaMin}`, 10, y); y+=5;
    //pdf.text(`Fecha: ${new Date(d.fecha).toLocaleString()}`, 10, y); y+=5;
    pdf.text(`Cliente: ${d.cliente}`, 10, y); y+=5;
    pdf.text(`RUC/DNI: ${d.ruc}`, 10, y); y+=5;
    pdf.text(`Dirección: ${d.direccion}`, 10, y); y+=5;
    pdf.text(`Correo: ${d.correo}`, 10, y); y+=5;
    pdf.text(`Responsable: ${d.responsable}`, 10, y); y+=5;
    pdf.text(`Teléfono: ${d.telefono}`, 10, y); y+=5;
    pdf.text(`Guía Remisión: ${d.guia}`, 10, y); y+=10;

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("Equipos:", 10, y);
    y = y + 5;
    // ===== TABLA EQUIPOS =====
    const equipos = d.equipos || [];
    const equiposData = equipos.map((e,i)=>[
      i+1, e.cant, e.marca, e.modelo, e.descripcion, e.serie, e.servicio, e.falla
    ]);

    pdf.autoTable({
      startY: y,
      head: [["Item","Cant","Marca","Modelo","Descripción","Serie","Servicio","Falla"]],
      body: equiposData,

      styles: {
        fontSize: 8,
        lineWidth: 0.2,
        lineColor: [0,0,0],
        overflow: "linebreak",   // ✅ salto de línea
        cellWidth: "wrap"         // ✅ no se sale del cuadro
      },

      headStyles: {
        fillColor: [0,0,0],       // fondo negro
        textColor: 255,            // texto blanco
        fontStyle: "bold",
        lineWidth: 0.3,
        lineColor: [0,0,0]
      },

      columnStyles: {
        0: { cellWidth: 10 },   // Item
        1: { cellWidth: 10 },  // Cant
        2: { cellWidth: 25 },  // Marca
        3: { cellWidth: 30 },  // Modelo
        4: { cellWidth: 40 },  // Descripción
        5: { cellWidth: 25 },  // Serie
        6: { cellWidth: 20 },  // Servicio
        7: { cellWidth: 20 }   // Falla
      }
    });

    // ===== TABLA ACCESORIOS =====
    let y2 = pdf.lastAutoTable.finalY + 10;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("Accesorios:", 10, y2);
    y2 = y2 + 5;

    const accData = equipos.map((e,i)=>[
      i+1, e.accesorio || "", e.obs || ""
    ]);

    pdf.autoTable({
      startY: y2,
      head: [["Item","Accesorio","Observaciones"]],
      body: accData,

      styles: {
        fontSize: 8,
        overflow: "linebreak",
        cellWidth: "wrap",
        lineWidth: 0.2,
        lineColor: [0,0,0]
      },

      headStyles: {
        fillColor: [0,0,0],
        textColor: 255,
        fontStyle: "bold"
      },

      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 70 },
        2: { cellWidth: 100 }
      }
    });

    // ===== NOTA =====
    let y3 = pdf.lastAutoTable.finalY + 10;
    let nota = "NOTA: Transcurrido un año desde la fecha de recepción, la empresa no se hace responsable por deterioro o pérdida del equipo. Todo reclamo posterior queda sin efecto.";
    let notaLines = pdf.splitTextToSize(nota, 230);
    pdf.setFontSize(8);
    pdf.text(notaLines, 10, y3);

    // ===== FIRMAS =====
    let y4 = y3 + 15;

    if (y4 > 260) {
      pdf.addPage();
      y4 = 20;
    }

    pdf.addImage(d.firmaTecnicoBase64, "PNG", 20, y4, 50, 20);
    pdf.addImage(d.firmaClienteBase64, "PNG", 120, y4, 50, 20);

    // ===== LINEAS =====
    pdf.setLineWidth(0.5); // grosor línea
    pdf.line(20, y4 + 22, 75, y4 + 22);   // técnico
    pdf.line(120, y4 + 22, 170, y4 + 22); // cliente

    pdf.text("firma del encargado de recepción", 25, y4 + 25);
    pdf.text("Firma del cliente responsable", 125, y4 + 25);

    // ===== GUARDAR =====
    pdf.save(`Formato_${nro}.pdf`);

    ocultarLoading();
  }catch (err) {
    ocultarLoading();
    console.error(err);
    alert("❌ Error al generar el PDF");
  }
};


window.exportarExcel = async () => {

  mostrarLoading("Exportando todo a Exce...");

  try{
    const snapshot = await getDocs(collection(db, "registros"));

    let registros = [];

    snapshot.forEach(docu => {
      const d = docu.data();
      registros.push(d);
    });

    // ===== ORDENAR POR ID =====
    registros.sort((a, b) => (a.nro_formato || 0) - (b.nro_formato || 0));

    const clientes = [];
    const detalles = [];

    registros.forEach(d => {

      const idFormato = 1000 + (d.nro_formato || 0);

      const fecha = d.fecha?.seconds
        ? new Date(d.fecha.seconds * 1000).toLocaleDateString()
        : "";

      // HOJA CLIENTES
      clientes.push({
        ID: idFormato,
        Cliente: d.cliente || "",
        Fecha: fecha,
        RUC: d.ruc || "",
        Correo: d.correo || "",
        Telefono: d.telefono || "",
        Direccion: d.direccion || "",
        Guia: d.guia || "",
        Responsable: d.responsable || ""
      });

      // HOJA EQUIPOS
      (d.equipos || []).forEach((e, i) => {
        detalles.push({
          ID: idFormato,
          Item: i + 1,
          Cant: e.cant || "",
          Marca: e.marca || "",
          Modelo: e.modelo || "",
          Descripcion: e.descripcion || "",
          Serie: e.serie || "",
          Servicio: e.servicio || "",
          Falla: e.falla || "",
          Accesorios: e.accesorio || "",
          Observaciones: e.obs || ""
        });
      });

    });

    // Crear Excel
    const wb = XLSX.utils.book_new();

    const wsClientes = XLSX.utils.json_to_sheet(clientes);
    const wsDetalles = XLSX.utils.json_to_sheet(detalles);

    XLSX.utils.book_append_sheet(wb, wsClientes, "Clientes");
    XLSX.utils.book_append_sheet(wb, wsDetalles, "Equipos");

    XLSX.writeFile(wb, "registros.xlsx");
    ocultarLoading();
    alert("✅ Excel generado"); 
  }catch (err) {
    ocultarLoading();
    console.error(err);
    alert("❌ Error al generar el Excel.");
  }
};