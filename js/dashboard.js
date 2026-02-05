import { db } from "./firebase.js";
import { collection, addDoc, getDocs, deleteDoc, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { DESCRIPCIONES, MARCAS, SERVICIOS, ocultarLoading, mostrarLoading } from "./extras.js";
import { runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

let editandoID = null;


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

onAuthStateChanged(auth, (user) => {
  if (!user) {
    alert("No autorizado");
    window.location.href = "index.html"; // volver a login
  } else {
    console.log("Usuario logeado:", user.email);
    cargarClientes(); // cargar datos SOLO si está logeado
  }
});

window.cerrarSesion = async () => {
  await signOut(auth);
  window.location.href = "index.html"; // tu página login
};

async function cargarClientes() {
  const tabla = document.querySelector("#tabla tbody");
  tabla.innerHTML = "";

  const q = await getDocs(collection(db, "registros"));

  q.forEach(docu => {
    const d = docu.data();

    
    const equipos = d.equipos || [];
    
    if (!Array.isArray(equipos)) return;
    const marcas = equipos.map(e => e.marca).join(", ");
    const modelos = equipos.map(e => e.modelo).join(", ");
    const fecha = new Date(d.fecha.seconds*1000).toLocaleString();

    tabla.innerHTML += `
      <tr>
        <td>${d.nro_formato + 1000}</td>
        <td>${d.cliente}</td>
        <td>${d.ruc}</td>
        <td>${d.correo}</td>
        <td>${marcas}</td>
        <td>${modelos}</td>
        <td>${fecha}</td>
        <td><button onclick="editar('${docu.id}')">✏️</button></td>
        <td><button onclick="exportarPDF('${docu.id}')">📄</button></td>
        <td><button>✉️</button></td>
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

  canvas.onmousedown = (e) => {
    dibujando = true;
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
  };

  canvas.onmouseup = () => dibujando = false;

  canvas.onmousemove = (e) => {
    if (!dibujando) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
  };
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