import fetch from "node-fetch";
import { google } from "googleapis";

// === CONFIGURAÇÃO ===
const sheetId = process.env.SHEET_ID;
const sheetTab = process.env.SHEET_TAB || "Investidor10";
const serviceAccountJson = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);

// === GOOGLE AUTH ===
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccountJson,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// === FUNÇÃO PRINCIPAL ===
async function fetchInvestidor10Data() {
  let start = 0;
  const length = 100; // até 100 por página
  let allData = [];

  while (true) {
    const body = new URLSearchParams({
      start: start.toString(),
      length: length.toString(),
      "ranges[p_vp][0]": "0",
      "ranges[p_vp][1]": "100",
      "ranges[dividend_yield][0]": "0",
      sector: "",
      type: "",
      "order[0][column]": "p_vp",
      "order[0][dir]": "asc",
    });

    const res = await fetch("https://investidor10.com.br/api/fii/advanced-search", {
      method: "POST",
      headers: {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      body,
    });

    const json = await res.json();

    if (!json?.data?.length) break;

    allData = allData.concat(json.data);
    start += length;

    if (json.data.length < length) break; // última página
  }

  console.log(`Total de FIIs coletados: ${allData.length}`);

  return allData.map(fii => [
    fii.ticker,
    fii.nome,
    fii.dividend_yield,
    fii.p_vp,
    fii.valor_cota,
    fii.patrimonio_liquido,
    fii.setor,
  ]);
}

// === ESCREVER NA PLANILHA ===
async function writeToGoogleSheet(values) {
  const resource = {
    values: [["Ticker", "Nome", "DY (%)", "P/VP", "Cota (R$)", "Patrimônio (R$)", "Setor"], ...values],
  };

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${sheetTab}!A1`,
    valueInputOption: "USER_ENTERED",
    resource,
  });
}

// === EXECUTAR ===
(async () => {
  try {
    console.log("Buscando dados do Investidor10...");
    const data = await fetchInvestidor10Data();
    await writeToGoogleSheet(data);
    console.log("✅ Dados atualizados com sucesso!");
  } catch (err) {
    console.error("❌ Erro ao buscar ou escrever dados:", err);
    process.exit(1);
  }
})();
