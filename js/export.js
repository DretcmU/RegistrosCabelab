import { db } from "./firebase.js";
import {doc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {ocultarLoading, mostrarLoading} from "./extras.js";

async function cargarImagen(url) {
  const res = await fetch(url);
  const blob = await res.blob();

  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

window.exportarPDF = async (docId) => {
  try{
    mostrarLoading("Exportando a PDF...");
    const docu = await getDoc(doc(db, "registros", docId));
    const d = docu.data();

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    // ===== LOGO IZQUIERDA =====
    let urlLogo = "https://raw.githubusercontent.com/DretcmU/RegistrosCabelab/b14272afab90b283aa9b311901c85650f399d31d/logo_cabelab.png";
    const logo = await cargarImagen(urlLogo);
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
    pdf.text(`Fecha: ${new Date(d.fecha.seconds * 1000).toLocaleString()}`, 10, y); y+=5;
    pdf.text(`Cliente: ${d.cliente}`, 10, y); y+=5;
    pdf.text(`RUC/DNI: ${d.ruc}`, 10, y); y+=5;
    pdf.text(`Dirección: ${d.direccion}`, 10, y); y+=5;
    pdf.text(`Correo: ${d.correo}`, 10, y); y+=5;
    pdf.text(`Responsable: ${d.responsable}`, 10, y); y+=5;
    pdf.text(`Teléfono: ${d.telefono}`, 10, y); y+=5;
    pdf.text(`Guía Remisión: ${d.guia}`, 10, y); y+=10;

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
        0: { cellWidth: 8 },   // Item
        1: { cellWidth: 10 },  // Cant
        2: { cellWidth: 25 },  // Marca
        3: { cellWidth: 30 },  // Modelo
        4: { cellWidth: 40 },  // Descripción
        5: { cellWidth: 25 },  // Serie
        6: { cellWidth: 20 },  // Servicio
        7: { cellWidth: 30 }   // Falla
      }
    });

    // ===== TABLA ACCESORIOS =====
    const y2 = pdf.lastAutoTable.finalY + 10;
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
        1: { cellWidth: 60 },
        2: { cellWidth: 100 }
      }
    });

    // ===== NOTA =====
    let y3 = pdf.lastAutoTable.finalY + 10;
    let nota = "NOTA: Transcurrido un año desde la fecha de recepción, la empresa no se hace responsable por deterioro o pérdida del equipo. Todo reclamo posterior queda sin efecto.";
    let notaLines = pdf.splitTextToSize(nota, 180);
    pdf.setFontSize(8);
    pdf.text(notaLines, 10, y3);

    // ===== FIRMAS =====
    let y4 = y3 + 15;

    if (y4 > 260) {
      pdf.addPage();
      y4 = 20;
    }

    if (d.firma_tecnico) {
      const imgTec = await cargarImagen(d.firma_tecnico);
      pdf.addImage(imgTec, "PNG", 20, y4, 50, 20);
    }

    if (d.firma_cliente) {
      const imgCli = await cargarImagen(d.firma_cliente);
      pdf.addImage(imgCli, "PNG", 120, y4, 50, 20);
    }

    // ===== LINEAS =====
    pdf.setLineWidth(0.5); // grosor línea
    pdf.line(20, y4 + 22, 70, y4 + 22);   // técnico
    pdf.line(120, y4 + 22, 170, y4 + 22); // cliente

    pdf.text("firma del encargado de recepción", 20, y4 + 25);
    pdf.text("Firma del cliente responsable", 120, y4 + 25);

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
  try{
    mostrarLoading("Exportando a Excel...");
    const querySnapshot = await getDocs(collection(db, "registros"));
    const data = [];

    querySnapshot.forEach(docu => {
      const d = docu.data();

      // Equipos en texto
      let equiposTxt = "";
      if (d.equipos) {
        d.equipos.forEach((e, i) => {
          equiposTxt += `${i+1}) ${e.marca} ${e.modelo} ${e.serie} - ${e.servicio}\n`;
        });
      }

      data.push({
        ID: docu.id,
        NRO: d.nro_formato,
        Cliente: d.cliente,
        RUC: d.ruc,
        Dirección: d.direccion,
        Correo: d.correo,
        Responsable: d.responsable,
        Teléfono: d.telefono,
        Guía: d.guia,
        Fecha: d.fecha?.toDate ? d.fecha.toDate().toLocaleString() : d.fecha,
        Equipos: equiposTxt
      });
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registros");

    XLSX.writeFile(wb, "CABELAB_Registros.xlsx");
    ocultarLoading();
  } catch(err){
    ocultarLoading();
    console.error(err);
    alert("Hubo un error al exportar el Excel.");
  }
};