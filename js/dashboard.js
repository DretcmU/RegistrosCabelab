import { db, auth, storage, functions } from "./firebase.js";
import { collection, addDoc, getDocs, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { DESCRIPCIONES, MARCAS, SERVICIOS, ocultarLoading, mostrarLoading } from "./extras.js";
import { runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { query, orderBy, limit, startAfter, startAt, endAt, where} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const obtenerRegistroConFirmas = httpsCallable(functions, "obtenerRegistroConFirmas");

let editandoID = null;
let registrosCache = []; // para el buscador
let ultimoDoc = null;
let primerDoc = null;
const LIMITE = 3;
let docSeleccionado = null;
let correoRegistroActual = null;
let lastDoc = null;
let timeout = null;

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
    //console.log(auth.currentUser);
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

  lastDoc = snap.docs[snap.docs.length - 1];

  const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  renderTabla(data);
}

window.cargarMas = async () => {
  if (!lastDoc) return;

  const q = query(
    collection(db, "registros"),
    orderBy("nro_formato", "desc"),
    startAfter(lastDoc),
    limit(LIMITE)
  );

  const snap = await getDocs(q);

  lastDoc = snap.docs[snap.docs.length - 1];

  const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  renderTabla(data, true);
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

function renderTabla(lista, add=null) {
  const tabla = document.querySelector("#tabla tbody");
  if(add===null)
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
        <td><button onclick="abrirMenuCorreo('${d.id}', '${d.correo}')">✉️</button></td>
      </tr>
    `;
  });
}

window.abrirFormulario = (editar=null) => {
  if(editar===null)
    editandoID = null;
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

        // ===== CAMPOS LOWER =====
    const cliente_lower = cliente.toLowerCase();
    const correo_lower = correo.toLowerCase();
    const responsable_lower = responsable.toLowerCase();
    const guia_lower = guia.toLowerCase();

    const tempID = Date.now(); // ID temporal para nombres

    const datos = {
      cliente, ruc, direccion, correo, telefono,
      responsable, guia,
      equipos: obtenerEquipos(),
      fecha: new Date(), cliente_lower,
      correo_lower,
      responsable_lower,
      guia_lower,
    };

    // ================== EDITAR ==================
    if (editandoID) {
      const oldSnap = await getDoc(doc(db, "registros", editandoID));
      const old = oldSnap.data();

      const nro = old.nro_formato;

      await subirFirma("firmaTec", nro);
      await subirFirma("firmaCli", nro);

      await updateDoc(doc(db, "registros", editandoID), datos);

      alert("✏️ Registro actualizado");
    }

    // ================== NUEVO ==================
    else {
      const nro = await obtenerNumeroFormato();

      const firmaTecnicoURL = await subirFirma("firmaTec", nro);
      const firmaClienteURL = await subirFirma("firmaCli", nro);

      if (!firmaTecnicoURL || !firmaClienteURL) {
        alert("Debe firmar técnico y cliente");
        ocultarLoading();
        return;
      }

      datos.nro_formato = nro;

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

  const n = tbody.rows.length + 1;

  // ===== TABLA EQUIPOS =====
  const row = tbody.insertRow();

  row.insertCell().textContent = n;
  row.insertCell().innerHTML = `<input>`;
  row.insertCell().innerHTML = crearSelect(MARCAS);
  row.insertCell().innerHTML = `<input>`;
  row.insertCell().innerHTML = crearSelect(DESCRIPCIONES);
  row.insertCell().innerHTML = `<input>`;
  row.insertCell().innerHTML = crearSelect(SERVICIOS);
  row.insertCell().innerHTML = `<input>`;

  // ===== TABLA ACCESORIOS =====
  const rowAcc = tbodyAcc.insertRow();

  rowAcc.insertCell().textContent = n;
  rowAcc.insertCell().innerHTML = `<input>`;
  rowAcc.insertCell().innerHTML = `<input>`;
};

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

async function subirFirma(id, nroFormato) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;

  if (canvasVacio(id)) return null;

  const blob = await new Promise(resolve => canvas.toBlob(resolve));

  const nombre = `firmas/${nroFormato}_${id}.png`;

  const storageRef = ref(storage, nombre);

  await uploadBytes(storageRef, blob, { contentType: "image/png" });

  return `${nroFormato}_${id}.png`;
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
  mostrarLoading("Cargando registro...");
  editandoID = id;

  const result = await obtenerRegistroConFirmas({ docId: id });
  const d = result.data;

  abrirFormulario(id);

  // Datos cliente
  document.getElementById("cliente").value = d.cliente || "";
  document.getElementById("telefono").value = d.telefono || "";
  document.getElementById("correo").value = d.correo || "";
  document.getElementById("ruc").value = d.ruc || "";
  document.getElementById("direccion").value = d.direccion || "";
  document.getElementById("responsable").value = d.responsable || "";
  document.getElementById("guia").value = d.guia || "";

  // Cargar firmas en canvas
  cargarFirma(d.firmaTecnicoBase64, "firmaTec");
  cargarFirma(d.firmaClienteBase64, "firmaCli");

  cargarEquipos(d.equipos);

  alert("Modo edición activado");
  ocultarLoading();
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

  img.onerror = () => {
    console.error("No se pudo cargar firma:", url);
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
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    buscar(e.target.value);
  }, 400);
});



window.buscar = async (texto) => {
  texto = texto.toLowerCase().trim();
  if (!texto) {
    cargarClientes(); // volver a últimos
    return;
  }

  mostrarLoading("Buscando...");

  try {
    let resultados = [];
    // ===== BUSCAR POR NUMERO =====
    if (!isNaN(texto)) {

      const nro = parseInt(texto) - 1000;

      const qNro = query(
        collection(db, "registros"),
        where("nro_formato", "==", nro),
        limit(20)
      );

      const snap = await getDocs(qNro);
      snap.forEach(d => resultados.push({ id: d.id, ...d.data() }));

    } else {

      const campos = ["telefono",
        "cliente_lower",
        "correo_lower",
        "responsable_lower",
        "guia_lower"
      ];
      for (const campo of campos) {
        const qCampo = query(
          collection(db, "registros"),
          orderBy(campo),
          startAt(texto),
          endAt(texto + "\uf8ff"),
          limit(LIMITE)
        );
        const snap = await getDocs(qCampo);
        snap.forEach(d => {
          resultados.push({ id: d.id, ...d.data() });
        });
      }
    }
    
    // ===== eliminar duplicados =====
    const mapa = new Map();
    resultados.forEach(r => mapa.set(r.id, r));

    renderTabla(Array.from(mapa.values()));

  } catch (err) {
    console.error(err);
    alert("Error en búsqueda");
  }

  ocultarLoading();
};


window.abrirMenuCorreo = (docId, correoRegistro) => {
  docSeleccionado = docId;
  correoRegistroActual = correoRegistro;

  document.getElementById("correoSelect").value = "";
  document.getElementById("modalCorreo").style.display = "flex";
};

window.cerrarMenuCorreo = () => {
  document.getElementById("modalCorreo").style.display = "none";
};

window.confirmarEnvio = () => {
  const val = document.getElementById("correoSelect").value;

  let correoFinal = val === "registro"
    ? correoRegistroActual
    : val;

  if (!correoFinal) {
    alert("Seleccione un correo");
    return;
  }

  cerrarMenuCorreo();

  exportarPDF(docSeleccionado, correoFinal);
};