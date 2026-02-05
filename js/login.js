import { auth } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {ocultarLoading, mostrarLoading} from "./extras.js";

const loginBtn = document.getElementById("loginBtn");

loginBtn.onclick = async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    mostrarLoading("Verificando datos...");
    await signInWithEmailAndPassword(auth, email, password);
    alert("Login correcto");
    window.location.href = "dashboard.html";
    ocultarLoading();
  } catch (error) {
    ocultarLoading();
    //alert("Error: " + error.message);
    console.error(error);
    alert("Datos invalidos, revise la contraseña o correo.")
  }
};
