import { db } from "./firebase.js";
import { collection, addDoc, getDocs, deleteDoc, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { DESCRIPCIONES, MARCAS, SERVICIOS, ocultarLoading, mostrarLoading } from "./extras.js";
import { runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { query, orderBy, limit, startAfter} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let editandoID = null;
let registrosCache = []; // para el buscador
let registrosGlobales = [];
let ultimoDoc = null;
let primerDoc = null;
const LIMITE = 10;


async function obtenerNumeroFormato() {
  const contadorRef = doc(db, "config", "contador");

  const nro = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(contadorRef);

    let nuevo;

    if (!snap.exists()) {
      nuevo = 1;
      transaction.set(contadorRef, { nro: nuevo });
    } else {
      nuevo = snap.data().nro + 1;
      transaction.update(contadorRef, { nro: nuevo });
    }

    return nuevo;
  });

  return nro;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    //alert("No autorizado");
    window.location.href = "index.html"; // volver a login
  } else {
    await cargarTodosRegistros();   // 👈 cargar TODO
    console.log("Usuario logeado:", user.email);
    cargarClientes(); // cargar datos SOLO si está logeado
  }
});

window.cerrarSesion = async () => {
  await signOut(auth);
  window.location.href = "index.html"; // tu página login
};


async function cargarClientes() {
  const q = query(
    collection(db, "registros"),
    orderBy("nro_formato", "desc"),
    limit(LIMITE)
  );

  const snap = await getDocs(q);
  procesarPagina(snap);
}

function procesarPagina(snap) {
  registrosCache = [];

  snap.docs.forEach(docu => {
    registrosCache.push({ id: docu.id, ...docu.data() });
  });

  if (!snap.empty) {
    primerDoc = snap.docs[0];
    ultimoDoc = snap.docs[snap.docs.length - 1];
  }

  renderTabla(registrosCache);
}


window.nextPagina = async () => {
  if (!ultimoDoc) return alert("No hay más registros");

  const q = query(
    collection(db, "registros"),
    orderBy("nro_formato", "desc"),
    startAfter(ultimoDoc),
    limit(LIMITE)
  );

  const snap = await getDocs(q);
  procesarPagina(snap);
};

window.prevPagina = async () => {
  if (!primerDoc) return alert("No hay anteriores");

  const q = query(
    collection(db, "registros"),
    orderBy("nro_formato", "asc"),
    startAfter(primerDoc),
    limit(LIMITE)
  );

  const snap = await getDocs(q);

  const docs = snap.docs.reverse(); // invertir orden

  procesarPagina({ docs, empty: docs.length == 0 });
};

function renderTabla(lista) {
  const tabla = document.querySelector("#tabla tbody");
  tabla.innerHTML = "";

  lista.forEach(d => {
    const equipos = d.equipos || [];
    const marcas = equipos.map(e => e.marca).join(", ");
    const modelos = equipos.map(e => e.modelo).join(", ");
    const fecha = d.fecha?.seconds 
      ? new Date(d.fecha.seconds * 1000).toLocaleString()
      : "";

    tabla.innerHTML += `
      <tr>
        <td>${1000 + d.nro_formato}</td>
        <td>${d.cliente || ""}</td>
        <td>${d.ruc || ""}</td>
        <td>${d.correo || ""}</td>
        <td>${marcas}</td>
        <td>${modelos}</td>
        <td>${fecha}</td>
        <td><button onclick="editar('${d.id}')">✏️</button></td>
        <td><button onclick="exportarPDF('${d.id}')">📄</button></td>
        <td><button onclick="enviarPDF('${d.id}')">✉️</button></td>
      </tr>
    `;
  });
}

window.abrirFormulario = () => {
  document.getElementById("modal").style.display = "flex";

  // centrar ventana
  const box = document.getElementById("modalBox");
  box.style.left = "50%";
  box.style.top = "50%";
  box.style.transform = "translate(-50%, -50%)";
  activarFirma("firmaTec");
  activarFirma("firmaCli");
  prepararCanvas("firmaTec");
  prepararCanvas("firmaCli");  
};

window.cerrarFormulario = () => {
  document.getElementById("modal").style.display = "none";
};

window.guardarCliente = async () => {
  try {
    mostrarLoading("Guardando registro...");

    const cliente = document.getElementById("cliente").value;
    const ruc = document.getElementById("ruc").value;
    const direccion = document.getElementById("direccion").value;
    const correo = document.getElementById("correo").value;
    const responsable = document.getElementById("responsable").value;
    const telefono = document.getElementById("telefono").value;
    const guia = document.getElementById("guia").value;

    let firmaTecnicoURL = await subirFirma("firmaTec");
    let firmaClienteURL = await subirFirma("firmaCli");

    const datos = {
      cliente, ruc, direccion, correo,
      responsable, telefono, guia,
      equipos: obtenerEquipos(),
      fecha: new Date()
    };

    // ================== EDITAR ==================
    if (editandoID) {
      const oldSnap = await getDoc(doc(db, "registros", editandoID));
      const old = oldSnap.data();

      // Si no firmaron de nuevo, mantener firma anterior
      if (!firmaTecnicoURL) firmaTecnicoURL = old.firma_tecnico;
      if (!firmaClienteURL) firmaClienteURL = old.firma_cliente;

      datos.firma_tecnico = firmaTecnicoURL;
      datos.firma_cliente = firmaClienteURL;

      await updateDoc(doc(db, "registros", editandoID), datos);

      alert("✏️ Registro actualizado");
    }

    // ================== NUEVO ==================
    else {
      if (!firmaTecnicoURL || !firmaClienteURL) {
        alert("Debe firmar técnico y cliente");
        ocultarLoading();
        return;
      }

      const nro = await obtenerNumeroFormato();
      datos.nro_formato = nro;
      datos.firma_tecnico = firmaTecnicoURL;
      datos.firma_cliente = firmaClienteURL;

      await addDoc(collection(db, "registros"), datos);
      alert("✅ Registro guardado");
    }

    ocultarLoading();
    editandoID = null;
    cerrarFormulario();
    cargarClientes();

  } catch (err) {
    ocultarLoading();
    console.error(err);
    alert("❌ Error al guardar");
  }
};

window.agregarEquipo = () => {
  const tbody = document.querySelector("#tablaEquipos tbody");
  const tbodyAcc = document.querySelector("#tablaAcc tbody");
  const n = tbody.children.length + 1;

  tbody.innerHTML += `
    <tr>
      <td>${n}</td>
      <td><input></td>
      <td>${crearSelect(MARCAS)}</td>
      <td><input></td>
      <td>${crearSelect(DESCRIPCIONES)}</td>
      <td><input></td>
      <td>${crearSelect(SERVICIOS)}</td>
      <td><input></td>
    </tr>
  `;

  tbodyAcc.innerHTML += `
    <tr>
      <td>${n}</td>
      <td><input></td>
      <td><input></td>
    </tr>
  `;
}


window.quitarEquipo = () => {
  const tbody = document.querySelector("#tablaEquipos tbody");
  const tbodyAcc = document.querySelector("#tablaAcc tbody");

  if (tbody.children.length > 0) {
    tbody.lastElementChild.remove();
    tbodyAcc.lastElementChild.remove();
  }
}

function crearSelect(lista, valor = "") {
  return `
    <select>
      ${lista.map(x => `<option value="${x}" ${x==valor?"selected":""}>${x}</option>`).join("")}
    </select>
  `;
}

function obtenerEquipos() {
  const filas = document.querySelectorAll("#tablaEquipos tbody tr");
  const accs = obtenerAccesorios();
  let equipos = [];

  filas.forEach((f, index) => {
    const inputs = f.querySelectorAll("input");
    const selects = f.querySelectorAll("select");

    equipos.push({
      cant: inputs[0]?.value || "",
      marca: selects[0]?.value || "",
      modelo: inputs[1]?.value || "",
      descripcion: selects[1]?.value || "",
      serie: inputs[2]?.value || "",
      servicio: selects[2]?.value || "",
      falla: inputs[3]?.value || "",
      accesorio: accs[index]?.accesorio || "",
      obs: accs[index]?.obs || ""
    });
  });

  return equipos;
}


function obtenerAccesorios() {
  const filas = document.querySelectorAll("#tablaAcc tbody tr");
  let acc = [];

  filas.forEach(f => {
    const i = f.querySelectorAll("input");
    acc.push({
      accesorio: i[0]?.value || "",
      obs: i[1]?.value || ""
    });
  });

  return acc;
}


function activarFirma(id) {
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext("2d");

  let dibujando = false;

  // Suavizado profesional
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dibujando = true;
    canvas.setPointerCapture(e.pointerId); // 🔥 CLAVE
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dibujando) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  });

  canvas.addEventListener("pointerup", () => dibujando = false);
  canvas.addEventListener("pointercancel", () => dibujando = false);
}


window.limpiar = (id) => {
  const c = document.getElementById(id);
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
};

async function subirFirma(id) {
  const canvas = document.getElementById(id);
  if (!canvas) {
    alert("No existe canvas: " + id);
    return null;
  }

  // ❌ No subir si está vacío
  if (canvasVacio(id)) return null;

  const blob = await new Promise(resolve => canvas.toBlob(resolve));

  const formData = new FormData();
  formData.append("file", blob);
  formData.append("upload_preset", "first upload");

  const res = await fetch("https://api.cloudinary.com/v1_1/drpmlng1d/image/upload", {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  return data.secure_url;
}

// ===== DRAG MODAL =====
const modalBox = document.getElementById("modalBox");
const header = document.getElementById("modalHeader");

let offsetX = 0, offsetY = 0, isDown = false;

header.addEventListener("mousedown", (e) => {
  isDown = true;
  offsetX = modalBox.offsetLeft - e.clientX;
  offsetY = modalBox.offsetTop - e.clientY;
});

document.addEventListener("mouseup", () => isDown = false);

document.addEventListener("mousemove", (e) => {
  if (!isDown) return;
  modalBox.style.left = e.clientX + offsetX + "px";
  modalBox.style.top = e.clientY + offsetY + "px";
});


// ====== EDITAR
window.editar = async (id) => {
  editandoID = id;

  const docRef = doc(db, "registros", id);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    alert("Registro no encontrado");
    return;
  }

  const d = snap.data();

  abrirFormulario();

  // Datos cliente
  document.getElementById("cliente").value = d.cliente || "";
  document.getElementById("telefono").value = d.telefono || "";
  document.getElementById("correo").value = d.correo || "";
  document.getElementById("ruc").value = d.ruc || "";
  document.getElementById("direccion").value = d.direccion || "";
  document.getElementById("responsable").value = d.responsable || "";
  document.getElementById("guia").value = d.guia || "";

  // Cargar firmas en canvas
  cargarFirma(d.firma_tecnico, "firmaTec");
  cargarFirma(d.firma_cliente, "firmaCli");

  cargarEquipos(d.equipos);

  alert("Modo edición activado");
};

function canvasVacio(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return true;

  const ctx = canvas.getContext("2d");
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  return !pixels.some(p => p !== 0); // true = sin firma
}

function cargarFirma(url, canvasID) {
  if (!url) return;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;

  img.onload = () => {
    const canvas = document.getElementById(canvasID);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
}


function cargarEquipos(equipos) {
  const tbody = document.querySelector("#tablaEquipos tbody");
  const tbodyAcc = document.querySelector("#tablaAcc tbody");

  tbody.innerHTML = "";
  tbodyAcc.innerHTML = "";

  equipos.forEach((e, i) => {

    tbody.innerHTML += `
      <tr>
        <td>${i+1}</td>
        <td><input value="${e.cant || ""}"></td>
        <td>${crearSelect(MARCAS, e.marca)}</td>
        <td><input value="${e.modelo || ""}"></td>
        <td>${crearSelect(DESCRIPCIONES, e.descripcion)}</td>
        <td><input value="${e.serie || ""}"></td>
        <td>${crearSelect(SERVICIOS, e.servicio)}</td>
        <td><input value="${e.falla || ""}"></td>
      </tr>
    `;

    tbodyAcc.innerHTML += `
      <tr>
        <td>${i+1}</td>
        <td><input value="${e.accesorio || ""}"></td>
        <td><input value="${e.obs || ""}"></td>
      </tr>
    `;
  });
}


function prepararCanvas(id) {
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext("2d");

  const ratio = window.devicePixelRatio || 1;
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;

  canvas.width = w * ratio;
  canvas.height = h * ratio;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";

  ctx.scale(ratio, ratio);
}

document.getElementById("search").addEventListener("input", e => {
  const texto = e.target.value.toLowerCase();

  const filtrados = registrosGlobales.filter(d => {
    const equipos = d.equipos || [];
    const marcas = equipos.map(e => e.marca).join(" ").toLowerCase();
    const modelos = equipos.map(e => e.modelo).join(" ").toLowerCase();

    const fechaTxt = d.fecha?.seconds
      ? new Date(d.fecha.seconds * 1000).toLocaleString().toLowerCase()
      : "";

    return (
      ("" + (1000 + d.nro_formato)).includes(texto) ||
      (d.cliente || "").toLowerCase().includes(texto) ||
      (d.correo || "").toLowerCase().includes(texto) ||
      (d.ruc || "").toLowerCase().includes(texto) ||
      (d.telefono || "").toLowerCase().includes(texto) ||
      (d.guia || "").toLowerCase().includes(texto) ||
      (d.responsable || "").toLowerCase().includes(texto) ||
      fechaTxt.includes(texto) ||
      marcas.includes(texto) ||
      modelos.includes(texto)
    );
  });

  renderTabla(filtrados.slice(0, 30)); // mostrar solo 30 resultados
});


async function cargarTodosRegistros() {
  const q = await getDocs(collection(db, "registros"));
  registrosGlobales = [];

  q.forEach(docu => {
    registrosGlobales.push({ id: docu.id, ...docu.data() });
  });

  console.log("Registros globales cargados:", registrosGlobales.length);
}


window.enviarPDF = async (docId) => {
  try{
    mostrarLoading("Enviando a PDF al correo...");
    const docu = await getDoc(doc(db, "registros", docId));
    const d = docu.data();
    const fecha = new Date(d.fecha.seconds * 1000).toLocaleString();

    // ===== TABLA EQUIPOS =====
    const equipos = d.equipos || [];

    // EQUIPOS TABLA HTML
    const equiposHTML = equipos.map((e,i)=>`
    <tr>
    <td>${i+1}</td>
    <td>${e.cant}</td>
    <td style="word-break:break-word;">${e.marca}</td>
    <td style="word-break:break-word;">${e.modelo}</td>
    <td style="word-break:break-word;">${e.descripcion}</td>
    <td style="word-break:break-word;">${e.serie}</td>
    <td style="word-break:break-word;">${e.servicio}</td>
    <td style="word-break:break-word;">${e.falla}</td>
    </tr>
    `).join("");

    // ACCESORIOS
    const accesoriosHTML = equipos.map((e,i)=>`
    <tr>
      <td>${i+1}</td>
      <td style="word-break:break-word;">${e.accesorio || ""}</td>
      <td style="word-break:break-word;">${e.obs || ""}</td>
    </tr>
    `).join("");

    // FIRMAS
    const firmaTec = d.firma_tecnico || "";
    const firmaCli = d.firma_cliente || "";

    const nro = 1000 + d.nro_formato;

    const params = {
      to_email: d.correo,
      nro: nro,
      fecha: fecha,
      cliente: d.cliente,
      ruc: d.ruc,
      direccion: d.direccion,
      telefono: d.telefono,
      correo: d.correo,
      responsable: d.responsable,
      guia: d.guia,
      equipos: equiposHTML,
      accesorios: accesoriosHTML,
      firma_tecnico: firmaTec,
      firma_cliente: firmaCli
    };

    await emailjs.send("service_7kuljkq", "template_01npkp8", params); 
    ocultarLoading();
    alert("✅ Correo enviado");
  }catch (err) {
    ocultarLoading();
    console.error(err);
    alert("❌ Error al enviar PDF");
  }
};