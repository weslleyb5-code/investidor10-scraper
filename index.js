import { chromium } from "playwright";
import { google } from "googleapis";

const SHEET_ID = process.env.SHEET_ID;
const SHEET_TAB = "Investidor10"; // nome da aba na planilha

async function writeToGoogleSheet(data) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.SERVICE_ACCOUNT_JSON),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: SHEET_TAB,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: SHEET_TAB + "!A1",
    valueInputOption: "RAW",
    requestBody: { values: data },
  });
}

async function fetchInvestidor10Data() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log("Acessando Investidor10...");
  await page.goto("https://investidor10.com.br/fiis/", {
    waitUntil: "networkidle",
    timeout: 120000,
  });

  // Espera a tabela carregar
  await page.waitForSelector("table");

  const data = await page.$$eval("table tr", (rows) =>
    rows.map((r) =>
      Array.from(r.querySelectorAll("th, td")).map((c) =>
        c.innerText.trim().replace(/\n/g, " ")
      )
    )
  );

  console.log(`Linhas extraídas: ${data.length}`);
  await browser.close();

  if (data.length > 0) {
    await writeToGoogleSheet(data);
    console.log("✅ Dados atualizados no Google Sheets!");
  } else {
    console.error("⚠️ Nenhum dado encontrado!");
  }
}

fetchInvestidor10Data().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
