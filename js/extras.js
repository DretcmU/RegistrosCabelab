export const DESCRIPCIONES = [
"", "MAQUINA DE SOLDAR","ALIMENTADOR","MOTOSOLDADORA","TARJETAS ELECTRÓNICAS",
"ANTORCHA","CABLE DE CONTROL","MALETA","TRACTOR COMPACTO UNIVERSAL",
"CORTE PLASMA","OXICORTE CNC","EXTRACTOR DE HUMOS","CARETA DE SOLDAR"
];

export const MARCAS = [
"", "ESAB","MILLER","LINCOLN E.","BOSCH","KEMPPI","DAF","ALIENWELD","RONCH",
"HYPERTHERM","CABELAB","HOBART","CEMONT","HUGONG","KENDE","OERLIKON",
"TRUPER","OKAYAMA","WELDECK","SOLANDINAS","STAYER WELDING"
];

export const SERVICIOS = ["", "Revisión General", "Garantía ESAB", "Garantía CABELAB"];

export function mostrarLoading(texto="Guardando registro...") {
  const l = document.getElementById("loadingScreen");
  l.style.display = "flex";
  l.querySelector("p").innerText = texto;
}

export function ocultarLoading() {
  document.getElementById("loadingScreen").style.display = "none";
}