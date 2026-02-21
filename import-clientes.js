/**
 * import-clientes.js — Importação inicial de clientes StreamZone
 *
 * Limpa a aba Página1 e importa todos os dados do mês de Fevereiro 2026:
 *   - 25 slots Netflix activos (expandidos: 1 linha = 1 slot)
 *   - 6 slots Prime Video (3 activos + 3 disponíveis)
 *   - 20 contactos antigos (a_verificar)
 *
 * Execução: node import-clientes.js
 *
 * Schema (A:N):
 *   A=Plataforma  B=Email       C=Senha       D=NomePerfil  E=PIN
 *   F=Status      G=Cliente     H=Telefone    I=Data_Venda  J=Data_Expiracao
 *   K=QNTD        L=Tipo_Conta  M=Plano       N=Valor
 *
 * Nota: Telefone é prefixado com ' para forçar formato texto na Sheet.
 * Nota: Linhas multi-slot (Familia/Partilha) são expandidas: 1 linha por slot.
 *       O Valor por linha = preço total ÷ nº de slots.
 *       Soma(Valor) das linhas activas = 114.000 Kz.
 */

require('dotenv').config();
const path = require('path');
const { google } = require('googleapis');

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME      = process.env.SHEET_NAME || 'Página1';

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheetsAPI = google.sheets({ version: 'v4', auth });

// ── Dados (1 linha por slot) ─────────────────────────────────────────────────
// Colunas: Plataforma, Email, Senha, NomePerfil, PIN, Status,
//          Cliente, Telefone, Data_Venda, Data_Expiracao,
//          QNTD, Tipo_Conta, Plano, Valor
const ROWS = [
  // ── CABEÇALHO ──────────────────────────────────────────────────────────────
  ['Plataforma','Email','Senha','NomePerfil','PIN','Status',
   'Cliente','Telefone','Data_Venda','Data_Expiracao',
   'QNTD','Tipo_Conta','Plano','Valor'],

  // ── Netflix 10 (netflixdabanda10@gmail.com / N7848n) ───────────────────────
  // Hibraina — Familia (3 slots, 13500 Kz total → 4500 Kz/slot) — Perfis 1-3
  ['Netflix','netflixdabanda10@gmail.com','N7848n','Perfil 1','','indisponivel',
   'Hibraina',"'244946430525",'28/02/2026','31/03/2026',1,'shared_profile','Familia',4500],
  ['Netflix','netflixdabanda10@gmail.com','N7848n','Perfil 2','','indisponivel',
   'Hibraina',"'244946430525",'28/02/2026','31/03/2026',1,'shared_profile','Familia',4500],
  ['Netflix','netflixdabanda10@gmail.com','N7848n','Perfil 3','','indisponivel',
   'Hibraina',"'244946430525",'28/02/2026','31/03/2026',1,'shared_profile','Familia',4500],
  // Bruna Simão — Individual (1 slot, 5000 Kz) — Perfil 4
  ['Netflix','netflixdabanda10@gmail.com','N7848n','Perfil 4','','indisponivel',
   'Bruna Simão',"'244938650901",'28/02/2026','31/03/2026',1,'shared_profile','Individual',5000],
  // Supervisor — uso interno — Perfil 5
  ['Netflix','netflixdabanda10@gmail.com','N7848n','Perfil 5','','uso_interno',
   'Supervisor',"'244941713216",'28/02/2026','',1,'uso_interno','Supervisor',0],

  // ── Netflix 12 (netflixdabanda12@gmail.com / N6351n) ───────────────────────
  // Barbara Casimiro — Familia_Completa (full_account, 5 perfis, 13500 Kz)
  ['Netflix','netflixdabanda12@gmail.com','N6351n','Perfil 1','','indisponivel',
   'Barbara Casimiro',"'244923335740",'28/02/2026','31/03/2026',5,'full_account','Familia_Completa',13500],

  // ── Netflix 14 (netflixdabanda14@gmail.com / N6351n) ───────────────────────
  // Georgina Henriques — Partilha (2 slots, 9000 Kz total → 4500 Kz/slot) — Perfis 1-2
  ['Netflix','netflixdabanda14@gmail.com','N6351n','Perfil 1','','indisponivel',
   'Georgina Henriques',"'244939000799",'28/02/2026','31/03/2026',1,'shared_profile','Partilha',4500],
  ['Netflix','netflixdabanda14@gmail.com','N6351n','Perfil 2','','indisponivel',
   'Georgina Henriques',"'244939000799",'28/02/2026','31/03/2026',1,'shared_profile','Partilha',4500],
  // Joni P e RP — Partilha (2 slots, 9000 Kz total → 4500 Kz/slot) — Perfis 3-4
  ['Netflix','netflixdabanda14@gmail.com','N6351n','Perfil 3','','indisponivel',
   'Joni P e RP',"'244926332364",'28/02/2026','31/03/2026',1,'shared_profile','Partilha',4500],
  ['Netflix','netflixdabanda14@gmail.com','N6351n','Perfil 4','','indisponivel',
   'Joni P e RP',"'244926332364",'28/02/2026','31/03/2026',1,'shared_profile','Partilha',4500],
  // Heliane — Individual (1 slot, 5000 Kz) — Perfil 5
  ['Netflix','netflixdabanda14@gmail.com','N6351n','Perfil 5','','indisponivel',
   'Heliane',"'244936475918",'28/02/2026','31/03/2026',1,'shared_profile','Individual',5000],

  // ── Netflix 19 (netflixdabanda19@gmail.com / N7848n) ───────────────────────
  ['Netflix','netflixdabanda19@gmail.com','N7848n','Perfil 1','','indisponivel',
   'Gutho Monteiro',"'244924539250",'28/02/2026','31/03/2026',1,'shared_profile','Individual',5000],
  ['Netflix','netflixdabanda19@gmail.com','N7848n','Perfil 2','','indisponivel',
   'Julia Saraiva',"'244925221793",'28/02/2026','31/03/2026',1,'shared_profile','Individual',5000],
  ['Netflix','netflixdabanda19@gmail.com','N7848n','Perfil 3','','indisponivel',
   'Luquinda',"'244922232215",'28/02/2026','31/03/2026',1,'shared_profile','Individual',5000],
  ['Netflix','netflixdabanda19@gmail.com','N7848n','Perfil 4','','indisponivel',
   'Mirian António',"'244937183929",'28/02/2026','31/03/2026',1,'shared_profile','Individual',5000],
  ['Netflix','netflixdabanda19@gmail.com','N7848n','Perfil 5','','indisponivel',
   'Sandra dos Santos',"'244947364487",'28/02/2026','31/03/2026',1,'shared_profile','Individual',5000],

  // ── Netflix 20 (netflixdabanda20@gmail.com / N7848n) ───────────────────────
  ['Netflix','netflixdabanda20@gmail.com','N7848n','Perfil 1','','indisponivel',
   'Mom Da Tchissola',"'244923733641",'28/02/2026','31/03/2026',1,'shared_profile','Individual',5000],
  ['Netflix','netflixdabanda20@gmail.com','N7848n','Perfil 2','','indisponivel',
   'Dádiva Victória',"'244928974999",'28/02/2026','31/03/2026',1,'shared_profile','Individual',5000],
  ['Netflix','netflixdabanda20@gmail.com','N7848n','Perfil 3','','indisponivel',
   'Camila Paula',"'244949643888",'28/02/2026','31/03/2026',1,'shared_profile','Individual',5000],
  ['Netflix','netflixdabanda20@gmail.com','N7848n','Perfil 4','','indisponivel',
   'Jeovânia António',"'244934085804",'28/02/2026','31/03/2026',1,'shared_profile','Individual',5000],
  ['Netflix','netflixdabanda20@gmail.com','N7848n','Perfil 5','','indisponivel',
   'Gersol Pascoal',"'244923842752",'28/02/2026','31/03/2026',1,'shared_profile','Individual',5000],

  // ── Prime Video (primevideo_streamzone@gmail.com / PV2026sz) ───────────────
  // 3 slots activos
  ['Prime Video','primevideo_streamzone@gmail.com','PV2026sz','Perfil 1','','indisponivel',
   'Barbara Casimiro',"'244923335740",'28/02/2026','31/03/2026',1,'shared_profile','Individual',3000],
  ['Prime Video','primevideo_streamzone@gmail.com','PV2026sz','Perfil 2','','indisponivel',
   'Maurio',"'244927846165",'28/02/2026','31/03/2026',1,'shared_profile','Individual',3000],
  ['Prime Video','primevideo_streamzone@gmail.com','PV2026sz','Perfil 3','','indisponivel',
   'Luquinda',"'244922232215",'28/02/2026','31/03/2026',1,'shared_profile','Individual',3000],
  // 3 slots disponíveis
  ['Prime Video','primevideo_streamzone@gmail.com','PV2026sz','Perfil 4','','disponivel',
   '','','','','','shared_profile','Individual',3000],
  ['Prime Video','primevideo_streamzone@gmail.com','PV2026sz','Perfil 5','','disponivel',
   '','','','','','shared_profile','Individual',3000],
  ['Prime Video','primevideo_streamzone@gmail.com','PV2026sz','Perfil 6','','disponivel',
   '','','','','','shared_profile','Individual',3000],

  // ── Clientes Antigos (a_verificar) ─────────────────────────────────────────
  ['','','','','','a_verificar','Alicia',"'244924295290",'','','','','',''],
  ['','','','','','a_verificar','Balbina Nunda',"'244949086346",'','','','','',''],
  ['','','','','','a_verificar','Bermy Ramos',"'244930557495",'','','','','',''],
  ['','','','','','a_verificar','Débora Chipangue',"'244923849606",'','','','','',''],
  ['','','','','','a_verificar','Dicaprio Seixas',"'244944312082",'','','','','',''],
  ['','','','','','a_verificar','Djamila',"'244923430214",'','','','','',''],
  ['','','','','','a_verificar','Domingas',"'244947142028",'','','','','',''],
  ['','','','','','a_verificar','Eduardo',"'244944683350",'','','','','',''],
  ['','','','','','a_verificar','Elisandra Luango',"'244935962547",'','','','','',''],
  ['','','','','','a_verificar','Elizabeth Almeida',"'244923346780",'','','','','',''],
  ['','','','','','a_verificar','Evandra Fula',"'244939099119",'','','','','',''],
  ['','','','','','a_verificar','Família',"'244996420734",'','','','','',''],
  ['','','','','','a_verificar','Flávia Filipe',"'244923582704",'','','','','',''],
  ['','','','','','a_verificar','Isaura Vissenga',"'351926137576",'','','','','',''],
  ['','','','','','a_verificar','Jacinto',"'244943489388",'','','','','',''],
  ['','','','','','a_verificar','Janiva',"'244924061705",'','','','','',''],
  ['','','','','','a_verificar','Javaloa',"'244929370698",'','','','','',''],
  ['','','','','','a_verificar','Lpeixoto',"'244923585802",'','','','','',''],
  ['','','','','','a_verificar','Mirna',"'244924190555",'','','','','',''],
  ['','','','','','a_verificar','Nyra',"'244943077043",'','','','','',''],
];

async function main() {
  if (!GOOGLE_SHEET_ID) {
    console.error('❌ GOOGLE_SHEET_ID não definido no .env');
    process.exit(1);
  }

  const dataRows = ROWS.length - 1; // excluindo header
  console.log(`\n📋 StreamZone — Importação de clientes`);
  console.log(`   Sheet ID : ${GOOGLE_SHEET_ID}`);
  console.log(`   Aba      : ${SHEET_NAME}`);
  console.log(`   Linhas   : ${dataRows} (+ 1 header)\n`);

  // 1. Limpar dados existentes
  console.log(`🧹 Limpando ${SHEET_NAME}!A:N...`);
  await sheetsAPI.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A:N`,
  });
  console.log('   ✅ Sheet limpa\n');

  // 2. Escrever todos os dados
  // USER_ENTERED: respeita o prefixo ' para forçar texto em células Telefone
  console.log(`📝 Escrevendo ${dataRows} linhas de dados...`);
  await sheetsAPI.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: ROWS },
  });
  console.log('   ✅ Dados escritos\n');

  console.log('🎉 Importação concluída!');
  console.log('');
  console.log('Resumo:');
  console.log('  Netflix  : 21 linhas (slots expandidos) — 0 disponíveis');
  console.log('  Prime    : 6 linhas — 3 disponíveis');
  console.log('  Antigos  : 20 contactos (a_verificar)');
  console.log('  Receita  : 114.000 Kz (SUM coluna N, linhas activas)');
  console.log('');
  console.log('Próximos passos:');
  console.log('  1. Verifica a Sheet — confirmar dados em Página1');
  console.log('  2. Verifica /admin — Dashboard deve mostrar clientes correctamente');
  console.log('  3. Stock tab: 0 Netflix disponíveis | 3 Prime disponíveis');
}

main().catch(err => {
  console.error('❌ Erro na importação:', err.message);
  process.exit(1);
});
