/*
 * CONFIGURAÇÃO DO CATÁLOGO ONLINE
 * --------------------------------
 * MODO "local"   : funciona na hora, sem servidor. Os dados ficam SÓ no navegador
 *                  em que foram criados (bom para testar).
 * MODO "firebase": dados na nuvem (Firebase). Necessário para que clientes vejam
 *                  o catálogo de qualquer celular/computador. Veja LEIA-ME.md.
 */
window.CATALOGO_CONFIG = {
  modo: "firebase", // "local" ou "firebase"

  // Chave da API do Google (Google Drive API ativada). Usada para listar as fotos
  // da pasta do Drive de cada usuário e ligar cada foto ao código do produto.
  googleApiKey: "AIzaSyBbEYr11XaiLVP3O2efgINypwKMv-HSfnI",

  // Preencha ao usar o modo "firebase" (Console do Firebase → Configurações do projeto)
  firebase: {
    apiKey: "AIzaSyDvE0mNI3gua4-hGTy-FmCvEs36MDtnXT8",
    authDomain: "base-1-68b43.firebaseapp.com",
    projectId: "base-1-68b43",
    storageBucket: "base-1-68b43.firebasestorage.app",
    messagingSenderId: "577731067877",
    appId: "1:577731067877:web:a3a6d5aec55b8cb6a7390c"
  },

  // E-mails que são administradores (só eles criam usuários)
  admins: ["tiranosaurro.vital@gmail.com"],

  // Plano de assinatura (cobrado por Pix direto na sua conta)
  plano: {
    nome: "Mensal",
    valor: 1000,   // R$ por período
    dias: 30       // dias de acesso liberados a cada pagamento
  },

  // Sua chave Pix. Celular no formato +5511999999999; CPF/CNPJ só números; ou e-mail; ou chave aleatória.
  // Nome e cidade como estão no banco (sem acento, até 25 e 15 letras).
  pix: {
    chave: "",
    nome: "",
    cidade: ""
  },

  // Renovação do plano: WhatsApp de contato e quantos dias antes do vencimento o aviso aparece
  renovacao: {
    whatsapp: "11993975886",
    avisoDias: 7
  }
};
