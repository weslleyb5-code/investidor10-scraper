import fetch from "node-fetch";
import { google } from "googleapis";

// === CONFIGURAÇÃO ===
const sheetId = process.env.SHEET_ID;
const sheetTab = process.env.SHEET_TAB || "Investidor10";
const serviceAccountJson = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
const csrfToken = process.env.CSRF_TOKEN; // Coloque seu x-csrf-token como segredo no GitHub

// === GOOGLE AUTH ===
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccountJson,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// === FUNÇÃO PRINCIPAL ===
async function fetchInvestidor10Data() {
  let start = 0;
  const length = 100;
  let allData = [];

  while (true) {
    const body = new URLSearchParams({
      start: start.toString(),
      length: length.toString(),
      type_page: "fiis",
    });

    const res = await fetch("https://investidor10.com.br/api/fii/advanced-search", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        "x-csrf-token": csrfToken,
        "user-agent": "Mozilla/5.0",
      },
      body,
    });

    const json = await res.json();

    if (!json?.data?.length) break;

    allData = allData.concat(json.data);
    start += length;

    if (json.data.length < length) break;
  }

  console.log(`Total de FIIs coletados: ${allData.length}`);

  // Mapeando apenas os campos que você quer
  return allData.map(fii => [
    fii.name,
    fii.p_vp,
    fii.dividend_yield,
    fii.dividend_yield_last_5_years,
    fii.daily_liquidity,
    fii.net_worth,
    fii.type,
    fii.sector,
  ]);
}

// === ESCREVER NA PLANILHA ===
async function writeToGoogleSheet(values) {
  const resource = {
    values: [["Nome","P/VP","DY (%)","DY Médio 5 anos","Liquidez Diária","Patrimônio do FII","Tipo","Setor"], ...values],
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
  } catch (error) {
    console.error("Erro ao atualizar dados:", error);
  }
})();
