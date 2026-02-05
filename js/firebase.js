// Import Firebase desde CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDnmpw5GM_79coirlaGc1Oded1ew7Vu518",
  authDomain: "cabelab-app.firebaseapp.com",
  projectId: "cabelab-app",
  storageBucket: "cabelab-app.firebasestorage.app",
  messagingSenderId: "228125189322",
  appId: "1:228125189322:web:6d974f32f50b2252e50033"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Exportar servicios
export const auth = getAuth(app);
export const db = getFirestore(app);